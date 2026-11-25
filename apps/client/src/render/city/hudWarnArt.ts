import type * as Phaser from "phaser";
import { addGeneratedTexture } from "./canvasTexture";

/**
 * Asset fixes round 5, look P1 (designer 2026-11-24: "P1 is just perfect"): the Behemoth's marks as a
 * red-on-black sci-fi warning display (`docs/art/asset-fixes-1/looks-5.html`): neon line frames with
 * chamfered corners, corner brackets, hazard stripes, faint triangle fields, skulls in small boxes,
 * condensed bold labels. This module draws the static plates into one texture (`BOSS_HUD`, drawn at
 * `HUD_ART_SCALE` px per CSS px); the views animate around them (flicker, chevrons, the reticle).
 */

export const BOSS_HUD = "boss_hud";
/** The plates are drawn at this many px per CSS px (crisp on 3× phones; the views scale them down). */
export const HUD_ART_SCALE = 3;

/** The look's colours (P1). Numbers for Phaser Graphics, strings for canvas. */
export const HUD_RED = 0xff3b30;
export const HUD_ACCENT = 0xff6a5a;
const LINE = "#ff3b30";
const GLOW = "rgba(255,40,30,0.9)";
const FILL = "rgba(40,4,4,0.72)";
const ACCENT = "#ff6a5a";
const DIM = "rgba(255,50,40,0.16)";
export const HUD_FONT = 'Oswald, "Arial Narrow", Impact, sans-serif';

/** Plate sizes in CSS px (the frames are these × `HUD_ART_SCALE`, plus `PAD` of glow room on each side). */
export const HUD_PLATES = {
  tag: { w: 64, h: 20 },
  danger: { w: 120, h: 40 },
  slam: { w: 150, h: 36 },
  charge: { w: 150, h: 36 },
  throw: { w: 150, h: 36 },
  banner: { w: 300, h: 54 },
} as const;
export type HudPlate = keyof typeof HUD_PLATES;
/** Glow room around each plate (CSS px), and room for the banner's and plates' stripe bars. */
export const HUD_PAD = 12;

export const HUD_FRAMES: Readonly<Record<HudPlate, string>> = {
  tag: "hud_target_tag",
  danger: "hud_danger",
  slam: "hud_plate_slam",
  charge: "hud_plate_charge",
  throw: "hud_plate_throw",
  banner: "hud_banner",
};

type G = CanvasRenderingContext2D;
const TAU = Math.PI * 2;

function neon(g: G, fn: () => void, blur = 10): void {
  g.save();
  g.shadowColor = GLOW;
  g.shadowBlur = blur;
  fn();
  g.restore();
  fn();
}

function chamfer(g: G, x: number, y: number, w: number, h: number, c: number): void {
  g.beginPath();
  g.moveTo(x + c, y);
  g.lineTo(x + w - c, y);
  g.lineTo(x + w, y + c);
  g.lineTo(x + w, y + h - c);
  g.lineTo(x + w - c, y + h);
  g.lineTo(x + c, y + h);
  g.lineTo(x, y + h - c);
  g.lineTo(x, y + c);
  g.closePath();
}

/** Diagonal hazard stripes in a box. */
export function hazardStripes(g: G, x: number, y: number, w: number, h: number, col: string, step = 4): void {
  g.save();
  g.beginPath();
  g.rect(x, y, w, h);
  g.clip();
  g.fillStyle = col;
  for (let sx = x - h - step * 2; sx < x + w + h; sx += step * 2) {
    g.beginPath();
    g.moveTo(sx, y + h);
    g.lineTo(sx + step, y + h);
    g.lineTo(sx + step + h, y);
    g.lineTo(sx + h, y);
    g.closePath();
    g.fill();
  }
  g.restore();
}

function brackets(g: G, x: number, y: number, w: number, h: number, len: number, gap: number): void {
  g.beginPath();
  for (const [cx, cy, sx, sy] of [
    [x - gap, y - gap, 1, 1],
    [x + w + gap, y - gap, -1, 1],
    [x - gap, y + h + gap, 1, -1],
    [x + w + gap, y + h + gap, -1, -1],
  ] as const) {
    g.moveTo(cx + sx * len, cy);
    g.lineTo(cx, cy);
    g.lineTo(cx, cy + sy * len);
  }
  g.stroke();
}

/** A small skull glyph, centred at (x, y), size s. */
function skull(g: G, x: number, y: number, s: number): void {
  g.save();
  g.translate(x, y);
  g.beginPath();
  g.arc(0, -s * 0.1, s * 0.4, Math.PI * 0.85, Math.PI * 0.15);
  g.lineTo(s * 0.22, s * 0.38);
  g.lineTo(-s * 0.22, s * 0.38);
  g.closePath();
  g.fill();
  g.globalCompositeOperation = "destination-out";
  for (const sx of [-1, 1]) {
    g.beginPath();
    g.arc(sx * s * 0.15, -s * 0.06, s * 0.1, 0, TAU);
    g.fill();
  }
  g.fillRect(-s * 0.03, s * 0.12, s * 0.06, s * 0.1);
  for (let i = -1; i <= 1; i++) g.fillRect(i * s * 0.1 - s * 0.015, s * 0.26, s * 0.03, s * 0.12);
  g.restore();
}

