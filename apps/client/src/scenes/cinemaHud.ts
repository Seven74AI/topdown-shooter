/** Anything the Phaser camera filter applies to (a Game Object: `willRender` skips it for a camera whose id bit is set). */
export interface CameraFiltered {
  cameraFilter: number;
}

/**
 * Story 12.3 (AC 2): the HUD hides during the extraction's cinematic, except the objects in `keep` (the letterbox, the
 * fade, the debug overlay). Every top-level object of the HUD scene gets the HUD camera's id bit in its `cameraFilter`
 * (Phaser's `camera.ignore`), so whatever each draw method sets visible stays off screen, and objects made later are
 * caught on the next frame; `hide` false clears the bit again. Only that bit is touched. No allocation.
 */
export function filterHud(list: readonly CameraFiltered[], keep: readonly CameraFiltered[], camBit: number, hide: boolean): void {
  for (let i = 0; i < list.length; i++) {
    const o = list[i] as CameraFiltered;
    if (keep.indexOf(o) >= 0) continue;
    o.cameraFilter = hide ? o.cameraFilter | camBit : o.cameraFilter & ~camBit;
  }
}

/** The bar height in px for `frac` of the screen (whole pixels: no shimmer while it eases). */
export function barPx(frac: number, screenH: number): number {
  return Math.round(Math.max(0, frac) * screenH);
}
