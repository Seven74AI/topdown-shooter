import type * as Phaser from "phaser";
import { collapseStyleAt, isBlackout, type World } from "@topdown/shared";
import { RebuildPhase, textureRegistry, type RestorableCanvas } from "../gfx/textureRegistry";
import { STAMP_CONE, type DarknessPlan } from "../darkness/darknessPlan";
import { STAMP_PX, coneStampFor, lightStamps, type LightStampSet } from "../darkness/lightStamps";
import { DARKNESS_DEPTH } from "../darkness/aboveDark";
import type { ScreenFog } from "./screenFog";

/**
 * Story 6.4 (AC 6; D7, D8): the Collapse fog's LOOK (the hiding rule is `ScreenFog` / the shared
 * `fogVisibility`; nothing here changes what is visible: F5). The style comes from `collapseStyleAt`
 * (CO1 haze, CO2 fog bank, CO3 ash, CO4 flood; colours from `docs/art/epic-6/src/main2.js › fogLayer`).
 *
 * - While 6.3's darkness is drawn (every stage-5 wave and build phase): the fog is painted INTO the
 *   darkness texture (`DarknessView.fog`, no second full-screen pass): a ring mask round the camera's
 *   survivor (transparent inside `clearM`, opaque from `radiusM`), the style colour, CO2's two drifting
 *   noise layers (`?fx=low`: plain haze), and every survivor's beam cut out of it (beams see through).
 * - Otherwise (only a dev cheat forcing the blackout off at stage 5): ring geometry covering only the
 *   area beyond `clearM` (concentric bands; never a full-screen quad: the 4.9 review's −40 % FPS).
 *
 * Every canvas it draws from is registered for repaint (brief 20).
 */
export interface FogStyleLook {
  readonly rgb: string;
  /** Opacity at and beyond the fog radius. */
  readonly alpha: number;
  readonly noise: boolean;
}
export const FOG_LOOKS: readonly FogStyleLook[] = [
  { rgb: "30,35,45", alpha: 0.9, noise: false }, // CO1 haze
  { rgb: "44,50,60", alpha: 0.86, noise: true }, // CO2 fog bank
  { rgb: "40,33,28", alpha: 0.9, noise: false }, // CO3 ash (brown smoke)
  { rgb: "70,78,90", alpha: 0.8, noise: false }, // CO4 flood (low white fog)
];
/** Geometry fallback: depth just under the darkness (above zombies, under every above-dark slot). */
export const FOG_DEPTH = DARKNESS_DEPTH - 0.05;
/** Geometry fallback: fade bands between clear and radius, and how far the outer band reaches (m). */
const FOG_BANDS = 8;
const FOG_OUTER_M = 40;
/** Ring mask resolution (px) and the fog-bank noise tile (px) and its size on the ground (m). */
const RING_PX = 256;
const NOISE_PX = 128;
const NOISE_TILE_M = 6;
const NOISE_ALPHA = [0.45, 0.3] as const;
const NOISE_SPEED_MPS = [0.35, 0.55] as const;

/** Tileable value noise (fbm, the lab's `buildFogTex`), alpha only, into `c`. */
function paintNoise(g: CanvasRenderingContext2D, S: number): void {
  const hash = (n: number): number => {
    const s = Math.sin(n) * 43758.5453;
    return s - Math.floor(s);
  };
  const P = 4; // lattice cells per tile (wraps: tileable)
  const vn = (x: number, y: number, o: number): number => {
    const xi = Math.floor(x);
    const yi = Math.floor(y);
    const xf = x - xi;
    const yf = y - yi;
    const u = xf * xf * (3 - 2 * xf);
    const v = yf * yf * (3 - 2 * yf);
    const per = P << o;
    const h = (a: number, b: number): number => hash((((a % per) + per) % per) * 127.1 + (((b % per) + per) % per) * 311.7 + o * 74.7);
    const a0 = h(xi, yi) + (h(xi + 1, yi) - h(xi, yi)) * u;
    const a1 = h(xi, yi + 1) + (h(xi + 1, yi + 1) - h(xi, yi + 1)) * u;
    return a0 + (a1 - a0) * v;
  };
  const im = g.createImageData(S, S);
  const d = im.data;
  for (let y = 0; y < S; y++) {
    for (let x = 0; x < S; x++) {
      let a = 0;
      let amp = 0.5;
      for (let o = 0; o < 3; o++) {
        a += amp * vn((x / S) * (P << o), (y / S) * (P << o), o);
        amp *= 0.5;
      }
      const i = (y * S + x) * 4;
      d[i] = d[i + 1] = d[i + 2] = 255;
      d[i + 3] = Math.max(0, Math.min(1, (a / 0.875 - 0.25) * 1.9)) * 255;
    }
  }
  g.putImageData(im, 0, 0);
}

