/**
 * Photoreal group 5, gunfire family: the baked pictures of the takes (muzzle flashes, plumes, tracers, blood, smears,
 * sparks, rings, splinters). Everything here runs once, in a Look's bake(); the cards (gunfire.ts) only compose.
 *
 * The group's idea: "every effect is light or matter, and the street keeps the mark".
 *  - LIGHT (flash, plume, tracer, sparks, glints, rings) is drawn white-hot in the core, cooling outward to its
 *    colour by temperature, on a transparent ground, for an ADD blend.
 *  - MATTER (blood, mist, smoke, dust, splinters) is drawn lit by the key light from the upper left (brighter on the
 *    upper-left side, darker down-right), with a soft shadow where it is solid, for a NORMAL blend.
 *  - THE MARK (pools, drops, smears) is matte and dark; fresh blood keeps a little gloss (the relight's gloss mask).
 * One blood for everything: dark red-brown (BLOOD_*), never the warning red.
 */
import { make, rng } from "./kit";

/** One blood palette (today the game has four: #5a0f0f splat, #8a1c1c puff, #4a0c0c trail, #8a1010 saw). */
export const BLOOD_DEEP = [52, 9, 6] as const;
export const BLOOD_MID = [86, 18, 11] as const;
export const BLOOD_THIN = [112, 34, 20] as const;
const rgba = (c: readonly number[], a: number): string => `rgba(${c[0]},${c[1]},${c[2]},${a})`;

/* ---------- noise (bake only) ---------- */
function hash2(x: number, y: number, s: number): number {
  let h = (x * 374761393 + y * 668265263 + s * 2147483647) | 0;
  h = Math.imul(h ^ (h >>> 13), 1274126177);
  return ((h ^ (h >>> 16)) >>> 0) / 4294967296;
}
function vnoise(x: number, y: number, s: number): number {
  const xi = Math.floor(x);
  const yi = Math.floor(y);
  const xf = x - xi;
  const yf = y - yi;
  const u = xf * xf * (3 - 2 * xf);
  const v = yf * yf * (3 - 2 * yf);
  const a = hash2(xi, yi, s);
  const b = hash2(xi + 1, yi, s);
  const c = hash2(xi, yi + 1, s);
  const d = hash2(xi + 1, yi + 1, s);
  return a + (b - a) * u + (c - a) * v + (a - b - c + d) * u * v;
}
export function fbm(x: number, y: number, s: number, oct = 4): number {
  let f = 0;
  let amp = 0.5;
  let fr = 1;
  for (let i = 0; i < oct; i++) {
    f += vnoise(x * fr, y * fr, s + i * 17) * amp;
    fr *= 2.03;
    amp *= 0.5;
  }
  return f / 0.9375;
}

/** Fills a canvas pixel by pixel: fn(u, v) → [r, g, b, a] in 0–255 (u, v in px). */
function pixels(w: number, h: number, fn: (x: number, y: number, out: number[]) => void): HTMLCanvasElement {
  const c = make(w, h);
  const g = c.getContext("2d")!;
  const img = g.createImageData(w, h);
  const o = [0, 0, 0, 0];
  for (let y = 0; y < h; y++)
    for (let x = 0; x < w; x++) {
      o[0] = o[1] = o[2] = o[3] = 0;
      fn(x + 0.5, y + 0.5, o);
      const j = (y * w + x) * 4;
      img.data[j] = o[0] as number;
      img.data[j + 1] = o[1] as number;
      img.data[j + 2] = o[2] as number;
      img.data[j + 3] = o[3] as number;
    }
  g.putImageData(img, 0, 0);
  return c;
}
/** Temperature ramp for emitted light (0 = cool ember, 1 = white hot), premultiplied-friendly RGB. */
export function heat(t: number): [number, number, number] {
  const k = Math.max(0, Math.min(1, t));
  if (k > 0.75) return [255, 246 + (k - 0.75) * 36, 220 + (k - 0.75) * 140];
  if (k > 0.45) return [255, 196 + ((k - 0.45) / 0.3) * 50, 110 + ((k - 0.45) / 0.3) * 110];
  if (k > 0.2) return [240 + ((k - 0.2) / 0.25) * 15, 110 + ((k - 0.2) / 0.25) * 86, 40 + ((k - 0.2) / 0.25) * 70];
  return [150 + (k / 0.2) * 90, 40 + (k / 0.2) * 70, 18 + (k / 0.2) * 22];
}

