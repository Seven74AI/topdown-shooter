import type * as Phaser from "phaser";
import type { DistrictMap } from "@topdown/shared";

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
  shopfront: [0xc8963c, 0.22], // Story 4.6: lit shop front (placeholder tint; Story 4.9 draws the glow)
};

/**
 * The district's base, drawn once (static; no per-frame cost): asphalt with a faint 4 m grid (to
 * judge speed) and the `stage1_evening` ground props. Story 4.5: everything that depends on the
 * decay stage — the walls (map collision boxes + `block` mutations; the bus in its own colour),
 * hazard zones, fire records and the `stageN_*` group — is `DecayView`'s; the cover is `CoverView`'s.
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
  g.lineStyle(BORDER_M, BORDER, 1).strokeRect(BORDER_M / 2, BORDER_M / 2, map.widthM - BORDER_M, map.heightM - BORDER_M);
  return g;
}
