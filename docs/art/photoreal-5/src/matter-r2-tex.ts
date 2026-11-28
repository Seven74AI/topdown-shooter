/**
 * Group 5, matter family, round 2 (designer 2026-11-28): the textures of AC-R, EV-R and BD-R, made once at bake (never
 * in draw). Same rules as `matter-tex.ts` / `matter-g-tex.ts`: one key light from the upper left (kit.ts › LIGHT), no
 * hard specks, nothing under 1 px at 36 px/m, additive textures cropped to what they show.
 *
 * AC-R ("AC are not photoreal, plz improve"): the acid is shaded per pixel from a height field, like the approved slam
 * ground damage (`render/city/groundDamageArt.ts`: a shaded dish from a noise height field) and the relit characters
 * (`charRelight.ts`: normals from the drawing, one key light). The liquid model:
 *   - thickness h from a metaball field (surface tension: flat on top, rounded at the contact line);
 *   - the street seen THROUGH the liquid, absorbed per channel (Beer–Lambert: thin = see-through olive, thick = deep
 *     yellow-green), plus the acid's own faint inner light (only acid glows);
 *   - the street light reflected on the surface normals: a sharp highlight and a broad sheen toward the upper left,
 *     a dark far side; Fresnel at the steep contact line;
 *   - encoded for a normal-blend sprite over the dark street (alpha from the absorption, colour from the light).
 * The eaten asphalt reuses the ground damage's own noise (`groundDamageArt.ts › fbm`, `hash2`).
 */
import { make, rng, LIGHT } from "./kit";
import { fbm as gdFbm, hash2 } from "../../../../apps/client/src/render/city/groundDamageArt";

const smooth = (a: number, b: number, x: number): number => {
  const t = Math.max(0, Math.min(1, (x - a) / (b - a)));
  return t * t * (3 - 2 * t);
};
const clamp = (x: number, a = 0, b = 1): number => (x < a ? a : x > b ? b : x);
/** Toward the light in 3D, texture space (+y down, +z toward the camera): from the upper left and above. */
const L3 = ((): [number, number, number] => {
  const v: [number, number, number] = [LIGHT.dx, LIGHT.dy, 1.15];
  const l = Math.hypot(...v);
  return [v[0] / l, v[1] / l, v[2] / l];
})();
const H3 = ((): [number, number, number] => {
  const v: [number, number, number] = [L3[0], L3[1], L3[2] + 1];
  const l = Math.hypot(...v);
  return [v[0] / l, v[1] / l, v[2] / l];
})();
/** The night street under the acid (fx5's street: #23282d). */
const STREET: [number, number, number] = [35, 40, 45];
/** Absorption per channel per unit thickness: red and blue go first, so thick acid is deep yellow-green. */
const SIGMA: [number, number, number] = [1.7, 0.95, 6.5];
/** The acid's own scattered light (yellow-green; only acid glows). */
const SCATTER: [number, number, number] = [86, 108, 12];

/**
 * One liquid pixel. h = thickness (0–1), (nx, ny, nz) = the surface normal, cov = coverage (0–1 at the contact line),
 * glow = how much of its own light the acid gives (0–1), spec = highlight strength. Writes RGBA into d at i.
 */
