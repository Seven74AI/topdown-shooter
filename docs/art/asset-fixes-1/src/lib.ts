/**
 * Asset fixes, round 1 (designer's asset review, 2026-11-24): options for the police barrier
 * (`prop_barrier_a`), the Behemoth's slam warning (`boss_tele_disc`) and the boss effects set
 * (`boss_fx`: crack decal, target skull, edge disc, three attack icons). Drawn with plain canvas code
 * in the game's units (32 px per metre on the street) so the picked option ports straight into
 * `spriteArt.ts` / `bossAtlas.ts`. Built into `../looks.html` by `build.mjs`.
 */
import { drawBehemoth } from "../../../../apps/client/src/render/city/behemothArt";
import { drawSurvivor, drawZombie } from "../../../../apps/client/src/render/city/spriteArt";
import { GROUND } from "../../../../apps/client/src/render/city/palette";

export type G = CanvasRenderingContext2D;
export const TAU = Math.PI * 2;
export const PX = 32; // street px per metre


export function rng(seed: number): () => number {
  let s = seed >>> 0 || 1;
  return () => {
    s = (s * 16807) % 2147483647;
    return s / 2147483647;
  };
}

export function canvas(w: number, h: number): HTMLCanvasElement {
  const c = document.createElement("canvas");
  c.width = w;
  c.height = h;
  return c;
}

export function ctx(c: HTMLCanvasElement): G {
  return c.getContext("2d") as G;
}

/** A black silhouette of a drawing (for soft drop shadows on the ground). */
export function silhouette(src: HTMLCanvasElement, color = "#000"): HTMLCanvasElement {
  const c = canvas(src.width, src.height);
  const g = ctx(c);
  g.drawImage(src, 0, 0);
  g.globalCompositeOperation = "source-in";
  g.fillStyle = color;
  g.fillRect(0, 0, c.width, c.height);
  return c;
}

/** Night asphalt with grain, joints and stains. */
export function asphalt(g: G, w: number, h: number, seed = 3): void {
  g.fillStyle = GROUND.asphalt;
  g.fillRect(0, 0, w, h);
  const r = rng(seed);
  for (let i = 0; i < (w * h) / 40; i++) {
    const v = r();
    g.fillStyle = v < 0.5 ? "rgba(255,255,255,0.025)" : "rgba(0,0,0,0.18)";
    g.fillRect(r() * w, r() * h, 1 + r() * 1.5, 1 + r() * 1.5);
  }
  for (let i = 0; i < 6; i++) {
    const gr = g.createRadialGradient(0, 0, 0, 0, 0, 30 + r() * 60);
    gr.addColorStop(0, "rgba(0,0,0,0.22)");
    gr.addColorStop(1, "rgba(0,0,0,0)");
    g.save();
    g.translate(r() * w, r() * h);
    g.scale(1, 0.6 + r() * 0.6);
    g.fillStyle = gr;
    g.fillRect(-100, -100, 200, 200);
    g.restore();
  }
}

/** The night: darken everything, with optional warm lamp pools. */
export function night(g: G, w: number, h: number, a: number, lamps: readonly [number, number, number][] = []): void {
  const c = canvas(w, h);
  const d = ctx(c);
  d.fillStyle = `rgba(4,7,16,${a})`;
  d.fillRect(0, 0, w, h);
  d.globalCompositeOperation = "destination-out";
  for (const [x, y, r] of lamps) {
    const gr = d.createRadialGradient(x, y, 0, x, y, r);
    gr.addColorStop(0, "rgba(0,0,0,0.85)");
    gr.addColorStop(1, "rgba(0,0,0,0)");
    d.fillStyle = gr;
    d.fillRect(x - r, y - r, 2 * r, 2 * r);
  }
  g.drawImage(c, 0, 0);
  g.save();
  g.globalCompositeOperation = "lighter";
  for (const [x, y, r] of lamps) {
    const gr = g.createRadialGradient(x, y, 0, x, y, r);
    gr.addColorStop(0, "rgba(255,165,85,0.10)");
    gr.addColorStop(1, "rgba(255,165,85,0)");
    g.fillStyle = gr;
    g.fillRect(x - r, y - r, 2 * r, 2 * r);
  }
  g.restore();
}

// ─────────────────────────────── 1. The police barrier ───────────────────────────────
// Frame 384 × 32 px = 12 m × 1 m (the collision box stays the same; only the look changes).

export const BAR_W = 384;
export const BAR_H = 32;

/** B1: a row of police sawhorses. Board on top, splayed A-frame legs and feet on both sides. */
export function barrierSawhorse(g: G, w: number, h: number): void {
  const unit = w / 6;
  const cy = h / 2;
  for (let u = 0; u < 6; u++) {
    const x0 = u * unit;
    // lower cross rails (seen beside the board) and legs
    g.strokeStyle = "#3a3d42";
    g.lineWidth = 2;
    g.beginPath();
    g.moveTo(x0 + 9, 6);
    g.lineTo(x0 + unit - 9, 6);
    g.moveTo(x0 + 9, h - 6);
    g.lineTo(x0 + unit - 9, h - 6);
    g.stroke();
    for (const lx of [x0 + 9, x0 + unit - 9]) {
      g.strokeStyle = "#55595f";
      g.lineWidth = 3;
      g.beginPath();
      g.moveTo(lx, cy);
      g.lineTo(lx - 1, 3);
      g.moveTo(lx, cy);
      g.lineTo(lx - 1, h - 3);
      g.stroke();
      g.fillStyle = "#16171a"; // rubber feet
      g.fillRect(lx - 4, 1, 6, 3);
      g.fillRect(lx - 4, h - 4, 6, 3);
    }
    // the board: underside (thickness) first, then the striped top face
    const bx = x0 + 2;
    const bw = unit - 4;
    g.fillStyle = "#0d0e10";
    g.fillRect(bx, cy - 4, bw, 10);
    g.save();
    g.beginPath();
    g.rect(bx, cy - 6, bw, 9);
    g.clip();
    g.fillStyle = "#e6e2d6";
    g.fillRect(bx, cy - 6, bw, 9);
    g.fillStyle = "#24497e";
    for (let sx = bx - 12; sx < bx + bw; sx += 14) {
      g.beginPath();
      g.moveTo(sx, cy + 3);
      g.lineTo(sx + 7, cy + 3);
      g.lineTo(sx + 16, cy - 6);
      g.lineTo(sx + 9, cy - 6);
      g.closePath();
      g.fill();
    }
    // wear: scuffs and a top highlight
    const r = rng(11 + u);
    g.fillStyle = "rgba(40,30,20,0.35)";
    for (let i = 0; i < 6; i++) g.fillRect(bx + r() * bw, cy - 6 + r() * 9, 2 + r() * 4, 1);
    g.restore();
    g.fillStyle = "rgba(255,255,255,0.35)";
    g.fillRect(bx, cy - 6, bw, 1);
    g.strokeStyle = "#08080a";
    g.lineWidth = 1;
    g.strokeRect(bx + 0.5, cy - 5.5, bw - 1, 11);
  }
  // amber lamp housings at both ends (the game animates their glow)
  for (const lx of [10, w - 10]) {
    g.fillStyle = "#2a2a2a";
    g.fillRect(lx - 4, cy - 8, 8, 6);
    g.fillStyle = "#e39a2c";
    g.beginPath();
    g.arc(lx, cy - 5, 2.6, 0, TAU);
    g.fill();
  }
}

