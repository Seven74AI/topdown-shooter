/**
 * Story 8.1 (decision 8.1 D3): a survivor back from a hold mid-wave is spawn-protected for 2 s
 * (can't be hurt, can't shoot): its body blinks — an alpha pulse on the existing body, no new
 * texture. 4 blinks per second between full and `PROTECT_BLINK_MIN_ALPHA`; 1 when not protected.
 */
export const PROTECT_BLINK_HZ = 4;
export const PROTECT_BLINK_MIN_ALPHA = 0.3;

export function protectBlinkAlpha(protectTicks: number, timeMs: number): number {
  if (!(protectTicks > 0)) return 1;
  const phase = (timeMs * PROTECT_BLINK_HZ) / 1000;
  const wave = 0.5 + 0.5 * Math.cos(phase * 2 * Math.PI); // 1 → 0 → 1 per blink
  return PROTECT_BLINK_MIN_ALPHA + (1 - PROTECT_BLINK_MIN_ALPHA) * wave;
}
