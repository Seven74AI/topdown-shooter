/**
 * Telegraphs (photoreal group 5): bake helpers. Everything here runs once in a Look's `bake()`; nothing is made per
 * frame. Light textures are cropped to their visible area (Story 9.15: a full-frame additive sprite costs ~1 FPS):
 * rings are 8 arc segments, glows are small squares.
 */
import { make, countSprite, rng, clamp01 } from "./kit";

/** Light from the upper left (palette.ts › LIGHT_DIR), normalised with some height. */
const L = (() => {
  const x = -0.6;
  const y = -0.8;
  const z = 0.9;
  const n = Math.hypot(x, y, z);
  return [x / n, y / n, z / n] as const;
})();

/** Value noise 0–1 (deterministic). */
function hash(x: number, y: number, s: number): number {
  let h = Math.imul(x | 0, 374761393) ^ Math.imul(y | 0, 668265263) ^ Math.imul(s, 2147483647);
  h = Math.imul(h ^ (h >>> 13), 1274126177);
  return ((h ^ (h >>> 16)) >>> 0) / 4294967295;
}
export function vnoise(x: number, y: number, s: number): number {
  const xi = Math.floor(x);
  const yi = Math.floor(y);
  const fx = x - xi;
  const fy = y - yi;
  const u = fx * fx * (3 - 2 * fx);
  const v = fy * fy * (3 - 2 * fy);
  const a = hash(xi, yi, s);
  const b = hash(xi + 1, yi, s);
  const c = hash(xi, yi + 1, s);
  const d = hash(xi + 1, yi + 1, s);
  return a + (b - a) * u + (c - a) * v + (a - b - c + d) * u * v;
}
export function fbm(x: number, y: number, s: number, oct = 4): number {
  let v = 0;
  let a = 0.5;
  let f = 1;
  for (let i = 0; i < oct; i++) {
    v += a * vnoise(x * f, y * f, s + i * 17);
    f *= 2;
    a *= 0.5;
  }
  return v / (1 - Math.pow(0.5, oct));
}

function boxBlur(src: Float32Array, w: number, h: number, r: number): Float32Array {
  if (r < 1) return src;
  const tmp = new Float32Array(w * h);
  const out = new Float32Array(w * h);
  const n = 2 * r + 1;
  for (let y = 0; y < h; y++) {
    let s = 0;
    for (let x = -r; x <= r; x++) s += src[y * w + Math.min(w - 1, Math.max(0, x))] as number;
    for (let x = 0; x < w; x++) {
      tmp[y * w + x] = s / n;
      s += (src[y * w + Math.min(w - 1, x + r + 1)] as number) - (src[y * w + Math.max(0, x - r)] as number);
    }
  }
  for (let x = 0; x < w; x++) {
    let s = 0;
    for (let y = -r; y <= r; y++) s += tmp[Math.min(h - 1, Math.max(0, y)) * w + x] as number;
    for (let y = 0; y < h; y++) {
      out[y * w + x] = s / n;
      s += (tmp[Math.min(h - 1, y + r + 1) * w + x] as number) - (tmp[Math.max(0, y - r) * w + x] as number);
    }
  }
  return out;
}

/**
 * Relights a flat drawing from the upper left (the street's one key light, cool tint). Height comes from the
 * picture: `fromAlpha` (a solid piece: its own silhouette bevels) and/or `fromLum` (a ground decal: dark = deep,
 * light = raised rim and debris). Returns a new canvas; the alpha is kept.
 */
