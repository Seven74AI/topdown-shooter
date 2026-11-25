import { circleOverlapsBox } from "../buildings/collision";
import type { Building } from "../buildings/buildings";
import { ticksFor } from "../core/time";
import type { World } from "../core/world";
import { currentDecayStage } from "../map/decayStage";
import type { DistrictMap, MapBox, SpawnPoint } from "../map/districtMap";

/**
 * Story 4.3 (FR32): which spawn point the wave director uses for the next zombie.
 *
 * A point is, in this order:
 * - CLOSED: not open yet at the decay stage (`minStage > decayStage(world)`), or (Story 6.2) buried:
 *   its position lies inside an active solid (the collapsed alley's mouth);
 * - BLOCKED: a building overlaps its `buildings.spawnClearM` circle. A guard only: placement keeps
 *   that clearance from the spawns of every stage (review M), so it never happens in normal play;
 * - NEAR: closer than `waves.spawnMinPlayerDistanceM` + `spawnJitterM` to a living player (standing
 *   or downed), so even a jittered zombie appears ≥ 6 m away;
 * - OPEN: usable.
 *
 * The pick among OPEN points first chooses a map side (N/E/S/W from the centre) among the sides with
 * an OPEN point, weighted away from the sides of the last `spawnPick.recentPicks` picks, then a point
 * of that side weighted away from the recently used points (integer weights; two `streams.spawns.int`
 * draws). With no OPEN point
 * the batch is held (`pickSpawnPoint` returns −1, nothing leaves the queue) for up to
 * `spawnPick.allNearMaxWaitS`, then the NEAR point farthest from the living players is used, so
 * camping every spawn slows a wave but never stalls it (review L1: with no NEAR point either, it keeps
 * holding). The wave director resets the hold when a pick is not attempted (review L2). No allocation per call (scratch reused).
 */
export const SPAWN_STATE = { OPEN: 0, NEAR: 1, BLOCKED: 2, CLOSED: 3 } as const;
export type SpawnState = (typeof SPAWN_STATE)[keyof typeof SPAWN_STATE];

/** Map side a spawn faces from the centre: the larger of |dx|/width and |dy|/height decides. */
export const SPAWN_SIDE = { N: 0, E: 1, S: 2, W: 3 } as const;
export const SPAWN_SIDE_NAMES = ["N", "E", "S", "W"] as const;

export function spawnSide(map: Readonly<DistrictMap>, sp: Readonly<SpawnPoint>): number {
  const dx = (sp.x - map.widthM / 2) / map.widthM;
  const dy = (sp.y - map.heightM / 2) / map.heightM;
  if (Math.abs(dx) >= Math.abs(dy)) return dx < 0 ? SPAWN_SIDE.W : SPAWN_SIDE.E;
  return dy < 0 ? SPAWN_SIDE.N : SPAWN_SIDE.S;
}

/** Longest recent-pick memory (`spawnPick.recentPicks` ≤ this, balance schema). */
export const MAX_RECENT_SPAWNS = 16;

/** Wave-director state of the spawn pick (part of `WaveState`; snapshotted). */
export interface SpawnPickState {
  /** Ring of the last picked point indices (newest at `recentSpawnHead − 1`). */
  readonly recentSpawns: Int16Array;
  recentSpawnCount: number;
  recentSpawnHead: number;
  /** Tick the current hold began (no point was OPEN), −1 when not holding. */
  spawnHeldSinceTick: number;
}

export function createSpawnPickState(): SpawnPickState {
  return { recentSpawns: new Int16Array(MAX_RECENT_SPAWNS), recentSpawnCount: 0, recentSpawnHead: 0, spawnHeldSinceTick: -1 };
}

/** Living players (alive or downed) of this call; reused. */
const living: { x: number; y: number }[] = [];
let states = new Uint8Array(32);
let nearestD2 = new Float64Array(32);

function collectLiving(world: Readonly<World>): void {
  living.length = 0;
  for (const p of world.players.values()) if (p.status === "alive" || p.status === "downed") living.push(p);
}

