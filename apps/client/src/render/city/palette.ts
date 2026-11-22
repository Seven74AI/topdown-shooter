/**
 * Story 4.9: the Dead City palette and light levels (look B of `downtown-look-study.html`), in one
 * block, plus the pure luminance helpers its contrast test uses. Colours are "#rrggbb"; light colours
 * are "r,g,b" strings (they go into `rgba(...)`); light strengths are 0–1.
 */

export const GROUND = {
  asphalt: "#1c1d20",
  alley: "#161719",
  sidewalk: "#2d2d2e",
  forecourt: "#28292a",
  lot: "#1e1f22",
  curb: "#4b4b48",
  joint: "rgba(0,0,0,0.32)",
  lane: "rgba(190,160,60,0.45)",
  zebra: "rgba(205,205,195,0.28)",
  lotLine: "rgba(205,205,195,0.3)",
} as const;

/**
 * Roof colours by building name (Downtown) and the fallback. Brighter than the study's (+~35 %), so
 * roofs stay clearly above the brightest lit sidewalk (designer's weakness #1; see `roofMarginOk`).
 */
export const ROOF_DEFAULT = "#7e7b75";
export const ROOFS: Readonly<Record<string, string>> = {
  nw_corner_shop: "#80776a",
  nw_apartments: "#757882",
  gas_kiosk: "#7a7f79",
  sw_diner: "#837469",
  se_offices: "#777c84",
  se_warehouse: "#81796f",
};

/** Lightmap (MULTIPLY over the street): what unlit ground keeps of its colour. */
export const AMBIENT = "104,114,140";
/** Fixed light on building roofs (moonlight; streetlights hang below the roofs, D6). */
export const ROOF_LIGHT = "236,240,255";
/** Moonlight added on the top faces of cover (cars, bus, pumps…), so they stay lighter than the floor. */
export const TOP_LIGHT = "120,130,155";
export const TOP_LIGHT_A = 0.3;
/** Streetlight pool: colour, strength at the centre, radius (map px, 32 per metre). */
export const LAMP = "255,165,85";
export const LAMP_A = 0.62;
export const LAMP_FLICKER_A = 0.1;
export const LAMP_R_PX = 185;
/** Strongest shop-window spill (dressing values are ≤ this). */
export const SPILL_MAX_A = 0.75;
/** Glow (ADD): lamp-head core radius, and the soft tail that falls on the ground under a lamp. */
export const LAMP_GLOW = "255,190,110";
export const LAMP_GLOW_A = 0.5;
export const LAMP_GLOW_R_PX = 22;
export const LAMP_TAIL = "255,170,90";
export const LAMP_TAIL_A = 0.06;
/** A wide faint warm halo around each lamp (ADD): the pool reads on dark asphalt, where MULTIPLY alone cannot brighten. */
export const LAMP_HALO_A = 0.07;
export const LAMP_HALO_R_PX = 110;
/** Spill glow on the ground = spill strength × this. */
export const SPILL_GLOW_K = 0.12;

/** One light direction for every cast shadow (upper-left light, shadows fall right-down). */
export const LIGHT_DIR = { x: 0.55, y: 0.83 } as const;
/** Shadow length per metre of height (map px), and its cap. */
export const SHADOW_PX_PER_M = 5.5;
export const SHADOW_MAX_PX = 60;

/** Contrast margin (0–255 luma) a roof keeps over the brightest lit sidewalk. */
export const ROOF_MARGIN = 18;

// ---------------------------------------------------------------------------
// Pure helpers
// ---------------------------------------------------------------------------

export type Rgb = readonly [number, number, number];

export function hexRgb(hex: string): Rgb {
  const n = parseInt(hex.slice(1), 16);
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
}

export function lightRgb(light: string): Rgb {
  const p = light.split(",").map(Number);
  return [p[0] ?? 0, p[1] ?? 0, p[2] ?? 0];
}

/** Rec. 709 luma of a 0–255 colour. */
export function luma(c: Rgb): number {
  return 0.2126 * c[0] + 0.7152 * c[1] + 0.0722 * c[2];
}

/** `surface` under a light (0–255 per channel, a MULTIPLY), plus an additive glow; clamped. */
export function lit(surface: Rgb, light: Rgb, glow: Rgb = [0, 0, 0]): Rgb {
  const ch = (i: 0 | 1 | 2): number => Math.min(255, (surface[i] * Math.min(255, light[i])) / 255 + glow[i]);
  return [ch(0), ch(1), ch(2)];
}

const add = (a: Rgb, b: Rgb, k: number): Rgb => [a[0] + b[0] * k, a[1] + b[1] * k, a[2] + b[2] * k];

/** The brightest a sidewalk gets: ambient + a lamp's centre + the strongest spill, plus their glow tails. */
export function brightestSidewalk(): Rgb {
  const light = add(add(lightRgb(AMBIENT), lightRgb(LAMP), LAMP_A), [255, 196, 120], SPILL_MAX_A);
  const glow = add(add([0, 0, 0], lightRgb(LAMP_TAIL), LAMP_TAIL_A + LAMP_HALO_A), [255, 196, 120], SPILL_MAX_A * SPILL_GLOW_K);
  return lit(hexRgb(GROUND.sidewalk), light, glow);
}

/** A roof as shown: its colour under `ROOF_LIGHT` (nothing else lights roofs). */
export function roofShown(roofHex: string): Rgb {
  return lit(hexRgb(roofHex), lightRgb(ROOF_LIGHT));
}

/** Weakness #1 guard: every roof's shown luma beats the brightest sidewalk by `ROOF_MARGIN`. */
export function roofMarginOk(roofHex: string): boolean {
  return luma(roofShown(roofHex)) >= luma(brightestSidewalk()) + ROOF_MARGIN;
}

/** Shadow length (map px) of an object `heightM` tall. */
export function shadowLenPx(heightM: number): number {
  return Math.min(SHADOW_MAX_PX, heightM * SHADOW_PX_PER_M);
}