/* ---------- MUZZLE FLASH (light) ---------- */
export type MuzzleKind = "pistol" | "rifle" | "shotgun" | "turret";
/** Muzzle texture: 1.2 m × 0.6 m, the muzzle at the CENTRE (so `sprite()` centres it on the muzzle), firing +x. */
export const MZ_W_M = 1.2;
export const MZ_H_M = 0.6;
const MZ_PXM = 80;
/**
 * One muzzle frame. f = 0 (first game frame: the hottest, petals out), 1 (the plume pushed forward, cooling), 2 (the
 * last wisps, orange). Shapes per kind follow the real thing: a pistol's short 4-point star, a rifle's muzzle brake
 * (two side jets + a long forward tongue), a shotgun's big round bloom, a turret's twin short jets.
 */
export function bakeMuzzle(kind: MuzzleKind, f: number, seed: number): HTMLCanvasElement {
  const w = Math.round(MZ_W_M * MZ_PXM);
  const h = Math.round(MZ_H_M * MZ_PXM);
  const cx = w / 2;
  const cy = h / 2;
  const P = MZ_PXM;
  // lobes: [angle (rad), length m, width m]
  const lobes: [number, number, number][] = [];
  const fwd = { pistol: 0.26, rifle: 0.38, shotgun: 0.4, turret: 0.22 }[kind];
  const coreR = { pistol: 0.07, rifle: 0.08, shotgun: 0.14, turret: 0.06 }[kind];
  lobes.push([0, fwd * (1 + f * 0.35), (kind === "shotgun" ? 0.17 : 0.07) * (1 + f * 0.4)]);
  if (kind === "pistol") lobes.push([0.9, 0.12, 0.04], [-0.9, 0.12, 0.04], [Math.PI, 0.05, 0.04]);
  if (kind === "rifle") lobes.push([1.45, 0.17, 0.05], [-1.45, 0.17, 0.05], [0.5, 0.1, 0.03], [-0.5, 0.1, 0.03]);
  if (kind === "shotgun") lobes.push([0.6, 0.2, 0.09], [-0.6, 0.2, 0.09], [1.2, 0.12, 0.06], [-1.2, 0.12, 0.06]);
  if (kind === "turret") lobes.push([0.0, 0.18, 0.05], [0.35, 0.1, 0.03], [-0.35, 0.1, 0.03]);
  const fade = [1, 0.62, 0.3][f] as number;
  const cool = [0, 0.22, 0.5][f] as number;
  const push = f * 0.05; // the gas cloud moves forward with the frames
  return pixels(w, h, (x, y, o) => {
    const mx = (x - cx) / P - push;
    const my = (y - cy) / P;
    // core
    let e = Math.exp(-(mx * mx + my * my) / (2 * coreR * coreR)) * (f === 2 ? 0.25 : 1);
    for (const [a, len, wd] of lobes) {
      const ca = Math.cos(a);
      const sa = Math.sin(a);
      const along = mx * ca + my * sa;
      const across = -mx * sa + my * ca;
      if (along < -0.02) continue;
      const u = along / len;
      if (u > 1.4) continue;
      // teardrop: widest a third of the way out, tapering to a point
      const prof = wd * Math.max(0, Math.sin(Math.min(1, u) * Math.PI * 0.95 + 0.15)) * (1 - 0.35 * u);
      if (prof <= 0) continue;
      const turb = 0.75 + 0.5 * fbm(along * 14 + seed, across * 14, seed + f * 3, 3);
      const l = Math.exp(-(across * across) / (2 * prof * prof * 0.45)) * Math.max(0, 1 - u * u) * turb;
      e = Math.max(e, l);
    }
    e *= fade;
    if (e < 0.01) return;
    const [r, g, b] = heat(Math.min(1, e * 1.25 - cool));
    const a = Math.min(1, e * 1.4);
    o[0] = r * a;
    o[1] = g * a;
    o[2] = b * a;
    o[3] = 255 * a;
  });
}

/* ---------- SMOKE / DUST PUFFS (matter, lit from the upper left) ---------- */
/** A soft puff of smoke or dust, lit by the key light (brighter upper-left, darker lower-right). col = mid tone. */
export function bakePuff(px: number, col: readonly [number, number, number], seed: number, density = 0.8): HTMLCanvasElement {
  const r0 = px / 2;
  return pixels(px, px, (x, y, o) => {
    const dx = (x - r0) / r0;
    const dy = (y - r0) / r0;
    const d = Math.hypot(dx, dy);
    if (d >= 1) return;
    const n = fbm(dx * 2.2 + 3, dy * 2.2 + 7, seed, 4);
    const edge = 1 - d + (n - 0.5) * 0.6;
    if (edge <= 0) return;
    const a = Math.min(1, edge * 1.8) * density * (0.55 + 0.45 * n);
    // light: the side facing the upper left is brighter
    const lit = 0.78 + 0.32 * Math.max(-1, Math.min(1, (-dx * 0.6 - dy * 0.8) * 0.9 + (n - 0.5) * 0.6));
    o[0] = col[0] * lit * 0.93;
    o[1] = col[1] * lit * 0.98;
    o[2] = Math.min(255, col[2] * lit * 1.06);
    o[3] = 255 * a;
  });
}

