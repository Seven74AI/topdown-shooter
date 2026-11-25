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
