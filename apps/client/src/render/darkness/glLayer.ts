import type * as Phaser from "phaser";
import { addFrameTexture, addMirrorTexture, removeFrameTexture } from "../city/canvasTexture";

/**
 * Story 10.2 (T3, decision 10.2-B8): the blackout darkness and its fog drawn on the GPU. The 2D path painted a
 * half-size canvas every frame and re-uploaded it (`texImage2D`): at wave 9 with 4× CPU throttling that was ~43 ms of
 * every frame (profile in `docs/perf/epic-10-fps.md`). A `GlLayer` is the same drawing as GPU commands into a
 * DynamicTexture of the same size: `fill` (the "copy" fill), `stamp` / `tile` with `erase` (= `destination-out` at
 * `globalAlpha`) or not (= `source-over`), and `layer` (another layer drawn in at an alpha, the fog). The views keep
 * one drawing description per operation for both paths (`DarknessView.paint`, `FogView.paintInto` / `paintGl`).
 *
 * Coordinates are the layer's pixels, like the canvas's. No allocation per frame in this file (Phaser's command
 * queue is the engine's).
 */
export interface GlLayer {
  readonly w: number;
  readonly h: number;
  /** Everything transparent. */
  clear(): void;
  /** `rgb` (0xRRGGBB) at `alpha` over the rect (default: the whole layer), source-over. */
  fill(rgb: number, alpha: number, x?: number, y?: number, w?: number, h?: number): void;
  /**
   * The canvas `src` with its pixel (ox, oy) at (x, y), turned by `rot` and scaled (sx, sy) about that point (the 2D
   * `setTransform(cos·s, sin·s, −sin·s, cos·s, x, y)` + `drawImage(src, −ox, −oy)`), at `alpha`; `erase`: cut it out.
   */
  stamp(src: HTMLCanvasElement, x: number, y: number, sx: number, sy: number, rot: number, ox: number, oy: number, alpha: number, erase: boolean): void;
  /** A white rect (erase: cut out at `alpha`). */
  rect(x: number, y: number, w: number, h: number, alpha: number, erase: boolean): void;
  /** The canvas `src` repeated over the whole layer, scaled by `scale`, its origin at (ox, oy) (the 2D pattern fill). */
  tile(src: HTMLCanvasElement, scale: number, ox: number, oy: number, alpha: number, erase: boolean): void;
  /** Another layer (already drawn this frame) drawn in at `alpha`. */
  layer(src: GlLayer, alpha: number): void;
  /** Runs this frame's commands (call once all are queued; `layer` runs its source first). */
  flush(): void;
}

/** Phaser's ERASE blend mode (`Phaser.BlendModes.ERASE`; the module imports Phaser's types only). */
const BLEND_ERASE = 17;
const BLEND_NORMAL = 0;

/**
 * The shared state of a scene's layers. Phaser 4's `DynamicTexture.draw(gameObject)` keeps the OBJECT and reads its
 * position / texture at `render()` (one reused object would draw its last state N times), so every command here is a
 * `stamp` / `repeat`, which store their values when queued; their config objects are reused (no allocation).
 */
class GlKit {
  readonly stampCfg = { alpha: 1, rotation: 0, scaleX: 1, scaleY: 1, originX: 0, originY: 0, blendMode: BLEND_NORMAL };
  readonly tileCfg = { alpha: 1, blendMode: BLEND_NORMAL, tilePositionX: 0, tilePositionY: 0, tileScaleX: 1, tileScaleY: 1 };
  readonly whitePx: number;

  constructor(readonly scene: Phaser.Scene) {
    this.whitePx = scene.textures.getFrame("__WHITE")?.width || 4;
  }

  key(src: HTMLCanvasElement): string {
    return addMirrorTexture(this.scene, src);
  }
}

class DynamicLayer implements GlLayer {
  constructor(
    private readonly kit: GlKit,
    readonly key: string,
    readonly dt: Phaser.Textures.DynamicTexture,
    readonly w: number,
    readonly h: number,
  ) {}

