import type * as Phaser from "phaser";
import { ZOMBIE_TYPES, type ZombieTypeId } from "@topdown/shared";
import { frameName, packAtlas, variantLetter, type FrameSpec, type PlacedFrame } from "./atlasLayout";
import { CAR_COLORS } from "./dressing";
import { addCanvasTexture } from "./canvasTexture";
import { OBJ_SANDBAGS, ensureObjectsAtlas, objectsFrameSource, type FrameSource } from "./objectsAtlas";
import { WEAPON_ART } from "./weaponArt";
import { CHAR_EXTENT_R, drawBarrier, drawBlock, drawBus, drawCar, drawDumpster, drawPump, drawSandbags, drawSurvivor, drawZombie } from "./spriteArt";

/**
 * Story 4.9: the placeholder atlases, drawn procedurally into canvases and registered as Phaser
 * textures with named frames (D3). Texture keys and frame names are the final ones: Epic 9 loads
 * `public/assets/atlases/{characters,downtown,fx}.png/.json` under the same keys instead.
 */

export const ATLAS_CHARACTERS = "atlas_characters";
export const ATLAS_DOWNTOWN = "atlas_downtown";
export const ATLAS_FX = "atlas_fx";

/** Collision radius in frame px (characters are drawn in radius units, so the frame fits every balance radius). */
export const CHAR_R_PX = 34;
/** Walker/runner/crawler variants (clothes); the survivor has one. */
export const ZOMBIE_VARIANTS: Readonly<Record<ZombieTypeId, number>> = { walker: 4, runner: 2, crawler: 2 };

/** Frame names per zombie type (built once: views never build strings per frame). */
export const ZOMBIE_FRAMES: Readonly<Record<ZombieTypeId, readonly string[]>> = Object.fromEntries(
  ZOMBIE_TYPES.map((t) => [t, Array.from({ length: ZOMBIE_VARIANTS[t] }, (_, i) => frameName("zombie", t, variantLetter(i)))]),
) as unknown as Record<ZombieTypeId, readonly string[]>;
export const SURVIVOR_FRAME = frameName("survivor", "body", "a");
/**
 * Story 5.3: the survivor holding a weapon with its own art (`weaponArt.ts`), by weapon id:
 * `survivor_shotgun_a`, `survivor_assault_rifle_a`. Other weapons use `SURVIVOR_FRAME`.
 */
export const SURVIVOR_WEAPON_FRAMES: Readonly<Record<string, string>> = Object.fromEntries(Object.keys(WEAPON_ART).map((w) => [w, frameName("survivor", w, "a")]));
/** The survivor frame for the active weapon (no string building per frame). */
export const survivorFrameFor = (weapon: string): string => SURVIVOR_WEAPON_FRAMES[weapon] ?? SURVIVOR_FRAME;

/** Downtown vehicles and props: frame name → native size in map px (32 px = 1 m). */
export const VEHICLE_BUS = frameName("vehicle", "bus", "a");
export const CAR_FRAMES: readonly string[] = CAR_COLORS.map((_, i) => frameName("vehicle", "car", variantLetter(i)));
export const PROP_PUMP = frameName("prop", "pump", "a");
export const PROP_BARRIER = frameName("prop", "barrier", "a");
export const PROP_SANDBAGS = frameName("prop", "sandbags", "a");
/** Story 4.5's `block` mutations: the dumpster, and a generic blockage for any other block. */
export const PROP_DUMPSTER = frameName("prop", "dumpster", "a");
export const PROP_BLOCK = frameName("prop", "block", "a");
const PROP_NATIVE: Readonly<Record<string, readonly [number, number]>> = {
  [VEHICLE_BUS]: [320, 80],
  ...Object.fromEntries(CAR_FRAMES.map((n) => [n, [144, 64] as const])),
  [PROP_PUMP]: [64, 32],
  [PROP_BARRIER]: [192, 16],
  [PROP_SANDBAGS]: [96, 32],
  [PROP_DUMPSTER]: [48, 48],
  [PROP_BLOCK]: [48, 48],
};
/** Downtown atlas px per map px (64 px per metre). */
export const DOWNTOWN_ATLAS_SCALE = 2;

