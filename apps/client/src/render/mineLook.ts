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

/** Story 5.9: the cast-shadow height of a building (walls `wallM`; a spike trap a few cm; a mine none; 5.10: a floodlight none, a med station a crate). */
export const TRAP_SHADOW_M = 0.05;
/** Story 5.10: the med station (MS10, a stack of cases on a crate) casts a low box's shadow. */
export const MED_STATION_SHADOW_M = 0.9;
export function buildingShadowHeightM(stats: Readonly<BuildingTypeStats> | undefined, wallM: number): number {
  if (stats?.light) return 0; // Story 5.10: a tripod's shadow is not a box: the FL1 art carries its own soft leg shadow
  if (stats?.heal) return MED_STATION_SHADOW_M;
  if (!stats || stats.solid) return wallM;
  return stats.mine || stats.bearTrap ? 0 : TRAP_SHADOW_M; // Story 5.14: round jaws: no box shadow (it showed as a dark square)
}

/**
 * Story 5.14 (F2 "the plate is drawn"): a bear trap's plate radius (a zombie CENTRE strictly inside
 * it is caught), read from balance like the mine rings, or null for any other building.
 */
export function bearTrapPlateRadius(stats: Readonly<BuildingTypeStats> | undefined): number | null {
  return stats?.bearTrap ? stats.bearTrap.plateRadiusM : null;
}

/**
 * Story 5.14 (AC 17): the local re-arm ring's fill (0–1) after `msOn` ms of my body on a sprung
 * plate. Cosmetic: the trap shows armed only when the state says so; at 1 it waits (pending).
 */
export function rearmFraction(msOn: number, rearmS: number): number {
  if (!(msOn > 0) || !(rearmS > 0)) return 0;
  return Math.min(1, msOn / (rearmS * 1000));
}