/** B2: water-filled plastic road barriers, red and white, clipped together. */
export function barrierWater(g: G, w: number, h: number): void {
  const n = 8;
  const seg = w / n;
  for (let i = 0; i < n; i++) {
    const x0 = i * seg + 1.5;
    const sw = seg - 3;
    const red = i % 2 === 0;
    const base = red ? [178, 36, 40] : [214, 211, 200];
    const col = (k: number): string => `rgb(${base.map((v) => Math.round(Math.min(255, v * k))).join(",")})`;
    // footprint (lower body): lit north side, shaded south side
    const gr = g.createLinearGradient(0, 2, 0, h - 2);
    gr.addColorStop(0, col(1.08));
    gr.addColorStop(0.45, col(0.92));
    gr.addColorStop(1, col(0.55));
    g.fillStyle = gr;
    roundRect(g, x0, 2, sw, h - 4, 5);
    g.fill();
    // the top ridge
    const tr = g.createLinearGradient(0, 10, 0, 21);
    tr.addColorStop(0, col(1.22));
    tr.addColorStop(1, col(0.95));
    g.fillStyle = tr;
    roundRect(g, x0 + 4, 10, sw - 8, 11, 4);
    g.fill();
    g.fillStyle = "rgba(255,255,255,0.35)";
    g.fillRect(x0 + 6, 10.5, sw - 12, 1.2);
    // fill cap and forklift slot
    g.fillStyle = col(0.7);
    g.beginPath();
    g.arc(x0 + sw * 0.3, 15.5, 2.6, 0, TAU);
    g.fill();
    g.fillStyle = "rgba(0,0,0,0.55)";
    g.fillRect(x0 + sw * 0.55, h - 6, sw * 0.3, 2);
    // grime
    const r = rng(31 + i);
    g.fillStyle = "rgba(30,25,20,0.28)";
    for (let k = 0; k < 10; k++) g.fillRect(x0 + r() * sw, 3 + r() * (h - 6), 1 + r() * 3, 1 + r() * 2);
    g.strokeStyle = "rgba(0,0,0,0.75)";
    g.lineWidth = 1;
    roundRect(g, x0 + 0.5, 2.5, sw - 1, h - 5, 5);
    g.stroke();
  }
  // interlocking knuckles
  for (let i = 1; i < n; i++) {
    const x = i * seg;
    g.fillStyle = "#1b1c1f";
    g.fillRect(x - 3, 8, 6, 16);
    g.fillStyle = "#6b6d70";
    g.beginPath();
    g.arc(x, 16, 2, 0, TAU);
    g.fill();
  }
  for (const lx of [8, w - 8]) {
    g.fillStyle = "#e39a2c";
    g.beginPath();
    g.arc(lx, 15.5, 2.6, 0, TAU);
    g.fill();
  }
}

/** B3: concrete blocks with POLICE LINE tape strung between them. */
export function barrierConcrete(g: G, w: number, h: number): void {
  const blocks = [24, 136, 248, 360];
  // tape first (under the blocks' tops), two strands with a slight sag
  for (const [y0, sag] of [
    [11, 2.5],
    [21, -2],
  ] as const) {
    for (let b = 0; b < blocks.length - 1; b++) {
      const a = blocks[b] as number;
      const c = blocks[b + 1] as number;
      g.save();
      g.strokeStyle = "#e8c228";
      g.lineWidth = 3.4;
      g.beginPath();
      g.moveTo(a, y0);
      g.quadraticCurveTo((a + c) / 2, y0 + sag, c, y0);
      g.stroke();
      g.setLineDash([5, 7]);
      g.strokeStyle = "#141414";
      g.lineWidth = 1.4;
      g.stroke();
      g.restore();
    }
  }
  for (const [i, cx] of blocks.entries()) {
    const bw = 40;
    const x0 = cx - bw / 2;
    const gr = g.createLinearGradient(0, 1, 0, h - 1);
    gr.addColorStop(0, "#9b978e");
    gr.addColorStop(0.5, "#7d7a73");
    gr.addColorStop(1, "#4e4c48");
    g.fillStyle = gr;
    g.fillRect(x0, 1, bw, h - 2);
    g.fillStyle = "#a9a59c"; // the narrow top
    g.fillRect(x0 + 2, 12, bw - 4, 8);
    g.fillStyle = "rgba(255,255,255,0.3)";
    g.fillRect(x0 + 2, 12, bw - 4, 1);
    const r = rng(51 + i);
    for (let k = 0; k < 14; k++) {
      g.fillStyle = r() < 0.5 ? "rgba(0,0,0,0.22)" : "rgba(255,255,255,0.12)";
      g.fillRect(x0 + r() * bw, 1 + r() * (h - 2), 1 + r() * 3, 1 + r() * 2);
    }
    g.fillStyle = "rgba(0,0,0,0.4)"; // a chipped corner
    g.beginPath();
    g.moveTo(x0 + bw, h - 1);
    g.lineTo(x0 + bw - 6, h - 1);
    g.lineTo(x0 + bw, h - 7);
    g.fill();
    g.strokeStyle = "rgba(0,0,0,0.7)";
    g.lineWidth = 1;
    g.strokeRect(x0 + 0.5, 1.5, bw - 1, h - 3);
    if (i === 0 || i === blocks.length - 1) {
      g.fillStyle = "#e39a2c";
      g.beginPath();
      g.arc(cx, 16, 2.6, 0, TAU);
      g.fill();
    }
  }
}

export function roundRect(g: G, x: number, y: number, w: number, h: number, r: number): void {
  g.beginPath();
  g.moveTo(x + r, y);
  g.arcTo(x + w, y, x + w, y + h, r);
  g.arcTo(x + w, y + h, x, y + h, r);
  g.arcTo(x, y + h, x, y, r);
  g.arcTo(x, y, x + w, y, r);
  g.closePath();
}

export type BarrierDraw = (g: G, w: number, h: number) => void;

export function barrierFrame(draw: BarrierDraw): HTMLCanvasElement {
  const c = canvas(BAR_W, BAR_H);
  draw(ctx(c), BAR_W, BAR_H);
  return c;
}

export function imageFrame(url: string): Promise<HTMLCanvasElement> {
  return new Promise((res) => {
    const img = new Image();
    img.onload = () => {
      const c = canvas(img.naturalWidth, img.naturalHeight);
      ctx(c).drawImage(img, 0, 0);
      res(c);
    };
    img.src = url;
  });
}

