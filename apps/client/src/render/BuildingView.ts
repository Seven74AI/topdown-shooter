import * as Phaser from "phaser";
import { BUILD_GRID_M, MAX_PLAYERS, buildingStats, buildingTypeIds, footprint, type Balance, type Box, type Building, type World } from "@topdown/shared";
import type { Placement } from "../scenes/placement";
import { barFraction, boxDrawKey, buildingDrawKey, damageStage, darken } from "./buildingLook";
import { NIGHT_DARKEN, castShadow, raisedBevel } from "./city/raisedLook";
import { barricadePoolSize, barricadeTint, barricadeTransform, frameBandBox, framePointToWorld, type BoxOut, type SpriteTransform } from "./barricadeLook";
import { B6_ROW_Y0, B6_ROW_Y1 } from "./city/objectArt";
import { ATLAS_BUILDINGS, ATLAS_BUILDINGS_GLOW, FRAME_WOOD, TEX_GLINT, buildingFrame, buildingFx, ensureBuildingsAtlas, type BuildingFx } from "./city/buildingsAtlas";
import { glintAlpha, glowLevel } from "./buildingFx";
import { buildingShadowHeightM } from "./mineLook";
import { HATCH_MAX_SEGMENTS, HATCH_SPACING_M, crossHalf, hatchSegments } from "./ghostHatch";
import { rangeRings } from "./rangeRings";

/** Story 5.23 (AC 2, D5): what the view reads for a placed building's drop (PlaceFxView). */
export interface DropSource {
  dropOf(id: number, nowMs: number): number;
  dropping(nowMs: number): boolean;
}

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
/** Photoreal group 3: the glints in flight at once (shared by every building), and a glint star's size (m). */
const GLINT_POOL = 24;
const GLINT_M = 0.16;
/** The glow over the art (additive), and the glints over that. */
const GLOW_DEPTH_UP = 0.01;
const GLINT_DEPTH = 3.06;
/** The preview is drawn over everything in the world. */
const PREVIEW_DEPTH = 13;
const VALID = 0x4caf50;
const BLOCKED = 0xe53935;
const PREVIEW_FILL_ALPHA = 0.45;
const PREVIEW_LINE_M = 0.08;
/** Story 5.17 (AC 6, ux-spec §7.1): a blocked ghost's 45° hatch (white 25 %, 0.25 m apart) and ✕ (0.4 m). */
const HATCH_ALPHA = 0.25;
const HATCH_LINE_M = 0.04;
const CROSS_M = 0.4;
const CROSS_LINE_M = 0.09;
/** Story 5.17 (AC 7): range rings other than the mine's two (turret, and 5.10/5.14 types) and their dimming while blocked. */
const RING_OTHER = 0xffffff;
const RING_OTHER_ALPHA = 0.6;
const RING_BLOCKED_DIM = 0.5;
/** Story 5.23 (AC 7, D10): the resting ghost after a blocked chain: white, faded, no hatch or ✕. */
const RESTING = 0xffffff;
const RESTING_ALPHA = 0.35;
/** A light 0.5 m lattice around the preview, so the snap is visible (± this many cells beyond its box). */
const GRID_CELLS = 4;
const GRID_ALPHA = 0.18;
const GRID_LINE_M = 0.03;

/**
 * Story 5.16: the plank-box look of a building without an atlas frame (the turret's base, a future
 * type), as a HUD icon in canvas px: `pxPerM` canvas px per metre. Graphics only (no texture).
 */
