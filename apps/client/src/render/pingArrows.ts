import { MAX_PLAYERS } from "@topdown/shared";
import { PAIR_GAP_CSS_PX } from "./eventArrowPair";
import { CENTRE_CLEAR_CSS_PX, rectCentreGap } from "../scenes/consumableButton";
import { EVENT_ARROW_MAX_BEARING_ERR_RAD, eventArrowDrawnRect, placeEventArrow, type EventArrowPlace, type Insets, type ScreenRect } from "./eventArrow";
import type { PingModel } from "./pingModel";
import { HP_BAR_H, HP_MARGIN, HP_TEXT_PX, HP_TEXT_RESERVE_CSS_PX, LINE_HEIGHT, hudBandTop, hudTextWidths, layoutHpBar, layoutMoneyLine, layoutWaveLine } from "../scenes/hudTopLayout";

/** Story 8.7 (AC 7): a ping's edge arrow size (CSS px): its disc (× 0.7) holds the kind icon at 24 px. */
export const PING_ARROW_CSS_PX = 34;


/**
 * Story 8.7 (AC 6; B12): the world icon — a disc `PING_ICON_CSS_PX` across, lifted `PING_LIFT_CSS_PX` over the ping
 * point, its word `PING_WORD_CSS_PX` tall × `PING_WORD_W_CSS_PX` wide above it. Review M1: a ping counts as on screen
 * only when this whole icon + word rect is inside the safe area and the disc is off every keep-off; else it gets an arrow.
 */
export const PING_ICON_CSS_PX = 34;
export const PING_WORD_CSS_PX = 20;
export const PING_WORD_W_CSS_PX = 90;
export const PING_LIFT_CSS_PX = 76;

/** The icon + word rect (canvas px) of a ping at screen point (sx, sy), into `out`; `below`: the word under the disc (B17). */
export function pingIconRect(sx: number, sy: number, k: number, out: ScreenRect, below = false): ScreenRect {
  const half = (Math.max(PING_ICON_CSS_PX, PING_WORD_W_CSS_PX) / 2) * k;
  out.x = sx - half;
  out.w = 2 * half;
  out.y = sy - (PING_LIFT_CSS_PX + PING_ICON_CSS_PX / 2 + (below ? 0 : PING_WORD_CSS_PX)) * k;
  out.h = (PING_ICON_CSS_PX + PING_WORD_CSS_PX) * k;
  return out;
}

/** The word box alone (canvas px), above the disc. */
function wordAboveRect(sx: number, sy: number, k: number, out: ScreenRect): ScreenRect {
  out.x = sx - (PING_WORD_W_CSS_PX / 2) * k;
  out.w = PING_WORD_W_CSS_PX * k;
  out.y = sy - (PING_LIFT_CSS_PX + PING_ICON_CSS_PX / 2 + PING_WORD_CSS_PX) * k;
  out.h = PING_WORD_CSS_PX * k;
  return out;
}

const textRects: ScreenRect[] = [0, 1, 2, 3].map(() => ({ x: 0, y: 0, w: 0, h: 0 }));
const textInsets = { left: 0, right: 0, top: 0, bottom: 0 };

/**
 * Decision 8.7 B17 (re-review L2): the HUD's drawn text blocks — the HP bar, the HP text (measured width, not the gear
 * reserve), the money line and the wave line — into `textRects`.
 */
function hudTextBlocks(sw: number, insets: Insets, k: number): readonly ScreenRect[] {
  Object.assign(textInsets, insets);
  layoutHpBar(textInsets, k, textRects[0] as ScreenRect);
  const t = textRects[1] as ScreenRect;
  t.x = (HP_MARGIN + insets.left - 2) * k;
  t.y = (HP_MARGIN + hudBandTop(insets.top) + HP_BAR_H + 2) * k;
  t.w = ((hudTextWidths.hpText > 0 ? hudTextWidths.hpText : HP_TEXT_RESERVE_CSS_PX) + 4) * k;
  t.h = (2 + HP_TEXT_PX * LINE_HEIGHT) * k;
  layoutMoneyLine(textInsets, k, textRects[2] as ScreenRect);
  layoutWaveLine(sw, textInsets, k, textRects[3] as ScreenRect);
  return textRects;
}
const wordScratch: ScreenRect = { x: 0, y: 0, w: 0, h: 0 };