function liquidPixel(d: Uint8ClampedArray, i: number, h: number, nx: number, ny: number, nz: number, cov: number, glow: number, spec: number): void {
  const T0 = Math.exp(-SIGMA[0] * h * 2.2);
  const T1 = Math.exp(-SIGMA[1] * h * 2.2);
  const T2 = Math.exp(-SIGMA[2] * h * 2.2);
  const nl = Math.max(0, nx * L3[0] + ny * L3[1] + nz * L3[2]);
  const nh = Math.max(0, nx * H3[0] + ny * H3[1] + nz * H3[2]);
  const fres = 0.04 + 0.96 * Math.pow(1 - clamp(nz), 5);
  const sc = (1 - Math.exp(-h * 3.2)) * glow * (0.55 + 0.6 * nl);
  const sp = spec * (Math.pow(nh, 140) * 2.2 + Math.pow(nh, 16) * 0.16 + fres * 0.22 * nl);
  // the far side of a bulge (facing away from the light) is darker: the street light does not reach it
  const away = 1 - 0.35 * clamp(-(nx * L3[0] + ny * L3[1]) * 2.5);
  const R = [STREET[0] * T0 * away + SCATTER[0] * sc + 255 * sp * LIGHT.tint[0], STREET[1] * T1 * away + SCATTER[1] * sc + 255 * sp * LIGHT.tint[1], STREET[2] * T2 * away + SCATTER[2] * sc + 255 * sp * LIGHT.tint[2]];
  // normal-blend encoding over the street: out = S (1 − a) + C a ≈ R
  let a = clamp(0.3 + 0.7 * (1 - Math.exp(-h * 4)));
  for (let c = 0; c < 3; c++) {
    const need = (R[c] as number) - STREET[c]! * (1 - a);
    if (need > 255 * a) a = clamp(((R[c] as number) - STREET[c]!) / (255 - STREET[c]!), a, 1);
  }
  if (a * cov <= 0.002) return;
  for (let c = 0; c < 3; c++) d[i + c] = clamp(((R[c] as number) - STREET[c]! * (1 - a)) / a, 0, 255);
  d[i + 3] = 255 * a * cov;
}

/* ---------------- AC-R: the splat's shape ---------------- */

/** Blobs in units of R (x = the flight). The body pushed forward, fingers that ran on, satellite drops; all ≤ 0.86 R. */
export function splatBlobsR(seed: number): [number, number, number][] {
  const r = rng(seed * 7 + 3);
  const out: [number, number, number][] = [
    [0.12, 0, 0.42],
    [-0.16, 0.06, 0.34],
    [0.34, -0.08, 0.28],
    [0.28, 0.16, 0.24],
  ];
  for (let k = 0; k < 5; k++) {
    const a = -0.8 + (k / 4) * 1.6 + (r() - 0.5) * 0.3;
    const d = 0.42 + r() * 0.1;
    const w = 0.1 + r() * 0.05;
    out.push([Math.cos(a) * d, Math.sin(a) * d * 0.9, w]);
    out.push([Math.cos(a) * (d + 0.14), Math.sin(a) * (d + 0.14) * 0.9, w * 0.6]);
  }
  for (let k = 0; k < 4; k++) {
    const a = -1.0 + r() * 2.0;
    const d = 0.7 + r() * 0.1;
    out.push([Math.cos(a) * d, Math.sin(a) * d * 0.85, 0.055 + r() * 0.03]);
  }
  out.push([-0.5, (r() - 0.5) * 0.4, 0.08]);
  return out;
}
export function splatFieldR(b: [number, number, number][], x: number, y: number): number {
  let f = 0;
  for (const [bx, by, br] of b) {
    const q = ((x - bx) ** 2 + (y - by) ** 2) / (br * br * 2.9);
    if (q < 1) f += (1 - q) ** 3;
  }
  return f * 3.4;
}

/** A height field on a px² grid (R units ±1), then the liquid shaded from it. */
function shadeHeight(px: number, hAt: (x: number, y: number) => number, covAt: (x: number, y: number) => number, slope: number, glow: number, spec: number): HTMLCanvasElement {
  const H = new Float32Array(px * px);
  const C = new Float32Array(px * px);
  for (let py = 0; py < px; py++)
    for (let qx = 0; qx < px; qx++) {
      const x = ((qx + 0.5) / px) * 2 - 1;
      const y = ((py + 0.5) / px) * 2 - 1;
      H[py * px + qx] = hAt(x, y);
      C[py * px + qx] = covAt(x, y);
    }
  const c = make(px, px);
  const g = c.getContext("2d")!;
  const im = g.createImageData(px, px);
  const at = (x: number, y: number): number => H[Math.max(0, Math.min(px - 1, y)) * px + Math.max(0, Math.min(px - 1, x))] as number;
  for (let py = 0; py < px; py++)
    for (let qx = 0; qx < px; qx++) {
      const k = py * px + qx;
      const cov = C[k] as number;
      if (cov <= 0) continue;
      const gx = (at(qx + 1, py) - at(qx - 1, py)) * slope;
      const gy = (at(qx, py + 1) - at(qx, py - 1)) * slope;
      const l = Math.hypot(gx, gy, 1);
      liquidPixel(im.data, k * 4, H[k] as number, -gx / l, -gy / l, 1 / l, cov, glow, spec);
    }
  g.putImageData(im, 0, 0);
  return c;
}

