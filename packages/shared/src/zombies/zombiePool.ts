import type { World } from "../core/world";
import { ZOMBIE_SLOT_HOLD_TICKS } from "../config/constants";
import { ZOMBIE_STATE, ZOMBIE_TYPES, zombieTypeIndex, type ZombieTypeId } from "./zombieTypes";

/**
 * Struct-of-arrays zombie storage (architecture › Entity Patterns). Pre-allocated: spawning and
 * killing never allocate. Freed slots wait ZOMBIE_SLOT_HOLD_TICKS before reuse and bump a
 * generation counter, so a new zombie is never mistaken for a dead one (Story 2.5).
 */
export interface ZombiePool {
  readonly capacity: number;
  readonly x: Float32Array;
  readonly y: Float32Array;
  readonly prevX: Float32Array;
  readonly prevY: Float32Array;
  readonly hp: Float32Array;
  /** Ticks until this zombie can hit again (timers count ticks, architecture › Networking). */
  readonly attackCooldownTicks: Uint16Array;
  /** Index into ZOMBIE_TYPES. */
  readonly type: Uint8Array;
  /** ZOMBIE_STATE value; FREE when the slot is not in use. */
  readonly state: Uint8Array;
  /** 1 if the zombie belongs to the current wave's count (stampede/boss adds won't, later). */
  readonly waveZombie: Uint8Array;
  /** Incremented each time the slot is reused (wraps at 256). */
  readonly generation: Uint8Array;
  /**
   * Facing (`quantizeHeading`, 0–255) streamed by the server (Story 2.5). Only the client mirror
   * writes it; the simulation never reads or writes it, and `snapshotWorld` ignores it.
   */
  readonly heading: Uint8Array;
  /** Dense list of alive ids (iteration order); `aliveCount` entries are valid. */
  readonly aliveIds: Int32Array;
  /** Position of each alive id inside `aliveIds` (for O(1) swap-remove). */
  readonly alivePos: Int32Array;
  aliveCount: number;
  /** Slots never used yet: [nextUnused, capacity). */
  nextUnused: number;
  /** FIFO ring of freed slots with the tick they were freed (oldest at the head). */
  readonly freedIds: Int32Array;
  readonly freedAtTick: Int32Array;
  freedHead: number;
  freedCount: number;
  /** Story 4.8 review L4: ticks spent inside a fire since the last fire hit (the burn clock; 0 on spawn). */
  readonly fireTicks: Uint16Array;
  /** Story 5.9: ticks spent on spike traps since the last spike hit (the per-body spike clock; 0 on spawn). */
  readonly trapTicks: Uint16Array;
  /** Story 5.9: this tick's trap slow in % (written by `updateTraps` before the zombies move; 0 off traps). */
  readonly slowPct: Uint8Array;
  /**
   * Story 5.3: the last `KNOCK_MEMORY` shot ids (`ProjectilePool.shotId`) that knocked this zombie
   * back, a ring per slot at `[id × KNOCK_MEMORY, …)` written at `knockHead[id]` (once per shot, F5;
   * review M1: several players' shots can be in flight at once, so one remembered id is not enough).
   * All 0 on spawn.
   */
  readonly knockShot: Uint32Array;
  readonly knockHead: Uint8Array;
  /** Scratch velocities for the AI (computed for all zombies first, then applied). */
  readonly vx: Float32Array;
  readonly vy: Float32Array;
}

/**
 * Story 5.3 review M1: knocking shots remembered per zombie. A knockback shot's pellets live ≤ 2
 * ticks and one player fires at most one such shot at a time, so at most one shot per player (4)
 * can still be in flight when another hits: 4 ids always cover them.
 */
export const KNOCK_MEMORY = 4;

/** Story 5.3: shot `shotId` already knocked zombie `id` back. */
export function knockedBy(pool: ZombiePool, id: number, shotId: number): boolean {
  const base = id * KNOCK_MEMORY;
  for (let k = 0; k < KNOCK_MEMORY; k++) if (pool.knockShot[base + k] === shotId) return true;
  return false;
}

/** Story 5.3: remembers that shot `shotId` knocked zombie `id` back (the oldest of the ring is forgotten). */
export function rememberKnock(pool: ZombiePool, id: number, shotId: number): void {
  const h = pool.knockHead[id] as number;
  pool.knockShot[id * KNOCK_MEMORY + h] = shotId;
  pool.knockHead[id] = (h + 1) % KNOCK_MEMORY;
}

