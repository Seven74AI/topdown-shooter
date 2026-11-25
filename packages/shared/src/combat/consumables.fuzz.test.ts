import { describe, expect, it } from "vitest";
import { bundledBalanceFiles, loadBalance, withOverrides } from "../config/balance";
import { BUILD_GRID_M, MUZZLE_OFFSET_M, TICK_DT_S } from "../config/constants";
import { addBuildingAt, buildingStats, footprint, footprintBlocked, type Box, type BuildingRotation } from "../buildings/buildings";
import { circleOverlapsBox } from "../buildings/collision";
import { applyDecayStage } from "../decay/applyDecayStage";
import { gameplayDecayMasks } from "../decay/decayState";
import { createRng, type Rng } from "../core/rng";
import { createWorld, setInput, step, type World } from "../core/world";
import { DOWNTOWN_MAP } from "../map/downtown";
import type { MapBox } from "../map/districtMap";
import { NEUTRAL_INPUT } from "../net/input";
import { addPlayer, type PlayerState } from "../player/player";
import { teamSpawnPoint } from "../player/spawn";
import { startBuild, startWave } from "../run/runStateMachine";
import { zombieTypeOf } from "../zombies/zombiePool";
import { createLobTarget, grenadeCounters, lobTarget } from "./grenades";
import { explosionCounters } from "./explosion";
import { molotovStats } from "../hazards/molotov";
import { throwStatsOf } from "../economy/consumables";

/**
 * Story 5.12 (brief line 7): thrown consumables and molotov fire zones are spatial, so they get a
 * fuzz on Downtown × random legal decay layouts (stages 1–3 × variant masks) × barricades:
 *
 * (A) throws from random spots in random directions and lengths: an INDEPENDENT rewrite of the lob
 *     rule (PR #5: only real buildings stop it; sampled at 2 mm, no slab maths shared with
 *     `cover.ts`) — the landing point is never past the first building face on the track, never
 *     strictly inside a shot blocker (car roof → near face), never farther than 8 m from the muzzle,
 *     and at least 2 m out unless something stopped it;
 * (B) real waves with 3 players throwing grenades and molotovs at the nearest zombie: no zombie in a
 *     box after the zombie pass, zombies still reach a player, the nav grid is rebuilt only to
 *     follow a building change (molotov fire is never a nav cost: no flow-field rebuild mid-wave),
 *     no stall (the run ticks on). Liveness: ≥ N throws, ≥ 1 molotov burn, ≥ 1 blast kill.
 */
const balance = loadBalance(withOverrides(bundledBalanceFiles(), [["waves", "runWaves", 20]]));
const map = DOWNTOWN_MAP;
const MASKS = gameplayDecayMasks(map);
const GREN = throwStatsOf(balance, "grenades")!;
const SAMPLE_M = 0.002;
const EPS = 1e-5;
const box: Box = { minX: 0, minY: 0, maxX: 0, maxY: 0 };

function insideAny(list: readonly MapBox[], x: number, y: number, shrink: number): MapBox | null {
  for (const b of list) if (x > b.minX + shrink && x < b.maxX - shrink && y > b.minY + shrink && y < b.maxY - shrink) return b;
  return null;
}

/** Independent: the first sample along (x0, y0) → (x1, y1) strictly inside a building box (shrunk by `tol`), as a distance; Infinity = none. */
function firstBuildingHitM(world: World, x0: number, y0: number, x1: number, y1: number, tol: number): number {
  const len = Math.hypot(x1 - x0, y1 - y0);
  const n = Math.max(1, Math.ceil(len / SAMPLE_M));
  const buildings = world.obstacles.shotBlockers.filter((b) => (b as { building?: boolean }).building === true);
  for (let k = 0; k <= n; k++) {
    const t = k / n;
    if (insideAny(buildings, x0 + (x1 - x0) * t, y0 + (y1 - y0) * t, tol)) return t * len;
  }
  return Infinity;
}