function triangleGlyph(g: G, x: number, y: number, s: number): void {
  g.beginPath();
  g.moveTo(x, y - s * 0.45);
  g.lineTo(x + s * 0.5, y + s * 0.4);
  g.lineTo(x - s * 0.5, y + s * 0.4);
  g.closePath();
  g.stroke();
  g.fillRect(x - s * 0.04, y - s * 0.18, s * 0.08, s * 0.32);
  g.fillRect(x - s * 0.04, y + s * 0.2, s * 0.08, s * 0.08);
}

/** Faint outlined triangles (the panels' background texture), a fixed pattern. */
function triField(g: G, x: number, y: number, w: number, h: number): void {
  g.save();
  g.beginPath();
  g.rect(x, y, w, h);
  g.clip();
  g.strokeStyle = DIM;
  g.lineWidth = 1;
  const s = 12;
  for (let j = 0; j * s * 0.9 < h + s; j++) {
    for (let i = 0; i * s < w + s; i++) {
      if (Math.sin(i * 1.7 + j * 2.3) <= 0.2) continue;
      const tx = x + i * s + (j % 2) * (s / 2);
      const ty = y + j * s * 0.9;
      g.beginPath();
      g.moveTo(tx, ty - s * 0.35);
      g.lineTo(tx + s * 0.4, ty + s * 0.35);
      g.lineTo(tx - s * 0.4, ty + s * 0.35);
      g.closePath();
      g.stroke();
    }
  }
  g.restore();
}

function panel(g: G, w: number, h: number, c: number, glow: number): void {
  g.fillStyle = FILL;
  chamfer(g, 0, 0, w, h, c);
  g.fill();
  triField(g, 0, 0, w, h);
  g.strokeStyle = LINE;
  g.lineWidth = 2;
  neon(g, () => {
    chamfer(g, 0, 0, w, h, c);
    g.stroke();
  }, glow);
}

function label(g: G, text: string, x: number, y: number, px: number, align: CanvasTextAlign): void {
  g.fillStyle = LINE;
  g.font = `700 ${px}px ${HUD_FONT}`;
  g.textAlign = align;
  g.textBaseline = "middle";
  neon(g, () => g.fillText(text, x, y), 8);
}

/** Draws one plate at (0, 0) in CSS px (the caller scales and offsets by the pad). */
export function drawHudPlate(g: G, plate: HudPlate): void {
  const { w, h } = HUD_PLATES[plate];
  switch (plate) {
    case "tag": {
      panel(g, w, h, 4, 6);
      g.strokeStyle = LINE;
      g.lineWidth = 1.2;
      g.strokeRect(4, 3, h - 6, h - 6);
      g.fillStyle = ACCENT;
      skull(g, 4 + (h - 6) / 2, h / 2, h * 0.62);
      g.fillStyle = LINE;
      g.font = `600 ${Math.round(h * 0.58)}px ${HUD_FONT}`;
      g.textAlign = "left";
      g.textBaseline = "middle";
      g.fillText("TARGET", h + 2, h / 2 + 1);
      break;
    }
    case "danger": {
      panel(g, w, h, 6, 10);
      g.strokeStyle = LINE;
      g.lineWidth = 1.2;
      g.globalAlpha = 0.8;
      brackets(g, 0, 0, w, h, 8, 5);
      g.globalAlpha = 1;
      for (const bx of [15, w - 15]) {
        g.strokeRect(bx - 9, h / 2 - 9, 18, 18);
        g.fillStyle = ACCENT;
        skull(g, bx, h / 2, 15);
      }
      label(g, "DANGER", w / 2, h / 2 + 1, 20, "center");
      break;
    }
    case "slam":
    case "charge":
    case "throw": {
      panel(g, w, h, 6, 10);
      hazardStripes(g, 6, -7, w - 12, 4, LINE);
      hazardStripes(g, 6, h + 3, w - 12, 4, LINE);
      const bs = h - 14;
      const bx = 8;
      const by = 7;
      g.strokeStyle = LINE;
      g.lineWidth = 1.5;
      g.strokeRect(bx, by, bs, bs);
      g.fillStyle = ACCENT;
      g.strokeStyle = ACCENT;
      const cx = bx + bs / 2;
      const cy = by + bs / 2;
      if (plate === "slam") {
        for (const k of [0.15, 0.3, 0.45]) {
          g.beginPath();
          g.arc(cx, cy, bs * k, 0, TAU);
          g.stroke();
        }
      } else if (plate === "charge") {
        for (const dx of [-0.22, 0.05]) {
          g.beginPath();
          g.moveTo(cx + bs * (dx + 0.2), cy);
          g.lineTo(cx + bs * (dx - 0.05), cy - bs * 0.28);
          g.lineTo(cx + bs * (dx - 0.05), cy + bs * 0.28);
          g.closePath();
          g.fill();
        }
      } else {
        g.beginPath();
        g.moveTo(cx - bs * 0.2, cy - bs * 0.05);
        g.lineTo(cx + bs * 0.05, cy - bs * 0.28);
        g.lineTo(cx + bs * 0.3, cy - bs * 0.05);
        g.lineTo(cx + bs * 0.15, cy + bs * 0.25);
        g.lineTo(cx - bs * 0.18, cy + bs * 0.2);
        g.closePath();
        g.fill();
      }
      label(g, plate.toUpperCase(), bx + bs + 10, h / 2 + 1, Math.round(h * 0.58), "left");
      break;
    }
    case "banner": {
      panel(g, w, h, 10, 14);
      hazardStripes(g, 14, -10, w - 28, 6, LINE, 6);
      hazardStripes(g, 14, h + 4, w - 28, 6, LINE, 6);
      g.fillStyle = ACCENT;
      g.strokeStyle = ACCENT;
      g.lineWidth = 2;
      triangleGlyph(g, 28, h / 2, 26);
      triangleGlyph(g, w - 28, h / 2, 26);
      label(g, "THE BEHEMOTH", w / 2, h / 2 + 2, 34, "center");
      break;
    }
  }
}