/** The barrier on a night street at stage 2, beside a zebra crossing (the confusion the designer saw). */
export function barrierScene(frame: HTMLCanvasElement): HTMLCanvasElement {
  const w = 720;
  const h = 300;
  const c = canvas(w, h);
  const g = ctx(c);
  asphalt(g, w, h, 9);
  // lane line and a zebra crossing on the left
  g.fillStyle = GROUND.lane;
  for (let x = 0; x < w; x += 70) g.fillRect(x, 238, 40, 3);
  g.fillStyle = GROUND.zebra;
  for (let y = 10; y < h - 10; y += 26) g.fillRect(24, y, 70, 13);
  // shadow, then the barrier (horizontal), plus a second one turned north-south
  const sh = silhouette(frame);
  const place = (x: number, y: number, rot: number): void => {
    g.save();
    g.translate(x, y);
    g.rotate(rot);
    g.globalAlpha = 0.45;
    g.filter = "blur(3px)";
    g.drawImage(sh, -BAR_W / 2 + 4, -BAR_H / 2 + 6);
    g.filter = "none";
    g.globalAlpha = 1;
    g.drawImage(frame, -BAR_W / 2, -BAR_H / 2);
    g.restore();
  };
  place(400, 130, 0);
  place(660, 150, Math.PI / 2);
  // a survivor and a zombie for scale (0.4 m body radius)
  g.save();
  g.translate(390, 205);
  g.rotate(-Math.PI / 2);
  drawSurvivor(g, 0.42 * PX);
  g.restore();
  g.save();
  g.translate(330, 58);
  g.rotate(Math.PI / 2);
  drawZombie(g, "walker", 0.42 * PX, 1);
  g.restore();
  night(g, w, h, 0.42, [
    [400, 120, 220],
    [120, 60, 120],
  ]);
  // lamp glows (the game animates these)
  g.save();
  g.globalCompositeOperation = "lighter";
  for (const [x, y] of [
    [400 - BAR_W / 2 + 10, 125],
    [400 + BAR_W / 2 - 10, 125],
  ] as const) {
    const gr = g.createRadialGradient(x, y, 0, x, y, 16);
    gr.addColorStop(0, "rgba(255,190,110,0.8)");
    gr.addColorStop(1, "rgba(255,190,110,0)");
    g.fillStyle = gr;
    g.fillRect(x - 16, y - 16, 32, 32);
  }
  g.restore();
  return c;
}

// ─────────────────────────────── 2. The slam warning ───────────────────────────────
// Texture 512 px, disc radius 252 px = the slam radius (4.5 m); hole = the boss's body (2 m).

export const TELE_N = 512;
export const TELE_R = TELE_N / 2 - 4;
export const HOLE_FRAC = 2 / 4.5;

export interface TeleOption {
  readonly id: string;
  /** The baked texture (drawn once). */
  disc(g: G): void;
  /** The live part, per frame: `p` 0→1 over the windup; drawn with "lighter" blending above the darkness. */
  live(g: G, cx: number, cy: number, hole: number, R: number, p: number, lit?: HTMLCanvasElement): void;
  /** Drawn with additive blending (glows over the darkness). */
  readonly additive: boolean;
}

/** S1 "Hot rim": a glow that gathers toward a white-hot rim, with dial ticks; the front races out to it. */
export const S1: TeleOption = {
  id: "S1",
  additive: true,
  disc(g) {
    const c = TELE_N / 2;
    const R = TELE_R;
    const hole = R * HOLE_FRAC;
    g.save();
    g.translate(c, c);
    const gr = g.createRadialGradient(0, 0, hole, 0, 0, R);
    gr.addColorStop(0, "rgba(255,40,30,0.02)");
    gr.addColorStop(0.6, "rgba(255,50,30,0.10)");
    gr.addColorStop(0.92, "rgba(255,70,40,0.32)");
    gr.addColorStop(1, "rgba(255,120,80,0.55)");
    g.fillStyle = gr;
    g.beginPath();
    g.arc(0, 0, R, 0, TAU);
    g.arc(0, 0, hole, 0, TAU, true);
    g.fill();
    // inward bloom of the rim
    for (let i = 0; i < 6; i++) {
      g.strokeStyle = `rgba(255,60,40,${0.1 - i * 0.014})`;
      g.lineWidth = 6;
      g.beginPath();
      g.arc(0, 0, R - 6 - i * 6, 0, TAU);
      g.stroke();
    }
    g.strokeStyle = "rgba(255,90,60,0.9)";
    g.lineWidth = 7;
    g.beginPath();
    g.arc(0, 0, R - 4, 0, TAU);
    g.stroke();
    g.strokeStyle = "rgba(255,236,220,1)";
    g.lineWidth = 2.5;
    g.beginPath();
    g.arc(0, 0, R - 4, 0, TAU);
    g.stroke();
    // dial ticks
    g.strokeStyle = "rgba(255,220,200,0.55)";
    g.lineWidth = 2;
    for (let i = 0; i < 72; i++) {
      const a = (i / 72) * TAU;
      const l = i % 6 === 0 ? 16 : 7;
      g.beginPath();
      g.moveTo(Math.cos(a) * (R - 12), Math.sin(a) * (R - 12));
      g.lineTo(Math.cos(a) * (R - 12 - l), Math.sin(a) * (R - 12 - l));
      g.stroke();
    }
    // soft inner edge at the body
    g.strokeStyle = "rgba(255,80,60,0.35)";
    g.lineWidth = 2;
    g.setLineDash([10, 10]);
    g.beginPath();
    g.arc(0, 0, hole + 4, 0, TAU);
    g.stroke();
    g.restore();
  },
  live(g, cx, cy, hole, R, p) {
    const f = hole + (R - hole) * p;
    const gr = g.createRadialGradient(cx, cy, hole, cx, cy, f);
    gr.addColorStop(0, "rgba(255,40,20,0.05)");
    gr.addColorStop(1, "rgba(255,70,30,0.30)");
    g.fillStyle = gr;
    g.beginPath();
    g.arc(cx, cy, f, 0, TAU);
    g.arc(cx, cy, hole, 0, TAU, true);
    g.fill();
    glowRing(g, cx, cy, f, 1);
  },
};

/** A bright ring with a red bloom (several strokes: works with Phaser Graphics too). */
export function glowRing(g: G, cx: number, cy: number, r: number, k: number): void {
  for (const [lw, col] of [
    [18, `rgba(255,40,30,${0.12 * k})`],
    [10, `rgba(255,60,40,${0.25 * k})`],
    [5, `rgba(255,120,80,${0.6 * k})`],
    [2, `rgba(255,240,225,${0.95 * k})`],
  ] as const) {
    g.strokeStyle = col;
    g.lineWidth = lw;
    g.beginPath();
    g.arc(cx, cy, r, 0, TAU);
    g.stroke();
  }
}