function placeBarricades(world: World, rng: Rng, n: number): void {
  let placed = 0;
  for (let tries = 0; tries < 300 && placed < n; tries++) {
    const type = rng.next() < 0.7 ? "wood_barricade" : "auto_turret";
    const stats = buildingStats(balance, type);
    if (!stats) continue;
    const solids = world.obstacles.solids;
    const s = solids[rng.int(0, solids.length - 1)] as MapBox;
    const gx = Math.round(rng.range(s.minX - 2, s.maxX + 1) / BUILD_GRID_M);
    const gy = Math.round(rng.range(s.minY - 2, s.maxY + 1) / BUILD_GRID_M);
    const rot = rng.int(0, 3) as BuildingRotation;
    footprint(stats, gx, gy, rot, box);
    if (footprintBlocked(world, box)) continue;
    addBuildingAt(world, { id: world.buildings.nextId, type, ownerId: "p0", gx, gy, rot, hp: stats.hp });
    placed++;
  }
}

function overlapping(world: World, x: number, y: number, r: number): string | null {
  for (const s of world.obstacles.solids) if (circleOverlapsBox(x, y, r - EPS, s.minX, s.minY, s.maxX, s.maxY)) return s.name;
  for (const b of world.buildings.list) if (b.solid && circleOverlapsBox(x, y, r - EPS, b.minX, b.minY, b.maxX, b.maxY)) return `building ${b.id}`;
  return null;
}

