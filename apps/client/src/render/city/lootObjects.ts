/**
 * Story 7.12 (7-UI-6): the five loot-bag objects the designer picked — LB4 hiker's backpack, LB5
 * tactical go-bag, LB6 lockable field case, LB7 trauma bag, LB8 police evidence bag (gas mask inside)
 * — drawn in GAME CODE with the photoreal relief renderer, copied from the pick page's source
 * (`docs/art/epic-7/loot-bag-2-src/`: `vendor/relief.ts`, `vendor/lib.ts`, `objects.ts`; LB9 not
 * picked, left out). Units: metres, origin at the frame centre. Pure canvas work (no Phaser): the
 * atlas (`lootBagAtlas.ts`) calls `bakeLootObjects` from its `addGeneratedTexture` paint (Android
 * redraw), `make` makes the canvases (a node canvas in tests).
 *
 * The code below is the pick page's, kept as is (so the game's bags are the picked pictures) apart
 * from: the module-level canvas maker, the relief resolution `RM` set per bake, LB9 (and its unused
 * `pathLine` helper) removed.
 */
export type G = CanvasRenderingContext2D;
let makeCanvas: (w: number, h: number) => HTMLCanvasElement = (w, h) => { const c = document.createElement("canvas"); c.width = w; c.height = h; return c; };
export function canvas(w: number, h: number): HTMLCanvasElement { return makeCanvas(w, h); }
export function ctx(c: HTMLCanvasElement): G { return c.getContext("2d", { willReadFrequently: true }) as G; }
export function roundRect(g: G, x: number, y: number, w: number, h: number, r: number): void { g.beginPath(); g.roundRect(x, y, w, h, r); }
export function hash2(x: number, y: number, seed: number): number { let h = (x * 374761393 + y * 668265263 + seed * 2147483647) | 0; h = Math.imul(h ^ (h >>> 13), 1274126177); return ((h ^ (h >>> 16)) >>> 0) / 4294967295; }
export function vnoise(x: number, y: number, seed: number): number {
  const xi = Math.floor(x), yi = Math.floor(y), xf = x - xi, yf = y - yi;
  const u = xf * xf * (3 - 2 * xf), v = yf * yf * (3 - 2 * yf);
  const a = hash2(xi, yi, seed), b = hash2(xi + 1, yi, seed), c = hash2(xi, yi + 1, seed), d = hash2(xi + 1, yi + 1, seed);
  return a + (b - a) * u + (c - a) * v + (a - b - c + d) * u * v;
}
export function fbm(x: number, y: number, seed: number, oct = 5): number { let s = 0, amp = 0.5, f = 1; for (let i = 0; i < oct; i++) { s += amp * vnoise(x * f, y * f, seed + i * 17); f *= 2.03; amp *= 0.5; } return s; }

/**
 * The photoreal relief renderer (shared by the pilots): an object is a lit height field — stacked shape layers
 * blurred into volumes, engraved cuts, noise, an analytic height function — with a textured albedo and gloss,
 * lit from the map's top-left light, optionally supersampled.
 */

export type Rgb = [number, number, number];

// ─────────────────────────────── the relief renderer (rectangular) ───────────────────────────────

export interface Layer {
  /** Fills the layer's shape (white), origin at the frame centre. */
  draw(g: G): void;
  /** Blur (px): how rounded its edges are. */
  blur: number;
  /** Height it adds. */
  amount: number;
}

export interface Relief {
  readonly w: number;
  readonly h: number;
  /** The first layer is the footprint (sets the alpha). */
  readonly layers: Layer[];
  /** Cuts (white): seams, gaps, holes. */
  engrave?(g: G): void;
  readonly engraveDepth?: number;
  /** Named masks the albedo can read (white = inside). */
  readonly regions?: Record<string, (g: G) => void>;
  /** Small-scale height noise (dents, texture), and its cell size. */
  readonly detail: number;
  readonly grain: number;
  /** Extra height at a pixel (dents, weave). */
  heightAt?(x: number, y: number): number;
  albedo(x: number, y: number, s: Sample): Rgb;
  /** Glossiness at a pixel (0 dry … 1 glass / wet paint). */
  spec(x: number, y: number, s: Sample): number;
  readonly seed: number;
  /** Supersampling: drawn at `ss` × the size, then shrunk (crisper edges, finer detail). Default 1. */
  readonly ss?: number;
  /** Darkening along the footprint's inner edge (contact shadow / ambient occlusion), 0–1. */
  readonly edgeAO?: number;
  /** Light colour (multipliers per channel) for the key light, and the ambient level per channel. Defaults: white, 0.32. */
  readonly tint?: Rgb;
  readonly ambient?: Rgb;
  /** Key light strength (default 0.9) and how steeply slopes darken (height → slope, default 7). */
  readonly key?: number;
  readonly slope?: number;
}

export interface Sample {
  readonly h: number;
  readonly cav: number;
  readonly r: Record<string, number>;
}

export function maskOf(w: number, h: number, draw: (g: G) => void, blur = 0): Float32Array {
  const c = canvas(w, h);
  const g = ctx(c);
  g.translate(w / 2, h / 2);
  g.fillStyle = "#fff";
  g.strokeStyle = "#fff";
  draw(g);
  let src = c;
  if (blur > 0) {
    const b = canvas(w, h);
    const bg = ctx(b);
    bg.filter = `blur(${blur}px)`;
    bg.drawImage(c, 0, 0);
    src = b;
  }
  const d = ctx(src).getImageData(0, 0, w, h).data;
  const out = new Float32Array(w * h);
  for (let i = 0; i < w * h; i++) out[i] = (d[i * 4 + 3] as number) / 255;
  return out;
}

