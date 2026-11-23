import type * as Phaser from "phaser";
import { MAX_DPR } from "../../display";
import { addGeneratedTexture } from "./canvasTexture";

/**
 * Story 5.26: the build bar's own building icons (designer picks, 2026-11-23, `docs/epic-5-decisions.md`
 * › Build-bar icons): style **I1** (low three-quarter tilted objects): wood barricade I1, spike trap I1,
 * auto-turret **T1** sentry gun, mine **M1** pressure mine; **T2** armoured dome is baked too and kept
 * for a later turret tier or skin (no building type maps to it yet). Ported from the code drawings in
 * `docs/art/5-16/icons/index.html` (`I1`, `R2.T1`, `R2.T2`, `R2.M1`, `tile()`): same shapes, colours
 * and proportions, drawn in the same 44 × 30 CSS px icon box with the same clip margins. Story 5.27
 * adds floodlight FL1, med station MS10 and bear trap B-T1 (`docs/art/5-27/icons.html`).
 *
 * One small HUD atlas, `hud_build`, one frame per icon (`icon_build_<name>_<variant>`, ≤ 2048²), drawn
 * once per game through `addGeneratedTexture` (Story 4.13: repainted after a lost graphics context).
 * The world art is untouched; a building type without an icon falls back to it (`buildIconFrame` null).
 */

/** The atlas texture key. */
export const BUILD_ICON_TEXTURE = "hud_build";

/** The icon box (CSS px) the drawings are designed for, inside the 56 px tile (the mockup's `BOX_W/H`). */
export const BUILD_ICON_BOX_W = 44;
export const BUILD_ICON_BOX_H = 30;
/** The mockup's clip around the box (CSS px): art may reach 2 px left/right, 4 px above, 2 px below. */
export const BUILD_ICON_PAD_X = 2;
export const BUILD_ICON_PAD_TOP = 4;
export const BUILD_ICON_PAD_BOTTOM = 2;
/** One frame in CSS px (box + clip margins): 48 × 36. */
export const BUILD_ICON_FRAME_W = BUILD_ICON_BOX_W + 2 * BUILD_ICON_PAD_X;
export const BUILD_ICON_FRAME_H = BUILD_ICON_BOX_H + BUILD_ICON_PAD_TOP + BUILD_ICON_PAD_BOTTOM;
/** Where the box centre sits in the frame, as an origin (0..1): the HUD puts this point on the icon anchor. */
export const BUILD_ICON_ORIGIN_X = (BUILD_ICON_PAD_X + BUILD_ICON_BOX_W / 2) / BUILD_ICON_FRAME_W;
export const BUILD_ICON_ORIGIN_Y = (BUILD_ICON_PAD_TOP + BUILD_ICON_BOX_H / 2) / BUILD_ICON_FRAME_H;
/**
 * Texture px per CSS px: the game renders at most at `MAX_DPR` (2), so the bake is 1:1 with screen pixels
 * on every dpr ≥ 2 phone (dpr 3 renders at 2 and the browser scales the whole canvas, like all the art).
 */
export const BUILD_ICON_BAKE_SCALE = MAX_DPR;
/** Empty texture px between frames (no filtering bleed when scaled down). */
const FRAME_GAP_PX = 4;

type Ctx = CanvasRenderingContext2D;
type Draw = (g: Ctx, w: number, h: number) => void;

// Palette (the mockup's constants).
const WOOD = "#7a5028";
const WOOD_HI = "#9a6a3a";
const WOOD_DK = "#4f3218";
const OUT = "#1a1008";
const METAL = "#4a5560";
const METAL_HI = "#7d8a96";
const METAL_DK = "#22282e";
const NAIL = "#c9ced4";
const RED = "#ff3b2f";
const BLACK = "#11151a";
const TAU = Math.PI * 2;

function shadow(g: Ctx, cx: number, cy: number, rx: number, ry: number, a = 0.38): void {
  g.fillStyle = `rgba(0,0,0,${a})`;
  g.beginPath();
  g.ellipse(cx, cy, rx, ry, 0, 0, TAU);
  g.fill();
}

function dot(g: Ctx, x: number, y: number, r: number, style: string): void {
  g.fillStyle = style;
  g.beginPath();
  g.arc(x, y, r, 0, TAU);
  g.fill();
}

