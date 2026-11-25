import * as Phaser from "phaser";
import { collapseStyleAt, isBlackout, isPowerOut, ruinsLookAt, type DistrictMap, type FireRecord, type World } from "@topdown/shared";
import { lampOutAt } from "./lampFlicker";
import { rainAlphaFor } from "./rainLook";
import { MAX_ATLAS_PX, tileRects } from "./atlasLayout";
import { MAP_PX_PER_M, carStyle, dressingFor, type Dressing } from "./dressing";
import { BARRIER_LAMPS, blinkerSpots, drawGlow, drawLightmap, policePieces, resetPatternTiles, type CityScene } from "./drawCity";
import { PoliceLineView } from "./PoliceLineView";
import type { PolicePiece } from "./streetPropsFrames";
import { standDepth } from "../barricadeLook";
import { bakeTiles } from "./bakeTiles";
import { LAMP, LAMP_GLOW, nightAt } from "./palette";
import { ATLAS_FX, FX_ASH, FX_GLOW, FX_LAMP_DARK, FX_RAIN, FX_SPLASH, FX_VIGNETTE, ensureAtlases, type AtlasCanvas } from "./spriteAtlas";
import { hash } from "./spriteArt";
import { addCanvasTexture, releaseCanvas } from "./canvasTexture";
import { lookKey, staticKey } from "./stageFilter";
import { FIRE_RING_ALPHA, FIRE_RING_COLOR, FIRE_RING_GLOW_PX, damageTickPulse, fireRingGlowAlpha, fireRingWidthM, strokeFireRings, strokeFireRingGlows } from "./fireRing";
import { FireView } from "./FireView";
import { RebuildPhase, textureRegistry } from "../gfx/textureRegistry";

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
/** Story 9.14: a standing line's blinker sits just over its drum (the drum is lifted 1e-4 over its row). */
const BLINK_OVER_STAND = 2e-4;
/** Burning cars: at most this many drawn (Story 4.12: each a pooled particle fire, `FireView`). */
const FIRE_LIGHTS = 4;
/** Story 6.2: the lamp drop-out disc (lab `lampDark`: R 5.8 m), drawn MULTIPLY over the baked pool. */
const LAMP_DARK_R_M = 5.8;
/** Story 6.4 CO3 ash: flake size (m), fall speed × the rain's, drift (m/s), alpha. */
const ASH_W_M = 0.07;
const ASH_H_M = 0.045;
const ASH_SPEED_K = 0.08;
const ASH_DRIFT_MPS = 0.6;
const ASH_ALPHA = 0.55;
/** Story 6.4 CO4 flood: heavier rain (× the stage's rain level). */
const FLOOD_RAIN_K = 1.3;
/** `COLLAPSE_STYLES` indexes (shared `decay/collapse.ts`). */
const STYLE_ASH = 2;
const STYLE_FLOOD = 3;

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
  /** Story 9.14 (AC 4): the standing sawhorse police lines (pooled images, placed per bake). */
  readonly policeLines: PoliceLineView;
  private readonly policeScratch: PolicePiece[] = [];
  /** Story 4.8 review M3: the thin ring at each zone's damage edge; Story 4.12: its soft glow just inside it. */
  private readonly fireRing: Phaser.GameObjects.Graphics;
  private readonly fireRingGlow: Phaser.GameObjects.Graphics;
  private fires: readonly FireRecord[] = [];
  /** Story 4.12: the code-drawn particle fire of every burning car (lab panel D). */
  readonly fireView: FireView;
  private ringZoom = -1;
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
  /** Story 4.13: drops this view's entry from the texture registry. */
  private readonly unregisterRebuild: () => void;
  /** Story 6.2: one MULTIPLY drop-out disc per streetlight (only the ones out this tick are visible). */
  private readonly lampDark: Phaser.GameObjects.Image[] = [];
  /** Stories 6.2 / 6.4: what the last bake showed (material, weather style, power). */
  private ruinsLook = 0;
  private collapseStyle = -1;
  private powerOut = false;
  /** Story 6.4: the rain pool currently draws ash (CO3). */
  private ashing = false;
  /** Story 6.2: lamps out this frame (tests / browser checks). */
  lampsOut = 0;

  constructor(
    private readonly scene: Phaser.Scene,
    private readonly map: DistrictMap,
    /** Camera zoom (device px per metre) when the run starts: the bake density (D2). */
    zoomPxPerM: number,
    /** Story 4.12: `?fx=low`, half the fire particles. */
    private readonly lowFx = false,
    /** Story 6.2: the run seed (the server's online), the lamp flicker's key: every phone agrees. */
    private readonly runSeed: () => number = () => 0,
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
    // Story 6.2: the drop-out discs (MULTIPLY: below every character, above the baked street).
    this.dressing.lamps.forEach(([x, y]) => {
      this.lampDark.push(
        scene.add
          .image(x / MAP_PX_PER_M, y / MAP_PX_PER_M, ATLAS_FX, FX_LAMP_DARK)
          .setDisplaySize(2 * LAMP_DARK_R_M, 2 * LAMP_DARK_R_M)
          .setBlendMode(Phaser.BlendModes.MULTIPLY)
          .setDepth(DYN_LIGHT_DEPTH)
          .setVisible(false),
      );
    });
    for (let i = 0; i < 2; i++) this.busBlink.push(glowImg(BLINK_BUS_M, BLINK_COLOR));
    for (let i = 0; i < BARRIER_LAMPS; i++) this.barrierBlink.push(glowImg(BLINK_BARRIER_M, BLINK_COLOR));
    this.policeLines = new PoliceLineView(scene);
    this.fireRing = scene.add.graphics().setDepth(FIRE_RING_DEPTH);
    this.fireRingGlow = scene.add.graphics().setDepth(FIRE_RING_DEPTH).setBlendMode(Phaser.BlendModes.ADD);
    this.fireView = new FireView(scene, FIRE_LIGHTS, this.lowFx);
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
    // Story 4.13: after a lost graphics context the bake tiles, their base caches and the noise
    // patterns may be empty: bake everything again on the next update (after the atlases, which the
    // registry redraws first). A 2D `contextrestored` on any tile canvas asks for the same.
    this.unregisterRebuild = textureRegistry.register(
      `city_static_${id}`,
      RebuildPhase.bake,
      () => this.invalidateBake(),
      this.tiles.flatMap((t) => [t.canvas, t.base]),
    );
  }

  /** Story 4.13: the next `update` bakes the whole city again (base layer included). */
  invalidateBake(): void {
    resetPatternTiles();
    this.shownBaseKey = null;
    this.shownKey = -1;
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
    // Stories 6.2 / 6.4: the run's material and weather style, the power (all derived from synced state).
    this.ruinsLook = ruinsLookAt(world);
    this.collapseStyle = collapseStyleAt(world);
    this.powerOut = isPowerOut(world);
    const cs: CityScene = {
      map: this.map,
      dressing: this.dressing,
      stage,
      cover: o.cover,
      walls: o.walls,
      fires: world.decay.fires,
      atlas: this.atlas,
      ruinsLook: this.ruinsLook,
      collapseStyle: this.collapseStyle,
      powerOut: this.powerOut,
      lowFx: this.lowFx,
    };
    const ls = LIGHT_PX_PER_M / MAP_PX_PER_M;
    for (const [canvas, draw] of [
      [this.light, drawLightmap],
      [this.glow, drawGlow],
    ] as const) {
      const g = canvas.getContext("2d") as CanvasRenderingContext2D;
      g.setTransform(ls, 0, 0, ls, 0, 0);
      draw(g, cs);
    }
    this.shownBaseKey = bakeTiles(this.tiles, cs, this.bakePxPerM, this.shownBaseKey, this.light, this.glow).baseKey;
    for (const t of this.tiles) t.tex.refresh();
    const spots = blinkerSpots(cs);
    this.placeBlinkers(this.busBlink, spots.bus);
    this.placeBlinkers(this.barrierBlink, spots.barrier);
    // Story 9.14 (AC 4): a standing line's blinkers glow on its drums' lamps, just over the drum pictures
    for (let i = 0; i < this.barrierBlink.length; i++) {
      const y = spots.barrierStand[i] ?? -1;
      (this.barrierBlink[i] as Phaser.GameObjects.Image).setDepth(y >= 0 ? standDepth(y) + BLINK_OVER_STAND : DYN_LIGHT_DEPTH);
    }
    this.policeLines.show(policePieces(cs, this.policeScratch));
    this.fires = cs.fires;
    this.ringZoom = -1; // redraw the ring
    // Story 4.12: the particle fires follow the bake's fires; flames on the car follow its facing.
    this.fireView.setFires(cs.fires, (f) => {
      const car = o.cover.find((c) => c.name === f.target);
      if (!car) return 0;
      const front = carStyle(this.dressing, car.name, car.maxX - car.minX, car.maxY - car.minY).front;
      return front === "right" ? 0 : front === "down" ? Math.PI / 2 : front === "left" ? Math.PI : -Math.PI / 2;
    });
    this.bakeMs = performance.now() - t0;
    this.bakeCount++;
  }

  /**
   * Story 4.8 review M3: the thin ring at each burning zone's damage edge (`fireRingRadiusM`: a body
   * touching it burns), ~2 px whatever the zoom (redrawn only when the zoom or the fires change).
   * Story 4.12 (lab panel D): a soft additive band just inside it, pulsing with the damage tick.
   */
  private updateFireRing(t: number, pulseS: number): void {
    const zoom = this.scene.cameras.main.zoom;
    const fires = this.fires;
    if (zoom !== this.ringZoom) {
      this.ringZoom = zoom;
      const g = this.fireRing;
      g.clear();
      g.lineStyle(fireRingWidthM(zoom), FIRE_RING_COLOR, FIRE_RING_ALPHA);
      strokeFireRings(g, fires, FIRE_LIGHTS);
      const glow = this.fireRingGlow;
      glow.clear();
      glow.lineStyle(FIRE_RING_GLOW_PX / Math.max(1e-6, zoom), FIRE_RING_COLOR, 1);
      strokeFireRingGlows(glow, fires, FIRE_LIGHTS, zoom);
    }
    this.fireRingGlow.setAlpha(fireRingGlowAlpha(damageTickPulse(t, pulseS)));
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
  /**
   * Story 6.10 (P1): the power failure's flicker this frame (−1: none; 0: lamps on; 1: lamps out),
   * set by the Game scene from `EventView.powerFlicker()` before `update`.
   */
  powerFlicker: -1 | 0 | 1 = -1;

  update(world: Readonly<World>, viewX: number, viewY: number, viewW: number, viewH: number, dtS: number, synced = true): void {
    // Review L (late join): online, wait for the first server state (it carries the decay stage)
    // instead of baking stage 1 and baking again a moment later.
    if (!synced && this.shownKey < 0) return;
    const o = world.obstacles;
    const key = staticKey(o.stage, o.version, world.decay.fires.length, lookKey(ruinsLookAt(world), collapseStyleAt(world)));
    if (key !== this.shownKey) {
      this.shownKey = key;
      this.showStage(world);
    }
    this.clockS += dtS;
    const t = this.clockS;
    const on = hash(Math.floor(t * FLICKER_HZ)) > FLICKER_ON;
    // Story 6.4 (F1): the broken lamp is dark too once the power is out.
    const lampsOn = !this.powerOut;
    if (this.flickerPool.visible !== lampsOn && this.dressing.flickerLamp >= 0) {
      this.flickerPool.setVisible(lampsOn);
      this.flickerCore.setVisible(lampsOn);
    }
    const pf = this.powerFlicker;
    this.flickerPool.setAlpha(pf === 1 ? 0.02 : pf === 0 ? 0.18 : on ? 0.18 : 0.02);
    this.flickerCore.setAlpha(pf === 1 ? 0.04 : pf === 0 ? 0.5 : on ? 0.5 : 0.04);
    this.updateLampFlicker(world);
    const bus = Math.sin(t * 2 * Math.PI * BLINK_BUS_HZ) > 0 ? 0.55 : 0;
    for (const b of this.busBlink) b.setAlpha(bus);
    const bar = Math.sin(t * 4 + 1) > 0 ? 0.45 : 0.1;
    // Each barrier's two lamps alternate (spots come in pairs per barrier).
    for (let i = 0; i < this.barrierBlink.length; i++) (this.barrierBlink[i] as Phaser.GameObjects.Image).setAlpha(i % 2 === 0 ? bar : 0.55 - bar);
    this.updateFireRing(t, world.balance.decay.fire.pulseS);
    this.fireView.update(dtS, t, viewX, viewY, viewW, viewH);

    // Story 6.4: CO3 ash replaces the rain (the same pool: slower, drifting grey flakes; `?fx=low` half),
    // CO4 flood rains harder. Other stages and styles: the stage's rain.
    const ash = this.stage >= 5 && this.collapseStyle === STYLE_ASH;
    if (ash !== this.ashing) this.setAsh(ash);
    const level = ash ? 0 : nightAt(this.stage).rain * (this.stage >= 5 && this.collapseStyle === STYLE_FLOOD ? FLOOD_RAIN_K : 1);
    const rainA = ash ? ASH_ALPHA : rainAlphaFor(world, RAIN_ALPHA); // Story 6.3 (D7): dimmed in a blackout; one compare per frame
    const spanY = viewH + 2 * RAIN_MARGIN_M;
    const spanX = viewW + 2 * RAIN_MARGIN_M;
    const ashCap = Math.min(RAIN_POOL, world.balance.decay.collapse.maxAshFlakes);
    const n = ash
      ? Math.round((this.lowFx ? 0.5 : 1) * Math.min(ashCap, viewW * viewH * RAIN_PER_M2 * 0.5))
      : Math.min(RAIN_POOL, Math.round(viewW * viewH * RAIN_PER_M2 * level));
    const speedK = ash ? ASH_SPEED_K : 1;
    for (let i = 0; i < RAIN_POOL; i++) {
      const img = this.rain[i] as Phaser.GameObjects.Image;
      if (i >= n) {
        if (img.visible) img.setVisible(false);
        continue;
      }
      const yOff = ((this.dropPhaseY[i] as number) * spanY + t * (this.dropSpeed[i] as number) * speedK) % spanY;
      const drift = ash ? Math.sin(t * 0.8 + i) * 0.4 + t * ASH_DRIFT_MPS : yOff * RAIN_SLANT;
      const xOff = ((((this.dropPhaseX[i] as number) * spanX + drift) % spanX) + spanX) % spanX;
      img.setPosition(viewX - RAIN_MARGIN_M + xOff, viewY - RAIN_MARGIN_M + yOff).setAlpha(rainA);
      if (!img.visible) img.setVisible(true);
    }
    const splashes = ash ? 0 : Math.round(SPLASH_POOL * Math.min(1, level));
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

  /**
   * Story 6.2 (F6, D7): at stage 4, while the power is on and no blackout is drawn, each lamp whose
   * `lampOutAt(run seed, lamp, World tick)` is true shows its drop-out disc (the broken lamp keeps its
   * own fast flicker). The World tick is the server's online, so every phone agrees.
   */
  private updateLampFlicker(world: Readonly<World>): void {
    const active = this.stage === 4 && !this.powerOut && !isBlackout(world as World);
    const cfg = world.balance.decay.ruins;
    const seed = this.runSeed();
    // Story 6.10 (P1): the power failure's 2 s flicker drives every lamp together (any stage; keyed off
    // the server's phase tick, so every phone flickers in step), then the blackout takes over.
    const power = this.powerFlicker;
    let out = 0;
    for (let i = 0; i < this.lampDark.length; i++) {
      const img = this.lampDark[i] as Phaser.GameObjects.Image;
      const show = power >= 0 ? power === 1 && !this.powerOut : active && i !== this.dressing.flickerLamp && lampOutAt(seed, i, world.tick, cfg);
      if (show) out++;
      if (img.visible !== show) img.setVisible(show);
    }
    this.lampsOut = out;
  }

  /** Story 6.4: switch the rain pool between rain drops and CO3 ash flakes. */
  private setAsh(ash: boolean): void {
    this.ashing = ash;
    for (const img of this.rain) {
      if (ash) img.setFrame(FX_ASH).setDisplaySize(ASH_W_M, ASH_H_M).setRotation(0).setTint(0xb8b2a8);
      else img.setFrame(FX_RAIN).setDisplaySize(RAIN_W_M, RAIN_LEN_M).setRotation(-Math.atan(RAIN_SLANT)).clearTint();
    }
  }

  destroy(): void {
    this.unregisterRebuild();
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
    this.fireRingGlow.destroy();
    this.fireView.destroy();
    this.policeLines.destroy();
    for (const img of [this.flickerPool, this.flickerCore, ...this.lampDark, ...this.busBlink, ...this.barrierBlink, ...this.rain, ...this.splash, ...this.vignette]) img.destroy();
  }
}
