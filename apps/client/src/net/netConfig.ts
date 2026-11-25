import { HORDE_MAX_FRAME_BYTES } from "@topdown/shared";

/**
 * Netcode feel (Story 2.6): how prediction corrects itself and how far behind the server the other
 * players and the horde are drawn. Not gameplay balance (that is balance JSON), so they live here.
 */

/** Prediction errors below this are float32 rounding of the schema's `x`/`y`: ignored (1 mm). */
export const PREDICTION_IGNORE_M = 0.001;
/** Prediction errors from this size on snap instead of smoothing (1 m). */
export const PREDICTION_SNAP_M = 1.0;
/**
 * Story 5.7: the reconcile that first shows a Brute's knockback (1.5 m the client could not
 * predict) smooths an error up to this instead of snapping (knock + the usual 1 m).
 */
export const PREDICTION_KNOCK_SNAP_M = 2.5;
/**
 * Story 6.6: the reconcile that first shows the Behemoth's charge shove smooths up to this: the
 * 2.5 m sideways shove the client could not predict, plus the body's push out of the lane (up to
 * its 2 m radius + the survivor's), plus the usual 1 m. Only for a knock with the charge's step.
 */
export const PREDICTION_CHARGE_SNAP_M = 6;
/** Time constant of the visual offset decay after a correction (s): ~63 % gone after 0.1 s. */
export const PREDICTION_SMOOTH_TAU_S = 0.1;
/** Inputs the predictor can replay: 64 steps = 3.2 s; an older ack snaps. */
export const PREDICTION_HISTORY_SIZE = 64;
/** Window of `stats.maxErrorM`: 10 buckets of 1 s (20 steps) each = 10 s. */
export const PREDICTION_ERROR_BUCKETS = 10;
export const PREDICTION_ERROR_BUCKET_STEPS = 20;

/**
 * Interpolation delay of remote players, horde and events (ms). Story 8.9 (decision 8.9 D1): it
 * adapts between these from how LATE snapshots arrive against the server clock (was 100–150 ms
 * from gap jitter, Story 2.6): 250 ms hides the audit's 240–290 ms frame gaps on a 1 % lossy 4G
 * line (docs/perf/network-audit-2026-11.md §3.3); clean lines stay at 100–150 ms.
 */
export const RENDER_DELAY_MIN_MS = 100;
export const RENDER_DELAY_MAX_MS = 250;
/** Story 8.9: lateness samples (patches + horde frames, ~40/s) kept for the p95 (10 s). */
export const LATENESS_WINDOW_MS = 10_000;
/** Story 8.9: the lateness percentile the delay covers at all times. */
export const LATENESS_PERCENTILE = 0.95;
/** Story 8.9: one tick of margin on top of the lateness (a frame must be there one tick before it is drawn). */
export const DELAY_MARGIN_MS = 50;
/**
 * Story 8.9 (decision 8.9 D3): the delay rises at once to cover the latest late sample and starts
 * falling only after this long without a sample that needs it (no pumping up and down on a train).
 */
export const DELAY_FALL_AFTER_MS = 5_000;
/**
 * Story 8.9 (D3): after the calm, the held part of the target eases down this fast (ms per second:
 * 250 → 100 ms in 30 s). Harness, 1 % × 200 ms, 12 × 60 s: 20 ms/s → 2.1 freezes per 30 s, 10 → 1.6,
 * 5 → 1.0 (a stall a few seconds after the hold ends no longer finds the delay already below 230 ms).
 */
export const DELAY_FALL_MS_PER_S = 5;
/**
 * Story 8.9 (decision 8.9 D2): the render clock plays at 0.9–1.1× real time while the delay moves
 * (a 10 % change is hard to see; ±100 ms of delay per second). Never jumps, never runs backwards.
 */
export const PLAYBACK_RATE_MIN = 0.9;
export const PLAYBACK_RATE_MAX = 1.1;
/** Story 8.9: playback rate change per ms of delay error (10 ms off → the full ±10 %; settles in ~0.1 s). */
export const PLAYBACK_RATE_GAIN_PER_MS = 0.01;
/** Story 8.9 review L2: the playback rate itself changes at most this much per second (0.9 → 1.1 in 0.05 s; ≤ 0.067 per 60 Hz frame). With FRAME_OVERDUE_MS 10: 0.86 freezes/30 s (2/s with 15 ms: 1.03). */
export const PLAYBACK_RATE_SLEW_PER_S = 4;
/**
 * Story 8.9 (F1): a horde frame this much later than its 50 ms cadence plus the p95 lateness (ms)
 * is overdue: the render clock plays at 0.9× at once, before the late frame lands, so
 * a 200 ms stall + jitter is hidden even at the 250 ms cap (which alone needs 200 + jitter + one tick).
 * Review L2 re-tune: 15 → 10 ms with the 4/s rate slew (0.86 freezes/30 s; 15 ms: 1.03).
 */
export const FRAME_OVERDUE_MS = 10;
/** Story 8.9: while a frame is overdue the delay may stretch this far past its 250 ms cap (ms; ~10 % of a stall), then catches up at 1.1×. */
export const STALL_STRETCH_MAX_MS = 25;
/**
 * Story 8.9: a frame-clock gap longer than this is a hidden tab / frozen page: the render clock and
 * the server clock re-anchor once (never backwards) and lateness samples that came in it are skipped.
 */
export const WAKE_GAP_MS = 1000;
/** Story 8.9: the server-tick estimate moves toward the measured clock at most this share of elapsed time (10 %). */
export const CLOCK_SLEW_FRACTION = 0.1;
/**
 * Story 8.9 review M1/M2: the estimate catches up FORWARD faster, at most this share of elapsed time
 * (50 %: up to 1.5×). After a latency fall (bufferbloat clears, a better cell) the measurement jumps
 * ahead; at 10 % the estimate lagged real server time by the whole fall for ~2 s (boss telegraph
 * fills ended ~200 ms after the hit). Forward is never "backwards"; 1.5× for ≤ 0.4 s per 200 ms.
 */
export const CLOCK_SLEW_FORWARD_FRACTION = 0.5;
/** Story 8.9: a measured clock this far AHEAD of the estimate (ms) is snapped to at once (start, hidden tab); never backwards. */
export const CLOCK_SNAP_AHEAD_MS = 1000;
/**
 * Story 8.9 (decision 8.9 D5): while the server reports more of my inputs queued than its target
 * (INPUT_QUEUE_TARGET, 2) for this many patches in a row, my steps run at INPUT_SLOW_STEP_RATE, so
 * the backlog empties without the server skipping inputs (its 2 s drain stays as the safety net).
 */
export const INPUT_SLOW_AFTER_PATCHES = 3;
export const INPUT_SLOW_STEP_RATE = 0.9;

/** Dev throttle (`?lag=&jitter=`): messages in flight per direction; when full the oldest is delivered early. */
export const THROTTLE_QUEUE_SIZE = 128;
/**
 * Pooled byte buffer per in-flight binary message: one full horde keyframe (Story 8.10: 7 + 8 × 256
 * = 2055 bytes; a delta is always smaller, else the server sends the keyframe).
 */
export const THROTTLE_BYTES_MAX = HORDE_MAX_FRAME_BYTES;

/**
 * Story 3.6 review L1: when a backlog drains (after a hidden tab), turret shots and teammates' shots
 * older than the render tick − this many ticks (0.5 s) are dropped: no cosmetic projectile, no FX
 * (75 turret shots once spawned in one frame). Kills, hits and everything else still play.
 */
export const STALE_COSMETIC_TICKS = 10;
