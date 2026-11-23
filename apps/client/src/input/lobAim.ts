import { lobAimLength, MUZZLE_OFFSET_M, type LauncherStats } from "@topdown/shared";

/**
 * Story 5.5 (FR-A, D1): the aim distance of a lob, encoded as the aim vector's length (only while a
 * launcher is in hand; every other weapon keeps unit aim). Pure; unit-tested.
 *
 * - Mouse: the cursor's distance from the muzzle (survivor centre → cursor, minus the muzzle offset).
 * - Touch (D1): the aim stick's deflection past the fire dead zone maps linearly to
 *   [`minLobM`, `lobRangeM`] (the dead zone's edge = the shortest lob, the rim = the longest).
 */

/** The muzzle distance of a mouse lob: cursor distance from the survivor's centre minus the muzzle offset. */
export function mouseLobDistance(originX: number, originY: number, cursorX: number, cursorY: number, bodyRadiusM: number): number {
  return Math.hypot(cursorX - originX, cursorY - originY) - (bodyRadiusM + MUZZLE_OFFSET_M);
}

/** The muzzle distance of a touch lob from the stick's raw deflection (0–1) and its fire dead zone. */
export function touchLobDistance(stats: Readonly<LauncherStats>, deflection: number, deadZone: number): number {
  const u = deadZone >= 1 ? 1 : Math.min(1, Math.max(0, (deflection - deadZone) / (1 - deadZone)));
  return stats.minLobM + u * (stats.lobRangeM - stats.minLobM);
}

/** Scales the unit aim (x, y) in `out` to the lob length for `distM` (in place). */
export function applyLobLength<T extends { aimX: number; aimY: number }>(out: T, stats: Readonly<LauncherStats>, distM: number): T {
  const len = Math.hypot(out.aimX, out.aimY);
  if (len < 1e-9) return out;
  const k = lobAimLength(stats, distM) / len;
  out.aimX *= k;
  out.aimY *= k;
  return out;
}
