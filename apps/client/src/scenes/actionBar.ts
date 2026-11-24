import { ACTION_BAR, ACTION_INFO_CENTRE_CLEAR_CSS_PX, ACTION_INFO_CSS_PX, ACTION_INFO_NARROW_CSS_PX, ACTION_INFO_SMALL_CSS_PX } from "../ui/sizes";

/**
 * Story 5.21 (AC 1, 5; ux-spec §3–§4): the action bar's layout, Phaser-free so it is unit-tested at
 * the small-phone sizes. One row, left → right ✥ Move · Upgrade · Repair · Sell / Take back · ✕;
 * absent buttons close up to the right (the row is right-aligned `ACTION_BAR.rightCss` inside the
 * right safe-area inset, its centre `centreBottomCss` above the bottom inset). The info lines sit
 * right-aligned above the row. Canvas px (`k` = dpr).
 */
export const ACTION_IDS = ["move", "upgrade", "repair", "sell", "close"] as const;
export type ActionId = (typeof ACTION_IDS)[number];

export interface ActionRect {
  x: number;
  y: number;
  w: number;
  h: number;
  visible: boolean;
}

export interface ActionBarLayout {
  /** In `ACTION_IDS` order. */
  readonly rects: ActionRect[];
  /** The info lines' right edge and bottom (canvas px). */
  infoRight: number;
  infoBottom: number;
  /** The info lines wrap at this width (they keep clear of the survivor at the screen centre), in this text size (canvas px). */
  infoMaxW: number;
  infoPx: number;
  /** The row's left and top edge (of the visible buttons). */
  rowLeft: number;
  rowTop: number;
}

export function newActionBarLayout(): ActionBarLayout {
  return { rects: ACTION_IDS.map(() => ({ x: 0, y: 0, w: 0, h: 0, visible: false })), infoRight: 0, infoBottom: 0, infoMaxW: 0, infoPx: 0, rowLeft: 0, rowTop: 0 };
}

/** `shown[i]`: whether button `ACTION_IDS[i]` is on the bar (Repair and ✕ always are). */
export function layoutActionBar(width: number, height: number, insetRight: number, insetBottom: number, k: number, shown: readonly boolean[], out: ActionBarLayout): ActionBarLayout {
  const w = ACTION_BAR.wCss * k;
  const h = ACTION_BAR.hCss * k;
  const gap = ACTION_BAR.gapCss * k;
  // Centre `centreBottomCss` up; on a short screen with a tall bottom inset (568 × 320 with 21 px) that
  // would reach the survivor at the screen centre: then the row keeps 12 px below the centre instead
  // (still ≥ 16 px above the bottom inset).
  const y = Math.min(Math.max(height - (insetBottom + ACTION_BAR.centreBottomCss) * k - h / 2, height / 2 + ACTION_BAR.centreClearCss * k), height - (insetBottom + ACTION_BAR.rightCss) * k - h);
  let right = width - (insetRight + ACTION_BAR.rightCss) * k;
  let left = right;
  for (let i = ACTION_IDS.length - 1; i >= 0; i--) {
    const r = out.rects[i] as ActionRect;
    const on = shown[i] === true || ACTION_IDS[i] === "repair" || ACTION_IDS[i] === "close";
    r.visible = on;
    r.w = w;
    r.h = h;
    r.y = y;
    if (!on) {
      r.x = 0;
      continue;
    }
    r.x = right - w;
    left = r.x;
    right = r.x - gap;
  }
  out.rowLeft = left;
  out.rowTop = y;
  out.infoRight = width - (insetRight + ACTION_BAR.rightCss) * k;
  out.infoBottom = y - ACTION_BAR.infoGapCss * k;
  out.infoMaxW = Math.max(0, out.infoRight - (width / 2 + ACTION_INFO_CENTRE_CLEAR_CSS_PX * k));
  out.infoPx = (width / k < ACTION_INFO_NARROW_CSS_PX ? ACTION_INFO_SMALL_CSS_PX : ACTION_INFO_CSS_PX) * k;
  return out;
}

/**
 * Story 5.21 (D4): a button's two-line label at 78 px: the price part on its own line ("Upgrade $50"
 * → "Upgrade\n$50", "Take back +$40" → "Take back\n+$40"); a label without a price stays as it is.
 */
export function actionLabel(text: string): string {
  const i = text.lastIndexOf(" ");
  if (i <= 0) return text;
  const tail = text.slice(i + 1);
  return tail.startsWith("$") || tail.startsWith("+$") ? `${text.slice(0, i)}\n${tail}` : text;
}
