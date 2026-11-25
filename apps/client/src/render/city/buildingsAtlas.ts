import type * as Phaser from "phaser";
import { frameName, packAtlas, type FrameSpec, type PlacedFrame } from "./atlasLayout";
import { addGeneratedTexture } from "./canvasTexture";
import { drawBearTrap, drawInFrame, drawMine, drawSpikeTrap, type Ctx } from "./buildingArt";
import { FRONT_BASE_Y, SIDE_C, drawFrontIn, drawFrontOut, drawSide, inFrameCentred, type Style } from "./barricadeArt";
import { drawFloodlightFL1, drawFloodlightFL5, drawMedStation, drawPropInFrame } from "./propArt";
import { crossGreen, lampWhite, ledRed, relight, type Emissive, type Relit } from "./relight";
import type { GlowKind } from "../buildingFx";

/**
 * Story 5.9: the canvas atlas of the new buildings (`atlas_buildings`), drawn ONCE per game from the
 * code drawings in `buildingArt.ts` (textures outlive scene restarts; static frames, no per-tick
 * redraw). Frames follow the atlas rules (`category_name_variant`, ≤ 2048²). Story 4.12: the wood
 * barricade (B6) is code too (`objectArt.ts`), so the whole upgrade ladder B6 → B8 → M1c lives here.
 */
export const ATLAS_BUILDINGS = "atlas_buildings";
/** Pixels per metre of the frames (a 2 m wall = 192 px: crisp at DPR 2 on a phone). */
export const BUILDINGS_PX_PER_M = 96;

/**
 * Photoreal group 3 (approved 2026-11-25): the barricades stand. Each type (wood, reinforced, metal) has a picture per
 * rotation (rot 0 = front, outside: braces at the back; rot 2 = front, inside: braces and junk toward the camera;
 * rot 1 / 3 = side, braces east / west), in `STANDING_VARIANTS` random variants, never turned. A front picture is
 * 2 × 1 m with the footprint centre at `FRONT_BASE_Y` below its middle; a side picture is 1 × 2.8 m with the
 * footprint centre at `SIDE_C` below its middle.
 */
export const STANDING_VARIANTS = 2;
export type WallView = "out" | "in" | "sidee" | "sidew";
const STYLE_OF: Readonly<Record<string, Style>> = { wood_barricade: "wood", reinforced_barricade: "rf", metal_barricade: "mt" };
const STYLE_NAME: Readonly<Record<Style, string>> = { wood: "wood", rf: "reinforced", mt: "metal" };
/** The frame name of a standing barricade's picture. */
export function wallFrame(style: Style, view: WallView, variant: number): string {
  return frameName("building", "wall", `${STYLE_NAME[style]}${view}${variant}`);
}
export const FRONT_W_M = 2;
export const FRONT_H_M = 1;
export const SIDE_W_M = 1;
export const SIDE_H_M = 2.8;
/** The wood barricade's rot-0 picture (the pooled images' first frame). */
export const FRAME_WOOD = wallFrame("wood", "out", 0);
export const FRAME_SPIKE_TRAP = frameName("building", "spiketrap", "a");
export const FRAME_MINE = frameName("building", "mine", "a");
/** Story 5.10: FL1 tripod work light (base look) and FL5 stadium lamp (upgrade/skin look, unused for now). */
export const FRAME_FLOODLIGHT = frameName("prop", "floodlight", "a");
export const FRAME_FLOODLIGHT_B = frameName("prop", "floodlight", "b");
/** Story 5.10: the med station (designer's pick MS10: `propArt.ts › drawMedStation`). */
export const FRAME_MED_STATION = frameName("prop", "medstation", "a");
/** Story 5.14: the bear trap (designer's pick B-T1), open (armed) and closed (holding or sprung). */
export const FRAME_BEAR_TRAP_OPEN = frameName("building", "beartrap", "open");
export const FRAME_BEAR_TRAP_CLOSED = frameName("building", "beartrap", "closed");