export function relief(src: HTMLCanvasElement, o: { fromAlpha?: number; fromLum?: number; blur?: number; depth?: number; tint?: boolean }): HTMLCanvasElement {
  const w = src.width;
  const h = src.height;
  const img = src.getContext("2d", { willReadFrequently: true })!.getImageData(0, 0, w, h);
  const d = img.data;
  const H = new Float32Array(w * h);
  for (let i = 0; i < w * h; i++) {
    const a = (d[i * 4 + 3] as number) / 255;
    const lum = ((d[i * 4] as number) * 0.3 + (d[i * 4 + 1] as number) * 0.59 + (d[i * 4 + 2] as number) * 0.11) / 255;
    H[i] = (o.fromAlpha ?? 0) * a + (o.fromLum ?? 0) * (lum - 0.35) * a;
  }
  const Hb = boxBlur(H, w, h, o.blur ?? 2);
  const depth = o.depth ?? 6;
  const flat = L[2];
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const i = y * w + x;
      if ((d[i * 4 + 3] as number) === 0) continue;
      const dx = ((Hb[y * w + Math.min(w - 1, x + 1)] as number) - (Hb[y * w + Math.max(0, x - 1)] as number)) * depth;
      const dy = ((Hb[Math.min(h - 1, y + 1) * w + x] as number) - (Hb[Math.max(0, y - 1) * w + x] as number)) * depth;
      const n = Math.hypot(dx, dy, 1);
      const dif = Math.max(0, (-dx * L[0] - dy * L[1] + L[2]) / n);
      const f = 0.32 + 0.68 * (dif / flat);
      const tr = o.tint === false ? 1 : 0.93;
      const tb = o.tint === false ? 1 : 1.06;
      d[i * 4] = Math.min(255, (d[i * 4] as number) * f * tr);
      d[i * 4 + 1] = Math.min(255, (d[i * 4 + 1] as number) * f * 0.98);
      d[i * 4 + 2] = Math.min(255, (d[i * 4 + 2] as number) * f * tb);
    }
  }
  const c = make(w, h);
  c.getContext("2d")!.putImageData(img, 0, 0);
  return c;
}

/** A piece of a light texture placed in a local frame (metres), rotated about (cx, cy): one game sprite. */
export interface Seg {
  tex: HTMLCanvasElement;
  /** Top-left of the texture in the local frame, and its size (m). */
  x0: number;
  y0: number;
  w: number;
  h: number;
}
export function blitSeg(g: CanvasRenderingContext2D, s: Seg, cx: number, cy: number, rot: number, pxm: number, a: number, add: boolean, scale = 1): void {
  if (a <= 0.003) return;
  countSprite(add);
  g.save();
  g.globalAlpha = Math.min(1, a);
  if (add) g.globalCompositeOperation = "lighter";
  g.translate(cx, cy);
  g.rotate(rot);
  g.drawImage(s.tex, s.x0 * pxm * scale, s.y0 * pxm * scale, s.w * pxm * scale, s.h * pxm * scale);
  g.restore();
}
/** Same, with the source cropped to its first `frac` along x (Phaser `setCrop`): a strip revealed by progress. */
export function blitSegCrop(g: CanvasRenderingContext2D, s: Seg, cx: number, cy: number, rot: number, pxm: number, a: number, add: boolean, frac: number): void {
  const f = clamp01(frac);
  if (a <= 0.003 || f <= 0.002) return;
  countSprite(add);
  g.save();
  g.globalAlpha = Math.min(1, a);
  if (add) g.globalCompositeOperation = "lighter";
  g.translate(cx, cy);
  g.rotate(rot);
  const sw = Math.max(1, Math.round(s.tex.width * f));
  g.drawImage(s.tex, 0, 0, sw, s.tex.height, s.x0 * pxm, s.y0 * pxm, s.w * pxm * (sw / s.tex.width), s.h * pxm);
  g.restore();
}

/**
 * One 45° piece of a ring of light (centred on +x), radius R (m): a white-hot core line of `core` m, a red bloom
 * `outM` outside and `inM` inside, its intensity mottled like light on rough asphalt. Draw it 8 times rotated by
 * k × 45°: the ring costs 8 small sprites instead of a full-disc quad.
 */