export const FX_RAIN = frameName("fx", "rain", "a");
export const FX_SPLASH = frameName("fx", "splash", "a");
export const FX_GLOW = frameName("fx", "glow", "a");
export const FX_VIGNETTE = frameName("fx", "vignette", "a");
/** Story 4.11: a white edge band (opaque at its top, clear at its bottom), tinted for the burning screen-edge glow. */
export const FX_EDGE = frameName("fx", "edge", "a");
const FX_SIZE: Readonly<Record<string, readonly [number, number]>> = {
  [FX_RAIN]: [4, 28],
  [FX_SPLASH]: [40, 20],
  [FX_GLOW]: [64, 64],
  [FX_VIGNETTE]: [8, 64],
  [FX_EDGE]: [8, 64],
};

export interface AtlasCanvas {
  readonly canvas: HTMLCanvasElement;
  readonly frames: ReadonlyMap<string, PlacedFrame>;
}

/** The frame specs of each atlas (pure: tests check names and sizes). */
export function characterSpecs(): FrameSpec[] {
  const out: FrameSpec[] = [];
  for (const t of ZOMBIE_TYPES) {
    const side = Math.ceil(2 * CHAR_EXTENT_R[t] * CHAR_R_PX);
    for (const name of ZOMBIE_FRAMES[t]) out.push({ name, w: side, h: side });
  }
  const s = Math.ceil(2 * CHAR_EXTENT_R.survivor * CHAR_R_PX);
  out.push({ name: SURVIVOR_FRAME, w: s, h: s });
  for (const name of Object.values(SURVIVOR_WEAPON_FRAMES)) out.push({ name, w: s, h: s });
  return out;
}
export function downtownSpecs(): FrameSpec[] {
  return Object.entries(PROP_NATIVE).map(([name, [w, h]]) => ({ name, w: w * DOWNTOWN_ATLAS_SCALE, h: h * DOWNTOWN_ATLAS_SCALE }));
}
export function fxSpecs(): FrameSpec[] {
  return Object.entries(FX_SIZE).map(([name, [w, h]]) => ({ name, w, h }));
}

/** Native size (map px) of a downtown frame. */
export function nativeSize(frame: string): readonly [number, number] {
  return PROP_NATIVE[frame] ?? [32, 32];
}

function build(specs: FrameSpec[], draw: (g: CanvasRenderingContext2D, f: PlacedFrame) => void): AtlasCanvas {
  const layout = packAtlas(specs);
  const canvas = document.createElement("canvas");
  canvas.width = layout.width;
  canvas.height = layout.height;
  const g = canvas.getContext("2d") as CanvasRenderingContext2D;
  const frames = new Map<string, PlacedFrame>();
  for (const f of layout.frames) {
    frames.set(f.name, f);
    g.save();
    g.beginPath();
    g.rect(f.x, f.y, f.w, f.h);
    g.clip();
    draw(g, f);
    g.restore();
  }
  return { canvas, frames };
}

function zombieOf(name: string): { type: ZombieTypeId; variant: number } | null {
  for (const t of ZOMBIE_TYPES) {
    const i = ZOMBIE_FRAMES[t].indexOf(name);
    if (i >= 0) return { type: t, variant: i };
  }
  return null;
}

function drawCharacterFrame(g: CanvasRenderingContext2D, f: PlacedFrame): void {
  g.translate(f.x + f.w / 2, f.y + f.h / 2);
  if (f.name === SURVIVOR_FRAME) return drawSurvivor(g, CHAR_R_PX);
  for (const [weapon, name] of Object.entries(SURVIVOR_WEAPON_FRAMES)) {
    const art = WEAPON_ART[weapon];
    if (name === f.name && art) return drawSurvivor(g, CHAR_R_PX, (c, r) => art(c, "held", r));
  }
  const z = zombieOf(f.name);
  if (z) drawZombie(g, z.type, CHAR_R_PX, z.variant);
}

/** Story 4.11: loaded frames that replace a procedural downtown frame (the sandbags). */
let downtownSources: ReadonlyMap<string, FrameSource> = new Map();

