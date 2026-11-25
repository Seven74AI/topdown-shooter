import { fbm, hash2 } from "./groundDamageArt";

/**
 * Photoreal group 3 (designer 2026-11-25, `docs/art/photoreal-decisions.md`): the approved "relit" look of the things
 * you build, in game code. A code drawing (rasterised at `ss`× the output size) becomes rounded volumes lit by the
 * cool street key light, with materials read from its colours: wood grain along `dir`, brushed and pitted steel,
 * rough rust, woven cloth; gloss on steel. Pixels the item marks as glowing (lamps, the med cross, an LED) keep their
 * colour and also go to a separate glow layer (with a bloom), so the view can pulse them. The brightest steel
 * highlights become glint spots. Pure canvas work (no Phaser); `make` makes a canvas (a node canvas in tests).
 *
 * Review M1 (2026-11-25): resumable. `relightSteps` is a generator that yields after every row of every pass (its
 * value: the work done, in source pixels), so the atlas bake can spread one picture over many frames within a
 * per-frame budget; `relight` runs it to the end in one go.
 */

export type MakeCanvas = (w: number, h: number) => HTMLCanvasElement;
export type Emissive = (r: number, g: number, b: number) => boolean;

export interface RelightOpts {
  /** Grain / brushing direction (the planks' long axis). */
  readonly dir: "x" | "y";
  readonly emissive?: Emissive;
  /** How many glint spots to keep. */
  readonly glints: number;
  readonly seed: number;
  /** The bloom's blur (output px); 4 at the game's 96 px per metre (the proposal's 8 at 192). */
  readonly bloomPx?: number;
}

export interface Relit {
  readonly base: HTMLCanvasElement;
  /** The glowing pixels' bloom (blurred), kept off the solid parts next to them; null when nothing glows. */
  readonly bloom: HTMLCanvasElement | null;
  /** Centre and radius of the glowing part (output px). */
  readonly glowAt: readonly [number, number, number];
  /** Glint spots on the steel (output px). */
  readonly spots: readonly (readonly [number, number])[];
}

export function hueOf(r: number, g: number, b: number): number {
  const mx = Math.max(r, g, b);
  const mn = Math.min(r, g, b);
  if (mx === mn) return 0;
  const d = mx - mn;
  let h = mx === r ? ((g - b) / d) % 6 : mx === g ? (b - r) / d + 2 : (r - g) / d + 4;
  h *= 60;
  return h < 0 ? h + 360 : h;
}
export function satOf(r: number, g: number, b: number): number {
  const mx = Math.max(r, g, b);
  return mx > 0 ? (mx - Math.min(r, g, b)) / mx : 0;
}
/** A lamp's white-hot lens. */
export const lampWhite: Emissive = (r, g, b) => (r + g + b) / 765 > 0.86 && satOf(r, g, b) < 0.4;
/** The med station's green cross. */
export const crossGreen: Emissive = (r, g, b) => {
  const h = hueOf(r, g, b);
  return h > 115 && h < 175 && satOf(r, g, b) > 0.35 && Math.max(r, g, b) > 150;
};
/** A red LED. */
export const ledRed: Emissive = (r, g, b) => {
  const h = hueOf(r, g, b);
  return (h < 18 || h > 340) && satOf(r, g, b) > 0.6 && r > 120;
};
/** An amber warning lamp. */
export const amberLamp: Emissive = (r, g, b) => {
  const h = hueOf(r, g, b);
  return h > 25 && h < 55 && satOf(r, g, b) > 0.55 && r > 200;
};

/** `boxBlurSteps` in one go. */
export function boxBlur(src: Float32Array, w: number, h: number, r: number): Float32Array {
  const g = boxBlurSteps(src, w, h, r);
  let s = g.next();
  while (!s.done) s = g.next();
  return s.value;
}

