import { pulseAlpha } from "./pulse";

/**
 * Story 4.9 (designer request): the revive zone around a downed survivor, a circle of radius
 * `balance.player.reviveRadiusM` (centre to centre: a teammate's centre inside it revives). Faint
 * while nobody is in reach, brighter and pulsing while a revive runs. Pale revive-green, which reads
 * on the dark Dead City street. Pure (no Phaser): the style for a frame, written into `out`.
 */
export const REVIVE_ZONE_COLOR = 0x8ff0c0;
const IDLE_FILL_A = 0.05;
const IDLE_LINE_A = 0.35;
const ACTIVE_FILL_A = 0.12;
/** While reviving the line alpha pulses between these (the 2.9 pulse's phase). */
const ACTIVE_LINE_MIN_A = 0.6;
const ACTIVE_LINE_MAX_A = 0.95;
export const REVIVE_ZONE_LINE_M = 0.06;
export const REVIVE_ZONE_ACTIVE_LINE_M = 0.1;

export interface ReviveZoneStyle {
  fillAlpha: number;
  lineAlpha: number;
  lineWidthM: number;
}

export function reviveZoneStyle(reviving: boolean, timeMs: number, out: ReviveZoneStyle): ReviveZoneStyle {
  if (!reviving) {
    out.fillAlpha = IDLE_FILL_A;
    out.lineAlpha = IDLE_LINE_A;
    out.lineWidthM = REVIVE_ZONE_LINE_M;
    return out;
  }
  const t = (pulseAlpha(timeMs) - 0.6) / 0.4; // 0..1
  out.fillAlpha = ACTIVE_FILL_A;
  out.lineAlpha = ACTIVE_LINE_MIN_A + (ACTIVE_LINE_MAX_A - ACTIVE_LINE_MIN_A) * t;
  out.lineWidthM = REVIVE_ZONE_ACTIVE_LINE_M;
  return out;
}