/** A rounded-rect path (`arcTo`: no `roundRect`, which older Safari lacks). */
function roundRectPath(g: Ctx, x: number, y: number, w: number, h: number, r: number): void {
  const q = Math.min(r, w / 2, h / 2);
  g.beginPath();
  g.moveTo(x + q, y);
  g.arcTo(x + w, y, x + w, y + h, q);
  g.arcTo(x + w, y + h, x, y + h, q);
  g.arcTo(x, y + h, x, y, q);
  g.arcTo(x, y, x + w, y, q);
  g.closePath();
}

/** I1 wood barricade: a palisade of 5 pointed stakes on two cross rails, seen slightly from above. */
const barricadeI1: Draw = (g, w, h) => {
  const base = h * 0.86;
  const top = h * 0.12;
  const n = 5;
  const sw = w * 0.13;
  const gap = (w * 0.84 - n * sw) / (n - 1);
  shadow(g, w / 2, base + h * 0.04, w * 0.46, h * 0.07, 0.35);
  for (let i = 0; i < n; i++) {
    const x = w * 0.08 + i * (sw + gap);
    const t = top + (i % 2) * h * 0.06;
    g.fillStyle = i % 2 ? WOOD : WOOD_HI;
    g.strokeStyle = OUT;
    g.lineWidth = w * 0.02;
    g.beginPath();
    g.moveTo(x, base);
    g.lineTo(x, t + sw * 0.6);
    g.lineTo(x + sw / 2, t);
    g.lineTo(x + sw, t + sw * 0.6);
    g.lineTo(x + sw, base);
    g.closePath();
    g.fill();
    g.stroke();
    g.fillStyle = WOOD_DK;
    g.fillRect(x + sw * 0.62, t + sw * 0.6, sw * 0.38, base - t - sw * 0.6);
  }
  for (const y of [0.4, 0.66]) {
    g.fillStyle = WOOD_DK;
    g.strokeStyle = OUT;
    g.fillRect(w * 0.04, h * y, w * 0.92, h * 0.09);
    g.strokeRect(w * 0.04, h * y, w * 0.92, h * 0.09);
  }
};

/** I1 spike trap: a board in perspective (trapezoid) with three rows of nails pointing up. */
const spikesI1: Draw = (g, w, h) => {
  shadow(g, w / 2, h * 0.86, w * 0.46, h * 0.08, 0.35);
  g.fillStyle = WOOD;
  g.strokeStyle = OUT;
  g.lineWidth = w * 0.02;
  g.beginPath();
  g.moveTo(w * 0.16, h * 0.5);
  g.lineTo(w * 0.84, h * 0.5);
  g.lineTo(w * 0.96, h * 0.82);
  g.lineTo(w * 0.04, h * 0.82);
  g.closePath();
  g.fill();
  g.stroke();
  g.fillStyle = WOOD_DK;
  g.fillRect(w * 0.04, h * 0.82, w * 0.92, h * 0.06);
  g.strokeStyle = WOOD_DK;
  g.lineWidth = w * 0.012;
  for (const t of [0.33, 0.66]) {
    g.beginPath();
    g.moveTo(w * (0.1 + 0.06 * (1 - t)), h * (0.5 + 0.32 * t));
    g.lineTo(w * (0.9 - 0.06 * (1 - t)), h * (0.5 + 0.32 * t));
    g.stroke();
  }
  for (let r = 0; r < 3; r++) {
    for (let c = 0; c < 5; c++) {
      const y = h * (0.58 + r * 0.1);
      const spread = 0.66 + r * 0.08;
      const x = w * (0.5 - spread / 2 + ((c + 0.5) * spread) / 5);
      g.strokeStyle = NAIL;
      g.lineWidth = w * 0.025;
      g.beginPath();
      g.moveTo(x, y);
      g.lineTo(x, y - h * 0.2);
      g.stroke();
      dot(g, x, y - h * 0.2, w * 0.012, "#fff");
    }
  }
};