interface ArtSpec {
  readonly frame: string;
  readonly wM: number;
  readonly hM: number;
  readonly draw: (g: Ctx, w: number, h: number) => void;
  /** Story 4.12: the drawing's frame helper (`objectArt` keeps its own pixel size). */
  readonly inFrame?: typeof drawInFrame;
  /** Photoreal group 3: drawn with the approved relit look (volumes, materials, glow, glints). */
  readonly relit?: { readonly dir: "x" | "y"; readonly seed: number; readonly glints: number; readonly emissive?: Emissive; readonly glow?: GlowKind; readonly srcPxPerM?: number };
}

/** The standing barricades' pictures (relit from a 192 px/m drawing: four times cheaper than the props, same look). */
function wallArt(): ArtSpec[] {
  const out: ArtSpec[] = [];
  const glints: Readonly<Record<Style, number>> = { wood: 6, rf: 16, mt: 10 };
  (["wood", "rf", "mt"] as const).forEach((st, si) => {
    for (let v = 0; v < STANDING_VARIANTS; v++) {
      const seed = 2000 + si * 100 + v * 10;
      const relit = (n: number) => ({ dir: "x" as const, seed: seed + n, glints: glints[st], srcPxPerM: 192 });
      out.push({ frame: wallFrame(st, "out", v), wM: FRONT_W_M, hM: FRONT_H_M, draw: (g) => drawFrontOut(g, st, 3 + v), inFrame: inFrameCentred, relit: relit(1) });
      out.push({ frame: wallFrame(st, "in", v), wM: FRONT_W_M, hM: FRONT_H_M, draw: (g) => drawFrontIn(g, st, 1 + v), inFrame: inFrameCentred, relit: relit(2) });
      out.push({ frame: wallFrame(st, "sidee", v), wM: SIDE_W_M, hM: SIDE_H_M, draw: (g) => drawSide(g, st, 1, 1 + v * 4), inFrame: inFrameCentred, relit: { ...relit(3), dir: "y" as const } });
      out.push({ frame: wallFrame(st, "sidew", v), wM: SIDE_W_M, hM: SIDE_H_M, draw: (g) => drawSide(g, st, -1, 2 + v * 4), inFrame: inFrameCentred, relit: { ...relit(4), dir: "y" as const } });
    }
  });
  return out;
}

/** Frame, size (the type's footprint at rot 0; a standing barricade's picture size) and drawing per frame. */
const ART: readonly ArtSpec[] = [
  ...wallArt(),
  { frame: FRAME_SPIKE_TRAP, wM: 2, hM: 2, draw: drawSpikeTrap, relit: { dir: "x", seed: 739, glints: 26, srcPxPerM: 256 } },
  { frame: FRAME_MINE, wM: 0.5, hM: 0.5, draw: drawMine, relit: { dir: "x", seed: 752, glints: 3, emissive: ledRed, glow: "blink" } },
  { frame: FRAME_FLOODLIGHT, wM: 1, hM: 1, draw: drawFloodlightFL1, inFrame: drawPropInFrame, relit: { dir: "y", seed: 791, glints: 4, emissive: lampWhite, glow: "flicker" } },
  { frame: FRAME_FLOODLIGHT_B, wM: 1, hM: 1, draw: drawFloodlightFL5, inFrame: drawPropInFrame, relit: { dir: "x", seed: 804, glints: 4, emissive: lampWhite, glow: "flicker" } },
  { frame: FRAME_MED_STATION, wM: 1, hM: 1, draw: drawMedStation, inFrame: drawPropInFrame, relit: { dir: "x", seed: 817, glints: 4, emissive: crossGreen, glow: "heartbeat" } },
  { frame: FRAME_BEAR_TRAP_OPEN, wM: 1, hM: 1, draw: (g, w, h) => drawBearTrap(g, w, h, false), relit: { dir: "x", seed: 765, glints: 12 } },
  { frame: FRAME_BEAR_TRAP_CLOSED, wM: 1, hM: 1, draw: (g, w, h) => drawBearTrap(g, w, h, true), relit: { dir: "x", seed: 778, glints: 8 } },
];

/** The atlas's frame specs (pure: tests check names and the ≤ 2048 rule). */
export function buildingsAtlasSpecs(): FrameSpec[] {
  return ART.map((a) => ({ name: a.frame, w: Math.round(a.wM * BUILDINGS_PX_PER_M), h: Math.round(a.hM * BUILDINGS_PX_PER_M) }));
}

