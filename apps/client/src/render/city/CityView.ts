import * as Phaser from "phaser";
import type { DistrictMap, FireRecord, World } from "@topdown/shared";
import { MAX_ATLAS_PX, tileRects } from "./atlasLayout";
import { MAP_PX_PER_M, dressingFor, type Dressing } from "./dressing";
import { BARRIER_LAMPS, CULL_MARGIN_PX, baseKey, blinkerSpots, drawBase, drawGlow, drawLightmap, drawOverlay, type CityScene } from "./drawCity";
import { LAMP, LAMP_GLOW, nightAt } from "./palette";
import { ATLAS_FX, FX_GLOW, FX_RAIN, FX_SPLASH, FX_VIGNETTE, ensureAtlases, type AtlasCanvas } from "./spriteAtlas";
import { hash } from "./spriteArt";
import { addCanvasTexture, releaseCanvas } from "./canvasTexture";
import { staticKey } from "./stageFilter";
import { FIRE_EMBERS, FIRE_EMBER_FLICKER_HZ, FIRE_EMBER_M, FIRE_RING_ALPHA, FIRE_RING_COLOR, emberSpot, fireRingWidthM, strokeFireRings } from "./fireRing";

/**
 * Story 4.9: the Dead City look of the district (look B). Static layers (ground, shadows, buildings,
 * cover, hazards, props) are baked once per stage into canvas textures (tiles ≤ 2048 px, D2), with
 * the light already in them: a low-resolution lightmap multiplied and a glow added onto each tile at
 * bake time (D4: no full-screen blend layer per frame; characters are drawn above the light anyway).
 * A few pooled images animate the flickering lamp, the bus blinkers, the barrier lamps, rain and
 * splashes, plus a vignette. No allocation per frame.
 *
 * Stage entry point: `showStage(world)` redraws the static layers and the light for the World's
 * decay stage (walls, cover, fires, stage group, light state). `update` calls it by itself when
 * `world.obstacles` changes stage or version or the fire count changes: Story 4.5's
 * `applyDecayStage` (solo build start, the dev cheat, the online mirror on any patch, including a
 * tab that slept across a build start), so callers need nothing else.
 */

/** Depths (D5): the lit street 0; animated lights above barricades/turrets, below every character. */
const STATIC_DEPTH = 0;
const DYN_LIGHT_DEPTH = 4.32;
/** Story 4.8 review M3: the fire ring and its embers lie on the ground: above blood (1), below barricades (3). */
const FIRE_RING_DEPTH = 1.5;
const RAIN_DEPTH = 11.8;
const VIGNETTE_DEPTH = 11.9;

/**
 * Bake density clamp (device px per metre, D2). Review perf: at most what fits the whole map in ONE
 * ≤ 2048 px tile (Downtown 48 m → 42 px/m, 2016 × 1344): phones (zoom ≈ 70) looked the same as at
 * 64 px/m in a DPR-2 side-by-side, at half the memory and bake time.
 */
const BAKE_MIN_PX_PER_M = 32;
const BAKE_MAX_PX_PER_M = 64;
/** Lightmap / glow density (px per metre). */
const LIGHT_PX_PER_M = 8;

/** Rain (D11): pool size, drops per m² of view at full rain (strength per stage: `NIGHT_BY_STAGE.rain`). */
const RAIN_POOL = 128;
const RAIN_PER_M2 = 0.4;
const RAIN_ALPHA = 0.28;
const RAIN_LEN_M = 0.45;
const RAIN_W_M = 0.035;
/** Fall speed range (m/s) and the slant (x per y). */
const RAIN_SPEED_MPS = 12;
const RAIN_SPEED_VAR_MPS = 6;
const RAIN_SLANT = 0.22;
const RAIN_MARGIN_M = 1.5;
const SPLASH_POOL = 16;
const SPLASH_RATE = 1.6;
const SPLASH_W_M = 0.45;
const SPLASH_ALPHA = 0.5;
/** Flickering lamp: changes 12 × per second, on in ~28 % of the steps. */
const FLICKER_HZ = 12;
const FLICKER_ON = 0.72;
const FLICKER_POOL_M = 7.5;
const FLICKER_CORE_M = 1.4;
const BLINK_BUS_HZ = 6 / (2 * Math.PI);
const BLINK_BUS_M = 1.6;
const BLINK_BARRIER_M = 1.1;
const BLINK_COLOR = 0xff9628;
/** Burning cars: at most this many lit, the light's size and colour, its flicker rate. */
const FIRE_LIGHTS = 4;
const FIRE_LIGHT_M = 4; // review M3: the flicker light's size = the zone's diameter (2 × 2 m), no glow past the ring
const FIRE_COLOR = 0xff7a28;
const FIRE_FLICKER_HZ = 9;
/**
 * Vignette: four edge bands, each this fraction of the view's smaller side (corners get two). Not
 * one full-screen quad: the centre stays untouched (fill rate on phones; headless Chromium showed a
 * full-screen alpha quad costing ~40 % of its frame rate).
 */
