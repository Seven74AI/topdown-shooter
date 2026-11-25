import type * as Phaser from "phaser";
import imageUrl from "./streetProps.webp?url";
import meta from "./streetProps.json";

/**
 * Story 9.14 (B1): the street props and vehicles ship as one pre-rendered image (`npm run art:street-props`, which
 * runs the approved pilot code offline). The Boot scene's loader fetches it (`queueStreetProps`); `takeStreetProps`
 * hands the decoded image to the downtown atlas (`spriteAtlas.ts › ensureAtlases`), which paints its canvas from it
 * through `addGeneratedTexture` (so a lost graphics context repaints it from the image, AC 3) and drops the loader's
 * own texture (one GPU copy, not two). Frame names and sizes are the atlas's (B2).
 */
export const STREET_PROPS_KEY = "street_props_src";

export interface StreetPropsFrame {
  readonly x: number;
  readonly y: number;
  readonly w: number;
  readonly h: number;
}
export const STREET_PROPS_WIDTH: number = meta.width;
export const STREET_PROPS_HEIGHT: number = meta.height;
export const STREET_PROPS_FRAMES: Readonly<Record<string, StreetPropsFrame>> = meta.frames;
/** Lamp spots per police picture (frame px), found by the tool in the rendered picture. */
export const STREET_PROPS_LAMPS: Readonly<Record<string, readonly (readonly number[])[]>> = meta.lamps;

let image: HTMLImageElement | null = null;

/** Queues the atlas image on a scene's loader (call from `preload`); nothing once it's in hand. */
export function queueStreetProps(scene: Phaser.Scene): void {
  if (image || scene.textures.exists(STREET_PROPS_KEY)) return;
  scene.load.image(STREET_PROPS_KEY, imageUrl);
}

/**
 * The loaded atlas image, or null when it isn't loaded (a failed download: the atlas falls back to the code drawings).
 * The first call takes the image from the loader's texture and removes that texture; the image stays here for repaints.
 */
export function takeStreetProps(scene: Phaser.Scene): HTMLImageElement | null {
  if (image) return image;
  if (!scene.textures.exists(STREET_PROPS_KEY)) return null;
  const src = scene.textures.get(STREET_PROPS_KEY).getSourceImage();
  if (typeof HTMLImageElement !== "undefined" && src instanceof HTMLImageElement && src.naturalWidth === STREET_PROPS_WIDTH && src.naturalHeight === STREET_PROPS_HEIGHT) image = src;
  scene.textures.remove(STREET_PROPS_KEY);
  return image;
}