function blockedByBuilding(world: Readonly<World>, sp: Readonly<SpawnPoint>): boolean {
  const list = world.buildings.list;
  const clear = world.balance.buildings.spawnClearM;
  for (let i = 0; i < list.length; i++) {
    const b = list[i] as Building;
    if (circleOverlapsBox(sp.x, sp.y, clear, b.minX, b.minY, b.maxX, b.maxY)) return true;
  }
  return false;
}

/**
 * Story 6.2 (F5, "buried" rule): bit per spawn point = its position lies inside an active solid
 * (rubble on an alley mouth). Cached per obstacle list and its `version` (rebuilt only at a stage
 * change), so a pick does no box loop and allocates nothing.
 */
interface BuriedCache {
  version: number;
  map: unknown;
  buried: Uint8Array;
}
const buriedCaches = new WeakMap<object, BuriedCache>();
/** Story 6.2 (tests): buried-cache rebuilds (one per obstacle version, never per pick). */
export const spawnPickCounters = { buriedRebuilds: 0 };

function buriedOf(world: Readonly<World>): Uint8Array {
  const o = world.obstacles;
  let c = buriedCaches.get(o);
  const points = world.map.spawnPoints;
  if (!c) {
    c = { version: -1, map: null, buried: new Uint8Array(points.length) };
    buriedCaches.set(o, c);
  }
  if (c.version !== o.version || c.map !== world.map || c.buried.length < points.length) {
    if (c.buried.length < points.length) c.buried = new Uint8Array(points.length);
    const solids = o.solids;
    for (let i = 0; i < points.length; i++) {
      const sp = points[i] as SpawnPoint;
      let inside = 0;
      for (let k = 0; k < solids.length && inside === 0; k++) {
        const b = solids[k] as MapBox;
        if (sp.x >= b.minX && sp.x <= b.maxX && sp.y >= b.minY && sp.y <= b.maxY) inside = 1;
      }
      c.buried[i] = inside;
    }
    c.version = o.version;
    c.map = world.map;
    spawnPickCounters.buriedRebuilds++;
  }
  return c.buried;
}

/** Story 6.2: spawn point `i` lies inside an active solid (closed by the "buried" rule). */
export function isSpawnBuried(world: Readonly<World>, i: number): boolean {
  return buriedOf(world)[i] === 1;
}

/** Fills the scratch `states` / `nearestD2` for every spawn point; returns the OPEN count. */
function classify(world: Readonly<World>): number {
  const points = world.map.spawnPoints;
  if (states.length < points.length) {
    states = new Uint8Array(points.length);
    nearestD2 = new Float64Array(points.length);
  }
  const stage = currentDecayStage(world);
  const minD = world.balance.waves.spawnMinPlayerDistanceM + world.balance.waves.spawnJitterM;
  const minD2 = minD * minD;
  const buried = buriedOf(world);
  let open = 0;
  for (let i = 0; i < points.length; i++) {
    const sp = points[i] as (typeof points)[number];
    let nearest = Infinity;
    for (let k = 0; k < living.length; k++) {
      const p = living[k] as { x: number; y: number };
      const dx = p.x - sp.x;
      const dy = p.y - sp.y;
      nearest = Math.min(nearest, dx * dx + dy * dy);
    }
    nearestD2[i] = nearest;
    let s: SpawnState;
    if (sp.minStage > stage || buried[i] === 1) s = SPAWN_STATE.CLOSED; // Story 6.2: buried under rubble
    else if (blockedByBuilding(world, sp)) s = SPAWN_STATE.BLOCKED;
    else if (nearest < minD2) s = SPAWN_STATE.NEAR;
    else s = SPAWN_STATE.OPEN;
    states[i] = s;
    if (s === SPAWN_STATE.OPEN) open++;
  }
  return open;
}

/**
 * Dev view / tests: each spawn point's state now (index = `world.map.spawnPoints` index) into `out`
 * (length ≥ the spawn count). Same rule as the pick.
 */
export function spawnPointStates(world: Readonly<World>, out: Uint8Array): Uint8Array {
  collectLiving(world);
  classify(world);
  for (let i = 0; i < world.map.spawnPoints.length; i++) out[i] = states[i] as number;
  return out;
}

