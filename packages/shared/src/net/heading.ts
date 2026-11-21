/**
 * A facing direction in one byte (Story 2.4; the horde stream of Story 2.5 uses it too).
 * 0 = +x, increasing toward +y (clockwise on screen, since +y is down); 256 steps per turn.
 */
const STEPS = 256;
const TWO_PI = Math.PI * 2;

/** Direction (x, y) → 0–255. A zero vector gives 0. */
export function quantizeHeading(x: number, y: number): number {
  if (x === 0 && y === 0) return 0;
  return Math.round((Math.atan2(y, x) / TWO_PI) * STEPS) & 0xff;
}

/** Heading (0–255, fractions allowed) → angle in radians in [0, 2π). */
export function headingToRad(h: number): number {
  return ((((h % STEPS) + STEPS) % STEPS) / STEPS) * TWO_PI;
}

/**
 * Interpolates two headings along the shorter way round (Story 2.4 snapshots). Returns a
 * fractional heading in [0, 256).
 */
export function lerpHeading(a: number, b: number, t: number): number {
  let d = (b - a) % STEPS;
  if (d > STEPS / 2) d -= STEPS;
  else if (d < -STEPS / 2) d += STEPS;
  const h = a + d * t;
  return ((h % STEPS) + STEPS) % STEPS;
}