export function render(o: Relief): HTMLCanvasElement {
  const ss = o.ss ?? 1;
  const w = o.w * ss;
  const h = o.h * ss;
  const up = (f: (g: G) => void) => (g: G): void => {
    g.scale(ss, ss);
    f(g);
  };
  const foot = maskOf(w, h, up((o.layers[0] as Layer).draw));
  const footSoft = o.edgeAO ? maskOf(w, h, up((o.layers[0] as Layer).draw), 3 * ss) : null;
  const layers = o.layers.map((l) => ({ m: maskOf(w, h, up(l.draw), l.blur * ss), a: l.amount }));
  const eng = o.engrave ? maskOf(w, h, up(o.engrave), 0.6 * ss) : null;
  const engW = o.engrave ? maskOf(w, h, up(o.engrave), 2.5 * ss) : null;
  const regions: Record<string, Float32Array> = {};
  for (const [k, f] of Object.entries(o.regions ?? {})) regions[k] = maskOf(w, h, up(f), 0.6 * ss);
  const H = new Float32Array(w * h);
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const i = y * w + x;
      const fx = x / ss;
      const fy = y / ss;
      let v = 0;
      for (const l of layers) v += (l.m[i] as number) * l.a;
      v += (fbm(fx / o.grain, fy / o.grain, o.seed, 4) - 0.5) * o.detail;
      if (o.heightAt) v += o.heightAt(fx, fy);
      if (eng) v -= (eng[i] as number) * (o.engraveDepth ?? 0.35);
      H[i] = v * (foot[i] as number);
    }
  }
  const hi = canvas(w, h);
  const hg = ctx(hi);
  const img = hg.createImageData(w, h);
  const d = img.data;
  const L = [-0.5, -0.72, 0.48];
  const ll = Math.hypot(L[0] as number, L[1] as number, L[2] as number);
  const [lx, ly, lz] = [(L[0] as number) / ll, (L[1] as number) / ll, (L[2] as number) / ll];
  const K = (o.slope ?? 7) * ss;
  const tint = o.tint ?? [1, 1, 1];
  const amb = o.ambient ?? [0.32, 0.32, 0.32];
  const key = o.key ?? 0.9;
  const r: Record<string, number> = {};
  const keys = Object.keys(regions);
  for (let y = 1; y < h - 1; y++) {
    for (let x = 1; x < w - 1; x++) {
      const i = y * w + x;
      const a = foot[i] as number;
      if (a <= 0.01) continue;
      const fx = x / ss;
      const fy = y / ss;
      const dx = ((H[i + 1] as number) - (H[i - 1] as number)) * K;
      const dy = ((H[i + w] as number) - (H[i - w] as number)) * K;
      const nl = Math.hypot(dx, dy, 1);
      const nx = -dx / nl;
      const ny = -dy / nl;
      const nz = 1 / nl;
      const nd = nx * lx + ny * ly + nz * lz;
      const diff = Math.max(0, nd);
      const rz = 2 * nd * nz - lz;
      for (const k of keys) r[k] = (regions[k] as Float32Array)[i] as number;
      const cav = Math.min(1, (engW ? (engW[i] as number) * 1.1 : 0) + Math.max(0, -nz + 0.92) * 0.4);
      const sm: Sample = { h: H[i] as number, cav, r };
      const [cr, cg, cb] = o.albedo(fx, fy, sm);
      const gl = o.spec(fx, fy, sm);
      const sp = Math.pow(Math.max(0, rz), 22) * gl;
      const sky = gl * 0.18 * nz; // a soft night-sky reflection on glossy, upward faces
      const ao = footSoft ? 1 - (o.edgeAO ?? 0) * (1 - (footSoft[i] as number)) * 2 : 1;
      const aoK = Math.max(0.3, ao);
      const k = i * 4;
      d[k] = Math.min(255, cr * (amb[0] + key * diff * tint[0]) * aoK + sp * 255 * tint[0] + sky * 90);
      d[k + 1] = Math.min(255, cg * (amb[1] + key * diff * tint[1]) * aoK + sp * 248 * tint[1] + sky * 100);
      d[k + 2] = Math.min(255, cb * (amb[2] + key * diff * tint[2]) * aoK + sp * 240 * tint[2] + sky * 125);
      d[k + 3] = Math.round(a * 255);
    }
  }
  hg.putImageData(img, 0, 0);
  if (ss === 1) return hi;
  const out = canvas(o.w, o.h);
  const og = ctx(out);
  og.imageSmoothingQuality = "high";
  og.drawImage(hi, 0, 0, o.w, o.h);
  return out;
}

export const mix = (a: Rgb, b: Rgb, t: number): Rgb => [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t, a[2] + (b[2] - a[2]) * t];
export const cl = (v: number): number => Math.max(0, Math.min(1, v));
export const rect = (x: number, y: number, w: number, h: number, r = 0) => (g: G): void => {
  roundRect(g, x, y, w, h, r);
  g.fill();
};


/**
 * Loot bag round 2 (LB4–LB9): six real objects drawn with the photoreal relief renderer
 * (vendor/relief.ts = docs/art/photoreal-1/src/relief.ts): shape layers blurred into volumes, engraved seams,
 * per-material albedo + gloss, key light upper-left. Units: metres, origin at the frame centre.
 */

/** Relief px per metre (the game bakes at `LOOT_PX_PER_M`; the pick page used 220). */
let RM = 220;
export const FRAME_M = 0.92;
const TAU = Math.PI * 2;
const hex = (s: string): Rgb => [parseInt(s.slice(1, 3), 16), parseInt(s.slice(3, 5), 16), parseInt(s.slice(5, 7), 16)];
const sm = (a: number, b: number, v: number): number => { const t = Math.max(0, Math.min(1, (v - a) / (b - a))); return t * t * (3 - 2 * t); };
type Shape = (g: G) => void;
const rr = (x: number, y: number, w: number, h: number, r: number): Shape => (g) => { g.beginPath(); g.roundRect(x, y, w, h, r); g.fill(); };
const el = (x: number, y: number, rx: number, ry: number, a = 0): Shape => (g) => { g.beginPath(); g.ellipse(x, y, rx, ry, a, 0, TAU); g.fill(); };
const band = (pts: number[][], w: number): Shape => (g) => { g.lineWidth = w; g.lineCap = "round"; g.lineJoin = "round"; g.beginPath(); pts.forEach(([x, y], i) => (i ? g.lineTo(x!, y!) : g.moveTo(x!, y!))); g.stroke(); };
const all = (...s: Shape[]): Shape => (g) => s.forEach((f) => f(g));