export function ringSegment(R: number, o: { inM: number; outM: number; core: number; pxm: number; seed: number; hot?: string; bloom?: string; jag?: number }): Seg {
  const half = Math.PI / 8 + 0.02;
  const rIn = R - o.inM;
  const rOut = R + o.outM + (o.jag ?? 0);
  const x0 = rIn * Math.cos(half);
  const y0 = -rOut * Math.sin(half);
  const wM = rOut - x0;
  const hM = -2 * y0;
  const pxm = o.pxm;
  const W = Math.ceil(wM * pxm);
  const Hh = Math.ceil(hM * pxm);
  const c = make(W, Hh);
  const g = c.getContext("2d")!;
  const img = g.createImageData(W, Hh);
  const hot = (o.hot ?? "255,236,220").split(",").map(Number) as [number, number, number];
  const bl = (o.bloom ?? "255,52,34").split(",").map(Number) as [number, number, number];
  for (let py = 0; py < Hh; py++) {
    for (let px = 0; px < W; px++) {
      const x = x0 + (px + 0.5) / pxm;
      const y = y0 + (py + 0.5) / pxm;
      const r = Math.hypot(x, y);
      const ang = Math.atan2(y, x);
      if (Math.abs(ang) > half) continue;
      // the rim wanders a little (jag) where the light catches the rough ground
      const jr = R + (o.jag ? (fbm(ang * R * 1.7, 3.1, o.seed) - 0.5) * 2 * o.jag : 0);
      const dr = r - jr;
      let bloom = dr >= 0 ? Math.exp(-Math.pow(dr / (o.outM * 0.45), 2)) : Math.exp(-Math.pow(-dr / (o.inM * 0.42), 1.6));
      const core = Math.exp(-Math.pow(dr / (o.core * 0.5), 2));
      // light on asphalt: aggregate mottling
      const ag = 0.72 + 0.28 * fbm(x * 6, y * 6, o.seed + 3) + (hash(Math.floor(x * pxm), Math.floor(y * pxm), o.seed) - 0.5) * 0.18;
      bloom *= ag;
      // fade the segment ends softly so 8 pieces blend into one ring
      const endF = clamp01((half - Math.abs(ang)) / 0.02 + 0.0001);
      const a = clamp01(bloom * 0.75 + core) * endF;
      const k = core / (core + bloom * 0.75 + 1e-6);
      const j = (py * W + px) * 4;
      img.data[j] = Math.round(bl[0] + (hot[0] - bl[0]) * k);
      img.data[j + 1] = Math.round(bl[1] + (hot[1] - bl[1]) * k);
      img.data[j + 2] = Math.round(bl[2] + (hot[2] - bl[2]) * k);
      img.data[j + 3] = Math.round(255 * a);
    }
  }
  g.putImageData(img, 0, 0);
  return { tex: c, x0, y0, w: W / pxm, h: Hh / pxm };
}
/** Draws a ring from its segment (8 sprites). */
export function drawRing(g: CanvasRenderingContext2D, seg: Seg, cx: number, cy: number, pxm: number, a: number, add = true, scale = 1, spin = 0): void {
  for (let i = 0; i < 8; i++) blitSeg(g, seg, cx, cy, spin + (i * Math.PI) / 4, pxm, a, add, scale);
}

/** A soft round light (additive): white core, coloured bloom. px square. */
export function glowTex(px: number, core: string, bloom: string, coreR = 0.12): HTMLCanvasElement {
  const c = make(px, px);
  const g = c.getContext("2d")!;
  const gr = g.createRadialGradient(px / 2, px / 2, 0, px / 2, px / 2, px / 2);
  gr.addColorStop(0, `rgba(${core},1)`);
  gr.addColorStop(coreR, `rgba(${core},0.85)`);
  gr.addColorStop(coreR * 2.2, `rgba(${bloom},0.45)`);
  gr.addColorStop(0.6, `rgba(${bloom},0.12)`);
  gr.addColorStop(1, `rgba(${bloom},0)`);
  g.fillStyle = gr;
  g.fillRect(0, 0, px, px);
  return c;
}

