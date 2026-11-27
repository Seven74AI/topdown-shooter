import type * as Phaser from "phaser";
import { darknessAlpha, isBlackout, type World } from "@topdown/shared";
import { addGeneratedTexture } from "../city/canvasTexture";
import { RebuildPhase, textureRegistry } from "../gfx/textureRegistry";
import { darkLookFor, type DarkLook } from "../city/palette";
import { DARKNESS_DEPTH } from "./aboveDark";
import { STAMP_CONE, STAMP_GLOW, TINT_BEAM, TINT_FIRE, TINT_FLASH, TINT_FLOOD, type DarknessPlan } from "./darknessPlan";
import { STAMP_PX, coneStampFor, lightStamps, type LightStampSet } from "./lightStamps";
import { GlLayers, rgbNumber, type GlLayer } from "./glLayer";

/** Story 10.2 (B8): the GPU darkness's texture keys (the 2D path keeps `DARKNESS_KEY`). */
export const DARKNESS_GL_KEY = "fx_darkness_gl";
export const DARKNESS_GL_FOG_KEY = "fx_darkness_gl_fog";

/** The texture key of the darkness canvas (brief 20: through `addGeneratedTexture`). */
export const DARKNESS_KEY = "fx_darkness";
/**
 * DD2: the darkness canvas resolution as a share of the game canvas (device px, DPR ≤ `MAX_DPR`):
 * half (architecture › Performance). T6 tried the quarter-size fallback: headless it gained nothing
 * (the headless cost is SwiftShader filling one more full-screen layer, not the canvas paint or the
 * upload), so half shipped (`docs/perf/epic-6-blackout.md`).
 */
export const DARKNESS_RES = 0.5;
/**
 * Review M1: the darkness reaches this share of the view past each edge, so a camera shake (at most
 * `MINE_SHAKE_MAX` = 1.2 % of the view, render/mineBlast.ts) never opens a lit strip at the screen edge.
 */
export const DARKNESS_PAD = 0.03;

/** The view the darkness covers: the camera view plus `DARKNESS_PAD` past each edge (written into `out`). */
export function padDarknessView(viewX: number, viewY: number, viewW: number, viewH: number, out: { viewX: number; viewY: number; viewW: number; viewH: number }): void {
  out.viewX = viewX - viewW * DARKNESS_PAD;
  out.viewY = viewY - viewH * DARKNESS_PAD;
  out.viewW = viewW * (1 + 2 * DARKNESS_PAD);
  out.viewH = viewH * (1 + 2 * DARKNESS_PAD);
}

/** What the view needs of a Phaser image (tests pass a fake). */
interface DarkImage {
  setOrigin(x: number, y: number): DarkImage;
  setDepth(d: number): DarkImage;
  setVisible(v: boolean): DarkImage;
  setPosition(x: number, y: number): DarkImage;
  setDisplaySize(w: number, h: number): DarkImage;
  destroy(): void;
  visible: boolean;
}

/**
 * Story 6.3 (AC 5, 7; F1, F6, F7, F9; DD1–DD3): the blackout darkness. ONE 2D canvas at
 * `DARKNESS_RES` of the game canvas covering the camera view, a texture made by
 * `addGeneratedTexture` (key `fx_darkness`; its paint is the current frame's darkness, so a lost
 * context repaints it), drawn as one image at `DARKNESS_DEPTH` (11.7: above every world object,
 * under the rain, the vignette and the build UI).
 *
 * While `isBlackout`: once per frame the canvas is filled with the level's dark colour at
 * `darknessAlpha` (server truth; no quality setting changes it: F6), the plan's light stamps are
 * erased (`destination-out`, pre-drawn canvases with `setTransform` + `drawImage`, no gradient or
 * filter per frame), the warm tints are drawn on top (≤ 0.1), then the texture is re-uploaded.
 * Otherwise the image is hidden and nothing is painted or uploaded (F9).
 */
/** Story 12.3 (AC 6): how much of the darkness the dawn lifts east of its line (1 = all), and the ramp strip's width (px). */
export const DAWN_LIFT = 0.9;
const DAWN_RAMP_PX = 64;

