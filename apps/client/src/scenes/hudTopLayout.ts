/**
 * The HUD's top-left HP block (bar, HP text, money line) and the top-centre wave line, as numbers and
 * rects (CSS px × k). HudScene draws them from these constants; Story 6.8 (re-review R1) keeps the
 * event edge arrow off them and the one HUD layout test checks it. No Phaser here (tests import it).
 */
import { waveLine } from "./hudModel";
export const HP_MARGIN = 16;
export const HP_BAR_W = 200;
export const HP_BAR_H = 16;
export const HP_TEXT_PX = 14;
export const MONEY_TEXT_PX = 16;
export const MONEY_GAP_PX = 4;
export const LINE_HEIGHT = 1.3;
export const WAVE_TOP_PX = 12;
export const WAVE_TEXT_PX = 16;
/**
 * Re-review 3 RR3-3: the widest strings the HUD can show — built with the same functions HudScene uses
 * (`waveLine`, `hpRowText`). HudScene measures them with its own text styles at create and reports
 * the widths (`reportHudTextWidths`); the layouts reserve max(the fallback below, the measurement).
 * `hudTopLayout.test` checks these are the widest strings those functions make.
 */
export const WIDEST_WAVE_LINE = waveLine({ wave: 999, remaining: 9999, buildSecs: -1, endless: true, voting: false });
export const WIDEST_HP_TEXT = hpRowText(9999, 9999, true, false);
export const WIDEST_MONEY_TEXT = "$999999";
/** Gear icons beside the HP text at most (one per gear item), each `GEAR_ICON_CSS_PX` + 4 px gap, after an 8 px gap. */
export const MAX_GEAR_ICONS = 5;
export const GEAR_ICON_STEP_CSS_PX = 24 + 4;

/**
 * Fallback widths (CSS px) until HudScene has measured (tests, the first frame): Chromium canvas at
 * 16 / 14 px system-ui measured "Wave 99 · Endless · Zombies 9999" 261.5 px and "HP 175 / 175
 * Burning" 143.4 px (re-review 2 RR2 / RR3), with margins; the money line "$999999" ≈ 60 px.
 */
export const WAVE_LINE_RESERVE_CSS_PX = 280;
export const HP_TEXT_RESERVE_CSS_PX = 166;
export const MONEY_RESERVE_CSS_PX = 72;
/** The widest HP row: HP text, 8 px, then the gear icons. */
export const HP_ROW_RESERVE_CSS_PX = HP_TEXT_RESERVE_CSS_PX + 8 + MAX_GEAR_ICONS * GEAR_ICON_STEP_CSS_PX;

/** What HudScene measured (CSS px; 0 = not yet). */
export const hudTextWidths = { waveLine: 0, hpText: 0, money: 0 };

/** HudScene (create, and on a DPR / font change): the measured widths of the widest strings, in CSS px. */
export function reportHudTextWidths(waveLineCss: number, hpTextCss: number, moneyCss: number): void {
  hudTextWidths.waveLine = waveLineCss;
  hudTextWidths.hpText = hpTextCss;
  hudTextWidths.money = moneyCss;
}

const waveLineW = (): number => Math.max(WAVE_LINE_RESERVE_CSS_PX, hudTextWidths.waveLine + 8);
const hpRowW = (): number => Math.max(HP_BAR_W + 4, Math.max(HP_TEXT_RESERVE_CSS_PX, hudTextWidths.hpText + 4) + 8 + MAX_GEAR_ICONS * GEAR_ICON_STEP_CSS_PX);
const moneyW = (): number => Math.max(MONEY_RESERVE_CSS_PX, hudTextWidths.money + 8);

/** The HP text exactly as HudScene draws it (Story 4.8: Burning / Acid). */
export function hpRowText(hp: number, maxHp: number, burning: boolean, inAcid: boolean): string {
  return burning ? `HP ${Math.ceil(hp)} / ${maxHp}   Burning` : inAcid ? `HP ${Math.ceil(hp)} / ${maxHp}   Acid` : `HP ${Math.ceil(hp)} / ${maxHp}`;
}

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

/**
 * The HP block's top part (re-review 3 RR3-2): the bar's backing (2 px round it) and the HP row under
 * it (text + gear icons, at its widest).
 */
export function layoutHpBlock(insets: HudInsets, k: number, out: HudRect): HudRect {
  out.x = (HP_MARGIN + insets.left - 2) * k;
  out.y = (HP_MARGIN + insets.top - 2) * k;
  out.w = (hpRowW() + 2) * k;
  out.h = (2 + HP_BAR_H + 4 + HP_TEXT_PX * LINE_HEIGHT) * k;
  return out;
}

/** The money line under the HP row (its own short rect: re-review 3 RR3-2). */
export function layoutMoneyLine(insets: HudInsets, k: number, out: HudRect): HudRect {
  out.x = (HP_MARGIN + insets.left - 2) * k;
  out.y = (HP_MARGIN + insets.top + HP_BAR_H + 4 + HP_TEXT_PX * LINE_HEIGHT) * k;
  out.w = (moneyW() + 2) * k;
  out.h = (MONEY_GAP_PX + MONEY_TEXT_PX * LINE_HEIGHT) * k;
  return out;
}

/** The wave line ("Wave n · Zombies m"), centred at the top. */
export function layoutWaveLine(width: number, insets: HudInsets, k: number, out: HudRect): HudRect {
  out.w = waveLineW() * k;
  out.x = width / 2 - out.w / 2;
  out.y = (WAVE_TOP_PX + insets.top) * k;
  out.h = WAVE_TEXT_PX * LINE_HEIGHT * k;
  return out;
}
