/**
 * Bodies behind standing walls (designer 2026-11-25 picked option C of `docs/art/occlusion/compare.html`: the
 * silhouette). A standing barricade's picture rises north of its footprint and draws over the bodies, so whoever stands
 * just behind it is hidden; the hidden part of that body shows through the wall as a soft glowing shape, red for
 * zombies and blue for survivors, gently pulsing. Pure decisions here (no Phaser): which bodies are behind which wall,
 * the colour and the pulse. `WallSilhouetteView` draws them, masked to the walls' own pixels.
 */

/** A standing wall's picture on screen (m): its rect, and its footprint centre's y (the line it stands on). */
export interface WallPic {
  x0: number;
  y0: number;
  x1: number;
  y1: number;
  baseY: number;
}

export const SILHOUETTE_ZOMBIE = 0xff5c48;
export const SILHOUETTE_SURVIVOR = 0x60b0ff;
/** The silhouette's alpha: 0.5 ± 0.08, a slow pulse (as on the approved page). */
export function silhouetteAlpha(tS: number): number {
  return 0.5 + 0.08 * Math.sin(tS * 4);
}

/**
 * Is a body at (x, y) with radius `r` (m) behind one of `walls`: north of a wall's footprint line and overlapping its
 * picture? Bodies on or in front of the line are drawn over the wall anyway (never silhouetted).
 */
export function behindAnyWall(x: number, y: number, r: number, walls: readonly WallPic[], n = walls.length): boolean {
  for (let i = 0; i < n; i++) {
    const w = walls[i] as WallPic;
    if (y >= w.baseY) continue;
    if (x + r <= w.x0 || x - r >= w.x1 || y + r <= w.y0 || y - r >= w.y1) continue;
    return true;
  }
  return false;
}