/** Surface textures (X, Y metres) → brightness multiplier. */
export type Tex = "ripstop" | "cordura" | "canvas" | "web" | "foam" | "plastic" | "metal" | "rubber" | "polymer" | "reflect" | "paper" | "glass" | "velcro";
function tex(t: Tex, X: number, Y: number, seed: number): number {
  const n = fbm(X * 60, Y * 60, seed, 3) - 0.5;
  switch (t) {
    case "ripstop": { const gx = Math.abs(((X * 160) % 1 + 1) % 1 - 0.5) < 0.07 ? 0.9 : 1; const gy = Math.abs(((Y * 160) % 1 + 1) % 1 - 0.5) < 0.07 ? 0.9 : 1; return (gx * gy) * (1 + n * 0.12) * (0.97 + 0.03 * Math.sin(X * 1400)); }
    case "cordura": return (0.94 + 0.06 * Math.sin(X * 1500 + Math.sin(Y * 900) * 2) * Math.sin(Y * 1500)) * (1 + n * 0.16);
    case "canvas": return (0.9 + 0.1 * Math.sin(X * 1000) * Math.sin(Y * 1000)) * (1 + n * 0.25);
    case "web": return (0.88 + 0.12 * Math.abs(Math.sin((X + Y) * 1600))) * (1 + n * 0.1);
    case "foam": return (0.92 + 0.08 * Math.sin(X * 260)) * (1 + n * 0.15);
    case "velcro": return 0.85 + 0.15 * fbm(X * 900, Y * 900, seed, 2);
    case "reflect": return (0.96 + 0.04 * Math.sin(X * 2200) * Math.sin(Y * 2200)) * (1 + n * 0.08);
    case "paper": return 1 + n * 0.08;
    default: return 1 + n * 0.08;
  }
}
export interface Part { name: string; shape: Shape; blur: number; amount: number; col: string; tex: Tex; gloss: number; dirt?: number }
export interface ObjDef {
  code: string; seed: number; parts: Part[];
  engrave?: Shape; engraveDepth?: number;
  heightAt?: (X: number, Y: number) => number;
  /** Crisp details drawn on top of the lit object, in metres (stitches, print, zipper teeth). */
  overlay?: (g: G) => void;
  /** Where the pick-up glint sits (metres) and the object's angle on the street. */
  glint: [number, number]; rot: number;
  wet?: number; mud?: number;
  /** Clear plastic: drawn over `inner` with this opacity. */
  clear?: { alpha: number; inner: ObjDef };
  /** Ground ring radius (m). */
  ringR: number;
}

function renderDef(d: ObjDef): HTMLCanvasElement {
  const W = Math.round(FRAME_M * RM);
  const inM = (f: Shape) => (g: G): void => { g.save(); g.scale(RM, RM); f(g); g.restore(); };
  const layers: Layer[] = [{ draw: inM(all(...d.parts.map((p) => p.shape))), blur: 2, amount: 0.15 }];
  for (const p of d.parts) layers.push({ draw: inM(p.shape), blur: p.blur * RM, amount: p.amount });
  const regions: Record<string, Shape> = {};
  d.parts.forEach((p, i) => (regions["p" + i] = inM(p.shape)));
  const cols = d.parts.map((p) => hex(p.col));
  const wet = d.wet ?? 0.5, mud = d.mud ?? 0.4;
  const toM = (x: number) => (x - W / 2) / RM;
  return render({
    w: W, h: W, layers, seed: d.seed, ss: 2, detail: 0.05, grain: 6, edgeAO: 0.35,
    ...(d.engrave ? { engrave: inM(d.engrave) } : {}), engraveDepth: d.engraveDepth ?? 0.3,
    regions: regions as never,
    ...(d.heightAt ? { heightAt: (x: number, y: number) => d.heightAt!(toM(x), toM(y)) } : {}),
    tint: [0.93, 0.98, 1.06], ambient: [0.2, 0.21, 0.24], key: 1.05, slope: 6,
    albedo(x: number, y: number, s: Sample): Rgb {
      const X = toM(x), Y = toM(y);
      let c: Rgb = cols[0]!; let dirtK = d.parts[0]!.dirt ?? 1;
      d.parts.forEach((p, i) => { const r = s.r["p" + i] ?? 0; if (r > 0.01) { const t = tex(p.tex, X, Y, d.seed + i); const pc = cols[i]!; c = mix(c, [pc[0] * t, pc[1] * t, pc[2] * t], r); dirtK = dirtK + ((p.dirt ?? 1) - dirtK) * r; } });
      // grime in the crevices, mud splash (lower right, the side the zombie fell on), wet darkening
      const m = sm(0.55, 0.75, fbm(X * 9 + 3, Y * 9, d.seed + 5, 4) + (X + Y) * 0.25) * mud * dirtK;
      c = mix(c, [58, 48, 36], m * 0.8);
      c = mix(c, [20, 18, 16], s.cav * 0.55);
      const wv = sm(0.45, 0.62, fbm(X * 5, Y * 5 + 7, d.seed + 9, 3)) * wet;
      const k = 1 - wv * 0.3;
      return [c[0] * k, c[1] * k, c[2] * k];
    },
    spec(x: number, y: number, s: Sample): number {
      const X = toM(x), Y = toM(y);
      let gl = d.parts[0]!.gloss;
      d.parts.forEach((p, i) => { const r = s.r["p" + i] ?? 0; gl += (p.gloss - gl) * r; });
      const wv = sm(0.45, 0.62, fbm(X * 5, Y * 5 + 7, d.seed + 9, 3)) * wet;
      return Math.min(1, gl + wv * 0.55 + wet * 0.12) * (1 - s.cav * 0.6);
    },
  });
}

