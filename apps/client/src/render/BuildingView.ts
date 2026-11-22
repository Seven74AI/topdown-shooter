import * as Phaser from "phaser";
import { BUILD_GRID_M, buildingStats, buildingTypeIds, footprint, type Box, type Building, type World } from "@topdown/shared";
import type { Placement } from "../scenes/placement";
import { damageStage, darken, hpChecksum } from "./buildingLook";
import { NIGHT_DARKEN, castShadow, raisedBevel } from "./city/raisedLook";

/** Placeholder wood look (Story 9 replaces it): planks across the long side, a dark outline; night-darkened (Story 4.9). */
const WOOD = darken(0x8b5a2b, NIGHT_DARKEN);
const PLANK_LINE = darken(0x5d3a1a, NIGHT_DARKEN);
const OUTLINE = 0x1a1008;
const OUTLINE_M = 0.06;
/** Story 4.9: barricade height (m), for its cast shadow (Dead City look). */
const BARRICADE_HEIGHT_M = 1.2;
/** Plank seams every this many metres along the long side. */
const PLANK_M = 0.5;
/** Above the street, blood and trails; below zombies (≥ 5), players (10) and FX. */
const BUILDING_DEPTH = 3;
/** Story 3.5: health bars above zombies (5) and players (10), below the preview. */
const BAR_DEPTH = 12;
/** The bar is drawn on the building, along its long side (review L2: never over a neighbour or inside an enclosure). */
const BAR_H_M = 0.14;
const BAR_INSET_M = 0.12;
const BAR_BG = 0x1a1a1a;
const BAR_HIGH = 0x7cc544;
const BAR_MID = 0xe0b030;
const BAR_LOW = 0xd84a32;
/** Damaged look: the wood darkens up to this fraction at 0 HP, and cracks appear per lost quarter. */
const DAMAGE_DARKEN = 0.45;
const CRACK = 0x1e120a;
const CRACK_M = 0.05;
const CRACKS_PER_STAGE = 2;
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
 * redrawn only when the World's building list changes (`version`, or an HP change); the preview
 * only when its spot, rotation or validity changes. Story 3.5: a damaged building is darker, cracks
 * (fixed per building id, more per lost quarter of HP) and shows a health bar.
 */
export class BuildingView {
  private readonly placed: Phaser.GameObjects.Graphics;
  private readonly bars: Phaser.GameObjects.Graphics;
  private readonly preview: Phaser.GameObjects.Graphics;
  private shownVersion = -1;
  private shownHpSum = -1;
  /** gx, gy, rot, validity and type folded into one number (no string per frame). */
  private shownPreviewKey = -1;
  private readonly box: Box = { minX: 0, minY: 0, maxX: 0, maxY: 0 };

  constructor(scene: Phaser.Scene) {
    this.placed = scene.add.graphics().setDepth(BUILDING_DEPTH);
    this.bars = scene.add.graphics().setDepth(BAR_DEPTH);
    this.preview = scene.add.graphics().setDepth(PREVIEW_DEPTH).setVisible(false);
  }

  update(world: Readonly<World>, placement: Placement): void {
    this.drawPlaced(world);
    this.drawPreview(world, placement);
  }

