import { describe, expect, it } from "vitest";
import { bundledBalanceFiles, loadBalance, withOverrides } from "../config/balance";
import { BUILD_GRID_M, MUZZLE_OFFSET_M, TICK_DT_S } from "../config/constants";
import { addBuildingAt, buildingStats, footprint, footprintBlocked, type Box, type BuildingRotation } from "../buildings/buildings";
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
import { addPlayer } from "../player/player";
import { teamSpawnPoint } from "../player/spawn";
import { startBuild, startWave } from "../run/runStateMachine";
import { spawnZombie, zombieTypeOf } from "../zombies/zombiePool";
import { ZOMBIE_TYPES } from "../zombies/zombieTypes";
import type { LauncherStats } from "../config/balanceSchema";
import { createExplosionSpec, explode, explosionCounters } from "./explosion";
import { updateCombat } from "./firing";
import { createLobTarget, grenadeCounters, lobAimLength, lobTarget } from "./grenades";
import { setLoadout } from "./loadout";

/**
 * Story 5.5 (AC 9, brief line 7): blasts are spatial, so they get a fuzz. Downtown × random legal
 * decay layouts (stage 1–3 × every legal variant mask) × random blast points (on car and bus faces,
 * in the bus's shadow, on spawn jitter segments, next to barricades, anywhere) × crowds.
 *
 * (i)/(ii) every body the blast hit passes an INDEPENDENT rewrite of FR-C (overlap from the radii;
 * line of sight by sampling the centre-to-centre segment at 2 mm against the shot blockers' boxes:
 * no slab maths shared with `cover.ts`), and every body it didn't hit fails it (bodies within the
 * sampling tolerance of a face or of the overlap edge are skipped as ambiguous); (vi) each body is
 * hit at most once per blast; (vii) a lobbed round never bursts past the first shot blocker on its
 * track (sampled the same way) and, when stopped, bursts within `faceBackoffM` of a face.
 * Then real waves with Grenade Launcher players: (iii) no zombie inside a box after the push (after
 * combat) and after the zombie pass; (iv) zombies still reach a player; (v) the nav grid is rebuilt
 * only to follow a building change. Liveness: ≥ N blasts, hits, pushes and kills.
 */
const balance = loadBalance(withOverrides(bundledBalanceFiles(), [["waves", "runWaves", 20]]));
const GL = balance.weapons.grenade_launcher as LauncherStats;
const map = DOWNTOWN_MAP;
const MASKS = legalDecayMasks(map);
const SAMPLE_M = 0.002;
const EPS = 1e-5;
const box: Box = { minX: 0, minY: 0, maxX: 0, maxY: 0 };

/** Independent LOS: does any sample point of the segment lie strictly inside a blocker box grown by `grow` (negative: shrunk)? */
function sampledBlocked(world: World, x0: number, y0: number, x1: number, y1: number, grow: number, list: readonly MapBox[] = world.obstacles.shotBlockers): boolean {
  const len = Math.hypot(x1 - x0, y1 - y0);
  const n = Math.max(1, Math.ceil(len / SAMPLE_M));
  for (const b of list) {
    const minX = b.minX - grow;
    const minY = b.minY - grow;
    const maxX = b.maxX + grow;
    const maxY = b.maxY + grow;
    if (Math.max(x0, x1) < minX || Math.min(x0, x1) > maxX || Math.max(y0, y1) < minY || Math.min(y0, y1) > maxY) continue;
    for (let k = 0; k <= n; k++) {
      const t = k / n;
      const x = x0 + (x1 - x0) * t;
      const y = y0 + (y1 - y0) * t;
      if (x > minX && x < maxX && y > minY && y < maxY) return true;
    }
  }
  return false;
}

