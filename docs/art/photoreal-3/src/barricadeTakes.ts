/**
 * Barricades, new orientation (designer 2026-11-25: "take some inspiration from the police barricade for the wood
 * barricade, the orientation and perspective", then "the same for the metal barricade and reinforced barricade").
 * Round 2 ("they look like a bench now, same for all others", and "the police barricade has the same problem"): a
 * wide flat top on corner legs reads as a seat. So the boards now stand UP: a thin lit top edge, the front face
 * below it, a long cast shadow that shows the height, and thin A-frame legs splayed to the back and the front (the
 * front legs cross over the face), no stretcher rails. Plus barricade details: X-bracing, posts, razor wire on top,
 * hazard plates, warning lamps.
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

// ─────────────────────────────── round 2: upright ───────────────────────────────

const TOP = -0.1; // the top edge's back line (frame m)
const EDGE = 0.026; // the top edge's depth
const FACE = 0.12; // the front face as seen
const FOOT = 0.205; // legs reach this far to the back and the front

type Painter = (g: Ctx, x0: number, x1: number, y0: number, y1: number) => void;
interface Wall {
  kind: "wood" | "steel";
  /** Leg pairs (x of each A-frame). */
  legs: number[];
  face: Painter;
  edge: string;
  /** Posts standing above the top edge (x), wood or steel. */
  posts?: number[];
  wire?: boolean;
  lamps?: number[];
}

/** A face that darkens towards the ground and a soft contact line at its foot. */
function faceShade(g: Ctx, x0: number, x1: number, y0: number, y1: number): void {
  const gr = g.createLinearGradient(0, y0, 0, y1);
  gr.addColorStop(0, "rgba(0,0,0,0)");
  gr.addColorStop(1, "rgba(0,0,0,0.42)");
  g.fillStyle = gr;
  g.fillRect(x0, y0, x1 - x0, y1 - y0);
}

function leg(g: Ctx, x: number, toY: number, kind: "wood" | "steel", seed: number, out = 0): void {
  const y0 = TOP + EDGE * 0.5;
  const fx = x + out + (toY > 0 ? 0.012 : -0.006);
  bar(g, x, y0, fx, toY, kind === "wood" ? 0.03 : 0.022, kind === "wood" ? "wood" : "steel", kind === "wood" ? "#6a4e33" : "#5a5f66", seed);
  g.fillStyle = "#141518";
  g.fillRect(fx - 0.025, toY - 0.012, 0.05, 0.024);
}

function wall(g: Ctx, x0: number, x1: number, w: Wall, seed: number): void {
  const yF = TOP + EDGE;
  const yB = yF + FACE;
  // the cast shadow: long, to the lower right, so the wall stands up
  g.save();
  g.filter = "blur(4px)";
  g.fillStyle = "rgba(0,0,0,0.68)";
  g.beginPath();
  g.moveTo(x0, yB);
  g.lineTo(x1, yB);
  g.lineTo(x1 + 0.08, yB + 0.135);
  g.lineTo(x0 + 0.08, yB + 0.135);
  g.closePath();
  g.fill();
  g.restore();
  const cx = (x0 + x1) / 2;
  const out = (x: number): number => Math.sign(x - cx) * 0.035;
  for (const [i, x] of w.legs.entries()) leg(g, x, -FOOT, w.kind, seed + i, out(x));
  // posts' faces behind the boards' top edge
  w.face(g, x0, x1, yF, yB);
  faceShade(g, x0, x1, yF, yB);
  g.strokeStyle = "#070605";
  g.lineWidth = 1.4 * P;
  g.strokeRect(x0, yF, x1 - x0, FACE);
  // the top edge, lit
  g.fillStyle = w.edge;
  g.fillRect(x0, TOP, x1 - x0, EDGE);
  g.fillStyle = "rgba(255,245,225,0.35)";
  g.fillRect(x0, TOP, x1 - x0, 1.3 * P);
  g.strokeRect(x0, TOP, x1 - x0, EDGE);
  for (const [i, x] of (w.posts ?? []).entries()) {
    // a post: its face runs down the wall, its top sticks up above the edge
    const pw = 0.05;
    if (w.kind === "wood") {
      bar(g, x, TOP - 0.035, x, yB, pw, "wood", "#5f452c", seed + 40 + i);
      plank(g, x - pw / 2, TOP - 0.055, x + pw / 2, TOP - 0.03, "#9a7a55", seed + 60 + i);
    } else {
      steelPlate(g, x - pw / 2, TOP - 0.04, x + pw / 2, yB, "#50555c", seed + 40 + i, false);
      bolt(g, x, yF + 0.03, 0.007);
      bolt(g, x, yB - 0.03, 0.007);
    }
  }
  if (w.wire) razorCoil(g, x0, x1, TOP + 0.005, 0.055, seed + 80);
  for (const [i, x] of w.legs.entries()) leg(g, x, FOOT, w.kind, seed + 20 + i, out(x));
  for (const x of w.lamps ?? []) {
    // the warning lamp on the top edge
    g.fillStyle = "#1a1b1e";
    g.fillRect(x - 0.03, TOP - 0.04, 0.06, 0.05);
    g.fillStyle = "#ffb52e";
    g.beginPath();
    g.arc(x, TOP - 0.016, 0.021, 0, TAU);
    g.fill();
    g.fillStyle = "#fff1b8";
    g.beginPath();
    g.arc(x - 0.006, TOP - 0.022, 0.008, 0, TAU);
    g.fill();
  }
}

