/**
 * Story 4.12: the soft particle sprites of the code-drawn fire (designer pick: fire-lab panel "D —
 * fuel flames, no pool", `docs/art/4-12/fire-lab.html`), as pure pixel maths (no DOM, no Phaser):
 * the lab's noise, its ragged flame masks and puffy smoke masks, the flame colour ramp and the smoke
 * palettes. `fireFxAtlas.ts` turns the masks into one canvas atlas ONCE per page; the masks are
 * white with the shape in alpha, and the game tints each particle (multiply tint) with the ramp or
 * palette colour of its age, exactly as the lab's pre-tinted copies.
 */

/** Mask sizes (px): flame and smoke sprites, and their shape variants. */
export const FLAME_SPRITE_PX = 96;
export const FLAME_VARIANTS = 4;
export const SMOKE_SPRITE_PX = 96;
export const SMOKE_VARIANTS = 3;
/** Colour steps over a flame's life (white-yellow → orange → deep red) and smoke tones over a puff's life. */
export const FLAME_STEPS = 16;
export const SMOKE_TONES = 6;
/** Linear filtering can spread a texel of alpha ≥ 50 % by under a texel: the margin added to the measured core (lab: + 0.02). */
export const CORE_MARGIN = 0.02;

function hash(n: number): number {
  const s = Math.sin(n) * 43758.5453;
  return s - Math.floor(s);
}
const clamp = (v: number, a: number, b: number): number => (v < a ? a : v > b ? b : v);
const lerp = (a: number, b: number, t: number): number => a + (b - a) * t;

function vnoise(x: number, y: number, s: number): number {
  const xi = Math.floor(x);
  const yi = Math.floor(y);
  const xf = x - xi;
  const yf = y - yi;
  const u = xf * xf * (3 - 2 * xf);
  const v = yf * yf * (3 - 2 * yf);
  const h = (a: number, b: number): number => hash(a * 127.1 + b * 311.7 + s * 74.7);
  return lerp(lerp(h(xi, yi), h(xi + 1, yi), u), lerp(h(xi, yi + 1), h(xi + 1, yi + 1), u), v);
}

/** The lab's fractal noise (4 octaves, 0..1). */
export function fbm(x: number, y: number, s: number): number {
  let a = 0;
  let amp = 0.5;
  let f = 1;
  for (let o = 0; o < 4; o++) {
    a += amp * vnoise(x * f, y * f, s + o * 13);
    f *= 2.03;
    amp *= 0.5;
  }
  return a / 0.9375;
}

/** One flame shape (FS × FS alpha, 0..1, row-major): a ragged noisy soft blob. */
export function flameMask(variant: number, size = FLAME_SPRITE_PX): Float32Array {
  const m = new Float32Array(size * size);
  const v = variant;
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      const dx = ((x + 0.5) / size) * 2 - 1;
      const dy = ((y + 0.5) / size) * 2 - 1;
      const r = Math.hypot(dx, dy);
      const an = Math.atan2(dy, dx);
      const n = fbm(Math.cos(an) * 1.7 + v * 5.1 + r * 1.4, Math.sin(an) * 1.7 + r * 2.3, 11 + v * 7);
      const rr = r * (0.72 + 0.62 * n);
      let a = Math.pow(clamp(1 - rr, 0, 1), 1.15) * 1.45;
      const q = fbm(dx * 4.2 + v * 9, dy * 4.2 - v * 3, 3 + v);
      a *= clamp(0.25 + 1.25 * q * q * 1.6, 0, 1.3);
      m[y * size + x] = clamp(a, 0, 1);
    }
  }
  return m;
}

/** One smoke shape: a puffy noisy blob. */
export function smokeMask(variant: number, size = SMOKE_SPRITE_PX): Float32Array {
  const m = new Float32Array(size * size);
  const v = variant;
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      const dx = ((x + 0.5) / size) * 2 - 1;
      const dy = ((y + 0.5) / size) * 2 - 1;
      const r = Math.hypot(dx, dy);
      const an = Math.atan2(dy, dx);
      const n = fbm(Math.cos(an) * 1.2 + v * 4.3, Math.sin(an) * 1.2 + v * 2.1, 40 + v);
      const rr = r * (0.75 + 0.5 * n);
      let a = clamp((1 - rr) / 0.6, 0, 1);
      a = a * a * (3 - 2 * a);
      const q = fbm(dx * 2.6 + v * 7, dy * 2.6, 60 + v);
      a *= 0.25 + 1.9 * q * q;
      m[y * size + x] = clamp(a, 0, 1);
    }
  }
  return m;
}