const cache = new Map<string, HTMLCanvasElement>(); // per bake (cleared by `bakeLootObjects`)
/** The finished object (relief + crisp overlay), FRAME_M square at RM px per metre. */
export function objectCanvas(d: ObjDef): HTMLCanvasElement {
  const hit = cache.get(d.code); if (hit) return hit;
  const W = Math.round(FRAME_M * RM);
  const out = canvas(W, W); const g = ctx(out);
  if (d.clear) {
    g.drawImage(objectCanvas(d.clear.inner), 0, 0);
    g.globalAlpha = d.clear.alpha; g.drawImage(renderDef(d), 0, 0); g.globalAlpha = 1;
  } else g.drawImage(renderDef(d), 0, 0);
  if (d.overlay) { g.save(); g.translate(W / 2, W / 2); g.scale(RM, RM); d.overlay(g); g.restore(); }
  cache.set(d.code, out);
  return out;
}

// ─── overlay helpers (metres) ───
function stitch(g: G, path: Shape, col = "rgba(235,235,225,0.35)", w = 0.0035, dash = 0.009): void { g.save(); g.strokeStyle = col; g.lineWidth = w; g.setLineDash([dash, dash * 0.8]); path(g); g.stroke(); g.restore(); }
const pathRR = (x: number, y: number, w: number, h: number, r: number): Shape => (g) => { g.beginPath(); g.roundRect(x, y, w, h, r); };
function zipper(g: G, x0: number, y0: number, x1: number, y1: number): void {
  const L = Math.hypot(x1 - x0, y1 - y0), n = Math.floor(L / 0.0065);
  g.save(); g.translate(x0, y0); g.rotate(Math.atan2(y1 - y0, x1 - x0));
  g.fillStyle = "#0d0e10"; g.fillRect(0, -0.006, L, 0.012);
  for (let i = 0; i < n; i++) { g.fillStyle = i % 2 ? "rgba(150,155,160,0.85)" : "rgba(60,62,66,0.9)"; g.fillRect(i * 0.0065, i % 2 ? -0.0045 : -0.001, 0.0045, 0.0055); }
  g.restore();
}
function pull(g: G, x: number, y: number, a: number, col = "#1a1b1d"): void {
  g.save(); g.translate(x, y); g.rotate(a);
  g.fillStyle = "#8d9296"; g.fillRect(-0.006, -0.008, 0.012, 0.016);
  g.fillStyle = col; g.beginPath(); g.roundRect(-0.006, 0.006, 0.012, 0.04, 0.004); g.fill();
  g.fillStyle = "rgba(255,255,255,0.25)"; g.fillRect(-0.004, 0.009, 0.002, 0.03);
  g.restore();
}
function text(g: G, s: string, x: number, y: number, size: number, col: string, a = 0, font = "700 {S}px Oswald, 'Arial Narrow', sans-serif", ls = 0.08): void {
  g.save(); g.translate(x, y); g.rotate(a); g.scale(size / 100, size / 100);
  g.font = font.replace("{S}", "100"); g.textAlign = "center"; g.textBaseline = "middle"; g.fillStyle = col;
  (g as unknown as { letterSpacing: string }).letterSpacing = `${ls * 100}px`;
  g.fillText(s, 0, 0); g.restore();
}
/** Worn print: knocks random holes in what `fn` draws. */
function worn(g: G, seed: number, fn: (g: G) => void, k = 0.35): void {
  const W = Math.round(FRAME_M * RM); const c = canvas(W, W); const cg = ctx(c);
  cg.translate(W / 2, W / 2); cg.scale(RM, RM); fn(cg);
  cg.setTransform(1, 0, 0, 1, 0, 0); cg.globalCompositeOperation = "destination-out";
  for (let y = 0; y < W; y += 2) for (let x = 0; x < W; x += 2) { const v = fbm(x / 7, y / 7, seed, 3); if (v > 0.62 - k * 0.2) { cg.fillStyle = `rgba(0,0,0,${Math.min(1, (v - 0.5) * 4)})`; cg.fillRect(x, y, 2, 2); } }
  g.save(); g.setTransform(1, 0, 0, 1, 0, 0); g.drawImage(c, 0, 0); g.restore();
}

