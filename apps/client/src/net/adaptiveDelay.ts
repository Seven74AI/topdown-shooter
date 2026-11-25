import { TICK_DT_S } from "@topdown/shared";
import {
  DELAY_FALL_AFTER_MS,
  DELAY_FALL_MS_PER_S,
  DELAY_MARGIN_MS,
  FRAME_OVERDUE_MS,
  LATENESS_PERCENTILE,
  LATENESS_WINDOW_MS,
  PLAYBACK_RATE_GAIN_PER_MS,
  PLAYBACK_RATE_MAX,
  PLAYBACK_RATE_MIN,
  RENDER_DELAY_MAX_MS,
  RENDER_DELAY_MIN_MS,
  STALL_STRETCH_MAX_MS,
  WAKE_GAP_MS,
} from "./netConfig";

const TICK_MS = TICK_DT_S * 1000;
/** Lateness samples kept: 10 s × ~40/s (patches + horde frames) with room to spare. */
const SAMPLE_CAPACITY = 512;
/** Lateness histogram: 5 ms buckets over 0–500 ms (the last bucket takes everything later). */
const BUCKET_MS = 5;
const BUCKETS = 100;

/**
 * The render clock others, the horde and events are drawn at (Story 2.6; rewritten by Story 8.9).
 *
 * - `sample(arrivalMs, tick, offsetMs)`: each state patch and horde frame (decision 8.9 D7) is a
 *   lateness sample `lateMs = arrivalMs − tick × 50 − offsetMs` (`offsetMs` = the server clock's
 *   least-delayed offset, so the fastest packet is 0 late). Samples that came while the frame
 *   clock was paused for more than WAKE_GAP_MS (a hidden tab) are skipped, not counted.
 * - target = clamp(max(p95 lateness over 10 s + one tick, held), 100, 250). `held` jumps to any
 *   sample's lateness + one tick that is over the current target, stays 5 s, then eases down at
 *   20 ms/s (D3: rises with the first late sample, falls only after 5 s without one, slowly).
 * - `advance(nowMs, estimateTick)`: the render tick moves `dt × rate`, rate in [0.9, 1.1] steering
 *   `estimate − renderTick` toward the target (D2). It never decreases. After a frame-clock gap
 *   over WAKE_GAP_MS it re-anchors once at `estimate − target` (only forward), so a woken tab does
 *   not play seconds at 1.1×. While the next frame is overdue (`newestTick` more than 25 ms behind
 *   its cadence + the p95 lateness) it plays at 0.9× at once, up to 25 ms past the 250 ms cap: the first sign of a
 *   stall is the frame that does not come, not the late one that lands after it.
 *
 * Everything is preallocated: no allocation per sample or per frame.
 */
export class AdaptiveDelay {
  /** The current delay: `estimate − renderTick` (ms) after the last `advance`. */
  delayMs = RENDER_DELAY_MIN_MS;
  /** The delay the render clock steers toward (ms). */
  targetMs = RENDER_DELAY_MIN_MS;
  /** The p95 lateness over the last 10 s (ms; the overlay's "late p95"). */
  lateP95Ms = 0;
  /** The playback rate of the last `advance` (1 = real time). */
  rate = 1;

  private renderTickNow = Number.NaN;
  private lastNowMs = Number.NaN;
  private readonly sampleAt = new Float64Array(SAMPLE_CAPACITY);
  private readonly sampleLate = new Float32Array(SAMPLE_CAPACITY);
  private readonly histogram = new Uint16Array(BUCKETS);
  private head = 0;
  private count = 0;
  /** The held demand (lateness + margin, ms) of the last sample over the target, and when it came. */
  private heldMs = 0;
  private heldAtMs = 0;

  /** The delay in ticks (fractional). */
  get delayTicks(): number {
    return this.delayMs / TICK_MS;
  }

  /** The render tick of the last `advance`; NaN before the first. */
  get renderTick(): number {
    return this.renderTickNow;
  }

  /** Samples in the lateness window (tests, overlay). */
  get samples(): number {
    return this.count;
  }

