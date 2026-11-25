/**
 * Photoreal group 3, step 3 (designer 2026-11-25: "the corners are open"; approved: corner pieces close them): where a
 * front line (a standing barricade at rot 0 / 2) and a side line (rot 1 / 3) meet at a right angle, their ends touch
 * an empty square of the build lattice diagonally. The view draws a corner piece there (a post and short stubs over
 * both ends). Visual only: the square stays walkable exactly as before. Pure (no Phaser).
 */

export interface WallLike {
  readonly type: string;
  readonly rot: number;
  readonly minX: number;
  readonly minY: number;
  readonly maxX: number;
  readonly maxY: number;
}

/** nw: the square is at the north-west of the corner (the front line runs east from it, the side line south). */
export type CornerKind = "nw" | "ne" | "sw" | "se";

export interface Corner {
  /** The square's centre (m). */
  x: number;
  y: number;
  kind: CornerKind;
  /** The front line's type (the corner wears its look). */
  type: string;
  /** The side piece's centre y (m): the corner must draw over it too (review M1: a side line running south). */
  sideY: number;
}

const EPS = 1e-6;
const eq = (a: number, b: number): boolean => Math.abs(a - b) < EPS;

/** Do the open boxes overlap (touching edges don't)? */
function overlaps(ax0: number, ay0: number, ax1: number, ay1: number, b: WallLike): boolean {
  return ax0 < b.maxX - EPS && b.minX < ax1 - EPS && ay0 < b.maxY - EPS && b.minY < ay1 - EPS;
}

/**
 * The corner squares of `walls` (every building, so an occupied square is skipped): each pair of a front piece and a
 * side piece of standing types whose ends meet diagonally at a free square as wide as the side piece and as deep as
 * the front piece. `standing` says which types stand. Writes into `out` (cleared) and returns it.
 */
export function findCorners(walls: readonly WallLike[], standing: (type: string) => boolean, out: Corner[]): Corner[] {
  out.length = 0;
  for (const f of walls) {
    if (!standing(f.type) || (f.rot & 1) === 1) continue;
    for (const s of walls) {
      if (!standing(s.type) || (s.rot & 1) === 0) continue;
      // the side piece's column, the front piece's row
      const west = eq(s.maxX, f.minX);
      const east = eq(s.minX, f.maxX);
      const south = eq(s.minY, f.maxY); // the side line runs south from the corner row
      const north = eq(s.maxY, f.minY); // the side line runs north (ends at the corner row)
      if (!(west || east) || !(south || north)) continue;
      const x0 = s.minX;
      const x1 = s.maxX;
      const y0 = f.minY;
      const y1 = f.maxY;
      if (walls.some((b) => overlaps(x0, y0, x1, y1, b))) continue;
      const kind: CornerKind = south ? (west ? "nw" : "ne") : west ? "sw" : "se";
      const x = (x0 + x1) / 2;
      const y = (y0 + y1) / 2;
      if (out.some((c) => eq(c.x, x) && eq(c.y, y))) continue;
      out.push({ x, y, kind, type: f.type, sideY: (s.minY + s.maxY) / 2 });
    }
  }
  return out;
}