// ═══════════════ LB4 · the dead hiker's backpack ═══════════════
const LB4: ObjDef = {
  code: "LB4", seed: 41, rot: -0.22, glint: [0.13, 0.22], ringR: 0.5, wet: 0.55, mud: 0.45,
  parts: [
    { name: "body", shape: rr(-0.21, -0.31, 0.42, 0.56, 0.1), blur: 0.06, amount: 1.1, col: "#3f5c66", tex: "ripstop", gloss: 0.16 },
    { name: "lid", shape: rr(-0.2, -0.37, 0.4, 0.17, 0.075), blur: 0.03, amount: 0.38, col: "#33494f", tex: "ripstop", gloss: 0.16 },
    { name: "pocket", shape: rr(-0.145, -0.09, 0.29, 0.22, 0.05), blur: 0.02, amount: 0.22, col: "#38535b", tex: "ripstop", gloss: 0.16 },
    { name: "patch", shape: el(-0.06, 0.02, 0.035, 0.035), blur: 0.003, amount: 0.02, col: "#c9c3b0", tex: "canvas", gloss: 0.05, dirt: 0.5 },
    { name: "strapR", shape: band([[0.19, -0.16], [0.28, -0.12], [0.33, -0.02], [0.31, 0.08]], 0.055), blur: 0.006, amount: 0.12, col: "#222428", tex: "web", gloss: 0.12 },
    { name: "padR", shape: band([[0.2, -0.15], [0.27, -0.12]], 0.07), blur: 0.012, amount: 0.12, col: "#2a2d31", tex: "cordura", gloss: 0.1 },
    { name: "mat", shape: rr(-0.29, 0.17, 0.58, 0.155, 0.075), blur: 0.004, amount: 0.15, col: "#7e8a90", tex: "foam", gloss: 0.1, dirt: 1.3 },
    { name: "matStraps", shape: all(rr(-0.17, 0.14, 0.035, 0.21, 0.004), rr(0.135, 0.14, 0.035, 0.21, 0.004), rr(-0.015, -0.4, 0.03, 0.2, 0.004), rr(-0.225, -0.18, 0.05, 0.028, 0.003), rr(0.175, 0.03, 0.05, 0.028, 0.003)), blur: 0.003, amount: 0.07, col: "#1c1e21", tex: "web", gloss: 0.12 },
    { name: "buckles", shape: all(rr(-0.177, 0.26, 0.049, 0.034, 0.006), rr(0.128, 0.26, 0.049, 0.034, 0.006), rr(-0.024, -0.27, 0.048, 0.034, 0.006)), blur: 0.004, amount: 0.07, col: "#2b2c2e", tex: "plastic", gloss: 0.7 },
    { name: "mug", shape: all(el(-0.275, -0.07, 0.048, 0.048), band([[-0.24, -0.1], [-0.21, -0.12]], 0.012)), blur: 0.006, amount: 0.25, col: "#a3a8ab", tex: "metal", gloss: 0.95, dirt: 0.6 },
  ],
  heightAt(X, Y) {
    // the foam roll is a cylinder with ribs
    if (Y > 0.17 && Y < 0.325 && Math.abs(X) < 0.29) { const t = (Y - 0.2475) / 0.0775; return Math.sqrt(Math.max(0, 1 - t * t)) * 0.55 + Math.sin(X * 260) * 0.015; }
    // the mug's dark inside
    const dm = Math.hypot(X + 0.275, Y + 0.07); if (dm < 0.038) return -0.35 + dm * 2;
    return 0;
  },
  engrave: (g) => {
    g.strokeStyle = "#fff"; g.lineWidth = 0.005;
    g.beginPath(); g.moveTo(-0.17, -0.205); g.quadraticCurveTo(0, -0.19, 0.17, -0.205); g.stroke();
    g.beginPath(); g.moveTo(-0.12, -0.065); g.lineTo(0.12, -0.065); g.stroke();
    g.beginPath(); g.moveTo(0.28, 0.18); g.lineTo(0.28, 0.32); g.stroke();
    g.beginPath(); g.arc(0.265, 0.2475, 0.04, 0, 4.5); g.stroke();
  },
  overlay(g) {
    stitch(g, pathRR(-0.185, -0.355, 0.37, 0.14, 0.06));
    stitch(g, pathRR(-0.13, -0.075, 0.26, 0.19, 0.04));
    zipper(g, -0.12, -0.068, 0.12, -0.068); pull(g, 0.08, -0.068, 0.3, "#2b2c2e");
    // patch: embroidered mountain
    g.fillStyle = "#3d4a4e"; g.beginPath(); g.moveTo(-0.087, 0.035); g.lineTo(-0.067, 0.003); g.lineTo(-0.058, 0.016); g.lineTo(-0.048, 0.0); g.lineTo(-0.033, 0.035); g.fill();
    g.strokeStyle = "rgba(60,70,72,0.8)"; g.lineWidth = 0.004; g.beginPath(); g.arc(-0.06, 0.02, 0.033, 0, TAU); g.stroke();
    // a cut strap end, frayed
    g.strokeStyle = "rgba(40,42,45,0.9)"; g.lineWidth = 0.003; for (let i = 0; i < 6; i++) { g.beginPath(); g.moveTo(0.29 + i * 0.008, 0.08); g.lineTo(0.29 + i * 0.008 + 0.003, 0.098 + (i % 2) * 0.006); g.stroke(); }
    // carabiner
    g.strokeStyle = "#b9bec2"; g.lineWidth = 0.006; g.beginPath(); g.ellipse(-0.225, -0.115, 0.014, 0.024, 0.8, 0, TAU); g.stroke();
  },
};

