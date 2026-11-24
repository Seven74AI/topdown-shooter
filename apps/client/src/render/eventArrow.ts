import { layoutRightButtons, newRightButtonsLayout } from "../scenes/consumableButton";
import { MENU_BUTTON_CSS_PX, MENU_BUTTON_INSET_CSS_PX } from "../ui/sizes";

/**
 * Story 6.8 review M2 (brief 31): where the event edge arrow sits on the SCREEN. Not pressable, but it
 * must stay inside the safe area, off every wave-mode control (☰, swap, quick-use) and ≥ 48 px from the
 * survivor at the centre — the one HUD layout test checks it (`scenes/hudLayout.test.ts`). Pure, no
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

/** The wave-mode controls the arrow keeps off (the same layout functions HudScene draws with), into `out` (3 rects). */
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
  return out;
}
const rightScratch = newRightButtonsLayout();

export function newWaveControlRects(): ScreenRect[] {
  return [0, 1, 2].map(() => ({ x: 0, y: 0, w: 0, h: 0 }));
}

/**
 * The arrow's centre for an event at screen point (sx, sy) into `out`; false (no arrow) when the
 * point is on screen. `avoid`: the controls (`waveControlRects`).
 */
export function placeEventArrow(sx: number, sy: number, w: number, h: number, insets: Insets, k: number, size: number, avoid: readonly ScreenRect[], out: { x: number; y: number; angle: number }): boolean {
  if (sx >= 0 && sx <= w && sy >= 0 && sy <= h) return false;
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
  let x = cx + dx * s;
  let y = cy + dy * s;
  for (let pass = 0; pass < 3; pass++) {
    let moved = false;
    for (let i = 0; i < avoid.length; i++) {
      const a = avoid[i] as ScreenRect;
      const x0 = a.x - half;
      const x1 = a.x + a.w + half;
      const y0 = a.y - half;
      const y1 = a.y + a.h + half;
      if (x <= x0 || x >= x1 || y <= y0 || y >= y1) continue;
      // slide along the edge it sits on: a side edge moves in y, the top/bottom edge in x
      const onSide = Math.abs(x - L) < 1e-6 || Math.abs(x - R) < 1e-6;
      if (onSide) y = y - y0 <= y1 - y && y0 >= T ? y0 : y1 <= B ? y1 : y0;
      else x = x - x0 <= x1 - x && x0 >= L ? x0 : x1 <= R ? x1 : x0;
      moved = true;
    }
    if (!moved) break;
  }
  out.x = Math.min(R, Math.max(L, x));
  out.y = Math.min(B, Math.max(T, y));
  return true;
}
