/**
 * Group 5, matter family, AC-N (designer 2026-11-28, "how is it possible ACR ressemble exactly the other AC?"): the
 * textures of the new acid take, made once at bake (never in draw). The design (goal → real traits → elements →
 * composition) is written in `matter-ac-n.ts › acN.goalFirst`; this file only draws what it decided.
 *
 * Nothing here reuses an earlier AC picture (matter-tex / matter-g-tex / matter-r2-tex): new shapes, new shading code.
 * The asphalt is drawn with the approved slam ground damage's own noise and light formula
 * (`render/city/groundDamageArt.ts › fbm`, `hash2`; shade = n · (−0.55, −0.83)). Every surface is a height field shaded
 * per pixel with the street's one key light from the upper left (kit.ts › LIGHT), the way `charRelight.ts` turns a
 * drawing into volumes. No hard specks: the finest mark is ≥ 1 px at 36 px/m (0.028 m).
 *
 * Units: metres, R = the puddle radius (zombies.json › spitter.spit.puddleRadiusM 1.0). The zone textures are the 2 R
 * square at 72 px/m (36 px/m × dpr 2, like the game's FX atlas).
 */
import { make, rng, LIGHT } from "./kit";
import { fbm, hash2 } from "../../../../apps/client/src/render/city/groundDamageArt";

export const ACN_R = 1;
/** Zone textures: px for the 2 R square. */
export const ZONE_PX = 144;
/** Alligator-crack cell size (m): old asphalt crazes into plates of about 0.15–0.3 m. */
const CELL = 0.24;
/** Where the glob first touches, relative to the zone centre (m): it skids forward (+x) from here. */
export const IMPACT: [number, number] = [-0.12, 0];

const clamp = (x: number, a = 0, b = 1): number => (x < a ? a : x > b ? b : x);
const sstep = (a: number, b: number, x: number): number => {
  const t = clamp((x - a) / (b - a));
  return t * t * (3 - 2 * t);
};
/** The street under the effect (fx5's #23282d): textures are encoded for a normal blend over it. */
const STREET: [number, number, number] = [35, 40, 45];
/** Toward the key light, 3D (+y down, +z to the camera). */
const L3 = ((): [number, number, number] => {
  const v: [number, number, number] = [LIGHT.dx, LIGHT.dy, 1.3];
  const l = Math.hypot(...v);
  return [v[0] / l, v[1] / l, v[2] / l];
})();
const H3 = ((): [number, number, number] => {
  const v: [number, number, number] = [L3[0], L3[1], L3[2] + 1];
  const l = Math.hypot(...v);
  return [v[0] / l, v[1] / l, v[2] / l];
})();

/** Writes a target colour over the street as a normal-blend pixel (alpha a): out = S (1 − a) + C a = target. */
function put(d: Uint8ClampedArray, i: number, r: number, g: number, b: number, a: number): void {
  if (a <= 0.002) return;
  let A = a;
  // a target brighter than the alpha allows: raise the alpha
  const need = Math.max((r - STREET[0] * (1 - A)) / 255, (g - STREET[1] * (1 - A)) / 255, (b - STREET[2] * (1 - A)) / 255);
  if (need > A) A = clamp(need);
  d[i] = clamp((r - STREET[0] * (1 - A)) / A, 0, 255);
  d[i + 1] = clamp((g - STREET[1] * (1 - A)) / A, 0, 255);
  d[i + 2] = clamp((b - STREET[2] * (1 - A)) / A, 0, 255);
  d[i + 3] = 255 * A;
}

/* ---------------- The crazed asphalt: alligator cracks (Voronoi plates), the same field for every layer ---------------- */

export interface Craze {
  /** Distance to the nearest crack (m); large where two plates have no crack between them. */
  e: Float32Array;
  /** Crack crossings (0–1): the low spots where acid collects. */
  node: Float32Array;
  /** Crack width (m) at the pixel. */
  w: Float32Array;
  /** Foam spots: crack crossings inside 0.82 R, in m from the zone centre (deterministic, spread out). */
  spots: [number, number][];
}