/**
 * The liquid (frame = the 2 R zone, facing +x = the flight). Surface tension: flat on top, rounded at the contact
 * line; slow viscous wrinkles where the glob hit. The street light's highlight is baked for this heading (a game build
 * bakes 8 headings, see the card's perf), so it sits upper-left.
 */
export function acidLiquid(px: number, seed: number): HTMLCanvasElement {
  const B = splatBlobsR(seed);
  return shadeHeight(
    px,
    (x, y) => {
      const f = splatFieldR(B, x, y);
      if (f < 1) return 0;
      const base = 0.55 * (1 - Math.exp(-(f - 1) * 2.6));
      // the impact mound (thicker where the glob landed) and viscous wrinkles spreading from it
      const dI = Math.hypot(x - 0.06, y);
      const mound = 0.16 * Math.exp(-dI * dI * 18);
      // viscous folds (ridged noise, strongest round the impact) and a slow uneven surface
      const rn = gdFbm(x * 7 + seed, y * 7, seed + 21, 3);
      const wr = 0.05 * (1 - Math.abs(2 * rn - 1)) * Math.exp(-dI * 2.4);
      const n = 0.05 * (gdFbm(x * 4 + 3, y * 4, seed + 9, 4) - 0.45);
      return Math.max(0, base + mound + (wr + n) * smooth(1, 1.6, f));
    },
    (x, y) => smooth(0.96, 1.08, splatFieldR(B, x, y)),
    px * 0.11,
    1,
    1,
  );
}

/** The glob in flight (facing +x): a heavy head and a viscous string of drops behind. No highlight: its own sprite. */
export function acidGlobR(): HTMLCanvasElement {
  const W = 96;
  const Hh = 44;
  const drops: [number, number, number][] = [
    [68, 0, 15],
    [50, 1, 9],
    [37, -0.8, 6.4],
    [27, 0.6, 4.6],
    [19, -0.4, 3.4],
    [12, 0.2, 2.6],
  ];
  const c = make(W, Hh);
  const g = c.getContext("2d")!;
  const im = g.createImageData(W, Hh);
  const field = (x: number, y: number): number => {
    let f = 0;
    for (const [dx, dy, r] of drops) {
      const q = ((x - dx) ** 2 / 1.25 + (y - Hh / 2 - dy) ** 2) / (r * r * 2.2);
      if (q < 1) f += (1 - q) ** 3;
    }
    // the string joining the drops
    if (x > 8 && x < 66) {
      const w = 1.6 + (x - 8) * 0.03;
      const q = (y - Hh / 2) ** 2 / (w * w * 2.2);
      if (q < 1) f += 0.7 * (1 - q) ** 3;
    }
    return f * 2.6;
  };
  const Hf = new Float32Array(W * Hh);
  for (let y = 0; y < Hh; y++) for (let x = 0; x < W; x++) Hf[y * W + x] = Math.sqrt(Math.max(0, field(x + 0.5, y + 0.5) - 1)) * 0.6;
  const at = (x: number, y: number): number => Hf[Math.max(0, Math.min(Hh - 1, y)) * W + Math.max(0, Math.min(W - 1, x))] as number;
  for (let y = 0; y < Hh; y++)
    for (let x = 0; x < W; x++) {
      const f = field(x + 0.5, y + 0.5);
      const cov = smooth(0.95, 1.12, f);
      if (cov <= 0) continue;
      const gx = (at(x + 1, y) - at(x - 1, y)) * 7;
      const gy = (at(x, y + 1) - at(x, y - 1)) * 7;
      const l = Math.hypot(gx, gy, 1);
      liquidPixel(im.data, (y * W + x) * 4, Math.min(1, (Hf[y * W + x] as number) * 1.6), -gx / l, -gy / l, 1 / l, cov, 1.35, 0);
    }
  g.putImageData(im, 0, 0);
  return c;
}