/** The ring mask: alpha 0 inside `inner` (share of the radius), linear to 1 at the edge, 1 in the corners. */
function paintRing(g: CanvasRenderingContext2D, S: number, inner: number): void {
  g.clearRect(0, 0, S, S);
  const gr = g.createRadialGradient(S / 2, S / 2, (S / 2) * inner, S / 2, S / 2, S / 2);
  gr.addColorStop(0, "rgba(255,255,255,0)");
  gr.addColorStop(1, "rgba(255,255,255,1)");
  g.fillStyle = gr;
  g.fillRect(0, 0, S, S);
}

export class FogView {
  private readonly stamps: LightStampSet;
  private readonly noise: HTMLCanvasElement;
  private readonly ring: HTMLCanvasElement;
  private ringInner = -1;
  private fogCanvas: HTMLCanvasElement | null = null;
  private noisePattern: CanvasPattern | null = null;
  private readonly geo: Phaser.GameObjects.Graphics;
  private geoKey = "";
  private readonly unregister: () => void;
  private style = 0;
  private t = 0;
  /** This frame the fog rides in the darkness texture. */
  inDarkness = false;
  /** Counters (tests, the perf overlay): paints into the darkness, geometry redraws. */
  darkPaints = 0;
  geometryDraws = 0;
  private plan: DarknessPlan | null = null;
  private colourFill: string[];

  constructor(
    scene: Phaser.Scene,
    private readonly fog: ScreenFog,
    private readonly lowFx: boolean,
    private readonly makeCanvas: () => HTMLCanvasElement = () => document.createElement("canvas"),
  ) {
    this.stamps = lightStamps(makeCanvas);
    this.noise = makeCanvas();
    this.noise.width = this.noise.height = NOISE_PX;
    this.ring = makeCanvas();
    this.ring.width = this.ring.height = RING_PX;
    const repaint = (): void => {
      const g = this.noise.getContext("2d");
      if (g) paintNoise(g, NOISE_PX);
      this.noisePattern = null;
      this.ringInner = -1;
    };
    repaint();
    this.unregister = textureRegistry.register("fx_fog_noise", RebuildPhase.cache, repaint, [this.noise as unknown as RestorableCanvas, this.ring as unknown as RestorableCanvas]);
    this.colourFill = FOG_LOOKS.map((l) => `rgb(${l.rgb})`);
    this.geo = scene.add.graphics().setDepth(FOG_DEPTH).setVisible(false);
  }

  /** Once per frame after `ScreenFog.update` and before the darkness paints (`plan` = this frame's stamps). */
  update(world: World, plan: DarknessPlan, dtS: number): void {
    this.t += dtS;
    this.plan = plan;
    const on = this.fog.on;
    const style = Math.max(0, collapseStyleAt(world));
    this.style = style;
    this.inDarkness = on && isBlackout(world);
    const geo = on && !this.inDarkness;
    if (!geo) {
      if (this.geo.visible) this.geo.setVisible(false);
      return;
    }
    const r = this.fog.radii;
    const key = `${r.clearM}|${r.radiusM}|${style}`;
    if (key !== this.geoKey) {
      this.geoKey = key;
      this.drawGeometry(r.clearM, r.radiusM, FOG_LOOKS[style] as FogStyleLook);
    }
    this.geo.setPosition(this.fog.viewerX, this.fog.viewerY);
    if (!this.geo.visible) this.geo.setVisible(true);
  }

  /** Bands from `clearM` out: nothing is drawn inside the clear circle (fill rate; F5: look only). */
  private drawGeometry(clearM: number, radiusM: number, look: FogStyleLook): void {
    this.geometryDraws++;
    const g = this.geo;
    g.clear();
    const col = look.rgb.split(",").reduce((a, v) => (a << 8) | Number(v), 0);
    const step = (radiusM - clearM) / FOG_BANDS;
    for (let i = 0; i < FOG_BANDS; i++) {
      g.lineStyle(step, col, (look.alpha * (i + 0.5)) / FOG_BANDS);
      g.strokeCircle(0, 0, clearM + step * (i + 0.5));
    }
    g.lineStyle(FOG_OUTER_M, col, look.alpha);
    g.strokeCircle(0, 0, radiusM + FOG_OUTER_M / 2);
  }