function voronoi(x: number, y: number, seed: number): [number, number] {
  // domain warp: asphalt cracks wander, they are not straight polygon sides
  const wx = x + (fbm(x * 5 + 3, y * 5, seed + 40, 3) - 0.5) * 0.09;
  const wy = y + (fbm(x * 5, y * 5 + 7, seed + 41, 3) - 0.5) * 0.09;
  const ci = Math.floor(wx / CELL);
  const cj = Math.floor(wy / CELL);
  let d1 = 1e9, d2 = 1e9, d3 = 1e9;
  let a1x = 0, a1y = 0, a2x = 0, a2y = 0, a3x = 0, a3y = 0, id1 = 0, id2 = 0;
  for (let j = cj - 1; j <= cj + 1; j++)
    for (let i = ci - 1; i <= ci + 1; i++) {
      const sx = (i + 0.12 + 0.76 * hash2(i, j, seed)) * CELL;
      const sy = (j + 0.12 + 0.76 * hash2(i, j, seed + 1)) * CELL;
      const dd = (wx - sx) ** 2 + (wy - sy) ** 2;
      const id = (i * 7349 + j * 1931) | 0;
      if (dd < d1) {
        d3 = d2; a3x = a2x; a3y = a2y;
        d2 = d1; a2x = a1x; a2y = a1y; id2 = id1;
        d1 = dd; a1x = sx; a1y = sy; id1 = id;
      } else if (dd < d2) {
        d3 = d2; a3x = a2x; a3y = a2y;
        d2 = dd; a2x = sx; a2y = sy; id2 = id;
      } else if (dd < d3) {
        d3 = dd; a3x = sx; a3y = sy;
      }
    }
  // distance to the bisector of the two nearest seeds (exact for a Voronoi edge)
  let e = (d2 - d1) / (2 * Math.hypot(a2x - a1x, a2y - a1y));
  const e3 = (d3 - d1) / (2 * Math.hypot(a3x - a1x, a3y - a1y));
  // about one plate side in eight never cracked: the net is not a perfect honeycomb
  const lo = Math.min(id1, id2);
  const hi = Math.max(id1, id2);
  if (hash2(lo, hi, seed + 9) < 0.12) e += 0.2;
  return [e, Math.exp(-(e + e3) / 0.028)];
}

const crazeCache = new Map<number, Craze>();
export function craze(seed: number): Craze {
  const hit = crazeCache.get(seed);
  if (hit) return hit;
  const N = ZONE_PX;
  const e = new Float32Array(N * N);
  const node = new Float32Array(N * N);
  const w = new Float32Array(N * N);
  for (let py = 0; py < N; py++)
    for (let qx = 0; qx < N; qx++) {
      const x = ((qx + 0.5) / N) * 2 - 1;
      const y = ((py + 0.5) / N) * 2 - 1;
      const [ee, nn] = voronoi(x, y, seed);
      const k = py * N + qx;
      e[k] = ee;
      node[k] = nn;
      // ≥ 0.028 m wide in all (≥ 1 px at 36 px/m), wider in places (the crack opened more there)
      w[k] = 0.015 + 0.012 * fbm(x * 6 + 11, y * 6, seed + 5, 3);
    }
  // foam spots: the strongest crossings, kept ≥ 0.3 m apart, inside 0.82 R
  const cand: [number, number, number][] = [];
  for (let k = 0; k < N * N; k++) {
    const qx = k % N;
    const py = (k / N) | 0;
    const x = ((qx + 0.5) / N) * 2 - 1;
    const y = ((py + 0.5) / N) * 2 - 1;
    if (Math.hypot(x, y) > 0.82 || (node[k] as number) < 0.5) continue;
    cand.push([node[k] as number, x, y]);
  }
  cand.sort((a, b) => b[0] - a[0]);
  const spots: [number, number][] = [];
  for (const [, x, y] of cand) {
    if (spots.length >= 10) break;
    if (spots.every(([sx, sy]) => Math.hypot(sx - x, sy - y) > 0.3)) spots.push([x, y]);
  }
  const c: Craze = { e, node, w, spots };
  crazeCache.set(seed, c);
  return c;
}

