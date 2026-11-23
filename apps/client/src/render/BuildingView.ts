import * as Phaser from "phaser";
import { BUILD_GRID_M, MAX_PLAYERS, buildingStats, buildingTypeIds, footprint, type Balance, type Box, type Building, type World } from "@topdown/shared";
import type { Placement } from "../scenes/placement";
import { barFraction, boxDrawKey, buildingDrawKey, damageStage, darken } from "./buildingLook";
import { NIGHT_DARKEN, castShadow, raisedBevel } from "./city/raisedLook";
import { barricadePoolSize, barricadeTint, barricadeTransform, type SpriteTransform } from "./barricadeLook";
import { ATLAS_OBJECTS, OBJ_BARRICADE, ensureObjectsAtlas } from "./city/objectsAtlas";
import { buildingFrame, ensureBuildingsAtlas } from "./city/buildingsAtlas";
import { buildingShadowHeightM, mineRingRadii } from "./mineLook";

/** Placeholder wood look (Story 9 replaces it): planks across the long side, a dark outline; night-darkened (Story 4.9). */
const WOOD = darken(0x8b5a2b, NIGHT_DARKEN);
const PLANK_LINE = darken(0x5d3a1a, NIGHT_DARKEN);
const OUTLINE = 0x1a1008;
const OUTLINE_M = 0.06;
/** Story 4.9: barricade height (m), for its cast shadow (Dead City look). Story 4.11: a tall palisade (B6). */
const BARRICADE_HEIGHT_M = 1.6;
/** Story 5.9 review M1: drawn as a plank box (no art frame: turrets), so its wear is in the shadow layer. */
const isBoxType = (type: string): boolean => buildingFrame(type) === null;
/** Story 5.9: floor art (traps, mines) sits just under the walls' shadows and every body. */
const FLOOR_DEPTH = 2.95;
/** Story 5.9 (F4): the mine's trigger and blast rings in the placement preview. */
const RING_LINE_M = 0.05;
const RING_TRIGGER = 0xff5a46;
const RING_BLAST = 0xffb74d;
/** Sprites sit on the building layer; cracks just above them, under turrets (3.5). */
const CRACK_DEPTH = 3.05;
/** The placement preview's ghost of the turned art, under the coloured box. */
const GHOST_ALPHA = 0.7;
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
  /** Story 4.11: barricade art (pooled), cracks over it, and the preview's ghost. */
  private readonly sprites: Phaser.GameObjects.Image[] = [];
  private readonly cracks: Phaser.GameObjects.Graphics;
  private readonly ghost: Phaser.GameObjects.Image;
  private readonly xf: SpriteTransform = { x: 0, y: 0, angle: 0, w: 0, h: 0 };
  private readonly ghostRot = { minX: 0, minY: 0, maxX: 0, maxY: 0, rot: 0 };
  private readonly bars: Phaser.GameObjects.Graphics;
  private readonly preview: Phaser.GameObjects.Graphics;
  private shownVersion = -1;
  /** Story 5.9 (AC 16): per-building damage stage / bar step, not raw HP (a worn trap must not redraw every tick). */
  private shownDrawKey = -1;
  /** Story 5.9 review M1: the plank-box buildings' (turrets') bar steps last laid out (`boxDrawKey`). */
  private shownBoxKey = -1;
  /** Full re-lays so far (browser checks read it). */
  relayouts = 0;
  /** gx, gy, rot, validity and type folded into one number (no string per frame). */
  private shownPreviewKey = -1;
  private readonly box: Box = { minX: 0, minY: 0, maxX: 0, maxY: 0 };

  constructor(scene: Phaser.Scene, balance?: Readonly<Balance>) {
    ensureObjectsAtlas(scene);
    ensureBuildingsAtlas(scene); // Story 5.9: the new tiers, the trap and the mine (code-drawn, once per game)
    const pool = barricadePoolSize(balance?.buildings.maxPerPlayer, MAX_PLAYERS); // review fix L1: sized from balance, never throws
    this.placed = scene.add.graphics().setDepth(BUILDING_DEPTH);
    for (let i = 0; i < pool; i++) this.sprites.push(scene.add.image(0, 0, ATLAS_OBJECTS, OBJ_BARRICADE).setDepth(BUILDING_DEPTH).setVisible(false));
    this.cracks = scene.add.graphics().setDepth(CRACK_DEPTH);
    this.ghost = scene.add.image(0, 0, ATLAS_OBJECTS, OBJ_BARRICADE).setDepth(PREVIEW_DEPTH).setAlpha(GHOST_ALPHA).setVisible(false);
    this.bars = scene.add.graphics().setDepth(BAR_DEPTH);
    this.preview = scene.add.graphics().setDepth(PREVIEW_DEPTH).setVisible(false);
  }

  update(world: Readonly<World>, placement: Placement): void {
    this.drawPlaced(world);
    this.drawPreview(world, placement);
  }

  /**
   * Story 5.9 (AC 16): two levels of redraw. A building added, removed or retyped (`version`, or a
   * plank-box building's wear) re-lays everything: shadows, sprites, boxes. Wear alone (the draw key:
   * each building's bar step) only re-tints the sprites and redraws the cracks and the bars, so a crowd
   * on the spikes never rebuilds the shadow layer.
   */
  private drawPlaced(world: Readonly<World>): void {
    const list = world.buildings.list;
    const key = buildingDrawKey(list);
    // Review M1: a re-lay only when the list changed or a plank-box building's (turret's) bar step did.
    const boxKey = boxDrawKey(list, isBoxType);
    const relayout = world.buildings.version !== this.shownVersion || boxKey !== this.shownBoxKey;
    if (!relayout && key === this.shownDrawKey) return;
    this.shownVersion = world.buildings.version;
    this.shownDrawKey = key;
    this.shownBoxKey = boxKey;
    if (relayout) this.relayouts++;
    const g = this.placed;
    const bars = this.bars;
    const cracks = this.cracks;
    bars.clear();
    cracks.clear();
    if (relayout) {
      g.clear();
      // Story 4.9: every shadow first (one light direction, length by height), then the tops. Story 4.11:
      // the shadow is the game's (never baked into the art), so a turned barricade's falls the same way.
      // Story 5.9: by kind (walls tall, a trap a few centimetres, a mine none).
      for (let i = 0; i < list.length; i++) {
        const b = list[i] as Building;
        const hM = buildingShadowHeightM(buildingStats(world.balance, b.type), BARRICADE_HEIGHT_M);
        if (hM > 0) castShadow(g, b, hM);
      }
    }
    let used = 0;
    for (let i = 0; i < list.length; i++) {
      const b = list[i] as Building;
      const w = b.maxX - b.minX;
      const h = b.maxY - b.minY;
      const frac = barFraction(b);
      const art = buildingFrame(b.type);
      if (art && used < this.sprites.length) {
        // Story 4.11: the B6 palisade, turned with the placement; damage = darker tint + cracks.
        // Story 5.9: every tier, the spike trap and the mine the same way (floor below the walls, no cracks).
        const img = this.sprites[used++] as Phaser.GameObjects.Image;
        if (relayout) {
          const t = barricadeTransform(b, this.xf);
          if (img.texture.key !== art.texture || img.frame.name !== art.frame) img.setTexture(art.texture, art.frame);
          img.setPosition(t.x, t.y).setRotation(t.angle).setDisplaySize(t.w, t.h).setDepth(b.solid ? BUILDING_DEPTH : FLOOR_DEPTH).setVisible(true);
        }
        img.setTint(barricadeTint(frac));
        if (frac < 1 && b.solid) drawCracks(cracks, b, damageStage(frac) * CRACKS_PER_STAGE);
      } else if (relayout) {
        g.fillStyle(darken(WOOD, (1 - frac) * DAMAGE_DARKEN), 1).fillRect(b.minX, b.minY, w, h);
        g.lineStyle(OUTLINE_M / 2, PLANK_LINE, 1);
        if (w >= h) for (let x = b.minX + PLANK_M; x < b.maxX - 1e-6; x += PLANK_M) g.lineBetween(x, b.minY, x, b.maxY);
        else for (let y = b.minY + PLANK_M; y < b.maxY - 1e-6; y += PLANK_M) g.lineBetween(b.minX, y, b.maxX, y);
        if (frac < 1) drawCracks(g, b, damageStage(frac) * CRACKS_PER_STAGE);
        raisedBevel(g, b);
        g.lineStyle(OUTLINE_M, OUTLINE, 1).strokeRect(b.minX, b.minY, w, h);
      }
      if (frac < 1 && b.maxHp > 1) {
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
    if (relayout) {
      for (let i = used; i < this.sprites.length; i++) {
        const img = this.sprites[i] as Phaser.GameObjects.Image;
        if (img.visible) img.setVisible(false);
      }
    }
  }

  private drawPreview(world: Readonly<World>, p: Placement): void {
    const stats = p.active ? buildingStats(world.balance, p.type) : undefined;
    if (!stats) {
      if (this.preview.visible) this.preview.setVisible(false);
      if (this.ghost.visible) this.ghost.setVisible(false);
      this.shownPreviewKey = -1;
      return;
    }
    const valid = p.error === null;
    const key = p.gx + p.gy * 256 + p.rot * 65536 + (valid ? 262144 : 0) + buildingTypeIds(world.balance).indexOf(p.type) * 524288;
    if (key === this.shownPreviewKey) return;
    this.shownPreviewKey = key;
    const b = footprint(stats, p.gx, p.gy, p.rot, this.box);
    const color = valid ? VALID : BLOCKED;
    const art = buildingFrame(p.type);
    if (art) {
      // Story 4.11: the turned art under the coloured box, so the struts' side shows before confirming.
      const r = this.ghostRot;
      r.minX = b.minX;
      r.minY = b.minY;
      r.maxX = b.maxX;
      r.maxY = b.maxY;
      r.rot = p.rot;
      const t = barricadeTransform(r, this.xf);
      if (this.ghost.texture.key !== art.texture || this.ghost.frame.name !== art.frame) this.ghost.setTexture(art.texture, art.frame);
      this.ghost.setPosition(t.x, t.y).setRotation(t.angle).setDisplaySize(t.w, t.h).setVisible(true);
    } else if (this.ghost.visible) this.ghost.setVisible(false);
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
    g.fillStyle(color, art ? PREVIEW_FILL_ALPHA / 2 : PREVIEW_FILL_ALPHA).fillRect(b.minX, b.minY, b.maxX - b.minX, b.maxY - b.minY);
    g.lineStyle(PREVIEW_LINE_M, color, 1).strokeRect(b.minX, b.minY, b.maxX - b.minX, b.maxY - b.minY);
    // Story 5.9 (F4, 7.4): a mine previews its trigger and blast circles at exactly the sim's radii.
    const rings = mineRingRadii(stats);
    if (rings) {
      const cx = (b.minX + b.maxX) / 2;
      const cy = (b.minY + b.maxY) / 2;
      g.lineStyle(RING_LINE_M, RING_TRIGGER, 0.9).strokeCircle(cx, cy, rings.triggerM);
      g.lineStyle(RING_LINE_M, RING_BLAST, 0.7).strokeCircle(cx, cy, rings.blastM);
    }
  }

  destroy(): void {
    this.placed.destroy();
    for (const img of this.sprites) img.destroy();
    this.sprites.length = 0;
    this.cracks.destroy();
    this.ghost.destroy();
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