describe("consumables fuzz (Story 5.12, brief line 7)", () => {
  it("(A) random layouts × throws: lands before the first building face, never inside cover, within 2–8 m unless stopped", () => {
    const t = createLobTarget();
    const R = balance.player.radiusM;
    const offset = R + MUZZLE_OFFSET_M;
    const backoff = balance.combat.explosion.faceBackoffM;
    let throws = 0;
    let stopped = 0;
    for (let seed = 1; seed <= 24; seed++) {
      const rng = createRng(seed * 7717);
      const world = createWorld({ balance, seed, map, systems: { waves: () => {}, zombies: () => {} } });
      world.decay.variants = MASKS[seed % MASKS.length] as number;
      applyDecayStage(world, 1 + (seed % 3), world.decay.variants);
      for (let i = 0; i < 400; i++) {
        const px = rng.range(1, map.widthM - 1);
        const py = rng.range(1, map.heightM - 1);
        if (overlapping(world, px, py, R)) continue;
        const a = rng.range(0, Math.PI * 2);
        const len = rng.next() < 0.2 ? 0 : rng.range(0.01, 1);
        const dx = Math.cos(a);
        const dy = Math.sin(a);
        lobTarget(world, GREN, px, py, R, dx, dy, len === 0 ? 1 : len, t);
        throws++;
        if (t.blocked) stopped++;
        // never inside a shot blocker (a car roof lands at its near face), never strictly inside a building
        expect(insideAny(world.obstacles.shotBlockers, t.x, t.y, 1e-6), `seed ${seed} throw ${i}: lands inside cover`).toBeNull();
        const along = Math.hypot(t.x - px, t.y - py);
        // never past the first building face on the track (centre → landing, sampled; tolerance for the sample step)
        const hit = firstBuildingHitM(world, px, py, px + dx * (offset + 8.01), py + dy * (offset + 8.01), SAMPLE_M);
        expect(along, `seed ${seed} throw ${i}: flew through a building`).toBeLessThanOrEqual(Math.min(hit, offset + 8) + SAMPLE_M * 2);
        if (Number.isFinite(hit) && hit < offset + GREN.minLobM) expect(t.blocked).toBe(true);
        expect(t.distM).toBeLessThanOrEqual(8 + 1e-9);
        if (!t.blocked) expect(t.distM).toBeGreaterThanOrEqual(2 - 1e-9);
        else expect(along).toBeLessThanOrEqual(hit + backoff + SAMPLE_M * 2);
      }
    }
    (globalThis as unknown as { console: { info(msg: string): void } }).console.info(`[consumables fuzz A] ${throws} throws, ${stopped} stopped at a face`);
    expect(throws).toBeGreaterThan(5000); // liveness
    expect(stopped).toBeGreaterThan(50);
  });

  it("(B) waves with 3 throwing players × layouts: no zombie in a box, zombies reach players, no nav rebuild from fire, ≥ 1 burn and ≥ 1 blast kill", () => {
    const LAYOUTS = 6;
    const TICKS = 900;
    const ign0 = molotovStats.ignited;
    const burns0 = molotovStats.zombieHits;
    const thrown0 = grenadeCounters.thrown;
    let blastKills = 0;
    let navStray = 0;
    for (let seed = 1; seed <= LAYOUTS; seed++) {
      const rng = createRng(seed * 313);
      const world = createWorld({ balance, seed, map });
      world.debug.godMode = true;
      world.decay.variants = MASKS[seed % MASKS.length] as number;
      applyDecayStage(world, 1 + (seed % 3), world.decay.variants);
      const players: PlayerState[] = [0, 1, 2].map((i) => {
        const at = teamSpawnPoint(world, i, { x: 0, y: 0 });
        return addPlayer(world, `p${i}`, at.x, at.y);
      });
      startBuild(world);
      placeBarricades(world, rng, 5);
      world.waves.number = 3;
      startWave(world);
      world.events.subscribe((e) => {
        if (e.type === "zombie.killed" && e.weapon === "grenades") blastKills++;
      });
      const tough = seed % 2 === 0;
      let contacts = 0;
      const z = world.zombies;
      for (let tick = 0; tick < TICKS; tick++) {
        for (const p of players) {
          // keep the slot stocked (a bot that never runs out): grenades for p0, molotovs for the others
          if (p.consumableCount === 0) {
            p.consumable = p.id === "p0" ? "grenades" : "molotovs";
            p.consumableCount = 3;
          }
          let best = -1;
          let bd = Infinity;
          for (let i = 0; i < z.aliveCount; i++) {
            const id = z.aliveIds[i] as number;
            const d = Math.hypot((z.x[id] as number) - p.x, (z.y[id] as number) - p.y);
            if (d < bd) {
              bd = d;
              best = id;
            }
          }
          if (best < 0) {
            setInput(world, p.id, { ...NEUTRAL_INPUT, seq: tick + 1 });
            continue;
          }
          const dx = (z.x[best] as number) - p.x;
          const dy = (z.y[best] as number) - p.y;
          const k = Math.min(1, Math.max(0.01, (bd - p.radiusM - MUZZLE_OFFSET_M) / 8)) / bd;
          setInput(world, p.id, { ...NEUTRAL_INPUT, seq: tick + 1, aimX: dx * k, aimY: dy * k, consumable: tick % 7 === 0, moveX: rng.range(-1, 1), moveY: rng.range(-1, 1), isMouse: true });
        }
        if (tough) for (let i = 0; i < z.aliveCount; i++) z.hp[z.aliveIds[i] as number] = 1e6;
        const wallBefore = world.buildings.wallVersion;
        const navBefore = world.pathing.nav.version;
        const tick0 = world.tick;
        step(world, TICK_DT_S);
        expect(world.tick).toBe(tick0 + 1); // no stall
        // a nav rebuild while the nav was up to date with the walls and no wall changed: a stray one (fire is never a nav cost)
        if (world.pathing.nav.version !== navBefore && navBefore === wallBefore && world.buildings.wallVersion === wallBefore) navStray++;
        for (let i = 0; i < z.aliveCount; i++) {
          const id = z.aliveIds[i] as number;
          const x = z.x[id] as number;
          const y = z.y[id] as number;
          const r = balance.zombies.types[zombieTypeOf(z, id)]?.radiusM ?? 0;
          expect(overlapping(world, x, y, r), `seed ${seed} tick ${tick} zombie ${id}: in a box`).toBeNull();
          for (const p of players) if (Math.hypot(x - p.x, y - p.y) <= r + p.radiusM + 0.1) contacts++;
        }
      }
      if (tough) expect(contacts, `seed ${seed}: no zombie reached a player`).toBeGreaterThan(0);
    }
    const ignited = molotovStats.ignited - ign0;
    const burns = molotovStats.zombieHits - burns0;
    (globalThis as unknown as { console: { info(msg: string): void } }).console.info(
      `[consumables fuzz B] ${LAYOUTS} layouts: ${grenadeCounters.thrown - thrown0} throws, ${ignited} molotov zones, ${burns} burns, ${blastKills} blast kills`,
    );
    expect(navStray).toBe(0);
    expect(ignited).toBeGreaterThan(20);
    expect(burns).toBeGreaterThanOrEqual(1);
    expect(blastKills).toBeGreaterThanOrEqual(1);
    expect(explosionCounters.happened).toBeGreaterThan(0);
  }, 240_000);
});
