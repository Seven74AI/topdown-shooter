/**
 * Stories 6.2 / 6.4: the Ruins and Collapse bake painters, ported from the designer's picks
 * (`docs/art/epic-6/src/main1.js` › rubblePile, chunk, brick, rebarStick, beamPiece, dustSkirt,
 * gravel, brokenRoof, breach, soot, MATS; `main2.js` › deadLampHead, fallenLamp, floodPuddles;
 * helpers from `lib.js` › part, castShadow, polyTex, woodTex, steelTex, blobPath). Pure canvas code
 * in METRES (the caller scales map px → m), seeded by object-name hash, so the same pile looks the
 * same in every bake. Runs only inside the city bake (`drawCity.ts › drawOverlay`, registered as
 * `city_static_*`: Story 4.13 redraws it), never per frame.
 */

type G = CanvasRenderingContext2D;
const TAU = Math.PI * 2;

/** Story 6.2 (D6): the materials RU1–RU4 (index = `RUINS_LOOKS` index: concrete, brick, slab, gutted). */
export interface RuinsMat {
  readonly cols: readonly string[];
  readonly dust: string;
  readonly rebar: boolean;
  readonly beam: boolean;
  readonly embers: boolean;
}
export const RUINS_MATS: readonly RuinsMat[] = [
  { cols: ["#8f8b82", "#7d7a72", "#a09b90", "#6c6962", "#aaa69c"], dust: "184,176,160", rebar: true, beam: false, embers: false },
  { cols: ["#7b3f2c", "#8a4a33", "#6a3424", "#94553a", "#5c2e22", "#9c8f80"], dust: "176,128,98", rebar: false, beam: true, embers: false },
  { cols: ["#8f8b82", "#807d75", "#9a968c", "#73706a"], dust: "176,170,156", rebar: true, beam: false, embers: false },
  { cols: ["#2b2725", "#36302c", "#221f1e", "#3e3631", "#4a3f37"], dust: "90,84,80", rebar: true, beam: true, embers: true },
];
const BRICK = 1;
const SLAB = 2;
const GUTTED = 3;

/** One device pixel in metres at the current transform (the lab's global `P`). */
let P = 1 / 64;
function setP(g: G): void {
  const m = g.getTransform();
  P = 1 / Math.max(1e-6, Math.hypot(m.a, m.b));
}