/** S2 "Shockwave": rings that tighten toward the rim like a ripple about to break; each flares as the front passes. */
export const S2_RINGS = [0.52, 0.62, 0.71, 0.79, 0.86, 0.92, 0.97];
export const S2: TeleOption = {
  id: "S2",
  additive: true,
  disc(g) {
    const c = TELE_N / 2;
    const R = TELE_R;
    const hole = R * HOLE_FRAC;
    g.save();
    g.translate(c, c);
    const gr = g.createRadialGradient(0, 0, hole, 0, 0, R);
    gr.addColorStop(0, "rgba(255,30,60,0.03)");
    gr.addColorStop(1, "rgba(255,40,50,0.22)");
    g.fillStyle = gr;
    g.beginPath();
    g.arc(0, 0, R, 0, TAU);
    g.arc(0, 0, hole, 0, TAU, true);
    g.fill();
    for (const [i, k] of S2_RINGS.entries()) {
      const a = 0.18 + (i / S2_RINGS.length) * 0.5;
      g.strokeStyle = `rgba(255,70,70,${a * 0.5})`;
      g.lineWidth = 7;
      g.beginPath();
      g.arc(0, 0, R * k, 0, TAU);
      g.stroke();
      g.strokeStyle = `rgba(255,200,200,${a})`;
      g.lineWidth = 1.6;
      g.stroke();
    }
    glowRing(g, 0, 0, R - 5, 1);
    g.restore();
  },
  live(g, cx, cy, hole, R, p) {
    const f = hole + (R - hole) * p;
    for (const k of S2_RINGS) {
      const d = Math.abs(R * k - f);
      if (d < 40) glowRing(g, cx, cy, R * k, (1 - d / 40) * 0.8);
    }
    const gr = g.createRadialGradient(cx, cy, hole, cx, cy, f);
    gr.addColorStop(0, "rgba(255,30,40,0)");
    gr.addColorStop(1, "rgba(255,40,40,0.22)");
    g.fillStyle = gr;
    g.beginPath();
    g.arc(cx, cy, f, 0, TAU);
    g.arc(cx, cy, hole, 0, TAU, true);
    g.fill();
  },
};

/** The crack network of S3 (shared by the dim baked disc and the lit copy the front reveals). */
export function moltenCracks(g: G, R: number, hole: number, lit: boolean): void {
  g.save();
  g.beginPath();
  g.arc(0, 0, R - 8, 0, TAU);
  g.clip();
  const r = rng(77);
  const paths: [number, number][][] = [];
  for (let i = 0; i < 22; i++) {
    let a = (i / 22) * TAU + r() * 0.2;
    let d = hole * (0.98 + r() * 0.05);
    const pts: [number, number][] = [[Math.cos(a) * d, Math.sin(a) * d]];
    const end = R * (0.8 + r() * 0.18);
    while (d < end) {
      d += 14 + r() * 16;
      a += (r() - 0.5) * 0.22;
      pts.push([Math.cos(a) * d, Math.sin(a) * d]);
      if (r() < 0.12) {
        // a short branch
        const b = a + (r() < 0.5 ? -0.5 : 0.5);
        paths.push([
          [Math.cos(a) * d, Math.sin(a) * d],
          [Math.cos(b) * (d + 26), Math.sin(b) * (d + 26)],
          [Math.cos(b + 0.1) * (d + 46), Math.sin(b + 0.1) * (d + 46)],
        ]);
      }
    }
    paths.push(pts);
  }
  // a broken ring of cross cracks
  for (let i = 0; i < 9; i++) {
    const a0 = r() * TAU;
    const rr = hole + (R - hole) * (0.35 + r() * 0.4);
    const pts: [number, number][] = [];
    for (let k = 0; k < 6; k++) {
      const a = a0 + k * 0.06;
      const q = rr + (r() - 0.5) * 8;
      pts.push([Math.cos(a) * q, Math.sin(a) * q]);
    }
    paths.push(pts);
  }
  const passes: [number, string][] = lit
    ? [
        [11, "rgba(255,40,10,0.22)"],
        [6, "rgba(255,100,30,0.55)"],
        [2.4, "rgba(255,225,150,1)"],
      ]
    : [
        [6, "rgba(255,40,20,0.10)"],
        [2.2, "rgba(255,80,40,0.35)"],
      ];
  g.lineCap = "round";
  g.lineJoin = "round";
  for (const [lw, col] of passes) {
    g.strokeStyle = col;
    g.lineWidth = lw;
    for (const p of paths) {
      g.beginPath();
      p.forEach(([x, y], i) => (i ? g.lineTo(x, y) : g.moveTo(x, y)));
      g.stroke();
    }
  }
  g.restore();
}

/** S3 "Molten cracks": the street splits under the boss; glowing cracks run out to a burning rim. */
export const S3: TeleOption = {
  id: "S3",
  additive: true,
  disc(g) {
    const c = TELE_N / 2;
    const R = TELE_R;
    const hole = R * HOLE_FRAC;
    g.save();
    g.translate(c, c);
    const gr = g.createRadialGradient(0, 0, hole, 0, 0, R);
    gr.addColorStop(0, "rgba(255,50,20,0.04)");
    gr.addColorStop(1, "rgba(255,60,20,0.14)");
    g.fillStyle = gr;
    g.beginPath();
    g.arc(0, 0, R, 0, TAU);
    g.arc(0, 0, hole, 0, TAU, true);
    g.fill();
    moltenCracks(g, R, hole, false);
    for (const [lw, col] of [
      [14, "rgba(255,60,10,0.18)"],
      [6, "rgba(255,110,40,0.6)"],
      [2.5, "rgba(255,225,170,0.95)"],
    ] as const) {
      g.strokeStyle = col;
      g.lineWidth = lw;
      g.beginPath();
      g.arc(0, 0, R - 6, 0, TAU);
      g.stroke();
    }
    g.restore();
  },
  live(g, cx, cy, hole, R, p, lit) {
    if (!lit) return;
    const f = hole + (R - hole) * p;
    g.save();
    g.beginPath();
    g.arc(cx, cy, f, 0, TAU);
    g.clip();
    g.drawImage(lit, cx - R, cy - R, 2 * R, 2 * R);
    g.restore();
    const gr = g.createRadialGradient(cx, cy, Math.max(hole, f - 30), cx, cy, f);
    gr.addColorStop(0, "rgba(255,90,30,0)");
    gr.addColorStop(1, "rgba(255,110,40,0.35)");
    g.fillStyle = gr;
    g.beginPath();
    g.arc(cx, cy, f, 0, TAU);
    g.arc(cx, cy, Math.max(hole, f - 30), 0, TAU, true);
    g.fill();
  },
};

/** Today's look, for comparison (the baked texture is the real one; the fill copies BossView). */
export const CURRENT_TELE: TeleOption = {
  id: "now",
  additive: false,
  disc() {},
  live(g, cx, cy, hole, R, p) {
    const outer = R * p; // BossView: progress × radius, from the body's edge
    if (outer <= hole) return;
    const w = outer - hole;
    g.strokeStyle = "rgba(255,40,40,0.38)";
    g.lineWidth = w;
    g.beginPath();
    g.arc(cx, cy, hole + w / 2, 0, TAU);
    g.stroke();
  },
};

export function teleTexture(o: TeleOption): HTMLCanvasElement {
  const c = canvas(TELE_N, TELE_N);
  o.disc(ctx(c));
  return c;
}

/** S3's lit crack copy (the windup front reveals it). */
export function s3Lit(): HTMLCanvasElement {
  const c = canvas(TELE_N, TELE_N);
  const g = ctx(c);
  g.translate(TELE_N / 2, TELE_N / 2);
  moltenCracks(g, TELE_R, TELE_R * HOLE_FRAC, true);
  return c;
}

// ─────────────────────────────── 3. Boss effects ───────────────────────────────
// Skull 64 px (over the target), edge disc 72 px, icons 48 px, crack decal 256 px = 9 m.

export interface FxSet {
  readonly id: string;
  skull(g: G, s: number): void;
  disc(g: G, s: number): void;
  slam(g: G, s: number): void;
  charge(g: G, s: number): void;
  throw(g: G, s: number): void;
}

