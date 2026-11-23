import type * as Phaser from "phaser";
import { frameName, packAtlas, variantLetter, type FrameSpec, type PlacedFrame } from "./atlasLayout";
import { addCanvasTexture } from "./canvasTexture";
import { EMBER_STOPS, FIRE_LIGHT_STOPS, FLAME_SPRITE_PX, FLAME_VARIANTS, SMOKE_SPRITE_PX, SMOKE_VARIANTS, flameMasks, smokeMask, type RadialStops } from "./fireSprites";

/**
 * Story 4.12: the fire's particle sprites as one canvas atlas (`atlas_firefx`), made ONCE per page
 * from the pure masks of `fireSprites.ts` (textures outlive scene restarts). Flames and smoke are
 * white with the shape in alpha (the views tint them per particle); the spark and the ground light
 * carry their own colours. Frames follow the atlas rules (`category_name_variant`, ≤ 2048²).
 */
export const ATLAS_FIREFX = "atlas_firefx";
export const FIRE_FLAME_FRAMES: readonly string[] = Array.from({ length: FLAME_VARIANTS }, (_, i) => frameName("fx", "fireflame", variantLetter(i)));
export const FIRE_SMOKE_FRAMES: readonly string[] = Array.from({ length: SMOKE_VARIANTS }, (_, i) => frameName("fx", "firesmoke", variantLetter(i)));
export const FX_FIRE_EMBER = frameName("fx", "fireember", "a");
export const FX_FIRE_LIGHT = frameName("fx", "firelight", "a");
const EMBER_PX = 32;
const LIGHT_PX = 128;

/** The atlas's frames (pure: a test checks names and the ≤ 2048 rule). */
export function fireFxSpecs(): FrameSpec[] {
  return [
    ...FIRE_FLAME_FRAMES.map((name) => ({ name, w: FLAME_SPRITE_PX, h: FLAME_SPRITE_PX })),
    ...FIRE_SMOKE_FRAMES.map((name) => ({ name, w: SMOKE_SPRITE_PX, h: SMOKE_SPRITE_PX })),
    { name: FX_FIRE_EMBER, w: EMBER_PX, h: EMBER_PX },
    { name: FX_FIRE_LIGHT, w: LIGHT_PX, h: LIGHT_PX },
  ];
}

/** Registers the atlas (idempotent). */
export function ensureFireFxAtlas(scene: Phaser.Scene): void {
  if (scene.textures.exists(ATLAS_FIREFX)) return;
  const layout = packAtlas(fireFxSpecs());
  const canvas = document.createElement("canvas");
  canvas.width = layout.width;
  canvas.height = layout.height;
  const g = canvas.getContext("2d") as CanvasRenderingContext2D;
  for (const f of layout.frames) drawFrame(g, f);
  const tex = addCanvasTexture(scene, ATLAS_FIREFX, canvas);
  if (tex) for (const f of layout.frames) tex.add(f.name, 0, f.x, f.y, f.w, f.h);
}

function putMask(g: CanvasRenderingContext2D, f: PlacedFrame, mask: Float32Array): void {
  const im = g.createImageData(f.w, f.h);
  const d = im.data;
  for (let i = 0; i < f.w * f.h; i++) {
    d[i * 4] = 255;
    d[i * 4 + 1] = 255;
    d[i * 4 + 2] = 255;
    d[i * 4 + 3] = Math.round(Math.min(1, Math.max(0, mask[i] as number)) * 255);
  }
  g.putImageData(im, f.x, f.y);
}

function radial(g: CanvasRenderingContext2D, f: PlacedFrame, stops: RadialStops): void {
  const cx = f.x + f.w / 2;
  const cy = f.y + f.h / 2;
  const gr = g.createRadialGradient(cx, cy, 0, cx, cy, f.w / 2);
  for (const [o, r, gg, b, a] of stops) gr.addColorStop(o, `rgba(${r},${gg},${b},${a})`);
  g.fillStyle = gr;
  g.fillRect(f.x, f.y, f.w, f.h);
}

function drawFrame(g: CanvasRenderingContext2D, f: PlacedFrame): void {
  const fi = FIRE_FLAME_FRAMES.indexOf(f.name);
  if (fi >= 0) return putMask(g, f, flameMasks()[fi] as Float32Array);
  const si = FIRE_SMOKE_FRAMES.indexOf(f.name);
  if (si >= 0) return putMask(g, f, smokeMask(si));
  if (f.name === FX_FIRE_EMBER) return radial(g, f, EMBER_STOPS);
  if (f.name === FX_FIRE_LIGHT) radial(g, f, FIRE_LIGHT_STOPS);
}
