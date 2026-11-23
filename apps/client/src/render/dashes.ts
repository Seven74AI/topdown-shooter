/** The part of a Phaser Graphics a dashed circle needs (so the maths is testable without Phaser). */
export interface LineSink {
  lineBetween(x0: number, y0: number, x1: number, y1: number): unknown;
}

/**
 * Story 5.17: a dashed circle as straight dashes, about `dashM` long with equal gaps (an even count,
 * at least 8), in the sink's current line style. No allocation.
 */
export function dashedCircle(g: LineSink, cx: number, cy: number, r: number, dashM: number): number {
  const n = Math.max(8, 2 * Math.round((2 * Math.PI * r) / (2 * dashM)));
  const step = (2 * Math.PI) / n;
  let dashes = 0;
  for (let i = 0; i < n; i += 2) {
    const a0 = i * step;
    const a1 = a0 + step;
    g.lineBetween(cx + Math.cos(a0) * r, cy + Math.sin(a0) * r, cx + Math.cos(a1) * r, cy + Math.sin(a1) * r);
    dashes++;
  }
  return dashes;
}
