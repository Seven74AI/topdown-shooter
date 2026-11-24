import {
  BOSS_BAR_GAP_CSS_PX,
  BOSS_BAR_H_CSS_PX,
  BOSS_BAR_MAX_W_CSS_PX,
  BOSS_BAR_MIN_W_CSS_PX,
  BOSS_BAR_NAME_CSS_PX,
  BOSS_BAR_TOP_CSS_PX,
  MENU_BUTTON_CSS_PX,
  MENU_BUTTON_INSET_CSS_PX,
} from "../ui/sizes";

/**
 * Story 6.5 (D9, AC 13): where the boss bar sits — top centre, under the wave line, never over the
 * thumbs: at most `BOSS_BAR_MAX_W_CSS_PX`, at least 220 px at 568 × 320, ≥ 12 px from the ☰ button
 * (and, centred, from the top-left corner's controls the same way). The name sits above the bar,
 * inside the same rectangle. Pure (CSS px × `k`, the HUD's device-px factor).
 */
export interface BossBarLayout {
  /** The whole block (name + bar). */
  x: number;
  y: number;
  w: number;
  h: number;
  /** The HP bar inside it. */
  barY: number;
  barH: number;
}

export function layoutBossBar(width: number, insetLeft: number, insetTop: number, insetRight: number, k: number, out: BossBarLayout): BossBarLayout {
  const menuLeft = width - (MENU_BUTTON_INSET_CSS_PX + insetRight + MENU_BUTTON_CSS_PX) * k;
  const leftLimit = (MENU_BUTTON_INSET_CSS_PX + insetLeft + MENU_BUTTON_CSS_PX) * k; // a mirrored corner keeps it symmetric
  const half = Math.min(BOSS_BAR_MAX_W_CSS_PX * k, 2 * Math.min(width / 2 - leftLimit, menuLeft - width / 2) - 2 * BOSS_BAR_GAP_CSS_PX * k) / 2;
  const w = Math.max(BOSS_BAR_MIN_W_CSS_PX * k, 2 * half);
  out.w = w;
  out.x = width / 2 - w / 2;
  out.y = (BOSS_BAR_TOP_CSS_PX + insetTop) * k;
  const nameH = (BOSS_BAR_NAME_CSS_PX + 4) * k;
  out.barY = out.y + nameH;
  out.barH = BOSS_BAR_H_CSS_PX * k;
  out.h = nameH + out.barH;
  return out;
}

/** The gold notch at 50 % (D9). */
export const BOSS_BAR_NOTCH = 0.5;
