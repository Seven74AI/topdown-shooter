import { layoutRightButtons, newRightButtonsLayout } from "../scenes/consumableButton";
import { MENU_BUTTON_CSS_PX, MENU_BUTTON_INSET_CSS_PX } from "../ui/sizes";
import { layoutHpBlock, layoutWaveLine } from "../scenes/hudTopLayout";

/**
 * Story 6.8 review M2 (brief 31): where the event edge arrow sits on the SCREEN. Not pressable, but it
 * must stay inside the safe area, off every wave-mode control (☰, swap, quick-use) and — re-review R1 —
 * off the HP block and the wave line (readable), and ≥ 48 px from the survivor at the centre — the one HUD layout test checks it (`scenes/hudLayout.test.ts`). Pure, no
 * allocation per call (the caller passes the records).
 *
 * The arrow (a square of side `size` px, disc + tip) goes on the line from the centre toward the
 * event's screen point (sx, sy), on the safe-area rectangle shrunk by size / 2 + `pad`; a point that
 * lands on a control slides along its edge to the nearer side of that control.
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

/**
 * The arrow's centre for an event at screen point (sx, sy) into `out`; false (no arrow) when the
 * point is on screen. `avoid`: the controls (`waveControlRects`).
 */
export function placeEventArrow(sx: number, sy: number, w: number, h: number, insets: Insets, k: number, size: number, avoid: readonly ScreenRect[], out: { x: number; y: number; angle: number }): boolean {
  // Re-review R2: "on screen" = inside the SAFE rectangle and not under a HUD block (a point under the
  // notch inset, ☰ or the HP block can't be seen: it gets an arrow).
  if (sx >= insets.left * k && sx <= w - insets.right * k && sy >= insets.top * k && sy <= h - insets.bottom * k && !underAny(sx, sy, avoid)) return false;
  const half = size / 2 + EVENT_ARROW_PAD_CSS_PX * k;
  const L = insets.left * k + half;
  const R = w - insets.right * k - half;
  const T = insets.top * k + half;
  const B = h - insets.bottom * k - half;
  const cx = w / 2;
  const cy = h / 2;
  const dx = sx - cx;
  const dy = sy - cy;
  out.angle = Math.atan2(dy, dx);
  const s = Math.min(dx > 0 ? (R - cx) / dx : dx < 0 ? (L - cx) / dx : Infinity, dy > 0 ? (B - cy) / dy : dy < 0 ? (T - cy) / dy : Infinity);
  const hx = cx + dx * s;
  const hy = cy + dy * s;
  // Re-review R1: walk the inner rectangle's perimeter outward from the ray's hit point (both ways,
  // 1 px steps) to the nearest spot clear of every avoid rect (inflated by `half`). A walk, not a
  // slide: two neighbouring blocks (HP block + wave line) can't push it back and forth.
  const tw = R - L;
  const th = B - T;
  const per = 2 * (tw + th);
  const t0 = perimeterT(hx, hy, L, R, T, B);
  const step = Math.max(1, k);
  for (let d = 0; d <= per / 2; d += step) {
    if (tryAt(t0 + d, L, T, tw, th, per, avoid, half, out) || tryAt(t0 - d, L, T, tw, th, per, avoid, half, out)) return true;
  }
  out.x = hx; // nowhere clear (can't happen on a phone layout: test): the ray's hit point
  out.y = hy;
  return true;
}

/** Perimeter parameter of a point on the inner rect: top edge L→R, right edge T→B, bottom R→L, left B→T. */
function perimeterT(x: number, y: number, L: number, R: number, T: number, B: number): number {
  const tw = R - L;
  const th = B - T;
  if (Math.abs(y - T) < 1e-6) return x - L;
  if (Math.abs(x - R) < 1e-6) return tw + (y - T);
  if (Math.abs(y - B) < 1e-6) return tw + th + (R - x);
  return 2 * tw + th + (B - y);
}

function tryAt(t: number, L: number, T: number, tw: number, th: number, per: number, avoid: readonly ScreenRect[], half: number, out: { x: number; y: number }): boolean {
  t = ((t % per) + per) % per;
  let x: number;
  let y: number;
  if (t <= tw) {
    x = L + t;
    y = T;
  } else if (t <= tw + th) {
    x = L + tw;
    y = T + (t - tw);
  } else if (t <= 2 * tw + th) {
    x = L + tw - (t - tw - th);
    y = T + th;
  } else {
    x = L;
    y = T + th - (t - 2 * tw - th);
  }
  for (let i = 0; i < avoid.length; i++) {
    const a = avoid[i] as ScreenRect;
    if (x > a.x - half && x < a.x + a.w + half && y > a.y - half && y < a.y + a.h + half) return false;
  }
  out.x = x;
  out.y = y;
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
