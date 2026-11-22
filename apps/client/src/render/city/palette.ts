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

/**
 * The light state of each decay stage (designer, 2026-11-22: a run is one night, no day-night
 * cycle; index = stage − 1). Stage 1 dusk (a little blue left in the sky, warm shop light), 2 full
 * night, 3 deep night with full rain, 4–5 darker placeholders until Epic 6 (blackout, fog).
 * - `ambient`: what unlit ground keeps of its colour (the lightmap, multiplied).
 * - `roofLight`: the fixed light on roofs (streetlights hang below them, D6); kept high so roofs
 *   stay readable at every stage (the contrast test checks each stage).
 * - `topLightA`: moonlight on the top faces of cover (cars, bus, pumps).
 * - `lampA`: streetlight pool strength; `spillK`: × every shop window's spill (shops go dark).
 * - `sky`/`skyA`: an even glow added over the street (the dusk sky's blue).
 * - `rain`: rain strength (0–1) for the view.
 */
export interface NightLight {
  readonly name: string;
  readonly ambient: string;
  readonly roofLight: string;
  readonly topLightA: number;
  readonly lampA: number;
  readonly spillK: number;
  readonly sky: string;
  readonly skyA: number;
  readonly rain: number;
}
export const NIGHT_BY_STAGE: readonly NightLight[] = [
  { name: "dusk", ambient: "124,134,172", roofLight: "236,242,255", topLightA: 0.32, lampA: 0.5, spillK: 1.1, sky: "40,64,120", skyA: 0.1, rain: 0.5 },
  { name: "night", ambient: "104,114,140", roofLight: "236,240,255", topLightA: 0.3, lampA: 0.62, spillK: 1, sky: "0,0,0", skyA: 0, rain: 0.5 },
  { name: "deep night", ambient: "84,92,118", roofLight: "222,228,248", topLightA: 0.26, lampA: 0.62, spillK: 0.8, sky: "0,0,0", skyA: 0, rain: 1 },
  { name: "late night", ambient: "72,78,102", roofLight: "212,218,240", topLightA: 0.22, lampA: 0.6, spillK: 0.6, sky: "0,0,0", skyA: 0, rain: 1 },
  { name: "before dawn", ambient: "62,66,88", roofLight: "204,210,234", topLightA: 0.2, lampA: 0.58, spillK: 0.45, sky: "0,0,0", skyA: 0, rain: 1 },
];
/** The light state at `stage` (clamped to the table). */
export function nightAt(stage: number): NightLight {
  return NIGHT_BY_STAGE[Math.min(NIGHT_BY_STAGE.length, Math.max(1, Math.round(stage))) - 1] as NightLight;
}
/** Moonlight colour on cover tops. */
export const TOP_LIGHT = "120,130,155";
/** Streetlight pool colour and radius (map px, 32 per metre); its strength is `NightLight.lampA`. */
export const LAMP = "255,165,85";
export const LAMP_FLICKER_A = 0.1;
export const LAMP_R_PX = 185;
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

/** Contrast margin (0–255 luma) a roof keeps over the brightest lit sidewalk (tested on the real lightmap). */
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

/** Shadow length (map px) of an object `heightM` tall. */
export function shadowLenPx(heightM: number): number {
  return Math.min(SHADOW_MAX_PX, heightM * SHADOW_PX_PER_M);
}