/** A shaded bone skull (unit: s = half size), facing the viewer. */
export function boneSkull(g: G, s: number, bone = "#e9e2cf", shade = "#9c917a", hole = "#120707"): void {
  g.save();
  g.scale(s, s);
  g.lineJoin = "round";
  // cranium + cheeks
  const gr = g.createRadialGradient(-0.12, -0.3, 0.05, 0, -0.1, 0.62);
  gr.addColorStop(0, bone);
  gr.addColorStop(1, shade);
  g.fillStyle = gr;
  g.beginPath();
  g.moveTo(-0.46, -0.08);
  g.bezierCurveTo(-0.5, -0.62, 0.5, -0.62, 0.46, -0.08);
  g.bezierCurveTo(0.45, 0.12, 0.34, 0.2, 0.3, 0.28);
  g.lineTo(-0.3, 0.28);
  g.bezierCurveTo(-0.34, 0.2, -0.45, 0.12, -0.46, -0.08);
  g.fill();
  // jaw with teeth
  g.fillStyle = shade;
  roundRect(g, -0.24, 0.24, 0.48, 0.24, 0.07);
  g.fill();
  g.fillStyle = bone;
  for (let i = 0; i < 5; i++) g.fillRect(-0.21 + i * 0.087, 0.27, 0.065, 0.12);
  // eye sockets and nose
  g.fillStyle = hole;
  for (const sx of [-1, 1]) {
    g.beginPath();
    g.ellipse(sx * 0.17, -0.06, 0.13, 0.11, sx * 0.25, 0, TAU);
    g.fill();
  }
  g.beginPath();
  g.moveTo(0, 0.07);
  g.lineTo(-0.05, 0.18);
  g.lineTo(0.05, 0.18);
  g.closePath();
  g.fill();
  // a crack
  g.strokeStyle = hole;
  g.lineWidth = 0.025;
  g.beginPath();
  g.moveTo(0.08, -0.48);
  g.lineTo(0.13, -0.36);
  g.lineTo(0.08, -0.28);
  g.lineTo(0.14, -0.2);
  g.stroke();
  // outline
  g.strokeStyle = "rgba(10,4,4,0.9)";
  g.lineWidth = 0.04;
  g.beginPath();
  g.moveTo(-0.46, -0.08);
  g.bezierCurveTo(-0.5, -0.62, 0.5, -0.62, 0.46, -0.08);
  g.bezierCurveTo(0.45, 0.12, 0.34, 0.2, 0.3, 0.28);
  g.lineTo(-0.3, 0.28);
  g.bezierCurveTo(-0.34, 0.2, -0.45, 0.12, -0.46, -0.08);
  g.stroke();
  g.restore();
}

/** A ragged blood splat disc. */
export function splat(g: G, s: number, col: string, seed: number): void {
  const r = rng(seed);
  g.fillStyle = col;
  g.beginPath();
  const n = 26;
  for (let i = 0; i <= n; i++) {
    const a = (i / n) * TAU;
    const q = s * (0.82 + r() * 0.14);
    if (i === 0) g.moveTo(Math.cos(a) * q, Math.sin(a) * q);
    else g.lineTo(Math.cos(a) * q, Math.sin(a) * q);
  }
  g.fill();
  for (let i = 0; i < 6; i++) {
    const a = r() * TAU;
    const q = s * (0.88 + r() * 0.08);
    g.beginPath();
    g.arc(Math.cos(a) * q, Math.sin(a) * q, s * (0.04 + r() * 0.05), 0, TAU);
    g.fill();
  }
}

/** A fist seen from the front, knuckles down (unit s = half icon size), centred at (0, y). */
export function fist(g: G, s: number, y: number, col: string, line: string): void {
  g.fillStyle = col;
  g.fillRect(-s * 0.2, y - s * 0.75, s * 0.4, s * 0.4); // wrist
  roundRect(g, -s * 0.36, y - s * 0.4, s * 0.72, s * 0.5, s * 0.12);
  g.fill();
  for (let i = 0; i < 4; i++) {
    g.beginPath();
    g.arc(-s * 0.27 + i * s * 0.18, y + s * 0.1, s * 0.095, 0, TAU);
    g.fill();
  }
  g.strokeStyle = line;
  g.lineWidth = s * 0.05;
  g.lineCap = "round";
  for (let i = 1; i < 4; i++) {
    g.beginPath();
    g.moveTo(-s * 0.36 + i * s * 0.18, y - s * 0.06);
    g.lineTo(-s * 0.36 + i * s * 0.18, y + s * 0.14);
    g.stroke();
  }
  g.beginPath(); // thumb across the fingers
  g.moveTo(-s * 0.3, y - s * 0.16);
  g.quadraticCurveTo(-s * 0.05, y - s * 0.02, s * 0.14, y - s * 0.16);
  g.stroke();
}

/** Rough stroke (hand-drawn wobble) along a polyline. */
export function rough(g: G, pts: readonly [number, number][], seed: number, j: number): void {
  const r = rng(seed);
  g.beginPath();
  pts.forEach(([x, y], i) => {
    const jx = x + (r() - 0.5) * j;
    const jy = y + (r() - 0.5) * j;
    if (i) g.lineTo(jx, jy);
    else g.moveTo(jx, jy);
  });
}

