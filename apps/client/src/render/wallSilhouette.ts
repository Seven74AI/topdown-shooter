/**
 * Bodies behind standing walls (designer 2026-11-25 picked option C of `docs/art/occlusion/compare.html`: the
 * silhouette). A standing barricade's picture rises north of its footprint and draws over the bodies, so whoever stands
 * just behind it is hidden; the hidden part of that body shows through the wall as a soft shape: zombies red, survivors
 * in their own slot colour (review L1), gently pulsing. Pure decisions here (no Phaser): which wall covers a body, and
 * the crop that keeps the silhouette inside that wall's picture (review M1: no mask filter; the copy turns in quarter
 * turns, the nearest to the body's heading, so the crop is exact and it never draws over open street).
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
/** The silhouette's alpha: 0.5 ± 0.08, a slow pulse (as on the approved page). */
export function silhouetteAlpha(tS: number): number {
  return 0.5 + 0.08 * Math.sin(tS * 4);
}

/**
 * The wall covering a body at (x, y) with radius `r` (m): north of the wall's footprint line and overlapping its
 * picture; the one it overlaps most. -1 when none (bodies on or in front of a line draw over the wall anyway).
 */
export function coveringWall(x: number, y: number, r: number, walls: readonly WallPic[], n = walls.length): number {
  let best = -1;
  let bestArea = 0;
  for (let i = 0; i < n; i++) {
    const w = walls[i] as WallPic;
    if (y >= w.baseY) continue;
    const ox = Math.min(x + r, w.x1) - Math.max(x - r, w.x0);
    const oy = Math.min(y + r, w.y1) - Math.max(y - r, w.y0);
    if (ox <= 0 || oy <= 0) continue;
    if (ox * oy > bestArea) {
      bestArea = ox * oy;
      best = i;
    }
  }
  return best;
}
/** Is a body behind any of `walls`? */
export function behindAnyWall(x: number, y: number, r: number, walls: readonly WallPic[], n = walls.length): boolean {
  return coveringWall(x, y, r, walls, n) >= 0;
}

/** A body sprite as drawn: centre (m), heading (rad), display size (m), origin, frame size (px). */
export interface SpriteGeom {
  x: number;
  y: number;
  rotation: number;
  displayW: number;
  displayH: number;
  originX: number;
  originY: number;
  frameW: number;
  frameH: number;
}
/** A silhouette's quarter-turn heading and its crop in frame px (null: nothing of it is inside the wall). */
export interface SilCrop {
  rotation: number;
  x: number;
  y: number;
  w: number;
  h: number;
}

/**
 * The silhouette copy of `s` turned to the nearest quarter turn, and the crop (frame px) that keeps it inside `w`'s
 * picture rect: with a quarter-turn heading the wall's axis-aligned rect maps exactly onto an axis-aligned crop.
 */
export function silhouetteCrop(s: SpriteGeom, w: WallPic, out: SilCrop): SilCrop | null {
  const q = ((Math.round(s.rotation / (Math.PI / 2)) % 4) + 4) % 4;
  // the wall rect relative to the sprite's origin point (world axes)
  const ax = w.x0 - s.x;
  const bx = w.x1 - s.x;
  const ay = w.y0 - s.y;
  const by = w.y1 - s.y;
  // into the sprite's own axes (rotate by −q quarter turns): local = R(−θ)·world
  let lx0: number;
  let lx1: number;
  let ly0: number;
  let ly1: number;
  if (q === 0) [lx0, lx1, ly0, ly1] = [ax, bx, ay, by];
  else if (q === 1) [lx0, lx1, ly0, ly1] = [ay, by, -bx, -ax];
  else if (q === 2) [lx0, lx1, ly0, ly1] = [-bx, -ax, -by, -ay];
  else [lx0, lx1, ly0, ly1] = [-by, -ay, ax, bx];
  // local metres → frame px (the origin point sits at originX/Y of the frame)
  const kx = s.frameW / s.displayW;
  const ky = s.frameH / s.displayH;
  const fx0 = Math.max(0, lx0 * kx + s.originX * s.frameW);
  const fx1 = Math.min(s.frameW, lx1 * kx + s.originX * s.frameW);
  const fy0 = Math.max(0, ly0 * ky + s.originY * s.frameH);
  const fy1 = Math.min(s.frameH, ly1 * ky + s.originY * s.frameH);
  if (fx1 - fx0 < 0.5 || fy1 - fy0 < 0.5) return null;
  out.rotation = (q * Math.PI) / 2;
  out.x = fx0;
  out.y = fy0;
  out.w = fx1 - fx0;
  out.h = fy1 - fy0;
  return out;
}
