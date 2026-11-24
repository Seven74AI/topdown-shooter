/** Story 5.23 (D18): one rotation step per this much accumulated wheel delta (px; one Chrome notch = 100). */
export const WHEEL_STEP_PX = 100;
/** Story 5.23 (D18): at most one step per this many ms (a fast spin or a trackpad flick = one turn at a time). */
export const WHEEL_MIN_GAP_MS = 150;
/** `WheelEvent.deltaMode` 1 (lines, Firefox: 3 lines per notch): a line counts as this many px (a notch ≥ one step). */
export const WHEEL_LINE_PX = 40;

/**
 * Story 5.23 (AC 10, D18): turns the mouse wheel into rotation steps while holding a building —
 * Phaser-free (tests). Deltas accumulate until a step's worth (tiny trackpad deltas add up); a step
 * clears the remainder (a flick turns once); down = clockwise (+1), up = counter-clockwise (−1).
 */
export class WheelRotate {
  private acc = 0;
  private lastStepMs = Number.NEGATIVE_INFINITY;

  /** A wheel event: `deltaY` (> 0 = down) in `deltaMode` units at `nowMs`. Returns +1, −1 or 0 (no step). */
  wheel(deltaY: number, deltaMode: number, nowMs: number): number {
    if (!Number.isFinite(deltaY) || deltaY === 0) return 0;
    const px = deltaMode === 1 ? deltaY * WHEEL_LINE_PX : deltaMode === 2 ? deltaY * WHEEL_STEP_PX * 3 : deltaY;
    if (this.acc !== 0 && Math.sign(this.acc) !== Math.sign(px)) this.acc = 0; // a change of direction starts over
    this.acc += px;
    if (Math.abs(this.acc) < WHEEL_STEP_PX) return 0;
    const dir = this.acc > 0 ? 1 : -1;
    this.acc = 0;
    if (nowMs - this.lastStepMs < WHEEL_MIN_GAP_MS) return 0;
    this.lastStepMs = nowMs;
    return dir;
  }

  /** Holding ended: start over. */
  reset(): void {
    this.acc = 0;
  }
}