/* ---------- GLOWS ---------- */
/** A light pool on the ground (ADD): warm, soft, falling off like a real point light (1 / (1 + d²)). */
export function bakePool(px: number, rgb: readonly [number, number, number], strength = 1): HTMLCanvasElement {
  const r0 = px / 2;
  return pixels(px, px, (x, y, o) => {
    const d = Math.hypot(x - r0, y - r0) / r0;
    if (d >= 1) return;
    const a = (1 / (1 + 16 * d * d) - 1 / 17) * (17 / 16) * strength * (1 - d);
    o[0] = rgb[0] * a;
    o[1] = rgb[1] * a;
    o[2] = rgb[2] * a;
    o[3] = 255 * a;
  });
}
/** A light ring on the ground (ADD): a soft band with a thin hot core. rFrac = ring radius / half size. */
export function bakeRing(px: number, rgb: readonly [number, number, number], bandFrac: number): HTMLCanvasElement {
  const r0 = px / 2;
  const rr = 0.78;
  return pixels(px, px, (x, y, o) => {
    const d = Math.hypot(x - r0, y - r0) / r0;
    const k = (d - rr) / bandFrac;
    const band = Math.exp(-k * k * 2.2);
    const core = Math.exp(-k * k * 18);
    const a = Math.min(1, band * 0.75 + core * 0.6);
    if (a < 0.004) return;
    const hot = core * 0.28;
    o[0] = (rgb[0] + (255 - rgb[0]) * hot) * a;
    o[1] = (rgb[1] + (255 - rgb[1]) * hot) * a;
    o[2] = (rgb[2] + (255 - rgb[2]) * hot) * a;
    o[3] = 255 * a;
  });
}
/** A four-point glint (ADD): a catch-light on steel. */
export function bakeGlint(px: number): HTMLCanvasElement {
  const r0 = px / 2;
  return pixels(px, px, (x, y, o) => {
    const dx = Math.abs(x - r0) / r0;
    const dy = Math.abs(y - r0) / r0;
    const star = Math.max(Math.exp(-dy * dy * 900) * (1 - dx), Math.exp(-dx * dx * 900) * (1 - dy)) * 0.8;
    const core = Math.exp(-(dx * dx + dy * dy) * 60);
    const a = Math.min(1, star + core);
    o[0] = 255 * a;
    o[1] = 250 * a;
    o[2] = 240 * a;
    o[3] = 255 * a;
  });
}

/* ---------- TRACER (light) ---------- */
/** A tracer: hot head at the RIGHT end, tail fading left. len × wid px. */
export function bakeTracer(lenPx: number, widPx: number, hot: number, tint: readonly [number, number, number] | null): HTMLCanvasElement {
  return pixels(lenPx, widPx, (x, y, o) => {
    const u = x / lenPx; // 0 tail … 1 head
    const v = (y - widPx / 2) / (widPx / 2);
    const thick = 0.25 + 0.75 * Math.pow(u, 0.7);
    const across = Math.exp(-(v * v) / (thick * thick * 0.35));
    const along = Math.pow(u, 1.6) * (u > 0.94 ? 1 - (u - 0.94) / 0.06 * 0.5 : 1);
    const a = Math.min(1, across * along * 1.3);
    if (a < 0.01) return;
    const t = Math.min(1, hot * (0.35 + 0.65 * u) * (0.6 + 0.4 * across));
    let [r, g, b] = heat(t);
    if (tint) {
      const k = 0.65 * (1 - Math.pow(u, 6));
      r = r + (tint[0] - r) * k;
      g = g + (tint[1] - g) * k;
      b = b + (tint[2] - b) * k;
    }
    o[0] = r * a;
    o[1] = g * a;
    o[2] = b * a;
    o[3] = 255 * a;
  });
}

