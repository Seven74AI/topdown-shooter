/**
 * Story 5.17 (AC 6, ux-spec §7.1/§7.3): the blocked ghost's colour-blind-safe marks, as pure maths
 * (no Phaser): 45° hatch lines clipped to the box, `spacingM` apart (measured along the box's
 * x axis), and the ✕ glyph's half size (0.4 m wide, capped so it stays inside a small box).
 * `out` gets x0, y0, x1, y1 per segment; returns the number of segments. No allocation.
 */
export function hatchSegments(minX: number, minY: number, maxX: number, maxY: number, spacingM: number, out: Float64Array): number {
  let n = 0;
  // The lines x + y = c ("/" on screen, +y down), c stepping from the top-left corner to the bottom-right one.
  const c0 = minX + minY;
  const c1 = maxX + maxY;
  for (let c = c0 + spacingM; c < c1 - 1e-9 && n * 4 + 3 < out.length; c += spacingM) {
    // Entry: on the top edge (y = minY) or the left edge (x = minX).
    let xa = c - minY;
    let ya = minY;
    if (xa > maxX) {
      xa = maxX;
      ya = c - maxX;
    }
    // Exit: on the left edge (x = minX) or the bottom edge (y = maxY).
    let xb = minX;
    let yb = c - minX;
    if (yb > maxY) {
      yb = maxY;
      xb = c - maxY;
    }
    out[n * 4] = xa;
    out[n * 4 + 1] = ya;
    out[n * 4 + 2] = xb;
    out[n * 4 + 3] = yb;
    n++;
  }
  return n;
}

/** Half the ✕'s size: `glyphM` / 2, at most 40 % of the box's short side (a 0.5 m mine keeps a margin). */
export function crossHalf(w: number, h: number, glyphM: number): number {
  return Math.min(glyphM / 2, 0.4 * Math.min(w, h));
}
