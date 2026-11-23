import { describe, expect, it } from "vitest";
import { bundledBalanceFiles, loadBalance, withOverrides } from "../config/balance";
import type { FlameStats } from "../config/balanceSchema";
import { TICK_DT_S } from "../config/constants";
import { circleOverlapsBox } from "../buildings/collision";
import { applyDecayStage } from "../decay/applyDecayStage";
import { legalDecayMasks } from "../decay/decayState";
import { createRng, type Rng } from "../core/rng";
import type { SimEvent } from "../core/simEvents";
import type { SystemFn } from "../core/systems";
import { createWorld, setInput, step, type World } from "../core/world";
import { DOWNTOWN_MAP } from "../map/downtown";
import type { MapBox } from "../map/districtMap";
import { NEUTRAL_INPUT } from "../net/input";
import { addPlayer, type PlayerState } from "../player/player";
import { teamSpawnPoint } from "../player/spawn";
import { startBuild, startWave } from "../run/runStateMachine";
import { zombieTypeOf } from "../zombies/zombiePool";
import { updateCombat } from "./firing";
import { flameStats } from "./flame";
import { activeSlot, setLoadout } from "./loadout";
import { weaponStats } from "./weapons";

/**
 * Story 5.4 (brief lines 5 and 7, AC 15): flames are an area, so they get a fuzz. Downtown, random
 * legal decay layouts (stage 1–3 × every legal variant mask) × two flamers (Flamethrower + Gas
 * torch) standing 1–2.5 m off random map boxes, aiming at the nearest zombie, at cover, at each
 * other or anywhere, × 2,000 ticks of real waves.
 *
 * Every tick, for every zombie and teammate the combat system hurt with fire, an INDEPENDENT rewrite
 * of the rules written here from the map boxes (its own slab test, its own cone bound) must allow it:
 * (i) the body is within the cone's reach + radius and its angle (a superset bound: the exact
 * circle–sector test lies inside it), (ii) the muzzle-to-centre line enters no shot blocker (boxes
 * shrunk 1 mm: grazing is no block), (iii) the muzzle is not inside cover. A burning zombie may also
 * lose its ignite pulse (≤ 1.5) when the rule does not allow a flame hit. Also: no zombie body inside
 * a box, zombies still reach a player, no flow-field rebuild without a building change. Liveness:
 * ≥ 1,000 flame pulses, ≥ 50 cover-refused candidate hits checked, ≥ 100 flame kills, ≥ 1 ignite
 * kill, ≥ 1 friendly-fire pulse.
 */
const balance = loadBalance(withOverrides(bundledBalanceFiles(), [["waves", "runWaves", 20]]));
const map = DOWNTOWN_MAP;
const MASKS = legalDecayMasks(map);
const LAYOUTS = 12;
const TICKS = 2000;
const LOADOUTS = [["flamethrower", null], ["gas_torch", null]] as const;
const IGNITE_PULSE = (weaponStats(balance, "flamethrower") as FlameStats).igniteDamagePerS * (weaponStats(balance, "flamethrower") as FlameStats).ignitePulseS;
const SHRINK = 1e-3;

/** Independent slab test: the segment strictly enters the box shrunk by SHRINK. */
function segmentEntersBox(x0: number, y0: number, x1: number, y1: number, b: MapBox): boolean {
  const minX = b.minX + SHRINK;
  const minY = b.minY + SHRINK;
  const maxX = b.maxX - SHRINK;
  const maxY = b.maxY - SHRINK;
  let lo = 0;
  let hi = 1;
  const dx = x1 - x0;
  const dy = y1 - y0;
  for (const [p, d, mn, mx] of [[x0, dx, minX, maxX], [y0, dy, minY, maxY]] as const) {
    if (Math.abs(d) < 1e-12) {
      if (p <= mn || p >= mx) return false;
      continue;
    }
    let a = (mn - p) / d;
    let c = (mx - p) / d;
    if (a > c) [a, c] = [c, a];
    lo = Math.max(lo, a);
    hi = Math.min(hi, c);
    if (lo >= hi) return false;
  }
  return true;
}
const inside = (x: number, y: number, b: MapBox) => x > b.minX + SHRINK && x < b.maxX - SHRINK && y > b.minY + SHRINK && y < b.maxY - SHRINK;

