/**
 * The HUD's top-left HP block (bar, HP text, money line) and the top-centre wave line, as numbers and
 * rects (CSS px × k). HudScene draws them from these constants; Story 6.8 (re-review R1) keeps the
 * event edge arrow off them and the one HUD layout test checks it. No Phaser here (tests import it).
 */
export const HP_MARGIN = 16;
export const HP_BAR_W = 200;
export const HP_BAR_H = 16;
export const HP_TEXT_PX = 14;
export const MONEY_TEXT_PX = 16;
export const MONEY_GAP_PX = 4;
export const LINE_HEIGHT = 1.3;
export const WAVE_TOP_PX = 12;
export const WAVE_TEXT_PX = 16;
/** The wave line's widest text ("Wave 10   ·   Zombies 400", ≈ 220 px at 16 px): the width it reserves. */
export const WAVE_LINE_RESERVE_CSS_PX = 240;

export interface HudRect {
  x: number;
  y: number;
  w: number;
  h: number;
}
export interface HudInsets {
  readonly left: number;
  readonly right: number;
  readonly top: number;
  readonly bottom: number;
}

/** The HP block: the bar's backing (2 px round it), the HP text line under it and the money line. */
export function layoutHpBlock(insets: HudInsets, k: number, out: HudRect): HudRect {
  out.x = (HP_MARGIN + insets.left - 2) * k;
  out.y = (HP_MARGIN + insets.top - 2) * k;
  out.w = (HP_BAR_W + 4) * k;
  out.h = (2 + HP_BAR_H + 4 + HP_TEXT_PX * LINE_HEIGHT + MONEY_GAP_PX + MONEY_TEXT_PX * LINE_HEIGHT) * k;
  return out;
}

/** The wave line ("Wave n · Zombies m"), centred at the top. */
export function layoutWaveLine(width: number, insets: HudInsets, k: number, out: HudRect): HudRect {
  out.w = WAVE_LINE_RESERVE_CSS_PX * k;
  out.x = width / 2 - out.w / 2;
  out.y = (WAVE_TOP_PX + insets.top) * k;
  out.h = WAVE_TEXT_PX * LINE_HEIGHT * k;
  return out;
}
