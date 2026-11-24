import { RebuildPhase, textureRegistry, type RestorableCanvas } from "../gfx/textureRegistry";
import { BEAM_TINT, FIRE_TINT, FLASH_TINT, FLOOD_TINT } from "../city/palette";

/**
 * Story 6.3 (AC 5, 7; DD3): the pre-drawn light stamps the darkness layer erases with
 * (`destination-out`) and tints with — drawn ONCE (gradients only here, never per frame) and
 * registered with the texture registry (phase `cache`, brief 20) so a lost canvas is drawn again.
 * Ported from `docs/art/epic-6/src/main1.js › darkness / warmLight / beamLight`:
 * - disc: the round light's falloff (1 → 0.72 at 55 % → 0.25 at 85 % → 0 at the edge);
 * - cone 60° / 80°, soft and hard: the beam's falloff along its length (1 → 0.8 at 70 % → 0); the
 *   soft set blurs the side edges symmetrically round the true edge (half alpha exactly on the
 *   `inFlashlightCone` edge), the hard set (BL3 "pitch") cuts them crisp;
 * - warm tints: fire, floodlight, flash discs and the beam cones in their colours (alpha 1 here;
 *   the view draws them at ≤ 0.1). No hot core, no lens flare (designer pick).
 * Disc stamps are `STAMP_PX` across (centre in the middle); cone stamps are `STAMP_PX` long with the
 * apex at (`CONE_PAD`, height / 2), pointing along +x.
 */
export const STAMP_PX = 128;
export const CONE_PAD = 2;
/** The soft set's side blur: ± this share of the half angle (layered wedges). */
export const SOFT_EDGE_K = 0.18;
const SOFT_LAYERS = 6;

export interface ConeStamp {
  readonly canvas: HTMLCanvasElement;
  readonly coneDeg: number;
  /** Apex in the canvas (px). */
  readonly ax: number;
  readonly ay: number;
}

export interface LightStampSet {
  readonly disc: HTMLCanvasElement;
  /** Cones by full angle (60, 80): soft and hard. */
  readonly soft: readonly ConeStamp[];
  readonly hard: readonly ConeStamp[];
  readonly fireTint: HTMLCanvasElement;
  readonly floodTint: HTMLCanvasElement;
  readonly flashTint: HTMLCanvasElement;
  readonly beamTint: readonly ConeStamp[];
}

export const STAMP_CONES = [60, 80] as const;

function coneHeight(coneDeg: number, soft: boolean): number {
  const half = ((coneDeg / 2) * (soft ? 1 + SOFT_EDGE_K : 1) * Math.PI) / 180;
  return 2 * Math.ceil(STAMP_PX * Math.sin(Math.min(half, Math.PI / 2))) + 2 * CONE_PAD;
}

function paintDisc(g: CanvasRenderingContext2D, rgb: string, stops: readonly (readonly [number, number])[]): void {
  const r = STAMP_PX / 2;
  const gr = g.createRadialGradient(r, r, 0, r, r, r);
  for (const [at, a] of stops) gr.addColorStop(at, `rgba(${rgb},${a})`);
  g.fillStyle = gr;
  g.fillRect(0, 0, STAMP_PX, STAMP_PX);
}

const CUT_DISC: readonly (readonly [number, number])[] = [
  [0, 1],
  [0.55, 0.72],
  [0.85, 0.25],
  [1, 0],
];
const TINT_DISC: readonly (readonly [number, number])[] = [
  [0, 1],
  [0.5, 0.45],
  [1, 0],
];
const CUT_CONE: readonly (readonly [number, number])[] = [
  [0, 1],
  [0.7, 0.8],
  [1, 0],
];
const TINT_CONE: readonly (readonly [number, number])[] = [
  [0, 1],
  [0.6, 0.4],
  [1, 0],
];