/** A spark streak (additive): a white-yellow core fading to orange, pointing +x. */
export function streakTex(): HTMLCanvasElement {
  const c = make(48, 10);
  const g = c.getContext("2d")!;
  const gr = g.createLinearGradient(0, 0, 48, 0);
  gr.addColorStop(0, "rgba(255,90,30,0)");
  gr.addColorStop(0.6, "rgba(255,150,60,0.55)");
  gr.addColorStop(0.92, "rgba(255,240,200,1)");
  gr.addColorStop(1, "rgba(255,255,240,0)");
  g.fillStyle = gr;
  g.beginPath();
  g.ellipse(24, 5, 24, 2.2, 0, 0, Math.PI * 2);
  g.fill();
  return c;
}

/**
 * A dust puff (matter, normal blend): a lumpy cloud of fine concrete / asphalt dust, lit from the upper left
 * (brighter on that side, a soft self-shadow down-right). `col` "r,g,b".
 */
export function dustTex(px: number, seed: number, col = "138,130,120"): HTMLCanvasElement {
  const c = make(px, px);
  const g = c.getContext("2d")!;
  const img = g.createImageData(px, px);
  const [r, gg, b] = col.split(",").map(Number) as [number, number, number];
  for (let y = 0; y < px; y++) {
    for (let x = 0; x < px; x++) {
      const u = (x + 0.5) / px - 0.5;
      const v = (y + 0.5) / px - 0.5;
      const d = Math.hypot(u, v) * 2;
      const n = fbm(u * 5 + seed, v * 5, seed, 5);
      const dens = clamp01((1 - d) * 1.6 - 0.25 + (n - 0.5) * 1.3);
      if (dens <= 0) continue;
      const lit = 0.78 + 0.34 * clamp01(0.5 - (u * 0.6 + v * 0.8) * 1.4) + (n - 0.5) * 0.2;
      const j = (y * px + x) * 4;
      img.data[j] = Math.min(255, r * lit * 0.93);
      img.data[j + 1] = Math.min(255, gg * lit * 0.98);
      img.data[j + 2] = Math.min(255, b * lit * 1.06);
      img.data[j + 3] = Math.round(255 * Math.pow(dens, 1.3) * 0.85);
    }
  }
  g.putImageData(img, 0, 0);
  return c;
}

/**
 * A fissure strip (radial crack) along +x, `lenM` long: a dark crack with crumbled lips (matter, normal blend) and
 * its glow (red light seeping out of it, additive), as two Segs with the same footprint.
 */