/** FR-C rewritten: "hit" / "safe" / "ambiguous" (within the tolerance of an edge). */
function expectedHit(world: World, bx: number, by: number, R: number, x: number, y: number, r: number): "hit" | "safe" | "ambiguous" {
  const d = Math.hypot(x - bx, y - by);
  if (Math.abs(d - (R + r)) < 1e-4) return "ambiguous";
  if (d >= R + r) return "safe";
  const tol = SAMPLE_M * 1.5;
  const blockedShrunk = sampledBlocked(world, bx, by, x, y, -tol);
  const blockedGrown = sampledBlocked(world, bx, by, x, y, tol);
  if (blockedShrunk) return "safe"; // clearly through a blocker
  if (!blockedGrown) return "hit"; // clearly clear
  return "ambiguous";
}

/** A blast point of one of the interesting kinds. */
function blastPoint(world: World, rng: Rng, out: { x: number; y: number }): string {
  const kind = rng.int(0, 4);
  const blockers = world.obstacles.shotBlockers;
  if (kind <= 1 && blockers.length > 0) {
    // right at a car / bus / building face (just outside, a few cm)
    const b = blockers[rng.int(0, blockers.length - 1)] as MapBox;
    const side = rng.int(0, 3);
    const off = rng.range(0.001, 0.08);
    out.x = side === 0 ? b.minX - off : side === 1 ? b.maxX + off : rng.range(b.minX, b.maxX);
    out.y = side === 2 ? b.minY - off : side === 3 ? b.maxY + off : rng.range(b.minY, b.maxY);
    return kind === 0 ? "face" : "shadow";
  }
  if (kind === 2) {
    const sp = map.spawnPoints[rng.int(0, map.spawnPoints.length - 1)];
    if (sp) {
      const j = rng.range(-balance.waves.spawnJitterM, balance.waves.spawnJitterM);
      out.x = sp.x + (sp.jitterAxis === "x" ? j : 0);
      out.y = sp.y + (sp.jitterAxis === "y" ? j : 0);
      return "spawn";
    }
  }
  if (kind === 3 && world.buildings.list.length > 0) {
    const b = world.buildings.list[rng.int(0, world.buildings.list.length - 1)];
    if (b) {
      out.x = rng.range(b.minX - 0.6, b.maxX + 0.6);
      out.y = rng.next() < 0.5 ? b.minY - rng.range(0.05, 0.5) : b.maxY + rng.range(0.05, 0.5);
      return "barricade";
    }
  }
  out.x = rng.range(1, map.widthM - 1);
  out.y = rng.range(1, map.heightM - 1);
  return "open";
}

function placeBarricades(world: World, rng: Rng, n: number): number {
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
  return placed;
}

function overlapping(world: World, x: number, y: number, r: number, eps = EPS): string | null {
  for (const s of world.obstacles.solids) if (circleOverlapsBox(x, y, r - eps, s.minX, s.minY, s.maxX, s.maxY)) return s.name;
  for (const b of world.buildings.list) if (b.solid && circleOverlapsBox(x, y, r - eps, b.minX, b.minY, b.maxX, b.maxY)) return `building ${b.id}`;
  return null;
}

