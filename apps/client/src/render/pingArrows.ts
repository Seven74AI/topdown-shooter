import { MAX_PLAYERS } from "@topdown/shared";
import { PAIR_GAP_CSS_PX } from "./eventArrowPair";
import { CENTRE_CLEAR_CSS_PX, rectCentreGap } from "../scenes/consumableButton";
import { EVENT_ARROW_MAX_BEARING_ERR_RAD, eventArrowDrawnRect, placeEventArrow, type EventArrowPlace, type Insets, type ScreenRect } from "./eventArrow";
import type { PingModel } from "./pingModel";

/** Story 8.7 (AC 7): a ping's edge arrow size (CSS px): its disc (× 0.7) holds the kind icon at 24 px. */
export const PING_ARROW_CSS_PX = 34;

/** How many HUD keep-offs a placement takes (`waveControlRects` with the ping button). */
const CONTROL_RECTS = 8;

/**
 * The preallocated placement state of the four ping arrows (brief 7: nothing allocated per frame). `at[i]` keeps slot
 * i's hysteresis (6.8: one placement object per arrow); `avoid[i]` is the keep-off list for slot i — the HUD
 * controls, the event arrow, then the arrows placed before it this frame (grown by `PAIR_GAP_CSS_PX`), sharing rects.
 */
export interface PingArrows {
  readonly at: EventArrowPlace[];
  readonly shown: boolean[];
  /** The drawn rect of each placed arrow (grown by the pair gap): a later arrow keeps off it. */
  readonly drawn: ScreenRect[];
  readonly controls: ScreenRect[];
  readonly event: ScreenRect;
  readonly avoid: ScreenRect[][];
  /** The arrow size used last frame (canvas px). */
  sizePx: number;
  /** Per slot: the beside spot held (1–8 beside `besideOf`'s arrow), 0 = its own 6.8 spot. */
  readonly besideSpot: number[];
  readonly besideOf: number[];
}

export function newPingArrows(): PingArrows {
  const controls = Array.from({ length: CONTROL_RECTS }, () => ({ x: 0, y: 0, w: 0, h: 0 }));
  const event = { x: 0, y: 0, w: 0, h: 0 };
  const drawn = Array.from({ length: MAX_PLAYERS }, () => ({ x: 0, y: 0, w: 0, h: 0 }));
  // avoid[n] = controls + event + the first n drawn rects (slot order of placement this frame)
  const avoid: ScreenRect[][] = [];
  for (let n = 0; n < MAX_PLAYERS; n++) avoid.push([...controls, event, ...drawn.slice(0, n)]);
  return {
    at: Array.from({ length: MAX_PLAYERS }, () => ({ x: 0, y: 0, angle: 0, side: 0 })),
    shown: Array.from({ length: MAX_PLAYERS }, () => false),
    drawn,
    controls,
    event,
    avoid,
    sizePx: PING_ARROW_CSS_PX,
    besideSpot: Array.from({ length: MAX_PLAYERS }, () => 0),
    besideOf: Array.from({ length: MAX_PLAYERS }, () => -1),
  };
}

const OFF = -1e6;
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

/**
 * Story 8.7 (AC 7, R3): places the edge arrow of every live ping whose point is off screen (or under a HUD block), by
 * the 6.8 event-arrow rule (`placeEventArrow`: inside the safe area, ≤ 30° bearing error, off every control, 48 px
 * clear of the survivor, the 40 px / 10° jump hysteresis), in slot order, each one also keeping `PAIR_GAP_CSS_PX` off
 * the arrows placed before it and off the event arrow (`eventArrow`, its drawn rect, or null).
 */
export function placePingArrows(model: PingModel, vx: number, vy: number, pxPerM: number, sw: number, sh: number, insets: Insets, k: number, controls: readonly ScreenRect[], eventArrow: Readonly<ScreenRect> | null, out: PingArrows): PingArrows {
  const size = PING_ARROW_CSS_PX * k;
  out.sizePx = size;
  for (let i = 0; i < CONTROL_RECTS; i++) {
    const src = controls[i];
    const d = out.controls[i] as ScreenRect;
    if (src) {
      d.x = src.x;
      d.y = src.y;
      d.w = src.w;
      d.h = src.h;
    } else d.x = d.y = OFF; // fewer controls given: parked far off screen (ignored by the placement)
  }
  const ev = out.event;
  if (eventArrow) {
    ev.x = eventArrow.x - PAIR_GAP_CSS_PX * k;
    ev.y = eventArrow.y - PAIR_GAP_CSS_PX * k;
    ev.w = eventArrow.w + 2 * PAIR_GAP_CSS_PX * k;
    ev.h = eventArrow.h + 2 * PAIR_GAP_CSS_PX * k;
  } else {
    ev.x = ev.y = OFF;
    ev.w = ev.h = 0;
  }
  let placed = 0;
  for (let i = 0; i < MAX_PLAYERS; i++) {
    const p = model.live(i);
    const at = out.at[i] as EventArrowPlace;
    if (!p) {
      at.side = 0; // a new ping starts its hysteresis fresh
      out.shown[i] = false;
      continue;
    }
    const sx = (p.x - vx) * pxPerM;
    const sy = (p.y - vy) * pxPerM;
    const avoid = out.avoid[placed] as ScreenRect[];
    const shown = placeEventArrow(sx, sy, sw, sh, insets, k, size, avoid, at);
    out.shown[i] = shown;
    if (!shown) {
      out.besideSpot[i] = 0;
      continue;
    }
    // Crowding (several pings on one bearing, 568 × 320's corners): when the 6.8 spot is over 30° off, the arrow sits
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
