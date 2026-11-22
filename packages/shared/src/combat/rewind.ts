import { GRID_CELL_M, ZOMBIE_HISTORY_TICKS, ZOMBIE_POOL_CAPACITY } from "../config/constants";
import { createSpatialGrid, rebuildGrid, type SpatialGrid } from "../core/spatialGrid";
import type { World } from "../core/world";
import type { DistrictBounds } from "../map/placeholderMap";
import type { PlayerInput } from "../net/input";
import type { PlayerState } from "../player/player";

/**
 * Story 2.12: lag-compensated (rewound) hit testing. The server keeps the zombie positions of the
 * last ZOMBIE_HISTORY_TICKS ticks; a player's shot, swing and touch aim assist are tested against
 * the positions of the tick the shooter drew (`PlayerInput.viewTick`), at most
 * `PlayerState.rewindMaxTicks` back. Only positions are rewound: damage, pushback and kills apply
 * to the present zombie (dead now: not hit; a reused slot: not hit). Buildings, players and
 * turret shots are never rewound. Solo never enables it (nothing is recorded).
 */

/** Positions of every zombie slot after each of the last rows ticks (row = tick % rows). */
export interface ZombieHistory {
  /** Recording on (server with lag compensation). False: nothing recorded, nothing rewound. */
  enabled: boolean;
  readonly rows: number;
  readonly capacity: number;
  /** [row × capacity + slot]. */
  readonly x: Float32Array;
  readonly y: Float32Array;
  readonly generation: Uint8Array;
  /** 1 if the slot held a live zombie at that row's tick. */
  readonly alive: Uint8Array;
  /** Tick label of each row (the `world.tick` after the step that wrote it), -1 = empty. */
  readonly tickOf: Int32Array;
}

/** A set of zombie positions (and a grid over them) that hit tests read instead of the live pool. */
export interface ZombieView {
  readonly x: Float32Array;
  readonly y: Float32Array;
  readonly grid: SpatialGrid;
}

/** Scratch for `rewoundView` (preallocated per World; not simulation state). */
export interface RewoundView extends ZombieView {
  readonly ids: Int32Array;
  count: number;
  /** Memo: the world tick and view time it was built for (NaN = none). */
  builtTick: number;
  builtAt: number;
}

export function createZombieHistory(capacity = ZOMBIE_POOL_CAPACITY, rows = ZOMBIE_HISTORY_TICKS): ZombieHistory {
  return {
    enabled: false,
    rows,
    capacity,
    x: new Float32Array(rows * capacity),
    y: new Float32Array(rows * capacity),
    generation: new Uint8Array(rows * capacity),
    alive: new Uint8Array(rows * capacity),
    tickOf: new Int32Array(rows).fill(-1),
  };
}

export function createRewoundView(map: DistrictBounds, capacity = ZOMBIE_POOL_CAPACITY): RewoundView {
  return {
    x: new Float32Array(capacity),
    y: new Float32Array(capacity),
    grid: createSpatialGrid(map, GRID_CELL_M, capacity),
    ids: new Int32Array(capacity),
    count: 0,
    builtTick: Number.NaN,
    builtAt: Number.NaN,
  };
}

/**
 * Records this tick's zombie positions (end of `step()`, after every system, so row T holds what
 * tick T's horde frame shows). A no-op unless enabled. Allocation-free.
 */
export function recordZombieHistory(world: World): void {
  const h = world.zombieHistory;
  if (!h.enabled) return;
  const z = world.zombies;
  const row = world.tick % h.rows;
  const base = row * h.capacity;
  h.x.set(z.x, base);
  h.y.set(z.y, base);
  h.generation.set(z.generation, base);
  const alive = h.alive;
  for (let id = 0; id < h.capacity; id++) alive[base + id] = (z.alivePos[id] as number) >= 0 ? 1 : 0;
  h.tickOf[row] = world.tick;
}

/** Turns recording on or off; turning it on starts from an empty history. */
export function setZombieHistoryEnabled(world: World, enabled: boolean): void {
  const h = world.zombieHistory;
  if (h.enabled === enabled) return;
  h.enabled = enabled;
  h.tickOf.fill(-1);
  world.rewoundView.builtTick = Number.NaN;
}

