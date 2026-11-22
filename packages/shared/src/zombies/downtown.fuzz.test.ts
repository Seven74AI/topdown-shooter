import { describe, expect, it } from "vitest";
import { loadBalance } from "../config/balance";
import { BUILD_GRID_M, TICK_DT_S } from "../config/constants";
import { addBuildingAt, buildingStats, footprint, footprintBlocked, type Box, type BuildingRotation } from "../buildings/buildings";
import { circleOverlapsBox, segmentHitsBuildings } from "../buildings/collision";
import { createRng, type Rng } from "../core/rng";
import { ticksFor } from "../core/time";
import { createWorld, step, type World } from "../core/world";
import { DOWNTOWN_MAP } from "../map/downtown";
import type { MapBox } from "../map/districtMap";
import { addPlayer } from "../player/player";
import { spotBlocked } from "../player/freeSpot";
import { teamSpawnPoint } from "../player/spawn";
import { spawnZombie } from "./zombiePool";
import { jitteredSpawn } from "../waves/waveDirector";
import { SPAWN_STATE, spawnPointStates } from "../waves/spawnPick";
import { NEUTRAL_INPUT, type PlayerInput } from "../net/input";
import { setInput } from "../core/world";
import { ZOMBIE_TYPES, maxZombieRadius, type ZombieTypeId } from "./zombieTypes";

/**
 * Story 4.1 (brief line 3): random legal layouts on the Downtown map × many ticks.
 *
 * Each layout: 1–4 god-mode players (the team start or random free spots), then up to 24 buildings
 * (the 4 × 6 cap; barricades in both rotations and turrets, which don't fire outside a wave; every
 * fourth layout has none, so the map boxes alone must stop the players: review L3),
 * accepted only where the placement rule allows (`footprintBlocked`: map edge, map collision,
 * spawn clearance, players, zombies, other buildings). Half of the candidates hug a map box (gap 0,
 * 0.5 or 1 m) to make wall–barricade slots and pinches. Then a zombie of a random type at every
 * spawn point plus extra ones, placed with the wave director's jitter rule (`jitteredSpawn`, extremes
 * included), and the World runs (no wave director). The players walk (review L3): each heads for a
 * random point on a random map box's face (the bus included) and keeps pressing on it for a while,
 * then picks another, so they slide along walls, into corners and against barricades; after
 * `WALK_S` they hold still so the slowest zombies can arrive.
 *
 * Story 4.3: each layout is built at a random decay stage (1–3; placement clears only the spawns open
 * then) and fought at the same or a later stage, so buildings can stand on spawns that open later.
 * Zombies appear only at the spawns the wave director may use at the fight stage (not CLOSED, not
 * BLOCKED by a building); the jitter area of each of those must be clear of every building.
 *
 * Every tick: no zombie or player overlaps a map box or a building. Every zombie must reach a
 * player (`REACH_M`, clear line) within the limit (no stall: none is left wandering or wedged). Liveness: the layouts
 * really had buildings, zombies really arrived, and some layouts really made zombies break walls.
 */
const balance = loadBalance();
const LAYOUTS = 36;
const LIMIT_S = 120;
/** Players walk this long, then hold still (a 4.5 m/s survivor outruns a 0.7 m/s Crawler forever). */
const WALK_S = 30;
const EXTRA_ZOMBIES = 6;
/**
 * Overlap tolerances. Zombie positions are Float32 (a ulp near 48 m is ~4e-6 m). Players are float64,
 * but the push-out itself accepts a leftover overlap below `STUCK_EPS_M` (1e-6 m, collision.ts) after
 * its passes (seen: 8e-7 m pressing into a corner between two boxes); anything deeper is a body inside.
 */
const ZOMBIE_EPS_M = 1e-5;
const PLAYER_EPS_M = 1e-6;
/**
 * "Reached a player": within this distance with a clear line (no map box or building between), or
 * pressed against a zombie that has reached one (the crowd round a player: only the inner ring can
 * touch, and a player in a corner pushes the crowd out past 3 m in one quadrant).
 */
const REACH_M = 3;
/** The soft separation holds crowd neighbours a little apart (seen: 0.81 m for two 0.35 m bodies). */
const CROWD_GAP_M = 0.3;
const TYPES = ["wood_barricade", "auto_turret"] as const;
const map = DOWNTOWN_MAP;