const VIGNETTE_BAND = 0.12;

const rgbNum = (s: string): number => {
  const p = s.split(",").map(Number);
  return ((p[0] ?? 0) << 16) | ((p[1] ?? 0) << 8) | (p[2] ?? 0);
};

interface Layer {
  readonly key: string;
  readonly canvas: HTMLCanvasElement;
  /** The stage-independent part of this tile (`drawBase`), cached between stage changes. */
  readonly base: HTMLCanvasElement;
  readonly tex: Phaser.Textures.CanvasTexture;
  readonly img: Phaser.GameObjects.Image;
  readonly x: number;
  readonly y: number;
}

let instance = 0;

export class CityView {
  private readonly dressing: Dressing;
  private readonly atlas: AtlasCanvas;
  private readonly bakePxPerM: number;
  private readonly tiles: Layer[] = [];
  /** Lightmap and glow (8 px/m canvases, composited into the tiles at bake time). */
  private readonly light: HTMLCanvasElement;
  private readonly glow: HTMLCanvasElement;
  private readonly flickerPool: Phaser.GameObjects.Image;
  private readonly flickerCore: Phaser.GameObjects.Image;
  private readonly busBlink: Phaser.GameObjects.Image[] = [];
  private readonly barrierBlink: Phaser.GameObjects.Image[] = [];
  /** Flickering light over each burning car (`world.decay.fires`). */
  private readonly fireLight: Phaser.GameObjects.Image[] = [];
  /** Story 4.8 review M3: the ember ring at each zone's damage edge, and its ember dots. */
  private readonly fireRing: Phaser.GameObjects.Graphics;
  private readonly embers: Phaser.GameObjects.Image[] = [];
  private fires: readonly FireRecord[] = [];
  private ringZoom = -1;
  private readonly ember = { x: 0, y: 0 };
  private readonly rain: Phaser.GameObjects.Image[] = [];
  private readonly splash: Phaser.GameObjects.Image[] = [];
  /** Top, bottom, left, right edge bands. */
  private readonly vignette: Phaser.GameObjects.Image[] = [];
  /** Per-drop constants (speed, phases), drawn once. */
  private readonly dropSpeed = new Float32Array(RAIN_POOL);
  private readonly dropPhaseY = new Float32Array(RAIN_POOL);
  private readonly dropPhaseX = new Float32Array(RAIN_POOL);
  private shownKey = -1;
  private shownBaseKey: string | null = null;
  private stage = 1;
  private clockS = 0;
  /** Last bake time (ms) and how many bakes ran (browser checks: a late join bakes once). */
  bakeMs = 0;
  bakeCount = 0;

