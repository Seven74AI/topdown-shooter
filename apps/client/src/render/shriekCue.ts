/**
 * Story 3.8: when a zombie with a signature cue (the Runner's shriek, FR84) first enters my view.
 *
 * - Once per zombie: a slot is cued once per generation (a Runner that leaves the horde margin and
 *   comes back is the same zombie and stays quiet; a new zombie in the slot can shriek again).
 * - Rate-limited per screen side (left / right of the centre): at most one cue per `minIntervalS` on
 *   each side (a wave of Runners doesn't stack shrieks, and one coming from the left still cues
 *   after ten from the right). A Runner that enters during its side's quiet time is not marked: it
 *   cues on a later frame, once the window is over, if it is still in view (3.8 review L7).
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
  /** Last cue time per screen side: [left, right]. */
  private readonly lastAtS = new Float64Array([Number.NEGATIVE_INFINITY, Number.NEGATIVE_INFINITY]);

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
    const half = view.width / 2;
    const pan = half <= 0 ? 0 : Math.max(-1, Math.min(1, (x - (view.x + half)) / half));
    const side = pan < 0 ? 0 : 1;
    if (nowS - (this.lastAtS[side] as number) < this.minIntervalS) return Number.NaN; // try again later
    this.lastAtS[side] = nowS;
    this.cuedGeneration[id] = generation;
    return pan;
  }
}