  clear(): void {
    this.dt.clear();
  }

  fill(rgb: number, alpha: number, x?: number, y?: number, w?: number, h?: number): void {
    this.dt.fill(rgb, alpha, x, y, w, h);
  }

  stamp(src: HTMLCanvasElement, x: number, y: number, sx: number, sy: number, rot: number, ox: number, oy: number, alpha: number, erase: boolean): void {
    const c = this.kit.stampCfg;
    c.alpha = alpha;
    c.rotation = rot;
    c.scaleX = sx;
    c.scaleY = sy;
    c.originX = src.width > 0 ? ox / src.width : 0;
    c.originY = src.height > 0 ? oy / src.height : 0;
    c.blendMode = erase ? BLEND_ERASE : BLEND_NORMAL;
    this.dt.stamp(this.kit.key(src), undefined, x, y, c);
  }

  rect(x: number, y: number, w: number, h: number, alpha: number, erase: boolean): void {
    if (w <= 0 || h <= 0) return;
    const c = this.kit.stampCfg;
    c.alpha = alpha;
    c.rotation = 0;
    c.scaleX = w / this.kit.whitePx;
    c.scaleY = h / this.kit.whitePx;
    c.originX = 0;
    c.originY = 0;
    c.blendMode = erase ? BLEND_ERASE : BLEND_NORMAL;
    this.dt.stamp("__WHITE", undefined, x, y, c);
  }

  tile(src: HTMLCanvasElement, scale: number, ox: number, oy: number, alpha: number, erase: boolean): void {
    const c = this.kit.tileCfg;
    c.alpha = alpha;
    c.blendMode = erase ? BLEND_ERASE : BLEND_NORMAL;
    c.tileScaleX = c.tileScaleY = scale;
    c.tilePositionX = -ox / scale;
    c.tilePositionY = -oy / scale;
    this.dt.repeat(this.kit.key(src), undefined, 0, 0, this.w, this.h, c);
  }

  layer(src: GlLayer, alpha: number): void {
    src.flush();
    const c = this.kit.stampCfg;
    c.alpha = alpha;
    c.rotation = 0;
    c.scaleX = c.scaleY = 1;
    c.originX = c.originY = 0;
    c.blendMode = BLEND_NORMAL;
    this.dt.stamp((src as DynamicLayer).key, undefined, 0, 0, c);
  }

  flush(): void {
    this.dt.render();
  }
}

/** The layers of one view (made and re-sized on demand, keyed `key`, `key_2`, …); null without WebGL. */
export class GlLayers {
  private kit: GlKit | null = null;
  private readonly layers = new Map<string, DynamicLayer>();

  constructor(private readonly scene: Phaser.Scene) {}

  /** The scene draws with WebGL (the GPU path's condition; a canvas renderer keeps the 2D path). */
  static available(scene: Phaser.Scene): boolean {
    const r = (scene.sys?.game as { renderer?: { gl?: unknown } } | undefined)?.renderer;
    return r?.gl != null && typeof scene.textures?.addDynamicTexture === "function";
  }

  /** The layer `key` at w × h (made, or re-made when the size changed). */
  get(key: string, w: number, h: number): GlLayer | null {
    const old = this.layers.get(key);
    if (old && old.w === w && old.h === h) return old;
    this.kit ??= new GlKit(this.scene);
    if (old) removeFrameTexture(this.scene, key);
    const dt = addFrameTexture(this.scene, key, w, h);
    if (!dt) return null;
    const l = new DynamicLayer(this.kit, key, dt, w, h);
    this.layers.set(key, l);
    return l;
  }

  destroy(): void {
    for (const key of this.layers.keys()) removeFrameTexture(this.scene, key);
    this.layers.clear();
    this.kit = null;
  }
}

/** "r,g,b" → 0xRRGGBB (made once per look, not per frame). */
export function rgbNumber(rgb: string): number {
  const [r, g, b] = rgb.split(",").map(Number) as [number, number, number];
  return ((r & 255) << 16) | ((g & 255) << 8) | (b & 255);
}
