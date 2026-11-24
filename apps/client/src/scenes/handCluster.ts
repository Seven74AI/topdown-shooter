import {
  HAND_CANCEL,
  HAND_CHIP,
  HAND_CHIP_ROW_GAP_CSS_PX,
  HAND_HINT_GAP_CSS_PX,
  HAND_HINT_LINE_CSS_PX,
  HAND_HINT_RIGHT_CSS_PX,
  HAND_MENU_CLEAR_CSS_PX,
  HAND_PLACE,
  HAND_ROTATE,
  MENU_BUTTON_CSS_PX,
  MENU_BUTTON_INSET_CSS_PX,
} from "../ui/sizes";

/** A square hit rect (canvas px, top-left) around a round button. */
export interface HandRect {
  x: number;
  y: number;
  size: number;
}

/** Story 5.19: the item chip's rect (canvas px, top-left). */
export interface ChipRect {
  x: number;
  y: number;
  w: number;
  h: number;
}

export interface HandLayout {
  place: HandRect;
  rotate: HandRect;
  cancel: HandRect;
  /** Story 5.19: the item chip. */
  chip: ChipRect;
  /** Story 5.19 (D7): a short screen: the chip sits left of ✕ on its row (the reason line stays above ✕). */
  chipRow: boolean;
  /** The hint line's bottom-right anchor (canvas px). */
  hintX: number;
  hintY: number;
}

export function newHandLayout(): HandLayout {
  return {
    place: { x: 0, y: 0, size: 0 },
    rotate: { x: 0, y: 0, size: 0 },
    cancel: { x: 0, y: 0, size: 0 },
    chip: { x: 0, y: 0, w: 0, h: 0 },
    chipRow: false,
    hintX: 0,
    hintY: 0,
  };
}

function at(spec: { sizeCss: number; rightCss: number; bottomCss: number }, width: number, height: number, right: number, bottom: number, k: number, out: HandRect): void {
  out.size = spec.sizeCss * k;
  out.x = width - (spec.rightCss + right) * k - out.size / 2;
  out.y = height - (spec.bottomCss + bottom) * k - out.size / 2;
}

/**
 * Story 5.15 (AC 8, ux-spec §4): Place, ⟳ and ✕ where the right thumb rests, measured from the
 * bottom-right safe-area corner (insets in CSS px, `k` = dpr()), and the hint line's anchor. Story
 * 5.19 (D7): the item chip right-aligned just above ✕ with the reason line above it; when that
 * would bring the reason line within 4 px of ☰ (`insetTop` = the top safe-area inset), the chip
 * moves left of ✕ on its row and the reason line stays just above ✕ (5.17's spot). Pure, written
 * into `out` (layout only, no allocation).
 */
export function layoutHandCluster(width: number, height: number, insetRight: number, insetBottom: number, k: number, out: HandLayout, insetTop = 0): HandLayout {
  at(HAND_PLACE, width, height, insetRight, insetBottom, k, out.place);
  at(HAND_ROTATE, width, height, insetRight, insetBottom, k, out.rotate);
  at(HAND_CANCEL, width, height, insetRight, insetBottom, k, out.cancel);
  out.hintX = width - (HAND_HINT_RIGHT_CSS_PX + insetRight) * k;
  const chip = out.chip;
  chip.w = HAND_CHIP.wCss * k;
  chip.h = HAND_CHIP.hCss * k;
  chip.x = width - (HAND_CHIP.rightCss + insetRight) * k - chip.w;
  chip.y = out.cancel.y - HAND_CHIP.gapAboveCancelCss * k - chip.h;
  out.hintY = chip.y - HAND_HINT_GAP_CSS_PX * k; // the reason line above the chip
  const menuBottom = (MENU_BUTTON_INSET_CSS_PX + MENU_BUTTON_CSS_PX + insetTop) * k;
  out.chipRow = out.hintY - HAND_HINT_LINE_CSS_PX * k < menuBottom + HAND_MENU_CLEAR_CSS_PX * k;
  if (out.chipRow) {
    chip.x = out.cancel.x - HAND_CHIP_ROW_GAP_CSS_PX * k - chip.w;
    chip.y = out.cancel.y + out.cancel.size / 2 - chip.h / 2;
    out.hintY = out.cancel.y - HAND_HINT_GAP_CSS_PX * k; // just above ✕, the cluster's top
  }
  return out;
}
