import type { World } from "../core/world";
import type { PlayerState } from "../player/player";
import type { ExplodesStats } from "../config/balanceSchema";
import { ticksFor } from "../core/time";
import { createExplosionSpec, explode } from "../combat/explosion";
import { shotLineClear } from "../combat/cover";
import { slowPlayer } from "../player/slow";
import { AREA_KIND, clearAreas, spawnArea, type AreaPool } from "../hazards/areaPool";
import { ZOMBIE_STATE, ZOMBIE_TYPES } from "./zombieTypes";
import { streamSeed } from "../core/seedStreams";

/**
 * Story 5.8: Bloaters (FR24). Their rules, in one place:
 *
 * - **Swell (FR-A, `startSwell` / `tickSwell`, from `zombieAi.ts` pass 4):** a Bloater whose body
 *   touches a standing player (or the building blocking its path) stops and swells for
 *   `explodes.swellS` (state SWELL, its own clock `swellTicks`); it never bites. The swell always
 *   ends in a blast where it stands, exactly `swellS` after it started (D6: not queued).
 * - **Death (FR-B, `onZombieKilled`, the one hook in `killZombie`):** a Bloater that dies from any
 *   cause bursts where it died. Its blast is queued (`world.blasts`, a ring) and runs at the start
 *   of the next zombies system (`processBlasts`): this tick's for a Bloater shot, stabbed, burnt or
 *   blown up by a mine before it; the NEXT tick's for one killed by another blast (FR-E: one link
 *   per tick, at most `blasts.maxBlastsPerTick` per tick, oldest first). Removal without dying (dev
 *   cheats `cheat`, decay crushing `decay`) never bursts. A full queue runs its oldest blast at once
 *   (never dropped).
 * - **The blast (FR-C/D):** the shared `explode()` (5.9/5.5): players whose body overlaps the circle
 *   with a clear shot line take `playerDamage` (never halved: D1), zombies `zombieDamage` and a
 *   `pushM` push, wall buildings `buildingDamage` (D3). Its kills credit whoever killed the Bloater
 *   (D2: passed down a chain; a turret's owner at the building share; a swell or a fire: nobody).
 * - **Gas (FR-F, `updateGas`):** every blast leaves a cloud (`world.gas`, `blasts.maxGasClouds`; the
 *   oldest is replaced) of `gasRadiusM` for `gasS`. A standing player whose body overlaps a cloud
 *   with a clear shot line to its centre is slowed `gasSlowPct` on every tick inside (the 3.9 slow:
 *   refreshed, never stacked), lingering `gasLingerS`. Zombies are not slowed.
 * - `clearBlasts` (every build start): no queued blasts, no clouds.
 */

/** Weapon names of the Bloater's own kills and its swell. */
export const BLOATER_BLAST_WEAPON = "bloater_blast";
export const BLOATER_SWELL_WEAPON = "bloater_swell";

/** Removals that are not deaths (FR-B: no blast): dev cheats and the decay engine's crushing. */
const NO_BURST_WEAPONS: readonly string[] = ["cheat", "decay"];

/** Story 5.8: queued Bloater blasts (FIFO ring, preallocated to `blasts.queueCapacity`). */
export interface BlastQueue {
  readonly capacity: number;
  readonly x: Float64Array;
  readonly y: Float64Array;
  /** The type index of the Bloater (its `explodes` stats). */
  readonly type: Uint8Array;
  /** Who killed the Bloater (its blast's kills credit them; null: nobody). */
  readonly credit: (string | null)[];
  /** The turret that killed it (0: none): its blast's kills pay the owner the building share. */
  readonly creditBuilding: Int32Array;
  /** 1: killed by another blast (a chain link). */
  readonly chain: Uint8Array;
  head: number;
  count: number;
}

export function createBlastQueue(capacity: number): BlastQueue {
  return {
    capacity,
    x: new Float64Array(capacity),
    y: new Float64Array(capacity),
    type: new Uint8Array(capacity),
    credit: new Array<string | null>(capacity).fill(null),
    creditBuilding: new Int32Array(capacity),
    chain: new Uint8Array(capacity),
    head: 0,
    count: 0,
  };
}

/** Counters for tests, sims and liveness asserts (not simulation state; never snapshotted). */
export const bloaterStats = { swells: 0, blasts: 0, swellBlasts: 0, chainBlasts: 0, queued: 0, overflow: 0, maxQueued: 0, maxPerTick: 0, gasSlows: 0 };

/** Resets `bloaterStats` (tests). */
export function resetBloaterStats(): void {
  for (const k of Object.keys(bloaterStats) as (keyof typeof bloaterStats)[]) bloaterStats[k] = 0;
}

/** A test probe of every blast (centre, credit, chain), null in the game. */
export const blastTrace: { fn: ((x: number, y: number, credit: string | null, chain: boolean, tick: number) => void) | null } = { fn: null };