/** T1 sentry gun: a boxy gun on a tripod with an ammo box, barrel to the right. */
const turretT1: Draw = (g, w, h) => {
  const cx = w * 0.46;
  shadow(g, cx, h * 0.9, w * 0.34, h * 0.07);
  g.strokeStyle = METAL_DK;
  g.lineWidth = w * 0.04;
  g.lineCap = "round";
  for (const [x, y] of [
    [-0.22, 0.92],
    [0.22, 0.92],
    [0.02, 0.97],
  ] as const) {
    g.beginPath();
    g.moveTo(cx, h * 0.52);
    g.lineTo(cx + w * x, h * y);
    g.stroke();
  }
  g.lineCap = "butt";
  g.fillStyle = METAL_DK;
  g.fillRect(cx - w * 0.03, h * 0.46, w * 0.06, h * 0.12);
  g.fillStyle = "#56603f";
  g.strokeStyle = OUT;
  g.lineWidth = w * 0.018;
  g.fillRect(cx - w * 0.3, h * 0.3, w * 0.13, h * 0.2);
  g.strokeRect(cx - w * 0.3, h * 0.3, w * 0.13, h * 0.2);
  g.fillStyle = METAL;
  roundRectPath(g, cx - w * 0.17, h * 0.2, w * 0.34, h * 0.3, w * 0.03);
  g.fill();
  g.stroke();
  g.fillStyle = METAL_HI;
  g.fillRect(cx - w * 0.15, h * 0.22, w * 0.3, h * 0.06);
  g.fillStyle = BLACK;
  g.fillRect(cx - w * 0.04, h * 0.12, w * 0.08, h * 0.09);
  g.fillStyle = METAL_DK;
  g.fillRect(cx + w * 0.17, h * 0.3, w * 0.3, h * 0.1);
  g.strokeRect(cx + w * 0.17, h * 0.3, w * 0.3, h * 0.1);
  g.fillStyle = BLACK;
  g.fillRect(cx + w * 0.44, h * 0.27, w * 0.08, h * 0.16);
};

/** T2 armoured dome: a domed head with twin barrels and a red sensor on a striped steel base (kept for later). */
const turretT2: Draw = (g, w, h) => {
  const cx = w / 2;
  shadow(g, cx, h * 0.9, w * 0.32, h * 0.07);
  g.fillStyle = METAL_DK;
  g.strokeStyle = OUT;
  g.lineWidth = w * 0.018;
  g.fillRect(cx - w * 0.24, h * 0.6, w * 0.48, h * 0.26);
  g.strokeRect(cx - w * 0.24, h * 0.6, w * 0.48, h * 0.26);
  g.save();
  g.beginPath();
  g.rect(cx - w * 0.24, h * 0.68, w * 0.48, h * 0.1);
  g.clip();
  g.fillStyle = "#f5c542";
  g.fillRect(cx - w * 0.24, h * 0.68, w * 0.48, h * 0.1);
  g.fillStyle = "#111";
  for (let i = 0; i < 6; i++) {
    const x = -0.3 + i * 0.1;
    g.beginPath();
    g.moveTo(cx + w * x, h * 0.78);
    g.lineTo(cx + w * (x + 0.05), h * 0.68);
    g.lineTo(cx + w * (x + 0.1), h * 0.68);
    g.lineTo(cx + w * (x + 0.05), h * 0.78);
    g.fill();
  }
  g.restore();
  g.fillStyle = METAL;
  g.beginPath();
  g.ellipse(cx, h * 0.6, w * 0.26, h * 0.42, 0, Math.PI, 0);
  g.closePath();
  g.fill();
  g.stroke();
  g.fillStyle = METAL_HI;
  g.beginPath();
  g.ellipse(cx - w * 0.08, h * 0.36, w * 0.08, h * 0.1, -0.5, 0, TAU);
  g.fill();
  g.fillStyle = METAL_DK;
  for (const y of [0.42, 0.54]) g.fillRect(cx + w * 0.16, h * y - h * 0.035, w * 0.32, h * 0.07);
  g.fillStyle = BLACK;
  for (const y of [0.42, 0.54]) g.fillRect(cx + w * 0.45, h * y - h * 0.045, w * 0.05, h * 0.09);
  dot(g, cx + w * 0.04, h * 0.44, w * 0.07, "rgba(255,59,47,0.4)");
  dot(g, cx + w * 0.04, h * 0.44, w * 0.035, RED);
};