/** The asphalt's relief (m-ish): plates with aggregate bumps, their rims curled up at the cracks, the cracks sunk. */
function relief(cz: Craze, k: number, x: number, y: number, seed: number): number {
  const e = cz.e[k] as number;
  const w = cz.w[k] as number;
  const crack = -1 * Math.exp(-((e / w) ** 2));
  const lip = 0.18 * Math.exp(-(((e - w * 1.9) / (w * 1.4)) ** 2));
  const agg = (fbm(x * 9, y * 9, seed + 21, 3) - 0.5) * 0.22;
  return crack + lip + agg;
}
/** The approved ground damage's light: shade = n · (−0.55, −0.83) from the relief's slopes. */
function reliefShade(H: Float32Array, k: number, N: number, x: number, y: number, unit: number): number {
  const xm = Math.max(0, x - 1);
  const xp = Math.min(N - 1, x + 1);
  const ym = Math.max(0, y - 1);
  const yp = Math.min(N - 1, y + 1);
  const nx = (H[y * N + xm] as number) - (H[y * N + xp] as number);
  const ny = (H[ym * N + x] as number) - (H[yp * N + x] as number);
  void k;
  return (nx * -0.55 + ny * -0.83) * unit;
}

/** The skid's thickness (0–1.3) at (x, y) m from the zone centre, flight along +x. Shared by the skid and its stain. */
const SKID_BLOBS: [number, number, number][] = [
  [-0.37, 0.012, 0.045],
  [-0.29, 0.006, 0.058],
  [-0.2, -0.004, 0.075],
  [-0.09, -0.01, 0.1],
  [0.03, -0.004, 0.13],
  [0.15, 0.01, 0.145],
  [0.24, 0.022, 0.12],
  // tongues that ran sideways into the nearest cracks
  [0.08, 0.11, 0.045],
  [0.1, 0.155, 0.03],
  [0.03, -0.11, 0.048],
  [0.02, -0.16, 0.03],
  [0.27, -0.08, 0.04],
  [0.3, -0.12, 0.026],
];
export function skidField(x: number, y: number, soak: number): number {
  let f = 0;
  for (const [bx, by, br] of SKID_BLOBS) {
    const r = br * (1 - 0.25 * soak);
    const q = ((x - bx) ** 2 + (y - by) ** 2) / (r * r * 2.6);
    if (q < 1) f += (1 - q) ** 3;
  }
  return f * 2.8;
}

/**
 * The zone (normal blend, 2 R): the wet sheet (the asphalt inside R darker and glossy, its plates' rims lit upper-left)
 * and the acid standing in the cracks (it glows: only acid glows), brightest at the crossings. Cut at exactly R.
 * `reveal` < 1: only the cracks the running acid has reached (radius `reveal` R from the impact, fingered).
 */