export class DarknessView {
  private canvas: HTMLCanvasElement | null = null;
  /**
   * Story 12.3 (AC 6): the extraction's dawn line (world x, m; NaN = none), its soft edge west of it (m) and its
   * strength (0…1): the darkness is lifted east of the line (`DAWN_LIFT`), ramping in over the edge. Set each frame.
   */
  dawnX = Number.NaN;
  dawnEdgeM = 6;
  dawnK = 0;
  /** A 0 → 1 alpha ramp (drawn once; scaled over the dawn's edge each paint: no gradient per frame). */
  private dawnRamp: HTMLCanvasElement | null = null;
  private tex: { refresh(): unknown } | null = null;
  private image: DarkImage | null = null;
  private w = 0;
  private h = 0;
  private readonly stamps: LightStampSet;
  /** What the last paint drew (the registry's repaint draws it again). */
  private alpha = 0;
  private look: DarkLook = darkLookFor(5);
  private plan: DarknessPlan | null = null;
  private k = 1;
  private vx = 0;
  private vy = 0;
  /** Paints and uploads so far (tests, the perf overlay). */
  paints = 0;
  uploads = 0;
  /**
   * Story 6.4 (AC 6): the Collapse fog painted into THIS canvas after the light stamps, before the
   * warm tints (fires still glow through it), so a blackout + fog frame is one full-screen layer.
   */
  fog: {
    paintInto(g: CanvasRenderingContext2D, w: number, h: number, k: number, vx: number, vy: number): void;
    /** Story 10.2 (B8): the same fog drawn on the GPU into `target`, built in `scratch` (a layer of the same size). */
    paintGl(target: GlLayer, scratch: () => GlLayer | null, w: number, h: number, k: number, vx: number, vy: number): void;
  } | null = null;
  /** Story 10.2 (B8): the GPU path (WebGL renderer), else null: the 2D canvas path. */
  private readonly gl: GlLayers | null;
  private glImage: DarkImage | null = null;
  private glLayer: GlLayer | null = null;
  private lookRgb = rgbNumber(darkLookFor(5).rgb);
  private lookRgbOf: DarkLook = darkLookFor(5);

  constructor(
    private readonly scene: Phaser.Scene,
    private readonly makeCanvas: () => HTMLCanvasElement = () => document.createElement("canvas"),
  ) {
    this.stamps = lightStamps(makeCanvas);
    this.gl = GlLayers.available(scene) ? new GlLayers(scene) : null;
  }

  /** The darkness is on screen this frame. */
  get shown(): boolean {
    return this.image?.visible === true || this.glImage?.visible === true;
  }

  /** The alpha the last frame painted (F6 tests). */
  get paintedAlpha(): number {
    return this.alpha;
  }

  /**
   * One frame: the camera view (m), its zoom (game px per m) and the game canvas size (px); `plan`
   * is this frame's `planDarkness`.
   */
  update(world: World, plan: DarknessPlan, viewX: number, viewY: number, viewW: number, viewH: number, zoom: number, gameW: number, gameH: number): void {
    if (!isBlackout(world)) {
      if (this.image?.visible) this.image.setVisible(false);
      if (this.glImage?.visible) this.glImage.setVisible(false);
      return;
    }
    const k2 = 1 + 2 * DARKNESS_PAD;
    const w = Math.max(1, Math.ceil(gameW * k2 * DARKNESS_RES));
    const h = Math.max(1, Math.ceil(gameH * k2 * DARKNESS_RES));
    const px = viewX - viewW * DARKNESS_PAD;
    const py = viewY - viewH * DARKNESS_PAD;
    if (this.gl && this.glFrame(world, plan, px, py, viewW * k2, viewH * k2, w, h, zoom)) return;
    if (w !== this.w || h !== this.h || !this.image) this.make(w, h);
    this.alpha = darknessAlpha(world);
    this.look = darkLookFor(world.lights.blackoutPct);
    this.plan = plan;
    this.k = zoom * DARKNESS_RES;
    this.vx = px;
    this.vy = py;
    const g = (this.canvas as HTMLCanvasElement).getContext("2d");
    if (g) this.paint(g);
    this.tex?.refresh();
    this.uploads++;
    const img = this.image as DarkImage;
    img.setPosition(px, py).setDisplaySize(viewW * k2, viewH * k2);
    if (!img.visible) img.setVisible(true);
  }

