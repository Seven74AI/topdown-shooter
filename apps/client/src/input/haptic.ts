/**
 * Story 5.20 (ux-spec §10): a short vibration (Android Chrome; iOS Safari and desktops have no
 * `navigator.vibrate`, so nothing happens there). Never throws: a blocked or missing API is silent.
 */
export function haptic(ms: number, nav: { vibrate?: (pattern: number) => boolean } | undefined = typeof navigator === "undefined" ? undefined : navigator): void {
  try {
    nav?.vibrate?.(ms);
  } catch {
    // permissions policy / no user gesture yet: no buzz
  }
}
