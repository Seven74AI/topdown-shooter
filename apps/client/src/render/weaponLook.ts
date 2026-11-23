import { weaponIds, type Balance } from "@topdown/shared";
import type { SfxName } from "../audio/placeholderSfx";

/**
 * Story 5.3: per-weapon look and sound of a shot (cosmetic only: no gameplay numbers here).
 * Weapons without an entry keep the Pistol's sound and the plain flash and streak.
 */
const FIRE_SFX: Readonly<Record<string, SfxName>> = {
  shotgun: "weapon_shotgun_fire",
  assault_rifle: "weapon_assault_rifle_fire",
};
/** Muzzle flash size (× the plain flash): the Shotgun's blast is big, the rifle's a little bigger than a pistol's. */
const MUZZLE_SCALE: Readonly<Record<string, number>> = { shotgun: 1.6, assault_rifle: 1.25 };
/**
 * A pellet gun's blast: a short-lived warm cone over its spread (pellets live ~2 ticks at 5 m, too
 * briefly to read as a spray alone). Length in metres; 0 = none.
 */
const BLAST_M: Readonly<Record<string, number>> = { shotgun: 2.4 };
export const blastLengthFor = (weapon: string): number => BLAST_M[weapon] ?? 0;
/** A pellet's streak length (× a bullet's 0.6 m): 8 short streaks read as a spray, not 8 bullets. */
export const PELLET_STREAK_SCALE = 0.5;

export const fireSfxFor = (weapon: string): SfxName => FIRE_SFX[weapon] ?? "weapon_pistol_fire";
export const muzzleScaleFor = (weapon: string): number => MUZZLE_SCALE[weapon] ?? 1;

/** Streak length scale by weapon index (`weaponIds` order): pellet guns' pellets are short. Built once. */
export function streakScales(balance: Balance): Float32Array {
  const ids = weaponIds(balance);
  const out = new Float32Array(Math.max(1, ids.length)).fill(1);
  ids.forEach((id, i) => {
    const w = balance.weapons[id];
    if (w?.kind === "gun" && w.pellets > 1) out[i] = PELLET_STREAK_SCALE;
  });
  return out;
}
