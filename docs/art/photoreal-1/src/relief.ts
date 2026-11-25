/**
 * The photoreal relief renderer (shared by the pilots): an object is a lit height field — stacked shape layers
 * blurred into volumes, engraved cuts, noise, an analytic height function — with a textured albedo and gloss,
 * lit from the map's top-left light, optionally supersampled.
 */
import { canvas, ctx, fbm, roundRect, type G } from "../../asset-fixes-1/src/lib";

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
  const K = 7 * ss;
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
      const lit = (0.32 + 0.9 * diff) * Math.max(0.3, ao);
      const k = i * 4;
      d[k] = Math.min(255, cr * lit + sp * 255 + sky * 90);
      d[k + 1] = Math.min(255, cg * lit + sp * 248 + sky * 100);
      d[k + 2] = Math.min(255, cb * lit + sp * 240 + sky * 125);
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
export const hex = (s: string): Rgb => [parseInt(s.slice(1, 3), 16), parseInt(s.slice(3, 5), 16), parseInt(s.slice(5, 7), 16)];
export const rect = (x: number, y: number, w: number, h: number, r = 0) => (g: G): void => {
  roundRect(g, x, y, w, h, r);
  g.fill();
};