/**
 * The radius (fraction of the sprite's half size) inside which the mask's alpha reaches 50 %: the
 * flame's bright core. Every texel with alpha ≥ 0.5 lies within it (its centre radius).
 */
export function maskCoreFrac(mask: Float32Array, size: number): number {
  let core = 0;
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      if ((mask[y * size + x] as number) < 0.5) continue;
      const r = Math.hypot(((x + 0.5) / size) * 2 - 1, ((y + 0.5) / size) * 2 - 1);
      if (r > core) core = r;
    }
  }
  return core;
}

let flames: Float32Array[] | null = null;
let core = -1;

/** The four flame masks (computed once per page: ~37 k texels of noise). */
export function flameMasks(): readonly Float32Array[] {
  if (!flames) flames = Array.from({ length: FLAME_VARIANTS }, (_, v) => flameMask(v));
  return flames;
}

/**
 * The flame's core fraction used by the edge rule (largest over the variants + `CORE_MARGIN`):
 * a flame drawn L long has its bright part within `FLAME_CORE * L / 2` of its centre.
 */
export function flameCoreFrac(): number {
  if (core < 0) {
    let c = 0;
    for (const m of flameMasks()) c = Math.max(c, maskCoreFrac(m, FLAME_SPRITE_PX));
    core = Math.min(1, c + CORE_MARGIN);
  }
  return core;
}

/** The lab's flame colour ramp: [position, r, g, b]. */
const RAMP: readonly (readonly [number, number, number, number])[] = [
  [0, 255, 246, 214],
  [0.1, 255, 220, 125],
  [0.27, 255, 158, 52],
  [0.48, 240, 96, 24],
  [0.7, 168, 42, 12],
  [1, 74, 13, 6],
];

/** The ramp's colour at t (0..1) as 0xRRGGBB. */
export function flameRampColor(t: number): number {
  const tt = clamp(t, 0, 1);
  for (let i = 1; i < RAMP.length; i++) {
    const b = RAMP[i] as readonly [number, number, number, number];
    if (tt <= b[0]) {
      const a = RAMP[i - 1] as readonly [number, number, number, number];
      const u = (tt - a[0]) / (b[0] - a[0]);
      return rgb(lerp(a[1], b[1], u), lerp(a[2], b[2], u), lerp(a[3], b[3], u));
    }
  }
  const l = RAMP[RAMP.length - 1] as readonly [number, number, number, number];
  return rgb(l[1], l[2], l[3]);
}

function rgb(r: number, g: number, b: number): number {
  return (Math.round(r) << 16) | (Math.round(g) << 8) | Math.round(b);
}

/** The flame tint per life step (`FLAME_STEPS`), built once. */
export const FLAME_TINTS: readonly number[] = Array.from({ length: FLAME_STEPS }, (_, s) => flameRampColor(s / (FLAME_STEPS - 1)));

/** Smoke tones per palette (young smoke is lit warm from below): "black" for the car fire (D), "dark" for a burning survivor. */
export const SMOKE_PALETTES = {
  black: [rgb(120, 82, 56), rgb(70, 58, 50), rgb(50, 46, 44), rgb(42, 40, 40), rgb(37, 36, 37), rgb(34, 34, 36)],
  dark: [rgb(150, 112, 84), rgb(104, 92, 84), rgb(84, 80, 79), rgb(72, 70, 71), rgb(62, 61, 63), rgb(56, 56, 59)],
} as const satisfies Record<string, readonly number[]>;
export type SmokePalette = keyof typeof SMOKE_PALETTES;

/** Radial colour stops of the round sprites: [offset, r, g, b, a]. */
export type RadialStops = readonly (readonly [number, number, number, number, number])[];
/** A spark: hot white centre, orange falloff. */
export const EMBER_STOPS: RadialStops = [
  [0, 255, 246, 210, 1],
  [0.18, 255, 200, 110, 0.9],
  [0.45, 255, 130, 40, 0.25],
  [1, 255, 90, 20, 0],
];
/** The fire's ground light: drawn 2R wide it ends exactly at the zone edge (peak alpha < 0.5 once scaled by the view). */
export const FIRE_LIGHT_STOPS: RadialStops = [
  [0, 255, 160, 70, 1],
  [0.5, 255, 118, 40, 0.62],
  [0.9, 235, 80, 25, 0.36],
  [0.985, 220, 70, 20, 0.18],
  [1, 220, 70, 20, 0],
];