  private drawPlaced(world: Readonly<World>): void {
    const list = world.buildings.list;
    const hpSum = hpChecksum(list);
    if (world.buildings.version === this.shownVersion && hpSum === this.shownHpSum) return;
    this.shownVersion = world.buildings.version;
    this.shownHpSum = hpSum;
    const g = this.placed;
    const bars = this.bars;
    g.clear();
    bars.clear();
    // Story 4.9: every shadow first (one light direction, length by height), then the tops.
    for (let i = 0; i < list.length; i++) castShadow(g, list[i] as Building, BARRICADE_HEIGHT_M);
    for (let i = 0; i < list.length; i++) {
      const b = list[i] as Building;
      const w = b.maxX - b.minX;
      const h = b.maxY - b.minY;
      const frac = b.maxHp > 0 ? Math.min(1, Math.max(0, b.hp / b.maxHp)) : 1;
      g.fillStyle(darken(WOOD, (1 - frac) * DAMAGE_DARKEN), 1).fillRect(b.minX, b.minY, w, h);
      g.lineStyle(OUTLINE_M / 2, PLANK_LINE, 1);
      if (w >= h) for (let x = b.minX + PLANK_M; x < b.maxX - 1e-6; x += PLANK_M) g.lineBetween(x, b.minY, x, b.maxY);
      else for (let y = b.minY + PLANK_M; y < b.maxY - 1e-6; y += PLANK_M) g.lineBetween(b.minX, y, b.maxX, y);
      if (frac < 1) drawCracks(g, b, damageStage(frac) * CRACKS_PER_STAGE);
      raisedBevel(g, b);
      g.lineStyle(OUTLINE_M, OUTLINE, 1).strokeRect(b.minX, b.minY, w, h);
      if (frac < 1) {
        const color = frac > 0.6 ? BAR_HIGH : frac > 0.3 ? BAR_MID : BAR_LOW;
        if (w >= h) {
          const bw = w - 2 * BAR_INSET_M;
          const bx = b.minX + BAR_INSET_M;
          const by = (b.minY + b.maxY - BAR_H_M) / 2;
          bars.fillStyle(BAR_BG, 0.85).fillRect(bx - 0.02, by - 0.02, bw + 0.04, BAR_H_M + 0.04);
          bars.fillStyle(color, 1).fillRect(bx, by, bw * frac, BAR_H_M);
        } else {
          const bh = h - 2 * BAR_INSET_M;
          const by = b.minY + BAR_INSET_M;
          const bx = (b.minX + b.maxX - BAR_H_M) / 2;
          bars.fillStyle(BAR_BG, 0.85).fillRect(bx - 0.02, by - 0.02, BAR_H_M + 0.04, bh + 0.04);
          bars.fillStyle(color, 1).fillRect(bx, by + bh * (1 - frac), BAR_H_M, bh * frac); // fills from the bottom
        }
      }
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
    this.bars.destroy();
    this.preview.destroy();
  }
}

/** A small integer hash (per building id and crack index): the same cracks on every redraw and client. */
function hash01(id: number, k: number): number {
  let h = Math.imul(id * 374761393 + k * 668265263, 0x27d4eb2d) >>> 0;
  h = Math.imul(h ^ (h >>> 15), 0x85ebca6b) >>> 0;
  return ((h ^ (h >>> 13)) >>> 0) / 4294967296;
}

/** `count` zigzag cracks inside the building's box. */
function drawCracks(g: Phaser.GameObjects.Graphics, b: Building, count: number): void {
  const w = b.maxX - b.minX;
  const h = b.maxY - b.minY;
  g.lineStyle(CRACK_M, CRACK, 0.9);
  for (let k = 0; k < count; k++) {
    const x0 = b.minX + w * (0.1 + 0.8 * hash01(b.id, k * 4));
    const y0 = b.minY + h * (0.1 + 0.8 * hash01(b.id, k * 4 + 1));
    const x1 = Math.min(b.maxX, Math.max(b.minX, x0 + (hash01(b.id, k * 4 + 2) - 0.5) * Math.min(w, 1)));
    const y1 = Math.min(b.maxY, Math.max(b.minY, y0 + (hash01(b.id, k * 4 + 3) - 0.5) * Math.min(h, 1)));
    const mx = (x0 + x1) / 2 + (y1 - y0) * 0.3;
    const my = (y0 + y1) / 2 - (x1 - x0) * 0.3;
    g.lineBetween(x0, y0, Math.min(b.maxX, Math.max(b.minX, mx)), Math.min(b.maxY, Math.max(b.minY, my)));
    g.lineBetween(Math.min(b.maxX, Math.max(b.minX, mx)), Math.min(b.maxY, Math.max(b.minY, my)), x1, y1);
  }
}