export function acnZone(seed: number, reveal = 1): HTMLCanvasElement {
  const N = ZONE_PX;
  const cz = craze(seed);
  const unit = N / 256;
  const H = new Float32Array(N * N);
  for (let py = 0; py < N; py++)
    for (let qx = 0; qx < N; qx++) {
      const k = py * N + qx;
      H[k] = relief(cz, k, ((qx + 0.5) / N) * 2 - 1, ((py + 0.5) / N) * 2 - 1, seed);
    }
  const c = make(N, N);
  const g = c.getContext("2d")!;
  const im = g.createImageData(N, N);
  const d = im.data;
  const pxM = 2 / N;
  for (let py = 0; py < N; py++)
    for (let qx = 0; qx < N; qx++) {
      const k = py * N + qx;
      const x = ((qx + 0.5) / N) * 2 - 1;
      const y = ((py + 0.5) / N) * 2 - 1;
      const r = Math.hypot(x, y);
      const cov = clamp((ACN_R - r) / pxM + 0.5);
      if (cov <= 0) continue;
      // the running front: fingers lead along the cracks (jittered by the asphalt's noise)
      const dImp = Math.hypot(x - IMPACT[0], y - IMPACT[1]);
      const front = reveal >= 1 ? 1 : 1 - sstep(reveal * 0.85, reveal * (1.15 + 0.25 * fbm(x * 4, y * 4, seed + 60, 2)), dImp);
      const e = cz.e[k] as number;
      const w = cz.w[k] as number;
      // 1. wet asphalt: darker than dry, a faint olive film, the plates' relief lit by the street light (wet = glossier)
      const sh = reliefShade(H, k, N, qx, py, unit) * 5.5;
      let R = STREET[0] * 0.62 + 5;
      let G = STREET[1] * 0.62 + 7;
      let B = STREET[2] * 0.62;
      if (sh > 0) {
        const gl = Math.min(0.2, sh * 0.35);
        R += (130 - R) * gl;
        G += (140 - G) * gl;
        B += (135 - B) * gl;
      } else {
        const dk = Math.min(0.4, -sh * 0.45);
        R *= 1 - dk;
        G *= 1 - dk;
        B *= 1 - dk;
      }
      let A = 0.5;
      // 2. the acid in the cracks: it glows (core + a little light on the crack walls), more where it collects
      if (front > 0) {
        // the acid filled some runs of crack and only dampened others (it runs downhill), fuller near the hit
        const dImp0 = Math.hypot(x - IMPACT[0], y - IMPACT[1]);
        const fill = clamp(sstep(0.36, 0.62, fbm(x * 3.2 + 1, y * 3.2 + 4, seed + 8, 3)) + 0.45 * (1 - dImp0 * 1.4), 0.12, 1);
        const along = 0.75 + 0.35 * fbm(x * 7 + 2, y * 7 + 9, seed + 7, 3);
        const fade = 1 - 0.12 * r; // a little less acid reached the far cracks; never faint at R
        const core = (1 - sstep(w * 0.55, w * 1.1, e)) * along * fade * (0.35 + 0.65 * fill);
        const halo = Math.exp(-e / 0.022) * 0.3 * along * fade * fill;
        const pool = (cz.node[k] as number) * (0.4 + 0.6 * fill) * fade;
        const L = clamp(Math.max(core, pool) + halo * (1 - core)) * front;
        if (L > 0.01) {
          const hot = clamp(pool * 0.95 + core * fill * fill * 0.55) * front;
          // light colour: deep olive-green where the acid is thin, yellow-green only where it stands thick (never white)
          const lr = 55 + 140 * hot;
          const lg = 105 + 140 * hot;
          const lb = 8 + 45 * hot;
          const m = clamp(L * 1.1);
          R = R * (1 - m) + lr * m;
          G = G * (1 - m) + lg * m;
          B = B * (1 - m) + lb * m;
          A = A + (1 - A) * m;
        }
      }
      put(d, k * 4, R, G, B, A * cov);
    }
  g.putImageData(im, 0, 0);
  return c;
}

/**
 * The mark (normal blend, 2 R): the binder charred black along the cracks it ran in, the plates a little darker, the
 * skid's footprint burnt deeper; matte (no gloss: it is dry). It stays after the acid is spent. Never green.
 */
export function acnMark(seed: number): HTMLCanvasElement {
  const N = ZONE_PX;
  const cz = craze(seed);
  const unit = N / 256;
  const H = new Float32Array(N * N);
  for (let py = 0; py < N; py++)
    for (let qx = 0; qx < N; qx++) {
      const k = py * N + qx;
      H[k] = relief(cz, k, ((qx + 0.5) / N) * 2 - 1, ((py + 0.5) / N) * 2 - 1, seed) * 0.45;
    }
  const c = make(N, N);
  const g = c.getContext("2d")!;
  const im = g.createImageData(N, N);
  const d = im.data;
  const pxM = 2 / N;
  for (let py = 0; py < N; py++)
    for (let qx = 0; qx < N; qx++) {
      const k = py * N + qx;
      const x = ((qx + 0.5) / N) * 2 - 1;
      const y = ((py + 0.5) / N) * 2 - 1;
      const r = Math.hypot(x, y);
      const cov = clamp((ACN_R - r) / pxM + 0.5) * (0.85 + 0.15 * fbm(x * 3, y * 3, seed + 70, 2));
      if (cov <= 0) continue;
      const e = cz.e[k] as number;
      const w = cz.w[k] as number;
      const sh = reliefShade(H, k, N, qx, py, unit) * 5.5;
      let R = STREET[0] * 0.78;
      let G = STREET[1] * 0.77;
      let B = STREET[2] * 0.74;
      let A = 0.4;
      if (sh > 0) {
        const gl = Math.min(0.07, sh * 0.2);
        R += (120 - R) * gl;
        G += (122 - G) * gl;
        B += (118 - B) * gl;
      } else {
        const dk = Math.min(0.35, -sh * 0.4);
        R *= 1 - dk;
        G *= 1 - dk;
        B *= 1 - dk;
      }
      // charred binder along the cracks: wider than the crack (the acid soaked the crack's walls), soft
      const ch = Math.exp(-((e / (w * 2.1)) ** 2)) * 0.85 + (cz.node[k] as number) * 0.3;
      const sk = sstep(0.15, 0.9, skidField(x, y, 0.4)) * 0.55;
      const burn = clamp(Math.max(ch, sk));
      R = R * (1 - burn) + 12 * burn;
      G = G * (1 - burn) + 11 * burn;
      B = B * (1 - burn) + 9 * burn;
      A = A + (1 - A) * burn * 0.85;
      put(d, k * 4, R, G, B, A * cov);
    }
  g.putImageData(im, 0, 0);
  return c;
}