// ═══════════════ LB5 · tactical go-bag (duffel) ═══════════════
const LB5: ObjDef = {
  code: "LB5", seed: 52, rot: 0.32, glint: [0.2, -0.1], ringR: 0.52, wet: 0.5, mud: 0.35,
  parts: [
    { name: "body", shape: rr(-0.36, -0.17, 0.72, 0.34, 0.14), blur: 0.07, amount: 1.2, col: "#2a2d30", tex: "cordura", gloss: 0.2 },
    { name: "endL", shape: rr(-0.36, -0.165, 0.075, 0.33, 0.07), blur: 0.02, amount: 0.12, col: "#6d6047", tex: "cordura", gloss: 0.12 },
    { name: "endR", shape: rr(0.285, -0.165, 0.075, 0.33, 0.07), blur: 0.02, amount: 0.12, col: "#6d6047", tex: "cordura", gloss: 0.12 },
    { name: "molle", shape: all(...[-0.1, -0.06, 0.06, 0.1].map((y) => rr(-0.25, y - 0.011, 0.5, 0.022, 0.003))), blur: 0.003, amount: 0.06, col: "#24272a", tex: "web", gloss: 0.12 },
    { name: "handles", shape: all(rr(-0.12, -0.2, 0.03, 0.4, 0.008), rr(0.09, -0.2, 0.03, 0.4, 0.008)), blur: 0.004, amount: 0.12, col: "#1d1f22", tex: "web", gloss: 0.14 },
    { name: "grip", shape: rr(-0.14, -0.035, 0.28, 0.07, 0.03), blur: 0.01, amount: 0.14, col: "#202326", tex: "rubber", gloss: 0.3 },
    { name: "strap", shape: band([[0.33, 0.1], [0.4, 0.2], [0.33, 0.33], [0.12, 0.34], [-0.05, 0.3]], 0.04), blur: 0.005, amount: 0.07, col: "#1c1e21", tex: "web", gloss: 0.12 },
    { name: "hw", shape: all(rr(0.315, 0.06, 0.04, 0.05, 0.006), rr(-0.07, 0.28, 0.04, 0.04, 0.006)), blur: 0.003, amount: 0.07, col: "#7c8186", tex: "metal", gloss: 0.85 },
    { name: "tag", shape: rr(-0.33, -0.08, 0.05, 0.09, 0.008), blur: 0.003, amount: 0.04, col: "#e9e6dc", tex: "paper", gloss: 0.2, dirt: 0.4 },
    { name: "reflect", shape: rr(0.18, -0.02, 0.07, 0.04, 0.004), blur: 0.002, amount: 0.02, col: "#c9ccce", tex: "reflect", gloss: 0.8 },
  ],
  engrave: (g) => {
    g.strokeStyle = "#fff"; g.lineWidth = 0.006;
    for (const y of [-0.1, -0.06, 0.06, 0.1]) for (let x = -0.25; x <= 0.25; x += 0.05) { g.beginPath(); g.moveTo(x, y - 0.011); g.lineTo(x, y + 0.011); g.stroke(); }
    g.lineWidth = 0.004; g.beginPath(); g.moveTo(-0.27, -0.13); g.quadraticCurveTo(0, -0.145, 0.27, -0.13); g.stroke();
    g.beginPath(); g.moveTo(-0.27, 0.13); g.quadraticCurveTo(0, 0.145, 0.27, 0.13); g.stroke();
  },
  overlay(g) {
    zipper(g, -0.27, -0.13, 0.27, -0.13);
    pull(g, -0.18, -0.13, -0.3); pull(g, -0.16, -0.13, 0.4);
    stitch(g, pathRR(-0.345, -0.155, 0.69, 0.31, 0.12), "rgba(200,190,160,0.22)");
    g.fillStyle = "rgba(40,40,40,0.85)"; g.fillRect(-0.322, -0.065, 0.034, 0.003); g.fillRect(-0.322, -0.055, 0.03, 0.003); g.fillRect(-0.322, -0.045, 0.034, 0.003);
    g.fillStyle = "#1a1a1a"; g.beginPath(); g.arc(-0.305, -0.072, 0.004, 0, TAU); g.fill();
    g.strokeStyle = "#cfd2d4"; g.lineWidth = 0.002; g.beginPath(); g.moveTo(-0.305, -0.072); g.quadraticCurveTo(-0.29, -0.1, -0.29, -0.13); g.stroke();
    worn(g, 77, (c) => { text(c, "GO BAG", 0, 0.001, 0.05, "rgba(225,222,210,0.85)"); }, 0.4);
  },
};

// ═══════════════ LB6 · lockable field case ═══════════════
const LB6: ObjDef = {
  code: "LB6", seed: 63, rot: -0.15, glint: [-0.17, -0.15], ringR: 0.48, wet: 0.65, mud: 0.3,
  parts: [
    { name: "shell", shape: rr(-0.28, -0.21, 0.56, 0.42, 0.045), blur: 0.03, amount: 0.9, col: "#2c3033", tex: "polymer", gloss: 0.32 },
    { name: "lid", shape: rr(-0.25, -0.18, 0.5, 0.34, 0.03), blur: 0.012, amount: 0.12, col: "#30353a", tex: "polymer", gloss: 0.34 },
    { name: "ribs", shape: all(rr(-0.22, -0.15, 0.44, 0.022, 0.006), rr(-0.22, 0.11, 0.44, 0.022, 0.006)), blur: 0.006, amount: 0.05, col: "#2f3337", tex: "polymer", gloss: 0.35 },
    { name: "latches", shape: all(rr(-0.17, 0.175, 0.085, 0.06, 0.01), rr(0.085, 0.175, 0.085, 0.06, 0.01)), blur: 0.006, amount: 0.2, col: "#25292c", tex: "polymer", gloss: 0.45 },
    { name: "handle", shape: rr(-0.07, 0.2, 0.14, 0.04, 0.018), blur: 0.008, amount: 0.25, col: "#1c1f22", tex: "rubber", gloss: 0.25 },
    { name: "hasp", shape: all(rr(-0.02, 0.17, 0.04, 0.05, 0.006), el(0, 0.255, 0.024, 0.02)), blur: 0.004, amount: 0.25, col: "#8b8f91", tex: "metal", gloss: 0.9 },
    { name: "valve", shape: el(-0.2, -0.13, 0.022, 0.022), blur: 0.004, amount: 0.08, col: "#3b3f43", tex: "metal", gloss: 0.7 },
    { name: "label", shape: rr(-0.14, -0.08, 0.28, 0.12, 0.004), blur: 0.002, amount: 0.012, col: "#e6e3d9", tex: "paper", gloss: 0.12, dirt: 0.7 },
    { name: "tape", shape: rr(0.12, -0.2, 0.05, 0.4, 0.002), blur: 0.002, amount: 0.012, col: "#d9d8d2", tex: "paper", gloss: 0.3, dirt: 0.8 },
  ],
  engrave: (g) => { g.strokeStyle = "#fff"; g.lineWidth = 0.005; g.beginPath(); g.roundRect(-0.255, -0.185, 0.51, 0.35, 0.032); g.stroke(); for (let x = -0.24; x < 0.25; x += 0.012) { g.lineWidth = 0.002; g.beginPath(); g.moveTo(x, 0.17); g.lineTo(x, 0.205); g.stroke(); } },
  overlay(g) {
    worn(g, 91, (c) => {
      text(c, "PROPERTY OF", 0, -0.055, 0.025, "#1d1f21");
      text(c, "SURVIVOR", 0, -0.02, 0.05, "#1d1f21");
      c.fillStyle = "#1d1f21"; c.fillRect(-0.12, 0.012, 0.24, 0.004);
      text(c, "DO NOT OPEN", 0.145, 0, 0.026, "#2a2b2c", Math.PI / 2);
    }, 0.45);
    // scratches
    g.strokeStyle = "rgba(170,175,180,0.35)"; g.lineWidth = 0.0018;
    for (const [x, y, a, l] of [[-0.2, 0.05, 0.3, 0.07], [0.05, -0.15, -0.2, 0.09], [0.18, 0.08, 0.9, 0.05], [-0.1, 0.12, 0.1, 0.06], [-0.24, -0.06, 1.2, 0.04]] as const) { g.beginPath(); g.moveTo(x, y); g.lineTo(x + Math.cos(a) * l, y + Math.sin(a) * l); g.stroke(); }
    g.fillStyle = "#6d7174"; g.beginPath(); g.arc(-0.2, -0.13, 0.008, 0, TAU); g.fill();
  },
};

