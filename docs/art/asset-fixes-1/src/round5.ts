/**
 * Round 5 (designer, 2026-11-24): inspiration images of sci-fi HUD warnings: neon line frames, corner
 * brackets, hazard stripes, triangle patterns, skulls in small boxes, condensed labels (WARNING, DANGER).
 * Original designs in that language for the boss's marks: the target reticle, the off-screen edge panel,
 * the three attack plates (SLAM / CHARGE / THROW) and the arrival banner. Two palettes: P1 red on black,
 * P2 magenta with amber. Everything animates (flicker, scrolling stripes, brackets closing in).
 */
import { drawSurvivor } from "../../../../apps/client/src/render/city/spriteArt";
import { GROUND } from "../../../../apps/client/src/render/city/palette";
import { TAU, asphalt, canvas, ctx, night, put, type G } from "./lib";

interface Palette {
  readonly id: string;
  readonly line: string; // main neon line
  readonly glow: string; // its glow
  readonly fill: string; // translucent panel fill
  readonly accent: string; // icons / second colour
  readonly dim: string; // pattern colour
}

const P1: Palette = { id: "P1", line: "#ff3b30", glow: "rgba(255,40,30,0.9)", fill: "rgba(40,4,4,0.72)", accent: "#ff6a5a", dim: "rgba(255,50,40,0.16)" };
const P2: Palette = { id: "P2", line: "#ff2e7e", glow: "rgba(255,40,130,0.9)", fill: "rgba(40,8,40,0.72)", accent: "#ffb020", dim: "rgba(255,60,140,0.16)" };

const FONT = '"Oswald", "Arial Narrow", Impact, sans-serif';

/** Draws `fn` with a neon glow (two passes: wide bloom, then crisp). */
function neon(g: G, p: Palette, fn: () => void, blur = 10): void {
  g.save();
  g.shadowColor = p.glow;
  g.shadowBlur = blur;
  fn();
  g.restore();
  fn();
}