/* ---------------- Liquid surfaces (glob, skid): emission + street light, from a thickness field ---------------- */

/** One pixel of luminous, viscous acid. h thickness (0–~1.3), n the surface normal, gloss 0–1, emit 0–1, cov 0–1. */
function acidPx(d: Uint8ClampedArray, i: number, h: number, nx: number, ny: number, nz: number, gloss: number, emit: number, cov: number, hot: number): void {
  const nl = Math.max(0, nx * L3[0] + ny * L3[1] + nz * L3[2]);
  const nh = Math.max(0, nx * H3[0] + ny * H3[1] + nz * H3[2]);
  // thick acid glows from inside (scattering): deep green at the thin edge → bright yellow-green where thick
  const depth = 1 - Math.exp(-h * 2.6);
  const eR = (20 + 150 * hot * depth) * depth;
  const eG = (60 + 170 * depth) * depth;
  const eB = (4 + 30 * hot * depth) * depth;
  // the street seen through the thin edge
  const tr = Math.exp(-h * 4);
  // the street light: a soft lit side, a dark far side, a sharp wet reflection toward the upper left
  const away = 1 - 0.45 * clamp(-(nx * L3[0] + ny * L3[1]) * 2.2);
  const diff = 0.25 + 0.75 * nl;
  const spec = gloss * (Math.pow(nh, 90) * 1.7 + Math.pow(nh, 12) * 0.12);
  const R = (STREET[0] * 0.8 * tr + eR * emit * diff) * away + 255 * spec * LIGHT.tint[0];
  const G = (STREET[1] * 0.8 * tr + eG * emit * diff) * away + 255 * spec * LIGHT.tint[1];
  const B = (STREET[2] * 0.8 * tr + eB * emit * diff) * away + 255 * spec * LIGHT.tint[2];
  put(d, i, R, G, B, cov * (0.55 + 0.45 * (1 - tr)));
}

function shadeField(w: number, h: number, mPerPx: number, field: (x: number, y: number) => number, slope: number, gloss: number, emit: number, hotK: number, edge: number): HTMLCanvasElement {
  const F = new Float32Array(w * h);
  for (let py = 0; py < h; py++)
    for (let qx = 0; qx < w; qx++) F[py * w + qx] = field((qx + 0.5 - w / 2) * mPerPx, (py + 0.5 - h / 2) * mPerPx);
  const c = make(w, h);
  const g = c.getContext("2d")!;
  const im = g.createImageData(w, h);
  const at = (x: number, y: number): number => F[Math.max(0, Math.min(h - 1, y)) * w + Math.max(0, Math.min(w - 1, x))] as number;
  for (let py = 0; py < h; py++)
    for (let qx = 0; qx < w; qx++) {
      const k = py * w + qx;
      const f = F[k] as number;
      const cov = sstep(edge * 0.6, edge * 1.4, f);
      if (cov <= 0) continue;
      const th = Math.max(0, f - edge);
      const gx = (at(qx + 1, py) - at(qx - 1, py)) * slope;
      const gy = (at(qx, py + 1) - at(qx, py - 1)) * slope;
      const l = Math.hypot(gx, gy, 1);
      acidPx(im.data, k * 4, th, -gx / l, -gy / l, 1 / l, gloss, emit, cov, clamp(th * hotK));
    }
  g.putImageData(im, 0, 0);
  return c;
}

/** Skid texture size (m): 0.9 × 0.5 around the zone centre, at 96 px/m. */
export const SKID_W_M = 0.9;
export const SKID_H_M = 0.5;
const SKID_PXM = 96;
/**
 * The glob's body after the hit: it skidded forward and piled up a ridge at its front (a viscous lump does not
 * splash), with a thin dragged tail behind and short tongues running into the cracks. `soak` 0 = fresh, glossy,
 * thick; 1 = drained into the cracks: thinner, matte, smaller.
 */
