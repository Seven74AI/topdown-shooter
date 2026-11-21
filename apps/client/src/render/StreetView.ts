import type * as Phaser from "phaser";
import type { DistrictBounds } from "@topdown/shared";

const ASPHALT = 0x1c1f22;
const GRID = 0x2a2e33;
const BORDER = 0x5a6068;
const GRID_STEP_M = 4;
const BORDER_M = 0.1; // thin line at the very edge, so the survivor (radius 0.4) never looks like it stands on it

/** Placeholder street: asphalt, a faint 4 m grid (to judge speed) and a lighter border. */
export function drawStreet(scene: Phaser.Scene, map: DistrictBounds): Phaser.GameObjects.Graphics {
  const g = scene.add.graphics().setDepth(0);
  g.fillStyle(ASPHALT, 1).fillRect(0, 0, map.widthM, map.heightM);
  g.lineStyle(0.04, GRID, 1);
  for (let x = GRID_STEP_M; x < map.widthM; x += GRID_STEP_M) g.lineBetween(x, 0, x, map.heightM);
  for (let y = GRID_STEP_M; y < map.heightM; y += GRID_STEP_M) g.lineBetween(0, y, map.widthM, y);
  g.lineStyle(BORDER_M, BORDER, 1).strokeRect(BORDER_M / 2, BORDER_M / 2, map.widthM - BORDER_M, map.heightM - BORDER_M);
  return g;
}
