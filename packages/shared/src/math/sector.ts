import { segmentCircleT } from "./sweep";

/**
 * Does the circle (c, r) overlap the sector with origin o, unit direction d, reach `reachM` and
 * half-angle θ (passed as cos θ and sin θ, computed once per swing)? Exact test (Story 1.9):
 * 1. reach is measured to the circle's edge: |c − o| ≤ reach + r;
 * 2. and either the circle contains o, the center lies within ±θ of d, or the circle touches one of
 *    the two edge segments (o → o + reach · rotate(d, ±θ)).
 * No trigonometry and no allocation: called once per candidate zombie.
 */
export function circleOverlapsSector(
  cx: number,
  cy: number,
  r: number,
  ox: number,
  oy: number,
  dirX: number,
  dirY: number,
  reachM: number,
  halfArcCos: number,
  halfArcSin: number,
): boolean {
  const vx = cx - ox;
  const vy = cy - oy;
  const d2 = vx * vx + vy * vy;
  const reach = reachM + r;
  if (d2 > reach * reach) return false;
  if (d2 <= r * r) return true; // the circle contains the origin
  if (vx * dirX + vy * dirY >= Math.sqrt(d2) * halfArcCos) return true; // center inside the angle
  // Edge directions: d rotated by +θ and −θ.
  const ax = dirX * halfArcCos - dirY * halfArcSin;
  const ay = dirX * halfArcSin + dirY * halfArcCos;
  const bx = dirX * halfArcCos + dirY * halfArcSin;
  const by = dirY * halfArcCos - dirX * halfArcSin;
  return (
    segmentCircleT(ox, oy, ox + ax * reachM, oy + ay * reachM, cx, cy, r) >= 0 ||
    segmentCircleT(ox, oy, ox + bx * reachM, oy + by * reachM, cx, cy, r) >= 0
  );
}