/** B17: the word goes under the disc when, above it, it would run over drawn HUD text. */
export function pingWordBelow(sx: number, sy: number, sw: number, insets: Insets, k: number): boolean {
  const r = wordAboveRect(sx, sy, k, wordScratch);
  for (const o of hudTextBlocks(sw, insets, k)) if (r.x < o.x + o.w && o.x < r.x + r.w && r.y < o.y + o.h && o.y < r.y + r.h) return true;
  return false;
}
const iconScratch: ScreenRect = { x: 0, y: 0, w: 0, h: 0 };

/**
 * Review M1: the icon is seen — the whole icon + word inside the safe area, and the icon's disc under no keep-off. (The
 * word may run over a text block's reserve, e.g. the HP row's room for 5 gear icons at 568 × 320: my own ping, at the
 * screen centre, stays an icon there; a 3rd re-review point if the designer wants the word clear too.)
 */
function iconVisible(sx: number, sy: number, sw: number, sh: number, insets: Insets, k: number, keepOffs: readonly ScreenRect[], below: boolean): boolean {
  const r = pingIconRect(sx, sy, k, iconScratch, below);
  if (r.x < insets.left * k || r.y < insets.top * k || r.x + r.w > sw - insets.right * k || r.y + r.h > sh - insets.bottom * k) return false;
  const half = (PING_ICON_CSS_PX / 2) * k;
  r.x = sx - half;
  r.w = 2 * half;
  r.y = sy - PING_LIFT_CSS_PX * k - half;
  r.h = 2 * half;
  for (let i = 0; i < keepOffs.length; i++) {
    const o = keepOffs[i] as ScreenRect;
    if (r.x < o.x + o.w && o.x < r.x + r.w && r.y < o.y + o.h && o.y < r.y + r.h) return false;
  }
  return true;
}

/**
 * The preallocated placement state of the four ping arrows (brief 7: nothing allocated per frame). `at[i]` keeps slot
 * i's hysteresis (6.8: one placement object per arrow). Decision 8.7 B16 (designer 2026-11-25): ping arrows sit UNDER the
 * HUD — the HUD's buttons and tiles are semi-transparent — so they keep off no HUD control; `avoid[n]` holds only the
 * other arrows (the event arrow, the 6.10 flag arrow, the loot badge) and the n seen icons / arrows placed before it this
 * frame (grown by `PAIR_GAP_CSS_PX`), sharing rects. `hud` (the wave controls, ☰ and the ping button) only decides
 * whether a ping's icon is seen (review M1).
 */
export interface PingArrows {
  readonly at: EventArrowPlace[];
  readonly shown: boolean[];
  /** The drawn rect of each placed arrow / seen icon disc (grown by the pair gap): a later arrow keeps off it. */
  readonly drawn: ScreenRect[];
  /** The HUD rects a seen icon must be clear of (review M1; not keep-offs for the arrows, B16). */
  readonly hud: ScreenRect[];
  /** The other arrows' drawn rects (event, flag, loot badge), grown by the pair gap; parked far off when absent. */
  readonly others: ScreenRect[];
  /**
   * Story 10.2 B4 (D6): per slot, the teammate edge arrow's rect (`teammateArrowRect`), grown by the pair gap; parked
   * far off when that teammate has no arrow, or when their own ping shows as an edge arrow (it stands in for their
   * arrow: 8.7 review M2).
   */
  readonly mates: ScreenRect[];
  readonly avoid: ScreenRect[][];
  /** Per slot: the ping is seen as its world icon this frame (review M1). */
  readonly icon: boolean[];
  /** Per slot: B17 — the icon's word is drawn under the disc (above it would run over HUD text). */
  readonly wordBelow: boolean[];
  /** The arrow size used last frame (canvas px). */
  sizePx: number;
  /** Per slot: the beside spot held (1–8 beside `besideOf`'s arrow), 0 = its own 6.8 spot. */
  readonly besideSpot: number[];
  readonly besideOf: number[];
}

