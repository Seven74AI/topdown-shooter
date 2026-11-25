import type * as Phaser from "phaser";
import imageUrl from "./streetProps.webp?url";
import meta from "./streetProps.json";

/**
 * Story 9.14 (B1): the street props and vehicles ship as one pre-rendered image (`npm run art:street-props`, which
 * runs the approved pilot code offline). The Boot scene starts its download (`loadStreetProps`) while the title and the
 * start handlers are already up; a start request waits for the download to settle (`whenStreetPropsSettled`: loaded,
 * failed or timed out, review H1), never longer than `STREET_PROPS_TIMEOUT_MS`. `takeStreetProps` hands the decoded
 * image to the downtown atlas (`spriteAtlas.ts › ensureAtlases`), which paints its canvas from it through
 * `addGeneratedTexture` (a lost graphics context repaints it from the image, AC 3) and drops the loader's own texture
 * (one GPU copy, not two). Frame names and sizes are the atlas's (B2). Without the image the atlas is drawn from code
 * (B8).
 */
export const STREET_PROPS_KEY = "street_props_src";
/** The downtown atlas's texture key (`spriteAtlas.ts › ATLAS_DOWNTOWN`; not imported: that module imports this one). */
const DOWNTOWN_KEY = "atlas_downtown";
/** Review H1: the longest a start waits for the image (then the code drawings are used and a late image is dropped). */
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

/** idle: not asked yet; loading; ready: the loader has it; failed: error, timeout, or the atlas was already built. */
export type StreetPropsState = "idle" | "loading" | "ready" | "failed";
let state: StreetPropsState = "idle";
let image: HTMLImageElement | null = null;
let timer: ReturnType<typeof setTimeout> | null = null;
const waiters: (() => void)[] = [];

export function streetPropsState(): StreetPropsState {
  return state;
}

function settle(textures: Phaser.Textures.TextureManager, ok: boolean): void {
  if (state !== "loading") {
    // review H1 / NEW-3: an image that lands after the timeout is never used: drop it
    if (textures.exists(STREET_PROPS_KEY)) textures.remove(STREET_PROPS_KEY);
    return;
  }
  if (timer !== null) clearTimeout(timer);
  timer = null;
  state = ok ? "ready" : "failed";
  if (!ok) {
    if (textures.exists(STREET_PROPS_KEY)) textures.remove(STREET_PROPS_KEY);
    console.warn("street props atlas did not load: drawing the street props from code (Story 9.14 B8)"); // review L7
  }
  for (const w of waiters.splice(0)) w();
}

/**
 * Starts the atlas image's download once per page (nothing when it is under way, done, failed, or the downtown atlas
 * already exists). `start`: false from a `preload` (the scene manager starts the loader and waits for it there);
 * true from `create` (the download runs in the background: the scene is already up). Success is heard on the game's
 * texture manager (review NEW-3: it outlives the scene, so a late image is still seen and dropped after a Boot
 * restart), failure on the scene's loader or the timer.
 */
export function loadStreetProps(scene: Phaser.Scene, start = true, timeoutMs = STREET_PROPS_TIMEOUT_MS): void {
  if (state !== "idle") return;
  const textures = scene.textures;
  if (textures.exists(DOWNTOWN_KEY)) {
    state = "failed"; // the atlas was drawn already (from code): nothing would use the image
    return;
  }
  state = "loading";
  timer = setTimeout(() => settle(textures, false), timeoutMs);
  textures.once(`addtexture-${STREET_PROPS_KEY}`, () => settle(textures, true));
  scene.load.on("loaderror", (file: { key?: string }) => {
    if (file.key === STREET_PROPS_KEY) settle(textures, false);
  });
  scene.load.image(STREET_PROPS_KEY, imageUrl, { responseType: "blob", timeout: timeoutMs });
  if (start) scene.load.start();
}

/** Runs `fn` once the download has settled (now when it has, or was never asked). Never drops a request (review H1). */
export function whenStreetPropsSettled(fn: () => void): void {
  if (state === "loading") waiters.push(fn);
  else fn();
}

/**
 * The loaded atlas image, or null (not loaded: the atlas falls back to the code drawings). The first call takes the
 * image from the loader's texture and removes that texture; the image stays here for repaints.
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
  if (timer !== null) clearTimeout(timer);
  timer = null;
  state = "idle";
  image = null;
  waiters.length = 0;
}