const woodFace = (seed: number, xbrace: boolean): Painter => (g, x0, x1, y0, y1) => {
  const h = (y1 - y0) / 2;
  plank(g, x0, y0, x1, y0 + h, WOODS[seed % 6] as string, seed);
  plank(g, x0, y0 + h, x1, y1, WOODS[(seed + 3) % 6] as string, seed + 1);
  if (xbrace) {
    bar(g, x0 + 0.03, y0 + 0.012, x1 - 0.03, y1 - 0.012, 0.03, "wood", "#6c5034", seed + 2);
    bar(g, x0 + 0.03, y1 - 0.012, x1 - 0.03, y0 + 0.012, 0.03, "wood", "#755838", seed + 3);
  }
  for (const x of [x0 + 0.03, x1 - 0.03]) for (const y of [y0 + h * 0.5, y0 + h * 1.5]) nail(g, x, y);
};

const steelFace = (seed: number, band: boolean): Painter => (g, x0, x1, y0, y1) => {
  steelPlate(g, x0, y0, x1, y1, "#646a72", seed);
  if (band) {
    hazard(g, x0 + 0.02, y0 + 0.03, x1 - 0.02, y1 - 0.03, seed + 1);
    g.strokeStyle = "#0a0b0d";
    g.lineWidth = 1.3 * P;
    g.strokeRect(x0 + 0.02, y0 + 0.03, x1 - x0 - 0.04, y1 - y0 - 0.06);
  }
};

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

const UNITS = 3;
const unitX = (u: number): [number, number] => [-1 + (2 * u) / UNITS + 0.03, -1 + (2 * (u + 1)) / UNITS - 0.03];
const units = (fn: (a: number, b: number, u: number) => void): void => {
  for (let u = 0; u < UNITS; u++) {
    const [a, b] = unitX(u);
    fn(a, b, u);
  }
};
const LONG_LEGS = [-0.8, -0.27, 0.27, 0.8];

