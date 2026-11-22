/**
 * Story 2.9: the "needs a revive" pulse of a downed survivor's ring and edge arrow. Pure functions
 * of the scene time (`scene.time.now`), so no tween is created per frame.
 */
export const PULSE_PERIOD_MS = 800;
/** Extra scale at the peak (1 → 1.25). */
export const PULSE_SCALE_AMP = 0.25;
export const PULSE_ALPHA_MIN = 0.6;
export const PULSE_ALPHA_MAX = 1;

/** 0..1, in phase for scale and alpha. */
const phase = (timeMs: number): number => 0.5 + 0.5 * Math.sin((2 * Math.PI * timeMs) / PULSE_PERIOD_MS);

/** 1 … 1.25. */
export const pulseScale = (timeMs: number): number => 1 + PULSE_SCALE_AMP * phase(timeMs);

/** 0.6 … 1.0, largest when the scale is. */
export const pulseAlpha = (timeMs: number): number => PULSE_ALPHA_MIN + (PULSE_ALPHA_MAX - PULSE_ALPHA_MIN) * phase(timeMs);