/** HUD rects for the icon check (`waveControlRects`: 8). */
const HUD_RECTS = 8;
/** Other arrows kept off: the event arrow, the 6.10 flag arrow, the loot badge. */
export const PING_OTHER_ARROWS = 3;

export function newPingArrows(): PingArrows {
  const others = Array.from({ length: PING_OTHER_ARROWS }, () => ({ x: 0, y: 0, w: 0, h: 0 }));
  const mates = Array.from({ length: MAX_PLAYERS }, () => ({ x: 0, y: 0, w: 0, h: 0 }));
  const drawn = Array.from({ length: MAX_PLAYERS }, () => ({ x: 0, y: 0, w: 0, h: 0 }));
  // avoid[n] = the other arrows + the teammate arrows (10.2 B4) + the first n drawn rects (slot order of placement this frame)
  const avoid: ScreenRect[][] = [];
  for (let n = 0; n < MAX_PLAYERS; n++) avoid.push([...others, ...mates, ...drawn.slice(0, n)]);
  return {
    at: Array.from({ length: MAX_PLAYERS }, () => ({ x: 0, y: 0, angle: 0, side: 0 })),
    shown: Array.from({ length: MAX_PLAYERS }, () => false),
    drawn,
    hud: Array.from({ length: HUD_RECTS }, () => ({ x: 0, y: 0, w: 0, h: 0 })),
    others,
    mates,
    avoid,
    icon: Array.from({ length: MAX_PLAYERS }, () => false),
    wordBelow: Array.from({ length: MAX_PLAYERS }, () => false),
    sizePx: PING_ARROW_CSS_PX,
    besideSpot: Array.from({ length: MAX_PLAYERS }, () => 0),
    besideOf: Array.from({ length: MAX_PLAYERS }, () => -1),
  };
}

const OFF = -1e6;
const NO_MATES: readonly null[] = [];
/** A point this far out along the bearing is off every screen (the arrow placement's "off screen" input). */
const FAR_PX = 1e5;
const DIR_X = [0, 0, -1, 1];
const DIR_Y = [-1, 1, 0, 0];
const cand = { x: 0, y: 0, angle: 0 };
const candRect: ScreenRect = { x: 0, y: 0, w: 0, h: 0 };
const baseRect: ScreenRect = { x: 0, y: 0, w: 0, h: 0 };

const angErr = (a: number, b: number): number => Math.abs(Math.atan2(Math.sin(a - b), Math.cos(a - b)));

/** Is an arrow centred at (x, y), tip along `angle`, legal: inside the safe area, off every keep-off, clear of the survivor? */
function legal(x: number, y: number, angle: number, sw: number, sh: number, insets: Insets, k: number, size: number, avoid: readonly ScreenRect[]): boolean {
  cand.x = x;
  cand.y = y;
  cand.angle = angle;
  const r = eventArrowDrawnRect(cand, size, candRect);
  if (r.x < insets.left * k || r.y < insets.top * k || r.x + r.w > sw - insets.right * k || r.y + r.h > sh - insets.bottom * k) return false;
  for (let i = 0; i < avoid.length; i++) {
    const o = avoid[i] as ScreenRect;
    if (r.x < o.x + o.w && o.x < r.x + r.w && r.y < o.y + o.h && o.y < r.y + r.h) return false;
  }
  return rectCentreGap(r.x, r.y, r.w, r.h, sw / 2, sh / 2) >= CENTRE_CLEAR_CSS_PX * k - 1e-6;
}

