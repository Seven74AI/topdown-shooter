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
import { ZOMBIE_TYPES, type ZombieTypeId } from "./zombieTypes";

/**
 * Story 4.1 (brief line 3): random legal layouts on the Downtown map × many ticks.
 *
 * Each layout: 1–4 god-mode players (the team start or random free spots), then up to 24 buildings
 * (the 4 × 6 cap; barricades in both rotations and turrets, which don't fire outside a wave),
 * accepted only where the placement rule allows (`footprintBlocked`: map edge, map collision,
 * spawn clearance, players, zombies, other buildings). Half of the candidates hug a map box (gap 0,
 * 0.5 or 1 m) to make wall–barricade slots and pinches. Then a zombie of a random type at every
 * spawn point plus extra ones, and the World runs (no wave director).
 *
 * Every tick: no zombie or player overlaps a map box or a building. Every zombie must reach a
 * player (`REACH_M`, clear line) within the limit (no stall: none is left wandering or wedged). Liveness: the layouts
 * really had buildings, zombies really arrived, and some layouts really made zombies break walls.
 */
const balance = loadBalance();
const LAYOUTS = 36;
const LIMIT_S = 75;
const EXTRA_ZOMBIES = 6;
/** Zombie positions are Float32 (a ulp near 48 m is ~4e-6 m); players are float64. */
const ZOMBIE_EPS_M = 1e-5;
const PLAYER_EPS_M = 1e-9;
/**
 * "Reached a player": within this distance with a clear line (no map box or building between). 15
 * zombies crowd one player in rings ~0.75, 1.45 and 2.15 m out; only the inner ring touches.
 */
const REACH_M = 3;
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
  const want = rng.int(6, 24);
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
  for (const sp of map.spawnPoints) spawned.push(spawnZombie(world, zombieType(), sp.x, sp.y));
  for (let i = 0; i < EXTRA_ZOMBIES; i++) {
    const sp = map.spawnPoints[rng.int(0, map.spawnPoints.length - 1)] as { x: number; y: number };
    spawned.push(spawnZombie(world, zombieType(), sp.x, sp.y));
  }
  return { world, spawned, players, buildings: world.buildings.list.length, destroyed: () => damaged };
}

/** Runs the layout; returns the first violation (or null), and the zombies that touched a player. */
function run(seed: number) {
  const l = layout(seed);
  const { world, spawned } = l;
  const reached = new Set<number>();
  const limit = ticksFor(LIMIT_S);
  let ticks = 0;
  let violation: string | null = null;
  for (; ticks < limit && reached.size < spawned.length && violation === null; ticks++) {
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
        // In the crowd round a player (only the inner ring can touch) with nothing between them.
        if (Math.hypot(p.x - x, p.y - y) <= REACH_M && !segmentHitsBuildings(world, x, y, p.x, p.y, 0)) reached.add(id);
      }
    }
    for (const p of world.players.values()) {
      const inBox = overlapsAnyBox(world, p.x, p.y, p.radiusM, PLAYER_EPS_M);
      if (inBox) violation = `seed ${seed} tick ${ticks}: player ${p.id} inside ${inBox}`;
    }
  }
  const missing = spawned.filter((id) => !reached.has(id));
  return { ...l, ticks, violation, missing, reached: reached.size };
}

describe("Downtown fuzz: random legal layouts × many ticks (Story 4.1, brief line 3)", () => {
  it(`${LAYOUTS} layouts: no body inside a box, no stall, every zombie reaches a player`, () => {
    let buildings = 0;
    let reached = 0;
    let breaking = 0;
    const failures: string[] = [];
    for (let seed = 1; seed <= LAYOUTS; seed++) {
      const r = run(4100 + seed);
      buildings += r.buildings;
      reached += r.reached;
      if (r.destroyed() > 0) breaking++;
      if (r.violation) failures.push(r.violation);
      if (r.missing.length > 0) {
        const z = r.world.zombies;
        failures.push(`seed ${4100 + seed}: ${r.missing.length} zombies never reached a player in ${LIMIT_S} s: ${r.missing.map((id) => `${id}@(${(z.x[id] as number).toFixed(2)}, ${(z.y[id] as number).toFixed(2)})`).join(" ")}`);
      }
    }
    (globalThis as unknown as { console: { info(msg: string): void } }).console.info(`[fuzz] downtown: ${LAYOUTS} layouts, ${buildings} buildings, ${reached} zombies reached a player, ${breaking} layouts broke a building`);
    expect(failures).toEqual([]);
    // Liveness (brief line 9): the layouts were real and the zombies really came.
    expect(buildings).toBeGreaterThan(LAYOUTS * 6);
    expect(reached).toBe(LAYOUTS * (map.spawnPoints.length + EXTRA_ZOMBIES));
    expect(breaking).toBeGreaterThan(0);
  }, 240_000);
});
