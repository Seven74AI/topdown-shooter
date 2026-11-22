/** Most zombies one projectile can hit (Hunting Rifle pierces 5). */
export const MAX_PIERCE = 5;

/**
 * Struct-of-arrays projectile storage. Projectiles are simulated on the server; clients draw them
 * cosmetically (Epic 2). Freed slots are reused at once (projectiles are not streamed).
 */
export interface ProjectilePool {
  readonly capacity: number;
  readonly x: Float32Array;
  readonly y: Float32Array;
  readonly prevX: Float32Array;
  readonly prevY: Float32Array;
  readonly dirX: Float32Array;
  readonly dirY: Float32Array;
  readonly speedMps: Float32Array;
  readonly rangeLeftM: Float32Array;
  /** Extra distance swept on the first step only (Story 2.7 shot advance; 0 offline), then 0. */
  readonly advanceM: Float32Array;
  readonly damage: Float32Array;
  readonly pierceLeft: Uint8Array;
  /** Index into weaponIds(balance). */
  readonly weapon: Uint8Array;
  /**
   * Story 3.6: id of the building (turret) that fired it; 0 = a player's shot. A building shot's
   * `weapon` is the index of its building type (`buildingTypeIds`) and its pushback is `pushbackM`.
   */
  readonly building: Int32Array;
  readonly pushbackM: Float32Array;
  /** Player id of the shooter, or of the turret's owner (references, preallocated). */
  readonly owner: (string | null)[];
  /** Zombie ids already hit by each projectile (MAX_PIERCE per projectile). */
  readonly hitIds: Int32Array;
  readonly hitCount: Uint8Array;
  readonly aliveIds: Int32Array;
  readonly alivePos: Int32Array;
  aliveCount: number;
  readonly freeIds: Int32Array;
  freeCount: number;
}

export function createProjectilePool(capacity: number): ProjectilePool {
  const freeIds = new Int32Array(capacity);
  for (let i = 0; i < capacity; i++) freeIds[i] = capacity - 1 - i; // pop gives 0, 1, 2…
  return {
    capacity,
    x: new Float32Array(capacity),
    y: new Float32Array(capacity),
    prevX: new Float32Array(capacity),
    prevY: new Float32Array(capacity),
    dirX: new Float32Array(capacity),
    dirY: new Float32Array(capacity),
    speedMps: new Float32Array(capacity),
    rangeLeftM: new Float32Array(capacity),
    advanceM: new Float32Array(capacity),
    damage: new Float32Array(capacity),
    pierceLeft: new Uint8Array(capacity),
    weapon: new Uint8Array(capacity),
    building: new Int32Array(capacity),
    pushbackM: new Float32Array(capacity),
    owner: new Array<string | null>(capacity).fill(null),
    hitIds: new Int32Array(capacity * MAX_PIERCE),
    hitCount: new Uint8Array(capacity),
    aliveIds: new Int32Array(capacity),
    alivePos: new Int32Array(capacity).fill(-1),
    aliveCount: 0,
    freeIds,
    freeCount: capacity,
  };
}

export interface ProjectileSpawn {
  x: number;
  y: number;
  dirX: number;
  dirY: number;
  speedMps: number;
  rangeM: number;
  damage: number;
  pierce: number;
  weaponIndex: number;
  owner: string | null;
  /** Story 3.6: the firing building's id (absent / 0: a player's shot) and its hit pushback. */
  building?: number;
  pushbackM?: number;
  /** Shot advance in metres (`projectileSpeedMps × shotAdvanceS`; 0 offline and for cosmetic shots). */
  advanceM: number;
}

/** Returns the projectile id, or -1 if the pool is full. */
export function spawnProjectile(pool: ProjectilePool, s: ProjectileSpawn): number {
  if (pool.freeCount === 0) return -1;
  const id = pool.freeIds[--pool.freeCount] as number;
  pool.x[id] = s.x;
  pool.y[id] = s.y;
  pool.prevX[id] = s.x;
  pool.prevY[id] = s.y;
  pool.dirX[id] = s.dirX;
  pool.dirY[id] = s.dirY;
  pool.speedMps[id] = s.speedMps;
  pool.rangeLeftM[id] = s.rangeM;
  pool.advanceM[id] = s.advanceM;
  pool.damage[id] = s.damage;
  pool.pierceLeft[id] = Math.min(s.pierce, MAX_PIERCE);
  pool.weapon[id] = s.weaponIndex;
  pool.building[id] = s.building ?? 0;
  pool.pushbackM[id] = s.pushbackM ?? 0;
  pool.owner[id] = s.owner;
  pool.hitCount[id] = 0;
  pool.alivePos[id] = pool.aliveCount;
  pool.aliveIds[pool.aliveCount++] = id;
  return id;
}

export function freeProjectile(pool: ProjectilePool, id: number): void {
  const pos = pool.alivePos[id] as number;
  if (pos < 0) return;
  const last = pool.aliveIds[pool.aliveCount - 1] as number;
  pool.aliveIds[pos] = last;
  pool.alivePos[last] = pos;
  pool.aliveCount--;
  pool.alivePos[id] = -1;
  pool.owner[id] = null;
  pool.freeIds[pool.freeCount++] = id;
}

export function projectileHasHit(pool: ProjectilePool, id: number, zombieId: number): boolean {
  const base = id * MAX_PIERCE;
  for (let k = 0; k < (pool.hitCount[id] as number); k++) if (pool.hitIds[base + k] === zombieId) return true;
  return false;
}

export function recordProjectileHit(pool: ProjectilePool, id: number, zombieId: number): void {
  const n = pool.hitCount[id] as number;
  if (n >= MAX_PIERCE) return;
  pool.hitIds[id * MAX_PIERCE + n] = zombieId;
  pool.hitCount[id] = n + 1;
}
