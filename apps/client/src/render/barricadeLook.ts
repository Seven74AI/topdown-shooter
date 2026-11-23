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
