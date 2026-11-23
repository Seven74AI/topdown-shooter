import { HAND_CANCEL, HAND_HINT_BOTTOM_CSS_PX, HAND_HINT_RIGHT_CSS_PX, HAND_PLACE, HAND_ROTATE } from "../ui/sizes";

/** A square hit rect (canvas px, top-left) around a round button. */
export interface HandRect {
  x: number;
  y: number;
  size: number;
}

export interface HandLayout {
  place: HandRect;
  rotate: HandRect;
  cancel: HandRect;
  /** The hint line's bottom-right anchor (canvas px). */
  hintX: number;
  hintY: number;
}

export function newHandLayout(): HandLayout {
  return { place: { x: 0, y: 0, size: 0 }, rotate: { x: 0, y: 0, size: 0 }, cancel: { x: 0, y: 0, size: 0 }, hintX: 0, hintY: 0 };
}

function at(spec: { sizeCss: number; rightCss: number; bottomCss: number }, width: number, height: number, right: number, bottom: number, k: number, out: HandRect): void {
  out.size = spec.sizeCss * k;
  out.x = width - (spec.rightCss + right) * k - out.size / 2;
  out.y = height - (spec.bottomCss + bottom) * k - out.size / 2;
}

/**
 * Story 5.15 (AC 8, ux-spec §4): Place, ⟳ and ✕ where the right thumb rests, measured from the
 * bottom-right safe-area corner (insets in CSS px, `k` = dpr()), and the hint line's anchor. Pure,
 * written into `out` (layout only, no allocation).
 */
export function layoutHandCluster(width: number, height: number, insetRight: number, insetBottom: number, k: number, out: HandLayout): HandLayout {
  at(HAND_PLACE, width, height, insetRight, insetBottom, k, out.place);
  at(HAND_ROTATE, width, height, insetRight, insetBottom, k, out.rotate);
  at(HAND_CANCEL, width, height, insetRight, insetBottom, k, out.cancel);
  out.hintX = width - (HAND_HINT_RIGHT_CSS_PX + insetRight) * k;
  out.hintY = height - (HAND_HINT_BOTTOM_CSS_PX + insetBottom) * k;
  return out;
}
