import type * as Phaser from "phaser";
import { frameName, packAtlas, variantLetter, type PlacedFrame } from "./atlasLayout";
import { addCanvasTexture } from "./canvasTexture";
import { drawSandbags } from "./spriteArt";

/**
 * Story 4.11: the stage-object atlas, the game's first LOADED art (architecture § Asset loading:
 * Phaser Loader, `public/assets/atlases/`). Made from the designer's Meshy references by
 * `tools/art/build_sprites.py` (true colours, strictly top-down, no baked shadow: the game casts
 * shadows by height). `BootScene.preload` loads it; if the file is missing, `ensureObjectsAtlas`
 * registers procedural frames under the same key and names, so nothing ever shows Phaser's
 * missing-texture box.
 */
export const ATLAS_OBJECTS = "atlas_objects";
/** Served by Vite from `apps/client/public/` at the build's BASE_URL. */
export const OBJECTS_ATLAS_FILE = "assets/atlases/objects";

/** Stage-3 sandbags (map cover, 3 × 1 m), drawn into the downtown atlas → the city bake. */
export const OBJ_SANDBAGS = frameName("prop", "sandbags", "a");
/** The player-built wood barricade (2 × 0.5 m): stakes along +x, struts toward −y (the back). */
export const OBJ_BARRICADE = frameName("building", "barricade", "a");
export const FLAME_VARIANTS = 4;
export const SMOKE_VARIANTS = 4;
export const FLAME_FRAMES: readonly string[] = Array.from({ length: FLAME_VARIANTS }, (_, i) => frameName("fx", "flame", variantLetter(i)));
export const SMOKE_FRAMES: readonly string[] = Array.from({ length: SMOKE_VARIANTS }, (_, i) => frameName("fx", "smoke", variantLetter(i)));

/** Frame sizes in px (the build script's output; a test checks the committed JSON against them). */
export const OBJECT_FRAME_PX: Readonly<Record<string, readonly [number, number]>> = {
  [OBJ_SANDBAGS]: [192, 64], // 3 × 1 m at 64 px/m
  [OBJ_BARRICADE]: [192, 48], // 2 × 0.5 m at 96 px/m (a live sprite: phones zoom ~70–105 px/m)
  ...Object.fromEntries(FLAME_FRAMES.map((n) => [n, [64, 64] as const])),
  ...Object.fromEntries(SMOKE_FRAMES.map((n) => [n, [128, 128] as const])),
};

/** Queues the atlas on the scene's loader (call from a `preload`). */
export function preloadObjectsAtlas(scene: Phaser.Scene, baseUrl: string): void {
  if (scene.textures.exists(ATLAS_OBJECTS)) return;
  scene.load.atlas(ATLAS_OBJECTS, `${baseUrl}${OBJECTS_ATLAS_FILE}.png`, `${baseUrl}${OBJECTS_ATLAS_FILE}.json`);
}

/** True when every frame the game uses exists on the texture. */
function complete(scene: Phaser.Scene): boolean {
  if (!scene.textures.exists(ATLAS_OBJECTS)) return false;
  const t = scene.textures.get(ATLAS_OBJECTS);
  return Object.keys(OBJECT_FRAME_PX).every((n) => t.has(n));
}

/**
 * Makes sure `atlas_objects` exists with every frame (idempotent): the loaded file, or procedural
 * stand-ins drawn after the references (sandbags rows, a stake palisade, soft flame and smoke
 * blobs) when the file failed to load. Returns true when the loaded art is in use.
 */
export function ensureObjectsAtlas(scene: Phaser.Scene): boolean {
  if (complete(scene)) return !fallbackMade;
  if (scene.textures.exists(ATLAS_OBJECTS)) scene.textures.remove(ATLAS_OBJECTS);
  const specs = Object.entries(OBJECT_FRAME_PX).map(([name, [w, h]]) => ({ name, w, h }));
  const layout = packAtlas(specs);
  const canvas = document.createElement("canvas");
  canvas.width = layout.width;
  canvas.height = layout.height;
  const g = canvas.getContext("2d") as CanvasRenderingContext2D;
  for (const f of layout.frames) {
    g.save();
    g.beginPath();
    g.rect(f.x, f.y, f.w, f.h);
    g.clip();
    drawFallback(g, f);
    g.restore();
  }
  const tex = addCanvasTexture(scene, ATLAS_OBJECTS, canvas);
  if (tex) for (const f of layout.frames) tex.add(f.name, 0, f.x, f.y, f.w, f.h);
  fallbackMade = true;
  return false;
}
let fallbackMade = false;

/** A frame's pixels for drawing into a 2D canvas (the downtown atlas copies the sandbags). */
export interface FrameSource {
  readonly image: CanvasImageSource;
  readonly x: number;
  readonly y: number;
  readonly w: number;
  readonly h: number;
}

export function objectsFrameSource(scene: Phaser.Scene, name: string): FrameSource | null {
  if (!scene.textures.exists(ATLAS_OBJECTS)) return null;
  const t = scene.textures.get(ATLAS_OBJECTS);
  if (!t.has(name)) return null;
  const f = t.get(name);
  return { image: f.source.image as CanvasImageSource, x: f.cutX, y: f.cutY, w: f.cutWidth, h: f.cutHeight };
}

function drawFallback(g: CanvasRenderingContext2D, f: PlacedFrame): void {
  const { x, y, w, h } = f;
  if (f.name === OBJ_SANDBAGS) {
    g.translate(x, y);
    g.scale(w / 96, h / 32);
    drawSandbags(g, 96, 32);
  } else if (f.name === OBJ_BARRICADE) {
    // struts (back, −y), then a row of sharpened stakes over the front 70 %
    g.strokeStyle = "#4a3f33";
    g.lineWidth = h * 0.12;
    for (let k = 0; k < 4; k++) {
      const sx = x + w * (0.12 + 0.25 * k);
      g.beginPath();
      g.moveTo(sx, y + h * 0.55);
      g.lineTo(sx + w * 0.06, y + h * 0.05);
      g.stroke();
    }
    const n = 14;
    const sw = w / n;
    for (let i = 0; i < n; i++) {
      const sx = x + i * sw;
      g.fillStyle = i % 2 ? "#5b5045" : "#665a4d";
      g.beginPath();
      g.moveTo(sx + 1, y + h);
      g.lineTo(sx + 1, y + h * 0.42);
      g.lineTo(sx + sw / 2, y + h * 0.22);
      g.lineTo(sx + sw - 1, y + h * 0.42);
      g.lineTo(sx + sw - 1, y + h);
      g.closePath();
      g.fill();
    }
    g.fillStyle = "#3e352c";
    g.fillRect(x, y + h * 0.62, w, h * 0.12);
  } else {
    const flame = FLAME_FRAMES.includes(f.name);
    const gr = g.createRadialGradient(x + w / 2, y + h / 2, 0, x + w / 2, y + h / 2, w / 2);
    if (flame) {
      gr.addColorStop(0, "rgba(255,240,190,1)");
      gr.addColorStop(0.35, "rgba(255,150,40,0.85)");
      gr.addColorStop(1, "rgba(200,40,10,0)");
    } else {
      gr.addColorStop(0, "rgba(232,232,236,0.8)");
      gr.addColorStop(0.6, "rgba(232,232,236,0.35)");
      gr.addColorStop(1, "rgba(232,232,236,0)");
    }
    g.fillStyle = gr;
    g.fillRect(x, y, w, h);
  }
}
