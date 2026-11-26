import { fbm, hash2 } from "./groundDamageArt";
import { READ_BAND_ROWS, hueOf, type MakeCanvas } from "./relight";
import { freeCanvas } from "./canvasRecycle";

/**
 * Story 9.13 (photoreal group 1, approved 2026-11-25: "take 4 with today's grey see-through outline"): the characters'
 * relit look, in game code. Take 4's renderer (`docs/art/photoreal-2/src/take4.ts › relight4`): each colour region of
 * today's drawing becomes its own rounded volume (outlines and colour edges are creases), lit by the cool key light
 * with deep shading; cloth gets a woven texture, skin a fine mottle; dark, saturated and pale-metal areas get gloss.
 * Glowing details (acid, veins, pilot flames) are found from their colour and kept as a separate emissive layer.
 * KEEP_OUTLINE is hard-wired on: pixels with lum < 0.09 (today's outline) are copied as drawn, unlit, so the outline
 * stays grey and see-through.
 *
 * Game version: resumable (`relightCharSteps` yields after every band / row of every pass, like `relight.ts`), canvases
 * from `make` (no `document`: the bake worker runs it), the bloom blurred with a box blur instead of `ctx.filter`, and
 * every fixed-px constant of the page (68 px per radius on its output) rescaled to the game's `CHAR_R_PX` (B3).
 */

/** Sheen positions baked per look (B5: `sx = sin(0.4 t)` is the only parameter). */
export const SHEEN_STEPS = 8;
/** The sheen pictures are half the frame's resolution (a soft gradient over the gloss). */
export const SHEEN_SCALE = 0.5;

export interface CharLit {
  readonly base: HTMLCanvasElement;
  /** The glow layer (glowing pixels × 0.5 + their bloom × 2, as take 4 draws them), premultiplied for ADD; null: nothing glows. */
  readonly glow: HTMLCanvasElement | null;
  /** The gloss mask (white, alpha = gloss), output size; for the sheen and the Bloater's veins. */
  readonly gloss: HTMLCanvasElement;
}

/** The page's output density (px per radius): its fixed-px constants are in these px. */
const PAGE_PX_PER_R = 68;

/**
 * Relights `src` (the drawing at `srcPxPerR` px per radius, `ss` × the output) into an output of `n × n`. Yields the
 * work done (source px) after every readback band and every row or column of every pass.
 */
