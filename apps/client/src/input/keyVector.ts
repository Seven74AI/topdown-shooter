export interface Vec2 {
  x: number;
  y: number;
}

/**
 * Move vector from held direction keys (+y is down). Opposite keys cancel; any non-zero result has
 * length 1 (keys have no dead zone and always mean full speed). Writes into `out` (no allocation).
 */
export function keyVector(up: boolean, down: boolean, left: boolean, right: boolean, out: Vec2): Vec2 {
  const x = (right ? 1 : 0) - (left ? 1 : 0);
  const y = (down ? 1 : 0) - (up ? 1 : 0);
  if (x !== 0 && y !== 0) {
    out.x = x * Math.SQRT1_2;
    out.y = y * Math.SQRT1_2;
  } else {
    out.x = x;
    out.y = y;
  }
  return out;
}
