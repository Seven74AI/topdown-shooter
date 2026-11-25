import { CENTRE_CLEAR_CSS_PX, layoutRightButtons, newRightButtonsLayout, rectCentreGap } from "../scenes/consumableButton";
import { MENU_BUTTON_CSS_PX, MENU_BUTTON_INSET_CSS_PX } from "../ui/sizes";
import { layoutHpBlock, layoutWaveLine } from "../scenes/hudTopLayout";

/**
 * Story 6.8 review M2 (brief 31): where the event edge arrow sits on the SCREEN. Not pressable, but it
 * must stay inside the safe area, off every wave-mode control (☰, swap, quick-use) and — re-review R1 —
 * off the HP block and the wave line (readable), and ≥ 48 px from the survivor at the centre — the one HUD layout test checks it (`scenes/hudLayout.test.ts`). Pure, no
 * allocation per call (the caller passes the records).
 *
 * Re-review 2 RR1: the arrow (a square of side `size` px, disc + tip) sits ON the ray from the centre
 * toward the event's screen point (sx, sy) — its bearing is the true one — at the ray's exit from a
 * NOTCHED safe rectangle: the safe area shrunk by size / 2 + `pad`, with every wide HUD band along an
 * edge (the HP block, the wave line; inflated by the same amount) cut out as a notch, its depth the
 * band's far side. Compact controls (☰, swap, quick-use) are obstacles (below). The
 * notch's ends are chamfered so that every piece of the boundary faces the centre: the region is
 * star-shaped from the centre, so the exit point moves continuously with the bearing (no jump, no
 * hysteresis needed) and one bisection finds it.
 */
export interface ScreenRect {
  x: number;
  y: number;
  w: number;
  h: number;
}
export interface Insets {
  readonly left: number;
  readonly right: number;
  readonly top: number;
  readonly bottom: number;
}

/** Gap between the arrow and the safe-area edge / a control (CSS px × k). */
export const EVENT_ARROW_PAD_CSS_PX = 6;

/**
 * What the arrow keeps off in a wave (the same layout functions / constants HudScene draws with), into
 * `out` (5 rects): ☰, swap, quick-use, then (re-review R1) the HP block and the wave line.
 */
export function waveControlRects(w: number, h: number, insets: Insets, k: number, out: ScreenRect[]): ScreenRect[] {
  const ms = MENU_BUTTON_CSS_PX * k;
  const menu = out[0] as ScreenRect;
  menu.x = w - (MENU_BUTTON_INSET_CSS_PX + insets.right) * k - ms;
  menu.y = (MENU_BUTTON_INSET_CSS_PX + insets.top) * k;
  menu.w = menu.h = ms;
  const r = layoutRightButtons(w, h, insets.right, insets.bottom, k, false, 0, 0, rightScratch);
  const swap = out[1] as ScreenRect;
  swap.x = r.swapX;
  swap.y = r.swapY;
  swap.w = swap.h = r.size;
  const cons = out[2] as ScreenRect;
  cons.x = r.consX;
  cons.y = r.consY;
  cons.w = cons.h = r.size;
  layoutHpBlock(insets, k, out[3] as ScreenRect);
  layoutWaveLine(w, insets, k, out[4] as ScreenRect);
  return out;
}
const rightScratch = newRightButtonsLayout();

export function newWaveControlRects(): ScreenRect[] {
  return [0, 1, 2, 3, 4].map(() => ({ x: 0, y: 0, w: 0, h: 0 }));
}

/** The arrow's placement (kept by the caller across frames: `side` is the hysteresis state). */
export interface EventArrowPlace {
  x: number;
  y: number;
  /** The true bearing to the event (the tip points along it). */
  angle: number;
  /** Hysteresis state: 1 once placed (x, y are last frame's), 0 before / after an on-screen frame. */
  side?: number;
}

/** Re-review 2 RR1: the most the arrow's bearing (from the survivor) may differ from the event's. */
export const EVENT_ARROW_MAX_BEARING_ERR_RAD = (30 * Math.PI) / 180;
const SEARCH_STEP_RAD = (0.25 * Math.PI) / 180;

