/**
 * Characters, take 2 (designer: "I prefer the now version", then "try again"). Today's drawings are kept
 * exactly (shapes, colours, outlines: the designs picked in Epics 4–7) and given the realism on top:
 * - volume: each colour region becomes its own rounded dome (the drawing's outlines and colour edges become
 *   creases between parts), lit by the map's top-left light;
 * - texture: fine grain on cloth and skin, stronger on lighter, matte areas;
 * - gloss: dark, saturated or very light areas (armour, acid, metal) pick up a highlight.
 * The source is drawn by the game's own code at `scale` × and processed at that size, then shrunk.
 */
import { canvas, ctx, fbm, hash2 } from "../../asset-fixes-1/src/lib";

type G = CanvasRenderingContext2D;

function blurAlpha(src: Float32Array, w: number, h: number, r: number): Float32Array {
  // two box-blur passes per axis (≈ gaussian), on a float field
  let a = src.slice();
  const tmp = new Float32Array(w * h);
  const rr = Math.max(1, Math.round(r));
  for (let pass = 0; pass < 2; pass++) {
    for (let y = 0; y < h; y++) {
      let acc = 0;
      for (let x = -rr; x <= rr; x++) acc += a[y * w + Math.min(w - 1, Math.max(0, x))] as number;
      for (let x = 0; x < w; x++) {
        tmp[y * w + x] = acc / (2 * rr + 1);
        acc += (a[y * w + Math.min(w - 1, x + rr + 1)] as number) - (a[y * w + Math.max(0, x - rr)] as number);
      }
    }
    for (let x = 0; x < w; x++) {
      let acc = 0;
      for (let y = -rr; y <= rr; y++) acc += tmp[Math.min(h - 1, Math.max(0, y)) * w + x] as number;
      for (let y = 0; y < h; y++) {
        a[y * w + x] = acc / (2 * rr + 1);
        acc += (tmp[Math.min(h - 1, y + rr + 1) * w + x] as number) - (tmp[Math.max(0, y - rr) * w + x] as number);
      }
    }
  }
  return a;
}

/**
 * Relights a drawing: `draw(g, r)` draws it centred at (0, 0) with body radius `r`; `extent` is the frame's
 * half size in radii; `R` the output px per radius; `ss` the working supersample.
 */
export function relight(draw: (g: G, r: number) => void, extent: number, R: number, seed: number, ss = 2): HTMLCanvasElement {
  const N = Math.ceil(2 * extent * R);
  const W = N * ss;
  const src = canvas(W, W);
  const sg = ctx(src);
  sg.translate(W / 2, W / 2);
  draw(sg, R * ss);
  const img = sg.getImageData(0, 0, W, W);
  const d = img.data;
  const n = W * W;
  const A = new Float32Array(n);
  const lum = new Float32Array(n);
  for (let i = 0; i < n; i++) {
    A[i] = (d[i * 4 + 3] as number) / 255;
    lum[i] = ((d[i * 4] as number) * 0.3 + (d[i * 4 + 1] as number) * 0.55 + (d[i * 4 + 2] as number) * 0.15) / 255;
  }
  // creases: the drawing's dark outlines and any sharp colour edge
  const E = new Float32Array(n);
  for (let y = 1; y < W - 1; y++) {
    for (let x = 1; x < W - 1; x++) {
      const i = y * W + x;
      if (A[i]! < 0.5) continue;
      let edge = 0;
      for (const j of [i - 1, i + 1, i - W, i + W]) {
        const dr = Math.abs((d[i * 4] as number) - (d[j * 4] as number));
        const dg = Math.abs((d[i * 4 + 1] as number) - (d[j * 4 + 1] as number));
        const db = Math.abs((d[i * 4 + 2] as number) - (d[j * 4 + 2] as number));
        edge = Math.max(edge, (dr + dg + db) / 255);
      }
      const outline = lum[i]! < 0.09 ? 1 : 0;
      E[i] = Math.min(1, Math.max(outline, edge > 0.25 ? edge : 0));
    }
  }
  // each region's own dome: blur the shape with the creases cut out, at a few scales
  const cut = new Float32Array(n);
  for (let i = 0; i < n; i++) cut[i] = A[i]! * (1 - E[i]!);
  const b1 = blurAlpha(cut, W, W, 1.5 * ss);
  const b2 = blurAlpha(cut, W, W, 4 * ss);
  const b3 = blurAlpha(cut, W, W, 9 * ss);
  const H = new Float32Array(n);
  for (let i = 0; i < n; i++) {
    const x = i % W;
    const y = (i / W) | 0;
    const grain = (fbm(x / (2 * ss), y / (2 * ss), seed, 3) - 0.5) * 0.06;
    H[i] = (b1[i]! * 0.25 + b2[i]! * 0.35 + b3[i]! * 0.4) * A[i]! + grain * A[i]! - E[i]! * 0.08;
  }
  const out = sg.createImageData(W, W);
  const o = out.data;
  const L = [-0.5, -0.72, 0.48];
  const ll = Math.hypot(L[0]!, L[1]!, L[2]!);
  const lx = L[0]! / ll;
  const ly = L[1]! / ll;
  const lz = L[2]! / ll;
  const K = 9;
  for (let y = 1; y < W - 1; y++) {
    for (let x = 1; x < W - 1; x++) {
      const i = y * W + x;
      const a = A[i]!;
      if (a <= 0.004) continue;
      const dx = (H[i + 1]! - H[i - 1]!) * K;
      const dy = (H[i + W]! - H[i - W]!) * K;
      const nl = Math.hypot(dx, dy, 1);
      const nx = -dx / nl;
      const ny = -dy / nl;
      const nz = 1 / nl;
      const nd = nx * lx + ny * ly + nz * lz;
      const diff = Math.max(0, nd);
      const r0 = d[i * 4] as number;
      const g0 = d[i * 4 + 1] as number;
      const b0 = d[i * 4 + 2] as number;
      const mx = Math.max(r0, g0, b0);
      const mn = Math.min(r0, g0, b0);
      const sat = mx > 0 ? (mx - mn) / mx : 0;
      const l0 = lum[i]!;
      // gloss on dark (armour, rubber), saturated (acid, blood) and very light (metal glints) areas; matte cloth
      const gloss = Math.min(1, (l0 < 0.18 ? 0.55 : 0) + (sat > 0.55 ? 0.5 : 0) + (l0 > 0.8 ? 0.4 : 0) + 0.06);
      const rz = 2 * nd * nz - lz;
      const sp = Math.pow(Math.max(0, rz), 18) * gloss;
      // fine texture: woven grain on matte areas, pores/mottling elsewhere
      const tex = 1 + (fbm(x / (1.2 * ss), y / (1.2 * ss), seed + 3, 2) - 0.5) * 0.22 * (1 - gloss) + (hash2(x, y, seed) - 0.5) * 0.05;
      const lit = (0.55 + 0.6 * diff) * tex;
      const ao = 1 - E[i]! * 0.25;
      o[i * 4] = Math.min(255, r0 * lit * ao + sp * 235);
      o[i * 4 + 1] = Math.min(255, g0 * lit * ao + sp * 232);
      o[i * 4 + 2] = Math.min(255, b0 * lit * ao + sp * 228);
      o[i * 4 + 3] = d[i * 4 + 3] as number;
    }
  }
  const work = canvas(W, W);
  ctx(work).putImageData(out, 0, 0);
  const res = canvas(N, N);
  const rg = ctx(res);
  rg.imageSmoothingQuality = "high";
  rg.drawImage(work, 0, 0, N, N);
  return res;
}