/** A two-pass box blur, yielding after each row (horizontal) and each column (vertical): `w` / `h` units. */
export function* boxBlurSteps(src: Float32Array, w: number, h: number, r: number): Generator<number, Float32Array, void> {
  const a = src.slice();
  const t = new Float32Array(w * h);
  const rr = Math.max(1, Math.round(r));
  for (let pass = 0; pass < 2; pass++) {
    for (let y = 0; y < h; y++) {
      let acc = 0;
      for (let x = -rr; x <= rr; x++) acc += a[y * w + Math.min(w - 1, Math.max(0, x))] as number;
      for (let x = 0; x < w; x++) {
        t[y * w + x] = acc / (2 * rr + 1);
        acc += (a[y * w + Math.min(w - 1, x + rr + 1)] as number) - (a[y * w + Math.max(0, x - rr)] as number);
      }
      yield w;
    }
    for (let x = 0; x < w; x++) {
      let acc = 0;
      for (let y = -rr; y <= rr; y++) acc += t[Math.min(h - 1, Math.max(0, y)) * w + x] as number;
      for (let y = 0; y < h; y++) {
        a[y * w + x] = acc / (2 * rr + 1);
        acc += (t[Math.min(h - 1, y + rr + 1) * w + x] as number) - (t[Math.max(0, y - rr) * w + x] as number);
      }
      yield h;
    }
  }
  return a;
}

/**
 * Relights `src` (the drawing, any size: it is shrunk to the output `w × h`). `ss` scales the blur radii and textures
 * in source px: 2 for a source at 384 px per metre, as on the approved proposal page.
 */
export function relight(src: HTMLCanvasElement, w: number, h: number, ss: number, opt: RelightOpts, make: MakeCanvas): Relit {
  const g = relightSteps(src, w, h, ss, opt, make);
  let s = g.next();
  while (!s.done) s = g.next();
  return s.value;
}