  /**
   * Story 10.2 (B8): the frame on the GPU (`GlLayer`, no canvas paint, no upload). False when the layer can't be made
   * (then the 2D path draws this frame).
   */
  private glFrame(world: World, plan: DarknessPlan, px: number, py: number, dw: number, dh: number, w: number, h: number, zoom: number): boolean {
    const l = (this.gl as GlLayers).get(DARKNESS_GL_KEY, w, h);
    if (!l) return false;
    if (l !== this.glLayer || !this.glImage) {
      this.glLayer = l;
      if (this.glImage) (this.glImage as unknown as Phaser.GameObjects.Image).setTexture(DARKNESS_GL_KEY);
      else this.glImage = (this.scene.add.image(0, 0, DARKNESS_GL_KEY) as unknown as DarkImage).setOrigin(0, 0).setDepth(DARKNESS_DEPTH);
    }
    this.w = w;
    this.h = h;
    this.alpha = darknessAlpha(world);
    this.look = darkLookFor(world.lights.blackoutPct);
    if (this.look !== this.lookRgbOf) {
      this.lookRgbOf = this.look;
      this.lookRgb = rgbNumber(this.look.rgb);
    }
    this.plan = plan;
    this.k = zoom * DARKNESS_RES;
    this.vx = px;
    this.vy = py;
    this.paintGl(l);
    l.flush();
    const img = this.glImage as DarkImage;
    img.setPosition(px, py).setDisplaySize(dw, dh);
    if (!img.visible) img.setVisible(true);
    if (this.image?.visible) this.image.setVisible(false);
    return true;
  }

  private readonly fogScratch = (): GlLayer | null => (this.gl ? this.gl.get(DARKNESS_GL_FOG_KEY, this.w, this.h) : null);

  /** `paint` on the GPU: the same steps (fill, stamps cut out, dawn, fog, warm tints), as `GlLayer` commands. */
  private paintGl(l: GlLayer): void {
    this.paints++;
    l.clear();
    if (this.alpha <= 0) return;
    const look = this.look;
    l.fill(this.lookRgb, this.alpha);
    const plan = this.plan;
    if (!plan) return;
    const st = this.stamps;
    const cones = look.hardBeams ? st.hard : st.soft;
    for (let i = 0; i < plan.count; i++) {
      const s = plan.strength[i] as number;
      if (plan.kind[i] === STAMP_CONE) {
        const c = coneStampFor(cones, plan.coneDeg[i] as number);
        this.glCone(l, c.canvas, c.ax, c.ay, i, s, true);
      } else this.glDisc(l, plan.kind[i] === STAMP_GLOW ? st.glow : st.disc, i, s, true);
    }
    if (!Number.isNaN(this.dawnX) && this.dawnK > 0) {
      const ramp = this.ensureDawnRamp();
      const x1 = (this.dawnX - this.vx) * this.k;
      const x0 = (this.dawnX - this.dawnEdgeM - this.vx) * this.k;
      const a = DAWN_LIFT * this.dawnK;
      if (x1 > 0 && x0 < this.w) l.stamp(ramp, x0, 0, Math.max(1, x1 - x0) / DAWN_RAMP_PX, this.h, 0, 0, 0, a, true);
      if (x1 < this.w) l.rect(Math.max(0, x1), 0, this.w - Math.max(0, x1), this.h, a, true);
    }
    this.fog?.paintGl(l, this.fogScratch, this.w, this.h, this.k, this.vx, this.vy);
    for (let i = 0; i < plan.count; i++) {
      const t = plan.tint[i] as number;
      if (t === TINT_BEAM) {
        const c = coneStampFor(st.beamTint, plan.coneDeg[i] as number);
        this.glCone(l, c.canvas, c.ax, c.ay, i, look.beamTintA, false);
      } else if (t === TINT_FIRE || t === TINT_FLOOD || t === TINT_FLASH) {
        const a = t === TINT_FIRE ? look.fireTintA : t === TINT_FLOOD ? look.floodTintA : look.flashTintA;
        this.glDisc(l, t === TINT_FIRE ? st.fireTint : t === TINT_FLOOD ? st.floodTint : st.flashTint, i, a, false);
      }
    }
  }