/* ---------- SHOTGUN PLUME (light) ---------- */
/** The hot gas cone over the 30° spread, 2.4 m long, muzzle at the CENTRE (texture 4.8 × 1.6 m), firing +x. */
export const SG_W_M = 4.8;
export const SG_H_M = 1.6;
export function bakePlume(f: number, halfRad: number, lenM: number, seed: number): HTMLCanvasElement {
  const P = 48;
  const w = Math.round(SG_W_M * P);
  const h = Math.round(SG_H_M * P);
  const fade = [1, 0.6, 0.28][f] as number;
  const reach = [0.8, 1, 1.06][f] as number;
  return pixels(w, h, (x, y, o) => {
    const mx = (x - w / 2) / P;
    const my = (y - h / 2) / P;
    if (mx <= 0) return;
    const ang = Math.atan2(my, mx);
    const d = Math.hypot(mx, my);
    const u = d / (lenM * reach);
    if (u > 1.15) return;
    const side = Math.abs(ang) / halfRad;
    if (side > 1.25) return;
    const n = fbm(d * 3.2 - f * 0.9 + seed, ang * 6, seed, 4);
    const cone = Math.exp(-Math.pow(side, 4) * 1.1) * Math.max(0, 1 - u * u) * (0.45 + 0.9 * n);
    const near = Math.exp(-d * d / 0.08); // the hot throat at the muzzle
    const e = Math.min(1, (cone * (1 - 0.45 * u) * 1.5 + near * 0.9) * fade);
    if (e < 0.01) return;
    const [r, g, b] = heat(e * 1.1 - f * 0.12);
    const a = Math.min(1, e * 1.2);
    o[0] = r * a;
    o[1] = g * a;
    o[2] = b * a;
    o[3] = 255 * a;
  });
}

/* ---------- BLOOD (matter + mark) ---------- */
/** Box blur of a float field (separable, radius r), in place-safe copies. */
function blurField(f: Float32Array, w: number, h: number, r: number): Float32Array {
  const tmp = new Float32Array(w * h);
  const out = new Float32Array(w * h);
  const k = 2 * r + 1;
  for (let y = 0; y < h; y++) {
    let acc = 0;
    for (let x = -r; x <= r; x++) acc += f[y * w + Math.min(w - 1, Math.max(0, x))] as number;
    for (let x = 0; x < w; x++) {
      tmp[y * w + x] = acc / k;
      acc += (f[y * w + Math.min(w - 1, x + r + 1)] as number) - (f[y * w + Math.max(0, x - r)] as number);
    }
  }
  for (let x = 0; x < w; x++) {
    let acc = 0;
    for (let y = -r; y <= r; y++) acc += tmp[Math.min(h - 1, Math.max(0, y)) * w + x] as number;
    for (let y = 0; y < h; y++) {
      out[y * w + x] = acc / k;
      acc += (tmp[Math.min(h - 1, y + r + 1) * w + x] as number) - (tmp[Math.max(0, y - r) * w + x] as number);
    }
  }
  return out;
}
/**
 * Shades a liquid drawn as a coverage shape (any colour; only alpha and redness are read): depth from the distance to
 * the edge (a blurred mask: thick middle, thin rim), colour from deep to thin blood, alpha thinner at the rim, the rim
 * facing the key light (upper left) catches a soft highlight (the meniscus) and the far rim darkens. `gloss` 0 = matte
 * (soaked), 1 = fresh. Returns the base and its gloss mask (for an ADD sheen that dries off). The characters' relight
 * (charRelight) was tried first: it reads colour steps as creases and turned the overlapping lobes into pink rings.
 */
