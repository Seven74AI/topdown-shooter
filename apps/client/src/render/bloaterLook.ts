/**
 * Story 5.8 (AC 8b): the Bloater's swell telegraph, pure (unit-tested; no Phaser). Over the fuse
 * (`explodes.swellS`, 1 s) the sprite steps through the three swell frames of its look (the art
 * grows 1.0 → 1.35 ×), pulses a sickly green faster and faster, and the fuse ring fills.
 */

/** Swell frames baked per look (`BLOATER_SWELL_FRAMES`). */
export const SWELL_FRAME_STAGES = 3;
/** The tint pulse: from this rate to `PULSE_END_HZ` as the fuse burns. */
const PULSE_START_HZ = 3;
const PULSE_END_HZ = 9;
/** Tint colours (multiply): white (none) and the sickly green at the pulse's peak. */
const TINT_PEAK = { r: 0xc8, g: 0xf0, b: 0x70 };

/** Fuse progress 0–1 after `tS` seconds of a `swellS` swell (clamped). */
export function fuseProgress(tS: number, swellS: number): number {
  if (!(swellS > 0) || !(tS > 0)) return 0;
  return Math.min(1, tS / swellS);
}

/** The swell frame stage (1–3) at fuse progress `p`: 1 from the start, 3 for the last third. */
export function swellStage(p: number): number {
  return Math.max(1, Math.min(SWELL_FRAME_STAGES, Math.ceil(p * SWELL_FRAME_STAGES)));
}

/** The pulse 0–1 (0 = no tint) after `tS` seconds, its rate rising with the fuse progress `p`. */
export function swellPulse(tS: number, p: number): number {
  const hz = PULSE_START_HZ + (PULSE_END_HZ - PULSE_START_HZ) * p;
  return (0.5 - 0.5 * Math.cos(tS * hz * 2 * Math.PI)) * (0.45 + 0.55 * p);
}

/** The multiply tint for pulse `k` (0 = white). */
export function swellTint(k: number): number {
  const t = Math.max(0, Math.min(1, k));
  const r = Math.round(255 + (TINT_PEAK.r - 255) * t);
  const g = Math.round(255 + (TINT_PEAK.g - 255) * t);
  const b = Math.round(255 + (TINT_PEAK.b - 255) * t);
  return (r << 16) | (g << 8) | b;
}
