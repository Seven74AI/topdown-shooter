import type * as Phaser from "phaser";
import { addGeneratedTexture } from "./canvasTexture";

/**
 * Story 6.11 (looks: docs/art/epic-6/src/main5.js › `drawHeliTop`, `pad`, `searchlight`): the
 * evacuation helicopter top-down, drawn in game code. One canvas atlas `atlas_heli` (≤ 2048²) with
 * frames (category_name_variant):
 *
 * - `heli_body_0`: the olive body, tail boom and fin, skids, the dark cockpit glass (nose to −x, the
 *   tail to +x, as the look page draws it); the red tail beacon is a separate tiny frame so it blinks.
 * - `heli_rotor_0`: the blurred rotor disc and four blades (the view spins the image).
 * - `heli_beacon_0`: the tail beacon dot.
 * - `heli_pad_0`: the 6 m pad's dashed white ring (radius `evac.padRadiusM` at display time).
 * - `heli_beam_0`: the searchlight pool, a soft white radial fall-off with NO hot core (brief 24, BL4).
 *
 * Drawn once through `addGeneratedTexture` (Story 4.13: repainted after a lost graphics context).
 */
export const ATLAS_HELI = "atlas_heli";
export const HELI_BODY = "heli_body_0";
export const HELI_ROTOR = "heli_rotor_0";
export const HELI_BEACON = "heli_beacon_0";
export const HELI_PAD = "heli_pad_0";
export const HELI_BEAM = "heli_beam_0";

/** Texture pixels per metre. */
export const HELI_PX_PER_M = 40;
/** Body frame extent in metres (x −2.3 … 5.0, y −1.1 … 1.1): the hub at (0, 0). */
export const HELI_BODY_M = { x0: -2.3, x1: 5.0, y0: -1.1, y1: 1.1 } as const;
/** Rotor disc radius (m). */
export const HELI_ROTOR_M = 3.75;
/** The beacon on the tail fin (m from the hub). */
export const HELI_BEACON_AT_M = { x: 4.75, y: 0 } as const;
/** Pad ring frame: the ring's centre line at `PAD_RING_PX` from the centre of a `PAD_FRAME_PX` square. */
export const PAD_FRAME_PX = 256;
export const PAD_RING_PX = 122;
/** Searchlight pool frame (a radial fall-off over the square). */
export const BEAM_FRAME_PX = 128;

const BODY_W = Math.ceil((HELI_BODY_M.x1 - HELI_BODY_M.x0) * HELI_PX_PER_M);
const BODY_H = Math.ceil((HELI_BODY_M.y1 - HELI_BODY_M.y0) * HELI_PX_PER_M);
const ROTOR_PX = Math.ceil(HELI_ROTOR_M * 2 * HELI_PX_PER_M) + 4;
const BEACON_PX = 12;

/** Frame rects in the atlas (x, y, w, h): body top-left, rotor under it, pad and beam to the right. */
export const HELI_FRAMES = {
  [HELI_BODY]: [0, 0, BODY_W, BODY_H],
  [HELI_ROTOR]: [0, BODY_H + 2, ROTOR_PX, ROTOR_PX],
  [HELI_PAD]: [ROTOR_PX + 2, BODY_H + 2, PAD_FRAME_PX, PAD_FRAME_PX],
  [HELI_BEAM]: [ROTOR_PX + 2, BODY_H + 2 + PAD_FRAME_PX + 2, BEAM_FRAME_PX, BEAM_FRAME_PX],
  [HELI_BEACON]: [ROTOR_PX + 2 + BEAM_FRAME_PX + 2, BODY_H + 2 + PAD_FRAME_PX + 2, BEACON_PX, BEACON_PX],
} as const satisfies Record<string, readonly [number, number, number, number]>;

export const HELI_ATLAS_W = Math.max(BODY_W, ROTOR_PX + 2 + PAD_FRAME_PX);
export const HELI_ATLAS_H = BODY_H + 2 + Math.max(ROTOR_PX, PAD_FRAME_PX + 2 + BEAM_FRAME_PX);

type G = CanvasRenderingContext2D;

function rr(c: G, x: number, y: number, w: number, h: number, r: number): void {
  const k = Math.min(r, w / 2, h / 2);
  c.beginPath();
  c.moveTo(x + k, y);
  c.arcTo(x + w, y, x + w, y + h, k);
  c.arcTo(x + w, y + h, x, y + h, k);
  c.arcTo(x, y + h, x, y, k);
  c.arcTo(x, y, x + w, y, k);
  c.closePath();
}

function ell(c: G, x: number, y: number, rx: number, ry: number): void {
  c.beginPath();
  c.ellipse(x, y, rx, ry, 0, 0, Math.PI * 2);
}

/** A part with a top-lit linear gradient and a dark outline (the Dead City look, no outline aid). */
function part(c: G, path: () => void, base: string, hi: string, lo: string, y0: number, y1: number, line: number): void {
  const g = c.createLinearGradient(0, y0, 0, y1);
  g.addColorStop(0, hi);
  g.addColorStop(0.5, base);
  g.addColorStop(1, lo);
  path();
  c.fillStyle = g;
  c.fill();
  c.lineWidth = line;
  c.strokeStyle = "rgba(8, 10, 8, 0.85)";
  c.stroke();
}