function shadeLiquid(src: HTMLCanvasElement, n: number, ss: number, gloss: number, seed: number): BloodPic {
  const g0 = make(n, n);
  const gg = g0.getContext("2d", { willReadFrequently: true })!;
  gg.drawImage(src, 0, 0, n, n);
  const d = gg.getImageData(0, 0, n, n).data;
  const m = new Float32Array(n * n);
  const tone = new Float32Array(n * n);
  for (let i = 0; i < n * n; i++) {
    m[i] = (d[i * 4 + 3] as number) / 255;
    tone[i] = 1 - Math.min(1, (d[i * 4] as number) / 120); // darker source = thicker
  }
  void ss;
  const depth = blurField(m, n, n, Math.max(2, Math.round(n / 40)));
  const soft = blurField(m, n, n, 1);
  const off = Math.max(1, Math.round(n / 64));
  const base = make(n, n);
  const gl = make(n, n);
  const bi = base.getContext("2d")!.createImageData(n, n);
  const gi = gl.getContext("2d")!.createImageData(n, n);
  for (let y = 0; y < n; y++)
    for (let x = 0; x < n; x++) {
      const i = y * n + x;
      const a = soft[i] as number;
      if (a < 0.02) continue;
      const th = Math.min(1, (depth[i] as number) * 1.15 * 0.6 + (tone[i] as number) * 0.4);
      const nz = 0.9 + 0.2 * fbm(x * 0.15, y * 0.15, seed, 3);
      // light side: the mask toward the light (upper left) vs here
      const xl = Math.max(0, Math.min(n - 1, x - Math.round(off * 0.6 * 2)));
      const yl = Math.max(0, Math.min(n - 1, y - Math.round(off * 0.8 * 2)));
      const xd = Math.max(0, Math.min(n - 1, x + Math.round(off * 0.6 * 2)));
      const yd = Math.max(0, Math.min(n - 1, y + Math.round(off * 0.8 * 2)));
      const lit = Math.max(0, (depth[i] as number) - (depth[yl * n + xl] as number)); // rim facing the light
      const shade = Math.max(0, (depth[i] as number) - (depth[yd * n + xd] as number)); // far rim
      const r = BLOOD_THIN[0] + (BLOOD_DEEP[0] - BLOOD_THIN[0]) * th;
      const gC = BLOOD_THIN[1] + (BLOOD_DEEP[1] - BLOOD_THIN[1]) * th;
      const b = BLOOD_THIN[2] + (BLOOD_DEEP[2] - BLOOD_THIN[2]) * th;
      const k = nz * (1 - shade * 1.6) * (1 + lit * 0.5);
      const j = i * 4;
      bi.data[j] = r * k;
      bi.data[j + 1] = gC * k;
      bi.data[j + 2] = b * k;
      bi.data[j + 3] = 255 * a * (0.72 + 0.28 * th);
      const sp = Math.min(1, lit * 6) * gloss * a;
      if (sp > 0.01) {
        gi.data[j] = 205;
        gi.data[j + 1] = 218;
        gi.data[j + 2] = 232;
        gi.data[j + 3] = 255 * sp;
      }
    }
  base.getContext("2d")!.putImageData(bi, 0, 0);
  gl.getContext("2d")!.putImageData(gi, 0, 0);
  return { base, gloss: gl };
}
/**
 * A blood pool relit with the characters' in-game relight (charRelight): the pool's thick middle reads as a volume
 * and gets gloss; the thin rim and the satellite drops are lighter and translucent. `spatter` = the matte version
 * (BL-B): no pool, a burst of soaked spatter.
 */
