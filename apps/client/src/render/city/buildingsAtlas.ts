import type * as Phaser from "phaser";
import { frameName, packAtlas, type FrameSpec, type PlacedFrame } from "./atlasLayout";
import { addGeneratedTexture } from "./canvasTexture";
import { drawBearTrap, drawInFrame, drawMetalBarricade, drawMine, drawReinforcedBarricade, drawSpikeTrap, type Ctx } from "./buildingArt";
import { drawObjectInFrame, drawWoodBarricade } from "./objectArt";
import { drawFloodlightFL1, drawFloodlightFL5, drawMedStation, drawPropInFrame } from "./propArt";

/**
 * Story 5.9: the canvas atlas of the new buildings (`atlas_buildings`), drawn ONCE per game from the
 * code drawings in `buildingArt.ts` (textures outlive scene restarts; static frames, no per-tick
 * redraw). Frames follow the atlas rules (`category_name_variant`, ≤ 2048²). Story 4.12: the wood
 * barricade (B6) is code too (`objectArt.ts`), so the whole upgrade ladder B6 → B8 → M1c lives here.
 */
export const ATLAS_BUILDINGS = "atlas_buildings";
/** Pixels per metre of the frames (a 2 m wall = 192 px: crisp at DPR 2 on a phone). */
export const BUILDINGS_PX_PER_M = 96;

/** Story 4.12: B6, drawn in code (it replaced 4.11's loaded `building_barricade_a` sprite). */
export const FRAME_WOOD = frameName("building", "barricade", "wood");
export const FRAME_REINFORCED = frameName("building", "barricade", "reinforced");
export const FRAME_METAL = frameName("building", "barricade", "metal");
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
}

/** Frame, size (the type's footprint at rot 0) and drawing per frame. */
const ART: readonly ArtSpec[] = [
  { frame: FRAME_WOOD, wM: 2, hM: 0.5, draw: drawWoodBarricade, inFrame: drawObjectInFrame },
  { frame: FRAME_REINFORCED, wM: 2, hM: 0.5, draw: drawReinforcedBarricade },
  { frame: FRAME_METAL, wM: 2, hM: 0.5, draw: drawMetalBarricade },
  { frame: FRAME_SPIKE_TRAP, wM: 2, hM: 2, draw: drawSpikeTrap },
  { frame: FRAME_MINE, wM: 0.5, hM: 0.5, draw: drawMine },
  { frame: FRAME_FLOODLIGHT, wM: 1, hM: 1, draw: drawFloodlightFL1, inFrame: drawPropInFrame },
  { frame: FRAME_FLOODLIGHT_B, wM: 1, hM: 1, draw: drawFloodlightFL5, inFrame: drawPropInFrame },
  { frame: FRAME_MED_STATION, wM: 1, hM: 1, draw: drawMedStation, inFrame: drawPropInFrame },
  { frame: FRAME_BEAR_TRAP_OPEN, wM: 1, hM: 1, draw: (g, w, h) => drawBearTrap(g, w, h, false) },
  { frame: FRAME_BEAR_TRAP_CLOSED, wM: 1, hM: 1, draw: (g, w, h) => drawBearTrap(g, w, h, true) },
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
  reinforced_barricade: { texture: ATLAS_BUILDINGS, frame: FRAME_REINFORCED },
  metal_barricade: { texture: ATLAS_BUILDINGS, frame: FRAME_METAL },
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

/** Draws every frame into one canvas and registers it (idempotent). */
export function ensureBuildingsAtlas(scene: Phaser.Scene): void {
  if (scene.textures.exists(ATLAS_BUILDINGS)) return;
  const layout = packAtlas(buildingsAtlasSpecs());
  const canvas = document.createElement("canvas");
  canvas.width = layout.width;
  canvas.height = layout.height;
  // Story 4.13: redrawn in place after a lost graphics context (texture registry).
  addGeneratedTexture(
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
}

function drawFrame(g: CanvasRenderingContext2D, f: PlacedFrame): void {
  const a = ART.find((s) => s.frame === f.name);
  if (!a) return;
  g.save();
  g.beginPath();
  g.rect(f.x, f.y, f.w, f.h);
  g.clip();
  (a.inFrame ?? drawInFrame)(g, f.x, f.y, f.w, f.h, BUILDINGS_PX_PER_M, (c) => a.draw(c, a.wM, a.hM));
  g.restore();
}
