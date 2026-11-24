import { BUILD_COUNT_GAP_CSS_PX, BUILD_COUNT_TEXT_CSS_PX } from "../ui/sizes";

/**
 * Story 5.20 review M2: a VERBATIM COPY of Story 5.12's `layoutRightButtons` (origin/story-5-12
 * fddce7a, `apps/client/src/scenes/consumableButton.ts`, with its review L6 fallback), so the undo
 * chip ↶ can sit relative to 5.12's real consumable/swap row before 5.12 is on master.
 * **At the 5.12 merge: delete this file and import `layoutRightButtons` / `newRightButtonsLayout`
 * from `./consumableButton` in `undoChip.ts` and `undoChip.test.ts` (same signature).**
 */
/** Story 5.12 (D5): the round buttons near the right thumb (CSS px). */
export const RIGHT_BUTTON_CSS_PX = 64;
export const SWAP_RIGHT_CSS_PX = 24;
export const SWAP_BOTTOM_CSS_PX = 120;
/** D5: the consumable button sits this far left of swap at the same height. */
export const CONSUMABLE_GAP_CSS_PX = 16;
/** Main-session decision (2026-11-23, 5.16 D3): above the build bar, the buttons keep this gap to the grid and to each other. */
export const ABOVE_BAR_GAP_CSS_PX = 12;

export interface RightButtonsLayout {
  size: number;
  swapX: number;
  swapY: number;
  consX: number;
  consY: number;
}

export const newRightButtonsLayout = (): RightButtonsLayout => ({ size: 0, swapX: 0, swapY: 0, consX: 0, consY: 0 });

/**
 * Where swap and the consumable button go (canvas px; `k` = dpr, insets in CSS px). Normally swap is
 * at the bottom right and the consumable 16 px left of it (D5). While the build bar is up (5.16: it
 * takes the bottom right in a build phase) both sit in a row above the grid's top-left edge
 * (main-session decision 2026-11-23, after 5.16's D3), consumable then swap, 12 px apart and 12 px
 * above the tiles, so the medkit (and the swap) stay reachable on touch in a build phase. Pure: the
 * layout test checks 568×320 / 800×360 / 1024×768.
 */
export function layoutRightButtons(width: number, height: number, insetRight: number, insetBottom: number, k: number, buildBar: boolean, gridLeft: number, gridTop: number, out: RightButtonsLayout, gridRight = width - 16 * k): RightButtonsLayout {
  const size = RIGHT_BUTTON_CSS_PX * k;
  out.size = size;
  if (buildBar) {
    const gap = ABOVE_BAR_GAP_CSS_PX * k;
    out.consX = gridLeft;
    out.consY = gridTop - gap - size;
    out.swapX = gridLeft + size + gap;
    out.swapY = out.consY;
    // Review L6: on a narrow screen the row would crowd the survivor at the screen centre: right-align
    // it to the grid instead, above the build count line.
    const cx = width / 2;
    const cy = height / 2;
    if (rectCentreGap(out.consX, out.consY, out.swapX + size - out.consX, size, cx, cy) < CENTRE_CLEAR_CSS_PX * k) {
      out.swapX = gridRight - size;
      out.consX = out.swapX - gap - size;
      out.consY = out.swapY = gridTop - (BUILD_COUNT_GAP_CSS_PX + BUILD_COUNT_TEXT_CSS_PX * COUNT_LINE_HEIGHT) * k - gap - size;
    }
    return out;
  }
  out.swapX = width - (SWAP_RIGHT_CSS_PX + insetRight) * k - size;
  out.swapY = height - (SWAP_BOTTOM_CSS_PX + insetBottom) * k - size;
  out.consX = out.swapX - CONSUMABLE_GAP_CSS_PX * k - size;
  out.consY = out.swapY;
  return out;
}

/** Review L6: the round buttons keep at least this far from the screen centre (the survivor stands there). */
export const CENTRE_CLEAR_CSS_PX = 48;
/** The build count's text box height per CSS px of font size. */
const COUNT_LINE_HEIGHT = 1.3;

/** The distance from (cx, cy) to the rectangle (0 inside it). */
export function rectCentreGap(x: number, y: number, w: number, h: number, cx: number, cy: number): number {
  const dx = Math.max(x - cx, 0, cx - (x + w));
  const dy = Math.max(y - cy, 0, cy - (y + h));
  return Math.hypot(dx, dy);
}