export function* relightCharSteps(src: HTMLCanvasElement, n: number, ss: number, srcPxPerR: number, seed: number, make: MakeCanvas): Generator<number, CharLit, void> {
  const W = src.width;
  /** Source px per page-output px: every fixed-px constant of the page × this. */
  const u = srcPxPerR / PAGE_PX_PER_R;
  const sg = src.getContext("2d", { willReadFrequently: true }) as CanvasRenderingContext2D;
  const full = new Uint8ClampedArray(W * W * 4);
  for (let y0 = 0; y0 < W; y0 += READ_BAND_ROWS) {
    const bh = Math.min(READ_BAND_ROWS, W - y0);
    full.set(sg.getImageData(0, y0, W, bh).data, y0 * W * 4);
    yield W * bh;
  }
  // B16: only the drawing's bounding box (+ a clear margin) is relit: the blurs clamp at its edge, which equals the
  // clear surroundings, and the noise uses frame coordinates, so the picture is the same as relighting the whole frame
  let bx0 = W;
  let by0 = W;
  let bx1 = -1;
  let by1 = -1;
  for (let y = 0; y < W; y++) {
    for (let x = 0; x < W; x++) {
      if ((full[(y * W + x) * 4 + 3] as number) === 0) continue;
      if (x < bx0) bx0 = x;
      if (x > bx1) bx1 = x;
      if (y < by0) by0 = y;
      if (y > by1) by1 = y;
    }
    yield W;
  }
  if (bx1 < 0) {
    const empty = (): HTMLCanvasElement => make(n, n);
    return { base: empty(), glow: null, gloss: empty() };
  }
  // the margin covers the widest blur's whole reach (two passes of 8 page px), so the clamped edge is still clear
  const M = Math.ceil(16 * u) + 2;
  const ox = Math.max(0, bx0 - M);
  const oy = Math.max(0, by0 - M);
  const CW = Math.min(W, bx1 + M + 1) - ox;
  const CH = Math.min(W, by1 + M + 1) - oy;
  const d = new Uint8ClampedArray(CW * CH * 4);
  for (let y = 0; y < CH; y++) d.set(full.subarray(((y + oy) * W + ox) * 4, ((y + oy) * W + ox + CW) * 4), y * CW * 4);
  const N2 = CW * CH;
  const A = new Float32Array(N2);
  const lum = new Float32Array(N2);
  const sat = new Float32Array(N2);
  const emis = new Uint8Array(N2);
  let ec = 0;
  for (let i = 0; i < N2; i++) {
    const r = d[i * 4] as number;
    const g = d[i * 4 + 1] as number;
    const b = d[i * 4 + 2] as number;
    const a = (d[i * 4 + 3] as number) / 255;
    A[i] = a;
    lum[i] = (r * 0.3 + g * 0.55 + b * 0.15) / 255;
    const mx = r > g ? (r > b ? r : b) : g > b ? g : b;
    const mn = r < g ? (r < b ? r : b) : g < b ? g : b;
    const s = mx > 0 ? (mx - mn) / mx : 0;
    sat[i] = s;
    if (a > 0.5 && s > 0.45) {
      // glowing details: bright, saturated acid green / yellow-green, flame orange, pilot blue
      const h = hueOf(r, g, b);
      const bright = mx / 255;
      const isAcid = h > 80 && h < 135 && s > 0.55 && bright > 0.6; // hi-vis yellow-green at ~68° stays matte
      const isFlame = (h < 45 || h > 330) && s > 0.6 && bright > 0.85;
      const isPilot = h > 190 && h < 240 && bright > 0.8;
      if (isAcid || isFlame || isPilot) {
        emis[i] = 1;
        ec++;
      }
    }
    if ((i + 1) % CW === 0) yield CW;
  }
  // creases: dark outlines and sharp colour edges
  const E = new Float32Array(N2);
  for (let y = 1; y < CH - 1; y++) {
    for (let x = 1; x < CW - 1; x++) {
      const i = y * CW + x;
      if ((A[i] as number) < 0.5) continue;
      const r0 = d[i * 4] as number;
      const g0 = d[i * 4 + 1] as number;
      const b0 = d[i * 4 + 2] as number;
      let edge = 0;
      for (let q = 0; q < 4; q++) {
        const j = (q === 0 ? i - 1 : q === 1 ? i + 1 : q === 2 ? i - CW : i + CW) * 4;
        const e = Math.abs(r0 - (d[j] as number)) + Math.abs(g0 - (d[j + 1] as number)) + Math.abs(b0 - (d[j + 2] as number));
        if (e > edge) edge = e;
      }
      edge /= 255;
      E[i] = Math.min(1, Math.max((lum[i] as number) < 0.09 ? 1 : 0, edge > 0.22 ? edge * 1.2 : 0));
    }
    yield CW;
  }
  const cut = new Float32Array(N2);
  for (let i = 0; i < N2; i++) cut[i] = (A[i] as number) * (1 - (E[i] as number));
  const b1 = yield* rowBoxBlurSteps(cut, CW, CH, 1.2 * u);
  const b2 = yield* rowBoxBlurSteps(cut, CW, CH, 3.5 * u);
  const b3 = yield* rowBoxBlurSteps(cut, CW, CH, 8 * u);
  const H = new Float32Array(N2);
  for (let i = 0; i < N2; i++) {
    const a = A[i] as number;
    if (a <= 0) {
      if ((i + 1) % CW === 0) yield CW;
      continue;
    }
    const x = (i % CW) + ox;
    const y = ((i / CW) | 0) + oy;
    const l = lum[i] as number;
    const matte = (sat[i] as number) < 0.5 && l > 0.12 && l < 0.8;
    // woven texture on matte areas (cloth), fine mottle elsewhere
    const weave = matte ? Math.sin((x * 1.3) / u) * Math.sin((y * 1.3) / u) * 0.008 + (fbm(x / (3 * u), y / (3 * u), seed, 3) - 0.5) * 0.05 : (fbm(x / (1.5 * u), y / (1.5 * u), seed + 1, 2) - 0.5) * 0.02;
    H[i] = ((b1[i] as number) * 0.25 + (b2[i] as number) * 0.35 + (b3[i] as number) * 0.4) * a + weave * a - (E[i] as number) * 0.09;
    if ((i + 1) % CW === 0) yield CW;
  }
  const base = sg.createImageData(CW, CH);
  const glow = sg.createImageData(CW, CH);
  const gloss = sg.createImageData(CW, CH);
  const o = base.data;
  const go = glow.data;
  const so = gloss.data;
  const ll = Math.hypot(-0.5, -0.72, 0.48);
  const lx = -0.5 / ll;
  const ly = -0.72 / ll;
  const lz = 0.48 / ll;
  const tint = [0.94, 0.98, 1.06] as const;
  /** The page's slope scale (12 per page-source px, its source at 2× its output): per game source px. */
  const K = 6 * u;
  for (let y = 1; y < CH - 1; y++) {
    for (let x = 1; x < CW - 1; x++) {
      const i = y * CW + x;
      const a = A[i] as number;
      if (a <= 0.004) continue;
      const l0 = lum[i] as number;
      if (l0 < 0.09) {
        // KEEP_OUTLINE: today's outline copied as drawn (no light, no gloss), so it stays grey and see-through
        o[i * 4] = d[i * 4] as number;
        o[i * 4 + 1] = d[i * 4 + 1] as number;
        o[i * 4 + 2] = d[i * 4 + 2] as number;
        o[i * 4 + 3] = d[i * 4 + 3] as number;
        continue;
      }
      const dx = ((H[i + 1] as number) - (H[i - 1] as number)) * K;
      const dy = ((H[i + CW] as number) - (H[i - CW] as number)) * K;
      const nl = Math.sqrt(dx * dx + dy * dy + 1);
      const nz = 1 / nl;
      const nd = (-dx / nl) * lx + (-dy / nl) * ly + nz * lz;
      const diff = nd > 0 ? nd : 0;
      const s0 = sat[i] as number;
      const glossK = Math.min(1, (l0 < 0.18 ? 0.6 : 0) + (s0 > 0.55 ? 0.45 : 0) + (l0 > 0.78 && s0 < 0.25 ? 0.5 : 0) + 0.06);
      const rz = 2 * nd * nz - lz;
      const rp = rz > 0 ? rz : 0;
      const r2 = rp * rp;
      const r4 = r2 * r2;
      const r16 = r4 * r4 * r4 * r4;
      const sp = r16 * r4 * glossK; // rz^20
      const fx = x + ox;
      const fy = y + oy;
      const grain = 1 + (hash2(fx, fy, seed) - 0.5) * 0.06 + (fbm(fx / (1.1 * u), fy / (1.1 * u), seed + 3, 2) - 0.5) * 0.18 * (1 - glossK);
      const ao = 1 - (E[i] as number) * 0.3;
      for (let c = 0; c < 3; c++) {
        const v = d[i * 4 + c] as number;
        const t = tint[c] as number;
        const lit = (0.4 + 0.9 * diff * t) * grain * ao;
        o[i * 4 + c] = v * lit + sp * 240 * t; // Uint8ClampedArray: clamped to 255
      }
      o[i * 4 + 3] = d[i * 4 + 3] as number;
      if (emis[i]) {
        go[i * 4] = d[i * 4] as number;
        go[i * 4 + 1] = d[i * 4 + 1] as number;
        go[i * 4 + 2] = d[i * 4 + 2] as number;
        go[i * 4 + 3] = 255;
      }
      if (glossK > 0.4) {
        so[i * 4] = so[i * 4 + 1] = so[i * 4 + 2] = 255;
        so[i * 4 + 3] = Math.round(255 * glossK * a * Math.max(0, nz));
      }
    }
    yield CW;
  }
  const scratch: HTMLCanvasElement[] = [];
  const shrink = (img: ImageData): HTMLCanvasElement => {
    const c = make(W, W);
    (c.getContext("2d") as CanvasRenderingContext2D).putImageData(img, ox, oy);
    scratch.push(c);
    const out = make(n, n);
    const og = out.getContext("2d", { willReadFrequently: true }) as CanvasRenderingContext2D;
    og.imageSmoothingEnabled = true;
    og.imageSmoothingQuality = "high";
    og.drawImage(c, 0, 0, n, n);
    return out;
  };
  try {
    const baseOut = shrink(base);
    yield N2 >> 3;
    const glossOut = shrink(gloss);
    yield N2 >> 3;
    let glowOut: HTMLCanvasElement | null = null;
    // a few stray pixels are not a glowing detail
    if (ec > ss * ss) {
      glowOut = shrink(glow);
      yield N2 >> 3;
      yield* bloomInPlace(glowOut, n, srcPxPerR / ss);
    }
    return { base: baseOut, glow: glowOut, gloss: glossOut };
  } finally {
    for (const c of scratch) freeCanvas(c);
  }
}