/** WD1: three upright wooden sawhorse barricades, two planks with an X brace nailed across. */
export function drawWD1(g: Ctx): void {
  units((a, b, u) => wall(g, a, b, { kind: "wood", legs: [a + 0.06, b - 0.06], face: woodFace(200 + u, true), edge: "#9a7a55" }, 100 + u * 11));
}
/** WD2: one long boarded wall on posts, X braces between them, A-frame legs. */
export function drawWD2(g: Ctx): void {
  wall(g, -0.97, 0.97, { kind: "wood", legs: LONG_LEGS, face: (g, x0, x1, y0, y1) => {
    woodFace(300, false)(g, x0, x1, y0, y1);
    for (let k = 0; k < 3; k++) {
      const a = -0.8 + k * 0.53 + 0.04;
      bar(g, a, y0 + 0.012, a + 0.45, y1 - 0.012, 0.028, "wood", "#6c5034", 310 + k);
    }
  }, edge: "#9a7a55", posts: LONG_LEGS }, 320);
}
/** RF1: the boarded wall on posts, steel straps, razor wire coiled along the top. */
export function drawRF1(g: Ctx): void {
  wall(g, -0.97, 0.97, { kind: "wood", legs: LONG_LEGS, face: (g, x0, x1, y0, y1) => {
    woodFace(500, false)(g, x0, x1, y0, y1);
    for (const x of [-0.55, 0, 0.55]) {
      steelPlate(g, x - 0.04, y0, x + 0.04, y1, "#5d636b", 510 + Math.round(x * 10), false);
      bolt(g, x, y0 + 0.03);
      bolt(g, x, y1 - 0.03);
    }
  }, edge: "#8e7050", posts: LONG_LEGS, wire: true }, 520);
}
/** RF2: X-braced wooden sawhorse barricades with steel corner plates and razor wire on top. */
export function drawRF2(g: Ctx): void {
  units((a, b, u) => wall(g, a, b, { kind: "wood", legs: [a + 0.06, b - 0.06], face: (g, x0, x1, y0, y1) => {
    woodFace(720 + u, true)(g, x0, x1, y0, y1);
    for (const x of [x0, x1 - 0.06]) {
      steelPlate(g, x, y0, x + 0.06, y1, "#5d636b", 740 + u, false);
      bolt(g, x + 0.03, y0 + 0.03, 0.007);
      bolt(g, x + 0.03, y1 - 0.03, 0.007);
    }
  }, edge: "#8e7050", wire: true }, 710 + u * 11));
}
/** MT1: three upright steel barricades, hazard-striped plates on tube A-frames. */
export function drawMT1(g: Ctx): void {
  units((a, b, u) => wall(g, a, b, { kind: "steel", legs: [a + 0.06, b - 0.06], face: steelFace(810 + u, true), edge: "#9aa1a9" }, 800 + u * 11));
}
/** MT2: one long riveted steel plate wall on steel posts, hazard chevrons at both ends. */
export function drawMT2(g: Ctx): void {
  wall(g, -0.97, 0.97, { kind: "steel", legs: LONG_LEGS, face: (g, x0, x1, y0, y1) => {
    steelFace(911, false)(g, x0, x1, y0, y1);
    hazard(g, x0 + 0.02, y0 + 0.025, x0 + 0.2, y1 - 0.025, 913);
    hazard(g, x1 - 0.2, y0 + 0.025, x1 - 0.02, y1 - 0.025, 914);
  }, edge: "#9aa1a9", posts: LONG_LEGS }, 900);
}
/** PB1: the police sawhorse barricade, upright: striped board face, A-frame legs, amber lamps at the ends. */
export function drawPB1(g: Ctx): void {
  units((a, b, u) => wall(g, a, b, { kind: "steel", legs: [a + 0.06, b - 0.06], face: policeFace, edge: "#f1eee6", lamps: u === 0 ? [a + 0.06] : u === UNITS - 1 ? [b - 0.06] : [] }, 950 + u * 11));
}

// ─────────────────────────────── round 3: from the references ───────────────────────────────
// Designer: "still not good, find some references". Meshy references (refs/): real barricades are TALLER than they
// are deep, and read from a raised camera: a big front face, legs and props splayed, junk at the base, and above all
// a long shadow on the street that repeats the slats. So: a 2 × 1 m frame, the ground line low in it, the face
// rising up the frame (heights × 0.6 for the camera tilt), and the shadow cast from the real silhouette.

const TILT = 0.6; // screen metres per metre of height
const YB = 0.24; // the ground line (base of the face)
const sy = (h: number, base = YB): number => base - h * TILT;