/** M1 pressure mine: a thick steel-olive disc with bolts, a raised pressure plate and a glowing red light. */
const mineM1: Draw = (g, w, h) => {
  const cx = w / 2;
  const top = h * 0.48;
  const rx = w * 0.34;
  const ry = h * 0.15;
  const side = h * 0.2;
  shadow(g, cx, top + side + h * 0.08, rx * 1.05, ry);
  g.fillStyle = "#3a4529";
  g.strokeStyle = "#151a0e";
  g.lineWidth = w * 0.018;
  g.beginPath();
  g.moveTo(cx - rx, top);
  g.lineTo(cx - rx, top + side);
  g.ellipse(cx, top + side, rx, ry, 0, Math.PI, 0, true);
  g.lineTo(cx + rx, top);
  g.closePath();
  g.fill();
  g.stroke();
  g.fillStyle = "#2c3520";
  g.fillRect(cx - rx, top + side * 0.45, rx * 2, side * 0.18);
  g.fillStyle = "#5f6e45";
  g.beginPath();
  g.ellipse(cx, top, rx, ry, 0, 0, TAU);
  g.fill();
  g.stroke();
  for (let i = 0; i < 8; i++) {
    const a = (i * Math.PI) / 4;
    dot(g, cx + Math.cos(a) * rx * 0.86, top + Math.sin(a) * ry * 0.82, w * 0.012, "#9aa3ad");
  }
  g.fillStyle = "#7d8a5c";
  g.beginPath();
  g.ellipse(cx, top - h * 0.05, rx * 0.5, ry * 0.5, 0, 0, TAU);
  g.fill();
  g.stroke();
  g.fillStyle = "#4a5636";
  g.fillRect(cx - rx * 0.5, top - h * 0.05, rx, h * 0.05);
  dot(g, cx, top - h * 0.07, w * 0.09, "rgba(255,59,47,0.45)");
  dot(g, cx, top - h * 0.07, w * 0.04, RED);
  dot(g, cx - w * 0.012, top - h * 0.085, w * 0.012, "#ffd0cc");
};

// ---- Story 5.27: floodlight FL1, med station MS10, bear trap B-T1 (`docs/art/5-27/icons.html`) ----

// FL1 colours: safety yellow steel, rubber, warm halogen glass.
const FL_Y = "#c9a227";
const FL_Y_HI = "#e6c24a";
const FL_Y_DK = "#8a6e14";
const RUBBER = "#1b1c1e";
const LAMP = "#fff3d6";
const LAMP_GLOW = "255,238,205";

/** FL1 floodlight: a yellow tripod work light, halogen head with a grille, its lit glass toward you, cable off to the left. */
const floodlightFL1: Draw = (g, w, h) => {
  const cx = w * 0.5;
  const hub = h * 0.58; // where the legs meet the mast
  shadow(g, cx, h * 0.9, w * 0.32, h * 0.07);
  // cable: from the head's back down the mast and off to the left along the ground
  g.strokeStyle = "#18191b";
  g.lineWidth = w * 0.022;
  g.lineCap = "round";
  g.beginPath();
  g.moveTo(cx - w * 0.02, hub + h * 0.06);
  g.bezierCurveTo(cx - w * 0.06, h * 0.84, cx - w * 0.2, h * 0.78, cx - w * 0.3, h * 0.9);
  g.lineTo(w * 0.04, h * 0.92);
  g.stroke();
  // tripod legs (back leg first, then the two front legs), rubber feet
  for (const [x, y] of [
    [0.03, 0.8],
    [-0.24, 0.92],
    [0.22, 0.94],
  ] as const) {
    g.strokeStyle = OUT;
    g.lineWidth = w * 0.062;
    g.beginPath();
    g.moveTo(cx, hub);
    g.lineTo(cx + w * x, h * y);
    g.stroke();
    g.strokeStyle = x < 0 ? FL_Y_HI : FL_Y;
    g.lineWidth = w * 0.038;
    g.beginPath();
    g.moveTo(cx, hub);
    g.lineTo(cx + w * x, h * y);
    g.stroke();
    dot(g, cx + w * x, h * y, w * 0.03, RUBBER);
  }
  g.lineCap = "butt";
  // mast
  g.fillStyle = FL_Y_DK;
  g.strokeStyle = OUT;
  g.lineWidth = w * 0.018;
  g.fillRect(cx - w * 0.025, h * 0.36, w * 0.05, hub - h * 0.36 + h * 0.04);
  g.strokeRect(cx - w * 0.025, h * 0.36, w * 0.05, hub - h * 0.36 + h * 0.04);
  dot(g, cx, hub, w * 0.035, "#8f8a7a");
  // yoke (dark U bar) holding the head
  g.fillStyle = "#2a2c30";
  g.fillRect(cx - w * 0.24, h * 0.34, w * 0.48, h * 0.06);
  g.strokeRect(cx - w * 0.24, h * 0.34, w * 0.48, h * 0.06);
  // head: a box tilted toward you — yellow top face with a grille, the lit glass as the front face
  const hx = cx - w * 0.2;
  const hw = w * 0.4;
  g.fillStyle = FL_Y;
  g.lineWidth = w * 0.02;
  g.beginPath();
  g.moveTo(hx + w * 0.03, h * 0.06);
  g.lineTo(hx + hw - w * 0.03, h * 0.06);
  g.lineTo(hx + hw, h * 0.2);
  g.lineTo(hx, h * 0.2);
  g.closePath();
  g.fill();
  g.stroke();
  g.fillStyle = FL_Y_HI;
  g.fillRect(hx + w * 0.05, h * 0.075, hw * 0.4, h * 0.03);
  g.strokeStyle = "rgba(24,18,4,0.7)";
  g.lineWidth = w * 0.012;
  for (let i = 1; i < 6; i++) {
    const t = i / 6;
    g.beginPath();
    g.moveTo(hx + w * 0.03 + (hw - w * 0.06) * t, h * 0.09);
    g.lineTo(hx + hw * t, h * 0.185);
    g.stroke();
  }
  // front: yellow bezel and the glowing glass
  g.fillStyle = FL_Y_DK;
  g.strokeStyle = OUT;
  g.lineWidth = w * 0.02;
  roundRectPath(g, hx, h * 0.2, hw, h * 0.22, w * 0.015);
  g.fill();
  g.stroke();
  dot(g, cx, h * 0.33, w * 0.24, `rgba(${LAMP_GLOW},0.12)`);
  dot(g, cx, h * 0.33, w * 0.16, `rgba(${LAMP_GLOW},0.2)`);
  g.fillStyle = LAMP;
  g.fillRect(hx + w * 0.03, h * 0.235, hw - w * 0.06, h * 0.15);
  g.strokeStyle = "rgba(60,45,15,0.55)";
  g.lineWidth = w * 0.01;
  for (let i = 1; i < 4; i++) {
    const x = hx + w * 0.03 + ((hw - w * 0.06) * i) / 4;
    g.beginPath();
    g.moveTo(x, h * 0.235);
    g.lineTo(x, h * 0.385);
    g.stroke();
  }
  dot(g, cx - w * 0.06, h * 0.28, w * 0.035, "rgba(255,255,255,0.9)");
  // yoke bolts
  dot(g, cx - w * 0.22, h * 0.37, w * 0.016, "#3a3c40");
  dot(g, cx + w * 0.22, h * 0.37, w * 0.016, "#3a3c40");
};

