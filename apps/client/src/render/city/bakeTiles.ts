import { CULL_MARGIN_PX, baseKey, drawBase, drawOverlay, type Bounds, type CityScene } from "./drawCity";
import { MAP_PX_PER_M } from "./dressing";

/**
 * Story 4.9 re-review: the per-stage tile bake of `CityView.showStage`, without Phaser (so a test can
 * run it on fake canvases). Each tile's base (`drawBase`) is cached in `tile.base` and redrawn only
 * when `baseKey` changes; the overlay and the light are redrawn on every call.
 */

type Ctx = CanvasRenderingContext2D;
/** The canvas part of a bake tile (CityView's Layer): `x`, `y` in metres. */
export interface BakeTile {
  readonly canvas: { readonly width: number; readonly height: number; getContext(id: "2d"): unknown };
  readonly base: { readonly width: number; readonly height: number; getContext(id: "2d"): unknown };
  readonly x: number;
  readonly y: number;
}
type Draw = (g: Ctx, s: number, cs: CityScene, bd: Bounds) => void;
/** The two layer painters (tests pass spies; the view uses the real ones). */
export interface BakePainters {
  readonly base: Draw;
  readonly overlay: Draw;
}
const REAL: BakePainters = { base: drawBase, overlay: drawOverlay };

/**
 * Bakes every tile at `bakePxPerM`, the lightmap multiplied and the glow added on top. Returns the
 * base key now shown (pass it back next time as `shownBaseKey`) and whether the base was redrawn.
 */
export function bakeTiles(
  tiles: readonly BakeTile[],
  cs: CityScene,
  bakePxPerM: number,
  shownBaseKey: string | null,
  light: CanvasImageSource,
  glow: CanvasImageSource,
  paint: BakePainters = REAL,
  /** Story 10.1 (B5): the Light glow setting (1 / 0.5 / 0): the glow layer's strength; 0 skips it. */
  glowK = 1,
): { baseKey: string; baseRedrawn: boolean } {
  const s = bakePxPerM / MAP_PX_PER_M;
  const mapW = cs.map.widthM * MAP_PX_PER_M;
  const mapH = cs.map.heightM * MAP_PX_PER_M;
  const bk = baseKey(cs);
  const redrawBase = bk !== shownBaseKey;
  for (const t of tiles) {
    // the tile's area in map px, grown so shadows and blur from outside still land on it
    const x0 = t.x * MAP_PX_PER_M;
    const y0 = t.y * MAP_PX_PER_M;
    const bd = { x0: x0 - CULL_MARGIN_PX, y0: y0 - CULL_MARGIN_PX, x1: x0 + t.canvas.width / s + CULL_MARGIN_PX, y1: y0 + t.canvas.height / s + CULL_MARGIN_PX };
    if (redrawBase) {
      const b = t.base.getContext("2d") as Ctx;
      b.setTransform(1, 0, 0, 1, 0, 0);
      b.clearRect(0, 0, t.base.width, t.base.height);
      b.setTransform(s, 0, 0, s, -t.x * bakePxPerM, -t.y * bakePxPerM);
      paint.base(b, s, cs, bd);
    }
    const g = t.canvas.getContext("2d") as Ctx;
    g.setTransform(1, 0, 0, 1, 0, 0);
    g.clearRect(0, 0, t.canvas.width, t.canvas.height);
    g.drawImage(t.base as unknown as CanvasImageSource, 0, 0);
    g.setTransform(s, 0, 0, s, -t.x * bakePxPerM, -t.y * bakePxPerM);
    paint.overlay(g, s, cs, bd);
    g.globalCompositeOperation = "multiply";
    g.drawImage(light, 0, 0, mapW, mapH);
    if (glowK > 0) {
      g.globalCompositeOperation = "lighter";
      g.globalAlpha = Math.min(1, glowK);
      g.drawImage(glow, 0, 0, mapW, mapH);
      g.globalAlpha = 1;
    }
    g.globalCompositeOperation = "source-over";
  }
  return { baseKey: bk, baseRedrawn: redrawBase };
}
