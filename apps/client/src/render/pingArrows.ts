import { MAX_PLAYERS } from "@topdown/shared";
import { PAIR_GAP_CSS_PX } from "./eventArrowPair";
import { CENTRE_CLEAR_CSS_PX, layoutRightButtons, newRightButtonsLayout, rectCentreGap } from "../scenes/consumableButton";
import { EVENT_ARROW_MAX_BEARING_ERR_RAD, eventArrowDrawnRect, placeEventArrow, type EventArrowPlace, type Insets, type ScreenRect } from "./eventArrow";
import type { PingModel } from "./pingModel";
import { BUILD_BAR_SLOTS, layoutBuildBar, newBuildBarLayout, readyLeftX } from "../scenes/buildBar";
import { layoutUndoChip } from "../scenes/undoChip";
import { layoutPingWheel, newPingChipRects } from "../scenes/pingWheel";
import { layoutEvacVote } from "../ui/voteModel";
import { READY_BUTTON_BOTTOM_CSS_PX, READY_BUTTON_H_CSS_PX, READY_BUTTON_W_CSS_PX } from "../ui/sizes";

/** Story 8.7 (AC 7): a ping's edge arrow size (CSS px): its disc (× 0.7) holds the kind icon at 24 px. */
export const PING_ARROW_CSS_PX = 34;

/**
 * How many HUD keep-offs a placement takes: `waveControlRects` (8, with the ping button) + the mode's own controls
 * (`fillPingKeepOffs`, review M3 / L6 / L7). With the event arrow and 3 placed ping arrows that is ≤ 24 rects, the
 * placement's obstacle capacity (`eventArrow.ts` `MAX_NOTCHES`).
 */
export const PING_CONTROL_RECTS = 20;
const CONTROL_RECTS = PING_CONTROL_RECTS;

/**
 * Story 8.7 (AC 6; B12): the world icon — a disc `PING_ICON_CSS_PX` across, lifted `PING_LIFT_CSS_PX` over the ping
 * point, its word `PING_WORD_CSS_PX` tall × `PING_WORD_W_CSS_PX` wide above it. Review M1: a ping counts as on screen
 * only when this whole icon + word rect is inside the safe area and the disc is off every keep-off; else it gets an arrow.
 */
export const PING_ICON_CSS_PX = 34;
export const PING_WORD_CSS_PX = 20;
export const PING_WORD_W_CSS_PX = 90;
export const PING_LIFT_CSS_PX = 76;

/** The icon + word rect (canvas px) of a ping at screen point (sx, sy), into `out`. */
export function pingIconRect(sx: number, sy: number, k: number, out: ScreenRect): ScreenRect {
  const half = (Math.max(PING_ICON_CSS_PX, PING_WORD_W_CSS_PX) / 2) * k;
  out.x = sx - half;
  out.w = 2 * half;
  out.y = sy - (PING_LIFT_CSS_PX + PING_ICON_CSS_PX / 2 + PING_WORD_CSS_PX) * k;
  out.h = (PING_ICON_CSS_PX + PING_WORD_CSS_PX) * k;
  return out;
}
const iconScratch: ScreenRect = { x: 0, y: 0, w: 0, h: 0 };

/**
 * Review M1: the icon is seen — the whole icon + word inside the safe area, and the icon's disc under no keep-off. (The
 * word may run over a text block's reserve, e.g. the HP row's room for 5 gear icons at 568 × 320: my own ping, at the
 * screen centre, stays an icon there; a 3rd re-review point if the designer wants the word clear too.)
 */
function iconVisible(sx: number, sy: number, sw: number, sh: number, insets: Insets, k: number, keepOffs: readonly ScreenRect[]): boolean {
  const r = pingIconRect(sx, sy, k, iconScratch);
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
  /** Decision 8.7 B16: the keep-offs without the build-phase controls, and their avoid lists (same sharing). */
  readonly controlsLite: ScreenRect[];
  readonly avoidLite: ScreenRect[][];
  /** Per slot: this frame's arrow used the lite keep-offs (B16: it may lie over a build-phase control). */
  readonly lite: boolean[];
  /** Per slot: the ping is seen as its world icon this frame (review M1). */
  readonly icon: boolean[];
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
  const controlsLite = Array.from({ length: CONTROL_RECTS }, () => ({ x: 0, y: 0, w: 0, h: 0 }));
  const avoidLite: ScreenRect[][] = [];
  for (let n = 0; n < MAX_PLAYERS; n++) avoidLite.push([...controlsLite, event, ...drawn.slice(0, n)]);
  return {
    at: Array.from({ length: MAX_PLAYERS }, () => ({ x: 0, y: 0, angle: 0, side: 0 })),
    shown: Array.from({ length: MAX_PLAYERS }, () => false),
    drawn,
    controls,
    event,
    avoid,
    controlsLite,
    avoidLite,
    lite: Array.from({ length: MAX_PLAYERS }, () => false),
    icon: Array.from({ length: MAX_PLAYERS }, () => false),
    sizePx: PING_ARROW_CSS_PX,
    besideSpot: Array.from({ length: MAX_PLAYERS }, () => 0),
    besideOf: Array.from({ length: MAX_PLAYERS }, () => -1),
  };
}

