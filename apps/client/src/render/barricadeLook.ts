import { darken } from "./buildingLook";

/**
 * Story 4.11: how the wood barricade's art (`building_barricade_a`, designer pick B6: a palisade of
 * sharpened stakes on diagonal struts) sits on its footprint. The frame's own axes: stakes along
 * +x (the footprint's long side, `widthM`), struts toward −y (the back). A building's `rot` (0–3)
 * turns the frame by `rot × 90°` about the footprint centre, so the long side follows the
 * footprint at every rotation and the struts point: rot 0 north, 1 east, 2 south, 3 west. Pure (no
 * Phaser): the view copies these numbers onto a pooled Image.
 */

export interface FootprintLike {
  readonly minX: number;
  readonly minY: number;
  readonly maxX: number;
  readonly maxY: number;
  readonly rot: number;
}

export interface SpriteTransform {
  /** Centre (m). */
  x: number;
  y: number;
  /** Rotation (radians, clockwise on screen: y points down). */
  angle: number;
  /** Display size in the frame's own axes (m): along the stakes, and across (stakes + struts). */
  w: number;
  h: number;
}

export function barricadeTransform(b: FootprintLike, out: SpriteTransform): SpriteTransform {
  const fw = b.maxX - b.minX;
  const fh = b.maxY - b.minY;
  const turned = (b.rot & 1) === 1;
  out.x = (b.minX + b.maxX) / 2;
  out.y = (b.minY + b.maxY) / 2;
  out.angle = ((b.rot & 3) * Math.PI) / 2;
  out.w = turned ? fh : fw;
  out.h = turned ? fw : fh;
  return out;
}

/** Where the frame-local point (lx, ly) (m, from the frame centre) lands in the world under `t`. */
export function framePointToWorld(t: Readonly<SpriteTransform>, lx: number, ly: number, out: { x: number; y: number }): { x: number; y: number } {
  const c = Math.cos(t.angle);
  const s = Math.sin(t.angle);
  out.x = t.x + lx * c - ly * s;
  out.y = t.y + lx * s + ly * c;
  return out;
}

export interface BoxOut {
  minX: number;
  minY: number;
  maxX: number;
  maxY: number;
}

/**
 * Story 4.12: the world box of a band of the art across its whole length — frame-local y from `y0`
 * to `y1` (m, at a 0.5 m deep frame; scaled with the footprint's depth) — under the building's
 * rotation. The B6 palisade casts its tall shadow from its plank row only (`B6_ROW_Y0..Y1`), not
 * from the low struts behind it.
 */
export function frameBandBox(b: FootprintLike, y0: number, y1: number, out: BoxOut): BoxOut {
  const t = barricadeTransform(b, scratch);
  const k = t.h / 0.5;
  const c = Math.round(Math.cos(t.angle));
  const s = Math.round(Math.sin(t.angle));
  let minX = Infinity;
  let minY = Infinity;
  let maxX = -Infinity;
  let maxY = -Infinity;
  for (const lx of [-t.w / 2, t.w / 2]) {
    for (const ly of [y0 * k, y1 * k]) {
      const x = t.x + lx * c - ly * s;
      const y = t.y + lx * s + ly * c;
      if (x < minX) minX = x;
      if (x > maxX) maxX = x;
      if (y < minY) minY = y;
      if (y > maxY) maxY = y;
    }
  }
  out.minX = minX;
  out.minY = minY;
  out.maxX = maxX;
  out.maxY = maxY;
  return out;
}
const scratch: SpriteTransform = { x: 0, y: 0, angle: 0, w: 0, h: 0 };

/**
 * The art is drawn in true colours; Graphics and sprites above the baked light carry the night in
 * their colour (4.9 D4). A lighter darkening than `NIGHT_DARKEN` (0.35): the weathered wood is
 * already dark grey-brown.
 */
export const BARRICADE_NIGHT_DARKEN = 0.1;
/** Story 3.5 damaged look, kept: the wood darkens up to this fraction at 0 HP. */
export const BARRICADE_DAMAGE_DARKEN = 0.45;

/** The sprite's MULTIPLY tint for an HP fraction (white = untouched): night, then damage. */
export function barricadeTint(hpFrac: number): number {
  const f = Math.min(1, Math.max(0, hpFrac));
  return darken(darken(0xffffff, BARRICADE_NIGHT_DARKEN), (1 - f) * BARRICADE_DAMAGE_DARKEN);
}

/** Pool size when no balance is given (4 players × 6). */
export const DEFAULT_BARRICADE_SPRITES = 24;

/**
 * Review fix (L1): the barricade sprite pool holds every player's whole allowance from the balance
 * (`maxPerPlayer × players`), so a balance change never crashes the scene; without a balance, the default.
 */
export function barricadePoolSize(maxPerPlayer: number | undefined, players: number): number {
  if (maxPerPlayer === undefined || !(maxPerPlayer > 0)) return DEFAULT_BARRICADE_SPRITES;
  return Math.ceil(maxPerPlayer) * players;
}

/**
 * Photoreal group 3: the depth of a standing barricade at footprint centre y (m). Above the bodies (10) and burning
 * flames (≤ 10.3), below the heal plus (11) and the darkness (11.7); nearer the camera (larger y) draws over farther.
 */
export const STAND_DEPTH = 10.45;
export const STAND_DEPTH_SPAN = 0.15;
export function standDepth(y: number): number {
  return STAND_DEPTH + (Math.min(1000, Math.max(0, y)) / 1000) * STAND_DEPTH_SPAN;
}
/** A corner piece draws over both walls it joins (its stubs cover their ends): the front line at its own row, the side line at `sideY`. */
export function cornerDepth(y: number, sideY: number): number {
  return Math.max(standDepth(y), standDepth(sideY)) + 1e-4;
}
/** Review M2: UI drawn on a standing barricade (the selection outline) sits above every standing picture. */
export const ABOVE_STANDING_DEPTH = STAND_DEPTH + STAND_DEPTH_SPAN + 0.02;