/**
 * The arrow's centre for an event at screen point (sx, sy) into `out`; false (no arrow) when the
 * point is on screen. `avoid`: the HUD rects (`waveControlRects`).
 *
 * On the bearing's own ray when its exit point keeps the drawn arrow ≥ `CENTRE_CLEAR_CSS_PX` from the
 * survivor and stays off the compact blocks. Where one straddles the bearing (the swap / quick-use
 * pair sits across the centre row), no point of that ray qualifies: the arrow takes the nearest ray that
 * does, at most 30° off. Hysteresis: of the nearest clear ray each way, it takes the one nearer
 * where it was last frame, so it crosses a blocked fan with one jump instead of flickering at its middle.
 */
export function placeEventArrow(sx: number, sy: number, w: number, h: number, insets: Insets, k: number, size: number, avoid: readonly ScreenRect[], out: EventArrowPlace): boolean {
  // Re-review R2: "on screen" = inside the SAFE rectangle and not under a HUD block (a point under the
  // notch inset, ☰ or the HP block can't be seen: it gets an arrow).
  if (sx >= insets.left * k && sx <= w - insets.right * k && sy >= insets.top * k && sy <= h - insets.bottom * k && !underAny(sx, sy, avoid)) {
    out.side = 0;
    return false;
  }
  const half = size / 2 + EVENT_ARROW_PAD_CSS_PX * k;
  rg.L = insets.left * k + half;
  rg.R = w - insets.right * k - half;
  rg.T = insets.top * k + half;
  rg.B = h - insets.bottom * k - half;
  rg.cx = w / 2;
  rg.cy = h / 2;
  rg.size = size;
  rg.clear = CENTRE_CLEAR_CSS_PX * k;
  const bearing = Math.atan2(sy - rg.cy, sx - rg.cx);
  out.angle = bearing;
  buildNotches(avoid, half, rg.L, rg.R, rg.T, rg.B, rg.cx, rg.cy, Math.max(4, NOTCH_CHAMFER_MARGIN_CSS_PX * k));
  const hadPrev = out.side === 1;
  const prevX = out.x;
  const prevY = out.y;
  out.side = 1;
  if (exitClear(bearing, bearing)) {
    out.x = rg.x;
    out.y = rg.y;
    return true;
  }
  // the nearest clear ray each way (≤ 30°); hysteresis: the one nearer where the arrow was last frame
  const max = EVENT_ARROW_MAX_BEARING_ERR_RAD;
  const dp = searchSide(bearing, 1, max);
  const px = rg.x;
  const py = rg.y;
  const dm = searchSide(bearing, -1, max);
  if (dp < 0 && dm < 0) {
    // never on a phone layout (test): the nearest clear ray anywhere
    for (let d = SEARCH_STEP_RAD; d <= Math.PI; d += SEARCH_STEP_RAD) if (exitClear(bearing + d, bearing) || exitClear(bearing - d, bearing)) break;
  } else if (dm < 0 || (dp >= 0 && (hadPrev ? Math.hypot(px - prevX, py - prevY) <= Math.hypot(rg.x - prevX, rg.y - prevY) : dp <= dm))) {
    rg.x = px;
    rg.y = py;
  }
  out.x = rg.x;
  out.y = rg.y;
  return true;
}

/** Scratch for one placement (no allocation per call). */
const rg = { L: 0, R: 0, T: 0, B: 0, cx: 0, cy: 0, size: 0, clear: 0, x: 0, y: 0 };
const drawnScratch: ScreenRect = { x: 0, y: 0, w: 0, h: 0 };
const atScratch = { x: 0, y: 0, angle: 0 };

/** The smallest offset d ≤ max (radians) whose ray `bearing + side·d` is clear (its exit in rg.x / rg.y), or −1. */
function searchSide(bearing: number, side: number, max: number): number {
  for (let d = SEARCH_STEP_RAD; d <= max + 1e-9; d += SEARCH_STEP_RAD) if (exitClear(bearing + side * d, bearing)) return d;
  return -1;
}

/**
 * Where the arrow goes on the ray at `ray`, into rg.x / rg.y: the exit of the notched region (star-
 * shaped from the centre; bisection), pulled back out of any obstacle; true when the arrow drawn there
 * (tip along `tipAngle`) clears the survivor.
 */