// MS10 colours.
const CRATE = "#3b4652";
const CRATE_HI = "#56636f";
const CRATE_DK = "#262e37";
const ORANGE = "#c8641e";
const ORANGE_HI = "#e07e34";
const ORANGE_DK = "#8f4410";
const GREY = "#59616b";
const GREY_HI = "#7a838d";
const GREY_DK = "#3a4048";
const CROSS_W = "#f2eee4";
const LED = "#5dff8a";
const LED_GLOW = "90,255,140";
const PANEL = "#121417";

/** A box in the I1 view: a lighter top face over a front face, outlined. */
function box3(g: Ctx, x: number, y: number, bw: number, top: number, front: number, cTop: string, cFront: string, lw: number): void {
  g.strokeStyle = OUT;
  g.lineWidth = lw;
  g.fillStyle = cFront;
  g.fillRect(x, y + top, bw, front);
  g.strokeRect(x, y + top, bw, front);
  g.fillStyle = cTop;
  g.fillRect(x, y, bw, top);
  g.strokeRect(x, y, bw, top);
}

/** A plus sign: two bars of thickness `t` and length `s` centred on (x, y). */
function cross(g: Ctx, x: number, y: number, s: number, t: number, style: string): void {
  g.fillStyle = style;
  g.fillRect(x - s / 2, y - t / 2, s, t);
  g.fillRect(x - t / 2, y - s / 2, t, s);
}

/** The first-aid case's carry handle (an open U), drawn twice: outline, then the dark grip. */
function handlePath(g: Ctx, w: number, h: number): void {
  g.beginPath();
  g.moveTo(w * 0.22, h * 0.26);
  g.lineTo(w * 0.22, h * 0.18);
  g.lineTo(w * 0.36, h * 0.18);
  g.lineTo(w * 0.36, h * 0.26);
  g.stroke();
}

