/**
 * Story 5.6: Spitter globs in flight (struct-of-arrays, pre-allocated to `spitCaps.maxLiveSpits`,
 * like `combat/projectilePool.ts`). Dense: live spits are slots [0, count); freeing swaps the last
 * one into the hole (order stays deterministic). Never allocates after creation.
 */
export interface SpitPool {
  readonly capacity: number;
  readonly x: Float64Array;
  readonly y: Float64Array;
  readonly dirX: Float64Array;
  readonly dirY: Float64Array;
  readonly rangeLeftM: Float64Array;
  readonly speedMps: Float64Array;
  readonly radiusM: Float64Array;
  readonly damage: Float64Array;
  /** The puddle this spit leaves (its type's `puddleRadiusM`, `puddleS`). */
  readonly puddleRadiusM: Float64Array;
  readonly puddleTicks: Uint16Array;
  /** The Spitter's pool slot (it may be dead by now; only for logs). */
  readonly owner: Int16Array;
  /** u16 id (wraps), also the id of the puddle it leaves (`acid.splashed.puddleId`). */
  readonly id: Uint16Array;
  count: number;
  /** Next id to hand out (wraps at 65,536). */
  nextId: number;
}

export function createSpitPool(capacity: number): SpitPool {
  return {
    capacity,
    x: new Float64Array(capacity),
    y: new Float64Array(capacity),
    dirX: new Float64Array(capacity),
    dirY: new Float64Array(capacity),
    rangeLeftM: new Float64Array(capacity),
    speedMps: new Float64Array(capacity),
    radiusM: new Float64Array(capacity),
    damage: new Float64Array(capacity),
    puddleRadiusM: new Float64Array(capacity),
    puddleTicks: new Uint16Array(capacity),
    owner: new Int16Array(capacity),
    id: new Uint16Array(capacity),
    count: 0,
    nextId: 1,
  };
}

/** Removes the spit in dense slot `i` (the last one moves into it). */
export function freeSpit(pool: SpitPool, i: number): void {
  const last = pool.count - 1;
  if (i < 0 || i > last) return;
  if (i !== last) {
    pool.x[i] = pool.x[last] as number;
    pool.y[i] = pool.y[last] as number;
    pool.dirX[i] = pool.dirX[last] as number;
    pool.dirY[i] = pool.dirY[last] as number;
    pool.rangeLeftM[i] = pool.rangeLeftM[last] as number;
    pool.speedMps[i] = pool.speedMps[last] as number;
    pool.radiusM[i] = pool.radiusM[last] as number;
    pool.damage[i] = pool.damage[last] as number;
    pool.puddleRadiusM[i] = pool.puddleRadiusM[last] as number;
    pool.puddleTicks[i] = pool.puddleTicks[last] as number;
    pool.owner[i] = pool.owner[last] as number;
    pool.id[i] = pool.id[last] as number;
  }
  pool.count--;
}

export function clearSpits(pool: SpitPool): void {
  pool.count = 0;
}
