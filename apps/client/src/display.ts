/** Highest devicePixelRatio we render at (architecture › Client Platform Budgets). */
export const MAX_DPR = 2;

/** Effective render scale: the device's pixel ratio, capped at MAX_DPR. */
export const dpr = (): number => Math.min(window.devicePixelRatio || 1, MAX_DPR);

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
 * hidden probe element with `padding: env(safe-area-inset-*)` is measured. Re-read on every call
 * (cheap; called on create and resize only).
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
