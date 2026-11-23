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
/** Story 3.1 / 5.15: Ready (and Shop beside it) sit this far left of the screen centre, clear of the hand cluster (CSS px). */
export const READY_SHIFT_LEFT_CSS_PX = 40;
/**
 * Story 5.15 (ux-spec §4): the hand cluster while holding a building, circles measured from the
 * bottom-right safe-area corner: diameter, centre from the right, centre from the bottom (CSS px).
 */
export const HAND_PLACE = { sizeCss: 76, rightCss: 92, bottomCss: 92 } as const;
export const HAND_ROTATE = { sizeCss: 60, rightCss: 190, bottomCss: 80 } as const;
export const HAND_CANCEL = { sizeCss: 48, rightCss: 80, bottomCss: 196 } as const;
/** The hint line: right-aligned this far inside the right inset, its bottom this far above the bottom inset (D3: the item chip's slot). */
export const HAND_HINT_RIGHT_CSS_PX = 16;
export const HAND_HINT_BOTTOM_CSS_PX = 250;
/** Story 3.3: the Shop button, right of Ready with this gap; the pair is centred at the bottom (CSS px). */
export const SHOP_BUTTON_W_CSS_PX = 120;
export const SHOP_BUTTON_GAP_CSS_PX = 12;
/** Story 3.7: the repair panel's row (Repair + ✕), one row above Ready / Shop (CSS px). */
export const REPAIR_BUTTON_W_CSS_PX = 168;
export const REPAIR_CLOSE_CSS_PX = 52;
export const REPAIR_ROW_GAP_CSS_PX = 12;