/** Where a building type's art lives (texture key + frame), or null: drawn as the plank box (turret plate on top). */
export interface BuildingFrame {
  readonly texture: string;
  readonly frame: string;
}
const FRAMES: Readonly<Record<string, BuildingFrame>> = {
  wood_barricade: { texture: ATLAS_BUILDINGS, frame: FRAME_WOOD },
  reinforced_barricade: { texture: ATLAS_BUILDINGS, frame: wallFrame("rf", "out", 0) },
  metal_barricade: { texture: ATLAS_BUILDINGS, frame: wallFrame("mt", "out", 0) },
  spike_trap: { texture: ATLAS_BUILDINGS, frame: FRAME_SPIKE_TRAP },
  mine: { texture: ATLAS_BUILDINGS, frame: FRAME_MINE },
  floodlight: { texture: ATLAS_BUILDINGS, frame: FRAME_FLOODLIGHT },
  med_station: { texture: ATLAS_BUILDINGS, frame: FRAME_MED_STATION },
  bear_trap: { texture: ATLAS_BUILDINGS, frame: FRAME_BEAR_TRAP_OPEN },
};
const BEAR_TRAP_CLOSED: BuildingFrame = { texture: ATLAS_BUILDINGS, frame: FRAME_BEAR_TRAP_CLOSED };
/**
 * Story 5.14: `trapState` (the synced `trap`, 0 = armed) picks a bear trap's closed frame when it is
 * holding or sprung; every other type (and the build bar's icon, no state) gets its one frame.
 */
export function buildingFrame(type: string, trapState = 0): BuildingFrame | null {
  if (type === "bear_trap" && trapState !== 0) return BEAR_TRAP_CLOSED;
  return Object.prototype.hasOwnProperty.call(FRAMES, type) ? (FRAMES[type] as BuildingFrame) : null;
}

/** Photoreal group 3: the relit frames' glow (bloom) layer, pulsed additively by the view. */
export const ATLAS_BUILDINGS_GLOW = "atlas_buildings_glow";
/** A glint star (drawn additively over steel highlights): white core, soft halo, a thin cross. */
export const TEX_GLINT = "fx_glint";
const GLINT_PX = 32;

/** What the view animates on a relit frame (frame px of the 96 px/m frame, from its top-left). */
export interface BuildingFx {
  readonly glow: GlowKind;
  /** The glow frame in `ATLAS_BUILDINGS_GLOW`, or null when nothing glows. */
  readonly glowFrame: string | null;
  readonly glowAt: readonly [number, number, number];
  readonly spots: readonly (readonly [number, number])[];
}
const FX = new Map<string, BuildingFx>();
/** The animation data of a frame (filled when the atlas is drawn), or undefined. */
export function buildingFx(frame: string): BuildingFx | undefined {
  return FX.get(frame);
}

/** The relight source density: the approved proposal page's 384 px per metre (blur scale 2 at that density). */
const RELIGHT_SRC_PX_PER_M = 384;
const RELIGHT_SS = 2;
const relitCache = new Map<string, Relit>();
function relitOf(a: ArtSpec, make: (w: number, h: number) => HTMLCanvasElement): Relit {
  const hit = relitCache.get(a.frame);
  if (hit) return hit;
  const r = a.relit as NonNullable<ArtSpec["relit"]>;
  const w = Math.round(a.wM * BUILDINGS_PX_PER_M);
  const h = Math.round(a.hM * BUILDINGS_PX_PER_M);
  const srcPxPerM = r.srcPxPerM ?? RELIGHT_SRC_PX_PER_M;
  const k = srcPxPerM / BUILDINGS_PX_PER_M;
  const src = make(w * k, h * k);
  const sg = src.getContext("2d", { willReadFrequently: true }) as CanvasRenderingContext2D;
  // drawn at the game's 96 px per metre (its 1 px lines keep their weight), rasterised k× finer
  sg.scale(k, k);
  (a.inFrame ?? drawInFrame)(sg, 0, 0, w, h, BUILDINGS_PX_PER_M, (c) => a.draw(c, a.wM, a.hM));
  const out = relight(src, w, h, (RELIGHT_SS * srcPxPerM) / RELIGHT_SRC_PX_PER_M, { dir: r.dir, seed: r.seed, glints: r.glints, ...(r.emissive ? { emissive: r.emissive } : {}) }, make);
  relitCache.set(a.frame, out);
  FX.set(a.frame, { glow: r.glow ?? "none", glowFrame: out.bloom ? a.frame : null, glowAt: out.glowAt, spots: out.spots });
  return out;
}
const makeCanvas = (w: number, h: number): HTMLCanvasElement => {
  const c = document.createElement("canvas");
  c.width = w;
  c.height = h;
  return c;
};