/** Draws `paint` with its own cast shadow: the silhouette, sheared down-right onto the ground from the base line. */
function withShadow(g: Ctx, wM: number, hM: number, base: number, paint: (c: Ctx) => void): void {
  const m = g.getTransform();
  const k = Math.hypot(m.a, m.b);
  const W = Math.ceil(wM * k);
  const H = Math.ceil(hM * k);
  const off = document.createElement("canvas");
  off.width = W;
  off.height = H;
  const oc = off.getContext("2d") as Ctx;
  oc.setTransform(k, 0, 0, k, W / 2, H / 2);
  paint(oc);
  const sil = document.createElement("canvas");
  sil.width = W;
  sil.height = H;
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
function sandbag(g: Ctx, x: number, y: number, w: number, seed: number): void {
  const r = rng(seed);
  g.fillStyle = ["#a28d63", "#968259", "#ab9669"][Math.floor(r() * 3)] as string;
  g.beginPath();
  g.ellipse(x, y, w / 2, w * 0.3, (r() - 0.5) * 0.15, 0, TAU);
  g.fill();
  g.strokeStyle = "rgba(60,48,30,0.7)";
  g.lineWidth = P;
  for (let i = -2; i <= 2; i++) {
    g.beginPath();
    g.moveTo(x + i * w * 0.15, y - w * 0.15);
    g.lineTo(x + i * w * 0.15 + 0.005, y + w * 0.15);
    g.stroke();
  }
  g.strokeStyle = "#0b0906";
  g.lineWidth = 1.3 * P;
  g.beginPath();
  g.ellipse(x, y, w / 2, w * 0.3, 0, 0, TAU);
  g.stroke();
  // the bag's lit top and its tied end
  g.fillStyle = "rgba(255,240,210,0.22)";
  g.beginPath();
  g.ellipse(x - w * 0.05, y - w * 0.13, w * 0.36, w * 0.1, 0, 0, TAU);
  g.fill();
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
export function drawPB3(g: Ctx): void {
  withShadow(g, 2, 1, YB, (c) => {
    for (let u = 0; u < 3; u++) {
      const cx = -0.64 + u * 0.64;
      const back = YB - 0.08;
      const front = YB + 0.05;
      const top = sy(1.0, YB - 0.015);
      for (const s of [-1, 1]) {
        bar(c, cx + s * 0.24, top, cx + s * 0.27, back, 0.026, "steel", "#cfd2d4", 3000 + u * 4 + s); // back legs
      }
      for (const s of [-1, 1]) {
        bar(c, cx + s * 0.24, top, cx + s * 0.27, front, 0.028, "steel", "#e2e4e5", 3010 + u * 4 + s); // front legs
        c.fillStyle = "#121315";
        c.fillRect(cx + s * 0.27 - 0.022, front - 0.01, 0.044, 0.02);
        c.fillRect(cx + s * 0.27 - 0.022, back - 0.01, 0.044, 0.02);
      }
      policeBoard(c, cx - 0.3, cx + 0.3, 0.78, 0.97, YB + 0.01);
      policeBoard(c, cx - 0.29, cx + 0.29, 0.32, 0.48, YB + 0.03);
      for (const x of [cx - 0.24, cx + 0.24]) {
        bolt(c, x, sy(0.875, YB + 0.01), 0.008);
        bolt(c, x, sy(0.4, YB + 0.03), 0.008);
      }
      if (u !== 1) lamp(c, cx + (u === 0 ? -0.22 : 0.22), sy(1.0, YB + 0.01) - 0.05);
    }
  });
}

/** A stake's sharpened top: two cut faces, the lit one fresh and pale. */
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

/** The WD3 wall itself (front view, x from −0.97 to 0.97), shared by both faces. */
function wd3Wall(c: Ctx, inside: boolean): void {
  const r = rng(4100);
  const stakes = (x0: number, n: number, hMin: number, hVar: number, seed: number, grey: boolean): void => {
    for (let i = 0; i < n; i++) {
      const x = x0 + i * 0.075;
      const h = hMin + r() * hVar;
      const lean = (r() - 0.5) * 0.02;
      stake(c, x, 0.07, h, grey && i % 2 ? "#8a8577" : (WOODS[(i + seed) % 6] as string), seed * 10 + i, YB, lean);
      point(c, x + lean, 0.07, sy(h));
    }
  };
  stakes(-0.94, 6, 0.9, 0.22, 411, false);
  door(c, -0.5, -0.12, 1.02, 4130);
  pallet(c, -0.1, 0.32, 0.95, 4140);
  stakes(0.37, 5, 0.86, 0.25, 415, true);
  pallet(c, 0.74, 0.97, 0.88, 4160);
  if (inside) {
    // the cross planks are nailed on the inside
    plank(c, -0.97, sy(0.66) - 0.025, 0.2, sy(0.66) + 0.022, "#7a5c3c", 4170);
    plank(c, 0.25, sy(0.36) - 0.025, 0.97, sy(0.36) + 0.022, "#6f5235", 4171);
    for (let x = -0.92; x < 0.2; x += 0.075) nail(c, x, sy(0.66));
    for (let x = 0.3; x < 0.97; x += 0.075) nail(c, x, sy(0.36));
  } else {
    // from outside only the nail tips poking through, and grime splashed up from the street
    for (let x = -0.92; x < 0.2; x += 0.075) nail(c, x, sy(0.66));
    for (let x = 0.3; x < 0.97; x += 0.075) nail(c, x, sy(0.36));
    const gr = c.createLinearGradient(0, sy(0.3), 0, YB);
    gr.addColorStop(0, "rgba(25,20,14,0)");
    gr.addColorStop(1, "rgba(25,20,14,0.55)");
    c.fillStyle = gr;
    c.fillRect(-0.97, sy(0.3), 1.94, YB - sy(0.3));
  }
}

/** WD3 inside face: the braced side, props leaning on it, junk at the foot. */
export function drawWD3(g: Ctx): void {
  withShadow(g, 2, 1, YB, (c) => {
    wd3Wall(c, true);
    for (const x of [-0.75, 0.1, 0.62]) bar(c, x, sy(0.72), x + 0.08, YB + 0.17, 0.05, "wood", "#6a4e33", 4180 + Math.round(x * 10));
    for (const x of [-0.75, 0.1, 0.62]) {
      nail(c, x + 0.005, sy(0.72) + 0.012);
      c.fillStyle = "#3a3d42";
      c.fillRect(x + 0.05, YB + 0.155, 0.06, 0.03);
    }
    cinder(c, -0.3, YB + 0.13);
    cinder(c, -0.18, YB + 0.15);
    tyre(c, 0.42, YB + 0.13, 0.08);
  });
}

/** WD3 outside face: the same wall turned round (mirrored), no braces, a row of sharpened stakes angled at the street. */
export function drawWD3out(g: Ctx): void {
  withShadow(g, 2, 1, YB, (c) => {
    c.save();
    c.scale(-1, 1);
    wd3Wall(c, false);
    c.restore();
    const r = rng(4700);
    for (let x = -0.86; x < 0.9; x += 0.24 + r() * 0.06) {
      // crossed pairs of sharpened stakes driven in at the wall's foot, pointing out at the street
      for (const dir of [-1, 1]) {
      const tipX = x + dir * (0.09 + r() * 0.03);
      const tipY = YB + 0.13 + r() * 0.03;
      bar(c, x - dir * 0.03, YB - 0.01, tipX, tipY, 0.036, "wood", "#6a4e33", 4710 + Math.round(x * 100) + dir);
      c.fillStyle = "#c2a175";
      c.beginPath();
      c.arc(tipX, tipY, 0.016, 0, TAU);
      c.fill();
      c.strokeStyle = "#0a0806";
      c.lineWidth = 1.1 * P;
      c.stroke();
      }
    }
  });
}

/** RF3: the scavenged wall reinforced: corrugated steel sheets bolted on, chains, razor wire coiled along the top. */
export function drawRF3(g: Ctx): void {
  withShadow(g, 2, 1, YB, (c) => {
    const r = rng(5100);
    for (let i = 0; i < 26; i++) stake(c, -0.95 + i * 0.075, 0.07, 0.95 + r() * 0.1, WOODS[i % 6] as string, 5110 + i, YB, (r() - 0.5) * 0.015);
    corrugated(c, -0.82, -0.3, sy(0.85), sy(0.12), 5140);
    corrugated(c, 0.05, 0.62, sy(0.9), sy(0.18), 5141);
    pallet(c, -0.28, 0.04, 0.8, 5150);
    plank(c, -0.97, sy(0.95) - 0.02, 0.97, sy(0.95) + 0.025, "#6f5235", 5160);
    for (let x = -0.92; x < 0.97; x += 0.15) bolt(c, x, sy(0.95) + 0.003, 0.008);
    chain(c, -0.9, sy(0.5), -0.3, sy(0.55), 0.06);
    chain(c, 0.1, sy(0.6), 0.9, sy(0.52), 0.07);
    razorCoil(c, -0.97, 0.97, sy(1.06), 0.085, 5170);
    for (const x of [-0.6, 0.35, 0.85]) bar(c, x, sy(0.7), x + 0.08, YB + 0.17, 0.055, "wood", "#5f452c", 5180 + Math.round(x * 10));
    cinder(c, -0.05, YB + 0.14);
    tyre(c, 0.7, YB + 0.14, 0.075);
  });
}

/** MT3: welded steel panels with hazard stripes, steel beam props in front, sandbags along the base. */
export function drawMT3(g: Ctx): void {
  withShadow(g, 2, 1, YB, (c) => {
    const panels: [number, number, number][] = [[-0.96, -0.34, 0.95], [-0.36, 0.3, 1.02], [0.28, 0.96, 0.92]];
    for (const [i, [x0, x1, h]] of panels.entries()) {
      steelPlate(c, x0, sy(h), x1, YB, ["#5d636a", "#666c73", "#596067"][i] as string, 6100 + i);
      hazard(c, x0 + 0.04, sy(h * 0.62), x1 - 0.04, sy(h * 0.3), 6110 + i);
      c.strokeStyle = "#0a0b0d";
      c.lineWidth = 1.3 * P;
      c.strokeRect(x0 + 0.04, sy(h * 0.62), x1 - x0 - 0.08, sy(h * 0.3) - sy(h * 0.62));
      c.fillStyle = "rgba(255,255,255,0.35)";
      c.fillRect(x0, sy(h) - 0.014, x1 - x0, 0.014); // the plate's top edge
    }
    // weld seams
    for (const x of [-0.35, 0.29]) {
      c.strokeStyle = "rgba(30,24,18,0.9)";
      c.lineWidth = 3 * P;
      c.beginPath();
      c.moveTo(x, sy(0.9));
      c.lineTo(x, YB);
      c.stroke();
    }
    for (const x of [-0.72, -0.02, 0.65]) {
      bar(c, x, sy(0.72), x + 0.09, YB + 0.17, 0.045, "steel", "#4c5157", 6120 + Math.round(x * 10));
      bolt(c, x, sy(0.72) + 0.01, 0.01);
    }
    // two courses of sandbags against the base: the upper course behind, the lower in front
    for (let i = 0; i < 8; i++) sandbag(c, -0.82 + i * 0.235, YB + 0.03, 0.24, 6140 + i);
    for (let i = 0; i < 9; i++) sandbag(c, -0.93 + i * 0.235, YB + 0.1, 0.25, 6130 + i);
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
function wd3Side(g: Ctx, braceSide: 1 | -1): void {
  const H = 1.0;
  const up = H * TILT;
  const r = rng(4400);
  // the parts, north to south (the same for both orientations)
  const parts: { y0: number; y1: number; h: number; col: string; w: number }[] = [];
  let y = SN;
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
export function drawWD3sideE(g: Ctx): void {
  wd3Side(g, 1);
}
export function drawWD3sideW(g: Ctx): void {
  wd3Side(g, -1);
}
/** Kept for the round 3b demo. */
export const drawWD3side = drawWD3sideE;

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
export function drawCornerPost(g: Ctx): void {
  const base = 0.35;
  const H = 1.15;
  g.save();
  g.filter = "blur(1.5px)";
  g.fillStyle = "rgba(0,0,0,0.62)";
  g.beginPath();
  g.moveTo(-0.07, base);
  g.lineTo(0.07, base);
  g.lineTo(0.07 + H * TILT * 0.55, base + H * TILT * 0.32);
  g.lineTo(-0.07 + H * TILT * 0.55, base + H * TILT * 0.32);
  g.closePath();
  g.fill();
  g.restore();
  bar(g, 0, base, 0, base - H * TILT, 0.14, "wood", "#5f452c", 4600);
  plank(g, -0.07, base - H * TILT - 0.07, 0.07, base - H * TILT, "#9a7a55", 4601); // its top
  for (const t of [0.3, 0.7]) {
    g.fillStyle = "#3a3d42";
    g.fillRect(-0.075, base - H * TILT * t - 0.012, 0.15, 0.024);
    bolt(g, 0, base - H * TILT * t, 0.009);
  }
}
