import type { DistrictBounds, MapBox } from "./districtMap";

type BoxView = Pick<MapBox, "minX" | "minY" | "maxX" | "maxY">;

/**
 * Story 4.2: writes 1 into every `cellM` cell (row-major, `cols` × `rows`) a box covers, after
 * clearing `out`. Boxes lie on the lattice, so a cell is covered whole or not at all. Allocates nothing.
 */
export function fillCollisionCells(out: Uint8Array, cols: number, rows: number, cellM: number, boxes: readonly BoxView[]): void {
  out.fill(0);
  for (let i = 0; i < boxes.length; i++) {
    const b = boxes[i] as BoxView;
    const x0 = Math.max(0, Math.floor(b.minX / cellM));
    const x1 = Math.min(cols - 1, Math.ceil(b.maxX / cellM) - 1);
    const y0 = Math.max(0, Math.floor(b.minY / cellM));
    const y1 = Math.min(rows - 1, Math.ceil(b.maxY / cellM) - 1);
    for (let cy = y0; cy <= y1; cy++) for (let cx = x0; cx <= x1; cx++) out[cy * cols + cx] = 1;
  }
}

/**
 * Story 4.1: the map's collision grid: per `cellM` cell (row-major, `cols = ceil(widthM / cellM)`),
 * 1 when a collision box covers it. Built once per World for the nav grid (static data; never per
 * tick). Story 4.2: the World passes its obstacle list (map boxes + active cover) as `solids`.
 */
export function mapCollisionCells(map: DistrictBounds & { readonly solids?: readonly MapBox[] }, cellM: number): Uint8Array {
  const cols = Math.max(1, Math.ceil(map.widthM / cellM));
  const rows = Math.max(1, Math.ceil(map.heightM / cellM));
  const cells = new Uint8Array(cols * rows);
  fillCollisionCells(cells, cols, rows, cellM, map.solids ?? []);
  return cells;
}
