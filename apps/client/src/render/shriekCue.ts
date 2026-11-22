/**
 * Story 3.8: when a zombie with a signature cue (the Runner's shriek, FR84) first enters my view.
 *
 * - Once per zombie: a slot is cued once per generation (a Runner that leaves the horde margin and
 *   comes back is the same zombie and stays quiet; a new zombie in the slot can shriek again).
 * - Rate-limited: at most one cue per `minIntervalS` (a wave of Runners doesn't stack shrieks); a
 *   Runner that enters during the quiet time is marked cued and stays quiet.
 * - Panned by its screen position (-1 left … +1 right), so the cue tells you which side.
 *
 * Pure logic on typed arrays (no Phaser, no allocation per frame): ZombieView feeds it.
 */

/** Minimum time between two cues (presentation, not gameplay balance). */
export const SHRIEK_MIN_INTERVAL_S = 0.3;

/** The view rectangle in world metres (Phaser's `camera.worldView` fits). */
export interface ViewRect {
  readonly x: number;
  readonly y: number;
  readonly width: number;
  readonly height: number;
}

export class ShriekCues {
  private readonly cuedGeneration: Int32Array;
  private lastAtS = Number.NEGATIVE_INFINITY;

  constructor(
    capacity: number,
    private readonly minIntervalS = SHRIEK_MIN_INTERVAL_S,
  ) {
    this.cuedGeneration = new Int32Array(capacity).fill(-1);
  }

  /**
   * Call every frame for each drawn zombie whose type has a cue. Returns the pan (-1…1) when the
   * cue should play now, NaN otherwise.
   */
  check(id: number, generation: number, x: number, y: number, view: ViewRect, nowS: number): number {
    if (this.cuedGeneration[id] === generation) return Number.NaN;
    if (x < view.x || y < view.y || x > view.x + view.width || y > view.y + view.height) return Number.NaN;
    this.cuedGeneration[id] = generation;
    if (nowS - this.lastAtS < this.minIntervalS) return Number.NaN;
    this.lastAtS = nowS;
    const half = view.width / 2;
    if (half <= 0) return 0;
    return Math.max(-1, Math.min(1, (x - (view.x + half)) / half));
  }
}