export interface BloodPic {
  base: HTMLCanvasElement;
  gloss: HTMLCanvasElement;
}
export function bakeBlood(seed: number, sizeM: number, spatter: boolean): BloodPic {
  const N = 128;
  const SS = 2;
  const P = (N * SS) / sizeM; // src px per metre
  const src = make(N * SS, N * SS);
  const g = src.getContext("2d", { willReadFrequently: true })!;
  const R = rng(seed);
  const c = (N * SS) / 2;
  const rad = spatter ? 0.16 : 0.3; // m
  // main pool: noisy blob, deep centre to thinner rim (radial gradient), drawn as filled polygon
  const blob = (x0: number, y0: number, r: number, sd: number, wob: number): void => {
    g.beginPath();
    for (let i = 0; i <= 48; i++) {
      const a = (i / 48) * Math.PI * 2;
      const k = 1 + (fbm(Math.cos(a) * 1.6 + sd, Math.sin(a) * 1.6, sd, 3) - 0.5) * wob;
      const px = x0 + Math.cos(a) * r * k;
      const py = y0 + Math.sin(a) * r * k;
      if (i === 0) g.moveTo(px, py);
      else g.lineTo(px, py);
    }
    g.closePath();
  };
  const grad = (x0: number, y0: number, r: number): CanvasGradient => {
    const gr = g.createRadialGradient(x0 - r * 0.1, y0 - r * 0.1, 0, x0, y0, r * 1.15);
    gr.addColorStop(0, rgba(BLOOD_DEEP, 1));
    gr.addColorStop(0.65, rgba(BLOOD_MID, 1));
    gr.addColorStop(1, rgba(BLOOD_THIN, 0.85));
    return gr;
  };
  if (!spatter) {
    blob(c, c, rad * P, seed, 0.75);
    g.fillStyle = grad(c, c, rad * P);
    g.fill();
    // two lobes where it ran
    for (let k = 0; k < 2; k++) {
      const a = R() * Math.PI * 2;
      const d = rad * P * (0.75 + R() * 0.25);
      const r = rad * P * (0.35 + R() * 0.2);
      blob(c + Math.cos(a) * d, c + Math.sin(a) * d, r, seed + 5 + k, 0.6);
      g.fillStyle = grad(c + Math.cos(a) * d, c + Math.sin(a) * d, r);
      g.fill();
    }
  } else {
    blob(c, c, rad * P, seed, 0.5);
    g.fillStyle = rgba(BLOOD_MID, 0.95);
    g.fill();
  }
  // satellite drops thrown outward (≥ 1.5 px at game size: ≥ 0.04 m), some elongated along their flight
  const drops = spatter ? 22 : 9;
  for (let k = 0; k < drops; k++) {
    const a = R() * Math.PI * 2;
    const d = (rad + 0.05 + R() * (spatter ? 0.38 : 0.16)) * P;
    const r = (0.022 + R() * (spatter ? 0.035 : 0.025)) * P;
    const x0 = c + Math.cos(a) * d;
    const y0 = c + Math.sin(a) * d;
    g.save();
    g.translate(x0, y0);
    g.rotate(a);
    g.scale(1 + R() * (spatter ? 1.6 : 0.8), 1);
    g.beginPath();
    g.arc(0, 0, r, 0, Math.PI * 2);
    g.restore();
    g.fillStyle = rgba(spatter ? BLOOD_MID : BLOOD_DEEP, 0.95);
    g.fill();
  }
  if (spatter) {
    // the soak: a darker irregular stain under the spatter (the street drank it)
    g.globalCompositeOperation = "destination-over";
    blob(c, c, (rad + 0.12) * P, seed + 9, 0.9);
    g.fillStyle = "rgba(40,14,10,0.55)";
    g.fill();
    g.globalCompositeOperation = "source-over";
  }
  return shadeLiquid(src, N, SS, spatter ? 0 : 1, seed);
}
/** A small blood drop (mark), lit; px side. */
export function bakeDrop(px: number, seed: number): HTMLCanvasElement {
  const r0 = px / 2;
  return pixels(px, px, (x, y, o) => {
    const dx = (x - r0) / r0;
    const dy = (y - r0) / r0;
    const d = Math.hypot(dx * 0.9, dy * 1.1) + (fbm(dx * 3, dy * 3, seed, 2) - 0.5) * 0.35;
    if (d >= 0.8) return;
    const a = Math.min(1, (0.8 - d) * 6);
    const lit = 0.85 + 0.35 * Math.max(0, -dx * 0.6 - dy * 0.8) * (d < 0.5 ? 1 : 0);
    o[0] = BLOOD_MID[0] * lit;
    o[1] = BLOOD_MID[1] * lit;
    o[2] = BLOOD_MID[2] * lit;
    o[3] = 245 * a;
  });
}
/** A fine blood mist (matter): dark red-brown, soft, never bright. */
export const bakeMist = (px: number, seed: number): HTMLCanvasElement => bakePuff(px, [96, 24, 16], seed, 0.75);

/** A Crawler drag smear (mark): long along +x, with two or three broad soft drag streaks, relit (fresh gloss). */
export function bakeSmear(seed: number): BloodPic {
  const N = 96;
  const SS = 2;
  const sizeM = 0.7;
  const P = (N * SS) / sizeM;
  const src = make(N * SS, N * SS);
  const g = src.getContext("2d", { willReadFrequently: true })!;
  const R = rng(seed);
  const c = (N * SS) / 2;
  // the body of the smear: an elongated blob
  g.save();
  g.translate(c, c);
  const L = 0.27 * P;
  const W = 0.12 * P;
  g.beginPath();
  for (let i = 0; i <= 40; i++) {
    const a = (i / 40) * Math.PI * 2;
    const k = 1 + (fbm(Math.cos(a) * 2 + seed, Math.sin(a) * 2, seed, 3) - 0.5) * 0.5;
    const px = Math.cos(a) * L * k;
    const py = Math.sin(a) * W * k * (Math.cos(a) > 0 ? 1 : 0.75); // thicker at the front, thinning back
    if (i === 0) g.moveTo(px, py);
    else g.lineTo(px, py);
  }
  g.closePath();
  const gr = g.createLinearGradient(-L, 0, L, 0);
  gr.addColorStop(0, rgba(BLOOD_THIN, 0.55));
  gr.addColorStop(0.55, rgba(BLOOD_MID, 0.95));
  gr.addColorStop(1, rgba(BLOOD_DEEP, 1));
  g.fillStyle = gr;
  g.fill();
  // broad drag streaks (2–3, soft, ≥ 2 px at game size, not fine parallel lines)
  const n = 2 + Math.floor(R() * 2);
  for (let k = 0; k < n; k++) {
    const yy = (R() - 0.5) * W * 1.3;
    const len = L * (0.8 + R() * 0.6);
    const gr2 = g.createLinearGradient(-L * 1.2, 0, L * 0.4, 0);
    gr2.addColorStop(0, rgba(BLOOD_THIN, 0));
    gr2.addColorStop(1, rgba(BLOOD_MID, 0.85));
    g.fillStyle = gr2;
    g.beginPath();
    g.ellipse(-len * 0.25, yy, len * 0.75, 0.022 * P, 0, 0, Math.PI * 2);
    g.fill();
  }
  g.restore();
  return shadeLiquid(src, N, SS, 0.8, seed);
}

