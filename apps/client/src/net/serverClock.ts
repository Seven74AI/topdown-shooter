import { TICK_DT_S } from "@topdown/shared";

/** Samples kept for the minimum (Story 2.4): the least-delayed packet in the last 2 s. */
export const CLOCK_WINDOW_MS = 2000;
const TICK_MS = TICK_DT_S * 1000;
/** Ring size: 2 s of 20 Hz patches with room to spare. */
const CAPACITY = 64;

/**
 * Estimates the server's current tick from snapshot arrivals (Story 2.4). Each snapshot gives a
 * sample `offsetMs = arrivalMs − tick × 50`; the smallest offset over a 2 s sliding window is the
 * least-delayed packet, the best estimate. Story 2.6 adds the adaptive render delay on top.
 */
export class ServerClock {
  private readonly arrivals = new Float64Array(CAPACITY);
  private readonly offsets = new Float64Array(CAPACITY);
  private head = 0;
  private count = 0;
  private minOffsetMs = Number.NaN;

  /** True once at least one sample arrived. */
  get ready(): boolean {
    return this.count > 0;
  }

  /** The current best offset (ms); NaN before the first sample. */
  get offsetMs(): number {
    return this.minOffsetMs;
  }

  /** A snapshot of server tick `tick` arrived at `arrivalMs` (client clock). */
  sample(arrivalMs: number, tick: number): void {
    // Forget samples older than the window (the ring is in arrival order).
    while (this.count > 0 && arrivalMs - (this.arrivals[this.head] as number) > CLOCK_WINDOW_MS) {
      this.head = (this.head + 1) % CAPACITY;
      this.count--;
    }
    if (this.count === CAPACITY) {
      this.head = (this.head + 1) % CAPACITY;
      this.count--;
    }
    const i = (this.head + this.count) % CAPACITY;
    this.arrivals[i] = arrivalMs;
    this.offsets[i] = arrivalMs - tick * TICK_MS;
    this.count++;
    let min = Infinity;
    for (let k = 0; k < this.count; k++) {
      const o = this.offsets[(this.head + k) % CAPACITY] as number;
      if (o < min) min = o;
    }
    this.minOffsetMs = min;
  }

  /** The server tick (fractional) at client time `nowMs`; NaN before the first sample. */
  estimateTick(nowMs: number): number {
    return (nowMs - this.minOffsetMs) / TICK_MS;
  }
}