// ═══════════════ LB7 · trauma bag ═══════════════
const LB7: ObjDef = {
  code: "LB7", seed: 74, rot: 0.18, glint: [0.16, -0.14], ringR: 0.48, wet: 0.5, mud: 0.4,
  parts: [
    { name: "body", shape: rr(-0.27, -0.18, 0.54, 0.36, 0.08), blur: 0.06, amount: 1.0, col: "#262d38", tex: "ripstop", gloss: 0.18 },
    { name: "pocketL", shape: rr(-0.33, -0.12, 0.08, 0.24, 0.035), blur: 0.025, amount: 0.45, col: "#232a34", tex: "ripstop", gloss: 0.18 },
    { name: "pocketR", shape: rr(0.25, -0.12, 0.08, 0.24, 0.035), blur: 0.025, amount: 0.45, col: "#232a34", tex: "ripstop", gloss: 0.18 },
    { name: "refl", shape: all(rr(-0.27, -0.13, 0.54, 0.025, 0.002), rr(-0.27, 0.105, 0.54, 0.025, 0.002)), blur: 0.003, amount: 0.02, col: "#b7bcc0", tex: "reflect", gloss: 0.85 },
    { name: "velcro", shape: rr(-0.075, -0.075, 0.15, 0.15, 0.01), blur: 0.003, amount: 0.03, col: "#1f2329", tex: "velcro", gloss: 0.05 },
    { name: "cross", shape: all(rr(-0.022, -0.062, 0.044, 0.124, 0.004), rr(-0.062, -0.022, 0.124, 0.044, 0.004)), blur: 0.002, amount: 0.02, col: "#ecebe6", tex: "canvas", gloss: 0.1, dirt: 0.5 },
    { name: "handle", shape: band([[-0.12, 0.17], [-0.06, 0.24], [0.06, 0.24], [0.12, 0.17]], 0.035), blur: 0.006, amount: 0.15, col: "#1b1e22", tex: "web", gloss: 0.12 },
    { name: "buckle", shape: all(rr(-0.15, 0.16, 0.05, 0.035, 0.006), rr(0.1, 0.16, 0.05, 0.035, 0.006)), blur: 0.004, amount: 0.08, col: "#2a2b2d", tex: "plastic", gloss: 0.7 },
    { name: "tourniquet", shape: band([[0.29, -0.11], [0.31, 0.02], [0.28, 0.1]], 0.026), blur: 0.004, amount: 0.07, col: "#2d3135", tex: "web", gloss: 0.15 },
  ],
  engrave: (g) => { g.strokeStyle = "#fff"; g.lineWidth = 0.004; g.beginPath(); g.moveTo(-0.24, -0.155); g.lineTo(0.24, -0.155); g.stroke(); g.beginPath(); g.moveTo(-0.24, 0.155); g.lineTo(0.24, 0.155); g.stroke(); },
  overlay(g) {
    zipper(g, -0.24, -0.155, 0.24, -0.155); zipper(g, -0.24, 0.155, 0.24, 0.155);
    pull(g, 0.22, -0.155, 0.4); pull(g, -0.2, 0.155, -0.3);
    stitch(g, pathRR(-0.07, -0.07, 0.14, 0.14, 0.008), "rgba(200,200,200,0.3)");
    stitch(g, pathRR(-0.255, -0.165, 0.51, 0.33, 0.07), "rgba(160,170,190,0.2)");
    worn(g, 55, (c) => { text(c, "TRAUMA", -0.16, -0.0, 0.034, "rgba(225,225,220,0.75)"); text(c, "KIT", 0.16, 0, 0.034, "rgba(225,225,220,0.75)"); }, 0.4);
    // a dark stain soaked into the fabric (old, brown-black: never red)
    const gr = g.createRadialGradient(0.12, 0.06, 0, 0.12, 0.06, 0.07); gr.addColorStop(0, "rgba(25,18,14,0.55)"); gr.addColorStop(1, "rgba(25,18,14,0)");
    g.fillStyle = gr; g.beginPath(); g.ellipse(0.12, 0.06, 0.08, 0.05, 0.4, 0, TAU); g.fill();
  },
};