/** The street light's reflection on wet acid: a sharp core, a short bloom, slightly elongated. Unrotated sprite. */
export function specGlint(): HTMLCanvasElement {
  const c = make(24, 16);
  const g = c.getContext("2d")!;
  const im = g.createImageData(24, 16);
  for (let y = 0; y < 16; y++)
    for (let x = 0; x < 24; x++) {
      const dx = (x + 0.5 - 12) / 12;
      const dy = (y + 0.5 - 8) / 8;
      const r = Math.hypot(dx, dy);
      if (r >= 1) continue;
      const a = Math.exp(-r * r * 18) * 0.95 + Math.exp(-r * r * 4) * 0.3;
      const i = (y * 24 + x) * 4;
      im.data[i] = 245;
      im.data[i + 1] = 252;
      im.data[i + 2] = 255;
      im.data[i + 3] = 255 * clamp(a) * smooth(1, 0.8, r);
    }
  g.putImageData(im, 0, 0);
  return c;
}

/** A bubble on the acid, 32 px: 0 a rising dome, 1 a full dome (thin film: see-through, rim, highlight), 2 the pop (a small crater ring settling). */
export function acidBubbleR(f: number): HTMLCanvasElement {
  const N = 32;
  const R = f === 0 ? 0.5 : 0.82;
  return shadeHeight(
    N,
    (x, y) => {
      const r = Math.hypot(x, y);
      if (f < 2) return r < R ? 0.35 * Math.sqrt(1 - (r / R) ** 2) : 0;
      // the popped film: a raised ring settling back, lower in the middle
      return 0.12 * Math.exp(-(((r - 0.55) / 0.16) ** 2)) - 0.04 * Math.exp(-r * r * 12);
    },
    (x, y) => {
      const r = Math.hypot(x, y);
      return f < 2 ? smooth(R, R - 0.12, r) : smooth(0.9, 0.7, r) * 0.9;
    },
    N * 0.22,
    f < 2 ? 0.55 : 0.8,
    1.1,
  );
}

/**
 * The asphalt the acid ate (frame = 2 R): the binder dissolved and wet-dark, the aggregate stones laid bare (lit from
 * the upper left, faintly stained), a matte dried tide line at the edge of where the liquid lay, a few pits. Never
 * green, never bright: the mark. Follows the splat's shape (a little wider).
 */