function paintCone(g: CanvasRenderingContext2D, h: number, coneDeg: number, soft: boolean, rgb: string, stops: readonly (readonly [number, number])[]): void {
  const ax = CONE_PAD;
  const ay = h / 2;
  const len = STAMP_PX - CONE_PAD;
  const gr = g.createRadialGradient(ax, ay, 0, ax, ay, len);
  for (const [at, a] of stops) gr.addColorStop(at, `rgba(${rgb},${a})`);
  g.fillStyle = gr;
  const half = (coneDeg / 2) * (Math.PI / 180);
  const wedge = (hh: number): void => {
    g.beginPath();
    g.moveTo(ax, ay);
    g.arc(ax, ay, len, -hh, hh);
    g.closePath();
    g.fill();
  };
  if (!soft) {
    g.globalAlpha = 1;
    wedge(half);
    return;
  }
  // Layered wedges from (1 − k) to (1 + k) of the half angle: inside (1 − k) all layers add up to 1,
  // at the true edge half of them (alpha ≈ 0.5 for destination-out), past (1 + k) none.
  for (let i = 0; i < SOFT_LAYERS; i++) {
    const t = (i + 0.5) / SOFT_LAYERS;
    g.globalAlpha = 1 / (SOFT_LAYERS - i); // accumulates to 1 over the layers (source-over)
    wedge(half * (1 + SOFT_EDGE_K - 2 * SOFT_EDGE_K * t));
  }
  g.globalAlpha = 1;
}

/** Makes (and registers for repaint) one canvas drawn by `paint`. */
function stamp(key: string, w: number, h: number, makeCanvas: () => HTMLCanvasElement, paint: (g: CanvasRenderingContext2D) => void): HTMLCanvasElement {
  const c = makeCanvas();
  const draw = (): void => {
    c.width = w;
    c.height = h;
    const g = c.getContext("2d");
    if (g) paint(g);
  };
  draw();
  textureRegistry.register(key, RebuildPhase.cache, draw, [c as unknown as RestorableCanvas]);
  return c;
}

/** Registry keys of every stamp (tests, `unregisterLightStamps`). */
export const LIGHT_STAMP_KEYS: readonly string[] = [
  "fx_darkstamp_disc",
  ...STAMP_CONES.map((d) => `fx_darkstamp_cone${d}_soft`),
  ...STAMP_CONES.map((d) => `fx_darkstamp_cone${d}_hard`),
  "fx_darkstamp_tint_fire",
  "fx_darkstamp_tint_flood",
  "fx_darkstamp_tint_flash",
  ...STAMP_CONES.map((d) => `fx_darkstamp_tint_beam${d}`),
];

let shared: LightStampSet | null = null;

/** The stamp set (made once per page; the registry repaints it after a lost canvas). */
export function lightStamps(makeCanvas: () => HTMLCanvasElement = () => document.createElement("canvas")): LightStampSet {
  if (shared) return shared;
  const cone = (deg: number, soft: boolean, rgb: string, stops: readonly (readonly [number, number])[], key: string): ConeStamp => {
    const h = coneHeight(deg, soft);
    return { canvas: stamp(key, STAMP_PX, h, makeCanvas, (g) => paintCone(g, h, deg, soft, rgb, stops)), coneDeg: deg, ax: CONE_PAD, ay: h / 2 };
  };
  shared = {
    disc: stamp("fx_darkstamp_disc", STAMP_PX, STAMP_PX, makeCanvas, (g) => paintDisc(g, "0,0,0", CUT_DISC)),
    soft: STAMP_CONES.map((d) => cone(d, true, "0,0,0", CUT_CONE, `fx_darkstamp_cone${d}_soft`)),
    hard: STAMP_CONES.map((d) => cone(d, false, "0,0,0", CUT_CONE, `fx_darkstamp_cone${d}_hard`)),
    fireTint: stamp("fx_darkstamp_tint_fire", STAMP_PX, STAMP_PX, makeCanvas, (g) => paintDisc(g, FIRE_TINT, TINT_DISC)),
    floodTint: stamp("fx_darkstamp_tint_flood", STAMP_PX, STAMP_PX, makeCanvas, (g) => paintDisc(g, FLOOD_TINT, TINT_DISC)),
    flashTint: stamp("fx_darkstamp_tint_flash", STAMP_PX, STAMP_PX, makeCanvas, (g) => paintDisc(g, FLASH_TINT, TINT_DISC)),
    beamTint: STAMP_CONES.map((d) => cone(d, true, BEAM_TINT, TINT_CONE, `fx_darkstamp_tint_beam${d}`)),
  };
  return shared;
}

/** Tests: forget the set and its registry entries. */
export function resetLightStamps(): void {
  for (const k of LIGHT_STAMP_KEYS) textureRegistry.unregister(k);
  shared = null;
}

/** The cone stamp for a full angle: the nearest drawn one (60 or 80). */
export function coneStampFor(set: readonly ConeStamp[], coneDeg: number): ConeStamp {
  let best = set[0] as ConeStamp;
  for (const s of set) if (Math.abs(s.coneDeg - coneDeg) < Math.abs(best.coneDeg - coneDeg)) best = s;
  return best;
}