/** The `explodes` stats of a type index (undefined: it never explodes). */
export function explodesOf(world: Readonly<World>, typeIndex: number): Readonly<ExplodesStats> | undefined {
  const t = ZOMBIE_TYPES[typeIndex];
  return t === undefined ? undefined : world.balance.zombies.types[t]?.explodes;
}

/** True while a blast runs (its kills are chain links: queued for the next tick, FR-E). */
let inBlast = false;
/** Reused for every blast (no allocation). Story 5.5 merge: the shared spec API. */
const spec = createExplosionSpec();

/**
 * One blast at (x, y) with type `typeIndex`'s stats, credited to `credit` (and turret `building`),
 * then its gas cloud and the `bloater.burst` event. Kills inside it queue further blasts.
 */
function runBlast(world: World, typeIndex: number, x: number, y: number, credit: string | null, building: number, chain: boolean): void {
  const e = explodesOf(world, typeIndex);
  if (!e) return;
  bloaterStats.blasts++;
  if (chain) bloaterStats.chainBlasts++;
  blastTrace.fn?.(x, y, credit, chain, world.tick);
  spec.x = x;
  spec.y = y;
  spec.radiusM = e.blastRadiusM;
  spec.zombieDamage = e.zombieDamage;
  spec.playerDamage = e.playerDamage;
  spec.friendlyFire = false; // D1: the full playerDamage to everyone, even when a player popped it
  spec.buildingDamage = e.buildingDamage;
  spec.pushM = e.pushM;
  spec.kind = "bloater";
  spec.sourcePlayerId = credit; // D2: the kills credit whoever popped it
  spec.weapon = BLOATER_BLAST_WEAPON;
  spec.buildingId = building;
  spec.quiet = false;
  spec.grenadeId = 0;
  spec.announce = false; // its own `bloater.burst` is the visual
  const was = inBlast;
  inBlast = true;
  explode(world, spec);
  inBlast = was;
  spawnArea(world.gas, world.balance.zombies.blasts.maxGasClouds, AREA_KIND.GAS, 0, x, y, e.gasRadiusM, ticksFor(e.gasS), world.tick);
  world.events.emit({ type: "bloater.burst", x, y, chain });
}

/** Runs the oldest queued blast. */
function runOldest(world: World): void {
  const q = world.blasts;
  const i = q.head;
  q.head = (q.head + 1) % q.capacity;
  q.count--;
  const credit = q.credit[i] ?? null;
  q.credit[i] = null;
  runBlast(world, q.type[i] as number, q.x[i] as number, q.y[i] as number, credit, q.creditBuilding[i] as number, q.chain[i] === 1);
}

/**
 * The hook in `killZombie` (after the slot is freed and `zombie.killed` emitted): a Bloater's death
 * queues its blast at (x, y); the swell's end bursts at once (D6). Other types: nothing.
 */
export function onZombieKilled(world: World, id: number, x: number, y: number, killerId: string | null, buildingId: number, weapon: string): void {
  const pool = world.zombies;
  const typeIndex = pool.type[id] as number;
  if (!explodesOf(world, typeIndex)) return;
  pool.swellTicks[id] = 0;
  if (NO_BURST_WEAPONS.includes(weapon)) return;
  if (weapon === BLOATER_SWELL_WEAPON) {
    bloaterStats.swellBlasts++;
    runBlast(world, typeIndex, x, y, null, 0, false);
    return;
  }
  const q = world.blasts;
  if (q.capacity === 0) return;
  if (q.count >= q.capacity) {
    bloaterStats.overflow++;
    runOldest(world); // never drop a blast: the oldest goes off now
  }
  const i = (q.head + q.count) % q.capacity;
  q.x[i] = x;
  q.y[i] = y;
  q.type[i] = typeIndex;
  q.credit[i] = killerId;
  q.creditBuilding[i] = buildingId;
  q.chain[i] = inBlast ? 1 : 0;
  q.count++;
  bloaterStats.queued++;
  if (q.count > bloaterStats.maxQueued) bloaterStats.maxQueued = q.count;
}

/**
 * The start of the zombies system: runs the blasts queued before it (this tick's deaths in the
 * combat and buildings systems, last tick's chain links), oldest first, at most `maxBlastsPerTick`.
 * Blasts queued while these run (chain kills) wait for the next tick (FR-E).
 */
export function processBlasts(world: World): void {
  const q = world.blasts;
  if (q.count === 0) return;
  const n = Math.min(q.count, world.balance.zombies.blasts.maxBlastsPerTick);
  for (let k = 0; k < n; k++) runOldest(world);
  if (n > bloaterStats.maxPerTick) bloaterStats.maxPerTick = n;
}