export function acidEtchR(px: number, seed: number): HTMLCanvasElement {
  const B = splatBlobsR(seed);
  const c = make(px, px);
  const g = c.getContext("2d")!;
  const im = g.createImageData(px, px);
  const d = im.data;
  const cell = Math.max(3, Math.round(px / 40)); // stones ≈ 2.5–4 cm: ≥ 1 px at 36 px/m
  for (let py = 0; py < px; py++)
    for (let qx = 0; qx < px; qx++) {
      const x = ((qx + 0.5) / px) * 2 - 1;
      const y = ((py + 0.5) / px) * 2 - 1;
      const f = splatFieldR(B, x * 0.94, y * 0.94);
      if (f < 0.5) continue;
      const i = (py * px + qx) * 4;
      const n = gdFbm(x * 7 + seed, y * 7, 31 + seed, 4);
      const inside = smooth(0.62, 1.2, f); // how long the acid sat here
      // the binder: wet, dark, a little warm
      let r = 24 + 10 * n;
      let gg = 24 + 9 * n;
      let b = 20 + 6 * n;
      let a = (0.35 + 0.35 * inside) * smooth(0.5, 0.7, f);
      // exposed stones (a jittered grid: one stone per cell, some cells empty)
      const cx = Math.floor(qx / cell);
      const cy = Math.floor(py / cell);
      let best = 9;
      let sx = 0;
      let sy = 0;
      let tone = 0;
      for (let oy = -1; oy <= 1; oy++)
        for (let ox = -1; ox <= 1; ox++) {
          const kx = cx + ox;
          const ky = cy + oy;
          if (hash2(kx, ky, seed + 5) > 0.42) continue;
          const px0 = (kx + 0.2 + 0.6 * hash2(kx, ky, seed + 6)) * cell;
          const py0 = (ky + 0.2 + 0.6 * hash2(kx, ky, seed + 7)) * cell;
          const rad = cell * (0.3 + 0.42 * hash2(kx, ky, seed + 8));
          const ddx = qx + 0.5 - px0;
          const ddy = py + 0.5 - py0;
          const dd = (Math.hypot(ddx, ddy) / rad) * (0.8 + 0.45 * gdFbm(ddx * 0.5 + kx * 3, ddy * 0.5 + ky * 3, seed + 10, 2));
          if (dd < best) {
            best = dd;
            sx = (qx + 0.5 - px0) / rad;
            sy = (py + 0.5 - py0) / rad;
            tone = hash2(kx, ky, seed + 9);
          }
        }
      const stone = smooth(1, 0.78, best) * smooth(0.8, 1.6, f) * 0.8;
      if (stone > 0) {
        const lit = 0.75 + 0.45 * clamp(-(sx * LIGHT.dx + sy * LIGHT.dy) * 0.9, -1, 1);
        const base = 62 + 34 * tone;
        const sr = base * lit * 1.02;
        const sg = base * lit * 0.98;
        const sb = base * lit * 0.84; // a faint chemical stain (warm, desaturated: never reads as glow)
        r += (sr - r) * stone;
        gg += (sg - gg) * stone;
        b += (sb - b) * stone;
        a = Math.max(a, 0.85 * stone);
      }
      // the dried tide line where the liquid's edge sat
      const tide = Math.exp(-(((f - 0.82) / 0.1) ** 2)) * (0.55 + 0.6 * gdFbm(x * 14, y * 14, seed + 40, 3));
      if (tide > 0.02) {
        r += (112 - r) * tide * 0.5;
        gg += (102 - gg) * tide * 0.5;
        b += (74 - b) * tide * 0.5;
        a = Math.max(a, 0.55 * tide);
      }
      // pits: soft dark hollows (never hard specks)
      const pit = gdFbm(x * 22, y * 22, seed + 60, 2);
      if (pit > 0.62) {
        const k = smooth(0.62, 0.74, pit) * inside;
        r *= 1 - 0.5 * k;
        gg *= 1 - 0.5 * k;
        b *= 1 - 0.5 * k;
        a = Math.max(a, 0.7 * k);
      }
      d[i] = r;
      d[i + 1] = gg;
      d[i + 2] = b;
      d[i + 3] = 255 * clamp(a);
    }
  g.putImageData(im, 0, 0);
  const out = make(px, px);
  const og = out.getContext("2d")!;
  og.filter = "blur(0.5px)";
  og.drawImage(c, 0, 0);
  return out;
}

/**
 * The film (frame = 2 R, normal blend): acid that ran out thin over the asphalt to exactly R. Wet-dark, with the street
 * light caught as a glossy smear on the side facing it (upper left) and the asphalt's grain showing through, ending in
 * a thin meniscus at R (its outer edge = the damage edge).
 */
export function acidFilm(px: number): HTMLCanvasElement {
  const c = make(px, px);
  const g = c.getContext("2d")!;
  const im = g.createImageData(px, px);
  const d = im.data;
  for (let py = 0; py < px; py++)
    for (let qx = 0; qx < px; qx++) {
      const x = ((qx + 0.5) / px) * 2 - 1;
      const y = ((py + 0.5) / px) * 2 - 1;
      const r = Math.hypot(x, y);
      if (r > 1) continue;
      const grain = gdFbm(x * 26, y * 26, 77, 3);
      const gloss = Math.exp(-(((x + 0.42) ** 2 + (y + 0.5) ** 2) / 0.2)) * (0.55 + 0.45 * grain) * 0.6; // the lamp, smeared by the rough asphalt
      const men = Math.exp(-(((r - 0.975) / 0.018) ** 2)); // the meniscus: a hair-thin raised edge
      const menLit = men * (0.55 + 0.45 * clamp(-(x * LIGHT.dx + y * LIGHT.dy) / Math.max(r, 1e-3)));
      const i = (py * px + qx) * 4;
      d[i] = 26 + 120 * gloss + 70 * menLit;
      d[i + 1] = 34 + 140 * gloss + 105 * menLit;
      d[i + 2] = 20 + 90 * gloss + 30 * menLit;
      d[i + 3] = 255 * clamp((0.26 + 0.06 * grain + 0.25 * gloss + 0.5 * men) * smooth(1, 0.985, r));
    }
  g.putImageData(im, 0, 0);
  return c;
}