function remember(world: World, i: number): void {
  const w = world.waves;
  const cap = Math.min(MAX_RECENT_SPAWNS, world.balance.waves.spawnPick.recentPicks);
  if (cap === 0) return;
  w.recentSpawns[w.recentSpawnHead % cap] = i;
  w.recentSpawnHead = (w.recentSpawnHead + 1) % cap;
  w.recentSpawnCount = Math.min(cap, w.recentSpawnCount + 1);
}

/** Recent picks on `side`, and of point `i` (−1: none), in the ring. */
function recentHits(world: World, side: number, i: number): number {
  const w = world.waves;
  const map = world.map;
  let n = 0;
  for (let k = 0; k < w.recentSpawnCount; k++) {
    const j = w.recentSpawns[k] as number;
    if (i >= 0 ? j === i : spawnSide(map, map.spawnPoints[j] as SpawnPoint) === side) n++;
  }
  return n;
}

const sideWeight = new Int32Array(4);

/** The weight of OPEN point i inside its side: fewer recent picks of that point → heavier. */
function pointWeight(world: World, i: number): number {
  const b = world.balance.waves.spawnPick;
  return Math.max(b.minWeight, b.baseWeight - b.pointPenalty * recentHits(world, -1, i));
}

/** The point with the largest nearest-player distance among those whose state ≤ `maxState`, or −1. */
function farthest(count: number, maxState: number): number {
  let best = -1;
  let bestD2 = -1;
  for (let i = 0; i < count; i++) {
    if ((states[i] as number) > maxState) continue;
    if ((nearestD2[i] as number) > bestD2) {
      bestD2 = nearestD2[i] as number;
      best = i;
    }
  }
  return best;
}

/**
 * Index of the spawn point for the next wave zombie, or −1 to hold the batch (no point is OPEN and
 * the hold is younger than `allNearMaxWaitS`, or no point is NEAR either). Draws one `streams.spawns.int` when it picks among
 * OPEN points (two: the side, then the point); the fallback (farthest) draws nothing.
 */
export function pickSpawnPoint(world: World): number {
  const points = world.map.spawnPoints;
  const w = world.waves;
  collectLiving(world);
  const open = classify(world);
  if (open > 0) {
    // Side first (N/E/S/W, each side with an OPEN point weighted away from the recent picks' sides),
    // so a side with four spawns is not four times as busy as a side with one; then a point inside it.
    const b = world.balance.waves.spawnPick;
    sideWeight.fill(0);
    for (let i = 0; i < points.length; i++) {
      if (states[i] !== SPAWN_STATE.OPEN) continue;
      const side = spawnSide(world.map, points[i] as SpawnPoint);
      if (sideWeight[side] === 0) sideWeight[side] = Math.max(b.minWeight, b.baseWeight - b.sidePenalty * recentHits(world, side, -1));
    }
    let total = 0;
    for (let side = 0; side < 4; side++) total += sideWeight[side] as number;
    let roll = world.streams.spawns.int(0, total - 1);
    let side = 0;
    while (side < 3 && roll >= (sideWeight[side] as number)) roll -= sideWeight[side++] as number;
    total = 0;
    for (let i = 0; i < points.length; i++) {
      if (states[i] === SPAWN_STATE.OPEN && spawnSide(world.map, points[i] as SpawnPoint) === side) total += pointWeight(world, i);
    }
    roll = world.streams.spawns.int(0, total - 1);
    let pick = -1;
    for (let i = 0; i < points.length && pick < 0; i++) {
      if (states[i] !== SPAWN_STATE.OPEN || spawnSide(world.map, points[i] as SpawnPoint) !== side) continue;
      roll -= pointWeight(world, i);
      if (roll < 0) pick = i;
    }
    w.spawnHeldSinceTick = -1;
    remember(world, pick);
    return pick;
  }
  if (w.spawnHeldSinceTick < 0) w.spawnHeldSinceTick = world.tick;
  if (world.tick - w.spawnHeldSinceTick < ticksFor(world.balance.waves.spawnPick.allNearMaxWaitS)) return -1;
  // Held long enough: the NEAR point farthest from the living players. Review L1: never a BLOCKED or
  // CLOSED one (a zombie inside a building or at a shut spawn); with none, keep holding (queue kept).
  const pick = farthest(points.length, SPAWN_STATE.NEAR);
  if (pick < 0) return -1;
  remember(world, pick);
  return pick;
}