/** MS10 med station: a blue-grey crate with an orange first-aid case and a grey case whose LED panel glows a green cross. */
const medStationMS10: Draw = (g, w, h) => {
  const lw = w * 0.018;
  shadow(g, w / 2, h * 0.9, w * 0.46, h * 0.07);
  // bottom crate, wide
  box3(g, w * 0.06, h * 0.52, w * 0.88, h * 0.1, h * 0.26, CRATE_HI, CRATE, lw);
  g.fillStyle = CRATE_DK;
  g.fillRect(w * 0.06, h * 0.7, w * 0.88, h * 0.04);
  g.fillStyle = "#1d2126";
  for (const x of [0.22, 0.78]) g.fillRect(w * x - w * 0.05, h * 0.64, w * 0.1, h * 0.04);
  // orange first-aid case, left: carry handle on top, a big white cross on its front
  g.strokeStyle = OUT;
  g.lineWidth = w * 0.03;
  g.lineCap = "round";
  handlePath(g, w, h);
  g.strokeStyle = "#2a2c30";
  g.lineWidth = w * 0.016;
  handlePath(g, w, h);
  g.lineCap = "butt";
  box3(g, w * 0.09, h * 0.24, w * 0.4, h * 0.08, h * 0.3, ORANGE_HI, ORANGE, lw);
  g.fillStyle = ORANGE_DK;
  g.fillRect(w * 0.09, h * 0.32, w * 0.4, h * 0.03);
  g.fillStyle = "#2a2c30";
  for (const x of [0.13, 0.42]) g.fillRect(w * x, h * 0.31, w * 0.03, h * 0.06);
  cross(g, w * 0.29, h * 0.45, w * 0.17, w * 0.06, CROSS_W);
  // grey case, right, tall: the LED panel on its front
  box3(g, w * 0.5, h * 0.08, w * 0.42, h * 0.08, h * 0.48, GREY_HI, GREY, lw);
  g.fillStyle = GREY_DK;
  g.fillRect(w * 0.88, h * 0.16, w * 0.04, h * 0.48);
  g.fillStyle = "#2a2c30";
  g.fillRect(w * 0.64, h * 0.04, w * 0.14, h * 0.04);
  // glow first (spills over the case), then the panel and the cross
  dot(g, w * 0.71, h * 0.4, w * 0.24, `rgba(${LED_GLOW},0.12)`);
  dot(g, w * 0.71, h * 0.4, w * 0.18, `rgba(${LED_GLOW},0.18)`);
  g.fillStyle = PANEL;
  g.strokeStyle = OUT;
  g.lineWidth = lw;
  roundRectPath(g, w * 0.56, h * 0.21, w * 0.3, h * 0.38, w * 0.02);
  g.fill();
  g.stroke();
  cross(g, w * 0.71, h * 0.4, w * 0.2, w * 0.07, LED);
  cross(g, w * 0.71, h * 0.4, w * 0.12, w * 0.025, "rgba(220,255,228,0.9)");
};

// B-T1 colours.
const JAW = "#7d8389";
const JAW_HI = "#aab0b6";
const JAW_DK = "#50555a";
const TOOTH = "#c9ced3";
const PAN = "#7d8186";
const CHAIN = "#62666b";
const STAKE = "#5a5650";