/**
 * The acid's light on the asphalt (ADD, frame = 2 R): the zone. Strong at the liquid, an even floor out to R that ends
 * there, broken by the asphalt's grain (light lands on stone tops), and the meniscus glowing faintly at R.
 */
export function acidLightR(px: number): HTMLCanvasElement {
  const c = make(px, px);
  const g = c.getContext("2d")!;
  const im = g.createImageData(px, px);
  const d = im.data;
  for (let py = 0; py < px; py++)
    for (let qx = 0; qx < px; qx++) {
      const x = ((qx + 0.5) / px) * 2 - 1;
      const y = ((py + 0.5) / px) * 2 - 1;
      const r = Math.hypot(x, y);
      if (r > 1) continue;
      const ang = Math.atan2(y, x);
      const grain = 0.7 + 0.45 * gdFbm(x * 24, y * 24, 91, 3);
      const floor = (0.28 + 0.72 * Math.pow(Math.max(0, 1 - r), 1.8)) * grain * smooth(1, 0.96, r);
      const men = Math.exp(-(((r - 0.972) / 0.016) ** 2)) * (0.72 + 0.28 * gdFbm(Math.cos(ang) * 3 + 5, Math.sin(ang) * 3, 93, 3));
      const a = clamp(floor * 0.75 + men * 0.95);
      const k = men / (men + floor + 1e-6);
      const i = (py * px + qx) * 4;
      d[i] = 120 + 90 * k;
      d[i + 1] = 210 + 45 * k;
      d[i + 2] = 40 + 60 * k;
      d[i + 3] = 255 * a;
    }
  g.putImageData(im, 0, 0);
  return c;
}

/* ---------------- BD-R: dust rolling along the ground ---------------- */

/**
 * A ground billow (neutral, tinted in the game): low and wide, born on the street. Lit from above and the upper left
 * (its top bright, its rolled front shaded), with its own contact shadow baked under its down-right edge, so it sits ON
 * the street and never reads as floating. Never rotated (the light is baked).
 */
export function groundBillow(px: number, seed: number): HTMLCanvasElement {
  const c = make(px, px);
  const g = c.getContext("2d")!;
  const im = g.createImageData(px, px);
  const d = im.data;
  const ox = seed * 3.1;
  const den = (x: number, y: number): number => {
    const r = Math.hypot(x, y * 1.08);
    const n = gdFbm(x * 3.2 + ox, y * 3.2 - ox, 120 + seed, 4);
    return smooth(0.95, 0.25, r + (0.5 - n) * 0.5) * (0.7 + 0.7 * n);
  };
  const e = 0.08;
  for (let py = 0; py < px; py++)
    for (let qx = 0; qx < px; qx++) {
      const x = ((qx + 0.5) / px) * 2 - 1;
      const y = ((py + 0.5) / px) * 2 - 1;
      const i = (py * px + qx) * 4;
      const D = Math.min(1, den(x, y));
      // the billow's contact shadow on the street: its own shape, offset down-right, dark and soft
      const S = Math.min(1, den(x - 0.12, y - 0.14)) * 0.55;
      if (D <= 0.004 && S <= 0.004) continue;
      const toward = Math.min(1, den(x + LIGHT.dx * e, y + LIGHT.dy * e));
      let lum = 0.78 + 2.4 * (D - toward) + 0.1 * (-(x * LIGHT.dx + y * LIGHT.dy)) + 0.12 * D; // lit from above: denser = taller = brighter
      lum = clamp(lum, 0.38, 1.05);
      const aD = 0.88 * D;
      const aS = S * (1 - aD);
      const a = aD + aS;
      const L = (lum * aD + 0.12 * aS) / Math.max(a, 1e-4);
      d[i] = 255 * L * LIGHT.tint[0];
      d[i + 1] = 255 * L * LIGHT.tint[1];
      d[i + 2] = 255 * L * LIGHT.tint[2];
      d[i + 3] = 255 * clamp(a) * smooth(1, 0.86, Math.hypot(x, y));
    }
  g.putImageData(im, 0, 0);
  const out = make(px, px);
  const og = out.getContext("2d")!;
  og.filter = `blur(${Math.max(0.6, px / 90)}px)`;
  og.drawImage(c, 0, 0);
  return out;
}