// ═══════════════ LB8 · police evidence bag (gas mask inside) ═══════════════
const MASK: ObjDef = {
  code: "MASK", seed: 85, rot: 0, glint: [0, 0], ringR: 0,
  wet: 0, mud: 0.05,
  parts: [
    { name: "back", shape: rr(-0.25, -0.33, 0.5, 0.64, 0.02), blur: 0.004, amount: 0.02, col: "#8d9294", tex: "paper", gloss: 0.1, dirt: 0.3 },
    { name: "face", shape: el(0, -0.03, 0.12, 0.15), blur: 0.04, amount: 0.7, col: "#2a2c2e", tex: "rubber", gloss: 0.4 },
    { name: "lensL", shape: el(-0.055, -0.07, 0.04, 0.04), blur: 0.008, amount: 0.15, col: "#4a5960", tex: "glass", gloss: 1 },
    { name: "lensR", shape: el(0.055, -0.07, 0.04, 0.04), blur: 0.008, amount: 0.15, col: "#4a5960", tex: "glass", gloss: 1 },
    { name: "filter", shape: el(0, 0.1, 0.06, 0.05), blur: 0.012, amount: 0.5, col: "#4d5349", tex: "metal", gloss: 0.6 },
    { name: "strapsM", shape: all(band([[-0.11, -0.1], [-0.18, -0.2], [-0.12, -0.27]], 0.022), band([[0.11, -0.1], [0.18, -0.2], [0.12, -0.27]], 0.022)), blur: 0.004, amount: 0.06, col: "#1d1e20", tex: "rubber", gloss: 0.2 },
    { name: "label", shape: rr(-0.2, 0.18, 0.4, 0.11, 0.004), blur: 0.002, amount: 0.01, col: "#ecebe6", tex: "paper", gloss: 0.1, dirt: 0.4 },
  ],
  heightAt(X, Y) { const d = Math.hypot(X, Y - 0.1); return d < 0.045 ? Math.sin(Math.atan2(Y - 0.1, X) * 14) * 0.03 - 0.05 : 0; },
};
const LB8: ObjDef = {
  code: "LB8", seed: 86, rot: 0.25, glint: [-0.12, -0.2], ringR: 0.5, wet: 0.7, mud: 0.15,
  clear: { alpha: 0.36, inner: MASK },
  parts: [
    { name: "bag", shape: rr(-0.27, -0.36, 0.54, 0.7, 0.025), blur: 0.03, amount: 0.5, col: "#8f979c", tex: "plastic", gloss: 1, dirt: 0.2 },
    { name: "seal", shape: rr(-0.27, -0.36, 0.54, 0.035, 0.004), blur: 0.003, amount: 0.04, col: "#d9dde0", tex: "plastic", gloss: 0.9, dirt: 0.2 },
  ],
  heightAt(X, Y) { return (fbm(X * 7, Y * 7, 8, 4) - 0.5) * 0.5 + Math.max(0, 0.15 - Math.hypot(X, Y + 0.03) * 0.6) * 1.2; },
  overlay(g) {
    // printed label panel (opaque white, on the plastic) with chain-of-custody lines, a barcode
    g.fillStyle = "rgba(240,239,234,0.97)"; g.fillRect(-0.2, 0.18, 0.4, 0.11);
    text(g, "EVIDENCE", -0.07, 0.2, 0.026, "#1a1b1c");
    g.fillStyle = "#1a1b1c"; for (let i = 0; i < 3; i++) g.fillRect(-0.19, 0.225 + i * 0.019, 0.24, 0.0018);
    for (let i = 0; i < 26; i++) { const w = (i * 7919) % 3 === 0 ? 0.004 : 0.0018; g.fillRect(0.08 + i * 0.0042, 0.19, w, 0.05); }
    g.save(); g.strokeStyle = "rgba(30,40,60,0.85)"; g.lineWidth = 0.003; g.beginPath(); g.moveTo(-0.17, 0.243); g.bezierCurveTo(-0.13, 0.232, -0.1, 0.25, -0.05, 0.238); g.stroke(); g.restore();
    text(g, "DO NOT OPEN · PD", 0.0, -0.343, 0.019, "rgba(30,30,32,0.8)");
    // creases + crisp plastic highlights
    g.strokeStyle = "rgba(255,255,255,0.5)"; g.lineWidth = 0.003;
    for (const [x, y, x2, y2] of [[-0.22, -0.28, -0.12, -0.12], [0.18, -0.3, 0.24, -0.05], [-0.24, 0.05, -0.18, 0.15], [0.05, -0.31, 0.15, -0.26]] as const) { g.beginPath(); g.moveTo(x, y); g.quadraticCurveTo((x + x2) / 2 + 0.02, (y + y2) / 2, x2, y2); g.stroke(); }
    // rain beads on the plastic
    let s = 7; const r = () => ((s = (s * 16807) % 2147483647) / 2147483647);
    for (let i = 0; i < 60; i++) { const x = -0.25 + r() * 0.5, y = -0.33 + r() * 0.65, rad = 0.002 + r() * 0.005; g.fillStyle = "rgba(0,0,0,0.25)"; g.beginPath(); g.arc(x + rad * 0.4, y + rad * 0.4, rad, 0, TAU); g.fill(); g.fillStyle = "rgba(255,255,255,0.75)"; g.beginPath(); g.arc(x - rad * 0.3, y - rad * 0.3, rad * 0.45, 0, TAU); g.fill(); }
  },
};

export const OBJECTS: readonly ObjDef[] = [LB4, LB5, LB6, LB7, LB8];

/** The five looks in variant order (0 = LB4 … 4 = LB8). */
export const LOOT_OBJECT_CODES: readonly string[] = OBJECTS.map((o) => o.code);
/** Each look's angle on the street (rad) and its glint spot (m from the centre, before the turn). */
export const lootObjectPose = (v: number): { rot: number; glint: readonly [number, number] } => {
  const o = OBJECTS[v] ?? OBJECTS[0]!;
  return { rot: o.rot, glint: o.glint };
};
export const LOOT_FRAME_M = FRAME_M;

/**
 * The five objects (relief + crisp overlay), `LOOT_FRAME_M` square at `pxPerM`, with `make` for
 * every canvas. Fresh each call (the cache is per bake: an Android redraw draws them again).
 */
export function bakeLootObjects(pxPerM: number, make: (w: number, h: number) => HTMLCanvasElement): HTMLCanvasElement[] {
  const prevMake = makeCanvas;
  const prevRM = RM;
  makeCanvas = make;
  RM = pxPerM;
  cache.clear();
  try {
    return OBJECTS.map((o) => objectCanvas(o));
  } finally {
    cache.clear();
    makeCanvas = prevMake;
    RM = prevRM;
  }
}
