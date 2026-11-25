/**
 * Story 7.9 T6 (AC 12, D3): a survivor's close-up for the lobby card — the whole body with its pack and the plain gun,
 * drawn once per look code into a DOM canvas and cached as a data URL (the `weaponIconUrl` pattern; a DOM <img>, not a
 * Phaser texture). Turned like the SC3 drawing (gun up and to the left). The slot ring is the card's CSS, not here.
 */
import { DEFAULT_LOOK, catalogueParts, decodeLook, encodeLook, type CosmeticSlot } from "@topdown/shared";
import { drawSurvivor } from "./spriteArt";
import { resolveLook } from "./survivorLook";

/** Canvas side in px (shown at ≤ 168 CSS px: sharp on a 2× phone at the card sizes the lobby uses). */
export const PORTRAIT_PX = 256;
/** Survivor radius in the portrait: the plain gun reaches ~2.05 r ahead, the pack ~1 r behind. */
const PORTRAIT_R = PORTRAIT_PX / 4.6;
/** The SC3 pose: facing up and a little left. */
const PORTRAIT_ANGLE = -Math.PI / 2 - 0.42;
/** Looks kept (a lobby has ≤ 4; a few more for rejoins). */
const MAX_CACHED = 16;

const ANY_PART = catalogueParts();
const urls = new Map<string, string>();

/** The portrait's data URL for a look code ("" = default), or null without a DOM (tests, workers). */
export function survivorPortraitUrl(code: string, makeCanvas: () => HTMLCanvasElement | null = () => (typeof document === "undefined" ? null : document.createElement("canvas"))): string | null {
  const cached = urls.get(code);
  if (cached) return cached;
  const cv = makeCanvas();
  const g = cv?.getContext("2d");
  if (!cv || !g) return null;
  cv.width = PORTRAIT_PX;
  cv.height = PORTRAIT_PX;
  g.translate(PORTRAIT_PX / 2, PORTRAIT_PX / 2);
  g.rotate(PORTRAIT_ANGLE);
  g.translate(-PORTRAIT_R * 0.5, 0); // centre the body + gun, not the head
  drawSurvivor(g, PORTRAIT_R, undefined, undefined, resolveLook(decodeLook(code, ANY_PART).look, 1), true); // still picture: layers drawn in
  const url = cv.toDataURL("image/png");
  if (urls.size >= MAX_CACHED) urls.delete(urls.keys().next().value as string);
  urls.set(code, url);
  return url;
}

/** Tests: forget the cache. */
export function clearPortraitCache(): void {
  urls.clear();
}

/**
 * Stories 7.11 / 7.12: the Results picture of a part (`slot:id`): the default survivor wearing it, drawn like the lobby
 * portrait (null without a DOM or for an unknown key). 7.10's `partTileUrl` close-up replaces it when 7.10 lands.
 */
export function itemPortraitUrl(partKey: string, makeCanvas?: () => HTMLCanvasElement | null): string | null {
  const [slot, id] = partKey.split(":") as [CosmeticSlot, string | undefined];
  if (!id || !ANY_PART.has(partKey) || !(slot in DEFAULT_LOOK)) return null;
  return survivorPortraitUrl(encodeLook({ ...DEFAULT_LOOK, [slot]: id }), makeCanvas);
}
