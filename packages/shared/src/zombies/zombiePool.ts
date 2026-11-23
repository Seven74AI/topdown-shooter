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
  /** Story 5.3: the last shot id (`ProjectilePool.shotId`) that knocked this zombie back (once per shot, F5); 0 on spawn. */
  readonly knockShot: Uint32Array;
  /** Scratch velocities for the AI (computed for all zombies first, then applied). */
  readonly vx: Float32Array;
  readonly vy: Float32Array;
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
    knockShot: new Uint32Array(capacity), // Story 5.3
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
  pool.knockShot[id] = 0; // Story 5.3: no shot has knocked a new zombie yet
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
