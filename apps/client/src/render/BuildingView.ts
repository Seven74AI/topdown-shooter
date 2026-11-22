import * as Phaser from "phaser";
import { BUILD_GRID_M, buildingStats, buildingTypeIds, footprint, type Box, type Building, type World } from "@topdown/shared";
import type { Placement } from "../scenes/placement";

/** Placeholder wood look (Story 9 replaces it): planks across the long side, a dark outline. */
const WOOD = 0x8b5a2b;
const PLANK_LINE = 0x5d3a1a;
const OUTLINE = 0x2b1a0e;
const OUTLINE_M = 0.06;
/** Plank seams every this many metres along the long side. */
const PLANK_M = 0.5;
/** Above the street, blood and trails; below zombies (≥ 5), players (10) and FX. */
const BUILDING_DEPTH = 3;
/** The preview is drawn over everything in the world. */
const PREVIEW_DEPTH = 13;
const VALID = 0x4caf50;
const BLOCKED = 0xe53935;
const PREVIEW_FILL_ALPHA = 0.45;
const PREVIEW_LINE_M = 0.08;
/** A light 0.5 m lattice around the preview, so the snap is visible (± this many cells beyond its box). */
const GRID_CELLS = 4;
const GRID_ALPHA = 0.18;
const GRID_LINE_M = 0.03;

/**
 * Story 3.4: placed buildings and the placement preview, in world metres. The buildings layer is
 * redrawn only when the World's building list changes (`version`, or an HP change: Story 3.5 adds a
 * damaged look); the preview only when its spot, rotation or validity changes.
 */
export class BuildingView {
  private readonly placed: Phaser.GameObjects.Graphics;
  private readonly preview: Phaser.GameObjects.Graphics;
  private shownVersion = -1;
  private shownHpSum = -1;
  /** gx, gy, rot, validity and type folded into one number (no string per frame). */
  private shownPreviewKey = -1;
  private readonly box: Box = { minX: 0, minY: 0, maxX: 0, maxY: 0 };

  constructor(scene: Phaser.Scene) {
    this.placed = scene.add.graphics().setDepth(BUILDING_DEPTH);
    this.preview = scene.add.graphics().setDepth(PREVIEW_DEPTH).setVisible(false);
  }

  update(world: Readonly<World>, placement: Placement): void {
    this.drawPlaced(world);
    this.drawPreview(world, placement);
  }

  private drawPlaced(world: Readonly<World>): void {
    const list = world.buildings.list;
    let hpSum = 0;
    for (let i = 0; i < list.length; i++) hpSum += (list[i] as Building).hp;
    if (world.buildings.version === this.shownVersion && hpSum === this.shownHpSum) return;
    this.shownVersion = world.buildings.version;
    this.shownHpSum = hpSum;
    const g = this.placed;
    g.clear();
    for (let i = 0; i < list.length; i++) {
      const b = list[i] as Building;
      const w = b.maxX - b.minX;
      const h = b.maxY - b.minY;
      g.fillStyle(WOOD, 1).fillRect(b.minX, b.minY, w, h);
      g.lineStyle(OUTLINE_M / 2, PLANK_LINE, 1);
      if (w >= h) for (let x = b.minX + PLANK_M; x < b.maxX - 1e-6; x += PLANK_M) g.lineBetween(x, b.minY, x, b.maxY);
      else for (let y = b.minY + PLANK_M; y < b.maxY - 1e-6; y += PLANK_M) g.lineBetween(b.minX, y, b.maxX, y);
      g.lineStyle(OUTLINE_M, OUTLINE, 1).strokeRect(b.minX, b.minY, w, h);
    }
  }

  private drawPreview(world: Readonly<World>, p: Placement): void {
    const stats = p.active ? buildingStats(world.balance, p.type) : undefined;
    if (!stats) {
      if (this.preview.visible) this.preview.setVisible(false);
      this.shownPreviewKey = -1;
      return;
    }
    const valid = p.error === null;
    const key = p.gx + p.gy * 256 + p.rot * 65536 + (valid ? 262144 : 0) + buildingTypeIds(world.balance).indexOf(p.type) * 524288;
    if (key === this.shownPreviewKey) return;
    this.shownPreviewKey = key;
    const b = footprint(stats, p.gx, p.gy, p.rot, this.box);
    const color = valid ? VALID : BLOCKED;
    const g = this.preview;
    g.clear().setVisible(true);
    g.lineStyle(GRID_LINE_M, 0xffffff, GRID_ALPHA);
    const m = GRID_CELLS * BUILD_GRID_M;
    const x0 = b.minX - m;
    const x1 = b.maxX + m;
    const y0 = b.minY - m;
    const y1 = b.maxY + m;
    for (let y = y0; y <= y1 + 1e-6; y += BUILD_GRID_M) g.lineBetween(x0, y, x1, y);
    for (let x = x0; x <= x1 + 1e-6; x += BUILD_GRID_M) g.lineBetween(x, y0, x, y1);
    g.fillStyle(color, PREVIEW_FILL_ALPHA).fillRect(b.minX, b.minY, b.maxX - b.minX, b.maxY - b.minY);
    g.lineStyle(PREVIEW_LINE_M, color, 1).strokeRect(b.minX, b.minY, b.maxX - b.minX, b.maxY - b.minY);
  }

  destroy(): void {
    this.placed.destroy();
    this.preview.destroy();
  }
}