/** A standing barricade's picture for a placed one: frame, display size (m) and origin (its footprint centre). */
export interface StandingFrame {
  readonly texture: string;
  readonly frame: string;
  readonly wM: number;
  readonly hM: number;
  readonly originX: number;
  readonly originY: number;
}
/** Is `type` drawn standing (one picture per rotation, never turned)? */
export function isStanding(type: string): boolean {
  return Object.prototype.hasOwnProperty.call(STYLE_OF, type);
}
/** Which variant a barricade at footprint corner (minX, minY) shows: fixed by its spot, the same on every client. */
export function wallVariant(minX: number, minY: number): number {
  const h = Math.imul(Math.round(minX * 4) * 73856093 ^ Math.round(minY * 4) * 19349663, 2654435761) >>> 0;
  return (h >>> 7) % STANDING_VARIANTS;
}
const ROT_VIEW: readonly WallView[] = ["out", "sidee", "in", "sidew"];
/** The picture of a standing barricade at `rot` (0–3), or null for a type that isn't drawn standing. */
export function standingFrame(type: string, rot: number, variant: number): StandingFrame | null {
  const st = STYLE_OF[type];
  if (st === undefined) return null;
  const view = ROT_VIEW[rot & 3] as WallView;
  const side = view === "sidee" || view === "sidew";
  const v = Math.max(0, Math.min(STANDING_VARIANTS - 1, variant | 0));
  return side
    ? { texture: ATLAS_BUILDINGS, frame: wallFrame(st, view, v), wM: SIDE_W_M, hM: SIDE_H_M, originX: 0.5, originY: 0.5 + SIDE_C / SIDE_H_M }
    : { texture: ATLAS_BUILDINGS, frame: wallFrame(st, view, v), wM: FRONT_W_M, hM: FRONT_H_M, originX: 0.5, originY: 0.5 + FRONT_BASE_Y / FRONT_H_M };
}

/**
 * The relit look costs about a second of work for the whole set (several on a phone), too long to block the game's
 * start. So the atlas starts with the plain code drawings (instant) and `pumpBuildingsAtlas` swaps each frame for its
 * relit picture a few at a time, frame by frame, refreshing the texture as it goes (usually done within the first
 * second or two of the build phase). A lost graphics context repaints whatever is ready.
 */
interface Bake {
  readonly queue: ArtSpec[];
  readonly canvas: HTMLCanvasElement;
  readonly frames: readonly PlacedFrame[];
  tex: Phaser.Textures.CanvasTexture | null;
  readonly glowCanvas: HTMLCanvasElement;
  readonly glowFrames: readonly PlacedFrame[];
  glowTex: Phaser.Textures.CanvasTexture | null;
}
let bake: Bake | null = null;

/**
 * Relights queued frames until `budgetMs` has passed (at least one per call) and refreshes the textures. Returns true
 * while frames are still waiting. Call it every frame (BuildingView does); `Infinity` finishes the whole set now.
 */
