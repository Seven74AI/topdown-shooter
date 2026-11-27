/** Highest devicePixelRatio we render at (architecture › Client Platform Budgets). */
export const MAX_DPR = 2;

/** Story 10.2-Q2: the Resolution setting's cap (`RESOLUTION_DPR`; ≤ MAX_DPR), set by `settings/resolution.ts`. */
let dprCap = MAX_DPR;

/** Story 10.2: sets the Resolution cap (clamped to 1 … MAX_DPR); `dpr()` reads it from the next call. */
export function setDprCap(cap: number): void {
  dprCap = Math.min(MAX_DPR, Math.max(1, cap));
}

/** Effective render scale: the device's pixel ratio, capped at MAX_DPR and the Resolution setting (10.2). */
export const dpr = (): number => Math.min(window.devicePixelRatio || 1, dprCap);

export interface SafeArea {
  top: number;
  right: number;
  bottom: number;
  left: number;
}

let probe: HTMLDivElement | null = null;
const safe: SafeArea = { top: 0, right: 0, bottom: 0, left: 0 };

/**
 * Safe-area insets (notch, rounded corners) in CSS px. Phaser can't read CSS env() values, so a
 * hidden probe element with `padding: env(safe-area-inset-*)` is measured. Each call runs
 * getComputedStyle (forces a style recalc): call it on create and resize only, and cache the result.
 */
export function safeArea(): SafeArea {
  if (typeof document === "undefined") return safe;
  if (!probe) {
    probe = document.createElement("div");
    probe.style.cssText =
      "position:fixed;visibility:hidden;pointer-events:none;top:0;left:0;" +
      "padding:env(safe-area-inset-top) env(safe-area-inset-right) env(safe-area-inset-bottom) env(safe-area-inset-left)";
    document.body.appendChild(probe);
  }
  const cs = getComputedStyle(probe);
  safe.top = parseFloat(cs.paddingTop) || 0;
  safe.right = parseFloat(cs.paddingRight) || 0;
  safe.bottom = parseFloat(cs.paddingBottom) || 0;
  safe.left = parseFloat(cs.paddingLeft) || 0;
  return safe;
}
