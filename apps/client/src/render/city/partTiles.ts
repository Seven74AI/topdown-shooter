/**
 * Story 7.10 (AC 5; LK2, LS1): the editor's part tiles — one survivor picture per part, drawn with Story 7.8's part
 * functions, turned like the lobby portrait (facing up) and zoomed on the slot (Head, Hair, Skin: the head; Top, Pack:
 * the whole body). One cached data URL per part, look and state (the `weaponIconUrl` pattern: a DOM picture, not a
 * Phaser texture, so no `addGeneratedTexture`); one reused canvas draws them all.
 *
 * - owned: the part as worn, in my colours;
 * - milestone (LK2): the same picture darkened; the lock and the "how to get it" line are the editor's markup;
 * - loot (LS1): a flat dark silhouette (no part colour survives), the "?" is the editor's markup.
 */
import { COSMETICS, cosmeticPart, encodeLook, type CosmeticSlot, type SurvivorLook } from "@topdown/shared";
import { drawSurvivor } from "./spriteArt";
import { resolveLook } from "./survivorLook";

/** Tile canvas side (shown at 52–64 CSS px: sharp on a 2× phone). */
export const TILE_PX = 128;
/** LK2: the darkening laid over a locked milestone part (only over the drawing, not the empty tile). */
export const LOCKED_SHADE = "rgba(6, 7, 9, 0.5)";
/** LS1: the loot silhouette's one flat colour (a shade lighter than the tile face so the shape reads on it). */
export const SILHOUETTE = "#33383f";
/** Pictures kept (a tab has ≤ 21 parts; a few looks' worth). */
const MAX_CACHED = 160;

export type TileArtState = "owned" | "milestone" | "loot";

/** The slots whose tiles zoom on the head. */
const HEAD_ZOOM: ReadonlySet<CosmeticSlot> = new Set<CosmeticSlot>(["head", "hair", "skin"]);

/** The look a tile shows: my draft wearing `id` in `slot` (a hair tile takes its hat off so the hair shows). */
export function tileLook(slot: CosmeticSlot, id: string, draft: SurvivorLook): SurvivorLook {
  const look = { ...draft, [slot]: id } as SurvivorLook;
  if (slot === "hair" && cosmeticPart("head", look.head)?.hidesHair) return { ...look, head: "none" };
  return look;
}

/** Draws a tile into `g` (a TILE_PX square, cleared first). Exported for the raster tests. */
export function drawTile(g: CanvasRenderingContext2D, slot: CosmeticSlot, id: string, draft: SurvivorLook, state: TileArtState): void {
  g.setTransform(1, 0, 0, 1, 0, 0);
  g.globalCompositeOperation = "source-over";
  g.clearRect(0, 0, TILE_PX, TILE_PX);
  const look = resolveLook(tileLook(slot, id, draft), 1);
  g.save();
  g.translate(TILE_PX / 2, TILE_PX / 2);
  g.rotate(-Math.PI / 2); // facing up
  if (HEAD_ZOOM.has(slot)) {
    const r = TILE_PX / 1.85;
    g.translate(-r * 0.14, 0); // the head's centre (skin circle at x 0.14 r) in the middle
    drawSurvivor(g, r, undefined, undefined, look, true);
  } else {
    // the body fills the tile (the gun runs off the top edge); a Pack tile sits a little lower so the pack shows whole
    const r = TILE_PX / 3.1;
    g.translate(slot === "pack" ? r * 0.05 : -r * 0.3, 0);
    drawSurvivor(g, r, undefined, undefined, look, true);
  }
  g.restore();
  if (state === "owned") return;
  // milestone: darken only where the survivor was drawn; loot: every drawn pixel becomes the flat silhouette colour.
  g.globalCompositeOperation = state === "loot" ? "source-in" : "source-atop";
  g.fillStyle = state === "loot" ? SILHOUETTE : LOCKED_SHADE;
  g.fillRect(0, 0, TILE_PX, TILE_PX);
  g.globalCompositeOperation = "source-over";
}

const urls = new Map<string, string>();
let shared: HTMLCanvasElement | null = null;

const domCanvas = (): HTMLCanvasElement | null => (typeof document === "undefined" ? null : document.createElement("canvas"));

/**
 * The tile's data URL, or null without a DOM (tests, workers). A loot tile's key leaves the colours out (its
 * silhouette has none).
 */
export function partTileUrl(slot: CosmeticSlot, id: string, draft: SurvivorLook, state: TileArtState, makeCanvas: () => HTMLCanvasElement | null = domCanvas): string | null {
  const look = tileLook(slot, id, draft);
  const code = state === "loot" ? encodeLook({ ...look, colours: COSMETICS.defaultLook.colours }) : encodeLook(look);
  const key = `${slot}|${state}|${code}`;
  const cached = urls.get(key);
  if (cached) {
    urls.delete(key); // most recently used last
    urls.set(key, cached);
    return cached;
  }
  if (shared === null) shared = makeCanvas();
  const cv = shared;
  const g = cv?.getContext("2d");
  if (!cv || !g) return null;
  cv.width = TILE_PX;
  cv.height = TILE_PX;
  drawTile(g, slot, id, state === "loot" ? { ...draft, colours: COSMETICS.defaultLook.colours } : draft, state);
  const url = cv.toDataURL("image/png");
  if (urls.size >= MAX_CACHED) urls.delete(urls.keys().next().value as string);
  urls.set(key, url);
  return url;
}

/** Tests: forget the cache and the shared canvas. */
export function clearTileCache(): void {
  urls.clear();
  shared = null;
}

/** Tests: pictures held. */
export const tileCacheSize = (): number => urls.size;
