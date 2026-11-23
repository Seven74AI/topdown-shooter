/**
 * Story 5.9 (7.3): the camera shake of a mine blast (pure; unit-tested). Only when my survivor is
 * within `MINE_SHAKE_RADIUS_M` of the blast centre; strongest on top of it, fading to a light tremor
 * at the edge. Camera shake intensity is a fraction of the view (Phaser `cameras.main.shake`).
 */
export const MINE_SHAKE_RADIUS_M = 6;
export const MINE_SHAKE_MAX = 0.012;
export const MINE_SHAKE_MIN = 0.003;
export const MINE_SHAKE_MS = 220;

/** The shake intensity for a blast `distM` away (0 = none). */
export function mineShakeIntensity(distM: number): number {
  if (!(distM >= 0) || distM > MINE_SHAKE_RADIUS_M) return 0;
  return MINE_SHAKE_MIN + (MINE_SHAKE_MAX - MINE_SHAKE_MIN) * (1 - distM / MINE_SHAKE_RADIUS_M);
}
