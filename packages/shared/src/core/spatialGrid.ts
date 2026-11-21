import type { DistrictBounds } from "../map/placeholderMap";

/**
 * Uniform spatial hash grid, rebuilt every tick by counting sort into pre-allocated arrays
 * (no Map, no arrays of arrays). Items are ids with positions read from caller-owned arrays.
 */
export interface SpatialGrid {
  readonly cellM: number;
  readonly cols: number;
  readonly rows: number;
  /** cellStart[c] .. cellStart[c+1] index into `items` for cell c. */
  readonly cellStart: Int32Array;
  readonly items: Int32Array;
  /** Cell of each id, written during rebuild. */
  readonly cellOf: Int32Array;
  readonly cursor: Int32Array;
}

export function createSpatialGrid(map: DistrictBounds, cellM: number, capacity: number): SpatialGrid {
  const cols = Math.max(1, Math.ceil(map.widthM / cellM));
  const rows = Math.max(1, Math.ceil(map.heightM / cellM));
  return {
    cellM,
    cols,
    rows,
    cellStart: new Int32Array(cols * rows + 1),
    items: new Int32Array(capacity),
    cellOf: new Int32Array(capacity),
    cursor: new Int32Array(cols * rows),
  };
}

function cellIndex(grid: SpatialGrid, x: number, y: number): number {
  const cx = Math.min(grid.cols - 1, Math.max(0, Math.floor(x / grid.cellM)));
  const cy = Math.min(grid.rows - 1, Math.max(0, Math.floor(y / grid.cellM)));
  return cy * grid.cols + cx;
}

/** Re-buckets `count` ids (from `ids`) by their position. */
export function rebuildGrid(
  grid: SpatialGrid,
  ids: Int32Array,
  count: number,
  xs: Float32Array,
  ys: Float32Array,
): void {
  const { cellStart, cursor, items, cellOf } = grid;
  cellStart.fill(0);
  for (let i = 0; i < count; i++) {
    const id = ids[i] as number;
    const c = cellIndex(grid, xs[id] as number, ys[id] as number);
    cellOf[id] = c;
    cellStart[c + 1] = (cellStart[c + 1] as number) + 1;
  }
  for (let c = 0; c < grid.cols * grid.rows; c++) {
    cellStart[c + 1] = (cellStart[c + 1] as number) + (cellStart[c] as number);
    cursor[c] = cellStart[c] as number;
  }
  for (let i = 0; i < count; i++) {
    const id = ids[i] as number;
    const c = cellOf[id] as number;
    items[cursor[c] as number] = id;
    cursor[c] = (cursor[c] as number) + 1;
  }
}

/**
 * Writes into `out` the ids whose position is within `r` of (x, y) (center distance).
 * Returns how many were written (at most out.length).
 */
export function queryRadius(
  grid: SpatialGrid,
  xs: Float32Array,
  ys: Float32Array,
  x: number,
  y: number,
  r: number,
  out: Int32Array,
): number {
  const r2 = r * r;
  const minCx = Math.max(0, Math.floor((x - r) / grid.cellM));
  const maxCx = Math.min(grid.cols - 1, Math.floor((x + r) / grid.cellM));
  const minCy = Math.max(0, Math.floor((y - r) / grid.cellM));
  const maxCy = Math.min(grid.rows - 1, Math.floor((y + r) / grid.cellM));
  let n = 0;
  for (let cy = minCy; cy <= maxCy; cy++) {
    for (let cx = minCx; cx <= maxCx; cx++) {
      const c = cy * grid.cols + cx;
      const end = grid.cellStart[c + 1] as number;
      for (let k = grid.cellStart[c] as number; k < end; k++) {
        const id = grid.items[k] as number;
        const dx = (xs[id] as number) - x;
        const dy = (ys[id] as number) - y;
        if (dx * dx + dy * dy <= r2) {
          if (n >= out.length) return n;
          out[n++] = id;
        }
      }
    }
  }
  return n;
}