interface Flamer {
  ox: number;
  oy: number;
  dx: number;
  dy: number;
  stats: FlameStats;
  muzzleInCover: boolean;
  id: string;
}

/** Could flamer `f` have touched a body at (x, y) of radius r this tick? (a superset of the exact rule) */
function allowedBy(f: Flamer, blockers: readonly MapBox[], x: number, y: number, r: number): "yes" | "cover" | "cone" {
  const vx = x - f.ox;
  const vy = y - f.oy;
  const d = Math.hypot(vx, vy);
  if (d > f.stats.rangeM + r + 1e-6) return "cone";
  if (d > r) {
    const ang = Math.acos(Math.max(-1, Math.min(1, (vx * f.dx + vy * f.dy) / d)));
    const half = (f.stats.coneDeg / 2) * (Math.PI / 180);
    if (ang > half + Math.asin(Math.min(1, r / d)) + 1e-6) return "cone";
  }
  if (f.muzzleInCover) return "cover";
  for (const b of blockers) if (segmentEntersBox(f.ox, f.oy, x, y, b)) return "cover";
  return "yes";
}

function nearCoverSpot(world: World, rng: Rng, slot: number): { x: number; y: number } {
  const solids = world.obstacles.solids;
  const r = balance.player.radiusM;
  for (let k = 0; k < 60; k++) {
    const s = solids[rng.int(0, solids.length - 1)] as MapBox;
    const side = rng.int(0, 3);
    const off = rng.range(1, 2.5);
    const x = side === 0 ? s.minX - off : side === 1 ? s.maxX + off : rng.range(s.minX, s.maxX);
    const y = side === 2 ? s.minY - off : side === 3 ? s.maxY + off : rng.range(s.minY, s.maxY);
    if (x < r + 1 || y < r + 1 || x > map.widthM - r - 1 || y > map.heightM - r - 1) continue;
    if (!world.obstacles.solids.some((b) => circleOverlapsBox(x, y, r + 0.2, b.minX, b.minY, b.maxX, b.maxY))) return { x, y };
  }
  return teamSpawnPoint(world, slot, { x: 0, y: 0 });
}