  /** A patch or horde frame of server tick `tick` arrived at `arrivalMs`; `offsetMs` is the clock's least-delayed offset. */
  sample(arrivalMs: number, tick: number, offsetMs: number): void {
    if (Number.isNaN(offsetMs)) return;
    // Story 8.9: a sample that waited out a paused frame clock (hidden tab) is not lateness.
    if (!Number.isNaN(this.lastNowMs) && arrivalMs - this.lastNowMs > WAKE_GAP_MS) return;
    this.expire(arrivalMs);
    if (this.count === SAMPLE_CAPACITY) this.dropOldest();
    const late = Math.max(0, arrivalMs - tick * TICK_MS - offsetMs);
    if (late + DELAY_MARGIN_MS > this.targetMs) {
      this.heldMs = late + DELAY_MARGIN_MS;
      this.heldAtMs = arrivalMs;
    }
    const i = (this.head + this.count) % SAMPLE_CAPACITY;
    this.sampleAt[i] = arrivalMs;
    this.sampleLate[i] = late;
    this.count++;
    const b = bucketOf(late);
    this.histogram[b] = (this.histogram[b] as number) + 1;
    this.retarget(arrivalMs);
  }

  /**
   * Moves the render clock to client time `nowMs` for the server tick estimate `estimateTick`
   * and returns the new render tick (monotonic). Call once per frame.
   */
  advance(nowMs: number, estimateTick: number, newestTick = -1): number {
    if (Number.isNaN(estimateTick)) return this.renderTickNow;
    const dtMs = Number.isNaN(this.lastNowMs) ? 0 : nowMs - this.lastNowMs;
    if (dtMs < 0) return this.renderTickNow;
    this.lastNowMs = nowMs;
    this.expire(nowMs);
    this.retarget(nowMs);
    const anchor = estimateTick - this.targetMs / TICK_MS;
    let rt = this.renderTickNow;
    if (Number.isNaN(rt)) {
      rt = anchor;
      this.rate = 1;
    } else {
      const delayNow = (estimateTick - rt) * TICK_MS;
      if (dtMs > WAKE_GAP_MS || delayNow > RENDER_DELAY_MAX_MS + WAKE_GAP_MS) {
        rt = Math.max(rt, anchor); // a woken tab: re-anchor once, never backwards
        this.rate = 1;
      } else {
        const err = delayNow - dtMs - this.targetMs; // after a 1× step: > 0 too far behind → play faster
        const overdue = newestTick >= 0 && (estimateTick - newestTick - 1) * TICK_MS > this.lateP95Ms + FRAME_OVERDUE_MS;
        if (overdue && delayNow < RENDER_DELAY_MAX_MS + STALL_STRETCH_MAX_MS) this.rate = PLAYBACK_RATE_MIN;
        else this.rate = Math.min(PLAYBACK_RATE_MAX, Math.max(PLAYBACK_RATE_MIN, 1 + err * PLAYBACK_RATE_GAIN_PER_MS));
        rt += (dtMs / TICK_MS) * this.rate;
      }
    }
    if (Number.isNaN(this.renderTickNow) || rt > this.renderTickNow) this.renderTickNow = rt; // monotonic
    this.delayMs = (estimateTick - this.renderTickNow) * TICK_MS;
    return this.renderTickNow;
  }

  /** Forgets lateness samples older than the window; true when any left. */
  private expire(nowMs: number): boolean {
    let dropped = false;
    while (this.count > 0 && nowMs - (this.sampleAt[this.head] as number) > LATENESS_WINDOW_MS) {
      this.dropOldest();
      dropped = true;
    }
    return dropped;
  }

  private dropOldest(): void {
    const b = bucketOf(this.sampleLate[this.head] as number);
    this.histogram[b] = (this.histogram[b] as number) - 1;
    this.head = (this.head + 1) % SAMPLE_CAPACITY;
    this.count--;
  }

  /** target = clamp(max(p95 over 10 s + margin, held easing down after 5 s), min, max). */
  private retarget(nowMs: number): void {
    let p95 = 0;
    if (this.count > 0) {
      const need = Math.ceil(this.count * LATENESS_PERCENTILE);
      let cum = 0;
      for (let b = 0; b < BUCKETS; b++) {
        cum += this.histogram[b] as number;
        if (cum >= need) {
          p95 = (b + 1) * BUCKET_MS;
          break;
        }
      }
    }
    this.lateP95Ms = p95;
    const calmMs = nowMs - this.heldAtMs - DELAY_FALL_AFTER_MS;
    const held = calmMs > 0 ? this.heldMs - (calmMs * DELAY_FALL_MS_PER_S) / 1000 : this.heldMs;
    const need = Math.max(p95 + DELAY_MARGIN_MS, held);
    this.targetMs = Math.min(RENDER_DELAY_MAX_MS, Math.max(RENDER_DELAY_MIN_MS, need));
  }
}

function bucketOf(lateMs: number): number {
  return Math.min(BUCKETS - 1, Math.floor(lateMs / BUCKET_MS));
}