const box: Box = { minX: 0, minY: 0, maxX: 0, maxY: 0 };

function overlapsAnyBox(world: World, x: number, y: number, r: number, eps: number): string | null {
  for (const s of world.map.solids) if (circleOverlapsBox(x, y, r - eps, s.minX, s.minY, s.maxX, s.maxY)) return s.name;
  for (const b of world.buildings.list) if (circleOverlapsBox(x, y, r - eps, b.minX, b.minY, b.maxX, b.maxY)) return `building ${b.id}`;
  return null;
}

/** A lattice corner next to a random face of a random map box (gap 0, 0.5 or 1 m). */
function nearSolid(rng: Rng, w: number, h: number): { gx: number; gy: number } {
  const s = map.solids[rng.int(0, map.solids.length - 1)] as MapBox;
  const gap = rng.int(0, 2) * BUILD_GRID_M;
  const along = (lo: number, hi: number, size: number) => rng.int(Math.round((lo - size) / BUILD_GRID_M), Math.round(hi / BUILD_GRID_M));
  switch (rng.int(0, 3)) {
    case 0:
      return { gx: Math.round((s.minX - gap - w) / BUILD_GRID_M), gy: along(s.minY, s.maxY, h) };
    case 1:
      return { gx: Math.round((s.maxX + gap) / BUILD_GRID_M), gy: along(s.minY, s.maxY, h) };
    case 2:
      return { gx: along(s.minX, s.maxX, w), gy: Math.round((s.minY - gap - h) / BUILD_GRID_M) };
    default:
      return { gx: along(s.minX, s.maxX, w), gy: Math.round((s.maxY + gap) / BUILD_GRID_M) };
  }
}

function layout(seed: number) {
  const rng = createRng(seed);
  const world = createWorld({ balance, seed, map, systems: { waves: () => {} } });
  world.debug.godMode = true;
  let damaged = 0;
  world.events.subscribe((e) => {
    if (e.type === "building.destroyed") damaged++;
  });
  const players = rng.int(1, 4);
  const at = { x: 0, y: 0 };
  for (let slot = 0; slot < players; slot++) {
    if (seed % 2 === 0) teamSpawnPoint(world, slot, at);
    else {
      do {
        at.x = rng.range(1, map.widthM - 1);
        at.y = rng.range(1, map.heightM - 1);
      } while (spotBlocked(world, at.x, at.y, balance.player.radiusM, null));
    }
    addPlayer(world, `p${slot}`, at.x, at.y);
  }
  const buildStage = rng.int(1, 3);
  const fightStage = rng.int(buildStage, 3);
  world.debug.decayStage = buildStage;
  const want = seed % 4 === 0 ? 0 : rng.int(6, 24);
  let nextId = 1;
  for (let tries = 0; tries < 2000 && world.buildings.list.length < want; tries++) {
    const type = TYPES[rng.int(0, 9) === 0 ? 1 : 0] as string;
    const stats = buildingStats(balance, type);
    if (!stats) throw new Error(type);
    const rot = rng.int(0, 3) as BuildingRotation;
    const w = rot % 2 === 0 ? stats.widthM : stats.depthM;
    const h = rot % 2 === 0 ? stats.depthM : stats.widthM;
    const c = rng.int(0, 1) === 0 ? nearSolid(rng, w, h) : { gx: rng.int(0, map.widthM / BUILD_GRID_M), gy: rng.int(0, map.heightM / BUILD_GRID_M) };
    if (footprintBlocked(world, footprint(stats, c.gx, c.gy, rot, box))) continue;
    addBuildingAt(world, { id: nextId++, type, ownerId: "p0", gx: c.gx, gy: c.gy, rot, hp: stats.hp });
  }
  const spawned: number[] = [];
  const zombieType = (): ZombieTypeId => ZOMBIE_TYPES[rng.int(0, ZOMBIE_TYPES.length - 1)] as ZombieTypeId;
  const jitter = balance.waves.spawnJitterM;
  const at2 = { x: 0, y: 0 };
  const spawnAt = (sp: { x: number; y: number }, k: number): void => {
    const type = zombieType();
    const j = k % 3 === 0 ? -jitter : k % 3 === 1 ? jitter : rng.range(-jitter, jitter); // the extremes too
    jitteredSpawn(world, sp, j, balance.zombies.types[type]?.radiusM ?? 0, at2);
    spawned.push(spawnZombie(world, type, at2.x, at2.y));
  };
  world.debug.decayStage = fightStage;
  const states = spawnPointStates(world, new Uint8Array(map.spawnPoints.length));
  const usable = map.spawnPoints.filter((_, i) => states[i] !== SPAWN_STATE.CLOSED && states[i] !== SPAWN_STATE.BLOCKED);
  const blocked = states.filter((s) => s === SPAWN_STATE.BLOCKED).length;
  // Story 4.3: a usable spawn's whole jitter area (grown by the largest zombie radius) is clear of buildings.
  let jitterHits = 0;
  const lo = { x: 0, y: 0 };
  const hi = { x: 0, y: 0 };
  const rz = maxZombieRadius(balance);
  for (const sp of usable) {
    jitteredSpawn(world, sp, -jitter, rz, lo);
    jitteredSpawn(world, sp, jitter, rz, hi);
    for (const b of world.buildings.list) {
      if (Math.min(lo.x, hi.x) - rz < b.maxX && Math.max(lo.x, hi.x) + rz > b.minX && Math.min(lo.y, hi.y) - rz < b.maxY && Math.max(lo.y, hi.y) + rz > b.minY) jitterHits++;
    }
  }
  usable.forEach((sp, k) => spawnAt(sp, k + seed));
  for (let i = 0; i < EXTRA_ZOMBIES; i++) spawnAt(usable[rng.int(0, usable.length - 1)] as { x: number; y: number }, i + seed + 1);
  return { world, rng, spawned, players, buildings: world.buildings.list.length, destroyed: () => damaged, fightStage, blocked, jitterHits };
}

