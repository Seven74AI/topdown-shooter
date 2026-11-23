/**
 * Story 5.6 (D5): a generic pool of round damage areas on the ground (centre, radius, ticks left,
 * kind). Spitter acid puddles use it first; 5.8's gas cloud and 5.12's molotov fire zone are meant
 * to reuse it with their own `kind`. Pre-allocated to the balance cap (brief lines 10, 12): spawning
 * never allocates; when the pool is full the oldest area (lowest `bornTick`, then lowest slot) ends.
 *
 * The per-body clock rule (4.8 D3) is the caller's: each body counts its own ticks inside any area
 * of a kind (areas of one kind never stack), see `zombies/spit.ts › updateAcid`.
 */

/**
 * Area kinds (append only; Story 5.6 adds acid; Story 5.8 the Bloater gas, in its own pool `world.gas`;
 * Story 5.12 the molotov fire, in its own pool `world.molotovs.areas`).
 */
export const AREA_KIND = { ACID: 1, GAS: 2, FIRE: 3 } as const;

export interface AreaPool {
  readonly capacity: number;
  readonly x: Float64Array;
  readonly y: Float64Array;
  readonly radiusM: Float64Array;
  readonly ticksLeft: Uint16Array;
  /** The area's id (for acid puddles: the id of the spit that made it). */
  readonly id: Uint16Array;
  readonly kind: Uint8Array;
  readonly bornTick: Int32Array;
  /** 1 while the slot holds a live area. */
  readonly active: Uint8Array;
  /** Live areas. */
  count: number;
}

export function createAreaPool(capacity: number): AreaPool {
  return {
    capacity,
    x: new Float64Array(capacity),
    y: new Float64Array(capacity),
    radiusM: new Float64Array(capacity),
    ticksLeft: new Uint16Array(capacity),
    id: new Uint16Array(capacity),
    kind: new Uint8Array(capacity),
    bornTick: new Int32Array(capacity),
    active: new Uint8Array(capacity),
    count: 0,
  };
}

/**
 * Starts an area. `limit` (≤ capacity) is the live cap from balance: at the cap the oldest area is
 * replaced (returns its slot; `replaced.id` says which id ended). Returns the slot used.
 */
export function spawnArea(pool: AreaPool, limit: number, kind: number, id: number, x: number, y: number, radiusM: number, ticks: number, tick: number): number {
  const cap = Math.min(limit, pool.capacity);
  let slot = -1;
  replaced.id = -1;
  if (pool.count < cap) {
    for (let i = 0; i < pool.capacity; i++) {
      if (pool.active[i] === 0) {
        slot = i;
        break;
      }
    }
  }
  if (slot < 0) {
    let oldest = Infinity;
    for (let i = 0; i < pool.capacity; i++) {
      if (pool.active[i] === 1 && (pool.bornTick[i] as number) < oldest) {
        oldest = pool.bornTick[i] as number;
        slot = i;
      }
    }
    if (slot < 0) return -1; // capacity 0
    replaced.id = pool.id[slot] as number;
    pool.count--;
  }
  pool.x[slot] = x;
  pool.y[slot] = y;
  pool.radiusM[slot] = radiusM;
  pool.ticksLeft[slot] = ticks;
  pool.id[slot] = id;
  pool.kind[slot] = kind;
  pool.bornTick[slot] = tick;
  pool.active[slot] = 1;
  pool.count++;
  return slot;
}

/** The id the last `spawnArea` replaced at the cap (-1: none). */
export const replaced = { id: -1 };

export function freeArea(pool: AreaPool, slot: number): void {
  if (pool.active[slot] !== 1) return;
  pool.active[slot] = 0;
  pool.count--;
}

export function clearAreas(pool: AreaPool): void {
  if (pool.count === 0) return;
  pool.active.fill(0);
  pool.count = 0;
}

/**
 * The circle (x, y, r) overlaps a live area of `kind` (strict: touching the edge from outside by
 * exactly 0 counts as inside only when the distance is below r + area radius — the 4.8 D16 ring rule).
 */
export function circleInArea(pool: AreaPool, kind: number, x: number, y: number, r: number): boolean {
  if (pool.count === 0) return false;
  for (let i = 0; i < pool.capacity; i++) {
    if (pool.active[i] !== 1 || pool.kind[i] !== kind) continue;
    const dx = x - (pool.x[i] as number);
    const dy = y - (pool.y[i] as number);
    const rr = r + (pool.radiusM[i] as number);
    if (dx * dx + dy * dy < rr * rr) return true;
  }
  return false;
}