function rowOf(h: ZombieHistory, tick: number): number {
  const row = tick % h.rows;
  return h.tickOf[row] === tick ? row : -1;
}

/**
 * The rewind, in ticks, for a shot or swing fired with this input during the current step:
 * `world.tick − viewTick`, clamped to [0, p.rewindMaxTicks]. 0 offline, without a view tick, for a
 * view tick in the future, or when the history does not reach that far back (a fresh run).
 */
export function rewindTicksFor(world: World, p: PlayerState, input: PlayerInput): number {
  if (p.rewindMaxTicks <= 0 || !world.zombieHistory.enabled || !(input.viewTick >= 0)) return 0;
  const r = world.tick - input.viewTick;
  if (!(r > 0)) return 0;
  const rr = Math.min(r, p.rewindMaxTicks);
  return rowOf(world.zombieHistory, Math.floor(world.tick - rr)) >= 0 ? rr : 0;
}

/**
 * The zombies as they were at the (fractional) tick `at`, for hit tests during the current step:
 * every zombie alive now that was alive with the same generation at ⌊at⌋, at its position lerped
 * between rows ⌊at⌋ and ⌊at⌋ + 1 (from `world.tick` on, the live positions, which include this
 * tick's pushback). Returns null when `at` is now or later, or not covered by the history: then
 * the caller tests the live pool. Built into the World's preallocated scratch (memoised per tick).
 */
export function rewoundView(world: World, at: number): ZombieView | null {
  const h = world.zombieHistory;
  const now = world.tick;
  if (!h.enabled || !(at < now)) return null;
  const t0 = Math.floor(at);
  const r0 = rowOf(h, t0);
  if (r0 < 0) return null;
  const upperLive = t0 + 1 >= now;
  const r1 = upperLive ? -1 : rowOf(h, t0 + 1);
  if (!upperLive && r1 < 0) return null;
  const v = world.rewoundView;
  // Memo (several shots of one tick at the same time); not when the upper row is live (pushback moves it).
  if (!upperLive && v.builtTick === now && v.builtAt === at) return v;
  const f = at - t0;
  const z = world.zombies;
  const cap = h.capacity;
  const b0 = r0 * cap;
  const b1 = r1 * cap;
  let n = 0;
  for (let i = 0; i < z.aliveCount; i++) {
    const id = z.aliveIds[i] as number;
    const gen = z.generation[id] as number;
    if (h.alive[b0 + id] !== 1 || h.generation[b0 + id] !== gen) continue; // not there yet at `at`
    const x0 = h.x[b0 + id] as number;
    const y0 = h.y[b0 + id] as number;
    let x1 = x0;
    let y1 = y0;
    if (upperLive) {
      x1 = z.x[id] as number;
      y1 = z.y[id] as number;
    } else if (h.alive[b1 + id] === 1 && h.generation[b1 + id] === gen) {
      x1 = h.x[b1 + id] as number;
      y1 = h.y[b1 + id] as number;
    }
    v.x[id] = x0 + (x1 - x0) * f;
    v.y[id] = y0 + (y1 - y0) * f;
    v.ids[n++] = id;
  }
  v.count = n;
  rebuildGrid(v.grid, v.ids, n, v.x, v.y);
  v.builtTick = upperLive ? Number.NaN : now;
  v.builtAt = at;
  return v;
}

const hashBytes = (h: number, a: ArrayBufferView): number => {
  const b = new Uint8Array(a.buffer, a.byteOffset, a.byteLength);
  for (let i = 0; i < b.length; i++) {
    h ^= b[i] as number;
    h = Math.imul(h, 0x01000193);
  }
  return h >>> 0;
};

/** `snapshotWorld` view: the switch, the row labels and a hash of the rows (evolved state, not synced). */
export function snapshotZombieHistory(h: ZombieHistory) {
  let hash = 0x811c9dc5;
  hash = hashBytes(hash, h.x);
  hash = hashBytes(hash, h.y);
  hash = hashBytes(hash, h.generation);
  hash = hashBytes(hash, h.alive);
  return { enabled: h.enabled, tickOf: Array.from(h.tickOf), hash };
}