const PLATES = Object.keys(HUD_PLATES) as HudPlate[];

/** Frame rectangles in the texture (px), stacked vertically. */
function layout(): { w: number; h: number; frames: { plate: HudPlate; x: number; y: number; w: number; h: number }[] } {
  let y = 0;
  let w = 0;
  const frames = PLATES.map((plate) => {
    const pw = (HUD_PLATES[plate].w + 2 * HUD_PAD) * HUD_ART_SCALE;
    const ph = (HUD_PLATES[plate].h + 2 * HUD_PAD) * HUD_ART_SCALE;
    const f = { plate, x: 0, y, w: pw, h: ph };
    y += ph;
    w = Math.max(w, pw);
    return f;
  });
  return { w, h: y, frames };
}

/** Resolves once the HUD font is ready (or never fails: the fallback face is fine). */
function fontReady(): Promise<unknown> {
  const fonts = typeof document !== "undefined" ? document.fonts : undefined;
  if (!fonts) return Promise.resolve();
  return Promise.all([fonts.load(`700 20px ${HUD_FONT}`), fonts.load(`600 20px ${HUD_FONT}`)]).catch(() => undefined);
}

/**
 * Creates the plates texture once per game (idempotent). Drawn at once (the fallback font if Oswald is still
 * loading), and redrawn when the font arrives, so the labels end up in the bundled face.
 */
export function ensureHudWarnTextures(scene: Phaser.Scene, makeCanvas: () => HTMLCanvasElement = () => document.createElement("canvas")): void {
  if (scene.textures.exists(BOSS_HUD)) return;
  const l = layout();
  const canvas = makeCanvas();
  canvas.width = l.w;
  canvas.height = l.h;
  const paint = (g: G): void => {
    for (const f of l.frames) {
      g.save();
      g.translate(f.x + HUD_PAD * HUD_ART_SCALE, f.y + HUD_PAD * HUD_ART_SCALE);
      g.scale(HUD_ART_SCALE, HUD_ART_SCALE);
      drawHudPlate(g, f.plate);
      g.restore();
    }
  };
  const tex = addGeneratedTexture(scene, BOSS_HUD, canvas, paint, (t) => {
    for (const f of l.frames) t.add(HUD_FRAMES[f.plate], 0, f.x, f.y, f.w, f.h);
  });
  if (!tex) return;
  void fontReady().then(() => {
    if (!scene.textures.exists(BOSS_HUD)) return;
    canvas.width = l.w; // reset and repaint in the loaded face
    canvas.height = l.h;
    const g = canvas.getContext("2d");
    if (!g) return;
    paint(g);
    tex.refresh();
  });
}

/** Display size (CSS px) of a plate's frame, glow pad included. */
export function hudFrameCssSize(plate: HudPlate): { w: number; h: number } {
  return { w: HUD_PLATES[plate].w + 2 * HUD_PAD, h: HUD_PLATES[plate].h + 2 * HUD_PAD };
}

/** HUD flicker: mostly 1, with brief dips like a failing display (pure, from a clock in seconds). */
export function hudFlicker(tS: number): number {
  return Math.sin(tS * 47) > 0.97 || Math.sin(tS * 13.3) > 0.995 ? 0.45 : 1;
}
