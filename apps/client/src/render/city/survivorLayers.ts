/**
 * Story 7.8 (designer 2026-11-24): animated layers of survivor parts. The propeller cap's propeller spins; it is the
 * first animated part and the pattern for later ones:
 *
 * - the part declares the layer in `cosmetics.json` (`animated: { layer, spinRevPerS }`);
 * - the body bake leaves the layer out (`drawSurvivor(…, layers = false)`); still pictures (editor, Results, pick
 *   pages) draw it in at a fixed angle (`layers = true`, the default);
 * - in the game the layer is its own small texture (`survivorlayer_<id>_a`, through `addGeneratedTexture`) shown as
 *   one pooled sprite per survivor (`SurvivorLayerPool`), placed on the head and turned every frame.
 *
 * Pure (no Phaser): drawing in `r` units and the per-frame pose, written into a caller's object (no allocation).
 */
import { layerSpinRevPerS, type AnimatedLayerId } from "@topdown/shared";
import { CHAR, circle, ell } from "./spriteArt";
import { PART_COLOURS } from "./survivorParts";

type G = CanvasRenderingContext2D;

export type SurvivorLayer = {
  /** Draws the layer at (0, 0), angle 0, in `r` units (r = collision radius in px). */
  readonly draw: (c: G, r: number) => void;
  /** Where the layer's centre sits on the body, in radii, body facing +x. */
  readonly anchorR: readonly [number, number];
  /** Half the texture's side, in radii. */
  readonly extentR: number;
  /** Angle drawn in still pictures (radians). */
  readonly stillAngle: number;
};

function drawPropeller(c: G, r: number): void {
  c.lineJoin = "round";
  c.strokeStyle = CHAR.outline;
  c.lineWidth = Math.max(1, r * 0.08);
  ell(c, 0, 0, r * 0.44, r * 0.07);
  c.fillStyle = PART_COLOURS.propeller.blades;
  c.fill();
  c.stroke();
  c.fillStyle = PART_COLOURS.propeller.hub;
  circle(c, 0, 0, r * 0.06);
  c.fill();
}

export const SURVIVOR_LAYERS: Readonly<Record<AnimatedLayerId, SurvivorLayer>> = {
  propeller: { draw: drawPropeller, anchorR: [-0.02, 0], extentR: 0.5, stillAngle: 0.5 },
};

/** Texture key of a layer (`category_name_variant`, brief 12). */
export const layerTextureKey = (id: AnimatedLayerId): string => `survivorlayer_${id}_a`;

/** Spin speeds read once from `cosmetics.json` (turns per second). */
const SPIN: Readonly<Record<AnimatedLayerId, number>> = { propeller: layerSpinRevPerS("propeller") };

/** The layer's own turn at `timeMs` (radians, 0..2π). */
export function layerSpinAngle(id: AnimatedLayerId, timeMs: number): number {
  const turns = (timeMs / 1000) * SPIN[id];
  return (turns - Math.floor(turns)) * Math.PI * 2;
}

/** A layer sprite's pose; reused every frame (one per survivor). */
export type LayerPose = { x: number; y: number; rotation: number };

/**
 * Where the layer of a survivor at (x, y) facing (fx, fy), radius `radiusM`, is drawn at `timeMs`: the anchor turned
 * with the body, plus the layer's own spin. Writes into `out` and returns it.
 */
export function layerPose(out: LayerPose, id: AnimatedLayerId, x: number, y: number, fx: number, fy: number, radiusM: number, timeMs: number): LayerPose {
  const face = Math.atan2(fy, fx);
  const cos = Math.cos(face);
  const sin = Math.sin(face);
  const [ax, ay] = SURVIVOR_LAYERS[id].anchorR;
  out.x = x + (ax * cos - ay * sin) * radiusM;
  out.y = y + (ax * sin + ay * cos) * radiusM;
  out.rotation = face + layerSpinAngle(id, timeMs);
  return out;
}

/** Draws a layer into a still picture of the survivor (at its anchor, still angle). */
export function drawLayerStill(c: G, r: number, id: AnimatedLayerId): void {
  const L = SURVIVOR_LAYERS[id];
  c.save();
  c.translate(r * L.anchorR[0], r * L.anchorR[1]);
  c.rotate(L.stillAngle);
  L.draw(c, r);
  c.restore();
}
