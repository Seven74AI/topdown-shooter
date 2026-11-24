/**
 * Story 7.8: the survivor, one function per slot (top, headgear, hair, backpack, accent, skin). Facing +x, centred
 * on the body, `r` = collision radius in px; built only from `spriteArt.ts`'s helpers. `drawSurvivor` (spriteArt.ts)
 * calls them in the game's order: weapon back piece → held gun → arms → backpack → top body → accent → head (skin)
 * → hair → headgear. The default parts are today's survivor, stroke for stroke (pixel-identical, raster test).
 *
 * Every function leaves the line state as it found it: `lineJoin = "round"`, outline colour and width, `lineCap`
 * "butt" (the order and the values matter for pixel identity).
 */
import { CHAR, circle, ell, rrect } from "./spriteArt";
import { cosmeticPart, type CosmeticSlot } from "@topdown/shared";
import type { ResolvedLook } from "./survivorLook";

type G = CanvasRenderingContext2D;

/** Outline width for survivor parts (today's `max(1, 0.08 r)`). */
export function outlineWidth(r: number): number {
  return Math.max(1, r * 0.08);
}
function resetLine(c: G, r: number): void {
  c.lineCap = "butt";
  c.strokeStyle = CHAR.outline;
  c.lineWidth = outlineWidth(r);
}

/** Top slot, under the backpack: the two arms (sleeves in the top colour). */
export function drawArms(c: G, r: number, partId: string, colour: string): void {
  void partId;
  c.strokeStyle = colour;
  c.lineCap = "round";
  c.lineWidth = r * 0.3;
  c.beginPath();
  c.moveTo(0, -r * 0.6);
  c.lineTo(r * 0.85, -r * 0.1);
  c.moveTo(0, r * 0.6);
  c.lineTo(r * 0.55, r * 0.12);
  c.stroke();
  resetLine(c, r);
}

/** Top slot, over the backpack: the body. */
export function drawTop(c: G, r: number, partId: string, colour: string): void {
  void partId;
  c.fillStyle = colour;
  ell(c, -r * 0.05, 0, r * 0.52, r * 0.9);
  c.fill();
  c.stroke();
}

/** Backpack slot ("none" draws nothing). A weapon's back piece replaces it (the caller skips it). */
export function drawPack(c: G, r: number, partId: string): void {
  if (partId === "none") return;
  c.fillStyle = CHAR.pack;
  rrect(c, -r * 0.98, -r * 0.48, r * 0.5, r * 0.96, r * 0.15);
  c.fill();
}

/** Accent slot ("none" draws nothing), drawn over the body. */
export function drawAccent(c: G, r: number, partId: string, colour: string): void {
  if (partId === "none") return;
  void colour;
}

/** Skin slot: the head. */
export function drawSkin(c: G, r: number, _partId: string, colour: string): void {
  c.fillStyle = colour;
  circle(c, r * 0.12, 0, r * 0.4);
  c.fill();
  c.stroke();
}

/** Hair slot (the caller skips it when the headgear hides the hair). */
export function drawHair(c: G, r: number, partId: string, colour: string): void {
  c.fillStyle = colour;
  void partId;
  ell(c, r * 0.02, 0, r * 0.34, r * 0.39);
  c.fill();
}

/** Headgear slot ("none" draws nothing). */
export function drawHead(c: G, r: number, partId: string, colour: string): void {
  if (partId === "none") return;
  c.fillStyle = colour;
  ell(c, r * 0.02, 0, r * 0.36, r * 0.4);
  c.fill();
  c.beginPath();
  c.ellipse(r * 0.38, 0, r * 0.16, r * 0.3, 0, -Math.PI / 2, Math.PI / 2);
  c.fill();
}

/** The picker colour a part takes (catalogue `colour`); fixed-colour parts get the accent colour, unused. */
export function partColour(look: ResolvedLook, slot: CosmeticSlot, partId: string): string {
  const k = cosmeticPart(slot, partId)?.colour;
  return k === "top" ? look.colours.top : k === "hair" ? look.colours.hair : look.colours.accent;
}