/** The body in metres around the hub (the frame transform maps metres → px). */
function drawBody(c: G): void {
  const L = 1 / HELI_PX_PER_M;
  // soft shadow under the fuselage
  c.fillStyle = "rgba(0, 0, 0, 0.28)";
  ell(c, 0.45, 0.3, 2.2, 0.8);
  c.fill();
  // tail boom and fin
  part(c, () => rr(c, 1.6, -0.17, 3.3, 0.34, 0.12), "#3e4636", "#5a6450", "#2a3024", -0.17, 0.17, 1.2 * L);
  part(c, () => rr(c, 4.5, -0.8, 0.26, 1.6, 0.08), "#353c2f", "#4c5544", "#23281e", -0.8, 0.8, 1.1 * L);
  // skids
  for (const sy of [-1, 1]) part(c, () => rr(c, -1.6, sy * 1.0 - 0.05, 2.6, 0.1, 0.05), "#222", "#3a3a3a", "#141414", sy - 0.05, sy + 0.05, 1 * L);
  // fuselage
  const g = c.createRadialGradient(-0.3, -0.35, 0.1, 0, 0, 2.1);
  g.addColorStop(0, "#6b7760");
  g.addColorStop(0.55, "#4a5440");
  g.addColorStop(1, "#2c3326");
  ell(c, 0, 0, 2.1, 0.92);
  c.fillStyle = g;
  c.fill();
  c.lineWidth = 1.5 * L;
  c.strokeStyle = "rgba(8, 10, 8, 0.9)";
  c.stroke();
  // cockpit glass
  const gl = c.createRadialGradient(-1.4, -0.2, 0.05, -1.25, 0, 0.62);
  gl.addColorStop(0, "#3c5468");
  gl.addColorStop(1, "#0e141a");
  ell(c, -1.25, 0, 0.62, 0.56);
  c.fillStyle = gl;
  c.fill();
  c.lineWidth = 1.2 * L;
  c.stroke();
  // roof hatch and its white mark (reads as "rescue" at a glance)
  c.fillStyle = "rgba(20, 24, 18, 0.5)";
  rr(c, 0.2, -0.5, 0.9, 1.0, 0.1);
  c.fill();
  c.fillStyle = "rgba(230, 230, 220, 0.6)";
  rr(c, 0.35, -0.15, 0.6, 0.3, 0.02);
  c.fill();
}

function drawRotor(c: G): void {
  c.fillStyle = "rgba(200, 205, 210, 0.07)";
  ell(c, 0, 0, HELI_ROTOR_M - 0.05, HELI_ROTOR_M - 0.05);
  c.fill();
  c.lineWidth = 0.03;
  c.strokeStyle = "rgba(200, 205, 210, 0.12)";
  c.stroke();
  for (let i = 0; i < 4; i++) {
    c.save();
    c.rotate((i * Math.PI) / 2);
    c.fillStyle = "rgba(25, 27, 28, 0.8)";
    rr(c, 0, -0.1, HELI_ROTOR_M - 0.1, 0.2, 0.05);
    c.fill();
    c.restore();
  }
  c.fillStyle = "#1a1c1e";
  ell(c, 0, 0, 0.22, 0.22);
  c.fill();
}

/** Paints the whole atlas (also the 4.13 repaint). */
export function paintHeliAtlas(c: G): void {
  const k = HELI_PX_PER_M;
  const [bx, by] = HELI_FRAMES[HELI_BODY];
  c.save();
  c.translate(bx - HELI_BODY_M.x0 * k, by - HELI_BODY_M.y0 * k);
  c.scale(k, k);
  drawBody(c);
  c.restore();
  const [rx, ry, rw] = HELI_FRAMES[HELI_ROTOR];
  c.save();
  c.translate(rx + rw / 2, ry + rw / 2);
  c.scale(k, k);
  drawRotor(c);
  c.restore();
  // the pad's dashed ring (white = people and pick-ups' colour family; the look page's #e8e6e0)
  const [px, py, pw] = HELI_FRAMES[HELI_PAD];
  c.save();
  c.translate(px + pw / 2, py + pw / 2);
  c.strokeStyle = "#e8e6e0";
  c.lineWidth = 4.8;
  // dashes as arc pieces (20 px on, 14 px off along the ring: the look page's 0.5 m / 0.35 m)
  const step = 34 / PAD_RING_PX;
  const on = 20 / PAD_RING_PX;
  for (let a = 0; a < Math.PI * 2 - 1e-6; a += step) {
    c.beginPath();
    c.arc(0, 0, PAD_RING_PX, a, Math.min(Math.PI * 2, a + on));
    c.stroke();
  }
  c.restore();
  // the searchlight pool: a flat soft fall-off, no hot core (brief 24)
  const [sx, sy, sw] = HELI_FRAMES[HELI_BEAM];
  const g = c.createRadialGradient(sx + sw / 2, sy + sw / 2, 0, sx + sw / 2, sy + sw / 2, sw / 2);
  g.addColorStop(0, "rgba(235, 242, 255, 0.55)");
  g.addColorStop(0.55, "rgba(235, 242, 255, 0.45)");
  g.addColorStop(1, "rgba(235, 242, 255, 0)");
  c.fillStyle = g;
  c.fillRect(sx, sy, sw, sw);
  // the red tail beacon dot
  const [ex, ey, ew] = HELI_FRAMES[HELI_BEACON];
  c.fillStyle = "#ff3b3b";
  ell(c, ex + ew / 2, ey + ew / 2, ew / 2 - 1, ew / 2 - 1);
  c.fill();
}

/** Bakes `atlas_heli` once per game (no-op when it exists). */
export function ensureHeliAtlas(scene: Phaser.Scene, makeCanvas: () => HTMLCanvasElement = () => document.createElement("canvas")): void {
  if (scene.textures.exists(ATLAS_HELI)) return;
  const canvas = makeCanvas();
  canvas.width = HELI_ATLAS_W;
  canvas.height = HELI_ATLAS_H;
  addGeneratedTexture(scene, ATLAS_HELI, canvas, paintHeliAtlas, (tex) => {
    for (const [name, [x, y, w, h]] of Object.entries(HELI_FRAMES)) tex.add(name, 0, x, y, w, h);
  });
}
