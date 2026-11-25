import { CENTRE_CLEAR_CSS_PX, rectCentreGap } from "../scenes/consumableButton";
import { EVENT_ARROW_MAX_BEARING_ERR_RAD, eventArrowDrawnRect, placeEventArrow, type EventArrowPlace, type Insets, type ScreenRect } from "./eventArrow";

/**
 * Story 6.10 (review L11, re-review RR1–RR3): the survivor shows two edge arrows at once (the NPC
 * and its white flag). Kept simple:
 *
 * 1. The flag's arrow is placed by 6.8's own rule (`placeEventArrow`: safe area, off the wave
 *    controls / HP block / wave line, ≥ 48 px from the survivor, within 30° of its bearing, with its
 *    OWN `EventArrowPlace` and hysteresis).
 * 2. Only when that spot would overlap the NPC arrow's drawn rect, the flag sits right BESIDE the NPC
 *    arrow (above / below / left / right, or two steps out), every 6.8 rule kept, the legal spot
 *    closest to its bearing (within 30°). The spot is held while the flag's own spot stays within
 *    the NPC rect + a margin, so a bearing jittering on the rect's edge never flips it frame to frame
 *    (6.8 RR3-1's hold idea).
 *
 * No allocation: fixed rects; the hold lives in the caller's `PairHold`.
 */
export interface PairHold {
  /** 1–8: the flag sits at that spot beside the NPC arrow (`trySpot`); 0: at its own spot. */
  side: number;
}

export function createPairHold(): PairHold {
  return { side: 0 };
}

/** Gap between the two drawn arrows (CSS px). */
export const PAIR_GAP_CSS_PX = 4;
/** The hold keeps the beside-spot while the flag's own rect is within the NPC rect grown by this (CSS px). */
export const PAIR_HOLD_CSS_PX = 24;

const rn: ScreenRect = { x: 0, y: 0, w: 0, h: 0 };
const rf: ScreenRect = { x: 0, y: 0, w: 0, h: 0 };
const cand: ScreenRect = { x: 0, y: 0, w: 0, h: 0 };
const probe = { x: 0, y: 0, angle: 0 };
/** The flag's bearing while its spots are tried. */
let probeAngle = 0;

function bearingErr(x: number, y: number, angle: number, w: number, h: number): number {
  const d = Math.atan2(y - h / 2, x - w / 2) - angle;
  return Math.abs(Math.atan2(Math.sin(d), Math.cos(d)));
}

function overlapGrown(a: ScreenRect, b: ScreenRect, m: number): boolean {
  return a.x < b.x + b.w + m && b.x < a.x + a.w + m && a.y < b.y + b.h + m && b.y < a.y + a.h + m;
}

/** The drawn arrow at (x, y) pointing `angle` keeps every 6.8 rule (safe area, keep-offs, survivor gap). */
function legalAt(x: number, y: number, angle: number, w: number, h: number, insets: Insets, k: number, size: number, avoid: readonly ScreenRect[]): boolean {
  probe.x = x;
  probe.y = y;
  probe.angle = angle;
  const r = eventArrowDrawnRect(probe, size, cand);
  if (r.x < insets.left * k || r.y < insets.top * k || r.x + r.w > w - insets.right * k || r.y + r.h > h - insets.bottom * k) return false;
  for (let i = 0; i < avoid.length; i++) if (overlapGrown(r, avoid[i] as ScreenRect, 0)) return false;
  return rectCentreGap(r.x, r.y, r.w, r.h, w / 2, h / 2) >= CENTRE_CLEAR_CSS_PX * k;
}

export function placeSecondEventArrow(
  sx: number,
  sy: number,
  w: number,
  h: number,
  insets: Insets,
  k: number,
  size: number,
  avoid: readonly ScreenRect[],
  first: Readonly<EventArrowPlace> | null,
  out: EventArrowPlace,
  hold: PairHold,
): boolean {
  if (!placeEventArrow(sx, sy, w, h, insets, k, size, avoid, out)) {
    hold.side = 0;
    return false;
  }
  if (!first) {
    hold.side = 0;
    return true;
  }
  eventArrowDrawnRect(first, size, rn);
  eventArrowDrawnRect(out, size, rf);
  probeAngle = out.angle;
  const gap = PAIR_GAP_CSS_PX * k;
  const clash = overlapGrown(rf, rn, gap);
  if (!clash && !(hold.side !== 0 && overlapGrown(rf, rn, PAIR_HOLD_CSS_PX * k))) {
    hold.side = 0;
    return true;
  }
  // Re-review RR1: the spots right beside the NPC arrow — above, below, left, right, then the same two
  // steps out (a notch beside the HUD buttons can block one or two). Keep the held one while it is
  // legal and within 30° of the flag's bearing; else the legal one closest to the flag's bearing.
  if (hold.side > 0 && trySpot(hold.side, first, w, h, insets, k, size, avoid, out, gap) <= EVENT_ARROW_MAX_BEARING_ERR_RAD) return true;
  let best = 0;
  let bestErr = Infinity;
  for (let c = 1; c <= SPOTS; c++) {
    const e = trySpot(c, first, w, h, insets, k, size, avoid, null, gap);
    if (e < bestErr) {
      bestErr = e;
      best = c;
    }
  }
  if (best > 0) {
    trySpot(best, first, w, h, insets, k, size, avoid, out, gap);
    hold.side = best;
  } else hold.side = 0; // nowhere beside it (never on the tested layouts): its own spot
  return true;
}

/** 1–8: up, down, left, right, then two steps out each way. */
const SPOTS = 8;
const DIR_X = [0, 0, -1, 1];
const DIR_Y = [-1, 1, 0, 0];

/** Spot `c` beside `first`: its bearing error when legal (Infinity when not); writes `out` when given. */
function trySpot(c: number, first: Readonly<EventArrowPlace>, w: number, h: number, insets: Insets, k: number, size: number, avoid: readonly ScreenRect[], out: EventArrowPlace | null, gap: number): number {
  const d = (c - 1) % 4;
  const mult = c > 4 ? 2 : 1;
  const dx = DIR_X[d] as number;
  const dy = DIR_Y[d] as number;
  const x = first.x + dx * (rn.w + gap) * mult;
  const y = first.y + dy * (rn.h + gap) * mult;
  const angle = out ? out.angle : probeAngle;
  if (!legalAt(x, y, angle, w, h, insets, k, size, avoid)) return Infinity;
  if (out) {
    out.x = x;
    out.y = y;
  }
  return bearingErr(x, y, angle, w, h);
}
