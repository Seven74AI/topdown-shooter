import type { DistrictBounds, MapBox } from "./districtMap";

/**
 * Story 4.1: the map's collision grid: per `cellM` cell (row-major, `cols = ceil(widthM / cellM)`),
 * 1 when a collision box covers it. Boxes lie on the lattice, so a cell is covered whole or not at
 * all. Built once per World for the nav grid (static data; never per tick).
 */
export function mapCollisionCells(map: DistrictBounds & { readonly solids?: readonly MapBox[] }, cellM: number): Uint8Array {
  const cols = Math.max(1, Math.ceil(map.widthM / cellM));
  const rows = Math.max(1, Math.ceil(map.heightM / cellM));
  const cells = new Uint8Array(cols * rows);
  for (const b of map.solids ?? []) {
    const x0 = Math.max(0, Math.floor(b.minX / cellM));
    const x1 = Math.min(cols - 1, Math.ceil(b.maxX / cellM) - 1);
    const y0 = Math.max(0, Math.floor(b.minY / cellM));
    const y1 = Math.min(rows - 1, Math.ceil(b.maxY / cellM) - 1);
    for (let cy = y0; cy <= y1; cy++) for (let cx = x0; cx <= x1; cx++) cells[cy * cols + cx] = 1;
  }
  return cells;
}