describe("explosion fuzz (Story 5.5, AC 9)", () => {
  it("random layouts × stages × blast points × crowds: hits match an independent FR-C, once per body; tracks stop at the first blocker", () => {
    const counts = { blasts: 0, hits: 0, safeChecked: 0, hitChecked: 0, ambiguous: 0, blockedBodies: 0, tracks: 0, trackStops: 0 };
    const kinds = new Map<string, number>();
    const pt = { x: 0, y: 0 };
    const lob = createLobTarget();
    for (let seed = 1; seed <= 24; seed++) {
      const rng = createRng(seed * 4241);
      const world = createWorld({ balance, seed, map, systems: { waves: () => {}, zombies: () => {} } });
      world.decay.variants = MASKS[seed % MASKS.length] as number;
      applyDecayStage(world, 1 + (seed % 3), world.decay.variants);
      for (let i = 0; i < 3; i++) {
        const at = teamSpawnPoint(world, i, { x: 0, y: 0 });
        addPlayer(world, `p${i}`, at.x, at.y);
      }
      placeBarricades(world, rng, 5);
      const events: SimEvent[] = [];
      world.events.subscribe((e) => events.push(e));
      for (let b = 0; b < 25; b++) {
        world.zombies.aliveCount = 0; // a fresh crowd per blast (slots reused; ids differ by generation)
        const kind = blastPoint(world, rng, pt);
        kinds.set(kind, (kinds.get(kind) ?? 0) + 1);
        const bx = pt.x;
        const by = pt.y;
        // a crowd round the blast point, all types, some just inside / outside the edge
        for (let k = 0; k < 30; k++) {
          const type = ZOMBIE_TYPES[rng.int(0, ZOMBIE_TYPES.length - 1)] as (typeof ZOMBIE_TYPES)[number];
          const r = balance.zombies.types[type]?.radiusM ?? 0;
          const a = rng.range(0, Math.PI * 2);
          const d = k < 10 ? GL.blastRadiusM + r + rng.range(-0.02, 0.02) : rng.range(0, GL.blastRadiusM + r + 0.5);
          const x = Math.min(map.widthM - r, Math.max(r, bx + Math.cos(a) * d));
          const y = Math.min(map.heightM - r, Math.max(r, by + Math.sin(a) * d));
          const id = spawnZombie(world, type, x, y);
          if (id >= 0) world.zombies.hp[id] = 1e6;
        }
        for (const p of world.players.values()) {
          const a = rng.range(0, Math.PI * 2);
          const d = rng.range(0, GL.blastRadiusM + p.radiusM + 0.3);
          p.x = p.prevX = Math.min(map.widthM - 1, Math.max(1, bx + Math.cos(a) * d));
          p.y = p.prevY = Math.min(map.heightM - 1, Math.max(1, by + Math.sin(a) * d));
          p.hp = p.maxHp;
          p.status = "alive";
        }
        // expected per body, from the positions BEFORE the blast (the push comes after the hits)
        const z = world.zombies;
        const expect0 = new Map<number, ReturnType<typeof expectedHit>>();
        for (let k = 0; k < z.aliveCount; k++) {
          const id = z.aliveIds[k] as number;
          const r = balance.zombies.types[zombieTypeOf(z, id)]?.radiusM ?? 0;
          expect0.set(id, expectedHit(world, bx, by, GL.blastRadiusM, z.x[id] as number, z.y[id] as number, r));
        }
        const expectP = new Map<string, ReturnType<typeof expectedHit>>();
        for (const p of world.players.values()) expectP.set(p.id, expectedHit(world, bx, by, GL.blastRadiusM, p.x, p.y, p.radiusM));
        events.length = 0;
        explode(world, { ...createExplosionSpec(), x: bx, y: by, radiusM: GL.blastRadiusM, zombieDamage: 1, playerDamage: 2, pushM: GL.blastPushM, kind: "grenade", sourcePlayerId: "p0", weapon: "grenade_launcher", quiet: false });
        world.events.flush();
        counts.blasts++;
        const hitCount = new Map<number, number>();
        for (const e of events) if (e.type === "zombie.hit") hitCount.set(e.zombieId, (hitCount.get(e.zombieId) ?? 0) + 1);
        for (const [id, want] of expect0) {
          const n = hitCount.get(id) ?? 0;
          expect(n, `seed ${seed} blast ${b} (${kind}) zombie ${id}: hit ${n} times`).toBeLessThanOrEqual(1); // (vi)
          if (want === "ambiguous") counts.ambiguous++;
          else if (want === "hit") {
            counts.hitChecked++;
            expect(n, `seed ${seed} blast ${b} (${kind}) at (${bx.toFixed(3)}, ${by.toFixed(3)}) zombie ${id}: in range with a clear line but not hit`).toBe(1);
          } else {
            counts.safeChecked++;
            if (Math.hypot((z.x[id] as number) - bx, (z.y[id] as number) - by) < GL.blastRadiusM) counts.blockedBodies++;
            expect(n, `seed ${seed} blast ${b} (${kind}) zombie ${id}: hit though out of range or behind cover`).toBe(0); // (ii)
          }
          counts.hits += n;
        }
        const dmg = new Map<string, number>();
        for (const e of events) if (e.type === "player.damaged") dmg.set(e.playerId, (dmg.get(e.playerId) ?? 0) + 1);
        for (const [id, want] of expectP) {
          const n = dmg.get(id) ?? 0;
          expect(n).toBeLessThanOrEqual(1);
          if (want === "hit") expect(n, `seed ${seed} blast ${b} player ${id}: not hit`).toBe(1);
          if (want === "safe") expect(n, `seed ${seed} blast ${b} player ${id}: hit behind cover / out of range`).toBe(0);
        }
        // (vii) a lob from a random player toward a random point
        const shooter = world.players.get(`p${rng.int(0, 2)}`);
        // a shooter's body never stands inside a box in the game (collision): only test legal spots
        if (shooter && overlapping(world, shooter.x, shooter.y, shooter.radiusM, 0) === null) {
          const a = rng.range(0, Math.PI * 2);
          lobTarget(world, GL, shooter.x, shooter.y, shooter.radiusM, Math.cos(a), Math.sin(a), rng.range(0, 1.2), lob);
          counts.tracks++;
          // the track (centre → landing) never enters a building (beyond the sampling tolerance): it flies over the rest
          expect(sampledBlocked(world, shooter.x, shooter.y, lob.x, lob.y, -SAMPLE_M * 1.5, world.obstacles.lobBlockers), `seed ${seed} track through a building`).toBe(false);
          // FR-B2: it never lands inside any blocker (a car roof would blind the blast)
          expect(sampledBlocked(world, lob.x, lob.y, lob.x, lob.y, -SAMPLE_M * 1.5), `seed ${seed} landed inside a blocker`).toBe(false);
          if (lob.blocked) {
            counts.trackStops++;
            // stopped: one backoff (+ tolerance) further along the aim is inside a blocker, unless the centre itself is
            const fx = lob.x + Math.cos(a) * (balance.combat.explosion.faceBackoffM + 0.005);
            const fy = lob.y + Math.sin(a) * (balance.combat.explosion.faceBackoffM + 0.005);
            expect(sampledBlocked(world, lob.x, lob.y, fx, fy, 0), `seed ${seed} stopped short of any face`).toBe(true);
          } else {
            expect(Math.hypot(lob.x - lob.x0, lob.y - lob.y0)).toBeGreaterThanOrEqual(GL.minLobM - 1e-9);
            expect(Math.hypot(lob.x - lob.x0, lob.y - lob.y0)).toBeLessThanOrEqual(GL.lobRangeM + 1e-9);
          }
        }
      }
    }
    (globalThis as unknown as { console: { info(msg: string): void } }).console.info(`[explosion fuzz A] ${JSON.stringify(counts)} kinds ${JSON.stringify([...kinds])}`);
    expect(counts.blasts).toBe(600);
    expect(counts.hitChecked).toBeGreaterThan(2000); // liveness: the rule really hit bodies
    expect(counts.blockedBodies).toBeGreaterThan(50); // and really met cover
    expect(counts.trackStops).toBeGreaterThan(20);
    expect(counts.ambiguous).toBeLessThan(counts.hitChecked / 20);
  }, 240_000);

  it("waves with 3 Grenade Launcher players × layouts: no zombie in a box after the push and the zombie pass, zombies reach players, no stray nav rebuild", () => {
    const LAYOUTS = 8;
    const TICKS = 1200;
    const blasts0 = explosionCounters.happened;
    let kills = 0;
    let navStray = 0;
    grenadeCounters.launched = 0;
    for (let seed = 1; seed <= LAYOUTS; seed++) {
      const rng = createRng(seed * 911);
      let afterCombat = 0;
      const combatChecked: SystemFn = (w, dt) => {
        updateCombat(w, dt);
        const zp = w.zombies;
        for (let i = 0; i < zp.aliveCount; i++) {
          const id = zp.aliveIds[i] as number;
          const r = balance.zombies.types[zombieTypeOf(zp, id)]?.radiusM ?? 0;
          const hit = overlapping(w, zp.x[id] as number, zp.y[id] as number, r, (balance.buildings.types.auto_turret?.turret?.hitPushbackM ?? 0) + EPS);
          if (hit) throw new Error(`seed ${seed} tick ${w.tick} zombie ${id}: pushed into ${hit} (after combat)`);
        }
        afterCombat++;
      };
      const world = createWorld({ balance, seed, map, systems: { combat: combatChecked } });
      world.debug.godMode = true;
      world.decay.variants = MASKS[seed % MASKS.length] as number;
      applyDecayStage(world, 1 + (seed % 3), world.decay.variants);
      const players = [0, 1, 2].map((i) => {
        const at = teamSpawnPoint(world, i, { x: 0, y: 0 });
        const p = addPlayer(world, `p${i}`, at.x, at.y);
        setLoadout(balance, p.loadout, ["grenade_launcher", null]);
        return p;
      });
      startBuild(world);
      placeBarricades(world, rng, 5);
      world.waves.number = 3;
      startWave(world);
      world.events.subscribe((e) => {
        if (e.type === "zombie.killed" && e.weapon === "grenade_launcher") kills++;
      });
      const tough = seed % 2 === 0;
      let contacts = 0;
      const z = world.zombies;
      for (let t = 0; t < TICKS; t++) {
        for (const p of players) {
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
            setInput(world, p.id, { ...NEUTRAL_INPUT, seq: t + 1 });
            continue;
          }
          const dx = (z.x[best] as number) - p.x;
          const dy = (z.y[best] as number) - p.y;
          const k = lobAimLength(GL, bd - p.radiusM - MUZZLE_OFFSET_M) / bd;
          setInput(world, p.id, { ...NEUTRAL_INPUT, seq: t + 1, aimX: dx * k, aimY: dy * k, fire: true, isMouse: true });
        }
        if (tough) for (let i = 0; i < z.aliveCount; i++) z.hp[z.aliveIds[i] as number] = 1e6;
        const bBefore = world.buildings.version;
        const navBefore = world.pathing.nav.version;
        step(world, TICK_DT_S);
        if (world.pathing.nav.version !== navBefore && navBefore === bBefore && world.buildings.version === bBefore) navStray++;
        for (let i = 0; i < z.aliveCount; i++) {
          const id = z.aliveIds[i] as number;
          const x = z.x[id] as number;
          const y = z.y[id] as number;
          const r = balance.zombies.types[zombieTypeOf(z, id)]?.radiusM ?? 0;
          expect(overlapping(world, x, y, r), `seed ${seed} tick ${t} zombie ${id}: in a box after the zombie pass`).toBeNull();
          for (const p of players) if (Math.hypot(x - p.x, y - p.y) <= r + p.radiusM + 0.1) contacts++;
        }
      }
      expect(afterCombat).toBe(TICKS);
      if (tough) expect(contacts, `seed ${seed}: no zombie reached a player`).toBeGreaterThan(0);
    }
    const blasts = explosionCounters.happened - blasts0;
    (globalThis as unknown as { console: { info(msg: string): void } }).console.info(`[explosion fuzz B] ${LAYOUTS} layouts: ${grenadeCounters.launched} rounds, ${blasts} blasts, ${kills} GL kills, ${grenadeCounters.coverStops} stopped by cover`);
    expect(navStray).toBe(0);
    expect(blasts).toBeGreaterThan(200);
    expect(kills).toBeGreaterThan(100);
  }, 240_000);
});