describe("Flame fuzz (Story 5.4, brief lines 5 and 7)", () => {
  it(
    "random decay layouts × 2 flamers near cover × 2,000 ticks: nothing behind a shot blocker or outside the cone is ever burned; no body in a box; zombies reach a player",
    () => {
      const s0 = { ...flameStats };
      let checkedHits = 0;
      let coverRefusals = 0;
      let coverCandidates = 0;
      let flameKills = 0;
      let igniteKillsSeen = 0;
      let ffPulses = 0;
      let navRebuildsOutsideBuildChanges = 0;
      const hp0 = new Float32Array(256);
      const burning0 = new Uint8Array(256);
      const flamers: Flamer[] = [];
      const combatPos = new Map<string, { x: number; y: number; r: number }>();
      for (let seed = 1; seed <= LAYOUTS; seed++) {
        const rng = createRng(seed * 4241);
        const players: PlayerState[] = [];
        const ffEvents: Extract<SimEvent, { type: "player.damaged" }>[] = [];
        const checked: SystemFn = (w, dt) => {
          // the tick's flamers, from their inputs (what tryFire will see), before combat
          flamers.length = 0;
          for (const p of players) {
            const input = w.inputs.get(p.id);
            const slot = activeSlot(p.loadout);
            const stats = weaponStats(balance, slot.weapon);
            if (!input?.fire || stats.kind !== "flame" || p.status !== "alive" || slot.reloadTicks > 0 || slot.ammo <= 0 || p.loadout.swapTicks > 0) continue;
            const l = Math.hypot(input.aimX, input.aimY);
            if (l < 1e-6) continue;
            const dx = input.aimX / l;
            const dy = input.aimY / l;
            const ox = p.x + dx * (p.radiusM + 0.1);
            const oy = p.y + dy * (p.radiusM + 0.1);
            const muzzleInCover = w.obstacles.shotBlockers.some((b) => inside(ox, oy, b) || segmentEntersBox(p.x, p.y, ox, oy, b));
            flamers.push({ ox, oy, dx, dy, stats, muzzleInCover, id: p.id });
          }
          const z = w.zombies;
          for (let i = 0; i < z.aliveCount; i++) {
            const id = z.aliveIds[i] as number;
            const r = balance.zombies.types[zombieTypeOf(z, id)]?.radiusM ?? 0;
            for (const f of flamers) if (allowedBy(f, w.obstacles.shotBlockers, z.x[id] as number, z.y[id] as number, r) === "cover") coverCandidates++;
            hp0[id] = z.hp[id] as number;
            burning0[id] = (z.igniteTicks[id] as number) > 0 ? 1 : 0;
          }
          updateCombat(w, dt);
          // every zombie hurt this tick (alive or killed by it)
          for (let id = 0; id < 256; id++) {
            if (!(hp0[id] as number)) continue;
            const now = (z.alivePos[id] as number) >= 0 ? (z.hp[id] as number) : -Infinity;
            const lost = (hp0[id] as number) - now;
            hp0[id] = 0;
            if (!(lost > 1e-6)) continue;
            const r = balance.zombies.types[zombieTypeOf(z, id)]?.radiusM ?? 0;
            const x = z.x[id] as number;
            const y = z.y[id] as number;
            let verdict: "yes" | "cover" | "cone" = "cone";
            for (const f of flamers) {
              const v = allowedBy(f, w.obstacles.shotBlockers, x, y, r);
              if (v === "yes") verdict = "yes";
              else if (v === "cover" && verdict !== "yes") verdict = "cover";
            }
            if (verdict === "cover") coverRefusals++;
            if (verdict !== "yes") {
              // only its burn may have hurt it (≤ one ignite pulse), and only if it was burning
              expect(burning0[id] === 1 && (lost <= IGNITE_PULSE + 1e-4 || now === -Infinity), `seed ${seed} tick ${w.tick} zombie ${id}: lost ${lost} but ${verdict}`).toBe(true);
            } else checkedHits++;
          }
          // the players where combat saw them (the friendly-fire events flush at the end of the step)
          for (const p of players) combatPos.set(p.id, { x: p.x, y: p.y, r: p.radiusM });
        };
        const world = createWorld({ balance, seed, map, systems: { combat: checked } });
        world.decay.variants = MASKS[seed % MASKS.length] as number;
        applyDecayStage(world, 1 + (seed % 3), world.decay.variants);
        LOADOUTS.forEach((lo, i) => {
          // the second flamer stands 1.5–3 m from the first (friendly fire happens)
          const first = players[0];
          let at = nearCoverSpot(world, rng, i);
          if (first) {
            for (let k = 0; k < 40; k++) {
              const a = rng.range(0, Math.PI * 2);
              const d = rng.range(1.5, 3);
              const x = first.x + Math.cos(a) * d;
              const y = first.y + Math.sin(a) * d;
              if (x > 1 && y > 1 && x < map.widthM - 1 && y < map.heightM - 1 && !world.obstacles.solids.some((b) => circleOverlapsBox(x, y, 0.6, b.minX, b.minY, b.maxX, b.maxY))) {
                at = { x, y };
                break;
              }
            }
          }
          const p = addPlayer(world, `p${i}`, at.x, at.y);
          setLoadout(balance, p.loadout, lo);
          players.push(p);
        });
        world.events.subscribe((e) => {
          if (e.type === "zombie.killed" && (e.weapon === "flamethrower" || e.weapon === "gas_torch")) flameKills++;
          if (e.type === "player.damaged" && e.sourcePlayerId !== null) ffEvents.push(e);
        });
        startBuild(world);
        world.waves.number = 3;
        startWave(world);
        const tough = seed % 3 === 0;
        let contacts = 0;
        const z = world.zombies;
        const blockers = world.obstacles.shotBlockers;
        let mode = 0;
        for (let t = 0; t < TICKS; t++) {
          if (t % 40 === 0) mode = rng.int(0, 3);
          for (const p of players) {
            p.hp = 100; // nobody goes down: the check needs standing targets
            let ax: number;
            let ay: number;
            let best = -1;
            let bestD = Infinity;
            for (let i = 0; i < z.aliveCount; i++) {
              const id = z.aliveIds[i] as number;
              const d = Math.hypot((z.x[id] as number) - p.x, (z.y[id] as number) - p.y);
              if (d < bestD) {
                bestD = d;
                best = id;
              }
            }
            if (mode === 0 && best >= 0) {
              ax = (z.x[best] as number) - p.x;
              ay = (z.y[best] as number) - p.y;
            } else if (mode === 1 && blockers.length > 0) {
              // into the nearest cover (the cars and the bus): the zombies behind it must be safe
              let nb = blockers[0] as MapBox;
              let nd = Infinity;
              for (const b of blockers) {
                const d = Math.hypot((b.minX + b.maxX) / 2 - p.x, (b.minY + b.maxY) / 2 - p.y);
                if (d < nd) {
                  nd = d;
                  nb = b;
                }
              }
              ax = rng.range(nb.minX, nb.maxX) - p.x;
              ay = rng.range(nb.minY, nb.maxY) - p.y;
            } else if (mode === 2) {
              const o = players.find((q) => q !== p) as PlayerState;
              ax = o.x - p.x;
              ay = o.y - p.y;
            } else {
              const a = rng.range(0, Math.PI * 2);
              ax = Math.cos(a);
              ay = Math.sin(a);
            }
            const l = Math.hypot(ax, ay) || 1;
            setInput(world, p.id, { ...NEUTRAL_INPUT, seq: t + 1, aimX: ax / l, aimY: ay / l, fire: rng.next() < 0.9, isMouse: true });
          }
          if (tough) for (let i = 0; i < z.aliveCount; i++) z.hp[z.aliveIds[i] as number] = 1e6;
          const buildingsBefore = world.buildings.version;
          const navBefore = world.pathing.nav.version;
          const ffBefore = ffEvents.length;
          step(world, TICK_DT_S);
          // every friendly-fire pulse this tick: its target was allowed by that flamer's cone
          for (let k = ffBefore; k < ffEvents.length; k++) {
            const e = ffEvents[k] as Extract<SimEvent, { type: "player.damaged" }>;
            const f = flamers.find((q) => q.id === e.sourcePlayerId);
            const q = combatPos.get(e.playerId);
            expect(e.tag).toBe("fire");
            expect(f && q ? allowedBy(f, world.obstacles.shotBlockers, q.x, q.y, q.r) : "none", `seed ${seed} tick ${t}: friendly fire on ${e.playerId}`).toBe("yes");
            ffPulses++;
          }
          if (world.pathing.nav.version !== navBefore && navBefore === buildingsBefore && world.buildings.version === buildingsBefore) navRebuildsOutsideBuildChanges++;
          for (let i = 0; i < z.aliveCount; i++) {
            const id = z.aliveIds[i] as number;
            const x = z.x[id] as number;
            const y = z.y[id] as number;
            const r = balance.zombies.types[zombieTypeOf(z, id)]?.radiusM ?? 0;
            for (const s of world.obstacles.solids) expect(circleOverlapsBox(x, y, r - 1e-5, s.minX, s.minY, s.maxX, s.maxY), `seed ${seed} tick ${t} zombie ${id} in ${s.name}`).toBe(false);
            for (const p of players) if (Math.hypot(x - p.x, y - p.y) <= r + p.radiusM + 0.1) contacts++;
          }
        }
        igniteKillsSeen = flameStats.igniteKills - s0.igniteKills;
        if (tough) expect(contacts, `seed ${seed}: no zombie ever reached a player`).toBeGreaterThan(0);
      }
      const pulses = flameStats.zombiePulses - s0.zombiePulses;
      (globalThis as unknown as { console: { info(msg: string): void } }).console.info(
        `flame fuzz: ${LAYOUTS} layouts, ${pulses} flame pulses, ${checkedHits} hurt bodies checked, ${coverCandidates} in-cone bodies behind cover, ${coverRefusals} cover/cone-refused hurts (ignite only), ${flameStats.muzzleBlocked - s0.muzzleBlocked} muzzle-in-cover ticks, ${flameKills} kills, ${igniteKillsSeen} ignite kills, ${ffPulses} friendly-fire pulses`,
      );
      expect(pulses).toBeGreaterThanOrEqual(1000);
      expect(checkedHits).toBeGreaterThanOrEqual(500);
      expect(coverCandidates, "the cover rule was really exercised").toBeGreaterThanOrEqual(50);
      expect(flameKills).toBeGreaterThanOrEqual(100);
      expect(igniteKillsSeen).toBeGreaterThanOrEqual(1);
      expect(ffPulses).toBeGreaterThanOrEqual(5);
      expect(navRebuildsOutsideBuildChanges).toBe(0);
    },
    300_000,
  );
});