export function acnSkid(soak: number): HTMLCanvasElement {
  const field = (x: number, y: number): number => {
    let f = skidField(x, y, soak);
    if (f <= 0) return 0;
    // the bow ridge: piled up across the front of the head
    const front = 0.33 + 0.03 * Math.cos(y * 14);
    f += 0.55 * (1 - 0.7 * soak) * Math.exp(-(((x - front + 0.06) / 0.045) ** 2)) * sstep(0.2, 0.8, f);
    // compression folds across the flight, behind the ridge (viscous: few and broad)
    f += 0.07 * (1 - soak) * Math.sin((x + 0.4) * 38 + 2 * fbm(x * 6, y * 6, 3, 2)) * sstep(0.4, 1.2, f) * sstep(-0.2, 0.15, x);
    return f * (1 - 0.45 * soak);
  };
  return shadeField(Math.round(SKID_W_M * SKID_PXM), Math.round(SKID_H_M * SKID_PXM), 1 / SKID_PXM, field, 7, 1 - 0.75 * soak, 1.35 - 0.6 * soak, 1.6, 0.32);
}

/** The glob in flight: a viscous lump wobbling (surface tension), 4 frames of one oscillation, 0.5 m box at 80 px/m. */
export const GLOB_BOX_M = 0.5;
export function acnGlob(frame: number): HTMLCanvasElement {
  const ph = (frame / 4) * Math.PI * 2;
  // stretched along the flight ↔ squashed across it, volume kept; a 3-lobe ripple that turns, so frames 1 and 3 differ
  const s = 1 + 0.2 * Math.cos(ph);
  const a = 0.165 * s;
  const b = 0.165 / s;
  const field = (x: number, y: number): number => {
    const th = Math.atan2(y, x);
    const rip = 1 + 0.06 * Math.sin(3 * th + ph * 1.5) + 0.03 * Math.sin(5 * th - ph);
    const q = ((x / a) ** 2 + (y / b) ** 2) / (rip * rip);
    return q < 1 ? Math.sqrt(1 - q) * 1.2 : 0;
  };
  const px = Math.round(GLOB_BOX_M * 80);
  return shadeField(px, px, GLOB_BOX_M / px, field, 3.2, 1, 1.25, 1.4, 0.02);
}

/** A soft light (ADD), cropped to what shows: `w` × `h` px ellipse, colour "r,g,b", alpha at the centre. */
export function acnLight(w: number, h: number, rgb: string, a0: number, fall = 2.2): HTMLCanvasElement {
  const c = make(w, h);
  const g = c.getContext("2d")!;
  const im = g.createImageData(w, h);
  const [r, gg, b] = rgb.split(",").map(Number) as [number, number, number];
  for (let py = 0; py < h; py++)
    for (let qx = 0; qx < w; qx++) {
      const x = ((qx + 0.5) / w) * 2 - 1;
      const y = ((py + 0.5) / h) * 2 - 1;
      const q = Math.hypot(x, y);
      if (q >= 1) continue;
      const k = Math.pow(1 - q, fall) * a0;
      const i = (py * w + qx) * 4;
      im.data[i] = r;
      im.data[i + 1] = gg;
      im.data[i + 2] = b;
      im.data[i + 3] = 255 * k;
    }
  g.putImageData(im, 0, 0);
  return c;
}

/**
 * Froth where fresh acid eats the stone in a crack (CO₂ from the limestone fines): a cluster of small lit domes, pale,
 * not glowing (the acid under it tints its shadow side green). 0 = rising, 1 = full, 2 = collapsed scum. 0.2 m, 96 px/m.
 */
