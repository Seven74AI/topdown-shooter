import type { DistrictMap } from "@topdown/shared";

/** Story 6.11 (AC 9): the helicopter's pose over time, pure (no Phaser): `HeliView` draws it. */
export const DESCEND_S = 2;
export const LIFT_S = 2;
export const EXTRACT_FLY_S = 4;
/** The rotor's spin (rad/s; the look page's 14). */
export const ROTOR_RAD_S = 14;
/** Searchlight sweep (the look page: `sin(T × 0.5) × 0.8 + 0.4` rad, 7 × 5 m ellipse) and its pool radius (m). */
export const BEAM_SWEEP_HZ = 0.5;
export const BEAM_RX_M = 7;
export const BEAM_RY_M = 5;
export const BEAM_R_M = 3.2;
/** Extract climb: +9 m east, −11 m north, × 1.7 bigger (closer to the camera), as the dawn card draws it. */
const EXTRACT_DX_M = 9;
const EXTRACT_DY_M = -11;
const EXTRACT_GROW = 0.7;
/** Descent: starts this much bigger (high above) and fades in. */
const DESCEND_GROW = 0.8;

export type HeliPhase = "gone" | "descending" | "landed" | "lifting" | "extracting";

export interface HeliPose {
  phase: HeliPhase;
  /** Offset from the pad centre (m), scale (1 = on the pad) and alpha. */
  dx: number;
  dy: number;
  scale: number;
  alpha: number;
}

const smooth = (t: number): number => {
  const u = Math.min(1, Math.max(0, t));
  return u * u * (3 - 2 * u);
};

/**
 * Pure: the helicopter at `nowS` given when the vote opened and when (and how) it left (−1 = not yet).
 * The descent always starts at `openedAtS`; a phone that wakes late sees it landed (no replay).
 */
export function heliPose(nowS: number, openedAtS: number, leftAtS: number, extract: boolean, out: HeliPose): HeliPose {
  out.dx = 0;
  out.dy = 0;
  out.scale = 1;
  out.alpha = 1;
  if (openedAtS < 0) {
    out.phase = "gone";
    out.alpha = 0;
    return out;
  }
  if (leftAtS >= 0 && nowS >= leftAtS) {
    const t = nowS - leftAtS;
    const len = extract ? EXTRACT_FLY_S : LIFT_S;
    if (t >= len) {
      out.phase = "gone";
      out.alpha = 0;
      return out;
    }
    const u = smooth(t / len);
    if (extract) {
      out.phase = "extracting";
      out.dx = EXTRACT_DX_M * u;
      out.dy = EXTRACT_DY_M * u;
      out.scale = 1 + EXTRACT_GROW * u;
      out.alpha = 1 - Math.max(0, (u - 0.6) / 0.4);
    } else {
      out.phase = "lifting";
      out.scale = 1 + DESCEND_GROW * u;
      out.alpha = 1 - u;
    }
    return out;
  }
  const t = nowS - openedAtS;
  if (t < DESCEND_S) {
    const u = smooth(t / DESCEND_S);
    out.phase = "descending";
    out.scale = 1 + DESCEND_GROW * (1 - u);
    out.alpha = Math.min(1, u * 2);
    return out;
  }
  out.phase = "landed";
  return out;
}

/** The pad centre: the map's `evac_pad` event spot (6.8's layer), else the map centre. */
export function evacPadOf(map: Readonly<DistrictMap>): { x: number; y: number } {
  const spots = (map as { eventSpots?: readonly { name: string; x: number; y: number }[] }).eventSpots;
  const pad = spots?.find((s) => s.name === "evac_pad");
  return pad ? { x: pad.x, y: pad.y } : { x: map.widthM / 2, y: map.heightM / 2 };
}