/**
 * Take 4 draws the glowing pixels at 0.5 × the pulse and their bloom (`blur(6px)` at 68 px per radius) twice at the
 * pulse; here that sum is baked into ONE premultiplied picture the view draws additively at the pulse (B12). The
 * blur is a two-pass box blur (σ ≈ the page's 6 px, scaled to `outPxPerR`).
 */
function* bloomInPlace(c: HTMLCanvasElement, n: number, outPxPerR: number): Generator<number, void, void> {
  const g = c.getContext("2d", { willReadFrequently: true }) as CanvasRenderingContext2D;
  const img = g.getImageData(0, 0, n, n);
  const px = img.data;
  const ch: Float32Array[] = [0, 1, 2].map(() => new Float32Array(n * n));
  for (let i = 0; i < n * n; i++) {
    const a = (px[i * 4 + 3] as number) / 255;
    for (let k = 0; k < 3; k++) (ch[k] as Float32Array)[i] = ((px[i * 4 + k] as number) / 255) * a;
  }
  // σ = 6 page px; a two-pass box of radius r has σ² = ((2r + 1)² − 1) / 6
  const sigma = (6 * outPxPerR) / PAGE_PX_PER_R;
  const r = Math.max(1, Math.round((Math.sqrt(6 * sigma * sigma + 1) - 1) / 2));
  const bl: Float32Array[] = [];
  for (let k = 0; k < 3; k++) bl.push(yield* rowBoxBlurSteps(ch[k] as Float32Array, n, n, r));
  for (let i = 0; i < n * n; i++) {
    let m = 0;
    const v = [0, 0, 0];
    for (let k = 0; k < 3; k++) {
      const s = Math.min(1, 0.5 * ((ch[k] as Float32Array)[i] as number) + 2 * ((bl[k] as Float32Array)[i] as number));
      v[k] = s;
      if (s > m) m = s;
    }
    if (m < 1 / 255) {
      px[i * 4 + 3] = 0;
      continue;
    }
    px[i * 4] = ((v[0] as number) / m) * 255;
    px[i * 4 + 1] = ((v[1] as number) / m) * 255;
    px[i * 4 + 2] = ((v[2] as number) / m) * 255;
    px[i * 4 + 3] = m * 255;
  }
  g.putImageData(img, 0, 0);
  yield n * n;
}

