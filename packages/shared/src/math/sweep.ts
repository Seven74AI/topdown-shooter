/**
 * First parameter t in [0, 1] where the segment a→b touches the circle (c, r), or -1 if it never does.
 * Returns 0 when a is already inside the circle. Swept test: a fast projectile can't tunnel through
 * a zombie between ticks (architecture › Networking).
 */
export function segmentCircleT(ax: number, ay: number, bx: number, by: number, cx: number, cy: number, r: number): number {
  const fx = ax - cx;
  const fy = ay - cy;
  const c = fx * fx + fy * fy - r * r;
  if (c <= 0) return 0; // starts inside
  const dx = bx - ax;
  const dy = by - ay;
  const a = dx * dx + dy * dy;
  if (a === 0) return -1;
  const b = 2 * (fx * dx + fy * dy);
  const disc = b * b - 4 * a * c;
  if (disc < 0) return -1;
  const t = (-b - Math.sqrt(disc)) / (2 * a);
  return t >= 0 && t <= 1 ? t : -1;
}
