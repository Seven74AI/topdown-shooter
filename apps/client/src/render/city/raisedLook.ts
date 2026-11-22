import type * as Phaser from "phaser";
import { MAP_PX_PER_M } from "./dressing";
import { LIGHT_DIR, shadowLenPx } from "./palette";

/**
 * Story 4.9: the Dead City "raised object" cues for Graphics-drawn things (player barricades,
 * turrets): a hard cast shadow along the one light direction (length by height, like the baked city)
 * and a bevel (lit top/left edge, dark bottom/right edge). Called only when those layers redraw.
 */
const SHADOW_ALPHA = 0.45;
/**
 * Graphics-drawn objects sit above the baked light (D4), so their colours carry the night: darkened
 * by this fraction (`buildingLook.darken`), close to the ambient level of the lit street.
 */
export const NIGHT_DARKEN = 0.35;
const BEVEL_M = 0.05;
const BEVEL_HI = 0.22;
const BEVEL_LO = 0.4;

interface Rect {
  readonly minX: number;
  readonly minY: number;
  readonly maxX: number;
  readonly maxY: number;
}

/** Shadow of `r` (inset by `inset` m) of an object `heightM` tall. */
export function castShadow(g: Phaser.GameObjects.Graphics, r: Rect, heightM: number, inset = 0): void {
  const len = shadowLenPx(heightM) / MAP_PX_PER_M;
  const dx = LIGHT_DIR.x * len;
  const dy = LIGHT_DIR.y * len;
  const x0 = r.minX + inset;
  const y0 = r.minY + inset;
  const x1 = r.maxX - inset;
  const y1 = r.maxY - inset;
  g.fillStyle(0x000000, SHADOW_ALPHA);
  g.beginPath();
  g.moveTo(x0, y0);
  g.lineTo(x1, y0);
  g.lineTo(x1 + dx, y0 + dy);
  g.lineTo(x1 + dx, y1 + dy);
  g.lineTo(x0 + dx, y1 + dy);
  g.lineTo(x0, y1);
  g.closePath();
  g.fillPath();
}

/** Lit top/left and dark bottom/right edges inside `r` (inset by `inset` m). */
export function raisedBevel(g: Phaser.GameObjects.Graphics, r: Rect, inset = 0): void {
  const x = r.minX + inset;
  const y = r.minY + inset;
  const w = r.maxX - r.minX - 2 * inset;
  const h = r.maxY - r.minY - 2 * inset;
  g.fillStyle(0xffffff, BEVEL_HI).fillRect(x, y, w, BEVEL_M).fillRect(x, y, BEVEL_M, h);
  g.fillStyle(0x000000, BEVEL_LO).fillRect(x, y + h - BEVEL_M, w, BEVEL_M).fillRect(x + w - BEVEL_M, y, BEVEL_M, h);
}

/** Offset (m, along x; y uses the light's ratio) of a round object's shadow at `heightM`. */
export function headShadowOffset(heightM: number): number {
  return (LIGHT_DIR.x * shadowLenPx(heightM)) / MAP_PX_PER_M;
}