/**
 * `relight.ts › boxBlurSteps` with the vertical pass walked row by row (a running sum per column) instead of column by
 * column: the same sums in the same order for every column (so the same result), without the strided reads that
 * make the column walk slow when memory is busy (B16). Yields after every row of each pass.
 */
export function* rowBoxBlurSteps(src: Float32Array, w: number, h: number, r: number): Generator<number, Float32Array, void> {
  const a = src.slice();
  const t = new Float32Array(w * h);
  const acc = new Float64Array(w);
  const rr = Math.max(1, Math.round(r));
  const div = 2 * rr + 1;
  for (let pass = 0; pass < 2; pass++) {
    for (let y = 0; y < h; y++) {
      const row = y * w;
      let s = 0;
      for (let x = -rr; x <= rr; x++) s += a[row + Math.min(w - 1, Math.max(0, x))] as number;
      for (let x = 0; x < w; x++) {
        t[row + x] = s / div;
        s += (a[row + Math.min(w - 1, x + rr + 1)] as number) - (a[row + Math.max(0, x - rr)] as number);
      }
      yield w;
    }
    acc.fill(0);
    for (let y = -rr; y <= rr; y++) {
      const row = Math.min(h - 1, Math.max(0, y)) * w;
      for (let x = 0; x < w; x++) acc[x] = (acc[x] as number) + (t[row + x] as number);
    }
    for (let y = 0; y < h; y++) {
      const row = y * w;
      const add = Math.min(h - 1, y + rr + 1) * w;
      const sub = Math.max(0, y - rr) * w;
      for (let x = 0; x < w; x++) {
        const s = acc[x] as number;
        a[row + x] = s / div;
        acc[x] = s + ((t[add + x] as number) - (t[sub + x] as number));
      }
      yield w;
    }
  }
  return a;
}