/** B-T1 bear trap: round steel jaws lying open with the teeth up, leaf springs both sides, round plate, chain to a stake. */
const bearTrapBT1: Draw = (g, w, h) => {
  const cx = w * 0.45;
  const cy = h * 0.64;
  const rx = w * 0.32;
  const ry = h * 0.24;
  const bw = h * 0.08;
  const lw = w * 0.018;
  shadow(g, w * 0.5, h * 0.86, w * 0.47, h * 0.1, 0.35);
  // leaf springs: flat U bars out to both sides, along the jaw's hinge line
  for (const s of [-1, 1]) {
    const x0 = cx + s * rx * 0.8;
    const x1 = cx + s * (rx + w * 0.1);
    g.strokeStyle = OUT;
    g.lineWidth = h * 0.11;
    g.lineCap = "round";
    g.beginPath();
    g.moveTo(x0, cy);
    g.lineTo(x1, cy);
    g.stroke();
    g.strokeStyle = JAW;
    g.lineWidth = h * 0.07;
    g.beginPath();
    g.moveTo(x0, cy);
    g.lineTo(x1, cy);
    g.stroke();
    g.strokeStyle = JAW_HI;
    g.lineWidth = h * 0.02;
    g.beginPath();
    g.moveTo(x0, cy - h * 0.018);
    g.lineTo(x1, cy - h * 0.018);
    g.stroke();
    g.lineCap = "butt";
  }
  // chain from the right spring to a stake front right
  const sx = w * 0.95;
  const sy = h * 0.9;
  const ax = cx + rx + w * 0.1;
  const ay = cy;
  for (let i = 0; i < 5; i++) {
    const t = (i + 0.5) / 5;
    const x = ax + (sx - ax) * t;
    const y = ay + (sy - ay) * t + Math.sin(t * Math.PI) * h * 0.04;
    const rot = i % 2 ? 0.9 : -0.4;
    g.strokeStyle = OUT;
    g.lineWidth = w * 0.022;
    g.beginPath();
    g.ellipse(x, y, w * 0.022, h * 0.03, rot, 0, TAU);
    g.stroke();
    g.strokeStyle = CHAIN;
    g.lineWidth = w * 0.012;
    g.beginPath();
    g.ellipse(x, y, w * 0.022, h * 0.03, rot, 0, TAU);
    g.stroke();
  }
  g.fillStyle = STAKE;
  g.strokeStyle = OUT;
  g.lineWidth = lw;
  g.fillRect(sx - w * 0.02, sy - h * 0.12, w * 0.04, h * 0.12);
  g.strokeRect(sx - w * 0.02, sy - h * 0.12, w * 0.04, h * 0.12);
  g.beginPath();
  g.ellipse(sx, sy - h * 0.12, w * 0.03, h * 0.035, 0, 0, TAU);
  g.fill();
  g.stroke();
  // the jaw ring: back half, then the plate, then teeth, then the front half
  const ring = (a0: number, a1: number): void => {
    g.beginPath();
    g.ellipse(cx, cy, rx, ry, 0, a0, a1);
    g.ellipse(cx, cy, rx - bw * 1.4, ry - bw, 0, a1, a0, true);
    g.closePath();
  };
  g.strokeStyle = OUT;
  g.lineWidth = lw;
  g.fillStyle = JAW_DK;
  ring(Math.PI, TAU);
  g.fill();
  g.stroke();
  // pressure plate on its trigger arm
  g.fillStyle = JAW_DK;
  g.fillRect(cx - w * 0.015, cy - ry + bw * 0.5, w * 0.03, ry - bw * 0.5);
  g.fillStyle = PAN;
  g.beginPath();
  g.ellipse(cx, cy, rx * 0.36, ry * 0.36, 0, 0, TAU);
  g.fill();
  g.stroke();
  g.strokeStyle = "rgba(0,0,0,0.35)";
  g.lineWidth = w * 0.01;
  g.beginPath();
  g.ellipse(cx, cy, rx * 0.22, ry * 0.22, 0, 0, TAU);
  g.stroke();
  dot(g, cx - rx * 0.12, cy - ry * 0.14, w * 0.02, "rgba(255,255,255,0.35)");
  // teeth: steel triangles standing up from the ring, leaning inward; back row first
  const teeth = (a0: number, a1: number, n: number): void => {
    for (let i = 0; i < n; i++) {
      const a = a0 + ((i + 0.5) * (a1 - a0)) / n;
      const bx = cx + Math.cos(a) * (rx - bw * 0.7);
      const by = cy + Math.sin(a) * (ry - bw * 0.5);
      const tw = w * 0.024;
      const tx = bx - Math.cos(a) * w * 0.025;
      const ty = by - h * 0.2;
      g.fillStyle = TOOTH;
      g.strokeStyle = OUT;
      g.lineWidth = w * 0.012;
      g.beginPath();
      g.moveTo(bx - tw, by);
      g.lineTo(tx, ty);
      g.lineTo(bx + tw, by);
      g.closePath();
      g.fill();
      g.stroke();
      g.fillStyle = "#8d9399";
      g.beginPath();
      g.moveTo(tx, ty);
      g.lineTo(bx + tw, by);
      g.lineTo(bx + tw * 0.2, by);
      g.closePath();
      g.fill();
      dot(g, tx, ty + h * 0.01, w * 0.008, "#fff");
    }
  };
  teeth(Math.PI + 0.25, TAU - 0.25, 6);
  g.strokeStyle = OUT;
  g.lineWidth = lw;
  g.fillStyle = JAW;
  ring(0, Math.PI);
  g.fill();
  g.stroke();
  g.strokeStyle = JAW_HI;
  g.lineWidth = h * 0.02;
  g.beginPath();
  g.ellipse(cx, cy, rx - bw * 0.5, ry - bw * 0.35, 0, Math.PI * 0.55, Math.PI * 0.95);
  g.stroke();
  teeth(0.3, Math.PI - 0.3, 5);
  // hinge pivots where the jaws meet the springs
  for (const s of [-1, 1]) {
    dot(g, cx + s * (rx - bw * 0.6), cy, w * 0.032, OUT);
    dot(g, cx + s * (rx - bw * 0.6), cy, w * 0.022, JAW_HI);
  }
};