  constructor(
    private readonly scene: Phaser.Scene,
    private readonly map: DistrictMap,
    /** Camera zoom (device px per metre) when the run starts: the bake density (D2). */
    zoomPxPerM: number,
  ) {
    this.dressing = dressingFor(map.name);
    this.atlas = ensureAtlases(scene);
    const oneTile = Math.floor(MAX_ATLAS_PX / Math.max(map.widthM, map.heightM));
    this.bakePxPerM = Math.round(Math.min(BAKE_MAX_PX_PER_M, oneTile, Math.max(BAKE_MIN_PX_PER_M, zoomPxPerM)));
    const id = instance++;
    const wPx = Math.ceil(map.widthM * this.bakePxPerM);
    const hPx = Math.ceil(map.heightM * this.bakePxPerM);
    for (const [i, r] of tileRects(wPx, hPx).entries()) {
      this.tiles.push(this.layer(`city_static_${id}_${i}`, r.w, r.h, r.x / this.bakePxPerM, r.y / this.bakePxPerM, r.w / this.bakePxPerM, r.h / this.bakePxPerM, STATIC_DEPTH));
    }
    const lw = Math.ceil(map.widthM * LIGHT_PX_PER_M);
    const lh = Math.ceil(map.heightM * LIGHT_PX_PER_M);
    this.light = document.createElement("canvas");
    this.glow = document.createElement("canvas");
    for (const c of [this.light, this.glow]) {
      c.width = lw;
      c.height = lh;
    }

    const glowImg = (sizeM: number, color: number): Phaser.GameObjects.Image =>
      scene.add.image(0, 0, ATLAS_FX, FX_GLOW).setDisplaySize(sizeM, sizeM).setBlendMode(Phaser.BlendModes.ADD).setTint(color).setDepth(DYN_LIGHT_DEPTH).setVisible(false);
    this.flickerPool = glowImg(FLICKER_POOL_M, rgbNum(LAMP));
    this.flickerCore = glowImg(FLICKER_CORE_M, rgbNum(LAMP_GLOW));
    const fl = this.dressing.lamps[this.dressing.flickerLamp];
    if (fl) {
      this.flickerPool.setPosition(fl[0] / MAP_PX_PER_M, fl[1] / MAP_PX_PER_M).setVisible(true);
      this.flickerCore.setPosition(fl[0] / MAP_PX_PER_M, fl[1] / MAP_PX_PER_M).setVisible(true);
    }
    for (let i = 0; i < 2; i++) this.busBlink.push(glowImg(BLINK_BUS_M, BLINK_COLOR));
    for (let i = 0; i < BARRIER_LAMPS; i++) this.barrierBlink.push(glowImg(BLINK_BARRIER_M, BLINK_COLOR));
    for (let i = 0; i < FIRE_LIGHTS; i++) this.fireLight.push(glowImg(FIRE_LIGHT_M, FIRE_COLOR));
    this.fireRing = scene.add.graphics().setDepth(FIRE_RING_DEPTH);
    for (let i = 0; i < FIRE_LIGHTS * FIRE_EMBERS; i++) this.embers.push(glowImg(FIRE_EMBER_M, FIRE_RING_COLOR).setDepth(FIRE_RING_DEPTH));
    for (let i = 0; i < RAIN_POOL; i++) {
      this.rain.push(scene.add.image(0, 0, ATLAS_FX, FX_RAIN).setDisplaySize(RAIN_W_M, RAIN_LEN_M).setRotation(-Math.atan(RAIN_SLANT)).setDepth(RAIN_DEPTH).setVisible(false));
      this.dropSpeed[i] = RAIN_SPEED_MPS + hash(i + 0.5) * RAIN_SPEED_VAR_MPS;
      this.dropPhaseY[i] = hash(i * 3.1 + 0.7);
      this.dropPhaseX[i] = hash(i * 7.7 + 0.3);
    }
    for (let i = 0; i < SPLASH_POOL; i++) {
      this.splash.push(scene.add.image(0, 0, ATLAS_FX, FX_SPLASH).setDepth(RAIN_DEPTH).setVisible(false));
    }
    for (let i = 0; i < 4; i++) {
      // the band's dark edge is its frame's top: rotate it to face each screen edge
      this.vignette.push(scene.add.image(0, 0, ATLAS_FX, FX_VIGNETTE).setDepth(VIGNETTE_DEPTH).setRotation([0, Math.PI, -Math.PI / 2, Math.PI / 2][i] as number));
    }
  }

  private layer(key: string, wPx: number, hPx: number, xM: number, yM: number, wM: number, hM: number, depth: number): Layer {
    const canvas = document.createElement("canvas");
    canvas.width = wPx;
    canvas.height = hPx;
    const tex = addCanvasTexture(this.scene, key, canvas);
    if (!tex) throw new Error(`texture ${key} exists`);
    const img = this.scene.add.image(xM, yM, key).setOrigin(0, 0).setDisplaySize(wM, hM).setDepth(depth);
    const base = document.createElement("canvas");
    base.width = wPx;
    base.height = hPx;
    return { key, canvas, base, tex, img, x: xM, y: yM };
  }

