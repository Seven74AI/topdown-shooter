import type { BuildingTypeStats } from "@topdown/shared";

/**
 * Story 5.9 (F4 "the mine's two circles are drawn"): pure helpers of the mine and floor looks (no
 * Phaser, unit-tested against the sim). The rings are drawn at EXACTLY the balance radii the sim
 * uses (`buildings.json › mine.triggerRadiusM / blastRadiusM`, read here, never copied), round the
 * mine's centre: a zombie body touching the inner ring sets it off; a body touching the outer ring
 * is in the blast.
 */
export interface MineRings {
  readonly triggerM: number;
  readonly blastM: number;
}

/** The rings of a mine type, or null for any other building. */
export function mineRingRadii(stats: Readonly<BuildingTypeStats> | undefined): MineRings | null {
  const m = stats?.mine;
  return m ? { triggerM: m.triggerRadiusM, blastM: m.blastRadiusM } : null;
}

/** The armed light's period and the part of it that is lit (ms). */
export const MINE_BLINK_PERIOD_MS = 1400;
export const MINE_BLINK_ON_MS = 550;

/** The armed light is on at view time `ms` (each mine offset by its id, so a field doesn't blink in step). */
export function mineBlinkOn(ms: number, id: number): boolean {
  const t = (ms + id * 263) % MINE_BLINK_PERIOD_MS;
  return t >= 0 && t < MINE_BLINK_ON_MS;
}

/** Story 5.9: the cast-shadow height of a building (walls `wallM`; a spike trap a few cm; a mine none). */
export const TRAP_SHADOW_M = 0.05;
export function buildingShadowHeightM(stats: Readonly<BuildingTypeStats> | undefined, wallM: number): number {
  if (!stats || stats.solid) return wallM;
  return stats.mine ? 0 : TRAP_SHADOW_M;
}
