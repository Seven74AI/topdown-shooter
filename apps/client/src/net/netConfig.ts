/**
 * Netcode feel (Story 2.6): how prediction corrects itself and how far behind the server the other
 * players and the horde are drawn. Not gameplay balance (that is balance JSON), so they live here.
 */

/** Prediction errors below this are float32 rounding of the schema's `x`/`y`: ignored (1 mm). */
export const PREDICTION_IGNORE_M = 0.001;
/** Prediction errors from this size on snap instead of smoothing (1 m). */
export const PREDICTION_SNAP_M = 1.0;
/** Time constant of the visual offset decay after a correction (s): ~63 % gone after 0.1 s. */
export const PREDICTION_SMOOTH_TAU_S = 0.1;
/** Inputs the predictor can replay: 64 steps = 3.2 s; an older ack snaps. */
export const PREDICTION_HISTORY_SIZE = 64;
/** Window of `stats.maxErrorM`: 10 buckets of 1 s (20 steps) each = 10 s. */
export const PREDICTION_ERROR_BUCKETS = 10;
export const PREDICTION_ERROR_BUCKET_STEPS = 20;

/** Interpolation delay of remote players, horde and events (ms): adapts between these from jitter. */
export const RENDER_DELAY_MIN_MS = 100;
export const RENDER_DELAY_MAX_MS = 150;
/** Target delay = min + this × jitter (20 ms jitter → 140 ms). */
export const RENDER_DELAY_JITTER_GAIN = 2;
/** The delay moves toward its target at most this fast (ms per second), so nothing teleports. */
export const RENDER_DELAY_SLEW_MS_PER_S = 20;
/** EWMA weight of one snapshot gap in the jitter estimate. */
export const JITTER_EWMA_ALPHA = 0.1;
/** One gap counts at most this much jitter (ms), so a hidden tab's 5 s gap can't pin the delay at max. */
export const JITTER_SAMPLE_CAP_MS = 100;

/** Dev throttle (`?lag=&jitter=`): messages in flight per direction; when full the oldest is delivered early. */
export const THROTTLE_QUEUE_SIZE = 128;
/** Pooled byte buffer per in-flight binary message: one full horde frame (6 + 8 × 256 bytes, Story 2.5). */
export const THROTTLE_BYTES_MAX = 2054;