function exitClear(ray: number, tipAngle: number): boolean {
  const dx = Math.cos(ray);
  const dy = Math.sin(ray);
  const s = Math.min(dx > 1e-12 ? (rg.R - rg.cx) / dx : dx < -1e-12 ? (rg.L - rg.cx) / dx : Infinity, dy > 1e-12 ? (rg.B - rg.cy) / dy : dy < -1e-12 ? (rg.T - rg.cy) / dy : Infinity);
  let lo = 0;
  let hi = s;
  for (let it = 0; it < 40; it++) {
    const m = (lo + hi) / 2;
    if (insideRegion(rg.cx + dx * m, rg.cy + dy * m)) lo = m;
    else hi = m;
  }
  // the farthest point of the ray, up to the exit, outside every obstacle: an obstacle holding the
  // point pushes it back to where the ray enters that obstacle (repeat: obstacles can chain)
  let t = lo;
  for (let pass = 0; pass <= obstacleCount; pass++) {
    let moved = false;
    for (let i = 0; i < obstacleCount; i++) {
      const o = obstacles[i] as ScreenRect;
      const x = rg.cx + dx * t;
      const y = rg.cy + dy * t;
      if (!(x > o.x && x < o.x + o.w && y > o.y && y < o.y + o.h)) continue;
      // entry t of the ray into o (slab method; the centre is never inside an obstacle on a phone layout: test)
      const tx0 = Math.abs(dx) < 1e-12 ? -Infinity : ((dx > 0 ? o.x : o.x + o.w) - rg.cx) / dx;
      const ty0 = Math.abs(dy) < 1e-12 ? -Infinity : ((dy > 0 ? o.y : o.y + o.h) - rg.cy) / dy;
      t = Math.max(0, Math.max(tx0, ty0) - 1e-6);
      moved = true;
    }
    if (!moved) break;
  }
  rg.x = rg.cx + dx * t;
  rg.y = rg.cy + dy * t;
  atScratch.x = rg.x;
  atScratch.y = rg.y;
  atScratch.angle = tipAngle;
  for (let i = 0; i < obstacleCount; i++) {
    const o = obstacles[i] as ScreenRect;
    if (rg.x > o.x && rg.x < o.x + o.w && rg.y > o.y && rg.y < o.y + o.h) return false;
  }
  const r = eventArrowDrawnRect(atScratch, rg.size, drawnScratch);
  return rectCentreGap(r.x, r.y, r.w, r.h, rg.cx, rg.cy) >= rg.clear - 1e-6;
}

/** A block is cut as a notch only when its span along the edge is at least this × its depth. */
const NOTCH_MIN_ASPECT = 2;
/** Extra length of a notch's chamfer past the ray through its corner (CSS px × k). */
export const NOTCH_CHAMFER_MARGIN_CSS_PX = 48;

/** A notch: edge 0 top, 1 right, 2 bottom, 3 left; span [a0, a1] along it, depth d inward, chamfers c0 / c1 (0: runs past the corner). */
interface Notch {
  edge: number;
  a0: number;
  a1: number;
  d: number;
  c0: number;
  c1: number;
}
const MAX_NOTCHES = 8;
const notches: Notch[] = Array.from({ length: MAX_NOTCHES }, () => ({ edge: 0, a0: 0, a1: 0, d: 0, c0: 0, c1: 0 }));
let notchCount = 0;
/** Floating blocks (inflated by `half`): the arrow's centre stays out of them. */
const obstacles: ScreenRect[] = Array.from({ length: MAX_NOTCHES }, () => ({ x: 0, y: 0, w: 0, h: 0 }));
let obstacleCount = 0;
const nb = { L: 0, R: 0, T: 0, B: 0 };

/**
 * Each avoid rect, inflated by `half`, that lies along an edge as a wide band becomes a notch of that
 * edge (the shallowest such cut); any other becomes an obstacle. Edge coordinates: u along
 * the edge, v inward.
 */