  /** `drawDisc` on the GPU. */
  private glDisc(l: GlLayer, img: HTMLCanvasElement, i: number, alpha: number, erase: boolean): void {
    const plan = this.plan as DarknessPlan;
    const sc = ((2 * (plan.radius[i] as number)) / STAMP_PX) * this.k;
    l.stamp(img, ((plan.x[i] as number) - this.vx) * this.k, ((plan.y[i] as number) - this.vy) * this.k, sc, sc, 0, STAMP_PX / 2, STAMP_PX / 2, alpha, erase);
  }

  /** `drawCone` on the GPU. */
  private glCone(l: GlLayer, img: HTMLCanvasElement, ax: number, ay: number, i: number, alpha: number, erase: boolean): void {
    const plan = this.plan as DarknessPlan;
    const sc = ((plan.radius[i] as number) / (STAMP_PX - ax)) * this.k;
    l.stamp(img, ((plan.x[i] as number) - this.vx) * this.k, ((plan.y[i] as number) - this.vy) * this.k, sc, sc, plan.angle[i] as number, ax, ay, alpha, erase);
  }

  /** (Re)makes the canvas texture at w × h (first blackout frame, or the game canvas resized). */
  private make(w: number, h: number): void {
    this.dropTexture();
    this.w = w;
    this.h = h;
    const c = this.makeCanvas();
    c.width = w;
    c.height = h;
    this.canvas = c;
    if (this.scene.textures.exists(DARKNESS_KEY)) this.scene.textures.remove(DARKNESS_KEY); // a restarted scene's leftover
    this.tex = addGeneratedTexture(this.scene, DARKNESS_KEY, c, (g) => this.paint(g), undefined, RebuildPhase.bake);
    this.image = (this.scene.add.image(0, 0, DARKNESS_KEY) as unknown as DarkImage).setOrigin(0, 0).setDepth(DARKNESS_DEPTH).setVisible(false);
  }

  /** The current frame's darkness (also the registry's repaint: the last frame's state). */
  private paint(g: CanvasRenderingContext2D): void {
    this.paints++;
    g.setTransform(1, 0, 0, 1, 0, 0);
    g.globalCompositeOperation = "source-over";
    g.globalAlpha = 1;
    if (this.alpha <= 0) {
      g.clearRect(0, 0, this.w, this.h);
      return;
    }
    const look = this.look;
    // Story 10.2 (T3 L1): one pass, not clear + fill: "copy" REPLACES every pixel with the dark colour at `alpha`
    // (the same pixels as clearRect then a source-over fill, one full-canvas pass less per frame).
    g.globalCompositeOperation = "copy";
    g.fillStyle = look.fill;
    g.globalAlpha = this.alpha;
    g.fillRect(0, 0, this.w, this.h);
    const plan = this.plan;
    if (!plan) return;
    const st = this.stamps;
    const cones = look.hardBeams ? st.hard : st.soft;
    g.globalCompositeOperation = "destination-out";
    for (let i = 0; i < plan.count; i++) {
      const s = plan.strength[i] as number;
      g.globalAlpha = s;
      if (plan.kind[i] === STAMP_CONE) {
        const c = coneStampFor(cones, plan.coneDeg[i] as number);
        this.drawCone(g, c.canvas, c.ax, c.ay, i);
      } else this.drawDisc(g, plan.kind[i] === STAMP_GLOW ? st.glow : st.disc, i);
    }
    if (!Number.isNaN(this.dawnX) && this.dawnK > 0) this.liftDawn(g);
    g.globalCompositeOperation = "source-over";
    if (this.fog) {
      this.fog.paintInto(g, this.w, this.h, this.k, this.vx, this.vy);
      g.globalCompositeOperation = "source-over";
    }
    for (let i = 0; i < plan.count; i++) {
      const t = plan.tint[i] as number;
      if (t === TINT_BEAM) {
        g.globalAlpha = look.beamTintA;
        const c = coneStampFor(st.beamTint, plan.coneDeg[i] as number);
        this.drawCone(g, c.canvas, c.ax, c.ay, i);
      } else if (t === TINT_FIRE || t === TINT_FLOOD || t === TINT_FLASH) {
        g.globalAlpha = t === TINT_FIRE ? look.fireTintA : t === TINT_FLOOD ? look.floodTintA : look.flashTintA;
        this.drawDisc(g, t === TINT_FIRE ? st.fireTint : t === TINT_FLOOD ? st.floodTint : st.flashTint, i);
      }
    }
    g.setTransform(1, 0, 0, 1, 0, 0);
    g.globalAlpha = 1;
  }