/** Set A "Grit": bone, blood and rough strokes, like the rest of Dead City. */
export const SET_A: FxSet = {
  id: "A",
  skull(g, s) {
    splat(g, s * 0.98, "#7c0d10", 4);
    splat(g, s * 0.84, "#b3161b", 5);
    boneSkull(g, s * 1.12);
  },
  disc(g, s) {
    const gr = g.createRadialGradient(-s * 0.3, -s * 0.3, s * 0.1, 0, 0, s);
    gr.addColorStop(0, "#3a3532");
    gr.addColorStop(1, "#151312");
    g.fillStyle = gr;
    g.beginPath();
    g.arc(0, 0, s * 0.94, 0, TAU);
    g.fill();
    splat(g, s * 0.76, "#a8151a", 8);
    g.strokeStyle = "#c9c1ad";
    g.lineWidth = s * 0.06;
    g.beginPath();
    g.arc(0, 0, s * 0.9, 0, TAU);
    g.stroke();
    boneSkull(g, s * 0.82);
  },
  slam(g, s) {
    // a fist driving down into cracking ground
    g.strokeStyle = "#e9e2cf";
    g.lineWidth = s * 0.08;
    g.lineCap = "round";
    for (const [i, [x0, y0, x1, y1]] of [
      [-0.45, 0.42, -0.8, 0.25],
      [0.45, 0.42, 0.8, 0.25],
      [-0.35, 0.6, -0.7, 0.8],
      [0.35, 0.6, 0.7, 0.8],
    ].entries()) {
      rough(g, [[x0 * s, y0 * s], [x1 * s, y1 * s]], 20 + i, s * 0.04);
      g.stroke();
    }
    g.strokeStyle = "#e9e2cf";
    rough(g, [[-s * 0.85, s * 0.56], [-s * 0.3, s * 0.52], [0, s * 0.66], [s * 0.3, s * 0.52], [s * 0.85, s * 0.56]], 30, s * 0.04);
    g.stroke();
    fist(g, s, s * 0.12, "#e9e2cf", "#1a1210");
  },
  charge(g, s) {
    // a horned head-down rush with speed streaks
    g.strokeStyle = "#e9e2cf";
    g.lineCap = "round";
    g.lineWidth = s * 0.08;
    for (const [i, y] of [-0.32, 0, 0.32].entries()) {
      rough(g, [[-s * 0.9, s * y], [-s * 0.35 - Math.abs(y) * s * 0.3, s * y]], 40 + i, s * 0.03);
      g.stroke();
    }
    g.fillStyle = "#e9e2cf";
    g.beginPath();
    g.moveTo(s * 0.85, 0);
    g.lineTo(-s * 0.15, -s * 0.62);
    g.lineTo(s * 0.05, 0);
    g.lineTo(-s * 0.15, s * 0.62);
    g.closePath();
    g.fill();
    g.beginPath();
    g.moveTo(s * 0.35, 0);
    g.lineTo(-s * 0.35, -s * 0.36);
    g.lineTo(-s * 0.22, 0);
    g.lineTo(-s * 0.35, s * 0.36);
    g.closePath();
    g.fill();
  },
  throw(g, s) {
    // a chunk of concrete with bent rebar and a motion arc
    g.strokeStyle = "rgba(233,226,207,0.8)";
    g.lineWidth = s * 0.07;
    g.lineCap = "round";
    g.beginPath();
    g.arc(-s * 0.1, s * 0.45, s * 0.85, -2.6, -1.9);
    g.stroke();
    g.fillStyle = "#e9e2cf";
    g.beginPath();
    g.moveTo(-s * 0.3, -s * 0.35);
    g.lineTo(s * 0.35, -s * 0.55);
    g.lineTo(s * 0.72, -s * 0.05);
    g.lineTo(s * 0.45, s * 0.5);
    g.lineTo(-s * 0.2, s * 0.55);
    g.lineTo(-s * 0.5, s * 0.1);
    g.closePath();
    g.fill();
    g.fillStyle = "#9c917a";
    g.beginPath();
    g.moveTo(s * 0.72, -s * 0.05);
    g.lineTo(s * 0.45, s * 0.5);
    g.lineTo(s * 0.1, s * 0.2);
    g.closePath();
    g.fill();
    // chips flying off and a crack across the chunk
    g.strokeStyle = "#1a1210";
    g.lineWidth = s * 0.05;
    g.beginPath();
    g.moveTo(-s * 0.1, -s * 0.4);
    g.lineTo(s * 0.05, -s * 0.05);
    g.lineTo(-s * 0.05, s * 0.3);
    g.stroke();
    g.fillStyle = "#e9e2cf";
    for (const [x, y, k] of [
      [-0.72, -0.5, 0.09],
      [-0.85, -0.15, 0.06],
      [-0.62, -0.75, 0.05],
    ] as const) g.fillRect(s * x, s * y, s * k * 1.4, s * k);
  },
};

/** Glow helper: draws `fn` several times with growing shadow blur (neon). */
export function neon(g: G, color: string, fn: () => void, blur: number): void {
  g.save();
  g.shadowColor = color;
  for (const b of [blur, blur * 0.5, blur * 0.2]) {
    g.shadowBlur = b;
    fn();
  }
  g.restore();
}

/** A bold skull silhouette (for the neon set). */
export function flatSkull(g: G, s: number, fill: string): void {
  g.save();
  g.scale(s, s);
  g.fillStyle = fill;
  g.beginPath();
  g.arc(0, -0.08, 0.4, 0, TAU);
  g.fill();
  roundRect(g, -0.22, 0.1, 0.44, 0.3, 0.06);
  g.fill();
  g.globalCompositeOperation = "destination-out";
  for (const sx of [-1, 1]) {
    g.beginPath();
    g.ellipse(sx * 0.16, -0.06, 0.11, 0.1, 0, 0, TAU);
    g.fill();
  }
  g.beginPath();
  g.moveTo(0, 0.07);
  g.lineTo(-0.045, 0.17);
  g.lineTo(0.045, 0.17);
  g.fill();
  for (let i = 1; i < 4; i++) g.fillRect(-0.22 + i * 0.11 - 0.015, 0.26, 0.03, 0.14);
  g.restore();
}

/** Set B "Neon": glowing red-white signs that match the glowing slam warning. */
export const SET_B: FxSet = {
  id: "B",
  skull(g, s) {
    neon(g, "rgba(255,40,40,1)", () => flatSkull(g, s * 1.15, "#ffe3dc"), s * 0.5);
  },
  disc(g, s) {
    g.fillStyle = "rgba(20,6,8,0.92)";
    g.beginPath();
    g.arc(0, 0, s * 0.9, 0, TAU);
    g.fill();
    neon(
      g,
      "rgba(255,30,30,1)",
      () => {
        g.strokeStyle = "#ff5a50";
        g.lineWidth = s * 0.09;
        g.beginPath();
        g.arc(0, 0, s * 0.78, 0, TAU);
        g.stroke();
      },
      s * 0.4,
    );
    neon(g, "rgba(255,40,40,1)", () => flatSkull(g, s * 0.85, "#ffe3dc"), s * 0.3);
  },
  slam(g, s) {
    neon(
      g,
      "rgba(255,40,40,1)",
      () => {
        g.strokeStyle = "#ffe3dc";
        g.lineWidth = s * 0.1;
        for (const r of [0.22, 0.5, 0.78]) {
          g.beginPath();
          g.arc(0, 0, s * r, 0, TAU);
          g.stroke();
        }
      },
      s * 0.45,
    );
  },
  charge(g, s) {
    neon(
      g,
      "rgba(255,40,40,1)",
      () => {
        g.strokeStyle = "#ffe3dc";
        g.lineWidth = s * 0.14;
        g.lineCap = "round";
        g.lineJoin = "round";
        for (const dx of [-0.45, 0, 0.45]) {
          g.beginPath();
          g.moveTo(s * (dx - 0.22), -s * 0.45);
          g.lineTo(s * (dx + 0.2), 0);
          g.lineTo(s * (dx - 0.22), s * 0.45);
          g.stroke();
        }
      },
      s * 0.45,
    );
  },
  throw(g, s) {
    neon(
      g,
      "rgba(255,40,40,1)",
      () => {
        g.strokeStyle = "#ffe3dc";
        g.lineWidth = s * 0.1;
        g.lineJoin = "round";
        g.beginPath();
        g.moveTo(-s * 0.15, -s * 0.2);
        g.lineTo(s * 0.4, -s * 0.38);
        g.lineTo(s * 0.62, s * 0.1);
        g.lineTo(s * 0.3, s * 0.48);
        g.lineTo(-s * 0.25, s * 0.38);
        g.closePath();
        g.stroke();
        g.setLineDash([s * 0.12, s * 0.12]);
        g.beginPath();
        g.arc(-s * 0.2, s * 0.6, s * 0.75, -2.7, -1.75);
        g.stroke();
      },
      s * 0.45,
    );
  },
};