export function mulberry32(seed: number): () => number {
  let a = seed | 0;
  return () => {
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function shade(hex: string, t: number): string {
  const n = parseInt(hex.slice(1), 16);
  const f = t < 0 ? 0 : 255;
  const a = Math.abs(t);
  const ch = (v: number): number => Math.round(v + (f - v) * a);
  return `rgb(${ch((n >> 16) & 255)},${ch((n >> 8) & 255)},${ch(n & 255)})`;
}
const lerp = (a: number, b: number, t: number): number => a + (b - a) * t;

type Path = (q: G) => void;
function rectPath(q: G, x: number, y: number, w: number, h: number, r = 0): void {
  if (!r) {
    q.moveTo(x, y);
    q.lineTo(x + w, y);
    q.lineTo(x + w, y + h);
    q.lineTo(x, y + h);
    q.closePath();
    return;
  }
  r = Math.min(r, w / 2, h / 2);
  q.moveTo(x + r, y);
  q.arcTo(x + w, y, x + w, y + h, r);
  q.arcTo(x + w, y + h, x, y + h, r);
  q.arcTo(x, y + h, x, y, r);
  q.arcTo(x, y, x + w, y, r);
  q.closePath();
}
function ellPath(q: G, x: number, y: number, rx: number, ry: number, a = 0): void {
  q.moveTo(x + rx * Math.cos(a), y + rx * Math.sin(a));
  q.ellipse(x, y, Math.max(1e-5, rx), Math.max(1e-5, ry), a, 0, TAU);
  q.closePath();
}
function polyPath(q: G, p: readonly number[]): void {
  q.moveTo(p[0] as number, p[1] as number);
  for (let i = 2; i < p.length; i += 2) q.lineTo(p[i] as number, p[i + 1] as number);
  q.closePath();
}
function blobPath(q: G, cx: number, cy: number, rx: number, ry: number, seed: number, amp = 0.15, n = 56): void {
  const r = mulberry32(seed);
  const ph = [r() * TAU, r() * TAU, r() * TAU] as const;
  for (let i = 0; i <= n; i++) {
    const a = (i / n) * TAU;
    const k = 1 + amp * (0.5 * Math.sin(a * 2 + ph[0]) + 0.3 * Math.sin(a * 3 + ph[1]) + 0.2 * Math.sin(a * 5 + ph[2]));
    const X = cx + Math.cos(a) * rx * k;
    const Y = cy + Math.sin(a) * ry * k;
    if (i) q.lineTo(X, Y);
    else q.moveTo(X, Y);
  }
  q.closePath();
}
function fillP(g: G, fn: Path, style: string): void {
  g.beginPath();
  fn(g);
  g.fillStyle = style;
  g.fill();
}
function strokeP(g: G, fn: Path, style: string, w: number): void {
  g.beginPath();
  fn(g);
  g.strokeStyle = style;
  g.lineWidth = w;
  g.lineCap = "round";
  g.lineJoin = "round";
  g.stroke();
}
function devToLocal(g: G, dx: number, dy: number): [number, number] {
  const m = g.getTransform();
  const det = m.a * m.d - m.b * m.c;
  return [(m.d * dx - m.c * dy) / det, (-m.b * dx + m.a * dy) / det];
}
function lightDir(g: G): [number, number] {
  const v = devToLocal(g, -1, -1);
  const l = Math.hypot(v[0], v[1]) || 1;
  return [v[0] / l, v[1] / l];
}
function glow(g: G, x: number, y: number, r: number, rgb: string, a: number): void {
  g.save();
  g.globalCompositeOperation = "lighter";
  const gr = g.createRadialGradient(x, y, 0, x, y, r);
  gr.addColorStop(0, `rgba(${rgb},${a})`);
  gr.addColorStop(0.3, `rgba(${rgb},${a * 0.5})`);
  gr.addColorStop(1, `rgba(${rgb},0)`);
  g.fillStyle = gr;
  g.beginPath();
  g.arc(x, y, r, 0, TAU);
  g.fill();
  g.restore();
}
/** Soft cast shadow (lab: drawn far away, thrown back with shadowOffset). */
function castShadow(g: G, fn: Path, dx: number, dy: number, blur: number, a: number): void {
  const m = g.getTransform();
  const s = Math.hypot(m.a, m.b);
  g.save();
  g.translate(-4000 / s, 0);
  g.shadowColor = `rgba(0,0,0,${a})`;
  g.shadowOffsetX = (4000 * m.a) / s + dx * s;
  g.shadowOffsetY = dy * s;
  g.shadowBlur = blur * s;
  g.fillStyle = "#000";
  g.beginPath();
  fn(g);
  g.fill();
  g.restore();
}
type Tex = (g: G, x0: number, y0: number, x1: number, y1: number) => void;
function polyTex(seed: number): Tex {
  return (g, x0, y0, x1, y1) => {
    const r = mulberry32(seed);
    const w = x1 - x0;
    const h = y1 - y0;
    const n = Math.min(400, ((w * h) / (P * P)) * 0.12);
    for (let i = 0; i < n; i++) {
      g.fillStyle = r() < 0.5 ? `rgba(255,255,255,${0.025 + r() * 0.05})` : `rgba(0,0,0,${0.08 + r() * 0.12})`;
      g.fillRect(x0 + r() * w, y0 + r() * h, P * (0.8 + r()), P * (0.8 + r()));
    }
  };
}
function woodTex(seed: number): Tex {
  return (g, x0, y0, x1, y1) => {
    const r = mulberry32(seed);
    const cx = (x0 + x1) / 2;
    const cy = (y0 + y1) / 2;
    const L = Math.hypot(x1 - x0, y1 - y0);
    for (let i = 0; i < 24; i++) {
      const y = cy + (r() - 0.5) * L;
      g.beginPath();
      g.moveTo(cx - L / 2, y);
      g.lineTo(cx + L / 2, y + (r() - 0.5) * L * 0.02);
      g.strokeStyle = r() < 0.72 ? `rgba(28,14,6,${0.14 + r() * 0.32})` : `rgba(205,160,110,${0.05 + r() * 0.1})`;
      g.lineWidth = (0.5 + r() * 1.5) * P;
      g.stroke();
    }
  };
}
function steelTex(seed: number): Tex {
  return (g, x0, y0, x1, y1) => {
    const r = mulberry32(seed);
    const w = x1 - x0;
    const h = y1 - y0;
    for (let i = 0; i < 40; i++) {
      g.fillStyle = r() < 0.5 ? `rgba(200,210,225,${0.03 + r() * 0.05})` : `rgba(0,0,0,${0.05 + r() * 0.08})`;
      g.fillRect(x0 + r() * w, y0 + r() * h, w * (0.05 + r() * 0.3), 0.6 * P);
    }
  };
}
interface PartOpts {
  readonly base: string;
  readonly lit: "top" | "radial";
  readonly box: readonly [number, number, number, number];
  readonly tex?: Tex;
  readonly hi?: number;
  readonly lo?: number;
  readonly rim?: number;
  readonly inner?: number;
  readonly line?: number;
}
/** One shaded part (lab `part`): fill, texture, light gradient, rim upper-left, inner shade, outline. */
function part(g: G, path: Path, o: PartOpts): void {
  const [x0, y0, x1, y1] = o.box;
  const cx = (x0 + x1) / 2;
  const cy = (y0 + y1) / 2;
  const w = x1 - x0;
  const h = y1 - y0;
  g.beginPath();
  path(g);
  g.fillStyle = o.base;
  g.fill();
  g.save();
  g.clip();
  if (o.tex) o.tex(g, x0, y0, x1, y1);
  const hi = o.hi ?? 0.22;
  const lo = o.lo ?? 0.4;
  const L = lightDir(g);
  let gr: CanvasGradient;
  if (o.lit === "top") {
    const s = Math.hypot(w, h) / 2;
    gr = g.createLinearGradient(cx + L[0] * s, cy + L[1] * s, cx - L[0] * s, cy - L[1] * s);
    gr.addColorStop(0, `rgba(200,215,240,${hi})`);
    gr.addColorStop(0.5, "rgba(0,0,0,0)");
    gr.addColorStop(1, `rgba(0,0,0,${lo})`);
  } else {
    const m = Math.max(w, h);
    gr = g.createRadialGradient(cx + L[0] * w * 0.28, cy + L[1] * h * 0.32, 0, cx, cy, m * 0.62);
    gr.addColorStop(0, `rgba(225,235,255,${hi})`);
    gr.addColorStop(0.45, "rgba(0,0,0,0)");
    gr.addColorStop(1, `rgba(0,0,0,${lo})`);
  }
  g.fillStyle = gr;
  g.fillRect(x0 - w, y0 - h, w * 3, h * 3);
  const rim = o.rim ?? 0.42;
  if (rim > 0) {
    const d = devToLocal(g, 1.5 * 2, 1.7 * 2);
    g.beginPath();
    g.rect(x0 - w, y0 - h, w * 3, h * 3);
    g.save();
    g.translate(d[0], d[1]);
    path(g);
    g.restore();
    g.fillStyle = `rgba(195,210,235,${rim})`;
    g.fill("evenodd");
  }
  const dk = o.inner ?? 0.32;
  if (dk > 0) {
    const d = devToLocal(g, -1.3 * 2, -1.5 * 2);
    g.beginPath();
    g.rect(x0 - w, y0 - h, w * 3, h * 3);
    g.save();
    g.translate(d[0], d[1]);
    path(g);
    g.restore();
    g.fillStyle = `rgba(0,0,0,${dk})`;
    g.fill("evenodd");
  }
  g.restore();
  if (o.line !== 0) {
    g.beginPath();
    path(g);
    g.lineJoin = "round";
    g.strokeStyle = "rgba(4,4,6,0.95)";
    g.lineWidth = (o.line ?? 1.3) * P;
    g.stroke();
  }
}

function chunk(g: G, x: number, y: number, s: number, rot: number, col: string, seed: number): void {
  const r = mulberry32(seed);
  const n = 5 + ((r() * 3) | 0);
  const pts: number[] = [];
  for (let i = 0; i < n; i++) {
    const a = (i / n) * TAU + r() * 0.6;
    const d = s * (0.62 + r() * 0.45);
    pts.push(x + Math.cos(a + rot) * d, y + Math.sin(a + rot) * d * 0.85);
  }
  part(g, (q) => polyPath(q, pts), { base: col, lit: "top", box: [x - s, y - s, x + s, y + s], hi: 0.32, lo: 0.5, rim: 0.35, inner: 0.3, line: 1.1, tex: polyTex(seed) });
  if (s > 0.12) {
    strokeP(
      g,
      (q) => {
        q.moveTo(x - s * 0.3, y - s * 0.2);
        q.lineTo(x + s * 0.1, y + s * 0.05);
        q.lineTo(x + s * 0.35, y - s * 0.1);
      },
      "rgba(0,0,0,0.45)",
      0.9 * P,
    );
  }
}
function brick(g: G, x: number, y: number, rot: number, col: string, seed: number): void {
  g.save();
  g.translate(x, y);
  g.rotate(rot);
  const w = 0.22;
  const h = 0.1;
  part(g, (q) => rectPath(q, -w / 2, -h / 2, w, h, 0.012), { base: col, lit: "top", box: [-w / 2, -h / 2, w / 2, h / 2], hi: 0.3, lo: 0.45, rim: 0.3, inner: 0.25, line: 0.9, tex: polyTex(seed) });
  g.restore();
}
function rebarStick(g: G, x: number, y: number, a: number, L: number): void {
  const x2 = x + Math.cos(a) * L;
  const y2 = y + Math.sin(a) * L * 0.9;
  const path: Path = (q) => {
    q.moveTo(x, y);
    q.quadraticCurveTo((x + x2) / 2 + L * 0.12, (y + y2) / 2, x2, y2);
  };
  strokeP(g, path, "#130d09", 0.05);
  strokeP(g, path, "#7d4527", 0.028);
}
function beamPiece(g: G, x: number, y: number, a: number, L: number, w: number, col: string, seed: number): void {
  g.save();
  g.translate(x, y);
  g.rotate(a);
  part(g, (q) => rectPath(q, -L / 2, -w / 2, L, w, 0.01), { base: col, lit: "top", box: [-L / 2, -w / 2, L / 2, w / 2], tex: woodTex(seed), hi: 0.25, lo: 0.45, rim: 0.3, line: 1.1 });
  g.restore();
}
function dustSkirt(g: G, x: number, y: number, rx: number, ry: number, rgb: string, a: number): void {
  g.save();
  g.translate(x, y);
  g.scale(1, ry / rx);
  const gr = g.createRadialGradient(0, 0, 0, 0, 0, rx);
  gr.addColorStop(0, `rgba(${rgb},${a})`);
  gr.addColorStop(0.6, `rgba(${rgb},${a * 0.5})`);
  gr.addColorStop(1, `rgba(${rgb},0)`);
  g.fillStyle = gr;
  g.beginPath();
  g.arc(0, 0, rx, 0, TAU);
  g.fill();
  g.restore();
}
function gravel(g: G, x: number, y: number, rx: number, ry: number, n: number, cols: readonly string[], seed: number): void {
  const r = mulberry32(seed);
  for (let i = 0; i < n; i++) {
    const a = r() * TAU;
    const d = Math.sqrt(r());
    const px = x + Math.cos(a) * rx * d;
    const py = y + Math.sin(a) * ry * d;
    const s = 0.015 + r() * 0.04;
    fillP(g, (q) => ellPath(q, px, py, s, s * 0.7, r() * 3), cols[(r() * cols.length) | 0] as string);
    fillP(g, (q) => ellPath(q, px + s * 0.3, py + s * 0.4, s * 0.8, s * 0.5), "rgba(0,0,0,0.35)");
  }
}

/**
 * Story 6.2: a rubble pile ≈ w × h (HARD COVER, brief 13: it must read as solid): dust skirt,
 * gravel, a cast shadow, one lit mound, chunks big-to-small, rebar / beams; RU3 adds wall slabs,
 * RU2 bricks, RU4 embers.
 */
export function rubblePile(g: G, cx: number, cy: number, w: number, h: number, seed: number, mat: number): void {
  setP(g);
  const M = RUINS_MATS[mat] ?? (RUINS_MATS[0] as RuinsMat);
  const r = mulberry32(seed);
  dustSkirt(g, cx, cy, w * 0.75, h * 0.75, M.dust, mat === GUTTED ? 0.35 : 0.22);
  gravel(g, cx, cy, w * 0.7, h * 0.7, 60, [...M.cols, "#3a3835"], seed + 1);
  interface Item {
    k: "slab" | "c" | "b";
    x: number;
    y: number;
    s: number;
    a: number;
    L: number;
    W: number;
    col: string;
  }
  const items: Item[] = [];
  if (mat === SLAB) {
    items.push({ k: "slab", x: cx - w * 0.08, y: cy - h * 0.05, a: (r() - 0.5) * 0.7, L: w * 0.8, W: h * 0.62, s: 0, col: "" });
    items.push({ k: "slab", x: cx + w * 0.22, y: cy + h * 0.2, a: (r() - 0.5) * 0.9 + 0.5, L: w * 0.42, W: h * 0.4, s: 0, col: "" });
  }
  const n = mat === BRICK ? 14 : mat === SLAB ? 8 : 22;
  for (let i = 0; i < n; i++) {
    const a = r() * TAU;
    const d = Math.pow(r(), 0.8) * 0.42;
    items.push({ k: "c", x: cx + Math.cos(a) * w * d, y: cy + Math.sin(a) * h * d, s: (0.16 + r() * 0.26) * (1 - d * 0.9) * (mat === BRICK ? 0.8 : 1) * Math.min(1.2, w / 1.6), a: r() * TAU, L: 0, W: 0, col: M.cols[i % M.cols.length] as string });
  }
  if (mat === BRICK) {
    for (let i = 0; i < 30; i++) {
      const a = r() * TAU;
      const d = Math.sqrt(r()) * 0.52;
      items.push({ k: "b", x: cx + Math.cos(a) * w * d, y: cy + Math.sin(a) * h * d, a: r() * TAU, s: 0.1, L: 0, W: 0, col: M.cols[(r() * 5) | 0] as string });
    }
  }
  const mound: Path = (q) => blobPath(q, cx, cy, w * 0.47, h * 0.45, seed + 9, 0.22, 48);
  castShadow(g, mound, 0.22, 0.32, 0.12, 0.7);
  part(g, mound, { base: shade(M.cols[0] as string, mat === GUTTED ? 0 : -0.25), lit: "radial", box: [cx - w / 2, cy - h / 2, cx + w / 2, cy + h / 2], tex: polyTex(seed + 2), hi: 0.3, lo: 0.6, rim: 0.3, inner: 0.35, line: 1.4 });
  gravel(g, cx, cy, w * 0.42, h * 0.4, 50, M.cols, seed + 6);
  items.sort((p, q) => (q.s || q.L || 0.1) - (p.s || p.L || 0.1));
  for (const it of items) {
    if (it.k === "slab") {
      g.save();
      g.translate(it.x, it.y);
      g.rotate(it.a);
      castShadow(g, (q) => rectPath(q, -it.L / 2, -it.W / 2, it.L, it.W, 0.03), 0.16, 0.22, 0.08, 0.6);
      part(g, (q) => polyPath(q, [-it.L / 2, -it.W / 2, it.L / 2 - 0.12, -it.W / 2, it.L / 2, -it.W / 2 + 0.1, it.L / 2 - 0.05, it.W / 2, -it.L / 2 + 0.15, it.W / 2, -it.L / 2, it.W / 2 - 0.12]), {
        base: "#8a867d",
        lit: "top",
        box: [-it.L / 2, -it.W / 2, it.L / 2, it.W / 2],
        tex: polyTex(seed + 7),
        hi: 0.35,
        lo: 0.45,
        rim: 0.45,
        line: 1.3,
      });
      for (let k = 0; k < 3; k++) rebarStick(g, it.L / 2 - 0.05, -it.W / 3 + (k * it.W) / 3, 0.2 - k * 0.2, 0.28);
      g.restore();
    } else if (it.k === "b") brick(g, it.x, it.y, it.a, it.col, seed + ((it.x * 100) | 0));
    else chunk(g, it.x, it.y, it.s, it.a, it.col, seed + ((it.x * 991 + it.y * 37) | 0));
  }
  if (M.beam) {
    beamPiece(g, cx - w * 0.1, cy - h * 0.12, (r() - 0.5) * 1.2, w * 0.62, 0.12, mat === GUTTED ? "#1f1915" : "#5e4630", seed + 3);
    beamPiece(g, cx + w * 0.15, cy + h * 0.15, (r() - 0.5) * 1.2 + 1.2, w * 0.4, 0.1, mat === GUTTED ? "#241c17" : "#6b5036", seed + 4);
  }
  if (M.rebar) for (let i = 0; i < 4; i++) rebarStick(g, cx + (r() - 0.5) * w * 0.5, cy + (r() - 0.5) * h * 0.5, r() * TAU, 0.3 + r() * 0.35);
  if (M.embers) {
    for (let i = 0; i < 6; i++) {
      const x = cx + (r() - 0.5) * w * 0.6;
      const y = cy + (r() - 0.5) * h * 0.6;
      glow(g, x, y, 0.18, "255,120,40", 0.5);
      fillP(g, (q) => ellPath(q, x, y, 0.03, 0.02), "rgba(255,190,90,0.9)");
    }
  }
}

/**
 * Story 6.2 (D1): the collapsed alley's heap, wall to wall over the box (x, y, w, h): a chain of
 * piles along its length, the biggest at the street end (`streetEnd`: "min" = the box's min edge on
 * its long axis faces the street, "max" the other way).
 */
export function alleyHeap(g: G, x: number, y: number, w: number, h: number, seed: number, mat: number, streetEnd: "min" | "max"): void {
  const vertical = h >= w;
  const len = vertical ? h : w;
  const across = vertical ? w : h;
  const n = Math.max(2, Math.round(len / 2));
  for (let i = 0; i < n; i++) {
    const t = (i + 0.5) / n;
    const fromStreet = streetEnd === "min" ? t : 1 - t;
    const k = 1.15 - 0.35 * fromStreet; // biggest at the street end
    const along = (vertical ? y : x) + t * len;
    const cx = vertical ? x + across / 2 : along;
    const cy = vertical ? along : y + across / 2;
    const pw = vertical ? across * 1.08 * k : (len / n) * 1.5 * k;
    const ph = vertical ? (len / n) * 1.5 * k : across * 1.08 * k;
    rubblePile(g, cx, cy, pw, ph, seed + i * 31, mat);
  }
}

/** Flat walkable spill (no mound, no shadow): reads as debris, not cover (brief 13). */
export function flatSpill(g: G, x: number, y: number, w: number, h: number, seed: number, mat: number): void {
  setP(g);
  const M = RUINS_MATS[mat] ?? (RUINS_MATS[0] as RuinsMat);
  dustSkirt(g, x + w / 2, y + h / 2, w * 0.6, h * 0.6, M.dust, 0.2);
  gravel(g, x + w / 2, y + h / 2, w * 0.5, h * 0.5, 70, M.cols, seed);
}

/** A broken roof corner (visual only): the roof gone inside `poly` (metres), floor, beams, jagged edge. */
export function brokenRoof(g: G, poly: readonly number[], seed: number, mat: number): void {
  setP(g);
  const M = RUINS_MATS[mat] ?? (RUINS_MATS[0] as RuinsMat);
  const r = mulberry32(seed);
  g.save();
  g.beginPath();
  polyPath(g, poly);
  g.clip();
  let x0 = 1e9;
  let y0 = 1e9;
  let x1 = -1e9;
  let y1 = -1e9;
  for (let i = 0; i < poly.length; i += 2) {
    x0 = Math.min(x0, poly[i] as number);
    x1 = Math.max(x1, poly[i] as number);
    y0 = Math.min(y0, poly[i + 1] as number);
    y1 = Math.max(y1, poly[i + 1] as number);
  }
  g.fillStyle = mat === GUTTED ? "#141110" : "#1d1b19";
  g.fillRect(x0, y0, x1 - x0, y1 - y0);
  if (mat !== GUTTED) {
    g.strokeStyle = "rgba(120,112,100,0.18)";
    g.lineWidth = 0.02;
    g.beginPath();
    for (let x = Math.floor(x0); x < x1; x += 0.5) {
      g.moveTo(x, y0);
      g.lineTo(x, y1);
    }
    for (let y = Math.floor(y0); y < y1; y += 0.5) {
      g.moveTo(x0, y);
      g.lineTo(x1, y);
    }
    g.stroke();
  } else {
    for (let i = 0; i < 30; i++) fillP(g, (q) => ellPath(q, x0 + r() * (x1 - x0), y0 + r() * (y1 - y0), 0.1 + r() * 0.3, 0.06 + r() * 0.2, r() * 3), `rgba(${r() < 0.3 ? "90,45,20" : "0,0,0"},${0.2 + r() * 0.3})`);
  }
  for (let i = 0; i < 2; i++) {
    const yy = lerp(y0, y1, 0.35 + i * 0.3);
    fillP(g, (q) => rectPath(q, x0, yy, (x1 - x0) * (0.5 + r() * 0.4), 0.12), mat === GUTTED ? "#2a2420" : "#4d4944");
  }
  gravel(g, (x0 + x1) / 2, (y0 + y1) / 2, (x1 - x0) * 0.5, (y1 - y0) * 0.5, 90, M.cols, seed + 5);
  for (let i = 0; i < 7; i++) chunk(g, lerp(x0, x1, r()), lerp(y0, y1, r()), 0.12 + r() * 0.2, r() * TAU, M.cols[i % M.cols.length] as string, seed + 20 + i);
  if (M.beam || mat === 0) for (let i = 0; i < 3; i++) beamPiece(g, lerp(x0, x1, 0.2 + r() * 0.6), lerp(y0, y1, 0.2 + r() * 0.6), r() * 3, 1.2 + r() * 1.2, 0.13, mat === GUTTED ? "#1d1714" : mat === 0 ? "#55524d" : "#5a432d", seed + 30 + i);
  g.globalCompositeOperation = "multiply";
  const gr = g.createLinearGradient(x0, y0, x0 + 0.9, y0 + 1.3);
  gr.addColorStop(0, "rgb(40,40,48)");
  gr.addColorStop(1, "rgb(255,255,255)");
  g.fillStyle = gr;
  g.fillRect(x0, y0, x1 - x0, y1 - y0);
  g.globalCompositeOperation = "source-over";
  g.restore();
  strokeP(g, (q) => polyPath(q, poly), "rgba(8,8,9,0.9)", 3 * P);
  if (!M.rebar) return;
  for (let i = 0; i < poly.length; i += 2) {
    const xa = poly[i] as number;
    const ya = poly[i + 1] as number;
    const xb = poly[(i + 2) % poly.length] as number;
    const yb = poly[(i + 3) % poly.length] as number;
    const L = Math.hypot(xb - xa, yb - ya);
    for (let s = 0.3; s < L - 0.2; s += 0.35 + r() * 0.3) {
      const t = s / L;
      if (r() < 0.6) rebarStick(g, lerp(xa, xb, t), lerp(ya, yb, t), Math.atan2(yb - ya, xb - xa) + Math.PI / 2 + (r() - 0.5), 0.15 + r() * 0.2);
    }
  }
}

/** Story 6.2 (D3): a breach in a wall face at (x, y), `dir` = the outward normal: a dark hole and debris blown out. */
export function breachHole(g: G, x: number, y: number, dirx: number, diry: number, w: number, seed: number, mat: number): void {
  setP(g);
  const r = mulberry32(seed);
  const M = RUINS_MATS[mat] ?? (RUINS_MATS[0] as RuinsMat);
  const nx = -diry;
  const ny = dirx;
  const pts: number[] = [];
  const N = 12;
  for (let i = 0; i <= N; i++) {
    const a = (i / N) * Math.PI;
    const d = (0.6 + r() * 0.35) * w * 0.5;
    pts.push(x + nx * Math.cos(a) * w * 0.5 * (0.85 + r() * 0.2) - dirx * Math.sin(a) * d * 1.6, y + ny * Math.cos(a) * w * 0.5 * (0.85 + r() * 0.2) - diry * Math.sin(a) * d * 1.6);
  }
  fillP(g, (q) => polyPath(q, pts), "#070707");
  strokeP(g, (q) => polyPath(q, pts), "rgba(10,10,10,0.95)", 3.4 * P);
  strokeP(g, (q) => polyPath(q, pts), "rgba(200,190,170,0.35)", 1.2 * P);
  for (let i = 0; i < 14; i++) {
    const t = (r() - 0.5) * w * 1.2;
    const o = r() * 0.9;
    const px = x + nx * t + dirx * o;
    const py = y + ny * t + diry * o;
    if (mat === BRICK || mat === GUTTED) brick(g, px, py, r() * 3, M.cols[i % M.cols.length] as string, seed + i);
    else chunk(g, px, py, 0.06 + r() * 0.12, r() * 3, M.cols[i % M.cols.length] as string, seed + i);
  }
  gravel(g, x + dirx * 0.5, y + diry * 0.5, w * 0.6, 0.6, 50, M.cols, seed + 3);
}

/** RU4: a soot fan (dark skirt) across a roof or facade. */
export function soot(g: G, x: number, y: number, rx: number, ry: number, a: number): void {
  dustSkirt(g, x, y, rx, ry, "10,8,8", a);
}

/** Loose debris (ambience, never cover): a few small chunks in the box. */
export function looseDebris(g: G, x: number, y: number, w: number, h: number, seed: number, mat: number): void {
  setP(g);
  const M = RUINS_MATS[mat] ?? (RUINS_MATS[0] as RuinsMat);
  const r = mulberry32(seed);
  const n = Math.max(4, Math.round(w * h * 3));
  for (let i = 0; i < n; i++) chunk(g, x + r() * w, y + r() * h, 0.04 + r() * 0.07, r() * 3, M.cols[i % 4] as string, seed + 900 + i);
}

// ---------------------------------------------------------------------------------------------
// Story 6.4 (Collapse): the dead grid
// ---------------------------------------------------------------------------------------------

/** A dead lamp head (metres). */
export function deadLampHead(g: G, x: number, y: number): void {
  setP(g);
  fillP(g, (q) => ellPath(q, x, y, 0.16, 0.16), "#1b1c1f");
  strokeP(g, (q) => ellPath(q, x, y, 0.16, 0.16), "rgba(0,0,0,0.9)", 1.2 * P);
  fillP(g, (q) => ellPath(q, x - 0.03, y - 0.03, 0.07, 0.07), "rgba(160,170,190,0.25)");
}

/** A streetlight fallen across the ground from (x, y) at angle `a`, `L` m long (visual only, no collision). */
export function fallenLamp(g: G, x: number, y: number, a: number, L: number): void {
  setP(g);
  g.save();
  g.translate(x, y);
  g.rotate(a);
  castShadow(g, (q) => rectPath(q, 0, -0.06, L, 0.12), 0.12, 0.16, 0.05, 0.6);
  part(g, (q) => rectPath(q, 0, -0.06, L, 0.12, 0.04), { base: "#3d4046", lit: "top", box: [0, -0.06, L, 0.06], tex: steelTex(41), hi: 0.4, lo: 0.5, line: 1.1 });
  part(g, (q) => rectPath(q, L - 0.1, -0.17, 0.5, 0.34, 0.08), { base: "#2a2c30", lit: "top", box: [L - 0.1, -0.17, L + 0.4, 0.17], tex: steelTex(43), line: 1.2 });
  fillP(g, (q) => ellPath(q, L + 0.15, 0, 0.12, 0.1), "rgba(190,200,215,0.35)");
  for (let i = 0; i < 8; i++) fillP(g, (q) => ellPath(q, L + 0.5 + Math.cos(i) * 0.3, Math.sin(i * 2.3) * 0.3, 0.03, 0.02), "rgba(200,215,230,0.4)");
  strokeP(
    g,
    (q) => {
      q.moveTo(0, 0);
      q.bezierCurveTo(-0.5, 0.4, -0.9, -0.2, -1.4, 0.3);
    },
    "#0e0e10",
    0.035,
  );
  g.restore();
}

/**
 * CO4 (D11: visual only): a dark glossy gutter puddle (metres) with a baked fire reflection when
 * `reflect` (`?fx=low`: none). No gameplay.
 */
export function floodPuddle(g: G, x: number, y: number, rx: number, ry: number, seed: number, fireX: number, fireY: number, reflect: boolean): void {
  setP(g);
  g.save();
  g.beginPath();
  blobPath(g, x, y, rx, ry, seed, 0.25, 48);
  g.fillStyle = "rgba(4,6,10,0.72)";
  g.fill();
  g.clip();
  if (reflect && Number.isFinite(fireX)) {
    const ry2 = fireY + (y - fireY) * 1.6;
    const gr = g.createRadialGradient(fireX, ry2, 0, fireX, ry2, 6);
    gr.addColorStop(0, "rgba(255,140,60,0.3)");
    gr.addColorStop(1, "rgba(255,140,60,0)");
    g.fillStyle = gr;
    g.globalCompositeOperation = "lighter";
    g.fillRect(x - rx, y - ry, 2 * rx, 2 * ry);
    g.globalCompositeOperation = "source-over";
  }
  g.restore();
  strokeP(g, (q) => blobPath(q, x, y, rx, ry, seed, 0.25, 48), "rgba(150,170,205,0.12)", 0.03);
}