/** Spot c (1–8: up, down, left, right, then two steps out) beside placed arrow `j`'s centre, into cand.x / cand.y. */
function spot(c: number, j: number, size: number, k: number, out: PingArrows): void {
  const d = (c - 1) % 4;
  const mult = c > 4 ? 2 : 1;
  const a = out.at[j] as EventArrowPlace;
  const r = eventArrowDrawnRect(a, size, baseRect);
  const gap = PAIR_GAP_CSS_PX * k;
  cand.x = a.x + (DIR_X[d] as number) * (r.w + gap) * mult;
  cand.y = a.y + (DIR_Y[d] as number) * (r.h + gap) * mult;
}

function besideFallback(i: number, placed: number, sw: number, sh: number, insets: Insets, k: number, size: number, avoid: readonly ScreenRect[], out: PingArrows): void {
  const at = out.at[i] as EventArrowPlace;
  const bearing = at.angle;
  const cx = sw / 2;
  const cy = sh / 2;
  const max = EVENT_ARROW_MAX_BEARING_ERR_RAD;
  // the held beside spot first (no flicker between it and the own spot while it still works)
  const hj = out.besideOf[i] as number;
  const hc = out.besideSpot[i] as number;
  if (hc > 0 && hj >= 0 && out.shown[hj] && hj !== i) {
    spot(hc, hj, size, k, out);
    const x = cand.x;
    const y = cand.y;
    if (angErr(Math.atan2(y - cy, x - cx), bearing) <= max && legal(x, y, bearing, sw, sh, insets, k, size, avoid)) {
      at.x = x;
      at.y = y;
      return;
    }
  }
  out.besideSpot[i] = 0;
  if (angErr(Math.atan2(at.y - cy, at.x - cx), bearing) <= max) return; // its own spot keeps the rule
  let bestErr = Infinity;
  let bestJ = -1;
  let bestC = 0;
  for (let j = 0; j < i; j++) {
    if (!out.shown[j]) continue;
    for (let c = 1; c <= 8; c++) {
      spot(c, j, size, k, out);
      const x = cand.x;
      const y = cand.y;
      const e = angErr(Math.atan2(y - cy, x - cx), bearing);
      if (e < bestErr && legal(x, y, bearing, sw, sh, insets, k, size, avoid)) {
        bestErr = e;
        bestJ = j;
        bestC = c;
      }
    }
  }
  if (bestJ < 0 || bestErr > max) return; // nowhere better: its own spot (the 6.8 fallback)
  spot(bestC, bestJ, size, k, out);
  at.x = cand.x;
  at.y = cand.y;
  out.besideOf[i] = bestJ;
  out.besideSpot[i] = bestC;
}
const drawnScratch: ScreenRect = { x: 0, y: 0, w: 0, h: 0 };

function copyRect(src: Readonly<ScreenRect> | null | undefined, d: ScreenRect, grow: number): void {
  if (src) {
    d.x = src.x - grow;
    d.y = src.y - grow;
    d.w = src.w + 2 * grow;
    d.h = src.h + 2 * grow;
  } else {
    d.x = d.y = OFF; // absent: parked far off screen (ignored by the placement)
    d.w = d.h = 0;
  }
}

/**
 * Story 8.7 (AC 7, R3; B16 as decided by the designer 2026-11-25): places the edge arrow of every live ping whose icon
 * isn't seen (review M1), by the 6.8 event-arrow rule (`placeEventArrow`: inside the safe area, 48 px clear of the
 * survivor, the 40 px / 10° jump hysteresis) with NO HUD control as a keep-off — so at its true bearing — in slot order,
 * each keeping `PAIR_GAP_CSS_PX` off the other arrows (`others`: event arrow, flag arrow, loot badge; null = none), the
 * seen icons' discs and the arrows placed before it; crowded on one bearing, the "beside" fallback (B7).
 * Story 10.2 B4 (D6): `mates[slot]` (null = none) is the teammate edge arrow drawn for that slot this frame
 * (`teammateArrowRect`); the ping arrows keep the pair gap off it too, except the slot's own (its ping arrow stands in).
 */