/** Worn enamel (scratches) over whatever is drawn in the circle/shape. */
export function scratches(g: G, s: number, seed: number): void {
  const r = rng(seed);
  g.strokeStyle = "rgba(255,255,255,0.28)";
  g.lineWidth = Math.max(0.6, s * 0.02);
  for (let i = 0; i < 9; i++) {
    const x = (r() - 0.5) * s * 1.4;
    const y = (r() - 0.5) * s * 1.4;
    const a = r() * TAU;
    const l = s * (0.1 + r() * 0.3);
    g.beginPath();
    g.moveTo(x, y);
    g.lineTo(x + Math.cos(a) * l, y + Math.sin(a) * l);
    g.stroke();
  }
}

/** Set C "Danger sign": worn red-and-white enamel road signs with black pictograms. */
export const SET_C: FxSet = {
  id: "C",
  skull(g, s) {
    // a warning triangle
    const t = (k: number): void => {
      g.beginPath();
      g.moveTo(0, -s * k);
      g.lineTo(s * k * 0.98, s * k * 0.72);
      g.lineTo(-s * k * 0.98, s * k * 0.72);
      g.closePath();
    };
    g.lineJoin = "round";
    g.fillStyle = "#c81e24";
    t(0.98);
    g.fill();
    g.fillStyle = "#f1ece0";
    t(0.7);
    g.fill();
    g.save();
    t(0.98);
    g.clip();
    scratches(g, s, 9);
    g.restore();
    g.save();
    g.translate(0, s * 0.18);
    flatSkull(g, s * 0.62, "#141010");
    g.restore();
    g.fillStyle = "#8a8a8a"; // bolt
    g.beginPath();
    g.arc(0, -s * 0.78, s * 0.05, 0, TAU);
    g.fill();
  },
  disc(g, s) {
    g.fillStyle = "#c81e24";
    g.beginPath();
    g.arc(0, 0, s * 0.94, 0, TAU);
    g.fill();
    g.fillStyle = "#f1ece0";
    g.beginPath();
    g.arc(0, 0, s * 0.7, 0, TAU);
    g.fill();
    flatSkull(g, s * 0.92, "#141010");
    g.save();
    g.beginPath();
    g.arc(0, 0, s * 0.94, 0, TAU);
    g.clip();
    scratches(g, s, 12);
    g.restore();
  },
  slam(g, s) {
    signPlate(g, s);
    fist(g, s * 0.8, -s * 0.05, "#141010", "#f1ece0");
    g.strokeStyle = "#141010";
    g.lineWidth = s * 0.08;
    g.beginPath();
    g.moveTo(-s * 0.6, s * 0.35);
    g.lineTo(-s * 0.2, s * 0.25);
    g.lineTo(0, s * 0.42);
    g.lineTo(s * 0.2, s * 0.25);
    g.lineTo(s * 0.6, s * 0.35);
    g.stroke();
  },
  charge(g, s) {
    signPlate(g, s);
    g.fillStyle = "#141010";
    for (const dx of [-0.32, 0.18]) {
      g.beginPath();
      g.moveTo(s * (dx + 0.32), 0);
      g.lineTo(s * (dx - 0.1), -s * 0.42);
      g.lineTo(s * (dx - 0.1), s * 0.42);
      g.closePath();
      g.fill();
    }
  },
  throw(g, s) {
    signPlate(g, s);
    g.fillStyle = "#141010";
    g.beginPath();
    g.moveTo(-s * 0.05, -s * 0.12);
    g.lineTo(s * 0.35, -s * 0.3);
    g.lineTo(s * 0.5, s * 0.08);
    g.lineTo(s * 0.25, s * 0.38);
    g.lineTo(-s * 0.15, s * 0.3);
    g.closePath();
    g.fill();
    g.strokeStyle = "#141010";
    g.lineWidth = s * 0.07;
    g.setLineDash([s * 0.1, s * 0.09]);
    g.beginPath();
    g.arc(-s * 0.1, s * 0.5, s * 0.55, -2.9, -1.9);
    g.stroke();
  },
};

/** The round white sign behind set C's icons. */
export function signPlate(g: G, s: number): void {
  g.fillStyle = "#f1ece0";
  g.beginPath();
  g.arc(0, 0, s * 0.9, 0, TAU);
  g.fill();
  g.strokeStyle = "#141010";
  g.lineWidth = s * 0.06;
  g.stroke();
}

/** K1 "Crater": broken asphalt plates pushed up around a dark pit, cracks, rubble and dust. `embers`: K2. */
export function crater(g: G, s: number, embers: boolean): void {
  const r = rng(13);
  // dust ring
  const dust = g.createRadialGradient(0, 0, s * 0.3, 0, 0, s * 0.95);
  dust.addColorStop(0, "rgba(140,130,115,0.16)");
  dust.addColorStop(1, "rgba(140,130,115,0)");
  g.fillStyle = dust;
  g.beginPath();
  g.arc(0, 0, s * 0.95, 0, TAU);
  g.fill();
  // radial cracks
  const cracks: [number, number][][] = [];
  for (let i = 0; i < 16; i++) {
    let a = (i / 16) * TAU + r() * 0.3;
    let d = s * 0.28;
    const pts: [number, number][] = [[Math.cos(a) * d, Math.sin(a) * d]];
    const end = s * (0.55 + r() * 0.4);
    while (d < end) {
      d += s * 0.07;
      a += (r() - 0.5) * 0.35;
      pts.push([Math.cos(a) * d, Math.sin(a) * d]);
    }
    cracks.push(pts);
  }
  g.lineCap = "round";
  g.lineJoin = "round";
  for (const [i, p] of cracks.entries()) {
    g.strokeStyle = "rgba(255,255,255,0.06)"; // lit lip
    g.lineWidth = 4;
    g.beginPath();
    p.forEach(([x, y], k) => (k ? g.lineTo(x - 1, y - 1) : g.moveTo(x - 1, y - 1)));
    g.stroke();
    g.strokeStyle = "rgba(6,5,5,0.95)";
    g.lineWidth = 2.6 - (i % 3) * 0.5;
    g.beginPath();
    p.forEach(([x, y], k) => (k ? g.lineTo(x, y) : g.moveTo(x, y)));
    g.stroke();
  }
  // the pit
  const pit = g.createRadialGradient(0, 0, 0, 0, 0, s * 0.3);
  pit.addColorStop(0, "rgba(4,3,3,0.95)");
  pit.addColorStop(0.7, "rgba(10,9,8,0.85)");
  pit.addColorStop(1, "rgba(10,9,8,0)");
  g.fillStyle = pit;
  g.beginPath();
  g.arc(0, 0, s * 0.3, 0, TAU);
  g.fill();
  // tilted plates around the pit
  const cuts: number[] = [];
  for (let a = r() * 0.5; a < TAU; a += 0.35 + r() * 0.75) cuts.push(a);
  for (let i = 0; i < cuts.length; i++) {
    if (r() < 0.2) continue; // a missing plate: a deeper hole
    const a0 = (cuts[i] as number) + 0.04;
    const a1 = (i + 1 < cuts.length ? (cuts[i + 1] as number) : (cuts[0] as number) + TAU) - 0.04;
    const r0 = s * (0.1 + r() * 0.08);
    const r1 = s * (0.26 + r() * 0.16);
    const mid = (a0 + a1) / 2 + (r() - 0.5) * 0.2;
    const pts: [number, number][] = [
      [Math.cos(a0) * r0, Math.sin(a0) * r0],
      [Math.cos(a0 + 0.05) * r1 * (0.85 + r() * 0.2), Math.sin(a0 + 0.05) * r1 * (0.85 + r() * 0.2)],
      [Math.cos(mid) * (r1 + s * 0.05 * r()), Math.sin(mid) * (r1 + s * 0.05 * r())],
      [Math.cos(a1 - 0.05) * r1 * (0.85 + r() * 0.2), Math.sin(a1 - 0.05) * r1 * (0.85 + r() * 0.2)],
      [Math.cos(a1) * r0 * (0.8 + r() * 0.4), Math.sin(a1) * r0 * (0.8 + r() * 0.4)],
    ];
    // shadow under the raised edge
    g.fillStyle = "rgba(0,0,0,0.5)";
    g.beginPath();
    pts.forEach(([x, y], k) => (k ? g.lineTo(x + 3, y + 4) : g.moveTo(x + 3, y + 4)));
    g.fill();
    const lit = Math.cos((a0 + a1) / 2 + 2.2) * 0.5 + 0.5; // faces toward the top-left light are brighter
    const v = Math.round(26 + lit * 30 + r() * 8);
    g.fillStyle = `rgb(${v},${v},${v + 3})`;
    g.beginPath();
    pts.forEach(([x, y], k) => (k ? g.lineTo(x, y) : g.moveTo(x, y)));
    g.closePath();
    g.fill();
    g.strokeStyle = "rgba(255,255,255,0.12)";
    g.lineWidth = 1.2;
    g.stroke();
  }
  // rubble
  for (let i = 0; i < 40; i++) {
    const a = r() * TAU;
    const d = s * (0.3 + r() * 0.5);
    const v = Math.round(40 + r() * 40);
    g.fillStyle = `rgb(${v},${v - 2},${v - 4})`;
    g.fillRect(Math.cos(a) * d, Math.sin(a) * d, 1.5 + r() * 3.5, 1.5 + r() * 3);
  }
  if (embers) {
    g.save();
    g.globalCompositeOperation = "lighter";
    for (const p of cracks) {
      const short = p.slice(0, 4);
      for (const [lw, col] of [
        [6, "rgba(255,70,20,0.18)"],
        [2.4, "rgba(255,140,50,0.55)"],
        [1, "rgba(255,220,150,0.8)"],
      ] as const) {
        g.strokeStyle = col;
        g.lineWidth = lw;
        g.beginPath();
        short.forEach(([x, y], k) => (k ? g.lineTo(x, y) : g.moveTo(x, y)));
        g.stroke();
      }
    }
    const glow = g.createRadialGradient(0, 0, 0, 0, 0, s * 0.22);
    glow.addColorStop(0, "rgba(255,90,30,0.45)");
    glow.addColorStop(1, "rgba(255,90,30,0)");
    g.fillStyle = glow;
    g.beginPath();
    g.arc(0, 0, s * 0.22, 0, TAU);
    g.fill();
    g.restore();
  }
}