const OFF = -1e6;
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

/**
 * Story 8.7 (AC 7, R3): places the edge arrow of every live ping whose point is off screen (or under a HUD block), by
 * the 6.8 event-arrow rule (`placeEventArrow`: inside the safe area, ≤ 30° bearing error, off every control, 48 px
 * clear of the survivor, the 40 px / 10° jump hysteresis), in slot order, each one also keeping `PAIR_GAP_CSS_PX` off
 * the arrows placed before it and off the event arrow (`eventArrow`, its drawn rect, or null).
 */
function copyRects(src: readonly ScreenRect[], dst: ScreenRect[]): void {
  for (let i = 0; i < dst.length; i++) {
    const r = src[i];
    const d = dst[i] as ScreenRect;
    if (r) {
      d.x = r.x;
      d.y = r.y;
      d.w = r.w;
      d.h = r.h;
    } else {
      d.x = d.y = OFF; // fewer rects given: parked far off screen (ignored by the placement)
      d.w = d.h = 0;
    }
  }
}

/**
 * `lite` (decision 8.7 B16): the keep-offs without the build-phase controls (`fillPingKeepOffs`' second output). When
 * the full set leaves no spot within 30° of the bearing (568 × 320 / 640 × 360 in a build phase: the build bar, its
 * row and Ready fill the lower right; the open wheel the upper right for ≤ 3 s), the arrow is placed again keeping off
 * only `lite`: it keeps its bearing and may lie under a build-phase control or the wheel instead of pointing up to 160°
 * the wrong way.
 */
