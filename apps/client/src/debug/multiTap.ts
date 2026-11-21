/**
 * Detects an N-finger tap: N touches that start within `windowMs` of each other while all are down
 * (Story 1.11: three fingers toggle the performance overlay). Pure; times are passed in.
 */
export class MultiTapDetector {
  private readonly starts: Float64Array;
  private head = 0;
  private count = 0;

  constructor(
    private readonly fingers = 3,
    private readonly windowMs = 300,
  ) {
    this.starts = new Float64Array(fingers);
  }

  /**
   * Call once per new touch. `activeTouches` is how many touches are down now (this one included).
   * Returns true when this touch completes an N-finger tap; the detector then starts over, so a
   * fourth finger does not fire again.
   */
  touchStart(nowMs: number, activeTouches: number): boolean {
    this.starts[this.head] = nowMs;
    this.head = (this.head + 1) % this.fingers;
    if (this.count < this.fingers) this.count++;
    if (this.count < this.fingers || activeTouches < this.fingers) return false;
    const oldest = this.starts[this.head] as number; // the slot about to be overwritten is the oldest
    if (nowMs - oldest > this.windowMs) return false;
    this.count = 0;
    return true;
  }
}
