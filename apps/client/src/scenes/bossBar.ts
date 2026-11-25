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
import { HUD_BAND_GAP_CSS_PX, layoutHpBlock } from "./hudTopLayout";

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
  // Story 6.14: below the HP block (bar + HP row at its widest) where they share columns, a band gap clear.
  hpInsets.left = insetLeft;
  hpInsets.top = insetTop;
  const hp = layoutHpBlock(hpInsets, k, hpScratch);
  if (out.x < hp.x + hp.w && hp.x < out.x + w) out.y = Math.max(out.y, hp.y + hp.h + HUD_BAND_GAP_CSS_PX * k);
  const nameH = (BOSS_BAR_NAME_CSS_PX + 4) * k;
  out.barY = out.y + nameH;
  out.barH = BOSS_BAR_H_CSS_PX * k;
  out.h = nameH + out.barH;
  return out;
}

const hpInsets = { left: 0, top: 0, right: 0, bottom: 0 };
const hpScratch = { x: 0, y: 0, w: 0, h: 0 };

/** The gold notch at 50 % (D9). */
export const BOSS_BAR_NOTCH = 0.5;

/** The P1 arrival banner ("THE BEHEMOTH"): shown at this share of its art size, this far under the boss bar's block. */
export const BOSS_BANNER_SCALE = 0.7;
export const BOSS_BANNER_GAP_CSS_PX = 8;

/** The survivor's clear zone (Epic 6 brief 31): nothing on screen within this many CSS px of the screen centre. */
export const BOSS_BANNER_CENTRE_CLEAR_CSS_PX = 48;

export interface BossBannerLayout {
  x: number;
  y: number;
  w: number;
  h: number;
  /** True when it wouldn't keep the survivor's 48 px under the bar — every phone landscape size we test (568–844 ×
   * 320–390): the banner takes the boss bar's place and the bar is hidden while it shows (`bossBarHidden`). */
  overBar: boolean;
}

/**
 * Where the arrival banner sits: centred, under the boss bar's block (laid out even while the bar is hidden), so
 * the wave line stays readable, and always ≥ 48 px clear of the survivor at the screen centre (review M2, brief 31).
 * Where it wouldn't fit under the bar (in practice every phone held sideways) it takes the bar's place instead (the
 * view hides the bar meanwhile, `bossBarHidden`), shrunk if it must be. `artCss` = the banner plate's art size (CSS px). Pure; in the one HUD layout test.
 */
export function layoutBossBanner(width: number, height: number, insetLeft: number, insetTop: number, insetRight: number, k: number, artCss: { w: number; h: number }, bar: BossBarLayout): BossBannerLayout {
  const l = layoutBossBar(width, insetLeft, insetTop, insetRight, k, bar);
  const maxBottom = height / 2 - BOSS_BANNER_CENTRE_CLEAR_CSS_PX * k;
  let bw = artCss.w * BOSS_BANNER_SCALE * k;
  let bh = artCss.h * BOSS_BANNER_SCALE * k;
  const below = l.y + l.h + BOSS_BANNER_GAP_CSS_PX * k;
  if (below + bh <= maxBottom) return { x: width / 2 - bw / 2, y: below, w: bw, h: bh, overBar: false };
  const s = Math.max(0.05, Math.min(BOSS_BANNER_SCALE, (maxBottom - l.y) / (artCss.h * k)));
  bw = artCss.w * s * k;
  bh = artCss.h * s * k;
  return { x: width / 2 - bw / 2, y: l.y, w: bw, h: bh, overBar: true };
}

/**
 * Review R6: is the boss bar hidden this frame? When no boss is shown, or while the arrival banner shows in the bar's
 * place (`BossBannerLayout.overBar`). Pure; BossHud draws by it.
 */
export function bossBarHidden(bossVisible: boolean, bannerShown: boolean, bannerOverBar: boolean): boolean {
  return !bossVisible || (bannerShown && bannerOverBar);
}