export const FOAM_M = 0.2;
export function acnFoam(frame: 0 | 1 | 2, seed: number): HTMLCanvasElement {
  const px = Math.round(FOAM_M * 96);
  const r = rng(seed * 31 + 5);
  const domes: [number, number, number][] = [];
  const n = frame === 0 ? 7 : 16;
  for (let k = 0; k < n; k++) {
    const ang = r() * Math.PI * 2;
    // a froth lying along its crack (x), not a round cluster
    const dd = Math.sqrt(r()) * (frame === 0 ? 0.035 : 0.06);
    domes.push([Math.cos(ang) * dd * 1.3, Math.sin(ang) * dd * 0.55, (frame === 0 ? 0.008 : 0.01) + r() * 0.009]);
  }
  const field = (x: number, y: number): number => {
    if (frame === 2) {
      // collapsed: a flat, torn skin of scum, wider than the froth was
      const q = Math.hypot(x, y) / 0.075;
      const torn = fbm(x * 40 + seed, y * 40, 77, 2);
      return q < 1 ? (1 - q * q) * 0.25 * sstep(0.35, 0.6, torn) : 0;
    }
    let f = 0;
    for (const [bx, by, br] of domes) {
      const q = ((x - bx) ** 2 + (y - by) ** 2) / (br * br);
      if (q < 1) f = Math.max(f, Math.sqrt(1 - q) * br * 30);
    }
    return f;
  };
  const c = make(px, px);
  const g = c.getContext("2d")!;
  const im = g.createImageData(px, px);
  const m = FOAM_M / px;
  const F = new Float32Array(px * px);
  for (let py = 0; py < px; py++) for (let qx = 0; qx < px; qx++) F[py * px + qx] = field((qx + 0.5 - px / 2) * m, (py + 0.5 - px / 2) * m);
  const at = (x: number, y: number): number => F[Math.max(0, Math.min(px - 1, y)) * px + Math.max(0, Math.min(px - 1, x))] as number;
  for (let py = 0; py < px; py++)
    for (let qx = 0; qx < px; qx++) {
      const k = py * px + qx;
      const f = F[k] as number;
      if (f <= 0.01) continue;
      const gx = (at(qx + 1, py) - at(qx - 1, py)) * 2.2;
      const gy = (at(qx, py + 1) - at(qx, py - 1)) * 2.2;
      const l = Math.hypot(gx, gy, 1);
      const nl = Math.max(0, (-gx / l) * L3[0] + (-gy / l) * L3[1] + (1 / l) * L3[2]);
      const lit = 0.35 + 0.65 * nl;
      const R = 150 * lit + 18 * (1 - nl);
      const G = 158 * lit + 40 * (1 - nl);
      const B = 118 * lit + 4 * (1 - nl);
      put(im.data, k * 4, R * 0.9, G * 0.9, B * 0.9, clamp(f * 3) * (frame === 2 ? 0.6 : 0.85));
    }
  g.putImageData(im, 0, 0);
  return c;
}

/**
 * Reaction vapour: a thin, streaky strand (heat of the reaction lifts a pale vapour that the wind draws out), lit on its
 * upper-left edge; drawn along the wind. 64 × 24 px for 0.9 × 0.34 m. Never glowing, never green.
 */
export const WISP_W_M = 0.9;
export const WISP_H_M = 0.34;
export function acnWisp(seed: number): HTMLCanvasElement {
  const w = 64;
  const h = 24;
  const c = make(w, h);
  const g = c.getContext("2d")!;
  const im = g.createImageData(w, h);
  for (let py = 0; py < h; py++)
    for (let qx = 0; qx < w; qx++) {
      const x = ((qx + 0.5) / w) * 2 - 1;
      const y = ((py + 0.5) / h) * 2 - 1;
      // a strand thicker at its root (left), thinning and curling downwind (right)
      const bend = 0.25 * Math.sin(x * 2.4 + seed) * (x + 1) * 0.5;
      const yy = y - bend;
      const width = 0.75 - 0.35 * (x + 1) * 0.5;
      const body = Math.exp(-((yy / width) ** 2) * 2.2) * sstep(-1, -0.55, x) * (1 - sstep(0.4, 1, x));
      const streak = 0.45 + 0.75 * fbm(x * 2.2 + seed * 3, yy * 9, seed + 90, 3);
      const a = clamp(body * streak - 0.12) * 0.62;
      if (a <= 0.004) continue;
      const lit = clamp(0.55 - yy * 0.45); // the upper edge faces the light
      const i = (py * w + qx) * 4;
      im.data[i] = 150 + 60 * lit;
      im.data[i + 1] = 154 + 58 * lit;
      im.data[i + 2] = 150 + 56 * lit;
      im.data[i + 3] = 255 * a;
    }
  g.putImageData(im, 0, 0);
  return c;
}
