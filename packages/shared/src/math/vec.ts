/** Small vector helpers working on plain numbers (no allocation). */

export const DEG_TO_RAD = Math.PI / 180;

/** Length of (x, y). */
export const len = (x: number, y: number): number => Math.sqrt(x * x + y * y);

/** Rotates the unit vector (x, y) by `rad` and writes it into `out`. */
export function rotate(x: number, y: number, rad: number, out: { x: number; y: number }): void {
  const c = Math.cos(rad);
  const s = Math.sin(rad);
  out.x = x * c - y * s;
  out.y = x * s + y * c;
}
