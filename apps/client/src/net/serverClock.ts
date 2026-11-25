import { TICK_DT_S } from "@topdown/shared";
import { CLOCK_SLEW_FORWARD_FRACTION, CLOCK_SLEW_FRACTION, CLOCK_SNAP_AHEAD_MS, WAKE_GAP_MS } from "./netConfig";

/** Samples kept for the minimum (Story 2.4): the least-delayed packet in the last 2 s. */
export const CLOCK_WINDOW_MS = 2000;
const TICK_MS = TICK_DT_S * 1000;
/** Ring size: 2 s of patches + horde frames (Story 8.9: ~40/s) with room to spare. */
const CAPACITY = 128;

/**
 * Estimates the server's current tick from snapshot arrivals (Story 2.4). Each snapshot gives a
 * sample `offsetMs = arrivalMs − tick × 50`; the smallest offset over a 2 s sliding window is the
 * least-delayed packet, the best measurement (`rawOffsetMs`).
 *
 * Story 8.9 (audit F5): the estimate handed out never runs backwards. Each call moves it by the
 * elapsed time, plus a correction toward the measurement of at most 10 % of that time backward and
 * 50 % forward (review M1/M2): when latency rises for good (the minimum jumps up), the estimate
 * slows to 0.9× instead of stepping back; when it falls, it catches up at ≤ 1.5×. The first estimate, a measurement more than 1 s ahead, or one after a hidden-tab
 * gap snaps forward (never back).
 */
export class ServerClock {
  private readonly arrivals = new Float64Array(CAPACITY);
  private readonly offsets = new Float64Array(CAPACITY);
  private head = 0;
  private count = 0;
  private minOffsetMs = Number.NaN;
  private estTick = Number.NaN;
  private estAtMs = Number.NaN;

  /** True once at least one sample arrived. */
  get ready(): boolean {
    return this.count > 0;
  }

  /** The current least-delayed offset (ms); NaN before the first sample. */
  get rawOffsetMs(): number {
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

  /** The measured server tick at `nowMs` (unslewed: may step back; tests and the overlay). */
  rawTick(nowMs: number): number {
    return (nowMs - this.minOffsetMs) / TICK_MS;
  }

  /** The server tick (fractional) at client time `nowMs`: slewed, never decreasing; NaN before the first sample. */
  estimateTick(nowMs: number): number {
    if (this.count === 0) return Number.NaN;
    const raw = this.rawTick(nowMs);
    if (Number.isNaN(this.estTick)) {
      this.estTick = raw;
      this.estAtMs = nowMs;
      return raw;
    }
    const dtMs = nowMs - this.estAtMs;
    if (dtMs <= 0) return this.estTick;
    this.estAtMs = nowMs;
    let next = this.estTick + dtMs / TICK_MS;
    const err = raw - next;
    if (dtMs > WAKE_GAP_MS || err * TICK_MS > CLOCK_SNAP_AHEAD_MS) {
      if (raw > next) next = raw; // forward only
    } else {
      const back = (CLOCK_SLEW_FRACTION * dtMs) / TICK_MS;
      const ahead = (CLOCK_SLEW_FORWARD_FRACTION * dtMs) / TICK_MS; // review M1/M2: a latency fall is caught up within ~0.4 s per 200 ms
      next += Math.max(-back, Math.min(ahead, err));
    }
    if (next > this.estTick) this.estTick = next;
    return this.estTick;
  }
}