  /**
   * Called by `DarknessView.paint` after the light stamps, before the warm tints: the fog for this
   * frame composited into the darkness canvas `g` (w × h px; k px per m; (vx, vy) the canvas origin).
   */
  paintInto(g: CanvasRenderingContext2D, w: number, h: number, k: number, vx: number, vy: number): void {
    if (!this.inDarkness) return;
    const look = FOG_LOOKS[this.style] as FogStyleLook;
    let fc = this.fogCanvas;
    if (!fc || fc.width !== w || fc.height !== h) {
      fc = this.fogCanvas ?? this.makeCanvas();
      fc.width = w;
      fc.height = h;
      this.fogCanvas = fc;
    }
    const f = fc.getContext("2d");
    if (!f) return;
    this.darkPaints++;
    const r = this.fog.radii;
    const inner = r.clearM / r.radiusM;
    if (inner !== this.ringInner) {
      const rg = this.ring.getContext("2d");
      if (rg) paintRing(rg, RING_PX, inner);
      this.ringInner = inner;
    }
    f.setTransform(1, 0, 0, 1, 0, 0);
    f.globalCompositeOperation = "source-over";
    f.globalAlpha = 1;
    f.clearRect(0, 0, w, h);
    // The mask: the ring stamp at the viewer, opaque everywhere outside its square.
    const cx = (this.fog.viewerX - vx) * k;
    const cy = (this.fog.viewerY - vy) * k;
    const R = r.radiusM * k;
    f.drawImage(this.ring, cx - R, cy - R, 2 * R, 2 * R);
    f.fillStyle = "#fff";
    f.fillRect(0, 0, w, Math.max(0, cy - R));
    f.fillRect(0, cy + R, w, Math.max(0, h - cy - R));
    f.fillRect(0, cy - R, Math.max(0, cx - R), 2 * R);
    f.fillRect(cx + R, cy - R, Math.max(0, w - cx - R), 2 * R);
    // CO2: two drifting noise layers thin the mask (`?fx=low`: plain haze).
    if (look.noise && !this.lowFx) {
      if (!this.noisePattern) this.noisePattern = f.createPattern(this.noise, "repeat");
      const pat = this.noisePattern;
      if (pat) {
        f.globalCompositeOperation = "destination-out"; // the noise thins the fog into drifting wisps (then the colour)
        f.fillStyle = pat;
        const sc = (NOISE_TILE_M * k) / NOISE_PX;
        for (let L = 0; L < 2; L++) {
          const ox = (((this.t * (NOISE_SPEED_MPS[L] as number) - vx) * k) % (NOISE_TILE_M * k)) + L * 37;
          const oy = (((this.t * 0.12 - vy) * k) % (NOISE_TILE_M * k)) + L * 53;
          f.setTransform(sc, 0, 0, sc, ox, oy);
          f.globalAlpha = NOISE_ALPHA[L] as number;
          f.fillRect(-ox / sc - NOISE_PX, -oy / sc - NOISE_PX, w / sc + 2 * NOISE_PX, h / sc + 2 * NOISE_PX);
        }
        f.setTransform(1, 0, 0, 1, 0, 0);
        f.globalAlpha = 1;
      }
    }
    // The colour (source-in keeps the mask's alpha).
    f.globalCompositeOperation = "source-in";
    f.fillStyle = this.colourFill[this.style] as string;
    f.fillRect(0, 0, w, h);
    // Beams see through the fog (D2): every survivor's cone stamp erased (the plan's cones).
    const plan = this.plan;
    if (plan) {
      f.globalCompositeOperation = "destination-out";
      for (let i = 0; i < plan.count; i++) {
        if (plan.kind[i] !== STAMP_CONE) continue;
        const c = coneStampFor(this.stamps.hard, plan.coneDeg[i] as number);
        const sc = ((plan.radius[i] as number) / (STAMP_PX - c.ax)) * k;
        const a = plan.angle[i] as number;
        const cos = Math.cos(a) * sc;
        const sin = Math.sin(a) * sc;
        f.globalAlpha = 1;
        f.setTransform(cos, sin, -sin, cos, ((plan.x[i] as number) - vx) * k, ((plan.y[i] as number) - vy) * k);
        f.drawImage(c.canvas, -c.ax, -c.ay);
      }
      f.setTransform(1, 0, 0, 1, 0, 0);
    }
    f.globalCompositeOperation = "source-over";
    f.globalAlpha = 1;
    // Into the darkness canvas.
    g.setTransform(1, 0, 0, 1, 0, 0);
    g.globalCompositeOperation = "source-over";
    g.globalAlpha = look.alpha;
    g.drawImage(fc, 0, 0);
    g.globalAlpha = 1;
  }

  destroy(): void {
    this.unregister();
    this.geo.destroy();
    if (this.fogCanvas) {
      this.fogCanvas.width = 0;
      this.fogCanvas.height = 0;
    }
    this.fogCanvas = null;
  }
}
