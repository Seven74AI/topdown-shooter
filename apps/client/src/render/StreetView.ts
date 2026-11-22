import type * as Phaser from "phaser";
import type { DistrictMap, MapBox } from "@topdown/shared";

const ASPHALT = 0x1c1f22;
const GRID = 0x2a2e33;
const BORDER = 0x5a6068;
const GRID_STEP_M = 4;
const BORDER_M = 0.1; // thin line at the very edge, so the survivor (radius 0.4) never looks like it stands on it

/** Story 4.1 placeholder look (Story 4.9 does the Dead City look): ground props of `stage1_evening` by kind. */
const PROP_FILL: Readonly<Record<string, readonly [number, number]>> = {
  sidewalk: [0x34383d, 1],
  forecourt: [0x2a2d31, 1],
  lot: [0x25282c, 1],
  crosswalk: [0x6b6f74, 0.55],
  lane: [0x8a7a3a, 0.8],
  canopy: [0x4a5560, 0.35],
};
const SOLID = 0x3b3f46;
const SOLID_EDGE = 0x15171a;
const BUS = 0x8a6a1e;
const BUS_EDGE = 0x3a2c0a;
const COVER_EDGE = 0x9aa3ad;
const HAZARD = 0x7a2a1a;
const EDGE_M = 0.12;

const fill = (g: Phaser.GameObjects.Graphics, b: MapBox): void => {
  g.fillRect(b.minX, b.minY, b.maxX - b.minX, b.maxY - b.minY);
};
const stroke = (g: Phaser.GameObjects.Graphics, b: MapBox, w: number): void => {
  g.strokeRect(b.minX + w / 2, b.minY + w / 2, b.maxX - b.minX - w, b.maxY - b.minY - w);
};

/**
 * The district, drawn once (static; no per-frame cost): asphalt with a faint 4 m grid (to judge
 * speed), the `stage1_evening` ground props, hazard zones (faint), the collision boxes as blocks
 * (the bus in its own colour) and the cover objects as outlines (data only until Story 4.2).
 */
export function drawStreet(scene: Phaser.Scene, map: DistrictMap): Phaser.GameObjects.Graphics {
  const g = scene.add.graphics().setDepth(0);
  g.fillStyle(ASPHALT, 1).fillRect(0, 0, map.widthM, map.heightM);
  for (const p of map.stages[0] ?? []) {
    const style = PROP_FILL[p.kind];
    if (style) g.fillStyle(style[0], style[1]).fillRect(p.minX, p.minY, p.maxX - p.minX, p.maxY - p.minY);
  }
  g.lineStyle(0.04, GRID, 1);
  for (let x = GRID_STEP_M; x < map.widthM; x += GRID_STEP_M) g.lineBetween(x, 0, x, map.heightM);
  for (let y = GRID_STEP_M; y < map.heightM; y += GRID_STEP_M) g.lineBetween(0, y, map.widthM, y);
  g.fillStyle(HAZARD, 0.12);
  for (const h of map.hazards) fill(g, h);
  const busNames = new Set(map.cover.filter((c) => c.kind === "bus").map((c) => `${c.minX},${c.minY},${c.maxX},${c.maxY}`));
  for (const s of map.solids) {
    const bus = busNames.has(`${s.minX},${s.minY},${s.maxX},${s.maxY}`);
    g.fillStyle(bus ? BUS : SOLID, 1);
    fill(g, s);
    g.lineStyle(EDGE_M, bus ? BUS_EDGE : SOLID_EDGE, 1);
    stroke(g, s, EDGE_M);
  }
  for (const c of map.cover) {
    if (c.kind === "bus" || c.minStage > 1) continue; // the bus is drawn as its collision box; later stages: Story 4.5
    g.lineStyle(0.08, COVER_EDGE, 0.7);
    stroke(g, c, 0.08);
  }
  g.lineStyle(BORDER_M, BORDER, 1).strokeRect(BORDER_M / 2, BORDER_M / 2, map.widthM - BORDER_M, map.heightM - BORDER_M);
  return g;
}