export function pumpBuildingsAtlas(budgetMs = 6): boolean {
  const b = bake;
  if (!b || b.queue.length === 0) return false;
  const t0 = performance.now();
  let dirty = false;
  let glowDirty = false;
  do {
    const a = b.queue.shift() as ArtSpec;
    const r = relitOf(a, makeCanvas);
    const f = b.frames.find((x) => x.name === a.frame);
    if (f) {
      const g = b.canvas.getContext("2d") as CanvasRenderingContext2D;
      g.clearRect(f.x, f.y, f.w, f.h);
      g.drawImage(r.base, f.x, f.y, f.w, f.h);
      dirty = true;
    }
    const gf = r.bloom ? b.glowFrames.find((x) => x.name === a.frame) : undefined;
    if (gf && r.bloom) {
      (b.glowCanvas.getContext("2d") as CanvasRenderingContext2D).drawImage(r.bloom, gf.x, gf.y, gf.w, gf.h);
      glowDirty = true;
    }
  } while (b.queue.length > 0 && performance.now() - t0 < budgetMs);
  if (dirty) b.tex?.refresh();
  if (glowDirty) b.glowTex?.refresh();
  return b.queue.length > 0;
}

/** Draws every frame into one canvas and registers it (idempotent). */
export function ensureBuildingsAtlas(scene: Phaser.Scene): void {
  if (scene.textures.exists(ATLAS_BUILDINGS)) return;
  const layout = packAtlas(buildingsAtlasSpecs());
  const canvas = document.createElement("canvas");
  canvas.width = layout.width;
  canvas.height = layout.height;
  // Story 4.13: redrawn in place after a lost graphics context (texture registry).
  const tex = addGeneratedTexture(
    scene,
    ATLAS_BUILDINGS,
    canvas,
    (g) => {
      for (const f of layout.frames) drawFrame(g, f);
    },
    (tex) => {
      for (const f of layout.frames) tex.add(f.name, 0, f.x, f.y, f.w, f.h);
    },
  );
  const sc = document.createElement("canvas");
  sc.width = GLINT_PX;
  sc.height = GLINT_PX;
  addGeneratedTexture(scene, TEX_GLINT, sc, (g) => {
    const c = GLINT_PX / 2;
    const rg = g.createRadialGradient(c, c, 0, c, c, c * 0.6);
    rg.addColorStop(0, "rgba(255,255,255,0.95)");
    rg.addColorStop(0.35, "rgba(210,228,255,0.35)");
    rg.addColorStop(1, "rgba(210,228,255,0)");
    g.fillStyle = rg;
    g.fillRect(0, 0, GLINT_PX, GLINT_PX);
    g.fillStyle = "rgba(255,255,255,0.7)";
    g.fillRect(0, c - 0.5, GLINT_PX, 1);
    g.fillRect(c - 0.5, 0, 1, GLINT_PX);
  });
  // the glow layer of the frames that have one (lamps, the med cross, the mine's LED)
  const glowSpecs = buildingsAtlasSpecs().filter((sp) => {
    const a = ART.find((x) => x.frame === sp.name);
    return a?.relit?.emissive !== undefined;
  });
  const gl = packAtlas(glowSpecs);
  const gc = document.createElement("canvas");
  gc.width = gl.width;
  gc.height = gl.height;
  const glowTex = addGeneratedTexture(
    scene,
    ATLAS_BUILDINGS_GLOW,
    gc,
    (g) => {
      for (const f of gl.frames) {
        const bloom = relitCache.get(f.name)?.bloom;
        if (bloom) g.drawImage(bloom, f.x, f.y, f.w, f.h);
      }
    },
    (tex) => {
      for (const f of gl.frames) tex.add(f.name, 0, f.x, f.y, f.w, f.h);
    },
  );
  bake = { queue: ART.filter((a) => a.relit !== undefined && !relitCache.has(a.frame)), canvas, frames: layout.frames, tex, glowCanvas: gc, glowFrames: gl.frames, glowTex };
}

function drawFrame(g: CanvasRenderingContext2D, f: PlacedFrame): void {
  const a = ART.find((s) => s.frame === f.name);
  if (!a) return;
  g.save();
  g.beginPath();
  g.rect(f.x, f.y, f.w, f.h);
  g.clip();
  const ready = relitCache.get(a.frame);
  if (ready) g.drawImage(ready.base, f.x, f.y, f.w, f.h);
  else (a.inFrame ?? drawInFrame)(g, f.x, f.y, f.w, f.h, BUILDINGS_PX_PER_M, (c) => a.draw(c, a.wM, a.hM));
  g.restore();
}