/* ---------- SWING SMEAR (matter: steel in motion, with a light glint) ---------- */
/**
 * One frame of a melee sweep: the swept part of the sector (from its start edge to the blade's angle `a1`), dense at
 * the blade and fading behind it, concentrated toward the rim (the tip moves fastest). Texture: 2·range square, the
 * wielder at the centre, facing +x. Cool steel-white air smear; `warm` = the Fire Axe (a warmer, wider band).
 */
export function bakeSweep(rangeM: number, arcRad: number, frac: number, warm: boolean): HTMLCanvasElement {
  const P = 40;
  const px = Math.ceil(rangeM * 2 * P) + 4;
  const c = px / 2;
  const half = arcRad / 2;
  const a1 = -half + arcRad * frac; // the blade's angle now
  const inner = warm ? 0.38 : 0.5;
  return pixels(px, px, (x, y, o) => {
    const mx = (x - c) / P;
    const my = (y - c) / P;
    const d = Math.hypot(mx, my) / rangeM;
    if (d > 1.02 || d < inner * 0.8) return;
    const a = Math.atan2(my, mx);
    if (a < -half - 0.02 || a > a1 + 0.04) return;
    const behind = (a1 - a) / Math.max(0.2, arcRad * 0.75); // 0 at the blade, 1 a long way behind
    const trail = Math.exp(-behind * 3.2) * (a <= a1 ? 1 : Math.max(0, 1 - (a - a1) / 0.04));
    const rad = Math.max(0, Math.min(1, (d - inner) / (1 - inner))) * Math.max(0, Math.min(1, (1.02 - d) / 0.06));
    const n = 0.8 + 0.4 * fbm(d * 6, a * 5, warm ? 3 : 2, 2);
    const al = Math.min(1, trail * Math.pow(rad, 1.3) * n * (warm ? 0.6 : 0.5));
    if (al < 0.01) return;
    // lit air smear: cool white, a little warmer near the blade on the axe
    const hot = Math.exp(-behind * 14) * rad;
    const base = warm ? [236, 222, 206] : [222, 230, 236];
    o[0] = Math.min(255, base[0] + hot * 30);
    o[1] = Math.min(255, base[1] + hot * (warm ? 10 : 22));
    o[2] = Math.min(255, base[2] + hot * (warm ? -20 : 18));
    o[3] = 255 * al;
  });
}

/* ---------- SPARKS (light) ---------- */
/** A spark streak (ADD), hot head on the right; age 0 = white-yellow, 1 = orange, 2 = dull red. */
export function bakeSpark(age: number): HTMLCanvasElement {
  return bakeTracer(32, 8, [1, 0.62, 0.32][age] as number, null);
}

