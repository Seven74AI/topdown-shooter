/**
 * Barricades, new orientation (designer 2026-11-25: "take some inspiration from the police barricade for the wood
 * barricade, the orientation and perspective", then "the same for the metal barricade and reinforced barricade").
 * Like the accepted police sawhorse B1: seen straight from above, the top board along the line with its side face
 * just showing, legs splayed symmetrically to the front and back with feet, lower rails near both edges.
 * Drawn in metres on the 2 × 0.5 m frame (x ∈ [−1, 1], y ∈ [−0.25, 0.25]); 1 px = 1/96 m.
 */
import type { Ctx } from "../../../../apps/client/src/render/city/buildingArt";

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

export function inFrameM(g: Ctx, x: number, y: number, w: number, h: number, pxPerM: number, fn: (g: Ctx) => void): void {
  g.save();
  g.beginPath();
  g.rect(x, y, w, h);
  g.clip();
  g.translate(x + w / 2, y + h / 2);
  g.scale(pxPerM, pxPerM);
  fn(g);
  g.restore();
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
function shadow(g: Ctx, x0: number, y0: number, x1: number, y1: number): void {
  g.save();
  g.filter = `blur(${3}px)`;
  g.fillStyle = "rgba(0,0,0,0.4)";
  g.fillRect(x0 + 0.01, y0 + 0.015, x1 - x0, y1 - y0);
  g.restore();
}

/** The sawhorse frame of one unit: lower rails near both edges, splayed legs to the front and back, feet. */
function frame(g: Ctx, xa: number, xb: number, kind: "wood" | "steel", seed: number): void {
  const inset = 0.05;
  const legW = kind === "wood" ? 0.04 : 0.028;
  const railY = 0.165;
  const footY = 0.22;
  const col = kind === "wood" ? "#6e5236" : "#5a5f66";
  shadow(g, xa, -footY, xb, footY);
  for (const s of [-1, 1]) bar(g, xa + inset, s * railY, xb - inset, s * railY, kind === "wood" ? 0.03 : 0.02, kind === "wood" ? "wood" : "steel", kind === "wood" ? "#654a30" : "#4a4e55", seed + s * 7);
  for (const lx of [xa + inset, xb - inset]) {
    for (const s of [-1, 1]) {
      bar(g, lx, 0, lx - 0.008, s * footY, legW, kind === "wood" ? "wood" : "steel", col, seed + Math.round(lx * 50) + s);
      // the foot
      g.fillStyle = "#141518";
      g.fillRect(lx - 0.03, s * footY - 0.014, 0.05, 0.028);
      g.fillStyle = "rgba(255,255,255,0.12)";
      g.fillRect(lx - 0.03, s * footY - 0.014, 0.05, 0.005);
      if (kind === "wood") nail(g, lx - 0.004, s * railY);
      else bolt(g, lx - 0.004, s * railY, 0.007);
    }
  }
}

/** The top board's side face (its thickness, seen just below the top face) as in B1. */
function sideFace(g: Ctx, x0: number, x1: number, yTop: number, yBot: number, col: string): void {
  g.fillStyle = col;
  g.fillRect(x0, yTop, x1 - x0, yBot - yTop);
  g.fillStyle = "rgba(0,0,0,0.25)";
  g.fillRect(x0, yBot - (yBot - yTop) * 0.4, x1 - x0, (yBot - yTop) * 0.4);
  g.strokeStyle = "#060505";
  g.lineWidth = 1.2 * P;
  g.strokeRect(x0, yTop, x1 - x0, yBot - yTop);
}

/** Razor wire coil along x at y: loops seen from above, with barbs. */
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

// ─────────────────────────────── the takes ───────────────────────────────

const UNITS = 3;
const unitX = (u: number): [number, number] => [-1 + (2 * u) / UNITS + 0.02, -1 + (2 * (u + 1)) / UNITS - 0.02];

/** WD1: three wooden sawhorses, each topped with two mismatched nailed planks. */
export function drawWD1(g: Ctx): void {
  for (let u = 0; u < UNITS; u++) {
    const [a, b] = unitX(u);
    frame(g, a, b, "wood", 100 + u * 11);
    sideFace(g, a, b, 0.0, 0.085, "#3a2a1b");
    plank(g, a, -0.075, b, -0.005, WOODS[u % 6] as string, 210 + u);
    plank(g, a + 0.015, -0.005, b - 0.01, 0.065, WOODS[(u + 3) % 6] as string, 230 + u);
    for (const x of [a + 0.04, b - 0.05]) for (const y of [-0.04, 0.03]) nail(g, x, y);
  }
}

/** WD2: one long beam of planks with staggered joints, on four wooden A-frames. */
export function drawWD2(g: Ctx): void {
  for (const [i, x] of [-0.86, -0.3, 0.3, 0.86].entries()) frame(g, x - 0.1, x + 0.1, "wood", 300 + i * 9);
  sideFace(g, -0.98, 0.98, 0.0, 0.09, "#3a2a1b");
  plank(g, -0.98, -0.08, 0.15, -0.012, WOODS[0], 401);
  plank(g, 0.15, -0.08, 0.98, -0.012, WOODS[3], 402);
  plank(g, -0.98, -0.012, -0.35, 0.07, WOODS[1], 403);
  plank(g, -0.35, -0.012, 0.6, 0.07, WOODS[4], 404);
  plank(g, 0.6, -0.012, 0.98, 0.07, WOODS[2], 405);
  for (const x of [-0.86, -0.3, 0.3, 0.86]) for (const y of [-0.05, 0.03]) nail(g, x + (y > 0 ? 0.02 : -0.02), y);
}

/** RF1: the heavy timber beam, steel straps at the joints, razor wire coiled along the top. */
export function drawRF1(g: Ctx): void {
  for (const [i, x] of [-0.86, -0.3, 0.3, 0.86].entries()) frame(g, x - 0.1, x + 0.1, "wood", 500 + i * 9);
  sideFace(g, -0.98, 0.98, 0.02, 0.11, "#33251a");
  plank(g, -0.98, -0.1, 0.98, -0.03, WOODS[2], 601);
  plank(g, -0.98, -0.03, 0.98, 0.04, WOODS[5], 602);
  plank(g, -0.98, 0.04, 0.98, 0.095, WOODS[0], 603);
  for (const x of [-0.86, -0.3, 0.3, 0.86]) {
    steelPlate(g, x - 0.03, -0.11, x + 0.03, 0.105, "#5d636b", 610 + Math.round(x * 10), false);
    bolt(g, x, -0.075);
    bolt(g, x, 0.0);
    bolt(g, x, 0.07);
  }
  razorCoil(g, -0.98, 0.98, -0.005, 0.075, 620);
}

/** RF2: wooden sawhorses with planks, razor wire coils run along both feet lines. */
export function drawRF2(g: Ctx): void {
  razorCoil(g, -0.98, 0.98, -0.17, 0.06, 701);
  razorCoil(g, -0.98, 0.98, 0.17, 0.06, 702);
  for (let u = 0; u < UNITS; u++) {
    const [a, b] = unitX(u);
    frame(g, a, b, "wood", 710 + u * 11);
    sideFace(g, a, b, 0.01, 0.1, "#33251a");
    plank(g, a, -0.085, b, 0.0, WOODS[(u + 1) % 6] as string, 720 + u);
    plank(g, a, 0.0, b, 0.08, WOODS[(u + 4) % 6] as string, 730 + u);
    steelPlate(g, a + 0.02, -0.09, a + 0.07, 0.085, "#5d636b", 740 + u, false);
    steelPlate(g, b - 0.07, -0.09, b - 0.02, 0.085, "#5d636b", 750 + u, false);
    for (const x of [a + 0.045, b - 0.045]) for (const y of [-0.05, 0.04]) bolt(g, x, y, 0.007);
  }
}

/** MT1: three steel sawhorses, each a riveted box beam with hazard stripes, tube legs, rubber feet. */
export function drawMT1(g: Ctx): void {
  for (let u = 0; u < UNITS; u++) {
    const [a, b] = unitX(u);
    frame(g, a, b, "steel", 800 + u * 11);
    sideFace(g, a, b, 0.0, 0.085, "#25282c");
    steelPlate(g, a, -0.075, b, 0.06, "#6a7078", 810 + u, false);
    hazard(g, a + 0.03, -0.055, b - 0.03, 0.04, 820 + u);
    g.strokeStyle = "#0a0b0d";
    g.lineWidth = 1.3 * P;
    g.strokeRect(a + 0.03, -0.055, b - a - 0.06, 0.095);
    for (const x of [a + 0.015, b - 0.015]) for (const y of [-0.06, 0.045]) bolt(g, x, y, 0.006);
  }
}

/** MT2: one long riveted steel plate barrier on steel A-frames, hazard chevrons at both ends. */
export function drawMT2(g: Ctx): void {
  for (const [i, x] of [-0.86, -0.3, 0.3, 0.86].entries()) frame(g, x - 0.1, x + 0.1, "steel", 900 + i * 9);
  sideFace(g, -0.98, 0.98, 0.0, 0.09, "#25282c");
  steelPlate(g, -0.98, -0.085, -0.005, 0.075, "#646a72", 911);
  steelPlate(g, 0.005, -0.085, 0.98, 0.075, "#6b7179", 912);
  hazard(g, -0.96, -0.06, -0.78, 0.05, 913);
  hazard(g, 0.78, -0.06, 0.96, 0.05, 914);
  for (const [x0, x1] of [[-0.96, -0.78], [0.78, 0.96]] as const) {
    g.strokeStyle = "#0a0b0d";
    g.lineWidth = 1.3 * P;
    g.strokeRect(x0, -0.06, x1 - x0, 0.11);
  }
  // the seam strap between the two plates
  steelPlate(g, -0.025, -0.09, 0.025, 0.08, "#51565d", 915, false);
  for (const y of [-0.06, 0.0, 0.055]) bolt(g, 0, y, 0.008);
}