function drawDowntownFrame(g: CanvasRenderingContext2D, f: PlacedFrame): void {
  const src = downtownSources.get(f.name);
  if (src) {
    g.drawImage(src.image, src.x, src.y, src.w, src.h, f.x, f.y, f.w, f.h);
    return;
  }
  const [w, h] = nativeSize(f.name);
  g.translate(f.x, f.y);
  g.scale(DOWNTOWN_ATLAS_SCALE, DOWNTOWN_ATLAS_SCALE);
  if (f.name === VEHICLE_BUS) drawBus(g, w, h);
  else if (f.name === PROP_PUMP) drawPump(g, w, h);
  else if (f.name === PROP_BARRIER) drawBarrier(g, w, h);
  else if (f.name === PROP_SANDBAGS) drawSandbags(g, w, h);
  else if (f.name === PROP_DUMPSTER) drawDumpster(g, w, h);
  else if (f.name === PROP_BLOCK) drawBlock(g, w, h);
  else {
    const v = CAR_FRAMES.indexOf(f.name);
    if (v >= 0) {
      g.translate(w / 2, h / 2);
      drawCar(g, w, h, v);
    }
  }
}

function drawFxFrame(g: CanvasRenderingContext2D, f: PlacedFrame): void {
  const { x, y, w, h } = f;
  if (f.name === FX_RAIN) {
    const gr = g.createLinearGradient(0, y, 0, y + h);
    gr.addColorStop(0, "rgba(190,210,230,0)");
    gr.addColorStop(1, "rgba(190,210,230,1)");
    g.fillStyle = gr;
    g.fillRect(x + 1, y, w - 2, h);
  } else if (f.name === FX_SPLASH) {
    g.strokeStyle = "rgba(200,220,240,1)";
    g.lineWidth = 2;
    g.beginPath();
    g.ellipse(x + w / 2, y + h / 2, w / 2 - 2, h / 2 - 2, 0, 0, Math.PI * 2);
    g.stroke();
  } else if (f.name === FX_GLOW) {
    const gr = g.createRadialGradient(x + w / 2, y + h / 2, 0, x + w / 2, y + h / 2, w / 2);
    gr.addColorStop(0, "rgba(255,255,255,1)");
    gr.addColorStop(0.45, "rgba(255,255,255,0.45)");
    gr.addColorStop(1, "rgba(255,255,255,0)");
    g.fillStyle = gr;
    g.fillRect(x, y, w, h);
  } else if (f.name === FX_EDGE) {
    const gr = g.createLinearGradient(0, y, 0, y + h);
    gr.addColorStop(0, "rgba(255,255,255,1)");
    gr.addColorStop(0.45, "rgba(255,255,255,0.35)");
    gr.addColorStop(1, "rgba(255,255,255,0)");
    g.fillStyle = gr;
    g.fillRect(x, y, w, h);
  } else if (f.name === FX_VIGNETTE) {
    // one edge band (dark at the top, clear at the bottom); the view lays four around the screen
    const gr = g.createLinearGradient(0, y, 0, y + h);
    gr.addColorStop(0, "rgba(0,0,0,0.5)");
    gr.addColorStop(0.55, "rgba(0,0,0,0.16)");
    gr.addColorStop(1, "rgba(0,0,0,0)");
    g.fillStyle = gr;
    g.fillRect(x, y, w, h);
  }
}

let downtownAtlas: AtlasCanvas | null = null;

/** Registers a canvas as a texture with its frames (once per game: textures outlive scene restarts). */
function register(scene: Phaser.Scene, key: string, make: () => AtlasCanvas): AtlasCanvas | null {
  if (scene.textures.exists(key)) return null;
  const a = make();
  const tex = addCanvasTexture(scene, key, a.canvas);
  if (tex) for (const f of a.frames.values()) tex.add(f.name, 0, f.x, f.y, f.w, f.h);
  return a;
}

/** Creates the three atlases (idempotent) and returns the downtown one (the static bake draws from it). */
export function ensureAtlases(scene: Phaser.Scene): AtlasCanvas {
  // Story 4.11: the loaded stage-object atlas (or its stand-ins) first: the downtown atlas copies its sandbags.
  ensureObjectsAtlas(scene);
  if (!scene.textures.exists(ATLAS_DOWNTOWN)) {
    const sandbags = objectsFrameSource(scene, OBJ_SANDBAGS);
    downtownSources = sandbags ? new Map([[PROP_SANDBAGS, sandbags]]) : new Map();
  }
  register(scene, ATLAS_CHARACTERS, () => build(characterSpecs(), drawCharacterFrame));
  register(scene, ATLAS_FX, () => build(fxSpecs(), drawFxFrame));
  const d = register(scene, ATLAS_DOWNTOWN, () => build(downtownSpecs(), drawDowntownFrame));
  if (d) downtownAtlas = d;
  if (!downtownAtlas) downtownAtlas = build(downtownSpecs(), drawDowntownFrame);
  return downtownAtlas;
}