export function drawPlankIcon(g: Phaser.GameObjects.Graphics, x: number, y: number, w: number, h: number, pxPerM: number): void {
  g.fillStyle(WOOD, 1).fillRect(x, y, w, h);
  g.lineStyle(Math.max(1, (OUTLINE_M / 2) * pxPerM), PLANK_LINE, 1);
  const step = PLANK_M * pxPerM;
  if (w >= h) for (let px = x + step; px < x + w - 1e-6; px += step) g.lineBetween(px, y, px, y + h);
  else for (let py = y + step; py < y + h - 1e-6; py += step) g.lineBetween(x, py, x + w, py);
  g.lineStyle(Math.max(1, OUTLINE_M * pxPerM), OUTLINE, 1).strokeRect(x, y, w, h);
}

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
  private readonly band: BoxOut = { minX: 0, minY: 0, maxX: 0, maxY: 0 };
  private readonly hatch = new Float64Array(HATCH_MAX_SEGMENTS * 4);
  /** Story 5.23 (D5): per laid sprite, the building it shows and its resting y (the drop lifts it from there). */
  private readonly spriteId: Int32Array;
  private readonly spriteY: Float32Array;
  private spritesUsed = 0;
  private dropsShown = false;
  /** Story 5.23 (AC 1): the preview's centre and the ghost's display size as last drawn (the pick pop scales around it). */
  private previewCx = 0;
  private previewCy = 0;
  private ghostW = 0;
  private ghostH = 0;
  private shownScale = 1;
  /** Photoreal group 3: per laid sprite, its animation data, transform and seed; a glow image each (lazy); shared glints. */
  private readonly scene: Phaser.Scene;
  private readonly spriteFx: (BuildingFx | undefined)[] = [];
  private readonly spriteXf: SpriteTransform[] = [];
  private readonly spriteSeed: Int32Array;
  private readonly glows: (Phaser.GameObjects.Image | null)[] = [];
  private readonly glints: Phaser.GameObjects.Image[] = [];
  private readonly pt = { x: 0, y: 0 };

  constructor(scene: Phaser.Scene, balance?: Readonly<Balance>) {
    ensureBuildingsAtlas(scene); // Story 5.9 / 4.12: every tier (B6 too), the trap and the mine (code-drawn, once per game)
    const pool = barricadePoolSize(balance?.buildings.maxPerPlayer, MAX_PLAYERS); // review fix L1: sized from balance, never throws
    this.placed = scene.add.graphics().setDepth(BUILDING_DEPTH);
    this.spriteId = new Int32Array(pool).fill(-1);
    this.spriteY = new Float32Array(pool);
    this.scene = scene;
    this.spriteSeed = new Int32Array(pool);
    for (let i = 0; i < pool; i++) {
      this.spriteFx.push(undefined);
      this.spriteXf.push({ x: 0, y: 0, angle: 0, w: 0, h: 0 });
      this.glows.push(null);
    }
    for (let i = 0; i < GLINT_POOL; i++) this.glints.push(scene.add.image(0, 0, TEX_GLINT).setBlendMode(Phaser.BlendModes.ADD).setDepth(GLINT_DEPTH).setVisible(false));
    for (let i = 0; i < pool; i++) this.sprites.push(scene.add.image(0, 0, ATLAS_BUILDINGS, FRAME_WOOD).setDepth(BUILDING_DEPTH).setVisible(false));
    this.cracks = scene.add.graphics().setDepth(CRACK_DEPTH);
    this.ghost = scene.add.image(0, 0, ATLAS_BUILDINGS, FRAME_WOOD).setDepth(PREVIEW_DEPTH).setAlpha(GHOST_ALPHA).setVisible(false);
    this.bars = scene.add.graphics().setDepth(BAR_DEPTH);
    this.preview = scene.add.graphics().setDepth(PREVIEW_DEPTH).setVisible(false);
  }

  /**
   * Story 5.23: `drops` (PlaceFxView) lifts a just-placed building's art for 120 ms; `nowMs` the scene
   * clock; `popScale` the pick pop's scale for the preview (1 = none).
   */
  update(world: Readonly<World>, placement: Placement, drops: DropSource | null = null, nowMs = 0, popScale = 1): void {
    this.drawPlaced(world);
    if (drops) this.applyDrops(drops, nowMs);
    this.animate(nowMs);
    this.drawPreview(world, placement);
    this.applyPop(placement.active ? popScale : 1);
  }

  /** Story 5.23 (AC 2, D5): lifts each dropping sprite by its offset; one last frame puts them all back. */
  private applyDrops(drops: DropSource, nowMs: number): void {
    const any = drops.dropping(nowMs);
    if (!any && !this.dropsShown) return;
    for (let i = 0; i < this.spritesUsed; i++) {
      const img = this.sprites[i] as Phaser.GameObjects.Image;
      const off = any ? drops.dropOf(this.spriteId[i] as number, nowMs) : 0;
      const y = (this.spriteY[i] as number) - off;
      if (img.y !== y) img.setY(y);
    }
    this.dropsShown = any;
  }

  /**
   * Photoreal group 3: the relit buildings come alive. Each glowing one (floodlight, med station, mine) pulses its
   * additive glow layer; glint stars light briefly on the steel highlights, a shared pool handed out in turn.
   */
  private animate(nowMs: number): void {
    const t = nowMs / 1000;
    let g = 0;
    for (let i = 0; i < this.spritesUsed; i++) {
      const fx = this.spriteFx[i];
      const glow = this.glows[i];
      if (!fx) {
        if (glow?.visible) glow.setVisible(false);
        continue;
      }
      const xf = this.spriteXf[i] as SpriteTransform;
      const seed = this.spriteSeed[i] as number;
      const img = this.sprites[i] as Phaser.GameObjects.Image;
      if (fx.glowFrame) {
        let gi = glow;
        if (!gi) {
          gi = this.scene.add.image(0, 0, ATLAS_BUILDINGS_GLOW, fx.glowFrame).setBlendMode(Phaser.BlendModes.ADD);
          this.glows[i] = gi;
        }
        if (gi.frame.name !== fx.glowFrame) gi.setFrame(fx.glowFrame);
        gi.setPosition(img.x, img.y).setRotation(xf.angle).setDisplaySize(xf.w, xf.h).setDepth(img.depth + GLOW_DEPTH_UP).setAlpha(Math.min(1, glowLevel(fx.glow, t, seed))).setVisible(true);
      } else if (glow?.visible) glow.setVisible(false);
      const fw = img.frame.width;
      const fh = img.frame.height;
      for (let k = 0; k < fx.spots.length && g < this.glints.length; k++) {
        const a = glintAlpha(t, k, seed);
        if (a <= 0.01) continue;
        const sp = fx.spots[k] as readonly [number, number];
        framePointToWorld(xf, (sp[0] / fw - 0.5) * xf.w, (sp[1] / fh - 0.5) * xf.h, this.pt);
        const size = GLINT_M * (0.6 + 0.4 * a);
        (this.glints[g++] as Phaser.GameObjects.Image).setPosition(this.pt.x, this.pt.y + (img.y - xf.y)).setDisplaySize(size, size).setAlpha(a).setVisible(true);
      }
    }
    for (let i = this.spritesUsed; i < this.glows.length; i++) {
      const gi = this.glows[i];
      if (gi?.visible) gi.setVisible(false);
    }
    for (; g < this.glints.length; g++) {
      const gi = this.glints[g] as Phaser.GameObjects.Image;
      if (gi.visible) gi.setVisible(false);
    }
  }

  /** Story 5.23 (AC 1): scales the preview and its ghost art round the ghost's centre (no redraw). */
  private applyPop(s: number): void {
    if (s === this.shownScale) return;
    this.shownScale = s;
    this.preview.setScale(s).setPosition(this.previewCx * (1 - s), this.previewCy * (1 - s));
    if (this.ghost.visible) this.ghost.setDisplaySize(this.ghostW * s, this.ghostH * s);
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
        // Story 4.12: the B6 palisade's tall shadow falls from its plank row (the struts behind are low).
        if (hM > 0) castShadow(g, b.type === "wood_barricade" ? frameBandBox(b, B6_ROW_Y0, B6_ROW_Y1, this.band) : b, hM);
      }
    }
    let used = 0;
    for (let i = 0; i < list.length; i++) {
      const b = list[i] as Building;
      const w = b.maxX - b.minX;
      const h = b.maxY - b.minY;
      const frac = barFraction(b);
      const art = buildingFrame(b.type, b.trapState); // Story 5.14: a bear trap's closed frame (state changes bump version)
      if (art && used < this.sprites.length) {
        // Story 4.11: the B6 palisade, turned with the placement; damage = darker tint + cracks.
        // Story 5.9: every tier, the spike trap and the mine the same way (floor below the walls, no cracks).
        const img = this.sprites[used++] as Phaser.GameObjects.Image;
        if (relayout) {
          const t = barricadeTransform(b, this.xf);
          if (img.texture.key !== art.texture || img.frame.name !== art.frame) img.setTexture(art.texture, art.frame);
          img.setPosition(t.x, t.y).setRotation(t.angle).setDisplaySize(t.w, t.h).setDepth(b.solid ? BUILDING_DEPTH : FLOOR_DEPTH).setVisible(true);
          this.spriteId[used - 1] = b.id; // Story 5.23: the drop finds its sprite
          this.spriteY[used - 1] = t.y;
          const xf = this.spriteXf[used - 1] as SpriteTransform;
          xf.x = t.x;
          xf.y = t.y;
          xf.angle = t.angle;
          xf.w = t.w;
          xf.h = t.h;
          this.spriteFx[used - 1] = buildingFx(art.frame);
          this.spriteSeed[used - 1] = b.id;
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
      this.spritesUsed = used;
      for (let i = used; i < this.sprites.length; i++) {
        this.spriteId[i] = -1;
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
    const valid = p.shownError === null; // Story 5.17: the held look (≥ reasonHoldMs before valid again)
    const resting = !valid && p.resting; // Story 5.23 (AC 7, D10): faded, not red, on the box just built
    // Story 5.15 (review L4): an off-map ghost has negative indices; offset them so the key stays unique.
    const key = p.gx + 512 + (p.gy + 512) * 2048 + p.rot * 4194304 + (valid ? 16777216 : 0) + buildingTypeIds(world.balance).indexOf(p.type) * 33554432 + (resting ? 0.5 : 0);
    if (key === this.shownPreviewKey) return;
    this.shownPreviewKey = key;
    const b = footprint(stats, p.gx, p.gy, p.rot, this.box);
    const color = resting ? RESTING : valid ? VALID : BLOCKED;
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
      this.ghostW = t.w;
      this.ghostH = t.h;
      const sc = this.shownScale;
      this.ghost.setPosition(t.x, t.y).setRotation(t.angle).setDisplaySize(t.w * sc, t.h * sc).setAlpha(resting ? RESTING_ALPHA : GHOST_ALPHA).setVisible(true);
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
    const fade = resting ? RESTING_ALPHA : 1;
    g.fillStyle(color, (art ? PREVIEW_FILL_ALPHA / 2 : PREVIEW_FILL_ALPHA) * fade).fillRect(b.minX, b.minY, b.maxX - b.minX, b.maxY - b.minY);
    g.lineStyle(PREVIEW_LINE_M, color, fade).strokeRect(b.minX, b.minY, b.maxX - b.minX, b.maxY - b.minY);
    const cx = (b.minX + b.maxX) / 2;
    const cy = (b.minY + b.maxY) / 2;
    this.previewCx = cx;
    this.previewCy = cy;
    if (this.shownScale !== 1) this.preview.setPosition(cx * (1 - this.shownScale), cy * (1 - this.shownScale)); // the pop keeps its centre
    if (!valid && !resting) {
      // Story 5.17 (AC 6): colour-blind safe — a 45° hatch and a ✕ on top of the red.
      const n = hatchSegments(b.minX, b.minY, b.maxX, b.maxY, HATCH_SPACING_M, this.hatch);
      const hs = this.hatch;
      g.lineStyle(HATCH_LINE_M, 0xffffff, HATCH_ALPHA);
      for (let i = 0; i < n; i++) g.lineBetween(hs[i * 4] as number, hs[i * 4 + 1] as number, hs[i * 4 + 2] as number, hs[i * 4 + 3] as number);
      const c = crossHalf(b.maxX - b.minX, b.maxY - b.minY, CROSS_M);
      g.lineStyle(CROSS_LINE_M, 0xffffff, 0.95);
      g.lineBetween(cx - c, cy - c, cx + c, cy + c);
      g.lineBetween(cx - c, cy + c, cx + c, cy - c);
    }
    // Story 5.9 (F4, 7.4): a mine previews its trigger and blast circles at exactly the sim's radii.
    // Story 5.17 (AC 7): every range ring the type's balance declares (turret 8 m; later the med
    // station, floodlight, bear trap), read generically; dimmed while blocked.
    const rings = rangeRings(stats);
    const dim = valid ? 1 : RING_BLOCKED_DIM;
    for (let i = 0; i < rings.length; i++) {
      const ring = rings[i] as (typeof rings)[number];
      const color = ring.key === "mine.triggerRadiusM" ? RING_TRIGGER : ring.key === "mine.blastRadiusM" ? RING_BLAST : RING_OTHER;
      const alpha = ring.key === "mine.triggerRadiusM" ? 0.9 : ring.key === "mine.blastRadiusM" ? 0.7 : RING_OTHER_ALPHA;
      g.lineStyle(RING_LINE_M, color, alpha * dim).strokeCircle(cx, cy, ring.radiusM);
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