// ─────────────────────────────── page wiring ───────────────────────────────

export function fxIcon(draw: (g: G, s: number) => void, px: number, scale: number, bg = "#23292f"): HTMLCanvasElement {
  const c = canvas(px * scale, px * scale);
  const g = ctx(c);
  g.fillStyle = bg;
  g.fillRect(0, 0, c.width, c.height);
  g.translate(c.width / 2, c.height / 2);
  g.scale(scale, scale);
  draw(g, px / 2);
  return c;
}

export function put(id: string, node: Node): void {
  const el = document.getElementById(id);
  if (el) el.append(node);
}

/** The slam on a dark street: windup 1.6 s, impact flash, the crater, then again. */
export function slamScene(o: TeleOption, fx: FxSet | null, cr: boolean | null, disc: HTMLCanvasElement | null): HTMLCanvasElement {
  const W = 520;
  const PM = 40; // px per metre in this view
  const c = canvas(W, W);
  const g = ctx(c);
  const R = 4.5 * PM;
  const hole = 2 * PM;
  const cx = W / 2;
  const cy = W / 2;
  const ground = canvas(W, W);
  const gg = ctx(ground);
  asphalt(gg, W, W, 21);
  gg.fillStyle = GROUND.lane;
  for (let y = 0; y < W; y += 60) gg.fillRect(70, y, 3, 34);
  const lit = o.id === "S3" ? s3Lit() : undefined;
  const survivors: [number, number, number][] = [
    [cx + 3.6 * PM, cy - 1.2 * PM, Math.PI],
    [cx - 2.6 * PM, cy + 3.9 * PM, -1.2],
    [cx + 1.2 * PM, cy + 5.4 * PM, -1.9],
  ];
  const T = 2600;
  const t0 = performance.now();
  const frame = (now: number): void => {
    const t = (now - t0) % T;
    const wind = 1600;
    const p = Math.min(1, t / wind);
    const after = t - wind;
    g.drawImage(ground, 0, 0);
    if (cr !== null && after > 0) {
      g.save();
      g.translate(cx, cy);
      g.globalAlpha = Math.min(1, after / 120) * 0.85;
      const s = (9 * PM) / 2;
      crater(g, s, cr);
      g.restore();
    }
    for (const [x, y, a] of survivors) {
      g.save();
      g.translate(x, y);
      g.rotate(a);
      drawSurvivor(g, 0.42 * PM);
      g.restore();
    }
    // the boss (slam pose by progress, the hit pose after)
    g.save();
    g.translate(cx, cy);
    g.rotate(-0.5);
    drawBehemoth(g, PM, 0, after > 0 ? "slamHit" : "slam", after > 0 ? 0 : p, false);
    g.restore();
    night(g, W, W, 0.5, [[cx - 140, cy - 160, 200]]);
    // the warning, above the darkness
    if (after <= 0) {
      g.save();
      if (o.additive) g.globalCompositeOperation = "lighter";
      const a = Math.min(1, t / 300);
      g.globalAlpha = a;
      if (disc) g.drawImage(disc, cx - R * (TELE_N / 2 / TELE_R), cy - R * (TELE_N / 2 / TELE_R), R * 2 * (TELE_N / 2 / TELE_R), R * 2 * (TELE_N / 2 / TELE_R));
      o.live(g, cx, cy, hole, R, p, lit);
      g.restore();
    } else if (after < 260) {
      g.save();
      g.globalCompositeOperation = "lighter";
      const k = 1 - after / 260;
      const gr = g.createRadialGradient(cx, cy, hole * 0.5, cx, cy, R * (1 + (1 - k) * 0.15));
      gr.addColorStop(0, `rgba(255,220,180,${0.0})`);
      gr.addColorStop(0.8, `rgba(255,120,70,${0.35 * k})`);
      gr.addColorStop(1, "rgba(255,80,40,0)");
      g.fillStyle = gr;
      g.fillRect(0, 0, W, W);
      g.restore();
    }
    // the target skull over one survivor
    if (fx) {
      const [x, y] = survivors[0] as [number, number, number];
      g.save();
      g.translate(x, y - 0.95 * PM);
      fx.skull(g, 0.45 * PM);
      g.restore();
    }
    requestAnimationFrame(frame);
  };
  requestAnimationFrame(frame);
  return c;
}