export function placePingArrows(model: PingModel, vx: number, vy: number, pxPerM: number, sw: number, sh: number, insets: Insets, k: number, hud: readonly ScreenRect[], others: readonly (Readonly<ScreenRect> | null)[], out: PingArrows, mates: readonly (Readonly<ScreenRect> | null)[] = NO_MATES): PingArrows {
  const size = PING_ARROW_CSS_PX * k;
  out.sizePx = size;
  for (let i = 0; i < HUD_RECTS; i++) copyRect(hud[i], out.hud[i] as ScreenRect, 0);
  for (let i = 0; i < PING_OTHER_ARROWS; i++) copyRect(others[i], out.others[i] as ScreenRect, PAIR_GAP_CSS_PX * k);
  // Review M1: first, which pings are seen as icons (the icon's disc, grown by the pair gap, is a keep-off for the
  // arrows: an arrow never lands on a seen icon); then the arrows of the others.
  let placed = 0;
  for (let i = 0; i < MAX_PLAYERS; i++) {
    const p = model.live(i);
    out.icon[i] = false;
    if (!p) continue;
    const sx = (p.x - vx) * pxPerM;
    const sy = (p.y - vy) * pxPerM;
    out.wordBelow[i] = pingWordBelow(sx, sy, sw, insets, k); // B17
    if (!iconVisible(sx, sy, sw, sh, insets, k, out.hud, out.wordBelow[i] as boolean)) continue;
    out.icon[i] = true;
    // the icon's disc (not its word box: a wide word at the screen centre would block every bearing straight up)
    const d = out.drawn[placed] as ScreenRect;
    const half = (PING_ICON_CSS_PX / 2) * k;
    d.x = sx - half;
    d.y = sy - PING_LIFT_CSS_PX * k - half;
    d.w = d.h = 2 * half;
    growRect(d, PAIR_GAP_CSS_PX * k);
    placed++;
  }
  // 10.2 B4: the teammate arrows, but not the one of a slot whose ping gets an arrow (HudScene hides that one, M2)
  for (let i = 0; i < MAX_PLAYERS; i++) copyRect(model.live(i) && !out.icon[i] ? null : mates[i], out.mates[i] as ScreenRect, PAIR_GAP_CSS_PX * k);
  for (let i = 0; i < MAX_PLAYERS; i++) {
    const p = model.live(i);
    const at = out.at[i] as EventArrowPlace;
    if (!p || out.icon[i]) {
      at.side = 0; // a new ping (or one seen again) starts its hysteresis fresh
      out.shown[i] = false;
      out.besideSpot[i] = 0;
      continue;
    }
    const sx = (p.x - vx) * pxPerM;
    const sy = (p.y - vy) * pxPerM;
    const avoid = out.avoid[placed] as ScreenRect[];
    let dx = sx - sw / 2;
    let dy = sy - sh / 2;
    const len = Math.hypot(dx, dy);
    if (len < 1e-6) {
      dx = 0;
      dy = -1; // my own ping right under me with its icon hidden: point up, where the icon is
    } else {
      dx /= len;
      dy /= len;
    }
    out.shown[i] = placeEventArrow(sw / 2 + dx * FAR_PX, sh / 2 + dy * FAR_PX, sw, sh, insets, k, size, avoid, at);
    // Crowding (several pings on one bearing, 568 × 320's corners): when the spot is over 30° off, the arrow sits
    // right beside one placed before it instead (the 6.10 pair rule's spots), held while legal and ≤ 30°.
    if (placed > 0) besideFallback(i, placed, sw, sh, insets, k, size, avoid, out);
    const r = eventArrowDrawnRect(at, size, drawnScratch);
    const d = out.drawn[placed] as ScreenRect;
    d.x = r.x - PAIR_GAP_CSS_PX * k;
    d.y = r.y - PAIR_GAP_CSS_PX * k;
    d.w = r.w + 2 * PAIR_GAP_CSS_PX * k;
    d.h = r.h + 2 * PAIR_GAP_CSS_PX * k;
    placed++;
  }
  return out;
}

/** Grows `r` by `d` on every side (in place). */
export function growRect(r: ScreenRect, d: number): ScreenRect {
  r.x -= d;
  r.y -= d;
  r.w += 2 * d;
  r.h += 2 * d;
  return r;
}
