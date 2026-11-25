import type * as Phaser from "phaser";
import imageUrl from "./streetProps.webp?url";
import meta from "./streetProps.json";

/**
 * Story 9.14 (B1): the street props and vehicles ship as one pre-rendered image (`npm run art:street-props`, which
 * runs the approved pilot code offline). The Boot scene starts its download (`loadStreetProps`) and never waits for it
 * (B26): a run uses the image if it is in when the run builds its city (`spriteAtlas.ts › ensureAtlases` →
 * `takeStreetProps`), else the code drawings for that run (B8); the next run picks the image up once it has landed.
 * The atlas paints its canvas from the image through `addGeneratedTexture` (a lost graphics context repaints it, AC 3)
 * and drops the loader's own texture (one GPU copy, not two). Frame names and sizes are the atlas's (B2).
 */
export const STREET_PROPS_KEY = "street_props_src";
/** The download's XHR timeout (a hung request ends as a failure; nothing waits for it). */
export const STREET_PROPS_TIMEOUT_MS = 12_000;

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

/** idle: not asked yet; loading; ready: the image is in (on the loader's texture until taken); failed: it won't come. */
export type StreetPropsState = "idle" | "loading" | "ready" | "failed";
let state: StreetPropsState = "idle";
let image: HTMLImageElement | null = null;

export function streetPropsState(): StreetPropsState {
  return state;
}

function settle(textures: Phaser.Textures.TextureManager, ok: boolean): void {
  if (state !== "loading") return;
  state = ok ? "ready" : "failed";
  if (!ok) {
    if (textures.exists(STREET_PROPS_KEY)) textures.remove(STREET_PROPS_KEY);
    console.warn("street props atlas did not load: drawing the street props from code (Story 9.14 B8)"); // review L7
  }
}

/**
 * Starts the atlas image's download once per page (nothing when it is under way, done or failed). `start`: false from
 * a `preload` (the scene manager starts the loader and waits for it there); true from `create` (a background download:
 * nothing waits for it). Success is heard on the game's texture manager (it outlives the scene: an image that lands
 * after a Boot restart is still kept for the next run, review NEW-3); failure on the scene's loader: an error, or the
 * load ending without the texture (an image that downloads but doesn't decode, re-review B).
 */
export function loadStreetProps(scene: Phaser.Scene, start = true): void {
  if (state !== "idle") return;
  const textures = scene.textures;
  state = "loading";
  textures.once(`addtexture-${STREET_PROPS_KEY}`, () => settle(textures, true));
  scene.load.on("loaderror", (file: { key?: string }) => {
    if (file.key === STREET_PROPS_KEY) settle(textures, false);
  });
  scene.load.once("complete", () => settle(textures, textures.exists(STREET_PROPS_KEY)));
  scene.load.image(STREET_PROPS_KEY, imageUrl, { responseType: "blob", timeout: STREET_PROPS_TIMEOUT_MS });
  if (start) scene.load.start();
}

/**
 * The atlas image if it is in, else null (the run draws its street props from code). The first call takes the image
 * from the loader's texture and removes that texture; the image stays here for repaints and later runs.
 */
export function takeStreetProps(scene: Phaser.Scene): HTMLImageElement | null {
  if (image) return image;
  if (state !== "ready" || !scene.textures.exists(STREET_PROPS_KEY)) return null;
  const src = scene.textures.get(STREET_PROPS_KEY).getSourceImage();
  if (typeof HTMLImageElement !== "undefined" && src instanceof HTMLImageElement && src.naturalWidth === STREET_PROPS_WIDTH && src.naturalHeight === STREET_PROPS_HEIGHT) image = src;
  scene.textures.remove(STREET_PROPS_KEY);
  if (!image) state = "failed";
  return image;
}

/** Tests: back to a fresh page. */
export function resetStreetPropsForTests(): void {
  state = "idle";
  image = null;
}
