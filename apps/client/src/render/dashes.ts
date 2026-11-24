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

/** Story 5.17 review L4: zombie slot `id` is alive (its place in the alive list points back at it), so a dead zombie's culprit circle hides. */
export function zombieAlive(aliveIds: ArrayLike<number>, alivePos: ArrayLike<number>, aliveCount: number, id: number): boolean {
  const pos = alivePos[id];
  return pos !== undefined && pos >= 0 && pos < aliveCount && aliveIds[pos] === id;
}

/**
 * Story 5.18: a dashed rectangle (w × h, centred on the origin) as straight dashes about `dashM` long
 * with equal gaps along each edge, in the sink's current line style. Returns the dash count. No allocation.
 */
export function dashedRect(g: LineSink, w: number, h: number, dashM: number): number {
  const hx = w / 2;
  const hy = h / 2;
  return dashedLine(g, -hx, -hy, hx, -hy, dashM) + dashedLine(g, hx, -hy, hx, hy, dashM) + dashedLine(g, hx, hy, -hx, hy, dashM) + dashedLine(g, -hx, hy, -hx, -hy, dashM);
}

/** One edge: an odd number of slots (≥ 1) so both ends are dashes (the corners read clearly). */
function dashedLine(g: LineSink, x0: number, y0: number, x1: number, y1: number, dashM: number): number {
  const len = Math.hypot(x1 - x0, y1 - y0);
  const n = Math.max(1, 2 * Math.floor(len / (2 * dashM)) + 1);
  let dashes = 0;
  for (let i = 0; i < n; i += 2) {
    const t0 = i / n;
    const t1 = (i + 1) / n;
    g.lineBetween(x0 + (x1 - x0) * t0, y0 + (y1 - y0) * t0, x0 + (x1 - x0) * t1, y0 + (y1 - y0) * t1);
    dashes++;
  }
  return dashes;
}
