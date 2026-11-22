import { TICK_DT_S } from "@topdown/shared";
import {
  JITTER_EWMA_ALPHA,
  JITTER_SAMPLE_CAP_MS,
  RENDER_DELAY_JITTER_GAIN,
  RENDER_DELAY_MAX_MS,
  RENDER_DELAY_MIN_MS,
  RENDER_DELAY_SLEW_MS_PER_S,
} from "./netConfig";

const TICK_MS = TICK_DT_S * 1000;

/**
 * The interpolation delay for remote players, the horde and events (Story 2.6): 100–150 ms from
 * measured jitter. One value per frame feeds the single render tick every buffer samples.
 *
 * - `snapshot(arrivalMs, tick)`: jitter = EWMA(|gap − 50 ms × ticks advanced|, 0.1). Measured on
 *   arrival times after the dev throttle. A gap counts at most 100 ms (a hidden tab).
 * - target = clamp(100 + 2 × jitter, 100, 150); `frame(dtS)` slews the delay toward it at most
 *   20 ms per second, so the render tick never jumps.
 */
export class AdaptiveDelay {
  /** Current delay (ms). Starts at the minimum. */
  delayMs = RENDER_DELAY_MIN_MS;
  /** Jitter estimate (ms). */
  jitterMs = 0;
  private lastArrivalMs = Number.NaN;
  private lastTick = 0;

  /** Delay target from the current jitter (ms). */
  get targetMs(): number {
    return Math.min(RENDER_DELAY_MAX_MS, Math.max(RENDER_DELAY_MIN_MS, RENDER_DELAY_MIN_MS + RENDER_DELAY_JITTER_GAIN * this.jitterMs));
  }

  /** The delay in ticks (fractional). */
  get delayTicks(): number {
    return this.delayMs / TICK_MS;
  }

  /** A snapshot of server tick `tick` arrived at `arrivalMs`. Ticks not newer than the last are ignored. */
  snapshot(arrivalMs: number, tick: number): void {
    if (!Number.isNaN(this.lastArrivalMs)) {
      if (tick <= this.lastTick) return;
      const dev = Math.abs(arrivalMs - this.lastArrivalMs - (tick - this.lastTick) * TICK_MS);
      this.jitterMs += JITTER_EWMA_ALPHA * (Math.min(dev, JITTER_SAMPLE_CAP_MS) - this.jitterMs);
    }
    this.lastArrivalMs = arrivalMs;
    this.lastTick = tick;
  }

  /** Moves the delay toward the target; call once per frame. */
  frame(frameDtS: number): void {
    if (frameDtS <= 0) return;
    const maxStep = RENDER_DELAY_SLEW_MS_PER_S * frameDtS;
    const d = this.targetMs - this.delayMs;
    this.delayMs += Math.max(-maxStep, Math.min(maxStep, d));
  }

  /** Render tick for a server tick estimate: `estimate − delay / 50 ms`. */
  renderTick(estimatedTick: number): number {
    return estimatedTick - this.delayMs / TICK_MS;
  }
}