/** `relight`, resumable: yields the work done (source pixels) after every row of every pass; returns the result. */
export function* relightSteps(src: HTMLCanvasElement, w: number, h: number, ss: number, opt: RelightOpts, make: MakeCanvas): Generator<number, Relit, void> {
  const W = src.width;
  const H = src.height;
  const k = W / w; // source px per output px
  const sg = src.getContext("2d", { willReadFrequently: true }) as CanvasRenderingContext2D;
  const d = sg.getImageData(0, 0, W, H).data;
  yield (W * H) >> 3;
  const n = W * H;
  const A = new Float32Array(n);
  const lum = new Float32Array(n);
  const sat = new Float32Array(n);
  const hu = new Float32Array(n);
  const emis = new Uint8Array(n);
  const seed = opt.seed;
  let ex = 0;
  let ey = 0;
  let ec = 0;
  for (let i = 0; i < n; i++) {
    const r = d[i * 4] as number;
    const g = d[i * 4 + 1] as number;
    const b = d[i * 4 + 2] as number;
    A[i] = (d[i * 4 + 3] as number) / 255;
    lum[i] = (r * 0.3 + g * 0.55 + b * 0.15) / 255;
    sat[i] = satOf(r, g, b);
    hu[i] = hueOf(r, g, b);
    if (opt.emissive && (A[i] as number) > 0.6 && opt.emissive(r, g, b)) {
      emis[i] = 1;
      ex += i % W;
      ey += (i / W) | 0;
      ec++;
    }
    if ((i + 1) % W === 0) yield W;
  }
  // creases: dark lines and sharp colour edges
  const E = new Float32Array(n);
  for (let y = 1; y < H - 1; y++) {
    for (let x = 1; x < W - 1; x++) {
      const i = y * W + x;
      if ((A[i] as number) < 0.5) continue;
      const r0 = d[i * 4] as number;
      const g0 = d[i * 4 + 1] as number;
      const b0 = d[i * 4 + 2] as number;
      let edge = 0;
      for (let q = 0; q < 4; q++) {
        const j = (q === 0 ? i - 1 : q === 1 ? i + 1 : q === 2 ? i - W : i + W) * 4;
        const e = Math.abs(r0 - (d[j] as number)) + Math.abs(g0 - (d[j + 1] as number)) + Math.abs(b0 - (d[j + 2] as number));
        if (e > edge) edge = e;
      }
      edge /= 255;
      E[i] = Math.min(1, Math.max((lum[i] as number) < 0.08 ? 1 : 0, edge > 0.2 ? edge * 1.2 : 0));
    }
    yield W;
  }
  const cut = new Float32Array(n);
  for (let i = 0; i < n; i++) cut[i] = (A[i] as number) * (1 - (E[i] as number));
  const b1 = yield* boxBlurSteps(cut, W, H, 1.2 * ss);
  const b2 = yield* boxBlurSteps(cut, W, H, 3 * ss);
  const b3 = yield* boxBlurSteps(cut, W, H, 7 * ss);
  // material per pixel: 0 other, 1 wood, 2 steel, 3 rust, 4 cloth
  const mat = new Uint8Array(n);
  const Hf = new Float32Array(n);
  const along = opt.dir === "x";
  for (let i = 0; i < n; i++) {
    const x = i % W;
    const y = (i / W) | 0;
    const hh = hu[i] as number;
    const s = sat[i] as number;
    const l = lum[i] as number;
    let m = 0;
    if (s < 0.16 && l > 0.12) m = 2;
    else if (hh >= 8 && hh < 30 && s > 0.45 && l < 0.45) m = 3;
    else if (hh >= 22 && hh < 55 && s > 0.15 && s < 0.6 && l > 0.15) m = l > 0.5 && s < 0.4 ? 4 : 1;
    mat[i] = m;
    const u = along ? x : y;
    const v = along ? y : x;
    let tex: number;
    if (m === 1) {
      const ring = Math.sin(v / (2.2 * ss) + fbm(u / (60 * ss), v / (8 * ss), seed, 3) * 9);
      tex = ring * 0.012 + (fbm(u / (40 * ss), v / (1.6 * ss), seed + 1, 3) - 0.5) * 0.05 + (hash2(u >> 2, v, seed) - 0.5) * 0.012;
    } else if (m === 2) {
      tex = (fbm(u / (30 * ss), v / (0.8 * ss), seed + 2, 2) - 0.5) * 0.012 - (fbm(x / (1.2 * ss), y / (1.2 * ss), seed + 3, 2) > 0.72 ? 0.01 : 0);
    } else if (m === 3) tex = (fbm(x / (1.4 * ss), y / (1.4 * ss), seed + 4, 3) - 0.5) * 0.06;
    else if (m === 4) tex = Math.sin((x * 1.5) / ss) * Math.sin((y * 1.5) / ss) * 0.01 + (fbm(x / (4 * ss), y / (4 * ss), seed + 5, 3) - 0.5) * 0.05;
    else tex = (fbm(x / (2 * ss), y / (2 * ss), seed + 6, 2) - 0.5) * 0.02;
    Hf[i] = ((b1[i] as number) * 0.3 + (b2[i] as number) * 0.35 + (b3[i] as number) * 0.35) * (A[i] as number) + tex * (A[i] as number) - (E[i] as number) * 0.08;
    if ((i + 1) % W === 0) yield W;
  }
  const base = sg.createImageData(W, H);
  const glow = sg.createImageData(W, H);
  const occ = sg.createImageData(W, H);
  const o = base.data;
  const go = glow.data;
  const oc = occ.data;
  const L = [-0.5, -0.72, 0.48] as const;
  const ll = Math.hypot(L[0], L[1], L[2]);
  const lx = L[0] / ll;
  const ly = L[1] / ll;
  const lz = L[2] / ll;
  const tint = [0.94, 0.98, 1.06] as const;
  const K = 12;
  const cand: [number, number, number][] = [];
  for (let y = 1; y < H - 1; y++) {
    for (let x = 1; x < W - 1; x++) {
      const i = y * W + x;
      const a = A[i] as number;
      if (a <= 0.004) continue;
      const dx = ((Hf[i + 1] as number) - (Hf[i - 1] as number)) * K;
      const dy = ((Hf[i + W] as number) - (Hf[i - W] as number)) * K;
      const nl = Math.sqrt(dx * dx + dy * dy + 1);
      const nx = -dx / nl;
      const ny = -dy / nl;
      const nz = 1 / nl;
      const nd = nx * lx + ny * ly + nz * lz;
      const diff = Math.max(0, nd);
      const m = mat[i] as number;
      const l0 = lum[i] as number;
      const glossK = Math.min(1, m === 2 ? 0.75 : m === 3 ? 0.04 : m === 1 ? 0.1 : m === 4 ? 0.02 : (l0 < 0.18 ? 0.5 : 0) + ((sat[i] as number) > 0.55 ? 0.4 : 0) + 0.08);
      const rz = 2 * nd * nz - lz;
      const rp = rz > 0 ? rz : 0;
      const r2 = rp * rp;
      const r4 = r2 * r2;
      const r16 = r4 * r4 * r4 * r4;
      const sp = (m === 2 ? r16 * r4 * r4 * r4 : r16) * glossK; // rz^28 or rz^16
      const grain = 1 + (hash2(x, y, seed) - 0.5) * 0.05 + (fbm(x / (1.2 * ss), y / (1.2 * ss), seed + 7, 2) - 0.5) * 0.14 * (1 - glossK);
      const ao = 1 - (E[i] as number) * 0.3;
      // thin parts (wire, chain, legs) keep most of their drawn colour; soft see-through parts stay as drawn
      const thin = Math.min(1, Math.max(0, 1 - (b2[i] as number) / Math.max(0.01, a) - 0.15) * 1.6);
      const solid = Math.min(1, Math.max(0, (a - 0.35) / 0.4)) * (1 - 0.75 * thin);
      for (let c = 0; c < 3; c++) {
        const v = d[i * 4 + c] as number;
        const lit = Math.min(255, v * (0.42 + 0.88 * diff * (tint[c] as number)) * grain * ao + sp * 230 * (tint[c] as number));
        o[i * 4 + c] = emis[i] ? v : v + (lit - v) * solid;
      }
      o[i * 4 + 3] = d[i * 4 + 3] as number;
      if (!emis[i] && a > 0.5) oc[i * 4 + 3] = 255;
      if (emis[i]) {
        for (let c = 0; c < 3; c++) go[i * 4 + c] = d[i * 4 + c] as number;
        go[i * 4 + 3] = 255;
      }
      if (m === 2 && glossK > 0.4 && solid > 0.9 && sp > 0.35 && (x + y * 7) % 3 === 0) cand.push([x, y, sp]);
    }
    yield W;
  }
  cand.sort((p, q) => q[2] - p[2]);
  const spots: [number, number][] = [];
  const minD = 10 * ss;
  for (const p of cand) {
    if (spots.length >= opt.glints) break;
    if (spots.every((s) => Math.hypot(s[0] * k - p[0], s[1] * k - p[1]) > minD)) spots.push([p[0] / k, p[1] / k]);
  }
  const scratch: HTMLCanvasElement[] = [];
  const shrink = (img: ImageData, blur = 0, keep = true): HTMLCanvasElement => {
    const c = make(W, H);
    (c.getContext("2d") as CanvasRenderingContext2D).putImageData(img, 0, 0);
    const out = make(w, h);
    const og = out.getContext("2d") as CanvasRenderingContext2D;
    og.imageSmoothingEnabled = true;
    if (blur) og.filter = `blur(${blur}px)`;
    og.drawImage(c, 0, 0, w, h);
    scratch.push(c);
    if (!keep) scratch.push(out);
    return out;
  };
  // review M3: scratch canvases are emptied (Safari keeps their memory otherwise, see canvasTexture.ts › releaseCanvas)
  const release = (): void => {
    for (const c of scratch) {
      c.width = 0;
      c.height = 0;
    }
  };
  let bloom: HTMLCanvasElement | null = null;
  if (ec > 0) {
    bloom = shrink(glow, opt.bloomPx ?? 4);
    yield (W * H) >> 3;
    const bg = bloom.getContext("2d") as CanvasRenderingContext2D;
    bg.filter = "none";
    bg.drawImage(shrink(glow, 0, false), 0, 0); // the glowing pixels themselves, crisp, under their halo
    yield (W * H) >> 3;
    bg.globalCompositeOperation = "destination-out";
    bg.globalAlpha = 0.85;
    bg.drawImage(shrink(occ, 0, false), 0, 0);
  }
  const gr = ec ? Math.sqrt(ec / Math.PI) / k : 0;
  yield (W * H) >> 3;
  const baseOut = shrink(base);
  release();
  return { base: baseOut, bloom, glowAt: [ex / Math.max(1, ec) / k, ey / Math.max(1, ec) / k, gr], spots };
}
