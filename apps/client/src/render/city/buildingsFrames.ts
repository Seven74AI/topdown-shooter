/**
 * Photoreal group 3: the buildings atlas's frames and drawings, and one frame's relight (`bakeSteps`). Pure: no
 * Phaser, no DOM, so the bake worker can import it (review R1/R2). `buildingsAtlas.ts` re-exports all of it.
 */
import { frameName, type FrameSpec } from "./atlasLayout";
import { drawBearTrap, drawInFrame, drawMine, drawSpikeTrap, type Ctx } from "./buildingArt";
import { CB, FRONT_BASE_Y, SIDE_C, drawCorner, drawFrontIn, drawFrontOut, drawSide, inFrameCentred, type Style } from "./barricadeArt";
import type { CornerKind } from "../wallCorners";
import { drawFloodlightFL1, drawFloodlightFL5, drawMedStation, drawPropInFrame } from "./propArt";
import { crossGreen, lampWhite, ledRed, relightSteps, type Emissive, type Relit } from "./relight";
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
/**
 * Review R1 (re-review 2): the buildings' pictures live on several sheets (textures), so a relit picture landing
 * re-uploads only its sheet (about a fifth of the whole set): the traps and props on `atlas_buildings`, each
 * barricade style's pictures on their own.
 */
export const WALL_SHEETS = { wood: "atlas_buildings_wood", rf: "atlas_buildings_reinforced", mt: "atlas_buildings_metal" } as const;
export type WallView = "out" | "in" | "sidee" | "sidew" | "cnw" | "cne" | "csw" | "cse";
const STYLE_OF: Readonly<Record<string, Style>> = { wood_barricade: "wood", reinforced_barricade: "rf", metal_barricade: "mt" };
const STYLE_NAME: Readonly<Record<Style, string>> = { wood: "wood", rf: "reinforced", mt: "metal" };
/** Every sheet's texture key. */
export const BUILDING_SHEETS: readonly string[] = ["atlas_buildings", WALL_SHEETS.wood, WALL_SHEETS.rf, WALL_SHEETS.mt];
/** The texture (sheet) a frame lives on. */
export function textureOfFrame(frame: string): string {
  const m = /^building_wall_(wood|reinforced|metal)/.exec(frame);
  if (!m) return ATLAS_BUILDINGS;
  return m[1] === "wood" ? WALL_SHEETS.wood : m[1] === "reinforced" ? WALL_SHEETS.rf : WALL_SHEETS.mt;
}
/** The frame name of a standing barricade's picture. */
export function wallFrame(style: Style, view: WallView, variant: number): string {
  return frameName("building", "wall", `${STYLE_NAME[style]}${view}${variant}`);
}
export const FRONT_W_M = 2;
export const FRONT_H_M = 1;
export const SIDE_W_M = 1;
export const SIDE_H_M = 2.8;
/** A corner piece: 1.4 × 2 m, its square's centre at `CB` below its middle. */
export const CORNER_W_M = 1.4;
export const CORNER_H_M = 2;
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

export interface ArtSpec {
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
    // the corner pieces (one look each: the front stub shows its inside on the north corners, its outside on the south)
    for (const [kind, h, v] of [["nw", 1, 1], ["ne", -1, 1], ["sw", 1, -1], ["se", -1, -1]] as const) {
      out.push({ frame: wallFrame(st, `c${kind}`, 0), wM: CORNER_W_M, hM: CORNER_H_M, draw: (g) => drawCorner(g, st, h, v, v > 0), inFrame: inFrameCentred, relit: { dir: "x" as const, seed: 2090 + si * 100 + h + v * 3, glints: 3, srcPxPerM: 192 } });
    }
  });
  return out;
}

/** Frame, size (the type's footprint at rot 0; a standing barricade's picture size) and drawing per frame. */
export const ART_SPECS: readonly ArtSpec[] = [
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
  return specsOf(ART_SPECS);
}
/** One sheet\'s frame specs. */
export function sheetSpecs(sheet: string): FrameSpec[] {
  return specsOf(ART_SPECS.filter((a) => textureOfFrame(a.frame) === sheet));
}
function specsOf(list: readonly ArtSpec[]): FrameSpec[] {
  return list.map((a) => ({ name: a.frame, w: Math.round(a.wM * BUILDINGS_PX_PER_M), h: Math.round(a.hM * BUILDINGS_PX_PER_M) }));
}

/** Where a building type's art lives (texture key + frame), or null: drawn as the plank box (turret plate on top). */
export interface BuildingFrame {
  readonly texture: string;
  readonly frame: string;
}
const FRAMES: Readonly<Record<string, BuildingFrame>> = {
  wood_barricade: { texture: WALL_SHEETS.wood, frame: FRAME_WOOD },
  reinforced_barricade: { texture: WALL_SHEETS.rf, frame: wallFrame("rf", "out", 0) },
  metal_barricade: { texture: WALL_SHEETS.mt, frame: wallFrame("mt", "out", 0) },
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

/** The relight source density: the approved proposal page's 384 px per metre (blur scale 2 at that density). */
export const RELIGHT_SRC_PX_PER_M = 384;
export const RELIGHT_SS = 2;
/**
 * One frame's relight, resumable (review M1): draws the source, then advances `relightSteps` a row at a time; each
 * yield is the work done (source pixels). Pure (no Phaser, no DOM: `make` makes the canvases), so the bake worker
 * (`buildingsBakeWorker.ts`) runs it too. The source canvas is emptied when done or abandoned (review R4).
 */
export function* bakeSteps(a: ArtSpec, make: (w: number, h: number) => HTMLCanvasElement): Generator<number, Relit, void> {
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
  try {
    yield (src.width * src.height) >> 3;
    return yield* relightSteps(src, w, h, (RELIGHT_SS * srcPxPerM) / RELIGHT_SRC_PX_PER_M, { dir: r.dir, seed: r.seed, glints: r.glints, ...(r.emissive ? { emissive: r.emissive } : {}) }, make);
  } finally {
    src.width = 0;
    src.height = 0;
  }
}
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
/** The corner piece of a standing type, for a corner square (`wallCorners.ts › findCorners`), or null. */
export function cornerFrame(type: string, kind: CornerKind): StandingFrame | null {
  const st = STYLE_OF[type];
  if (st === undefined) return null;
  return { texture: WALL_SHEETS[st], frame: wallFrame(st, `c${kind}`, 0), wM: CORNER_W_M, hM: CORNER_H_M, originX: 0.5, originY: 0.5 + CB / CORNER_H_M };
}
/** The picture of a standing barricade at `rot` (0–3), or null for a type that isn't drawn standing. */
export function standingFrame(type: string, rot: number, variant: number): StandingFrame | null {
  const st = STYLE_OF[type];
  if (st === undefined) return null;
  const view = ROT_VIEW[rot & 3] as WallView;
  const side = view === "sidee" || view === "sidew";
  const v = Math.max(0, Math.min(STANDING_VARIANTS - 1, variant | 0));
  return side
    ? { texture: WALL_SHEETS[st], frame: wallFrame(st, view, v), wM: SIDE_W_M, hM: SIDE_H_M, originX: 0.5, originY: 0.5 + SIDE_C / SIDE_H_M }
    : { texture: WALL_SHEETS[st], frame: wallFrame(st, view, v), wM: FRONT_W_M, hM: FRONT_H_M, originX: 0.5, originY: 0.5 + FRONT_BASE_Y / FRONT_H_M };
}

/** Every frame drawn with the relit look. */
export function relitSpecs(): readonly ArtSpec[] {
  return ART_SPECS.filter((a) => a.relit !== undefined);
}