/* ---------- WOOD SPLINTERS (matter, solid: lit + shadow) ---------- */
/** A broken plank chip: lit from the upper left, end grain on the broken end, with its own soft shadow down-right. */
export function bakeChip(seed: number, metal = false): HTMLCanvasElement {
  const P = 120;
  const R = rng(seed);
  const lenM = 0.16 + R() * 0.16;
  const widM = 0.05 + R() * 0.04;
  const px = Math.ceil(lenM * P * 1.4 + 10);
  const c = make(px, px);
  const g = c.getContext("2d")!;
  g.translate(px / 2, px / 2);
  g.rotate(R() * Math.PI);
  const l = (lenM * P) / 2;
  const w = (widM * P) / 2;
  const shape = (): void => {
    g.beginPath();
    g.moveTo(-l, -w);
    g.lineTo(l * 0.7, -w);
    // the broken end: jagged
    g.lineTo(l, -w * 0.3);
    g.lineTo(l * 0.82, 0);
    g.lineTo(l * 1.05, w * 0.4);
    g.lineTo(l * 0.6, w);
    g.lineTo(-l, w);
    g.closePath();
  };
  // shadow (down-right, soft)
  g.save();
  g.translate(3, 4);
  g.filter = "blur(2px)";
  shape();
  g.fillStyle = "rgba(0,0,0,0.45)";
  g.fill();
  g.restore();
  shape();
  const base = metal ? [118, 124, 130] : [139, 92, 48];
  const gr = g.createLinearGradient(0, -w, 0, w);
  gr.addColorStop(0, `rgb(${base[0] * 1.25},${base[1] * 1.22},${base[2] * 1.18})`);
  gr.addColorStop(0.5, `rgb(${base[0]},${base[1]},${base[2]})`);
  gr.addColorStop(1, `rgb(${base[0] * 0.6},${base[1] * 0.58},${base[2] * 0.55})`);
  g.fillStyle = gr;
  g.fill();
  // grain: two broad soft darker bands (not fine lines) and a pale fresh-break end
  g.save();
  g.clip();
  g.fillStyle = "rgba(60,36,18,0.25)";
  g.fillRect(-l, -w * 0.25, l * 2, w * 0.35);
  g.fillStyle = "rgba(230,196,140,0.55)";
  g.beginPath();
  g.ellipse(l * 0.85, 0, l * 0.18, w * 1.1, 0, 0, Math.PI * 2);
  g.fill();
  g.restore();
  return c;
}
/** A lit puff of sawdust / plaster (matter). */
export const bakeDust = (px: number, seed: number): HTMLCanvasElement => bakePuff(px, [128, 112, 92], seed, 0.7);
/** Gun smoke: neutral blue-grey, lit by the cool key. */
export const bakeSmoke = (px: number, seed: number): HTMLCanvasElement => bakePuff(px, [150, 156, 164], seed, 0.6);

/* ---------- "Now" helpers: flat shapes as the game's Phaser objects draw them ---------- */
export function disc(px: number, col: string): HTMLCanvasElement {
  const c = make(px, px);
  const g = c.getContext("2d")!;
  g.fillStyle = col;
  g.beginPath();
  g.arc(px / 2, px / 2, px / 2, 0, Math.PI * 2);
  g.fill();
  return c;
}
/** A stroked circle as Phaser's Arc + setStrokeStyle draws it (stroke centred on the radius); texture side = 2·(r + w/2). */
export function strokeRing(rM: number, wM: number, col: string, P = 64): HTMLCanvasElement {
  const px = Math.ceil((rM + wM / 2) * 2 * P) + 2;
  const c = make(px, px);
  const g = c.getContext("2d")!;
  g.strokeStyle = col;
  g.lineWidth = wM * P;
  g.beginPath();
  g.arc(px / 2, px / 2, rM * P, 0, Math.PI * 2);
  g.stroke();
  return c;
}
/** A Graphics.slice fill (the wedge), centre at the canvas centre, facing +x. */
export function slice(rM: number, halfRad: number, col: string, alpha: number, P = 48, inner?: { r: number; half: number; col: string; alpha: number }, edge?: { w: number; col: string; alpha: number }): HTMLCanvasElement {
  const px = Math.ceil(rM * 2 * P) + 4;
  const c = make(px, px);
  const g = c.getContext("2d")!;
  const o = px / 2;
  g.fillStyle = col;
  g.globalAlpha = alpha;
  g.beginPath();
  g.moveTo(o, o);
  g.arc(o, o, rM * P, -halfRad, halfRad);
  g.closePath();
  g.fill();
  if (inner) {
    g.fillStyle = inner.col;
    g.globalAlpha = inner.alpha;
    g.beginPath();
    g.moveTo(o, o);
    g.arc(o, o, inner.r * P, -inner.half, inner.half);
    g.closePath();
    g.fill();
  }
  if (edge) {
    g.strokeStyle = edge.col;
    g.globalAlpha = edge.alpha;
    g.lineWidth = edge.w * P;
    g.beginPath();
    g.arc(o, o, (rM - edge.w / 2) * P, -halfRad, halfRad);
    g.stroke();
  }
  return c;
}
/** A white silhouette of a picture (Phaser setTint(0xffffff) + TintModes.FILL). */
export function silhouette(src: HTMLCanvasElement, col = "#ffffff"): HTMLCanvasElement {
  const c = make(src.width, src.height);
  const g = c.getContext("2d")!;
  g.drawImage(src, 0, 0);
  g.globalCompositeOperation = "source-in";
  g.fillStyle = col;
  g.fillRect(0, 0, c.width, c.height);
  return c;
}
