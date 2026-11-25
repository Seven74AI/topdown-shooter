/**
 * The HUD's top-left HP block (bar, HP text, money line) and the top-centre wave line, as numbers and
 * rects (CSS px × k). HudScene draws them from these constants; Story 6.8 (re-review R1) keeps the
 * event edge arrow off them and the one HUD layout test checks it. No Phaser here (tests import it).
 */
import { waveLine } from "./hudModel";
import { MENU_BUTTON_CSS_PX, MENU_BUTTON_INSET_CSS_PX } from "../ui/sizes";
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

/**
 * HudScene, at create only: the measured widths of the widest strings, in CSS px. Once is enough
 * (Story 6.14, 6.8 re-review 4 nit): these HUD texts are `system-ui` (no web-font swap), and the widths
 * are stored in CSS px, so a resize or DPR change moves them by < 1 px (inside the reserves' margins).
 */
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

/** Story 6.14: the gap kept between two top-band blocks (HP bar, wave line, boss bar, banner; CSS px). */
export const HUD_BAND_GAP_CSS_PX = 6;
/** The centre banner (HudScene): 34 px bold, centred at 32 % of the screen height unless pushed down (Story 6.14). */
export const BANNER_TEXT_PX = 34;
export const BANNER_Y_FRAC = 0.32;
/** The banner's side margin inside the safe area (CSS px; it wraps there, Story 6.14). */
export const BANNER_SIDE_CSS_PX = 8;

/** The HP bar with its 2 px backing (top left). */
export function layoutHpBar(insets: HudInsets, k: number, out: HudRect): HudRect {
  out.x = (HP_MARGIN + insets.left - 2) * k;
  out.y = (HP_MARGIN + insets.top - 2) * k;
  out.w = (HP_BAR_W + 4) * k;
  out.h = (HP_BAR_H + 4) * k;
  return out;
}

/** Story 6.14: the HP row under the bar (HP text + gear icons, at its widest). */
export function layoutHpRow(insets: HudInsets, k: number, out: HudRect): HudRect {
  layoutHpBlock(insets, k, out);
  const top = (HP_MARGIN + insets.top + HP_BAR_H + 2) * k;
  out.h = out.y + out.h - top;
  out.y = top;
  return out;
}

const barScratch: HudRect = { x: 0, y: 0, w: 0, h: 0 };

/**
 * The wave line ("Wave n · Zombies m"): centred at the top; Story 6.14 — where that would touch the
 * HP bar (568 × 320, 640 × 360, 800 × 360), its rect starts `HUD_BAND_GAP_CSS_PX` right of the bar and
 * ends that far before ☰ at most (HudScene shrinks a line wider than that: `placeWaveText`).
 */
export function layoutWaveLine(width: number, insets: HudInsets, k: number, out: HudRect): HudRect {
  const reserve = waveLineW() * k;
  const gap = HUD_BAND_GAP_CSS_PX * k;
  const bar = layoutHpBar(insets, k, barScratch);
  const left = Math.max(width / 2 - reserve / 2, bar.x + bar.w + gap);
  const menuLeft = width - (MENU_BUTTON_INSET_CSS_PX + insets.right + MENU_BUTTON_CSS_PX) * k;
  out.x = left;
  out.w = Math.max(0, Math.min(reserve, menuLeft - gap - left));
  out.y = (WAVE_TOP_PX + insets.top) * k;
  out.h = WAVE_TEXT_PX * LINE_HEIGHT * k;
  return out;
}

const waveScratch: HudRect = { x: 0, y: 0, w: 0, h: 0 };

/**
 * Story 6.14: where HudScene draws a wave line `textW` px wide (unscaled): its centre x (the text's
 * origin is 0.5, 0) — the screen's centre when the line fits there — and a scale ≤ 1 so it fits the rect.
 */
export function placeWaveText(width: number, insets: HudInsets, k: number, textW: number, out: { x: number; scale: number }): { x: number; scale: number } {
  const r = layoutWaveLine(width, insets, k, waveScratch);
  out.scale = textW > r.w && textW > 0 ? r.w / textW : 1;
  const dw = textW * out.scale;
  out.x = Math.min(Math.max(width / 2, r.x + dw / 2), r.x + r.w - dw / 2);
  return out;
}

/** Story 6.14: the banner's wrap width — inside the safe area, `BANNER_SIDE_CSS_PX` from its sides. */
export function bannerWrapWidth(width: number, insets: HudInsets, k: number): number {
  return Math.min(width * 0.92, width - (insets.left + insets.right + 2 * BANNER_SIDE_CSS_PX) * k);
}

const bandScratch: HudRect[] = [0, 1, 2, 3].map(() => ({ x: 0, y: 0, w: 0, h: 0 }));

/**
 * Story 6.14: the banner (`textW` × `textH` px, centred) at 32 % of the height, pushed down below every
 * top-band block it would cross (HP block, money line, wave line and — while it shows — the boss bar:
 * `boss`, its rect), `HUD_BAND_GAP_CSS_PX` clear.
 */
export function layoutBanner(width: number, height: number, insets: HudInsets, k: number, textW: number, textH: number, boss: Readonly<HudRect> | null, out: HudRect): HudRect {
  out.w = textW;
  out.h = textH;
  out.x = width / 2 - textW / 2;
  let top = height * BANNER_Y_FRAC - textH / 2;
  const gap = HUD_BAND_GAP_CSS_PX * k;
  const band = bandScratch;
  layoutHpBlock(insets, k, band[0] as HudRect);
  layoutMoneyLine(insets, k, band[1] as HudRect);
  layoutWaveLine(width, insets, k, band[2] as HudRect);
  const n = boss ? 4 : 3;
  if (boss) Object.assign(band[3] as HudRect, boss);
  for (let i = 0; i < n; i++) {
    const r = band[i] as HudRect;
    if (out.x < r.x + r.w + gap && r.x < out.x + out.w + gap && top < r.y + r.h + gap) top = r.y + r.h + gap;
  }
  out.y = top;
  return out;
}