/** Review L3: each player's walk target (a point on a map box's face) and ticks left pressing on it. */
interface Walk {
  tx: number;
  ty: number;
  ticks: number;
}
const WALK_TICKS = [20, 80] as const;

function steer(world: World, rng: Rng, walks: Walk[], seq: number): void {
  let i = 0;
  for (const p of world.players.values()) {
    const w = (walks[i] ??= { tx: p.x, ty: p.y, ticks: 0 });
    if (w.ticks-- <= 0) {
      const s = map.solids[rng.int(0, map.solids.length - 1)] as MapBox;
      const side = rng.int(0, 3);
      const u = rng.range(0, 1);
      w.tx = side < 2 ? s.minX + u * (s.maxX - s.minX) : side === 2 ? s.minX : s.maxX;
      w.ty = side === 0 ? s.minY : side === 1 ? s.maxY : s.minY + u * (s.maxY - s.minY);
      w.ticks = rng.int(WALK_TICKS[0], WALK_TICKS[1]);
    }
    const dx = w.tx - p.x;
    const dy = w.ty - p.y;
    const d = Math.hypot(dx, dy) || 1;
    const input: PlayerInput = { ...NEUTRAL_INPUT, seq, moveX: dx / d, moveY: dy / d, aimX: dx / d, aimY: dy / d };
    setInput(world, p.id, input);
    i++;
  }
}

