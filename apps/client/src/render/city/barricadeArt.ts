/**
 * Photoreal group 3, the barricades (approved 2026-11-25, `docs/art/photoreal-decisions.md`): drawn STANDING, from a
 * raised camera (heights × 0.6), with the shadow cast from each picture's own outline. Every barricade has four
 * pictures, one per rotation (front inside / front outside / side, braces east / side, braces west), a corner piece for
 * where two lines meet, and random variants built from scavenged parts (wood), steel-faced with razor wire
 * (reinforced), or welded plates (metal). Ported from the approved proposal page `docs/art/photoreal-3/` (barricadeTakes.ts).
 * Drawn in metres, the frame centred on (0, 0); 1 px = 1/96 m.
 */
import type { Ctx } from "./buildingArt";

/** A scratch canvas: a DOM canvas on the main thread, an OffscreenCanvas in the bake worker (no `document` there). */
function scratchCanvas(w: number, h: number): HTMLCanvasElement {
  if (typeof document !== "undefined") {
    const c = document.createElement("canvas");
    c.width = w;
    c.height = h;
    return c;
  }
  return new OffscreenCanvas(w, h) as unknown as HTMLCanvasElement;
}

const P = 1 / 96;
const TAU = Math.PI * 2;

function rng(seed: number): () => number {
  let s = seed >>> 0;
  return () => {
    s = (s + 0x6d2b79f5) >>> 0;
    let t = s;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
function shade(hex: string, k: number): string {
  const n = parseInt(hex.slice(1), 16);
  const f = (v: number): number => Math.round(Math.max(0, Math.min(255, k >= 0 ? v + (255 - v) * k : v * (1 + k))));
  return `rgb(${f((n >> 16) & 255)},${f((n >> 8) & 255)},${f(n & 255)})`;
}

const WOODS = ["#7d5d3e", "#86663f", "#735437", "#8c6c48", "#6f5235", "#7a6040"] as const;

/** A rough plank (top face) in a local box, grain along x: grain lines, knots, cracks, end grain, worn edges. */
function plank(g: Ctx, x0: number, y0: number, x1: number, y1: number, col: string, seed: number): void {
  const r = rng(seed);
  const w = x1 - x0;
  const h = y1 - y0;
  g.save();
  g.beginPath();
  g.rect(x0, y0, w, h);
  g.clip();
  g.fillStyle = col;
  g.fillRect(x0, y0, w, h);
  // grain
  const lines = Math.max(4, Math.round(h / 0.006));
  for (let i = 0; i < lines; i++) {
    const yy = y0 + (h * (i + r())) / lines;
    g.strokeStyle = r() < 0.5 ? shade(col, -0.25 - r() * 0.2) : shade(col, 0.12 + r() * 0.1);
    g.globalAlpha = 0.35 + r() * 0.35;
    g.lineWidth = (0.5 + r()) * P;
    g.beginPath();
    const amp = 0.002 + r() * 0.003;
    const ph = r() * TAU;
    for (let s = 0; s <= 24; s++) {
      const xx = x0 + (w * s) / 24;
      const v = yy + Math.sin(ph + s * 0.5) * amp;
      if (s === 0) g.moveTo(xx, v);
      else g.lineTo(xx, v);
    }
    g.stroke();
  }
  g.globalAlpha = 1;
  // knots
  const knots = Math.floor(w / 0.35 + r() * 1.5);
  for (let k = 0; k < knots; k++) {
    const kx = x0 + w * (0.1 + r() * 0.8);
    const ky = y0 + h * (0.25 + r() * 0.5);
    const kr = Math.min(h * 0.22, 0.012 + r() * 0.008);
    g.fillStyle = shade(col, -0.45);
    g.beginPath();
    g.ellipse(kx, ky, kr * 1.6, kr, 0, 0, TAU);
    g.fill();
    g.strokeStyle = shade(col, -0.25);
    g.lineWidth = P;
    g.beginPath();
    g.ellipse(kx, ky, kr * 2.6, kr * 1.7, 0, 0, TAU);
    g.stroke();
  }
  // cracks
  for (let k = 0; k < 2; k++) {
    if (r() < 0.4) continue;
    const cx = r() < 0.5 ? x0 : x1;
    const cy = y0 + h * (0.3 + r() * 0.4);
    g.strokeStyle = "rgba(15,10,6,0.8)";
    g.lineWidth = P;
    g.beginPath();
    g.moveTo(cx, cy);
    g.lineTo(cx + (cx === x0 ? 1 : -1) * (0.04 + r() * 0.08), cy + (r() - 0.5) * 0.01);
    g.stroke();
  }
  // end grain (darker ends) and worn top edge
  g.fillStyle = "rgba(20,12,6,0.35)";
  g.fillRect(x0, y0, 0.012, h);
  g.fillRect(x1 - 0.012, y0, 0.012, h);
  g.fillStyle = "rgba(255,236,205,0.28)";
  g.fillRect(x0, y0, w, 1.2 * P);
  g.fillStyle = "rgba(0,0,0,0.3)";
  g.fillRect(x0, y1 - 1.2 * P, w, 1.2 * P);
  g.restore();
  g.strokeStyle = "#0a0806";
  g.lineWidth = 1.4 * P;
  g.strokeRect(x0, y0, w, h);
}

/** A bar from a to b of width wid, drawn as a plank (wood) or a tube (steel). */
function bar(g: Ctx, ax: number, ay: number, bx: number, by: number, wid: number, kind: "wood" | "steel" | "dark", col: string, seed: number): void {
  const l = Math.hypot(bx - ax, by - ay);
  g.save();
  g.translate(ax, ay);
  g.rotate(Math.atan2(by - ay, bx - ax));
  if (kind === "wood") plank(g, 0, -wid / 2, l, wid / 2, col, seed);
  else {
    g.fillStyle = col;
    g.fillRect(0, -wid / 2, l, wid);
    g.fillStyle = "rgba(255,255,255,0.35)";
    g.fillRect(0, -wid / 2 + wid * 0.18, l, wid * 0.22);
    g.fillStyle = "rgba(0,0,0,0.35)";
    g.fillRect(0, wid * 0.2, l, wid * 0.3);
    g.strokeStyle = "#08090b";
    g.lineWidth = 1.2 * P;
    g.strokeRect(0, -wid / 2, l, wid);
  }
  g.restore();
}

function nail(g: Ctx, x: number, y: number): void {
  g.fillStyle = "#26282b";
  g.beginPath();
  g.arc(x, y, 0.0065, 0, TAU);
  g.fill();
  g.fillStyle = "rgba(225,230,238,0.75)";
  g.beginPath();
  g.arc(x - 0.002, y - 0.002, 0.0028, 0, TAU);
  g.fill();
  g.fillStyle = "rgba(120,60,20,0.35)";
  g.beginPath();
  g.arc(x + 0.004, y + 0.005, 0.006, 0, TAU);
  g.fill();
}

function bolt(g: Ctx, x: number, y: number, rr = 0.009): void {
  g.fillStyle = "#3b3f45";
  g.beginPath();
  for (let i = 0; i < 6; i++) {
    const a = (i / 6) * TAU + 0.3;
    if (i === 0) g.moveTo(x + Math.cos(a) * rr, y + Math.sin(a) * rr);
    else g.lineTo(x + Math.cos(a) * rr, y + Math.sin(a) * rr);
  }
  g.closePath();
  g.fill();
  g.strokeStyle = "#0b0c0e";
  g.lineWidth = P;
  g.stroke();
  g.fillStyle = "rgba(230,235,245,0.6)";
  g.beginPath();
  g.arc(x - rr * 0.3, y - rr * 0.3, rr * 0.35, 0, TAU);
  g.fill();
}

/** Soft ground shadow under a part (drawn first). */
function razorCoil(g: Ctx, x0: number, x1: number, y: number, rad: number, seed: number): void {
  const r = rng(seed);
  const step = rad * 1.35;
  const loops: number[] = [];
  for (let x = x0 + rad; x <= x1 - rad + 1e-6; x += step) loops.push(x);
  for (const pass of [0, 1]) {
    for (const cx of loops) {
      const ry = rad * (0.95 + r() * 0.1);
      g.strokeStyle = pass === 0 ? "rgba(5,6,8,0.85)" : "#b9c0c8";
      g.lineWidth = (pass === 0 ? 2.6 : 1.3) * P;
      g.beginPath();
      g.ellipse(cx + (pass === 0 ? 0.003 : 0), y + (pass === 0 ? 0.004 : 0), rad * 1.05, ry, 0.15, 0, TAU);
      g.stroke();
    }
  }
  // barbs: little blades along each loop
  const rb = rng(seed + 9);
  g.strokeStyle = "#d9dee5";
  g.lineWidth = 1.1 * P;
  for (const cx of loops) {
    for (let k = 0; k < 6; k++) {
      const a = (k / 6) * TAU + rb() * 0.6;
      const px = cx + Math.cos(a) * rad * 1.05;
      const py = y + Math.sin(a) * rad;
      const t = a + Math.PI / 2;
      g.beginPath();
      g.moveTo(px - Math.cos(t + 0.6) * 0.008, py - Math.sin(t + 0.6) * 0.008);
      g.lineTo(px + Math.cos(t + 0.6) * 0.008, py + Math.sin(t + 0.6) * 0.008);
      g.moveTo(px - Math.cos(t - 0.6) * 0.008, py - Math.sin(t - 0.6) * 0.008);
      g.lineTo(px + Math.cos(t - 0.6) * 0.008, py + Math.sin(t - 0.6) * 0.008);
      g.stroke();
    }
  }
}

/** Yellow/black hazard stripes in a box, with wear. */
function hazard(g: Ctx, x0: number, y0: number, x1: number, y1: number, seed: number): void {
  const h = y1 - y0;
  g.save();
  g.beginPath();
  g.rect(x0, y0, x1 - x0, h);
  g.clip();
  g.fillStyle = "#d9a924";
  g.fillRect(x0, y0, x1 - x0, h);
  g.fillStyle = "#16171a";
  const sw = 0.045;
  for (let sx = x0 - h; sx < x1; sx += sw * 2) {
    g.beginPath();
    g.moveTo(sx, y1);
    g.lineTo(sx + sw, y1);
    g.lineTo(sx + sw + h, y0);
    g.lineTo(sx + h, y0);
    g.closePath();
    g.fill();
  }
  const r = rng(seed);
  g.fillStyle = "rgba(120,124,130,0.7)";
  for (let i = 0; i < 18; i++) g.fillRect(x0 + r() * (x1 - x0), y0 + r() * h, 0.004 + r() * 0.02, P);
  g.fillStyle = "rgba(110,55,20,0.45)";
  for (let i = 0; i < 6; i++) {
    g.beginPath();
    g.ellipse(x0 + r() * (x1 - x0), y0 + r() * h, 0.006 + r() * 0.012, 0.004 + r() * 0.006, 0, 0, TAU);
    g.fill();
  }
  g.restore();
}

/** A steel plate with rivets, rust streaks and scratches. */
function steelPlate(g: Ctx, x0: number, y0: number, x1: number, y1: number, col: string, seed: number, rivets = true): void {
  const r = rng(seed);
  const w = x1 - x0;
  const h = y1 - y0;
  g.save();
  g.beginPath();
  g.rect(x0, y0, w, h);
  g.clip();
  g.fillStyle = col;
  g.fillRect(x0, y0, w, h);
  for (let i = 0; i < 40; i++) {
    g.fillStyle = r() < 0.5 ? "rgba(255,255,255,0.12)" : "rgba(0,0,0,0.15)";
    g.fillRect(x0 + r() * w, y0 + r() * h, 0.01 + r() * 0.06, P * 0.8);
  }
  for (let i = 0; i < 4; i++) {
    const rx = x0 + r() * w;
    const gr = g.createLinearGradient(rx, y0, rx, y0 + h);
    gr.addColorStop(0, "rgba(130,62,22,0.6)");
    gr.addColorStop(1, "rgba(130,62,22,0)");
    g.fillStyle = gr;
    g.fillRect(rx, y0, 0.008 + r() * 0.012, h * (0.4 + r() * 0.6));
  }
  g.fillStyle = "rgba(255,255,255,0.3)";
  g.fillRect(x0, y0, w, 1.2 * P);
  g.restore();
  g.strokeStyle = "#08090b";
  g.lineWidth = 1.4 * P;
  g.strokeRect(x0, y0, w, h);
  if (rivets) {
    for (let x = x0 + 0.03; x < x1 - 0.02; x += 0.09) {
      bolt(g, x, y0 + 0.014, 0.006);
      bolt(g, x, y1 - 0.014, 0.006);
    }
  }
}

type Painter = (g: Ctx, x0: number, x1: number, y0: number, y1: number) => void;

const policeFace: Painter = (g, x0, x1, y0, y1) => {
  g.save();
  g.beginPath();
  g.rect(x0, y0, x1 - x0, y1 - y0);
  g.clip();
  g.fillStyle = "#e6e2d6";
  g.fillRect(x0, y0, x1 - x0, y1 - y0);
  g.fillStyle = "#24497e";
  const h = y1 - y0;
  for (let sx = x0 - h; sx < x1; sx += 0.09) {
    g.beginPath();
    g.moveTo(sx, y1);
    g.lineTo(sx + 0.045, y1);
    g.lineTo(sx + 0.045 + h, y0);
    g.lineTo(sx + h, y0);
    g.closePath();
    g.fill();
  }
  const r = rng(77 + Math.round(x0 * 100));
  g.fillStyle = "rgba(40,30,20,0.35)";
  for (let i = 0; i < 14; i++) g.fillRect(x0 + r() * (x1 - x0), y0 + r() * h, 0.006 + r() * 0.02, P);
  g.restore();
};


// ─────────────────────────────── round 3: from the references ───────────────────────────────
// Designer: "still not good, find some references". Meshy references (refs/): real barricades are TALLER than they
// are deep, and read from a raised camera: a big front face, legs and props splayed, junk at the base, and above all
// a long shadow on the street that repeats the slats. So: a 2 × 1 m frame, the ground line low in it, the face
// rising up the frame (heights × 0.6 for the camera tilt), and the shadow cast from the real silhouette.

const TILT = 0.6; // screen metres per metre of height
const YB = 0.24; // the ground line (base of the face)
/** Where a front picture's footprint centre sits in its 2 × 1 m frame (frame metres from its centre). */
export const FRONT_BASE_Y = YB;
const sy = (h: number, base = YB): number => base - h * TILT;

/** Draws `paint` with its own cast shadow: the silhouette, sheared down-right onto the ground from the base line. */
function withShadow(g: Ctx, wM: number, hM: number, base: number, paint: (c: Ctx) => void): void {
  const m = g.getTransform();
  const k = Math.hypot(m.a, m.b);
  const W = Math.ceil(wM * k);
  const H = Math.ceil(hM * k);
  const off = scratchCanvas(W, H);
  const oc = off.getContext("2d") as Ctx;
  oc.setTransform(k, 0, 0, k, W / 2, H / 2);
  paint(oc);
  const sil = scratchCanvas(W, H);
  const sc = sil.getContext("2d") as Ctx;
  sc.drawImage(off, 0, 0);
  sc.globalCompositeOperation = "source-in";
  sc.fillStyle = "#000";
  sc.fillRect(0, 0, W, H);
  const sx = 0.55;
  const sY = 0.32;
  g.save();
  // a point at screen height (base − y) lands on the ground at (x + h·sx, base + h·sY)
  g.transform(1, 0, -sx, -sY, sx * base, base * (1 + sY));
  g.globalAlpha = 0.62;
  g.filter = "blur(1.5px)";
  g.drawImage(sil, -wM / 2, -hM / 2, wM, hM);
  g.restore();
  g.drawImage(off, -wM / 2, -hM / 2, wM, hM);
}

/** A vertical plank standing from the ground (yb) up to height h (m). */
function stake(g: Ctx, x: number, w: number, h: number, col: string, seed: number, yb = YB, lean = 0): void {
  bar(g, x, yb, x + lean, sy(h, yb), w, "wood", col, seed);
}

/** A painted door, scavenged: panels, peeling paint, a knob. */
function door(g: Ctx, x0: number, x1: number, h: number, seed: number): void {
  const yt = sy(h);
  const r = rng(seed);
  g.fillStyle = "#77786c";
  g.fillRect(x0, yt, x1 - x0, YB - yt);
  g.strokeStyle = "rgba(0,0,0,0.45)";
  g.lineWidth = 1.5 * P;
  const iw = (x1 - x0) * 0.32;
  for (const [cx, a, b] of [[x0 + (x1 - x0) * 0.27, 0.08, 0.45], [x0 + (x1 - x0) * 0.73, 0.08, 0.45], [x0 + (x1 - x0) * 0.27, 0.55, 0.92], [x0 + (x1 - x0) * 0.73, 0.55, 0.92]] as const) {
    g.strokeRect(cx - iw / 2, yt + (YB - yt) * a, iw, (YB - yt) * (b - a));
  }
  // peeling paint: bare wood showing
  for (let i = 0; i < 14; i++) {
    g.fillStyle = r() < 0.6 ? "rgba(120,88,55,0.85)" : "rgba(40,36,30,0.6)";
    g.beginPath();
    g.ellipse(x0 + r() * (x1 - x0), yt + r() * (YB - yt), 0.006 + r() * 0.02, 0.004 + r() * 0.012, r() * 3, 0, TAU);
    g.fill();
  }
  g.fillStyle = "#c9a65a";
  g.beginPath();
  g.arc(x1 - 0.05, yt + (YB - yt) * 0.52, 0.012, 0, TAU);
  g.fill();
  g.strokeStyle = "#0a0806";
  g.lineWidth = 1.4 * P;
  g.strokeRect(x0, yt, x1 - x0, YB - yt);
}

/** A pallet stood on its end: vertical slats with gaps, three cross boards. */
function pallet(g: Ctx, x0: number, x1: number, h: number, seed: number): void {
  const yt = sy(h);
  const n = 6;
  const sw = (x1 - x0) / n;
  for (let i = 0; i < n; i++) stake(g, x0 + sw * (i + 0.5), sw * 0.72, h * (0.97 + (i % 2) * 0.03), i % 3 === 0 ? "#9a8c70" : "#a08a62", seed + i);
  for (const t of [0.12, 0.5, 0.88]) plank(g, x0 - 0.01, yt + (YB - yt) * t - 0.022, x1 + 0.01, yt + (YB - yt) * t + 0.022, "#8a7552", seed + 20 + Math.round(t * 10));
  for (let i = 0; i < n; i++) for (const t of [0.12, 0.5, 0.88]) nail(g, x0 + sw * (i + 0.5), yt + (YB - yt) * t);
}

/** A corrugated steel sheet: ribs, rust bleeding from the bolts. */
function corrugated(g: Ctx, x0: number, x1: number, yTop: number, yBot: number, seed: number): void {
  const r = rng(seed);
  g.save();
  g.beginPath();
  g.rect(x0, yTop, x1 - x0, yBot - yTop);
  g.clip();
  const gr = g.createLinearGradient(x0, 0, x0 + 0.04, 0);
  gr.addColorStop(0, "#6f7377");
  gr.addColorStop(0.5, "#a3a8ad");
  gr.addColorStop(1, "#6f7377");
  for (let x = x0; x < x1; x += 0.04) {
    g.save();
    g.translate(x - x0, 0);
    g.fillStyle = gr;
    g.fillRect(x0, yTop, 0.04, yBot - yTop);
    g.restore();
  }
  for (let i = 0; i < 7; i++) {
    const rx = x0 + r() * (x1 - x0);
    const rg = g.createLinearGradient(0, yTop, 0, yBot);
    rg.addColorStop(0, "rgba(140,62,20,0.75)");
    rg.addColorStop(1, "rgba(140,62,20,0)");
    g.fillStyle = rg;
    g.fillRect(rx, yTop + r() * 0.1, 0.02 + r() * 0.05, (yBot - yTop) * (0.4 + r() * 0.6));
  }
  g.restore();
  g.strokeStyle = "#0a0b0d";
  g.lineWidth = 1.4 * P;
  g.strokeRect(x0, yTop, x1 - x0, yBot - yTop);
  for (const y of [yTop + 0.02, yBot - 0.02]) for (let x = x0 + 0.03; x < x1; x += 0.12) bolt(g, x, y, 0.007);
}

/** A cinder block and a tyre: junk at the base. */
function cinder(g: Ctx, x: number, y: number): void {
  g.fillStyle = "#77746d";
  g.fillRect(x - 0.06, y - 0.05, 0.12, 0.07);
  g.fillStyle = "#9a978f";
  g.fillRect(x - 0.06, y - 0.07, 0.12, 0.025);
  g.fillStyle = "#1a1a1a";
  g.fillRect(x - 0.045, y - 0.065, 0.035, 0.015);
  g.fillRect(x + 0.01, y - 0.065, 0.035, 0.015);
  g.strokeStyle = "#0a0a0a";
  g.lineWidth = 1.2 * P;
  g.strokeRect(x - 0.06, y - 0.07, 0.12, 0.09);
}
function tyre(g: Ctx, x: number, y: number, r: number): void {
  g.fillStyle = "#18191b";
  g.beginPath();
  g.ellipse(x, y, r, r * 0.55, 0, 0, TAU);
  g.fill();
  g.fillStyle = "#050506";
  g.beginPath();
  g.ellipse(x, y, r * 0.5, r * 0.27, 0, 0, TAU);
  g.fill();
  g.strokeStyle = "#3a3c40";
  g.lineWidth = 1.2 * P;
  g.beginPath();
  g.ellipse(x, y - r * 0.05, r * 0.85, r * 0.45, 0, Math.PI, TAU);
  g.stroke();
}
function chain(g: Ctx, x0: number, y0: number, x1: number, y1: number, sag: number): void {
  const n = Math.round(Math.hypot(x1 - x0, y1 - y0) / 0.018);
  for (let i = 0; i <= n; i++) {
    const t = i / n;
    const x = x0 + (x1 - x0) * t;
    const y = y0 + (y1 - y0) * t + Math.sin(t * Math.PI) * sag;
    g.strokeStyle = "#1a1b1d";
    g.lineWidth = 2.6 * P;
    g.beginPath();
    g.ellipse(x, y, 0.011, i % 2 ? 0.005 : 0.008, 0, 0, TAU);
    g.stroke();
    g.strokeStyle = "#8e959c";
    g.lineWidth = 1.2 * P;
    g.stroke();
  }
}
function lamp(g: Ctx, x: number, y: number): void {
  g.fillStyle = "#1a1b1e";
  g.fillRect(x - 0.02, y, 0.04, 0.04);
  g.fillStyle = "#ffb52e";
  g.beginPath();
  g.ellipse(x, y - 0.012, 0.034, 0.04, 0, 0, TAU);
  g.fill();
  g.fillStyle = "#fff0b0";
  g.beginPath();
  g.ellipse(x - 0.01, y - 0.022, 0.012, 0.015, 0, 0, TAU);
  g.fill();
  g.strokeStyle = "#2a1a05";
  g.lineWidth = 1.2 * P;
  g.beginPath();
  g.ellipse(x, y - 0.012, 0.034, 0.04, 0, 0, TAU);
  g.stroke();
}

/** A striped police board (front face) between x0 and x1 at heights h0 < h1 on the front plane `base`. */
function policeBoard(g: Ctx, x0: number, x1: number, h0: number, h1: number, base: number): void {
  const y0 = sy(h1, base);
  const y1 = sy(h0, base);
  policeFace(g, x0, x1, y0, y1);
  g.fillStyle = "rgba(255,255,255,0.5)";
  g.fillRect(x0, y0 - 0.012, x1 - x0, 0.012); // the board's top edge, lit
  g.strokeStyle = "#08080a";
  g.lineWidth = 1.4 * P;
  g.strokeRect(x0, y0 - 0.012, x1 - x0, y1 - y0 + 0.012);
}

/** PB3: three police sawhorses as in the references, two striped boards on A-frame legs, amber lamps. */
function point(g: Ctx, x: number, w: number, yTop: number): void {
  const t = w * 0.75;
  g.fillStyle = "#b8976a";
  g.beginPath();
  g.moveTo(x - w / 2, yTop);
  g.lineTo(x, yTop - t);
  g.lineTo(x, yTop);
  g.closePath();
  g.fill();
  g.fillStyle = "#7d6040";
  g.beginPath();
  g.moveTo(x, yTop - t);
  g.lineTo(x + w / 2, yTop);
  g.lineTo(x, yTop);
  g.closePath();
  g.fill();
  g.strokeStyle = "#0a0806";
  g.lineWidth = 1.2 * P;
  g.beginPath();
  g.moveTo(x - w / 2, yTop);
  g.lineTo(x, yTop - t);
  g.lineTo(x + w / 2, yTop);
  g.stroke();
}

/** A plywood sheet, water-stained, with a torn corner. */
function plywood(g: Ctx, x0: number, x1: number, h: number, seed: number): void {
  const r = rng(seed);
  const yt = sy(h);
  const tear = r() < 0.6;
  g.save();
  g.beginPath();
  g.moveTo(x0, YB);
  g.lineTo(x0, yt + (tear ? 0 : 0));
  if (tear) {
    const tx = x0 + (x1 - x0) * (0.55 + r() * 0.2);
    g.lineTo(tx, yt);
    g.lineTo(tx + 0.03, yt + 0.05);
    g.lineTo(tx + 0.06, yt + 0.03);
    g.lineTo(x1, yt + 0.09 + r() * 0.05);
  } else g.lineTo(x1, yt);
  g.lineTo(x1, YB);
  g.closePath();
  g.fillStyle = r() < 0.5 ? "#9a8866" : "#8d7d60";
  g.fill();
  g.clip();
  for (let i = 0; i < 6; i++) {
    const cx = x0 + r() * (x1 - x0);
    const cy = yt + r() * (YB - yt);
    const rg = g.createRadialGradient(cx, cy, 0, cx, cy, 0.04 + r() * 0.08);
    rg.addColorStop(0, "rgba(50,38,24,0.45)");
    rg.addColorStop(1, "rgba(50,38,24,0)");
    g.fillStyle = rg;
    g.fillRect(x0, yt, x1 - x0, YB - yt);
  }
  g.strokeStyle = "rgba(60,45,28,0.35)";
  g.lineWidth = P;
  for (let i = 0; i < 8; i++) {
    const yy = yt + r() * (YB - yt);
    g.beginPath();
    g.moveTo(x0, yy);
    g.bezierCurveTo(x0 + (x1 - x0) * 0.3, yy + 0.01, x0 + (x1 - x0) * 0.6, yy - 0.01, x1, yy + 0.005);
    g.stroke();
  }
  g.restore();
  g.strokeStyle = "#0a0806";
  g.lineWidth = 1.4 * P;
  g.stroke();
}

/** A stake's top broken off jagged instead of sharpened. */
function broken(g: Ctx, x: number, w: number, yTop: number, seed: number): void {
  const r = rng(seed);
  g.fillStyle = "#b8976a";
  g.beginPath();
  g.moveTo(x - w / 2, yTop + 0.01);
  for (let i = 1; i < 5; i++) g.lineTo(x - w / 2 + (w * i) / 5, yTop - r() * 0.03);
  g.lineTo(x + w / 2, yTop + 0.01);
  g.closePath();
  g.fill();
  g.strokeStyle = "#0a0806";
  g.lineWidth = 1.1 * P;
  g.stroke();
}

interface Part { x0: number; x1: number; h: number }

/**
 * The WD3 wall (front view), built at random from scavenged parts so no two pieces match and nothing lines up:
 * stake clusters (sharpened or broken tops), doors, pallets, plywood, corrugated sheets, each tilted a few degrees,
 * overlapping unevenly, and running past both frame edges so neighbouring pieces join with no gap.
 */
function wd3Wall(c: Ctx, inside: boolean, seed: number, style: "wood" | "rf" = "wood"): Part[] {
  const r = rng(seed);
  const parts: Part[] = [];
  let x = -1.04;
  let last = -1;
  while (x < 1.02) {
    // the reinforced wall leans on corrugated steel and pallets
    let kind = style === "rf" ? [0, 0, 1, 2, 2, 3, 4, 4, 4, 4][Math.floor(r() * 10)] as number : Math.floor(r() * 6);
    if (kind === last && kind !== 0 && !(style === "rf" && kind === 4)) kind = 0;
    last = kind;
    const ang = (r() - 0.5) * 0.11;
    const lift = r() * 0.015;
    const w = kind === 0 ? 0.075 * (2 + Math.floor(r() * 4)) : kind === 1 ? 0.34 + r() * 0.06 : kind === 2 ? 0.38 + r() * 0.06 : kind === 3 ? 0.3 + r() * 0.2 : kind === 4 ? 0.32 + r() * 0.16 : 0.15;
    const x0 = x;
    const x1 = x + w;
    const h = kind === 1 ? 0.98 + r() * 0.08 : 0.8 + r() * 0.3;
    c.save();
    c.translate((x0 + x1) / 2, YB);
    c.rotate(ang);
    c.translate(-(x0 + x1) / 2, -YB - lift);
    if (kind === 0 || kind === 5) {
      const n = Math.round(w / 0.075);
      for (let i = 0; i < n; i++) {
        const sx = x0 + 0.0375 + i * 0.075;
        const hh = h + (r() - 0.5) * 0.18;
        const col = r() < 0.25 ? "#8a8577" : (WOODS[Math.floor(r() * 6)] as string);
        const lean = (r() - 0.5) * 0.03;
        stake(c, sx, 0.065 + r() * 0.015, hh, col, seed * 7 + parts.length * 13 + i, YB, lean);
        if (r() < 0.65) point(c, sx + lean, 0.07, sy(hh));
        else broken(c, sx + lean, 0.07, sy(hh), seed + i * 31 + parts.length);
      }
    } else if (kind === 1) door(c, x0, x1, h, seed + parts.length * 17);
    else if (kind === 2) pallet(c, x0, x1, h * 0.95, seed + parts.length * 19);
    else if (kind === 3) plywood(c, x0, x1, h, seed + parts.length * 23);
    else corrugated(c, x0, x1, sy(h), YB, seed + parts.length * 29);
    c.restore();
    parts.push({ x0, x1, h });
    x = x1 - 0.02 - r() * 0.04; // overlap the next part a little
  }
  // the cross planks at odd angles, nailed where they cross the parts
  const planks = inside ? 2 + Math.floor(r() * 2) : 0;
  for (let i = 0; i < planks; i++) {
    const a = -1.02 + r() * 0.9;
    const b = Math.min(1.02, a + 0.6 + r() * 0.8);
    const ha = 0.3 + r() * 0.45;
    const hb = Math.max(0.25, Math.min(0.8, ha + (r() - 0.5) * 0.35));
    bar(c, a, sy(ha), b, sy(hb), 0.046, "wood", WOODS[Math.floor(r() * 6)] as string, seed + 300 + i);
    for (let t = 0.06; t < 1; t += 0.12 + r() * 0.1) nail(c, a + (b - a) * t, sy(ha + (hb - ha) * t));
  }
  if (!inside) {
    for (let i = 0; i < 18; i++) nail(c, -0.95 + r() * 1.9, sy(0.3 + r() * 0.4)); // nail tips through from the inside
    const gr = c.createLinearGradient(0, sy(0.3), 0, YB);
    gr.addColorStop(0, "rgba(25,20,14,0)");
    gr.addColorStop(1, "rgba(25,20,14,0.55)");
    c.fillStyle = gr;
    c.fillRect(-1.05, sy(0.3), 2.1, YB - sy(0.3));
  }
  return parts;
}

/** WD3 inside face: the braced side, props leaning on it at uneven angles, junk at the foot. */
export function drawWD3v(g: Ctx, variant: number): void {
  withShadow(g, 2, 1, YB, (c) => {
    const seed = 4100 + variant * 997;
    wd3Wall(c, true, seed);
    const r = rng(seed + 50);
    const n = 2 + Math.floor(r() * 2);
    for (let i = 0; i < n; i++) {
      const x = -0.85 + (1.7 * (i + 0.2 + r() * 0.6)) / n;
      const top = 0.55 + r() * 0.3;
      const foot = x + (r() - 0.5) * 0.25;
      bar(c, x, sy(top), foot, YB + 0.14 + r() * 0.05, 0.045 + r() * 0.015, "wood", WOODS[Math.floor(r() * 6)] as string, seed + 60 + i);
      nail(c, x, sy(top) + 0.012);
    }
    const junk = Math.floor(r() * 3) + 1;
    for (let i = 0; i < junk; i++) {
      const x = -0.85 + r() * 1.7;
      if (r() < 0.55) cinder(c, x, YB + 0.12 + r() * 0.04);
      else tyre(c, x, YB + 0.13, 0.07 + r() * 0.015);
    }
  });
}
export function drawWD3outV(g: Ctx, variant: number): void {
  withShadow(g, 2, 1, YB, (c) => {
    const seed = 4100 + variant * 997;
    c.save();
    c.scale(-1, 1);
    wd3Wall(c, false, seed);
    c.restore();
    const r = rng(seed + 600);
    for (let i = 0; i < 26; i++) {
      const x = -0.95 + r() * 1.9;
      const y = YB + 0.02 + r() * 0.07;
      const sz = 0.01 + r() * 0.022;
      c.fillStyle = ["#5d5a55", "#6e6a63", "#4a4743", "#7a6a55"][Math.floor(r() * 4)] as string;
      c.beginPath();
      c.moveTo(x - sz, y);
      c.lineTo(x - sz * 0.3, y - sz * 0.8);
      c.lineTo(x + sz, y - sz * 0.3);
      c.lineTo(x + sz * 0.6, y + sz * 0.5);
      c.closePath();
      c.fill();
      c.strokeStyle = "rgba(0,0,0,0.6)";
      c.lineWidth = P;
      c.stroke();
    }
    const bx = -0.7 + r() * 1.2;
    plank(c, bx, YB + 0.05, bx + 0.2 + r() * 0.1, YB + 0.085, "#6f5235", seed + 620);
    if (r() < 0.6) cinder(c, -0.8 + r() * 1.6, YB + 0.11);
  });
}
// ─────────────────────────────── round 3b: rotation and corners ───────────────────────────────
// Designer: "how do you manage the rotation? corners". A standing barricade can't be spun like a flat sprite, so each
// type gets two pictures: the FRONT view (lines along x, rot 0/2) and the SIDE view (lines along y, rot 1/3), and
// where two lines meet a CORNER POST joins them. The light (and every shadow) keeps one direction.
// Side frame: 1 × 2.8 m, the footprint (0.5 × 2 m) centred on (0, SIDE_C); the wall's base line runs along x = 0.

export const SIDE_C = 0.4;
const SN = SIDE_C - 1; // north end of the base line
const SS_ = SIDE_C + 1; // south end (nearest the camera)

/** WD3 side view: the near end, the top edge running up the screen, props on the INSIDE only (east = +x). */
function wd3Side(g: Ctx, braceSide: 1 | -1, variant = 0): void {
  const H = 1.0;
  const up = H * TILT;
  const r = rng(4400 + variant * 577);
  // the parts, north to south (the same for both orientations)
  const parts: { y0: number; y1: number; h: number; col: string; w: number }[] = [];
  let y = SN - 0.04;
  while (y < SS_ - 0.01) {
    const k = r();
    const len = k < 0.15 ? 0.38 : k < 0.3 ? 0.42 : 0.075;
    const col = k < 0.15 ? "#86877b" : k < 0.3 ? "#a08a62" : (WOODS[Math.floor(r() * 6)] as string);
    parts.push({ y0: y, y1: Math.min(SS_, y + len), h: k < 0.15 ? 1.02 : k < 0.3 ? 0.95 : 0.9 + r() * 0.22, col, w: k < 0.3 ? 0.11 : 0.12 });
    y += len;
  }
  // shadow: each part's height thrown down-right
  g.save();
  g.filter = "blur(1.5px)";
  g.fillStyle = "rgba(0,0,0,0.62)";
  for (const p of parts) {
    const dx = p.h * TILT * 0.55;
    const dy = p.h * TILT * 0.32;
    g.beginPath();
    g.moveTo(0.05, p.y0);
    g.lineTo(0.05 + dx, p.y0 + dy);
    g.lineTo(0.05 + dx, p.y1 + dy - 0.006);
    g.lineTo(0.05, p.y1 - 0.006);
    g.closePath();
    g.fill();
  }
  g.restore();
  const props = [SN + 0.35, SIDE_C - 0.15, SIDE_C + 0.45];
  // props on the inside: when the inside is west (−x) they are behind on screen only partly; draw them first if west
  const drawProps = (): void => {
    for (const py of props) bar(g, 0, py - up * 0.72, braceSide * 0.22, py + 0.04, 0.05, "wood", "#6a4e33", 4410 + Math.round(py * 10));
    cinder(g, braceSide * 0.24, SIDE_C + 0.7);
    tyre(g, braceSide * 0.24, SIDE_C - 0.45, 0.075);
  };
  if (braceSide < 0) drawProps();
  for (const p of parts) {
    const t0 = p.y0 - p.h * TILT;
    plank(g, -p.w / 2, t0, p.w / 2, p.y1, p.col, 4420 + Math.round(p.y0 * 100));
    g.fillStyle = "rgba(0,0,0,0.38)";
    g.fillRect(-p.w / 2, p.y1 - p.h * TILT, p.w, p.h * TILT);
    g.fillStyle = "rgba(255,240,210,0.18)";
    g.fillRect(-p.w / 2, t0, p.w, p.y1 - p.y0);
    if (p.w > 0.115) nail(g, 0, (p.y0 + p.y1) / 2 - p.h * TILT);
  }
  for (const t of [0.36, 0.66]) {
    g.fillStyle = "#5a422a";
    g.fillRect(braceSide > 0 ? 0.04 : -0.1, SS_ - t * TILT - 0.02, 0.06, 0.04); // the inside cross planks' cut ends
    g.strokeStyle = "#0a0806";
    g.lineWidth = 1.2 * P;
    g.strokeRect(braceSide > 0 ? 0.04 : -0.1, SS_ - t * TILT - 0.02, 0.06, 0.04);
  }
  if (braceSide > 0) drawProps();
}
export function drawWD3sideE(g: Ctx, variant = 0): void {
  wd3Side(g, 1, variant);
}
export function drawWD3sideW(g: Ctx, variant = 0): void {
  wd3Side(g, -1, variant);
}
/** Kept for the round 3b demo. */

/**
 * The corner piece: fills the empty square where a front line and a side line meet (0.5 × 0.5 m, centred on (0, CB)).
 * A tall squared post, a short stretch of front wall reaching over the front line's end, and a short stretch of side
 * wall reaching over the side line's end, so the corner is closed. `h` = which way the front line goes (+1 east),
 * `v` = which way the side line goes (+1 south), `inside` = the front stretch shows its braced face.
 */
export const CB = 0.55;
export function drawWD3corner(g: Ctx, h: 1 | -1, v: 1 | -1, inside: boolean): void {
  const H = 1.25;
  withShadow(g, 1.4, 2, CB, (c) => {
    // side stretch going north (drawn first: it's behind)
    if (v < 0) for (let i = 0; i < 4; i++) {
      const y0 = CB - 0.06 - (i + 1) * 0.075;
      const hh = 0.95 + (i % 2) * 0.08;
      plank(c, -0.055, y0 - hh * TILT, 0.055, y0 + 0.075, WOODS[(i + 2) % 6] as string, 4800 + i);
    }
    // the front stretch: stakes from the post to past the front line's end
    for (let i = 0; i < 5; i++) {
      const x = h * (0.1 + i * 0.075);
      const hh = 0.88 + ((i * 37) % 7) * 0.03;
      stake(c, x, 0.07, hh, WOODS[(i + 1) % 6] as string, 4810 + i, CB);
      point(c, x, 0.07, sy(hh, CB));
    }
    if (inside) {
      plank(c, Math.min(0, h * 0.45), sy(0.66, CB) - 0.025, Math.max(0, h * 0.45), sy(0.66, CB) + 0.022, "#7a5c3c", 4820);
      nail(c, h * 0.1, sy(0.66, CB));
      nail(c, h * 0.25, sy(0.66, CB));
    }
    // the post, taller than the walls, with two steel bands
    bar(c, 0, CB, 0, sy(H, CB), 0.16, "wood", "#5f452c", 4830);
    plank(c, -0.08, sy(H, CB) - 0.08, 0.08, sy(H, CB), "#9a7a55", 4831);
    for (const t of [0.3, 0.72]) {
      c.fillStyle = "#3a3d42";
      c.fillRect(-0.085, sy(H * t, CB) - 0.013, 0.17, 0.026);
      bolt(c, 0, sy(H * t, CB), 0.01);
    }
    // side stretch going south (in front of the post's foot)
    if (v > 0) for (let i = 0; i < 4; i++) {
      const y0 = CB + 0.06 + i * 0.075;
      const hh = 0.95 + (i % 2) * 0.08;
      plank(c, -0.055, y0 - hh * TILT, 0.055, y0 + 0.075, WOODS[(i + 2) % 6] as string, 4840 + i);
    }
  });
}

/** The corner post that joins two lines: a thick squared timber, a bit taller, its face and its shadow. Frame 0.6 × 1.2 m, base at y 0.35. */
// ─────────────────────────────── round 4: the same system for every barricade ───────────────────────────────
// Designer approved the wood wall ("Perfect"): four rotation pictures (front inside / outside, side braces east /
// west), a corner piece, random variants, edge to edge. The same for the reinforced, metal and police barricades.

export type Style = "wood" | "rf" | "mt";

/** Steel straps, chains and (always) razor wire along the top: what makes the wood wall "reinforced". */
function rfOverlay(c: Ctx, seed: number, inside: boolean): void {
  const r = rng(seed + 900);
  const straps = 2 + Math.floor(r() * 2);
  for (let i = 0; i < straps; i++) {
    const x = -0.85 + (1.7 * (i + 0.3 + r() * 0.4)) / straps;
    steelPlate(c, x - 0.035, sy(0.95 + r() * 0.08), x + 0.035, YB, "#5d636b", seed + 910 + i, false);
    for (let t = 0.15; t < 0.95; t += 0.26) bolt(c, x, sy(t), 0.008);
  }
  const chains = 1 + Math.floor(r() * 2);
  for (let i = 0; i < chains; i++) {
    const a = -0.95 + r() * 0.8;
    chain(c, a, sy(0.45 + r() * 0.3), Math.min(1.02, a + 0.6 + r() * 0.6), sy(0.4 + r() * 0.35), 0.04 + r() * 0.05);
  }
  if (!inside) for (let i = 0; i < 10; i++) bolt(c, -0.95 + r() * 1.9, sy(0.2 + r() * 0.6), 0.006);
  razorCoil(c, -1.06, 1.06, sy(1.07), 0.085, seed + 950);
}

/** The metal wall: welded plates of uneven size, overlapping, rust, weld seams; the inside shows the stiffeners. */
function mtWall(c: Ctx, inside: boolean, seed: number): void {
  const r = rng(seed);
  let x = -1.04;
  let i = 0;
  const greys = ["#5d636a", "#666c73", "#596067", "#6d6a64", "#535a61"];
  while (x < 1.02) {
    const w = 0.34 + r() * 0.38;
    const h = 0.86 + r() * 0.2;
    const x0 = x;
    const x1 = x + w;
    const ang = (r() - 0.5) * 0.05;
    c.save();
    c.translate((x0 + x1) / 2, YB);
    c.rotate(ang);
    c.translate(-(x0 + x1) / 2, -YB);
    steelPlate(c, x0, sy(h), x1, YB, greys[Math.floor(r() * greys.length)] as string, seed + i * 11, !inside);
    c.fillStyle = "rgba(255,255,255,0.32)";
    c.fillRect(x0, sy(h) - 0.013, w, 0.013); // the plate's top edge
    if (inside) {
      // stiffeners welded on the back: an angle iron across, two uprights
      for (const t of [0.35, 0.72]) bar(c, x0 + 0.02, sy(h * t), x1 - 0.02, sy(h * t), 0.03, "steel", "#4c5157", seed + i * 11 + 3);
      for (const u of [0.25, 0.75]) bar(c, x0 + w * u, sy(h * 0.95), x0 + w * u, YB - 0.01, 0.026, "steel", "#474c52", seed + i * 11 + 5);
    } else if (r() < 0.55) {
      const hb0 = 0.3 + r() * 0.15;
      const hb1 = hb0 + 0.2 + r() * 0.12;
      hazard(c, x0 + 0.03, sy(hb1), x1 - 0.03, sy(hb0), seed + i * 11 + 7);
      c.strokeStyle = "#0a0b0d";
      c.lineWidth = 1.3 * P;
      c.strokeRect(x0 + 0.03, sy(hb1), w - 0.06, sy(hb0) - sy(hb1));
    }
    c.restore();
    // the weld seam where it overlaps the next plate
    c.strokeStyle = "rgba(28,22,16,0.9)";
    c.lineWidth = 3 * P;
    c.beginPath();
    c.moveTo(x1 - 0.015, sy(0.85));
    c.lineTo(x1 - 0.015, YB);
    c.stroke();
    i++;
    x = x1 - 0.03 - r() * 0.03;
  }
  if (!inside) {
    const gr = c.createLinearGradient(0, sy(0.3), 0, YB);
    gr.addColorStop(0, "rgba(25,20,14,0)");
    gr.addColorStop(1, "rgba(25,20,14,0.5)");
    c.fillStyle = gr;
    c.fillRect(-1.05, sy(0.3), 2.1, YB - sy(0.3));
  }
}

function rubble(c: Ctx, seed: number): void {
  const r = rng(seed);
  for (let i = 0; i < 26; i++) {
    const x = -0.95 + r() * 1.9;
    const y = YB + 0.02 + r() * 0.07;
    const sz = 0.01 + r() * 0.022;
    c.fillStyle = ["#5d5a55", "#6e6a63", "#4a4743", "#7a6a55"][Math.floor(r() * 4)] as string;
    c.beginPath();
    c.moveTo(x - sz, y);
    c.lineTo(x - sz * 0.3, y - sz * 0.8);
    c.lineTo(x + sz, y - sz * 0.3);
    c.lineTo(x + sz * 0.6, y + sz * 0.5);
    c.closePath();
    c.fill();
    c.strokeStyle = "rgba(0,0,0,0.6)";
    c.lineWidth = P;
    c.stroke();
  }
}

/** Front, inside (variant): RF = the wood wall + steel + wire + braces; MT = plates + I-beam props + sandbags. */
export function drawFrontIn(g: Ctx, style: Style, variant: number): void {
  if (style === "wood") return drawWD3v(g, variant);
  withShadow(g, 2, 1, YB, (c) => {
    const seed = (style === "rf" ? 5100 : 6100) + variant * 997;
    const r = rng(seed + 50);
    if (style === "rf") {
      wd3Wall(c, true, seed, "rf");
      rfOverlay(c, seed, true);
      const n = 2 + Math.floor(r() * 2);
      for (let i = 0; i < n; i++) {
        const x = -0.85 + (1.7 * (i + 0.2 + r() * 0.6)) / n;
        const top = 0.55 + r() * 0.3;
        bar(c, x, sy(top), x + (r() - 0.5) * 0.25, YB + 0.14 + r() * 0.05, 0.05, "wood", WOODS[Math.floor(r() * 6)] as string, seed + 60 + i);
        bolt(c, x, sy(top) + 0.012, 0.009);
      }
      if (r() < 0.7) cinder(c, -0.8 + r() * 1.6, YB + 0.13);
    } else {
      mtWall(c, true, seed);
      const n = 2 + Math.floor(r() * 2);
      for (let i = 0; i < n; i++) {
        const x = -0.8 + (1.6 * (i + 0.2 + r() * 0.6)) / n;
        const foot = x + (r() - 0.5) * 0.2;
        bar(c, x, sy(0.7 + r() * 0.15), foot, YB + 0.16, 0.045, "steel", "#4c5157", seed + 70 + i);
        c.fillStyle = "#33373c";
        c.fillRect(foot - 0.04, YB + 0.15, 0.08, 0.03); // base plate
        bolt(c, foot - 0.025, YB + 0.165, 0.006);
        bolt(c, foot + 0.025, YB + 0.165, 0.006);
      }
    }
  });
}

/** Front, outside (variant): the same wall turned round, no braces, rubble at the foot. */
export function drawFrontOut(g: Ctx, style: Style, variant: number): void {
  if (style === "wood") return drawWD3outV(g, variant);
  withShadow(g, 2, 1, YB, (c) => {
    const seed = (style === "rf" ? 5100 : 6100) + variant * 997;
    c.save();
    c.scale(-1, 1);
    if (style === "rf") {
      wd3Wall(c, false, seed, "rf");
      rfOverlay(c, seed, false);
    } else mtWall(c, false, seed);
    c.restore();
    rubble(c, seed + 600);
  });
}

/** Side view for every style: the near end, the top edge running up the screen, braces on the inside. */
export function drawSide(g: Ctx, style: Style, braceSide: 1 | -1, variant: number): void {
  if (style === "wood") return wd3Side(g, braceSide, variant);
  const up = TILT;
  const r = rng((style === "rf" ? 5400 : 6400) + variant * 577);
  const parts: { y0: number; y1: number; h: number; col: string; w: number; steel: boolean }[] = [];
  let y = SN - 0.04;
  while (y < SS_ - 0.01) {
    const k = r();
    let len: number;
    let col: string;
    let steel: boolean;
    let h: number;
    if (style === "mt") {
      len = 0.34 + r() * 0.38;
      col = ["#5d636a", "#666c73", "#596067", "#6d6a64"][Math.floor(r() * 4)] as string;
      steel = true;
      h = 0.86 + r() * 0.2;
    } else {
      steel = k < 0.45;
      len = steel ? 0.32 + r() * 0.16 : k < 0.6 ? 0.4 : 0.075;
      col = steel ? "#8f959b" : k < 0.6 ? "#a08a62" : (WOODS[Math.floor(r() * 6)] as string);
      h = steel ? 0.92 + r() * 0.1 : 0.9 + r() * 0.15;
    }
    parts.push({ y0: y, y1: Math.min(SS_, y + len), h, col, w: steel ? 0.07 : 0.12, steel });
    y += len - (style === "mt" ? 0.03 : 0);
  }
  g.save();
  g.filter = "blur(1.5px)";
  g.fillStyle = "rgba(0,0,0,0.62)";
  for (const p of parts) {
    const dx = p.h * TILT * 0.55;
    const dy = p.h * TILT * 0.32;
    g.beginPath();
    g.moveTo(0.05, p.y0);
    g.lineTo(0.05 + dx, p.y0 + dy);
    g.lineTo(0.05 + dx, p.y1 + dy - 0.006);
    g.lineTo(0.05, p.y1 - 0.006);
    g.closePath();
    g.fill();
  }
  g.restore();
  const props = [SN + 0.3 + r() * 0.15, SIDE_C - 0.2 + r() * 0.15, SIDE_C + 0.4 + r() * 0.15];
  const drawProps = (): void => {
    for (const py of props) {
      if (style === "mt") {
        bar(g, 0, py - up * 0.72, braceSide * 0.22, py + 0.04, 0.045, "steel", "#4c5157", 6410 + Math.round(py * 10));
        g.fillStyle = "#33373c";
        g.fillRect(braceSide * 0.22 - 0.04, py + 0.03, 0.08, 0.03);
      } else bar(g, 0, py - up * 0.72, braceSide * 0.22, py + 0.04, 0.05, "wood", "#6a4e33", 5410 + Math.round(py * 10));
    }
    if (style !== "mt") cinder(g, braceSide * 0.24, SIDE_C + 0.7);
  };
  if (braceSide < 0) drawProps();
  for (const p of parts) {
    const t0 = p.y0 - p.h * TILT;
    if (p.steel) {
      steelPlate(g, -p.w / 2, t0, p.w / 2, p.y1, p.col, 5420 + Math.round(p.y0 * 100), false);
      g.fillStyle = "rgba(255,255,255,0.28)";
      g.fillRect(-p.w / 2, t0, p.w, p.y1 - p.y0); // the lit top lip
    } else plank(g, -p.w / 2, t0, p.w / 2, p.y1, p.col, 5420 + Math.round(p.y0 * 100));
    g.fillStyle = "rgba(0,0,0,0.38)";
    g.fillRect(-p.w / 2, p.y1 - p.h * TILT, p.w, p.h * TILT);
    if (p.steel && style === "mt") bolt(g, 0, (p.y0 + p.y1) / 2 - p.h * TILT, 0.007);
  }
  if (style === "rf") {
    // razor wire along the top, the whole length
    const top = SIDE_C - 1.07 * TILT;
    g.save();
    g.translate(0, top);
    g.rotate(Math.PI / 2);
    razorCoil(g, -1.08, 1.08, 0, 0.085, 5470 + variant);
    g.restore();
  }
  if (braceSide > 0) drawProps();
}

/** The corner piece for every style: a post (squared timber, banded; or a steel I-beam), stubs over both walls. */
export function drawCorner(g: Ctx, style: Style, h: 1 | -1, v: 1 | -1, inside: boolean): void {
  if (style === "wood") return drawWD3corner(g, h, v, inside);
  const H = 1.25;
  withShadow(g, 1.4, 2, CB, (c) => {
    const stub = (i: number, y0: number): void => {
      const hh = 0.95 + (i % 2) * 0.06;
      if (style === "mt") steelPlate(c, -0.04, y0 - hh * TILT, 0.04, y0 + 0.075, "#62686f", 6800 + i, false);
      else plank(c, -0.055, y0 - hh * TILT, 0.055, y0 + 0.075, WOODS[(i + 2) % 6] as string, 5800 + i);
    };
    if (v < 0) for (let i = 0; i < 4; i++) stub(i, CB - 0.06 - (i + 1) * 0.075);
    if (style === "mt") {
      const x0 = Math.min(0, h * 0.48);
      steelPlate(c, x0, sy(0.98, CB), x0 + 0.48, CB, "#60666d", 6810, !inside);
      c.fillStyle = "rgba(255,255,255,0.32)";
      c.fillRect(x0, sy(0.98, CB) - 0.013, 0.48, 0.013);
      if (!inside) hazard(c, x0 + 0.03, sy(0.6, CB), x0 + 0.45, sy(0.38, CB), 6811);
    } else {
      for (let i = 0; i < 3; i++) stake(c, h * (0.1 + i * 0.075), 0.07, 0.95 + i * 0.04, WOODS[(i + 1) % 6] as string, 5810 + i, CB);
      corrugated(c, Math.min(h * 0.3, h * 0.5), Math.max(h * 0.3, h * 0.5), sy(0.95, CB), CB, 5815);
    }
    // the post
    if (style === "mt") {
      bar(c, 0, CB, 0, sy(H, CB), 0.15, "steel", "#4a4f55", 6830);
      c.fillStyle = "#2f3337";
      c.fillRect(-0.02, sy(H, CB), 0.04, CB - sy(H, CB)); // the I-beam's web in shadow
      steelPlate(c, -0.09, sy(H, CB) - 0.05, 0.09, sy(H, CB), "#6a7077", 6831, false);
      for (const t of [0.25, 0.55, 0.85]) bolt(c, 0, sy(H * t, CB), 0.01);
    } else {
      bar(c, 0, CB, 0, sy(H, CB), 0.16, "wood", "#5f452c", 5830);
      plank(c, -0.08, sy(H, CB) - 0.08, 0.08, sy(H, CB), "#9a7a55", 5831);
      for (const t of [0.3, 0.72]) {
        c.fillStyle = "#3a3d42";
        c.fillRect(-0.085, sy(H * t, CB) - 0.013, 0.17, 0.026);
        bolt(c, 0, sy(H * t, CB), 0.01);
      }
      razorCoil(c, -0.2, 0.2, sy(1.15, CB), 0.075, 5840);
    }
    if (v > 0) for (let i = 0; i < 4; i++) stub(i, CB + 0.06 + i * 0.075);
  });
}

// ─────────────────────────────── police ───────────────────────────────

/**
 * Police front (both rotations: a sawhorse looks the same from both sides): three sawhorses edge to edge. Story 9.14:
 * `units` < 3 draws only the first (west) ones, the same as in the full picture (the end piece of a police line).
 */
export function drawPoliceFront(g: Ctx, variant: number, units = 3): void {
  const r = rng(7100 + variant * 997);
  withShadow(g, 2, 1, YB, (c) => {
    for (let u = 0; u < units; u++) {
      const cx = -0.667 + u * 0.667 + (r() - 0.5) * 0.04;
      const ang = (r() - 0.5) * 0.05;
      c.save();
      c.translate(cx, YB);
      c.rotate(ang);
      c.translate(-cx, -YB);
      const back = YB - 0.08;
      const front = YB + 0.05;
      const top = sy(1.0, YB - 0.015);
      for (const s of [-1, 1]) bar(c, cx + s * 0.26, top, cx + s * 0.29, back, 0.026, "steel", "#cfd2d4", 7110 + u * 4 + s);
      for (const s of [-1, 1]) {
        bar(c, cx + s * 0.26, top, cx + s * 0.29, front, 0.028, "steel", "#e2e4e5", 7120 + u * 4 + s);
        c.fillStyle = "#121315";
        c.fillRect(cx + s * 0.29 - 0.022, front - 0.01, 0.044, 0.02);
        c.fillRect(cx + s * 0.29 - 0.022, back - 0.01, 0.044, 0.02);
      }
      // the boards run the whole unit, so neighbours meet
      policeBoard(c, cx - 0.345, cx + 0.345, 0.78, 0.97, YB + 0.01);
      policeBoard(c, cx - 0.335, cx + 0.335, 0.32, 0.48, YB + 0.03);
      for (const x of [cx - 0.26, cx + 0.26]) {
        bolt(c, x, sy(0.875, YB + 0.01), 0.008);
        bolt(c, x, sy(0.4, YB + 0.03), 0.008);
      }
      // scuffs and a sticker or two
      c.fillStyle = "rgba(30,25,20,0.4)";
      for (let i = 0; i < 6; i++) c.fillRect(cx - 0.3 + r() * 0.6, sy(0.78 + r() * 0.19, YB + 0.01), 0.01 + r() * 0.04, P * 1.5);
      if (r() < 0.6) lamp(c, cx + (r() < 0.5 ? -0.24 : 0.24), sy(1.0, YB + 0.01) - 0.05);
      c.restore();
    }
  });
}

/** Police side: the sawhorses end-on (an A of legs each), the boards running up the screen as striped edges. */
export function drawPoliceSide(g: Ctx, variant: number): void {
  const r = rng(7400 + variant * 577);
  const units = [SN + 0.33, SIDE_C, SS_ - 0.33];
  const top = (y: number): number => y - 1.0 * TILT;
  // shadows of the A-frames and the boards
  g.save();
  g.filter = "blur(1.5px)";
  g.fillStyle = "rgba(0,0,0,0.6)";
  // each A-frame's shadow: from both feet up to the top's shadow point; the boards' shadows join the tops
  const sx = (h: number): number => h * TILT * 0.55;
  const sY = (h: number): number => h * TILT * 0.32;
  g.strokeStyle = "rgba(0,0,0,0.55)";
  g.lineCap = "round";
  for (const y of units) {
    g.lineWidth = 0.022;
    g.beginPath();
    g.moveTo(-0.22, y);
    g.lineTo(sx(1), y + sY(1));
    g.lineTo(0.22, y);
    g.stroke();
  }
  g.lineWidth = 0.03;
  g.beginPath();
  g.moveTo(sx(1), units[0]! + sY(1) - 0.33);
  g.lineTo(sx(1), units[2]! + sY(1));
  g.stroke();
  g.lineWidth = 0.026;
  g.beginPath();
  g.moveTo(sx(0.48), units[0]! + sY(0.48) - 0.33);
  g.lineTo(sx(0.48), units[2]! + sY(0.48));
  g.stroke();
  g.restore();
  for (const y of units) {
    for (const s of [-1, 1]) bar(g, 0, top(y), s * 0.22, y, 0.026, "steel", s < 0 ? "#cfd2d4" : "#e2e4e5", 7410 + Math.round(y * 10) + s);
  }
  // the boards' top edges, running the whole length (thin, striped)
  for (const [hgt, wdt] of [[0.48, 0.03], [0.97, 0.034]] as const) {
    const y0 = SN - hgt * TILT - 0.04;
    const y1 = SS_ - hgt * TILT;
    g.save();
    g.beginPath();
    g.rect(-wdt / 2, y0, wdt, y1 - y0);
    g.clip();
    g.fillStyle = "#e6e2d6";
    g.fillRect(-wdt / 2, y0, wdt, y1 - y0);
    g.fillStyle = "#24497e";
    for (let yy = y0; yy < y1; yy += 0.09) g.fillRect(-wdt / 2, yy, wdt, 0.045);
    g.restore();
    g.strokeStyle = "#08080a";
    g.lineWidth = 1.2 * P;
    g.strokeRect(-wdt / 2, y0, wdt, y1 - y0);
  }
  // the near ends of the two boards, and the front A-frame over them
  for (const [h0, h1] of [[0.32, 0.48], [0.78, 0.97]] as const) {
    g.fillStyle = "#d9d5c9";
    g.fillRect(-0.02, sy(h1, SS_), 0.04, sy(h0, SS_) - sy(h1, SS_));
    g.strokeRect(-0.02, sy(h1, SS_), 0.04, sy(h0, SS_) - sy(h1, SS_));
  }
  for (const y of units) for (const s of [-1, 1]) {
    g.fillStyle = "#121315";
    g.fillRect(s * 0.22 - 0.022, y - 0.01, 0.044, 0.02);
  }
  if (r() < 0.7) lamp(g, 0, top(units[0] as number) - 0.05);
  lamp(g, 0, top(units[2] as number) - 0.05);
}

/** Police corner: a striped traffic drum where two lines meet. */
export function drawPoliceCorner(g: Ctx): void {
  withShadow(g, 1.4, 2, CB, (c) => {
    const H = 0.95;
    const rx = 0.2;
    const yT = sy(H, CB);
    c.fillStyle = "#e0601e";
    c.beginPath();
    c.moveTo(-rx, yT);
    c.lineTo(-rx * 1.05, CB);
    c.ellipse(0, CB, rx * 1.05, rx * 0.35, 0, Math.PI, 0, true);
    c.lineTo(rx, yT);
    c.closePath();
    c.fill();
    c.save();
    c.clip();
    c.fillStyle = "#f2f0ea";
    for (const t of [0.25, 0.55]) c.fillRect(-0.3, sy(H * (t + 0.12), CB), 0.6, sy(H * t, CB) - sy(H * (t + 0.12), CB));
    const gr = c.createLinearGradient(-rx, 0, rx, 0);
    gr.addColorStop(0, "rgba(255,255,255,0.25)");
    gr.addColorStop(0.4, "rgba(255,255,255,0)");
    gr.addColorStop(1, "rgba(0,0,0,0.35)");
    c.fillStyle = gr;
    c.fillRect(-0.3, yT, 0.6, CB - yT + 0.1);
    c.restore();
    c.strokeStyle = "#0a0806";
    c.lineWidth = 1.4 * P;
    c.stroke();
    c.fillStyle = "#c9531a";
    c.beginPath();
    c.ellipse(0, yT, rx, rx * 0.35, 0, 0, TAU);
    c.fill();
    c.stroke();
    c.fillStyle = "#1a1a1a";
    c.beginPath();
    c.ellipse(0, CB + 0.01, rx * 1.15, rx * 0.4, 0, 0, Math.PI);
    c.fill();
    lamp(c, 0, yT - 0.03);
  });
}

/** Draws `fn` (metres, the frame centred on (0, 0)) into the box (x, y, w, h) at `pxPerM`. */
export function inFrameCentred(g: Ctx, x: number, y: number, w: number, h: number, pxPerM: number, fn: (g: Ctx) => void): void {
  g.save();
  g.beginPath();
  g.rect(x, y, w, h);
  g.clip();
  g.translate(x + w / 2, y + h / 2);
  g.scale(pxPerM, pxPerM);
  fn(g);
  g.restore();
}