/** Pass 4 of the AI: Bloater `id` touches a standing player (or its target building): it swells. */
export function startSwell(world: World, id: number, e: Readonly<ExplodesStats>): void {
  const pool = world.zombies;
  pool.state[id] = ZOMBIE_STATE.SWELL;
  pool.swellTicks[id] = Math.min(255, ticksFor(e.swellS));
  bloaterStats.swells++;
  world.events.emit({ type: "bloater.swell_started", zombieId: id, x: pool.x[id] as number, y: pool.y[id] as number });
}

/** Pass 4 of the AI, for a swelling Bloater (not on the tick its swell started): true when the fuse has burnt (it bursts now). */
export function tickSwell(world: World, id: number): boolean {
  const pool = world.zombies;
  const left = (pool.swellTicks[id] as number) - 1;
  pool.swellTicks[id] = Math.max(0, left);
  return left <= 0;
}

/** Module state of the gas pass (no closure per call). */
const gasPass = { world: null as World | null };

const gasPlayer = (p: PlayerState): void => {
  if (p.status !== "alive") return;
  const world = gasPass.world as World;
  const g = world.gas;
  for (let i = 0; i < g.capacity; i++) {
    if (g.active[i] !== 1) continue;
    const cx = g.x[i] as number;
    const cy = g.y[i] as number;
    const dx = p.x - cx;
    const dy = p.y - cy;
    const rr = (g.radiusM[i] as number) + p.radiusM;
    if (dx * dx + dy * dy >= rr * rr) continue;
    if (!shotLineClear(world, cx, cy, p.x, p.y)) continue; // FR-D: no gas through a car
    const e = gasStatsOf(world);
    if (!e) return;
    slowPlayer(p, e.gasSlowPct, ticksFor(e.gasLingerS));
    bloaterStats.gasSlows++;
    return; // clouds never stack: one slow per tick
  }
};

const gasStatsCache = new WeakMap<object, Readonly<ExplodesStats> | null>();

/** The gas numbers (every cloud is a Bloater's: the first type with `explodes`; cached per Balance). */
function gasStatsOf(world: Readonly<World>): Readonly<ExplodesStats> | undefined {
  let e = gasStatsCache.get(world.balance);
  if (e === undefined) {
    e = null;
    for (let i = 0; i < ZOMBIE_TYPES.length && !e; i++) e = explodesOf(world, i) ?? null;
    gasStatsCache.set(world.balance, e);
  }
  return e ?? undefined;
}

/**
 * The zombies slot, last: the gas slows standing players inside a cloud (with a line of sight to
 * its centre), then every cloud counts one tick down (a cloud of `gasS` slows on exactly that many
 * ticks: the client draws it that long).
 */
export function updateGas(world: World): void {
  const g = world.gas;
  if (g.count === 0) return;
  gasPass.world = world;
  world.players.forEach(gasPlayer);
  gasPass.world = null;
  for (let i = 0; i < g.capacity; i++) {
    if (g.active[i] !== 1) continue;
    const t = (g.ticksLeft[i] as number) - 1;
    g.ticksLeft[i] = t;
    if (t <= 0) {
      g.active[i] = 0;
      g.count--;
    }
  }
}

/** A circle (x, y, r) inside a gas cloud with a clear line to its centre (tests, the client's tint). */
export function circleInGas(world: Readonly<World>, x: number, y: number, r: number): boolean {
  const g: AreaPool = world.gas;
  for (let i = 0; i < g.capacity; i++) {
    if (g.active[i] !== 1) continue;
    const dx = x - (g.x[i] as number);
    const dy = y - (g.y[i] as number);
    const rr = (g.radiusM[i] as number) + r;
    if (dx * dx + dy * dy < rr * rr && shotLineClear(world, g.x[i] as number, g.y[i] as number, x, y)) return true;
  }
  return false;
}

/** Every build start (and a wipe): no queued blasts, no gas clouds (the 5.6 DD4 rule). */
export function clearBlasts(world: World): void {
  const q = world.blasts;
  for (let k = 0; k < q.capacity; k++) q.credit[k] = null;
  q.head = 0;
  q.count = 0;
  clearAreas(world.gas);
}

/** The Bloater's five looks (BL1 office worker, BL2 hazmat suit, BL3 sewer worker, BL4 tourist, BL5 gas sacs). */
export const BLOATER_LOOKS = 5;

/**
 * Decision round C (designer): each Bloater wears one of the five looks at random, from the named
 * stream `look:bloater:<netId>` of the run seed (as the Brute's `bruteLookIndex`): the same look on
 * every client, nothing in the simulation or on the wire. Presentation only (allocates a key: once
 * per Bloater, not per frame).
 */
export function bloaterLookIndex(runSeed: number, netId: number): number {
  return streamSeed(runSeed >>> 0, `look:bloater:${netId}`) % BLOATER_LOOKS;
}