  /**
   * THE stage entry point: redraws the static layers and the light for the World's decay stage
   * (`world.obstacles` stage, walls and cover, `world.decay.fires`). Costs one bake (tens of ms):
   * on a stage change only, never per frame (`update` does it on its own).
   */
  showStage(world: Readonly<World>): void {
    const t0 = performance.now();
    const o = world.obstacles;
    const stage = o.stage;
    this.stage = stage;
    const cs: CityScene = { map: this.map, dressing: this.dressing, stage, cover: o.cover, walls: o.walls, fires: world.decay.fires, atlas: this.atlas };
    const ls = LIGHT_PX_PER_M / MAP_PX_PER_M;
    for (const [canvas, draw] of [
      [this.light, drawLightmap],
      [this.glow, drawGlow],
    ] as const) {
      const g = canvas.getContext("2d") as CanvasRenderingContext2D;
      g.setTransform(ls, 0, 0, ls, 0, 0);
      draw(g, cs);
    }
    const s = this.bakePxPerM / MAP_PX_PER_M;
    const mapW = this.map.widthM * MAP_PX_PER_M;
    const mapH = this.map.heightM * MAP_PX_PER_M;
    const bk = baseKey(cs);
    const redrawBase = bk !== this.shownBaseKey;
    this.shownBaseKey = bk;
    for (const t of this.tiles) {
      // the tile's area in map px, grown so shadows and blur from outside still land on it
      const x0 = t.x * MAP_PX_PER_M;
      const y0 = t.y * MAP_PX_PER_M;
      const bd = { x0: x0 - CULL_MARGIN_PX, y0: y0 - CULL_MARGIN_PX, x1: x0 + t.canvas.width / s + CULL_MARGIN_PX, y1: y0 + t.canvas.height / s + CULL_MARGIN_PX };
      if (redrawBase) {
        const b = t.base.getContext("2d") as CanvasRenderingContext2D;
        b.setTransform(1, 0, 0, 1, 0, 0);
        b.clearRect(0, 0, t.base.width, t.base.height);
        b.setTransform(s, 0, 0, s, -t.x * this.bakePxPerM, -t.y * this.bakePxPerM);
        drawBase(b, s, cs, bd);
      }
      const g = t.canvas.getContext("2d") as CanvasRenderingContext2D;
      g.setTransform(1, 0, 0, 1, 0, 0);
      g.clearRect(0, 0, t.canvas.width, t.canvas.height);
      g.drawImage(t.base, 0, 0);
      g.setTransform(s, 0, 0, s, -t.x * this.bakePxPerM, -t.y * this.bakePxPerM);
      drawOverlay(g, s, cs, bd);
      g.globalCompositeOperation = "multiply";
      g.drawImage(this.light, 0, 0, mapW, mapH);
      g.globalCompositeOperation = "lighter";
      g.drawImage(this.glow, 0, 0, mapW, mapH);
      g.globalCompositeOperation = "source-over";
      t.tex.refresh();
    }
    const spots = blinkerSpots(cs);
    this.placeBlinkers(this.busBlink, spots.bus);
    this.placeBlinkers(this.barrierBlink, spots.barrier);
    this.placeBlinkers(this.fireLight, cs.fires.map((f) => [f.x * MAP_PX_PER_M, f.y * MAP_PX_PER_M] as [number, number]));
    this.fires = cs.fires;
    this.ringZoom = -1; // redraw the ring
    this.bakeMs = performance.now() - t0;
    this.bakeCount++;
  }

  /**
   * Story 4.8 review M3: the ember ring at each burning zone's damage edge (`fireRingRadiusM`: a body
   * touching it burns), ~2 px whatever the zoom (redrawn only when the zoom or the fires change), and
   * the ember dots drifting and flickering on it (pooled, alpha and position only).
   */
  private updateFireRing(t: number): void {
    const zoom = this.scene.cameras.main.zoom;
    const fires = this.fires;
    if (zoom !== this.ringZoom) {
      this.ringZoom = zoom;
      const g = this.fireRing;
      g.clear();
      g.lineStyle(fireRingWidthM(zoom), FIRE_RING_COLOR, FIRE_RING_ALPHA);
      strokeFireRings(g, fires, FIRE_LIGHTS);
    }
    for (let i = 0; i < this.embers.length; i++) {
      const img = this.embers[i] as Phaser.GameObjects.Image;
      const f = fires[Math.floor(i / FIRE_EMBERS)];
      if (!f) {
        if (img.visible) img.setVisible(false);
        continue;
      }
      emberSpot(f, i % FIRE_EMBERS, FIRE_EMBERS, t, this.ember);
      img.setPosition(this.ember.x, this.ember.y).setVisible(true).setAlpha(0.25 + 0.6 * hash(Math.floor(t * FIRE_EMBER_FLICKER_HZ) + i * 13));
    }
  }

  private placeBlinkers(imgs: Phaser.GameObjects.Image[], spots: [number, number][]): void {
    for (let i = 0; i < imgs.length; i++) {
      const p = spots[i];
      const img = imgs[i] as Phaser.GameObjects.Image;
      if (p) img.setPosition(p[0] / MAP_PX_PER_M, p[1] / MAP_PX_PER_M).setVisible(true);
      else img.setVisible(false);
    }
  }