/** Diagonal hazard stripes in a box, scrolling with `t`. */
function stripes(g: G, x: number, y: number, w: number, h: number, col: string, t: number, step = 8): void {
  g.save();
  g.beginPath();
  g.rect(x, y, w, h);
  g.clip();
  g.fillStyle = col;
  const off = (t * 20) % (step * 2);
  for (let sx = x - h - step * 2 + off; sx < x + w + h; sx += step * 2) {
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

/** Corner brackets around a box, `gap` px away, `len` long. */
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

/** A panel with chamfered corners. */
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

/** A small skull glyph (line style), centred, size s. */
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

/** Warning triangle glyph (outline + "!"). */
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

/** A field of faint outlined triangles (background texture of the panels). */
function triField(g: G, x: number, y: number, w: number, h: number, col: string, t: number): void {
  g.save();
  g.beginPath();
  g.rect(x, y, w, h);
  g.clip();
  g.strokeStyle = col;
  g.lineWidth = 1;
  const s = 12;
  for (let j = 0; j * s * 0.9 < h + s; j++) {
    for (let i = 0; i * s < w + s; i++) {
      const tx = x + i * s + (j % 2) * (s / 2);
      const ty = y + j * s * 0.9;
      const on = Math.sin(i * 1.7 + j * 2.3 + t * 2) > 0.2;
      if (!on) continue;
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

/** HUD flicker: mostly 1, with brief dips (like a failing display). */
const flicker = (t: number): number => (Math.sin(t * 47) > 0.97 || Math.sin(t * 13.3) > 0.995 ? 0.45 : 1);

// ─────────────────────────────── the pieces ───────────────────────────────

/** The target reticle around the hunted player: brackets closing in, skull tag, a stripe bar, rotating ticks. */
function reticle(g: G, p: Palette, x: number, y: number, r: number, t: number, lock: number): void {
  g.save();
  g.globalAlpha = flicker(t);
  g.strokeStyle = p.line;
  g.fillStyle = p.line;
  g.lineWidth = 2;
  const gap = r * (1.25 - 0.35 * lock);
  neon(g, p, () => brackets(g, x - r, y - r, 2 * r, 2 * r, r * 0.55, gap - r));
  // rotating tick ring
  g.save();
  g.translate(x, y);
  g.rotate(t * 0.8);
  g.globalAlpha *= 0.7;
  for (let i = 0; i < 24; i++) {
    if (i % 6 === 0) continue;
    const a = (i / 24) * TAU;
    g.beginPath();
    g.moveTo(Math.cos(a) * r * 0.95, Math.sin(a) * r * 0.95);
    g.lineTo(Math.cos(a) * r * 1.08, Math.sin(a) * r * 1.08);
    g.stroke();
  }
  g.restore();
  // skull tag above, with a short stripe bar
  const tx = x - r * 0.85;
  const ty = y - gap - r * 0.95;
  g.fillStyle = p.fill;
  chamfer(g, tx, ty, r * 1.7, r * 0.55, 4);
  g.fill();
  neon(g, p, () => {
    g.strokeStyle = p.line;
    chamfer(g, tx, ty, r * 1.7, r * 0.55, 4);
    g.stroke();
  }, 6);
  g.fillStyle = p.accent;
  skull(g, tx + r * 0.27, ty + r * 0.27, r * 0.42);
  g.fillStyle = p.line;
  g.font = `600 ${Math.round(r * 0.32)}px ${FONT}`;
  g.textBaseline = "middle";
  g.fillText("TARGET", tx + r * 0.52, ty + r * 0.29);
  stripes(g, x - r, y + gap + 4, 2 * r, 4, p.line, t, 4);
  g.restore();
}

type Attack = "walk" | "slam" | "charge" | "throw";

/** The attack plate: a framed label with its glyph (e.g. SLAM with impact rings). */
function attackPlate(g: G, p: Palette, x: number, y: number, w: number, h: number, atk: Exclude<Attack, "walk">, t: number): void {
  g.save();
  g.globalAlpha = flicker(t + 0.3);
  g.fillStyle = p.fill;
  chamfer(g, x, y, w, h, 6);
  g.fill();
  triField(g, x, y, w, h, p.dim, t);
  g.strokeStyle = p.line;
  g.lineWidth = 2;
  neon(g, p, () => {
    chamfer(g, x, y, w, h, 6);
    g.stroke();
  });
  stripes(g, x + 6, y - 7, w - 12, 4, p.line, t, 4);
  stripes(g, x + 6, y + h + 3, w - 12, 4, p.line, -t, 4);
  // glyph box on the left
  const bx = x + 8;
  const by = y + 7;
  const bs = h - 14;
  g.lineWidth = 1.5;
  g.strokeRect(bx, by, bs, bs);
  g.fillStyle = p.accent;
  g.strokeStyle = p.accent;
  const cx = bx + bs / 2;
  const cy = by + bs / 2;
  if (atk === "slam") {
    for (const k of [0.15, 0.3, 0.45]) {
      g.beginPath();
      g.arc(cx, cy, bs * k * (0.8 + 0.2 * Math.sin(t * 8 - k * 10)), 0, TAU);
      g.stroke();
    }
  } else if (atk === "charge") {
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
  g.fillStyle = p.line;
  g.font = `700 ${Math.round(h * 0.58)}px ${FONT}`;
  g.textBaseline = "middle";
  g.textAlign = "left";
  neon(g, p, () => g.fillText(atk.toUpperCase(), bx + bs + 10, y + h / 2 + 1), 8);
  g.restore();
}

/** The off-screen edge panel: DANGER plate with skull boxes and chevrons pointing toward the boss. */
function edgePanel(g: G, p: Palette, x: number, y: number, t: number, dirRight: boolean): void {
  const w = 120;
  const h = 40;
  g.save();
  g.globalAlpha = flicker(t + 0.7);
  g.fillStyle = p.fill;
  chamfer(g, x - w / 2, y - h / 2, w, h, 6);
  g.fill();
  triField(g, x - w / 2, y - h / 2, w, h, p.dim, t);
  g.strokeStyle = p.line;
  g.lineWidth = 2;
  neon(g, p, () => {
    chamfer(g, x - w / 2, y - h / 2, w, h, 6);
    g.stroke();
  });
  g.lineWidth = 1.2;
  g.globalAlpha *= 0.8;
  brackets(g, x - w / 2, y - h / 2, w, h, 8, 5);
  g.globalAlpha = flicker(t + 0.7);
  for (const sx of [-1, 1]) {
    const bx = x + sx * (w / 2 - 15);
    g.strokeRect(bx - 9, y - 9, 18, 18);
    g.fillStyle = p.accent;
    skull(g, bx, y, 15);
  }
  g.fillStyle = p.line;
  g.font = `700 20px ${FONT}`;
  g.textAlign = "center";
  g.textBaseline = "middle";
  neon(g, p, () => g.fillText("DANGER", x, y + 1), 8);
  // chevrons toward the boss, marching
  const d = dirRight ? 1 : -1;
  for (let i = 0; i < 3; i++) {
    const ph = ((t * 2 + i / 3) % 1) * 1;
    g.globalAlpha = (0.3 + 0.7 * (1 - Math.abs(ph - 0.5) * 2)) * flicker(t);
    const cx = x + d * (w / 2 + 12 + i * 10);
    g.beginPath();
    g.moveTo(cx - d * 4, y - 9);
    g.lineTo(cx + d * 4, y);
    g.lineTo(cx - d * 4, y + 9);
    g.lineWidth = 3;
    g.stroke();
  }
  g.restore();
}

/** The arrival banner: big WARNING plate across the top for the boss's 4 s warning. */
function banner(g: G, p: Palette, cx: number, y: number, t: number): void {
  const w = 300;
  const h = 54;
  const x = cx - w / 2;
  g.save();
  g.globalAlpha = flicker(t * 1.3) * (0.75 + 0.25 * Math.sin(t * 6));
  g.fillStyle = p.fill;
  chamfer(g, x, y, w, h, 10);
  g.fill();
  triField(g, x, y, w, h, p.dim, t);
  g.strokeStyle = p.line;
  g.lineWidth = 2;
  neon(g, p, () => {
    chamfer(g, x, y, w, h, 10);
    g.stroke();
  }, 14);
  stripes(g, x + 14, y - 10, w - 28, 6, p.line, t, 6);
  stripes(g, x + 14, y + h + 4, w - 28, 6, p.line, -t, 6);
  g.fillStyle = p.accent;
  g.strokeStyle = p.accent;
  g.lineWidth = 2;
  triangleGlyph(g, x + 28, y + h / 2, 26);
  triangleGlyph(g, x + w - 28, y + h / 2, 26);
  g.fillStyle = p.line;
  g.font = `700 34px ${FONT}`;
  g.textAlign = "center";
  g.textBaseline = "middle";
  neon(g, p, () => g.fillText("THE BEHEMOTH", cx, y + h / 2 + 2), 12);
  g.restore();
}

// ─────────────────────────────── scenes ───────────────────────────────

const W = 560;
const H = 320;
const PM = 30;

function street(): HTMLCanvasElement {
  const c = canvas(W, H);
  const g = ctx(c);
  asphalt(g, W, H, 13);
  g.fillStyle = GROUND.sidewalk;
  g.fillRect(0, 0, W, 50);
  g.fillStyle = GROUND.curb;
  g.fillRect(0, 50, W, 3);
  g.fillStyle = GROUND.lane;
  for (let x = 0; x < W; x += 70) g.fillRect(x, 230, 40, 3);
  night(g, W, H, 0.55, [[140, 40, 170]]);
  return c;
}

const TARGET = { x: 210, y: 175 };

function scene(p: Palette, atk: Attack, withBanner: boolean): HTMLCanvasElement {
  const c = canvas(W, H);
  const g = ctx(c);
  const bg = street();
  const t0 = performance.now();
  const frame = (now: number): void => {
    const t = (now - t0) / 1000;
    g.drawImage(bg, 0, 0);
    for (const [x, y, a] of [
      [110, 120, 0.4],
      [130, 260, -0.3],
      [TARGET.x, TARGET.y, Math.sin(t * 0.7) * 0.3],
    ] as const) {
      g.save();
      g.translate(x, y);
      g.rotate(a);
      drawSurvivor(g, 0.42 * PM);
      g.restore();
    }
    const lock = atk === "walk" ? 0.4 + 0.2 * Math.sin(t * 2) : Math.min(1, (t % 2.4) / 1.6);
    reticle(g, p, TARGET.x, TARGET.y, 0.8 * PM, t, lock);
    edgePanel(g, p, W - 90, 170, t, true);
    if (atk !== "walk") attackPlate(g, p, W - 165, 214, 150, 36, atk, t);
    if (withBanner) banner(g, p, W / 2, 26, t);
    requestAnimationFrame(frame);
  };
  requestAnimationFrame(frame);
  return c;
}

/** All pieces on one sheet (no street), for a close look. */
function sheet(p: Palette): HTMLCanvasElement {
  const c = canvas(560, 300);
  const g = ctx(c);
  const t0 = performance.now();
  const frame = (now: number): void => {
    const t = (now - t0) / 1000;
    g.fillStyle = "#0b0c0f";
    g.fillRect(0, 0, 560, 300);
    banner(g, p, 280, 20, t);
    reticle(g, p, 80, 190, 36, t, 0.6 + 0.4 * Math.sin(t * 2));
    edgePanel(g, p, 250, 140, t, true);
    attackPlate(g, p, 175, 185, 150, 36, "slam", t);
    attackPlate(g, p, 175, 240, 150, 36, "charge", t);
    attackPlate(g, p, 360, 185, 150, 36, "throw", t);
    requestAnimationFrame(frame);
  };
  requestAnimationFrame(frame);
  return c;
}

async function main(): Promise<void> {
  try {
    await Promise.all([document.fonts.load(`700 20px "Oswald"`), document.fonts.load(`600 20px "Oswald"`)]);
  } catch {
    // the fallback face is fine
  }
  for (const p of [P1, P2]) {
    put(`sheet-${p.id}`, sheet(p));
    put(`${p.id}-walk`, scene(p, "walk", true));
    for (const a of ["slam", "charge", "throw"] as const) put(`${p.id}-${a}`, scene(p, a, false));
  }
}

void main();
