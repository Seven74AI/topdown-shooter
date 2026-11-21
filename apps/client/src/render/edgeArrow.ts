/**
 * Where to draw an edge arrow for a target outside the screen: the point on the screen rectangle
 * (inset by `margin`) along the line from the screen center to the target, and the arrow angle.
 * Returns false when the target is on screen (no arrow). Pure, shared by rush markers (1.7) and
 * teammate arrows (2.9).
 */
export function edgeArrow(
  sx: number,
  sy: number,
  w: number,
  h: number,
  margin: number,
  out: { x: number; y: number; angle: number },
): boolean {
  if (sx >= 0 && sx <= w && sy >= 0 && sy <= h) return false;
  const cx = w / 2;
  const cy = h / 2;
  const dx = sx - cx;
  const dy = sy - cy;
  const hw = Math.max(0, cx - margin); // a margin wider than half the screen collapses to the center
  const hh = Math.max(0, cy - margin);
  const scale = Math.min(dx !== 0 ? hw / Math.abs(dx) : Infinity, dy !== 0 ? hh / Math.abs(dy) : Infinity);
  out.x = cx + dx * scale;
  out.y = cy + dy * scale;
  out.angle = Math.atan2(dy, dx);
  return true;
}