/** The baked icons, in atlas order: frame name → drawing. */
export const BUILD_ICONS: readonly { readonly frame: string; readonly draw: Draw }[] = Object.freeze([
  { frame: "icon_build_barricade_a", draw: barricadeI1 },
  { frame: "icon_build_spiketrap_a", draw: spikesI1 },
  { frame: "icon_build_turret_a", draw: turretT1 },
  { frame: "icon_build_turret_b", draw: turretT2 },
  { frame: "icon_build_mine_a", draw: mineM1 },
  { frame: "icon_build_floodlight_a", draw: floodlightFL1 },
  { frame: "icon_build_medstation_a", draw: medStationMS10 },
  { frame: "icon_build_beartrap_a", draw: bearTrapBT1 },
]);

/**
 * Building type (`buildings.json` key) → its build-bar icon frame. Types not listed (upgrade-only
 * tiers) have none: the bar falls back to the world art. Story 5.27 adds the floodlight, the med
 * station and the bear trap (`bear_trap` arrives with Story 5.14; until then the entry is unused). `icon_build_turret_b` (T2) is baked but not mapped (kept for a later tier or skin).
 */
const TYPE_FRAMES: Readonly<Record<string, string>> = Object.freeze({
  wood_barricade: "icon_build_barricade_a",
  spike_trap: "icon_build_spiketrap_a",
  auto_turret: "icon_build_turret_a",
  mine: "icon_build_mine_a",
  floodlight: "icon_build_floodlight_a",
  med_station: "icon_build_medstation_a",
  bear_trap: "icon_build_beartrap_a",
});

/** The build-bar icon frame of building `type` in `BUILD_ICON_TEXTURE`, or null (use the world art). */
export function buildIconFrame(type: string): string | null {
  return Object.prototype.hasOwnProperty.call(TYPE_FRAMES, type) ? (TYPE_FRAMES[type] as string) : null;
}

export interface BuildIconRect {
  readonly frame: string;
  readonly x: number;
  readonly y: number;
  readonly w: number;
  readonly h: number;
}

/** The atlas layout (pure): one row of frames at `BUILD_ICON_BAKE_SCALE` with gaps; its width and height. */
export function buildIconsLayout(): { readonly width: number; readonly height: number; readonly frames: readonly BuildIconRect[] } {
  const w = BUILD_ICON_FRAME_W * BUILD_ICON_BAKE_SCALE;
  const h = BUILD_ICON_FRAME_H * BUILD_ICON_BAKE_SCALE;
  const frames = BUILD_ICONS.map((icon, i) => ({ frame: icon.frame, x: i * (w + FRAME_GAP_PX), y: 0, w, h }));
  return { width: frames.length * (w + FRAME_GAP_PX) - FRAME_GAP_PX, height: h, frames };
}

/**
 * Paints one icon into its frame: scaled to the bake, the drawing in the 44 × 30 box offset by the
 * clip margins and clipped to the frame (the mockup's `tile()`), state saved and restored per icon.
 */
export function paintBuildIcon(g: Ctx, draw: Draw, r: BuildIconRect): void {
  const s = BUILD_ICON_BAKE_SCALE;
  g.save();
  g.beginPath();
  g.rect(r.x, r.y, r.w, r.h);
  g.clip();
  g.translate(r.x + BUILD_ICON_PAD_X * s, r.y + BUILD_ICON_PAD_TOP * s);
  g.scale(s, s);
  draw(g, BUILD_ICON_BOX_W, BUILD_ICON_BOX_H);
  g.restore();
}

/**
 * Registers the build icon atlas once per game (textures outlive scene restarts): 8 frames of
 * 96 × 72 px in one row (796 × 72, far under the 2048² cap). `makeCanvas` is for tests.
 */
export function ensureBuildIcons(scene: Phaser.Scene, makeCanvas: () => HTMLCanvasElement = () => document.createElement("canvas")): void {
  if (scene.textures.exists(BUILD_ICON_TEXTURE)) return;
  const layout = buildIconsLayout();
  const canvas = makeCanvas();
  canvas.width = layout.width;
  canvas.height = layout.height;
  addGeneratedTexture(
    scene,
    BUILD_ICON_TEXTURE,
    canvas,
    (g) => {
      layout.frames.forEach((r, i) => paintBuildIcon(g, (BUILD_ICONS[i] as (typeof BUILD_ICONS)[number]).draw, r));
    },
    (tex) => {
      for (const r of layout.frames) tex.add(r.frame, 0, r.x, r.y, r.w, r.h);
    },
  );
}
