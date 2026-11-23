import { FADE_MS, SHAKE_COUNT, SHAKE_M, SHAKE_MS, type PendingEntry } from "../scenes/pendingPlacements";

/**
 * Story 5.18 (AC 5, 7; ux-spec §6.4): how one pending box looks now, Phaser-free so it is tested.
 * Counted (waiting): white dashed outline, the spinner turning once per second. Refused (or timed
 * out): red, shaken ±0.1 m along x three times in 150 ms each, then faded out over 300 ms. Anything
 * else (a ghost waiting for a late answer, a free slot): hidden.
 */
export interface PendingLookOut {
  visible: boolean;
  red: boolean;
  /** Shake offset along x (m). */
  dx: number;
  alpha: number;
  /** The spinner's angle (rad); NaN = no spinner. */
  spin: number;
}

export function newPendingLook(): PendingLookOut {
  return { visible: false, red: false, dx: 0, alpha: 0, spin: Number.NaN };
}

/** Spinner turns per second. */
export const SPIN_PER_S = 1;

export function pendingLook(e: Readonly<PendingEntry>, nowMs: number, out: PendingLookOut): PendingLookOut {
  out.visible = false;
  out.red = false;
  out.dx = 0;
  out.alpha = 0;
  out.spin = Number.NaN;
  if (!e.live) return out;
  if (e.counted) {
    out.visible = true;
    out.alpha = 1;
    out.spin = (((nowMs / 1000) * SPIN_PER_S) % 1) * 2 * Math.PI;
    return out;
  }
  if (Number.isNaN(e.refusedMs)) return out;
  const t = nowMs - e.refusedMs;
  const shakeMs = SHAKE_COUNT * SHAKE_MS;
  if (t < 0 || t >= shakeMs + FADE_MS) return out;
  out.visible = true;
  out.red = true;
  if (t < shakeMs) {
    out.dx = SHAKE_M * Math.sin((2 * Math.PI * t) / SHAKE_MS);
    out.alpha = 1;
  } else out.alpha = 1 - (t - shakeMs) / FADE_MS;
  return out;
}