/* ---------------- EV-R: the stampede arrow (amber light on the asphalt) ---------------- */

/**
 * A straight light strip along +x (`lenM` × `wM`), the language of the Behemoth's warnings (telegraphs.ts › edgeStrip:
 * a hot core line, a bloom on both sides, broken a little by the asphalt's grain), in the event colour: amber.
 */
export function amberStrip(lenM: number, wM: number, pxm: number, seed: number): HTMLCanvasElement {
  const W = Math.ceil(lenM * pxm);
  const H = Math.ceil(wM * pxm);
  const c = make(W, H);
  const g = c.getContext("2d")!;
  const im = g.createImageData(W, H);
  for (let y = 0; y < H; y++)
    for (let x = 0; x < W; x++) {
      const xm = x / pxm;
      const dd = (y + 0.5) / pxm - wM / 2;
      const core = Math.exp(-Math.pow(dd / 0.04, 2));
      const ag = 0.7 + 0.3 * gdFbm(xm * 6, (y / pxm) * 6, seed, 3);
      const bloom = Math.exp(-Math.pow(dd / (wM * 0.22), 2)) * ag;
      const a = clamp(bloom * 0.7 + core);
      const k = core / (core + bloom * 0.7 + 1e-6);
      const j = (y * W + x) * 4;
      im.data[j] = 255;
      im.data[j + 1] = Math.round(140 + 95 * k);
      im.data[j + 2] = Math.round(30 + 150 * k);
      im.data[j + 3] = Math.round(255 * a);
    }
  g.putImageData(im, 0, 0);
  return c;
}

/**
 * The arrowhead (ADD, faces +x): two light lines meeting at the tip, `wM` wide across and `lenM` long, with the same
 * core + bloom as the strips; cropped to the lines' bloom.
 */
export function amberHead(lenM: number, wM: number, pxm: number, seed: number): HTMLCanvasElement {
  const pad = 0.3;
  const W = Math.ceil((lenM + 2 * pad) * pxm);
  const H = Math.ceil((wM + 2 * pad) * pxm);
  const c = make(W, H);
  const g = c.getContext("2d")!;
  const im = g.createImageData(W, H);
  const tip: [number, number] = [pad + lenM, pad + wM / 2];
  const ends: [number, number][] = [
    [pad, pad],
    [pad, pad + wM],
  ];
  const segD = (px0: number, py0: number, a: [number, number], b: [number, number]): number => {
    const vx = b[0] - a[0];
    const vy = b[1] - a[1];
    const t = clamp(((px0 - a[0]) * vx + (py0 - a[1]) * vy) / (vx * vx + vy * vy));
    return Math.hypot(px0 - a[0] - vx * t, py0 - a[1] - vy * t);
  };
  for (let y = 0; y < H; y++)
    for (let x = 0; x < W; x++) {
      const xm = (x + 0.5) / pxm;
      const ym = (y + 0.5) / pxm;
      const dd = Math.min(segD(xm, ym, ends[0]!, tip), segD(xm, ym, ends[1]!, tip));
      const core = Math.exp(-Math.pow(dd / 0.05, 2));
      const ag = 0.7 + 0.3 * gdFbm(xm * 6, ym * 6, seed, 3);
      const bloom = Math.exp(-Math.pow(dd / 0.2, 2)) * ag;
      const a = clamp(bloom * 0.7 + core);
      const k = core / (core + bloom * 0.7 + 1e-6);
      const j = (y * W + x) * 4;
      im.data[j] = 255;
      im.data[j + 1] = Math.round(140 + 95 * k);
      im.data[j + 2] = Math.round(30 + 150 * k);
      im.data[j + 3] = Math.round(255 * a);
    }
  g.putImageData(im, 0, 0);
  return c;
}