/** Runs the layout; returns the first violation (or null), and the zombies that touched a player. */
function run(seed: number) {
  const l = layout(seed);
  const { world, spawned, rng } = l;
  const walks: Walk[] = [];
  let pressed = 0;
  const reached = new Set<number>();
  const limit = ticksFor(LIMIT_S);
  const walkTicks = ticksFor(WALK_S);
  let ticks = 0;
  let violation: string | null = null;
  for (; ticks < limit && reached.size < spawned.length && violation === null; ticks++) {
    if (ticks < walkTicks) steer(world, rng, walks, ticks + 1);
    else if (ticks === walkTicks) for (const p of world.players.values()) setInput(world, p.id, { ...NEUTRAL_INPUT, seq: ticks + 1 });
    step(world, TICK_DT_S);
    const z = world.zombies;
    for (let i = 0; i < z.aliveCount; i++) {
      const id = z.aliveIds[i] as number;
      const r = balance.zombies.types[ZOMBIE_TYPES[z.type[id] as number] as string]?.radiusM ?? 0;
      const x = z.x[id] as number;
      const y = z.y[id] as number;
      const inBox = overlapsAnyBox(world, x, y, r, ZOMBIE_EPS_M);
      if (inBox) violation = `seed ${seed} tick ${ticks}: zombie ${id} at (${x.toFixed(3)}, ${y.toFixed(3)}) inside ${inBox}`;
      for (const p of world.players.values()) {
        if (Math.hypot(p.x - x, p.y - y) <= REACH_M && !segmentHitsBuildings(world, x, y, p.x, p.y, 0)) reached.add(id);
      }
    }
    // The crowd: a zombie pressed against a reached one has reached the player too (repeat until stable).
    for (let grew = true; grew; ) {
      grew = false;
      for (let i = 0; i < z.aliveCount; i++) {
        const a = z.aliveIds[i] as number;
        if (reached.has(a)) continue;
        for (let k = 0; k < z.aliveCount; k++) {
          const b = z.aliveIds[k] as number;
          if (!reached.has(b)) continue;
          if (Math.hypot((z.x[a] as number) - (z.x[b] as number), (z.y[a] as number) - (z.y[b] as number)) <= 2 * maxZombieRadius(balance) + CROWD_GAP_M) {
            reached.add(a);
            grew = true;
            break;
          }
        }
      }
    }
    for (const p of world.players.values()) {
      const inBox = overlapsAnyBox(world, p.x, p.y, p.radiusM, PLAYER_EPS_M);
      if (inBox) violation = `seed ${seed} tick ${ticks}: player ${p.id} at (${p.x}, ${p.y}) from (${p.prevX}, ${p.prevY}) inside ${inBox}`;
      if (overlapsAnyBox(world, p.x, p.y, p.radiusM + 0.01, 0)) pressed++; // against a wall (liveness)
    }
  }
  const missing = spawned.filter((id) => !reached.has(id));
  return { ...l, ticks, violation, missing, reached: reached.size, pressed };
}

describe("Downtown fuzz: random legal layouts × many ticks (Story 4.1, brief line 3)", () => {
  it(`${LAYOUTS} layouts: no body inside a box, no stall, every zombie reaches a player`, () => {
    let buildings = 0;
    let reached = 0;
    let breaking = 0;
    let pressed = 0;
    let bare = 0;
    let spawnedTotal = 0;
    let blocked = 0;
    const stages = new Set<number>();
    const failures: string[] = [];
    for (let seed = 1; seed <= LAYOUTS; seed++) {
      const r = run(4100 + seed);
      buildings += r.buildings;
      reached += r.reached;
      if (r.destroyed() > 0) breaking++;
      pressed += r.pressed;
      if (r.buildings === 0) bare++;
      spawnedTotal += r.spawned.length;
      blocked += r.blocked;
      stages.add(r.fightStage);
      if (r.jitterHits > 0) failures.push(`seed ${4100 + seed}: ${r.jitterHits} usable spawn jitter areas overlap a building`);
      if (r.violation) failures.push(r.violation);
      if (r.missing.length > 0) {
        const z = r.world.zombies;
        failures.push(`seed ${4100 + seed}: ${r.missing.length} zombies never reached a player in ${LIMIT_S} s: ${r.missing.map((id) => `${id}@(${(z.x[id] as number).toFixed(2)}, ${(z.y[id] as number).toFixed(2)})`).join(" ")}`);
      }
    }
    (globalThis as unknown as { console: { info(msg: string): void } }).console.info(`[fuzz] downtown: ${LAYOUTS} layouts, ${buildings} buildings, ${reached} zombies reached a player, ${breaking} layouts broke a building, ${bare} layouts without buildings, ${pressed} player-ticks pressed on a box, fight stages ${[...stages].sort().join("/")}, ${blocked} spawns closed by a building`);
    expect(failures).toEqual([]);
    // Liveness (brief line 9): the layouts were real and the zombies really came.
    expect(buildings).toBeGreaterThan(LAYOUTS * 3);
    expect(bare).toBe(LAYOUTS / 4);
    expect(pressed).toBeGreaterThan(LAYOUTS * 20); // the players really walked into walls
    expect(reached).toBe(spawnedTotal);
    // Story 4.3 liveness: all three stages were fought, and some buildings really sat on later spawns.
    expect(spawnedTotal).toBeGreaterThan(LAYOUTS * (9 + EXTRA_ZOMBIES) - 1);
    expect([...stages].sort()).toEqual([1, 2, 3]);
    expect(blocked).toBeGreaterThan(0);
    expect(breaking).toBeGreaterThan(0);
  }, 240_000);
});
