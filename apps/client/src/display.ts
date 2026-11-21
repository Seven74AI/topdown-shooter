/** Highest devicePixelRatio we render at (architecture › Client Platform Budgets). */
export const MAX_DPR = 2;

/** Effective render scale: the device's pixel ratio, capped at MAX_DPR. */
export const dpr = (): number => Math.min(window.devicePixelRatio || 1, MAX_DPR);
