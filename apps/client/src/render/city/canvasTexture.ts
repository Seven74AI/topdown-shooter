import type * as Phaser from "phaser";
import { RebuildPhase, textureRegistry } from "../gfx/textureRegistry";

/**
 * Story 4.9 review (M memory): `textures.addCanvas` makes a `CanvasTexture`, whose constructor keeps a
 * full `getImageData` copy of the canvas (`imageData`, `data`, `pixels`, `buffer`) for pixel access
 * we never use; `refresh()` only re-uploads the canvas (it never reads that copy, Phaser 4.2.1
 * `CanvasTexture.js`). Dropping the copy saves w × h × 4 bytes per texture (8.6 MB per 1272 × 1696
 * tile). Do not call `CanvasTexture.update()` / `getPixel()` on these textures.
 */
export function addCanvasTexture(scene: Phaser.Scene, key: string, canvas: HTMLCanvasElement): Phaser.Textures.CanvasTexture | null {
  const tex = scene.textures.addCanvas(key, canvas);
  if (tex) {
    const t = tex as unknown as { imageData: unknown; data: unknown; pixels: unknown; buffer: unknown };
    t.imageData = null;
    t.data = null;
    t.pixels = null;
    t.buffer = null;
  }
  return tex;
}

/** Lets the browser free a canvas's pixels at once (Safari keeps them until the size is 0). */
export function releaseCanvas(canvas: HTMLCanvasElement): void {
  canvas.width = 0;
  canvas.height = 0;
}

/**
 * Story 4.13: a canvas texture drawn by `paint` (the whole canvas, from game code) that the texture
 * registry can draw again after a lost WebGL context or a lost 2D canvas (`render/gfx/textureRegistry.ts`).
 * Paints now, adds the texture (frames via `addFrames`) and registers the repaint: the canvas is reset
 * to its size (transparent, fresh state, even after the browser emptied it), painted again and re-uploaded.
 * Keeps no copy of the pixels. Returns null when `key` already exists (nothing is registered then).
 */
export function addGeneratedTexture(
  scene: Phaser.Scene,
  key: string,
  canvas: HTMLCanvasElement,
  paint: (g: CanvasRenderingContext2D) => void,
  addFrames?: (tex: Phaser.Textures.CanvasTexture) => void,
  phase: RebuildPhase = RebuildPhase.atlas,
): Phaser.Textures.CanvasTexture | null {
  if (scene.textures.exists(key)) return null;
  const w = canvas.width;
  const h = canvas.height;
  paint(canvas.getContext("2d") as CanvasRenderingContext2D);
  const tex = addCanvasTexture(scene, key, canvas);
  if (!tex) return null;
  addFrames?.(tex);
  const probe = probeFor(canvas, tex);
  textureRegistry.register(
    key,
    phase,
    () => {
      canvas.width = w; // resets the canvas (also restores a size the browser dropped)
      canvas.height = h;
      paint(canvas.getContext("2d") as CanvasRenderingContext2D);
      tex.refresh();
    },
    [canvas],
    probe,
  );
  return tex;
}

/** Frames whose centre pixel is checked by the probe (a few reads of 1 px each, never the whole canvas). */
const PROBE_FRAMES = 6;

/**
 * Story 4.13: a cheap "are the pixels still there?" check for a painted canvas: remembers up to
 * PROBE_FRAMES frame centres that are opaque now; later, any of them reading transparent means the
 * browser emptied the canvas (Android may do that to GPU canvases in the background). undefined
 * when no opaque centre was found (nothing to check).
 */
function probeFor(canvas: HTMLCanvasElement, tex: Phaser.Textures.CanvasTexture): (() => boolean) | undefined {
  const g = canvas.getContext("2d");
  if (!g) return undefined;
  const pts: [number, number][] = [];
  const candidates: [number, number][] = [];
  for (const name of tex.getFrameNames()) {
    const f = tex.get(name);
    candidates.push([f.cutX + (f.cutWidth >> 1), f.cutY + (f.cutHeight >> 1)]);
  }
  if (candidates.length === 0) candidates.push([canvas.width >> 1, canvas.height >> 1]);
  try {
    for (const [x, y] of candidates) {
      if (pts.length >= PROBE_FRAMES) break;
      if ((g.getImageData(x, y, 1, 1).data[3] ?? 0) > 0) pts.push([x, y]);
    }
  } catch {
    return undefined; // a tainted or lost canvas: no probe
  }
  if (pts.length === 0) return undefined;
  return () => {
    if (canvas.width === 0) return false;
    const c = canvas.getContext("2d");
    if (!c) return false;
    for (const [x, y] of pts) if ((c.getImageData(x, y, 1, 1).data[3] ?? 0) === 0) return false;
    return true;
  };
}

let mirrorSeq = 0;
const mirrorKeys = new WeakMap<HTMLCanvasElement, string>();

/**
 * Story 10.2 (T3, GPU darkness): a texture of a canvas that ANOTHER owner paints and registers for repaint (the light
 * stamps, the fog ring and noise: `textureRegistry` phase `cache` draws them again). On a restore this only re-uploads
 * the canvas (phase `atlas`, after its owner's repaint); it never resets or paints it. One texture per canvas per
 * page (the key is kept). `refreshMirror` re-uploads after the owner repainted it at run time (the fog ring).
 */
export function addMirrorTexture(scene: Phaser.Scene, canvas: HTMLCanvasElement): string {
  let key = mirrorKeys.get(canvas);
  if (key && scene.textures.exists(key)) return key;
  key ??= `fx_mirror_${mirrorSeq++}`;
  mirrorKeys.set(canvas, key);
  const tex = addCanvasTexture(scene, key, canvas);
  if (tex) textureRegistry.register(key, RebuildPhase.atlas, () => tex.refresh(), []);
  return key;
}

/** Re-uploads a mirror texture after its owner repainted the canvas. */
export function refreshMirror(scene: Phaser.Scene, canvas: HTMLCanvasElement): void {
  const key = mirrorKeys.get(canvas);
  if (key && scene.textures.exists(key)) (scene.textures.get(key) as Phaser.Textures.CanvasTexture).refresh();
}

/**
 * Story 10.2 (T3): a GPU texture its owner draws EVERY frame (the blackout darkness and its fog), made here so the
 * Story 4.13 rule holds (one place makes textures). Its registry entry repaints nothing: the next frame draws it
 * again after a lost context. Replaces a leftover of the same key (a restarted scene's). Null without WebGL.
 */
export function addFrameTexture(scene: Phaser.Scene, key: string, w: number, h: number): Phaser.Textures.DynamicTexture | null {
  if (scene.textures.exists(key)) scene.textures.remove(key);
  const dt = scene.textures.addDynamicTexture(key, w, h);
  if (dt) textureRegistry.register(key, RebuildPhase.bake, () => {}, []);
  return dt;
}

/** Drops a frame texture and its registry entry. */
export function removeFrameTexture(scene: Phaser.Scene, key: string): void {
  textureRegistry.unregister(key);
  if (scene.textures.exists(key)) scene.textures.remove(key);
}
