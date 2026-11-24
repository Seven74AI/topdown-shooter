/** Phone UI minimums in CSS px (readiness fix U4): multiply by dpr() in canvas space. */
export const MIN_BUTTON_CSS_PX = 44;
export const MIN_TEXT_CSS_PX = 14;
/** Story 2.11: the in-run menu button (☰), top-right, this far inside the safe area (CSS px). */
export const MENU_BUTTON_CSS_PX = 48;
export const MENU_BUTTON_INSET_CSS_PX = 12;
/** Story 3.1: the build phase's Ready button, bottom centre between the thumbs (CSS px). */
export const READY_BUTTON_W_CSS_PX = 168;
export const READY_BUTTON_H_CSS_PX = 52;
export const READY_BUTTON_BOTTOM_CSS_PX = 24;
/** Story 3.1 / 5.15: Ready sits this far left of the screen centre, clear of the hand cluster (CSS px; 5.16: Shop moved into the build bar). */
export const READY_SHIFT_LEFT_CSS_PX = 40;
/**
 * Story 5.15 (ux-spec §4): the hand cluster while holding a building, circles measured from the
 * bottom-right safe-area corner: diameter, centre from the right, centre from the bottom (CSS px).
 */
export const HAND_PLACE = { sizeCss: 76, rightCss: 92, bottomCss: 92 } as const;
export const HAND_ROTATE = { sizeCss: 60, rightCss: 190, bottomCss: 80 } as const;
export const HAND_CANCEL = { sizeCss: 48, rightCss: 80, bottomCss: 196 } as const;
/**
 * The hint line: right-aligned this far inside the right inset, its bottom this far above ✕'s top
 * edge (review L5: anchored to the cluster, so on a 320 px-tall phone it stays below ☰ / ⚙).
 */
export const HAND_HINT_RIGHT_CSS_PX = 16;
export const HAND_HINT_GAP_CSS_PX = 6;
/** The hint line's height at 18 px with its 4 px stroke (CSS px; layout checks only). */
export const HAND_HINT_LINE_CSS_PX = 26;
/**
 * Story 5.19 (ux-spec §4, D7): the item chip while holding: size, right inset, the gap above ✕'s
 * top edge (the reason line then sits `HAND_HINT_GAP_CSS_PX` above the chip). On a short screen the
 * chip moves left of ✕ on its row, `HAND_CHIP_ROW_GAP_CSS_PX` from ✕; the reason line must keep this
 * far below ☰ (`HAND_MENU_CLEAR_CSS_PX`).
 */
export const HAND_CHIP = { wCss: 160, hCss: 32, rightCss: 16, gapAboveCancelCss: 8 } as const;
/** Story 5.19 (main-session decision after review M1): the short-screen chip is narrower (short text: "↩ carry" / "{name} ×{n}"). */
export const HAND_CHIP_SHORT_W_CSS_PX = 120;
export const HAND_CHIP_ROW_GAP_CSS_PX = 12;
export const HAND_MENU_CLEAR_CSS_PX = 4;
/** The chip's text size and inner padding (CSS px; the text shrinks to fit the rest). */
export const HAND_CHIP_TEXT_CSS_PX = 14;
export const HAND_CHIP_PAD_CSS_PX = 8;
/**
 * Story 5.16 (ux-spec §4): the build bar, bottom right while my hands are empty in a build phase:
 * a grid of square tiles (size, gap) this far inside the right and bottom safe-area insets (CSS px).
 */
export const BUILD_BAR_COLS = 4;
export const BUILD_BAR_ROWS = 2;
export const BUILD_TILE_CSS_PX = 56;
export const BUILD_TILE_GAP_CSS_PX = 8;
export const BUILD_BAR_INSET_CSS_PX = 16;
/** The tile's price line and the count line ("4/6") above the grid's top-right (text px, gap px). */
export const BUILD_PRICE_TEXT_CSS_PX = 14;
export const BUILD_COUNT_TEXT_CSS_PX = 15;
export const BUILD_COUNT_GAP_CSS_PX = 4;
/** Ready keeps at least this far left of the build bar (it slides further left on narrow screens). */
export const READY_BAR_GAP_CSS_PX = 12;
/** Story 5.20 (ux-spec §4): the undo chip ↶ (48 px round); with the bar up it sits left of Story 5.12's consumable button (`undoChip.ts`). */
export const UNDO_CHIP_CSS_PX = 48;
/** Story 5.20 (ux-spec §4): while holding, ↶ centre from the bottom-right safe-area corner (Ready is hidden then). */
export const UNDO_HAND = { rightCss: 270, bottomCss: 64 } as const;
/** Story 5.20: the undo glyph and the ring's stroke (CSS px). */
export const UNDO_GLYPH_CSS_PX = 26;
export const UNDO_RING_CSS_PX = 4;
/**
 * Story 5.21 (ux-spec §4, alignment Q4): the action bar while a building is selected — one row of
 * buttons (size, gap) right-aligned this far inside the right safe-area inset, the row's centre this
 * far above the bottom inset; the info lines right-aligned above it, their bottom this far above the
 * row's top (CSS px). `centreClearCss`: the row's top keeps this far below the screen centre (the
 * survivor) on a short screen with a tall bottom inset. Review L1 (main-session decision): below
 * `noCloseBelowCss` width the bar has no ✕ (a tap on the ground closes it), so it reaches less far
 * into the move stick's half.
 */
export const ACTION_BAR = { wCss: 78, hCss: 56, gapCss: 8, rightCss: 16, centreBottomCss: 112, infoGapCss: 6, centreClearCss: 12, noCloseBelowCss: 700 } as const;
/** Story 5.21: the action buttons' two-line label, the info line and the long-press ring (CSS px). */
export const ACTION_LABEL_CSS_PX = 15;
export const ACTION_INFO_CSS_PX = 16;
/**
 * Story 5.21: the info lines wrap so they keep this far right of the screen centre (the survivor);
 * on a screen narrower than `ACTION_INFO_NARROW_CSS_PX` they use the 14 px floor so the wrapped
 * lines still clear ☰ (568 × 320).
 */
export const ACTION_INFO_CENTRE_CLEAR_CSS_PX = 24;
export const ACTION_INFO_NARROW_CSS_PX = 700;
export const ACTION_INFO_SMALL_CSS_PX = 14;
export const LONG_PRESS_RING_CSS_PX = 34;
export const LONG_PRESS_RING_LINE_CSS_PX = 5;