export function fissure(lenM: number, wM: number, pxm: number, seed: number): { crack: Seg; glow: Seg } {
  const W = Math.ceil(lenM * pxm);
  const H = Math.ceil(wM * pxm);
  const R = rng(seed);
  // a wandering path (fbm along its length, about 2 kinks a metre) and a few short spurs
  const pts: [number, number][] = [];
  const steps = Math.max(16, Math.round(lenM * 6));
  for (let i = 0; i <= steps; i++) {
    const x = (i / steps) * lenM;
    const y = (fbm(x * 0.9 + seed * 0.37, 1.7, seed) - 0.5) * wM * 0.9 + (R() - 0.5) * wM * 0.06;
    pts.push([x, Math.max(-wM * 0.32, Math.min(wM * 0.32, y))]);
  }
  const spurs: [number, number][][] = [];
  const nSp = Math.max(2, Math.round(lenM / 1.6));
  for (let k = 0; k < nSp; k++) {
    const at = pts[Math.floor((0.1 + R() * 0.8) * steps)] as [number, number];
    const dir = (R() < 0.5 ? -1 : 1) * (0.35 + R() * 0.4);
    const L = lenM * (0.05 + R() * 0.08);
    const sp: [number, number][] = [at];
    let [x, y] = at;
    for (let i = 0; i < 4; i++) {
      x += (L / 4) * Math.cos(dir);
      y += (L / 4) * Math.sin(dir) + (R() - 0.5) * 0.03;
      sp.push([x, Math.max(-wM * 0.42, Math.min(wM * 0.42, y))]);
    }
    spurs.push(sp);
  }
  const mk = (glow: boolean): HTMLCanvasElement => {
    const c = make(W, H);
    const g = c.getContext("2d")!;
    g.translate(0, H / 2);
    g.lineCap = "round";
    g.lineJoin = "round";
    const line = (pp: [number, number][], wFrom: number, wTo: number, style: string, blur = 0): void => {
      g.strokeStyle = style;
      if (blur) g.filter = `blur(${blur}px)`;
      for (let i = 1; i < pp.length; i++) {
        const a = pp[i - 1] as [number, number];
        const b = pp[i] as [number, number];
        const k = i / pp.length;
        g.lineWidth = Math.max(0.6, (wFrom + (wTo - wFrom) * k) * pxm);
        g.beginPath();
        g.moveTo(a[0] * pxm, a[1] * pxm);
        g.lineTo(b[0] * pxm, b[1] * pxm);
        g.stroke();
      }
      g.filter = "none";
    };
    const path = (wFrom: number, wTo: number, style: string, blur = 0): void => {
      line(pts, wFrom, wTo, style, blur);
      for (const sp of spurs) line(sp, wTo * 0.9, wTo * 0.3, style, blur);
    };
    if (glow) {
      path(0.22, 0.08, "rgba(255,40,24,0.3)", pxm * 0.07);
      path(0.045, 0.018, "rgba(255,140,90,0.85)");
    } else {
      path(0.16, 0.05, "rgba(50,46,42,0.5)"); // crumbled lips
      path(0.07, 0.02, "rgba(10,8,8,0.95)"); // the crack
    }
    return c;
  };
  const seg = (tex: HTMLCanvasElement): Seg => ({ tex, x0: 0, y0: -wM / 2, w: W / pxm, h: H / pxm });
  return { crack: seg(mk(false)), glow: seg(mk(true)) };
}

/** Scanlines + phosphor bloom over a HUD plate (the display as a real emissive screen). */
export function screenLook(src: HTMLCanvasElement, artScale: number): HTMLCanvasElement {
  const w = src.width;
  const h = src.height;
  const c = make(w, h);
  const g = c.getContext("2d")!;
  // bloom (baked: no filter at run time)
  g.filter = `blur(${4 * artScale}px)`;
  g.globalAlpha = 0.85;
  g.globalCompositeOperation = "lighter";
  g.drawImage(src, 0, 0);
  g.filter = `blur(${1.2 * artScale}px)`;
  g.globalAlpha = 0.6;
  g.drawImage(src, 0, 0);
  g.filter = "none";
  g.globalAlpha = 1;
  g.globalCompositeOperation = "source-over";
  // slight red/cyan fringe: the red channel a hair to the left
  g.globalAlpha = 0.35;
  g.drawImage(src, -artScale * 0.6, 0);
  g.globalAlpha = 1;
  g.drawImage(src, 0, 0);
  // scanlines (every 2 CSS px), only where the plate is
  g.globalCompositeOperation = "destination-out";
  g.fillStyle = "rgba(0,0,0,0.28)";
  for (let y = 0; y < h; y += 2 * artScale) g.fillRect(0, y, w, artScale * 0.8);
  // a soft glass sheen from the upper left
  g.globalCompositeOperation = "source-atop";
  const gr = g.createLinearGradient(0, 0, w * 0.6, h);
  gr.addColorStop(0, "rgba(255,255,255,0.10)");
  gr.addColorStop(0.5, "rgba(255,255,255,0)");
  g.fillStyle = gr;
  g.fillRect(0, 0, w, h);
  return c;
}