/**
 * The sheen (B5): the street light's soft band (take 4: `rgba(200,220,255,0 → 0.28 → 0)` across half the frame,
 * diagonal) over the gloss mask, at `SHEEN_STEPS` positions `sx = p × 0.35 × n`, p evenly from −1 to 1, side by side in
 * one strip at `SHEEN_SCALE`. The view picks the step nearest `sin(0.4 t)` and draws it additively.
 */
export function sheenStrip(gloss: HTMLCanvasElement, n: number, make: MakeCanvas): HTMLCanvasElement {
  const h = sheenSide(n);
  const strip = make(h * SHEEN_STEPS, h);
  const g = strip.getContext("2d") as CanvasRenderingContext2D;
  const tmp = make(h, h);
  const tg = tmp.getContext("2d") as CanvasRenderingContext2D;
  for (let k = 0; k < SHEEN_STEPS; k++) {
    const p = -1 + (2 * k) / (SHEEN_STEPS - 1);
    const sx = p * h * 0.35;
    tg.globalCompositeOperation = "source-over";
    tg.clearRect(0, 0, h, h);
    tg.drawImage(gloss, 0, 0, h, h);
    tg.globalCompositeOperation = "source-in";
    const gr = tg.createLinearGradient(h / 2 + sx - h * 0.25, 0, h / 2 + sx + h * 0.25, h);
    gr.addColorStop(0, "rgba(200,220,255,0)");
    gr.addColorStop(0.5, "rgba(200,220,255,0.28)");
    gr.addColorStop(1, "rgba(200,220,255,0)");
    tg.fillStyle = gr;
    tg.fillRect(0, 0, h, h);
    g.drawImage(tmp, k * h, 0);
  }
  freeCanvas(tmp);
  return strip;
}
/** A sheen picture's side for an `n` px frame. */
export const sheenSide = (n: number): number => Math.max(1, Math.round(n * SHEEN_SCALE));
/** The sheen step for time `t` (s): the baked position nearest `sin(0.4 t)`. */
export function sheenStep(t: number): number {
  const p = Math.sin(t * 0.4);
  return Math.max(0, Math.min(SHEEN_STEPS - 1, Math.round(((p + 1) / 2) * (SHEEN_STEPS - 1))));
}
