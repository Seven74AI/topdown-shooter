import { getSettings } from "../settings/settings";

/** What `vibrate` needs from the browser (tests pass a fake). */
export interface VibrateTarget {
  vibrate?: (pattern: number | readonly number[]) => boolean;
}

/**
 * Story 5.23 (AC 5, D9): one haptic, if the player's `haptics` setting is on and the browser can
 * vibrate (Android Chrome; nothing on iOS Safari or desktops). Every haptic in the game has a visual
 * twin, so a phone that can't vibrate misses nothing. Returns whether it asked the browser.
 */
export function vibrate(pattern: number | readonly number[], target: VibrateTarget | undefined = globalThis.navigator as VibrateTarget | undefined): boolean {
  if (!getSettings().haptics) return false;
  const fn = target?.vibrate;
  if (typeof fn !== "function") return false;
  try {
    fn.call(target, pattern as number | number[]);
    return true;
  } catch {
    return false; // a blocked / unsupported call (no user gesture yet): nothing
  }
}