export function placePingArrows(model: PingModel, vx: number, vy: number, pxPerM: number, sw: number, sh: number, insets: Insets, k: number, controls: readonly ScreenRect[], eventArrow: Readonly<ScreenRect> | null, out: PingArrows, lite: readonly ScreenRect[] | null = null): PingArrows {
  const size = PING_ARROW_CSS_PX * k;
  out.sizePx = size;
  copyRects(controls, out.controls);
  copyRects(lite ?? controls, out.controlsLite);
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
  // Review M1: first, which pings are seen as icons (the icon's disc, grown by the pair gap, is a keep-off for the
  // arrows: an arrow never lands on a seen icon); then the arrows of the others.
  let placed = 0;
  for (let i = 0; i < MAX_PLAYERS; i++) {
    const p = model.live(i);
    out.icon[i] = false;
    if (!p) continue;
    const sx = (p.x - vx) * pxPerM;
    const sy = (p.y - vy) * pxPerM;
    if (!iconVisible(sx, sy, sw, sh, insets, k, out.controls)) continue;
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
    let shown = false;
    if (out.icon[i]) at.side = 0;
    else {
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
      shown = placeEventArrow(sw / 2 + dx * FAR_PX, sh / 2 + dy * FAR_PX, sw, sh, insets, k, size, avoid, at);
    }
    out.shown[i] = shown;
    if (!shown) {
      out.besideSpot[i] = 0;
      continue;
    }
    // Crowding (several pings on one bearing, 568 × 320's corners): when the 6.8 spot is over 30° off, the arrow sits
    // right beside one placed before it instead (the 6.10 pair rule's spots), held while legal and ≤ 30°.
    if (placed > 0) besideFallback(i, placed, sw, sh, insets, k, size, avoid, out);
    out.lite[i] = false;
    if (shown && lite && angErr(Math.atan2(at.y - sh / 2, at.x - sw / 2), at.angle) > EVENT_ARROW_MAX_BEARING_ERR_RAD + 1e-9) {
      const avoidLite = out.avoidLite[placed] as ScreenRect[];
      placeEventArrow(sw / 2 + Math.cos(at.angle) * FAR_PX, sh / 2 + Math.sin(at.angle) * FAR_PX, sw, sh, insets, k, size, avoidLite, at);
      if (placed > 0) besideFallback(i, placed, sw, sh, insets, k, size, avoidLite, out);
      out.lite[i] = true;
    }
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

/**
 * Story 8.7 review M3 / L6 / L7: which of the mode's own controls the ping arrows keep off this frame (all fixed
 * layouts the HUD draws with). Flag / loot: the 6.10 flag arrow's and the loot badge's drawn rects, or null.
 */
export interface PingKeepOffMode {
  /** The build bar is up (its tiles incl. Shop, the build-row swap / quick-use, the undo chip). */
  build: boolean;
  ready: boolean;
  /** The evacuation vote (Extract / Stay). */
  vote: boolean;
  /** The ping wheel is open (its chips). */
  wheel: boolean;
  flag: Readonly<ScreenRect> | null;
  loot: Readonly<ScreenRect> | null;
}

const barScratch = newBuildBarLayout();
const rowScratch = newRightButtonsLayout();
const undoScratch = { x: 0, y: 0, size: 0 };
const chipScratch = newPingChipRects();
const voteCache = { w: -1, h: -1, b: -1, k: -1, ex: { x: 0, y: 0, w: 0, h: 0 }, st: { x: 0, y: 0, w: 0, h: 0 } };

function put(out: ScreenRect[], i: number, x: number, y: number, w: number, h: number): number {
  const r = out[i] as ScreenRect;
  r.x = x;
  r.y = y;
  r.w = w;
  r.h = h;
  return i + 1;
}

/**
 * Fills `out` (`PING_CONTROL_RECTS` rects) with `base` (`waveControlRects`, 8) and then the mode's controls; the rest
 * are parked far off screen. No allocation once warm (the vote layout is cached per screen size).
 */
export function fillPingKeepOffs(base: readonly ScreenRect[], mode: Readonly<PingKeepOffMode>, w: number, h: number, insets: Insets, k: number, out: ScreenRect[], outLite: ScreenRect[] | null = null): ScreenRect[] {
  let n = 0;
  for (let i = 0; i < base.length && n < out.length; i++) {
    const b = base[i] as ScreenRect;
    n = put(out, n, b.x, b.y, b.w, b.h);
  }
  const nBase = n;
  if (mode.build) {
    const bar = layoutBuildBar(w, h, insets.right, insets.bottom, k, barScratch);
    let x0 = Infinity;
    let y0 = Infinity;
    let x1 = -Infinity;
    let y1 = -Infinity;
    for (let s = 0; s < BUILD_BAR_SLOTS; s++) {
      x0 = Math.min(x0, bar.x[s] as number);
      y0 = Math.min(y0, bar.y[s] as number);
      x1 = Math.max(x1, (bar.x[s] as number) + bar.tile);
      y1 = Math.max(y1, (bar.y[s] as number) + bar.tile);
    }
    n = put(out, n, x0, y0, x1 - x0, y1 - y0);
    const row = layoutRightButtons(w, h, insets.right, insets.bottom, k, true, bar.left, bar.top, rowScratch, bar.countX);
    n = put(out, n, row.swapX, row.swapY, row.size, row.size);
    n = put(out, n, row.consX, row.consY, row.size, row.size);
    const u = layoutUndoChip(w, h, insets.right, insets.bottom, bar.left, bar.top, bar.countX, k, false, undoScratch);
    n = put(out, n, u.x, u.y, u.size, u.size);
  }
  if (mode.ready) {
    const bar = layoutBuildBar(w, h, insets.right, insets.bottom, k, barScratch);
    const rw = READY_BUTTON_W_CSS_PX * k;
    const rh = READY_BUTTON_H_CSS_PX * k;
    n = put(out, n, readyLeftX(w, rw, bar.left, k), h - (READY_BUTTON_BOTTOM_CSS_PX + insets.bottom) * k - rh, rw, rh);
  }
  if (mode.wheel) {
    const chips = layoutPingWheel(w, insets, k, chipScratch);
    const a = chips[0];
    const d = chips[3];
    const x0 = Math.min(a.x, chips[1].x);
    n = put(out, n, x0, a.y, Math.max(a.x + a.w, chips[1].x + chips[1].w) - x0, d.y + d.h - a.y);
  }
  const nBuild = n; // [nBase, nBuild): the build-phase controls and the open wheel (B16's lite set leaves them out)
  if (mode.vote) {
    const c = voteCache;
    if (c.w !== w || c.h !== h || c.b !== insets.bottom || c.k !== k) {
      const v = layoutEvacVote(w / k, h / k, insets.bottom); // CSS px (the DOM panel)
      Object.assign(c, { w, h, b: insets.bottom, k });
      Object.assign(c.ex, { x: v.extract.x * k, y: v.extract.y * k, w: v.extract.w * k, h: v.extract.h * k });
      Object.assign(c.st, { x: v.stay.x * k, y: v.stay.y * k, w: v.stay.w * k, h: v.stay.h * k });
    }
    n = put(out, n, c.ex.x, c.ex.y, c.ex.w, c.ex.h);
    n = put(out, n, c.st.x, c.st.y, c.st.w, c.st.h);
  }
  if (mode.flag) n = put(out, n, mode.flag.x, mode.flag.y, mode.flag.w, mode.flag.h);
  if (mode.loot) n = put(out, n, mode.loot.x, mode.loot.y, mode.loot.w, mode.loot.h);
  for (let i = n; i < out.length; i++) put(out, i, OFF, OFF, 0, 0);
  if (outLite) {
    let j = 0;
    for (let i = 0; i < n; i++) {
      if (i >= nBase && i < nBuild) continue;
      const r = out[i] as ScreenRect;
      j = put(outLite, j, r.x, r.y, r.w, r.h);
    }
    for (let i = j; i < outLite.length; i++) put(outLite, i, OFF, OFF, 0, 0);
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

export function newPingKeepOffs(): ScreenRect[] {
  return Array.from({ length: PING_CONTROL_RECTS }, () => ({ x: 0, y: 0, w: 0, h: 0 }));
}