  /** Story 12.3: erases the darkness east of the dawn line (still in `destination-out`), the edge as a ramp. */
  private liftDawn(g: CanvasRenderingContext2D): void {
    const ramp = this.ensureDawnRamp();
    const x1 = (this.dawnX - this.vx) * this.k;
    const x0 = (this.dawnX - this.dawnEdgeM - this.vx) * this.k;
    g.setTransform(1, 0, 0, 1, 0, 0);
    g.globalAlpha = DAWN_LIFT * this.dawnK;
    if (x1 > 0 && x0 < this.w) g.drawImage(ramp, x0, 0, Math.max(1, x1 - x0), this.h);
    if (x1 < this.w) {
      g.fillStyle = "#fff";
      g.fillRect(Math.max(0, x1), 0, this.w - Math.max(0, x1), this.h);
    }
    g.globalAlpha = 1;
  }

  /** The dawn's 0 → 1 ramp (drawn once). */
  private ensureDawnRamp(): HTMLCanvasElement {
    let ramp = this.dawnRamp;
    if (!ramp) {
      ramp = this.makeCanvas();
      ramp.width = DAWN_RAMP_PX;
      ramp.height = 1;
      const r = ramp.getContext("2d");
      if (r) {
        const grad = r.createLinearGradient(0, 0, DAWN_RAMP_PX, 0); // once
        grad.addColorStop(0, "rgba(255,255,255,0)");
        grad.addColorStop(1, "rgba(255,255,255,1)");
        r.fillStyle = grad;
        r.fillRect(0, 0, DAWN_RAMP_PX, 1);
      }
      this.dawnRamp = ramp;
    }
    return ramp;
  }

  /** A disc stamp of the plan's radius at its centre (canvas px = (world − view) × k). */
  private drawDisc(g: CanvasRenderingContext2D, img: HTMLCanvasElement, i: number): void {
    const plan = this.plan as DarknessPlan;
    const sc = ((2 * (plan.radius[i] as number)) / STAMP_PX) * this.k;
    g.setTransform(sc, 0, 0, sc, ((plan.x[i] as number) - this.vx) * this.k, ((plan.y[i] as number) - this.vy) * this.k);
    g.drawImage(img, -STAMP_PX / 2, -STAMP_PX / 2);
  }

  /** A cone stamp, apex at the survivor, rotated to the facing, its length = the range. */
  private drawCone(g: CanvasRenderingContext2D, img: HTMLCanvasElement, ax: number, ay: number, i: number): void {
    const plan = this.plan as DarknessPlan;
    const sc = ((plan.radius[i] as number) / (STAMP_PX - ax)) * this.k;
    const a = plan.angle[i] as number;
    const cos = Math.cos(a) * sc;
    const sin = Math.sin(a) * sc;
    g.setTransform(cos, sin, -sin, cos, ((plan.x[i] as number) - this.vx) * this.k, ((plan.y[i] as number) - this.vy) * this.k);
    g.drawImage(img, -ax, -ay);
  }

  private dropTexture(): void {
    this.image?.destroy();
    this.image = null;
    if (this.canvas) {
      textureRegistry.unregister(DARKNESS_KEY);
      if (this.scene.textures.exists(DARKNESS_KEY)) this.scene.textures.remove(DARKNESS_KEY);
      this.canvas.width = 0;
      this.canvas.height = 0;
    }
    this.canvas = null;
    this.tex = null;
  }

  destroy(): void {
    this.dropTexture();
    this.glImage?.destroy();
    this.glImage = null;
    this.glLayer = null;
    this.gl?.destroy();
    this.plan = null;
  }
}