function buildNotches(avoid: readonly ScreenRect[], half: number, L: number, R: number, T: number, B: number, cx: number, cy: number, margin: number): void {
  nb.L = L;
  nb.R = R;
  nb.T = T;
  nb.B = B;
  notchCount = 0;
  obstacleCount = 0;
  for (let i = 0; i < avoid.length && notchCount < MAX_NOTCHES; i++) {
    const a = avoid[i] as ScreenRect;
    const x0 = a.x - half;
    const x1 = a.x + a.w + half;
    const y0 = a.y - half;
    const y1 = a.y + a.h + half;
    if (x1 <= L || x0 >= R || y1 <= T || y0 >= B) continue; // clear of the arrow's rectangle
    // a wide band along an edge (the HP block, the wave line: span ≥ 2 × depth) is cut from it; a
    // compact block (☰, swap, quick-use) is an obstacle the arrow keeps off — cut out to the edge it
    // would shadow a wide fan of bearings (and the gaps round it)
    let best = -1;
    let bestD = Infinity;
    for (let e = 0; e < 4; e++) {
      const gap = e === 0 ? y0 - T : e === 1 ? R - x1 : e === 2 ? B - y1 : x0 - L;
      const d = e === 0 ? y1 - T : e === 1 ? R - x0 : e === 2 ? B - y0 : x1 - L;
      const span = e === 0 || e === 2 ? x1 - x0 : y1 - y0;
      if (gap <= 0 && span >= NOTCH_MIN_ASPECT * d && d < bestD) {
        best = e;
        bestD = d;
      }
    }
    if (best < 0) {
      if (obstacleCount < MAX_NOTCHES) {
        const o = obstacles[obstacleCount++] as ScreenRect;
        o.x = x0;
        o.y = y0;
        o.w = x1 - x0;
        o.h = y1 - y0;
      }
      continue;
    }
    const n = notches[notchCount++] as Notch;
    n.edge = best;
    n.d = bestD;
    const horiz = best === 0 || best === 2;
    n.a0 = horiz ? x0 : y0;
    n.a1 = horiz ? x1 : y1;
    const lo = horiz ? L : T;
    const hi = horiz ? R : B;
    const uc = horiz ? cx : cy;
    const vc = best === 0 ? cy - T : best === 1 ? R - cx : best === 2 ? B - cy : cx - L;
    const k = vc / Math.max(1e-6, vc - n.d); // a ray from the centre through the notch's corner meets the edge line at uc + (a − uc)·k
    n.c0 = n.a0 <= lo ? 0 : Math.max(0, n.a0 - (uc + (n.a0 - uc) * k)) + margin;
    n.c1 = n.a1 >= hi ? 0 : Math.max(0, uc + (n.a1 - uc) * k - n.a1) + margin;
  }
}

function insideRegion(x: number, y: number): boolean {
  if (x > nb.R || x < nb.L || y > nb.B || y < nb.T) return false;
  for (let i = 0; i < notchCount; i++) {
    const n = notches[i] as Notch;
    const u = n.edge === 0 || n.edge === 2 ? x : y;
    const v = n.edge === 0 ? y - nb.T : n.edge === 1 ? nb.R - x : n.edge === 2 ? nb.B - y : x - nb.L;
    let depth: number;
    if (u >= n.a0 && u <= n.a1) depth = n.d;
    else if (u < n.a0) depth = n.c0 > 0 && u > n.a0 - n.c0 ? (n.d * (u - (n.a0 - n.c0))) / n.c0 : 0;
    else depth = n.c1 > 0 && u < n.a1 + n.c1 ? (n.d * (n.a1 + n.c1 - u)) / n.c1 : 0;
    if (v < depth) return false;
  }
  return true;
}

function underAny(x: number, y: number, rects: readonly ScreenRect[]): boolean {
  for (let i = 0; i < rects.length; i++) {
    const r = rects[i] as ScreenRect;
    if (x >= r.x && x <= r.x + r.w && y >= r.y && y <= r.y + r.h) return true;
  }
  return false;
}

/** The drawn arrow (re-review R3): a disc of `DISC_FRAC` × size and a tip of `TIP_FRAC` × the disc, `TIP_OFFSET` × the disc out along the angle. */
export const EVENT_ARROW_DISC_FRAC = 0.7;
export const EVENT_ARROW_TIP_FRAC = 0.5;
export const EVENT_ARROW_TIP_OFFSET = 0.62;

/** The screen box the drawn arrow (disc ∪ tip) covers at `at` (its centre and angle) into `out`. */
export function eventArrowDrawnRect(at: { x: number; y: number; angle: number }, size: number, out: ScreenRect): ScreenRect {
  const disc = size * EVENT_ARROW_DISC_FRAC;
  const tip = disc * EVENT_ARROW_TIP_FRAC;
  const tx = at.x + Math.cos(at.angle) * disc * EVENT_ARROW_TIP_OFFSET;
  const ty = at.y + Math.sin(at.angle) * disc * EVENT_ARROW_TIP_OFFSET;
  const x0 = Math.min(at.x - disc / 2, tx - tip / 2);
  const y0 = Math.min(at.y - disc / 2, ty - tip / 2);
  out.x = x0;
  out.y = y0;
  out.w = Math.max(at.x + disc / 2, tx + tip / 2) - x0;
  out.h = Math.max(at.y + disc / 2, ty + tip / 2) - y0;
  return out;
}