export function createZombiePool(capacity: number): ZombiePool {
  return {
    capacity,
    x: new Float32Array(capacity),
    y: new Float32Array(capacity),
    prevX: new Float32Array(capacity),
    prevY: new Float32Array(capacity),
    hp: new Float32Array(capacity),
    attackCooldownTicks: new Uint16Array(capacity),
    fireTicks: new Uint16Array(capacity),
    trapTicks: new Uint16Array(capacity),
    slowPct: new Uint8Array(capacity),
    knockShot: new Uint32Array(capacity * KNOCK_MEMORY), // Story 5.3
    knockHead: new Uint8Array(capacity),
    type: new Uint8Array(capacity),
    state: new Uint8Array(capacity),
    generation: new Uint8Array(capacity),
    heading: new Uint8Array(capacity),
    waveZombie: new Uint8Array(capacity),
    aliveIds: new Int32Array(capacity),
    alivePos: new Int32Array(capacity).fill(-1),
    aliveCount: 0,
    nextUnused: 0,
    freedIds: new Int32Array(capacity),
    freedAtTick: new Int32Array(capacity),
    freedHead: 0,
    freedCount: 0,
    vx: new Float32Array(capacity),
    vy: new Float32Array(capacity),
  };
}

function takeSlot(pool: ZombiePool, tick: number): number {
  if (pool.freedCount > 0) {
    const head = pool.freedHead;
    if (tick - (pool.freedAtTick[head] as number) >= ZOMBIE_SLOT_HOLD_TICKS) {
      const id = pool.freedIds[head] as number;
      pool.freedHead = (head + 1) % pool.capacity;
      pool.freedCount--;
      pool.generation[id] = ((pool.generation[id] as number) + 1) & 0xff;
      return id;
    }
  }
  if (pool.nextUnused < pool.capacity) return pool.nextUnused++;
  return -1; // every slot is alive or still held
}

/** Spawns a zombie at (x, y) with stats from balance. Returns its pool id, or -1 if the pool is full. */
export function spawnZombie(world: World, type: ZombieTypeId, x: number, y: number, waveZombie = false): number {
  const pool = world.zombies;
  const id = takeSlot(pool, world.tick);
  if (id < 0) return -1;
  const stats = world.balance.zombies.types[type];
  if (!stats) throw new Error(`spawnZombie: no balance for zombie type ${type}`);
  pool.x[id] = x;
  pool.y[id] = y;
  pool.prevX[id] = x;
  pool.prevY[id] = y;
  pool.hp[id] = stats.hp;
  pool.attackCooldownTicks[id] = 0;
  pool.fireTicks[id] = 0; // Story 4.8: a reused slot starts with a cold burn clock
  pool.trapTicks[id] = 0; // Story 5.9: and a cold spike clock, at full speed
  pool.slowPct[id] = 0;
  pool.knockShot.fill(0, id * KNOCK_MEMORY, id * KNOCK_MEMORY + KNOCK_MEMORY); // Story 5.3: no shot has knocked a new zombie yet
  pool.knockHead[id] = 0;
  pool.type[id] = zombieTypeIndex(type);
  pool.state[id] = ZOMBIE_STATE.CHASE;
  pool.waveZombie[id] = waveZombie ? 1 : 0;
  pool.vx[id] = 0;
  pool.vy[id] = 0;
  world.economy.damagerCount[id] = 0; // Story 3.2: a reused slot starts with no assist credit
  pool.alivePos[id] = pool.aliveCount;
  pool.aliveIds[pool.aliveCount++] = id;
  return id;
}

export function isZombieAlive(pool: ZombiePool, id: number): boolean {
  return id >= 0 && id < pool.capacity && (pool.alivePos[id] as number) >= 0;
}

/**
 * Kills a zombie, frees its slot (held before reuse) and emits `zombie.killed`. Story 3.6:
 * `buildingId` > 0 = killed by that building (a turret; `killerId` is its owner).
 */
export function killZombie(world: World, id: number, killerId: string | null, weapon: string, buildingId = 0): void {
  const pool = world.zombies;
  if (!isZombieAlive(pool, id)) return;
  const pos = pool.alivePos[id] as number;
  const last = pool.aliveIds[pool.aliveCount - 1] as number;
  pool.aliveIds[pos] = last;
  pool.alivePos[last] = pos;
  pool.aliveCount--;
  pool.alivePos[id] = -1;
  pool.state[id] = ZOMBIE_STATE.FREE;
  const tail = (pool.freedHead + pool.freedCount) % pool.capacity;
  pool.freedIds[tail] = id;
  pool.freedAtTick[tail] = world.tick;
  pool.freedCount++;
  const x = pool.x[id] as number;
  const y = pool.y[id] as number;
  if (buildingId > 0) world.events.emit({ type: "zombie.killed", zombieId: id, killerId, x, y, weapon, buildingId });
  else world.events.emit({ type: "zombie.killed", zombieId: id, killerId, x, y, weapon });
}

/** Balance id of a zombie's type. */
export function zombieTypeOf(pool: ZombiePool, id: number): ZombieTypeId {
  return ZOMBIE_TYPES[pool.type[id] as number] as ZombieTypeId;
}
