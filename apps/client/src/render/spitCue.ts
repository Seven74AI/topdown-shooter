import type { ViewRect } from "./shriekCue";

/**
 * Story 5.6: when a Spitter's windup gurgle plays (AC 6, F1). Every windup the local player can see
 * cues once, on the frame its state turns WINDUP (the horde stream's nibble online, the pool solo),
 * panned by its screen position like the Runner shriek. Many Spitters winding up together share a
 * short quiet window (`minIntervalS`) so a crowd doesn't stack gurgles. Pure, no allocation.
 */
export const GURGLE_MIN_INTERVAL_S = 0.15;
/** Windup pulse of the Spitter sprite: scale amplitude and rate (the telegraph, on the image itself). */
export const WINDUP_PULSE_SCALE = 0.08;
export const WINDUP_PULSE_HZ = 5;

export class GurgleCues {
  private lastAtS = Number.NEGATIVE_INFINITY;

  constructor(private readonly minIntervalS = GURGLE_MIN_INTERVAL_S) {}

  /** A windup started at (x, y): the pan (-1…1) to play the gurgle with, or NaN (off screen / too soon). */
  windupStarted(x: number, y: number, view: ViewRect, nowS: number): number {
    if (x < view.x || y < view.y || x > view.x + view.width || y > view.y + view.height) return Number.NaN;
    if (nowS - this.lastAtS < this.minIntervalS) return Number.NaN;
    this.lastAtS = nowS;
    const half = view.width / 2;
    return half <= 0 ? 0 : Math.max(-1, Math.min(1, (x - (view.x + half)) / half));
  }
}

/** The windup pulse factor at time `tS` since the windup was first drawn (1 at the start, ≥ 1). */
export function windupScale(tS: number): number {
  return 1 + WINDUP_PULSE_SCALE * (0.5 - 0.5 * Math.cos(tS * WINDUP_PULSE_HZ * 2 * Math.PI));
}