  /**
   * Once per frame: redraws the static layers if the obstacles changed (one compare), then animates
   * the lights, rain and vignette for the camera view (metres). `dtS` = 0 while the run is paused.
   * `synced` = false until an online World has its first server state (nothing is drawn before).
   */
  update(world: Readonly<World>, viewX: number, viewY: number, viewW: number, viewH: number, dtS: number, synced = true): void {
    // Review L (late join): online, wait for the first server state (it carries the decay stage)
    // instead of baking stage 1 and baking again a moment later.
    if (!synced && this.shownKey < 0) return;
    const o = world.obstacles;
    const key = staticKey(o.stage, o.version, world.decay.fires.length);
    if (key !== this.shownKey) {
      this.shownKey = key;
      this.showStage(world);
    }
    this.clockS += dtS;
    const t = this.clockS;
    const on = hash(Math.floor(t * FLICKER_HZ)) > FLICKER_ON;
    this.flickerPool.setAlpha(on ? 0.18 : 0.02);
    this.flickerCore.setAlpha(on ? 0.5 : 0.04);
    const bus = Math.sin(t * 2 * Math.PI * BLINK_BUS_HZ) > 0 ? 0.55 : 0;
    for (const b of this.busBlink) b.setAlpha(bus);
    const bar = Math.sin(t * 4 + 1) > 0 ? 0.45 : 0.1;
    // Each barrier's two lamps alternate (spots come in pairs per barrier).
    for (let i = 0; i < this.barrierBlink.length; i++) (this.barrierBlink[i] as Phaser.GameObjects.Image).setAlpha(i % 2 === 0 ? bar : 0.55 - bar);
    for (let i = 0; i < this.fireLight.length; i++) {
      const f = this.fireLight[i] as Phaser.GameObjects.Image;
      if (f.visible) f.setAlpha(0.28 + 0.22 * hash(Math.floor(t * FIRE_FLICKER_HZ) + i * 17));
    }
    this.updateFireRing(t);

    const level = nightAt(this.stage).rain;
    const spanY = viewH + 2 * RAIN_MARGIN_M;
    const spanX = viewW + 2 * RAIN_MARGIN_M;
    const n = Math.min(RAIN_POOL, Math.round(viewW * viewH * RAIN_PER_M2 * level));
    for (let i = 0; i < RAIN_POOL; i++) {
      const img = this.rain[i] as Phaser.GameObjects.Image;
      if (i >= n) {
        if (img.visible) img.setVisible(false);
        continue;
      }
      const yOff = ((this.dropPhaseY[i] as number) * spanY + t * (this.dropSpeed[i] as number)) % spanY;
      const xOff = ((this.dropPhaseX[i] as number) * spanX + yOff * RAIN_SLANT) % spanX;
      img.setPosition(viewX - RAIN_MARGIN_M + xOff, viewY - RAIN_MARGIN_M + yOff).setAlpha(RAIN_ALPHA);
      if (!img.visible) img.setVisible(true);
    }
    const splashes = Math.round(SPLASH_POOL * level);
    for (let i = 0; i < SPLASH_POOL; i++) {
      const img = this.splash[i] as Phaser.GameObjects.Image;
      if (i >= splashes) {
        if (img.visible) img.setVisible(false);
        continue;
      }
      const phase = t * SPLASH_RATE + i * 0.37;
      const ph = phase - Math.floor(phase);
      const cyc = Math.floor(phase);
      const w = Math.max(0.01, ph * SPLASH_W_M);
      img.setPosition(viewX + hash(i * 13 + cyc) * viewW, viewY + hash(i * 29 + cyc) * viewH).setDisplaySize(w, w / 2).setAlpha((1 - ph) * SPLASH_ALPHA);
      if (!img.visible) img.setVisible(true);
    }
    const band = Math.min(viewW, viewH) * VIGNETTE_BAND;
    const [top, bottom, left, right] = this.vignette as [Phaser.GameObjects.Image, Phaser.GameObjects.Image, Phaser.GameObjects.Image, Phaser.GameObjects.Image];
    top.setPosition(viewX + viewW / 2, viewY + band / 2).setDisplaySize(viewW, band);
    bottom.setPosition(viewX + viewW / 2, viewY + viewH - band / 2).setDisplaySize(viewW, band);
    left.setPosition(viewX + band / 2, viewY + viewH / 2).setDisplaySize(viewH, band);
    right.setPosition(viewX + viewW - band / 2, viewY + viewH / 2).setDisplaySize(viewH, band);
  }

  destroy(): void {
    for (const l of this.tiles) {
      l.img.destroy();
      this.scene.textures.remove(l.key);
      releaseCanvas(l.canvas);
      releaseCanvas(l.base);
    }
    releaseCanvas(this.light);
    releaseCanvas(this.glow);
    this.tiles.length = 0;
    this.fireRing.destroy();
    for (const img of [this.flickerPool, this.flickerCore, ...this.busBlink, ...this.barrierBlink, ...this.fireLight, ...this.embers, ...this.rain, ...this.splash, ...this.vignette]) img.destroy();
  }
}
