import type { Balance } from "../config/balance";
import { hasMagazine, weaponStats, type WeaponId } from "./weapons";

export interface WeaponSlot {
  weapon: WeaponId;
  /** Rounds in the magazine (melee: 0, unused). */
  ammo: number;
  /** Ticks left in the current reload; 0 when not reloading. */
  reloadTicks: number;
  /**
   * Seconds until the next shot. Kept as a float because rates like 3/s don't divide the 20 Hz tick:
   * `cooldownS += 1 / rateHz` keeps the average rate exact; compared with a small epsilon.
   */
  cooldownS: number;
  /**
   * Story 5.1: upgrade level, 1 (I, as bought) to `shop.json › upgrades.maxLevel` (IV). Only the
   * damage depends on it (`weaponDamage`). Belongs to this slot: a swap keeps it, a replace
   * (`createSlot`) starts again at 1.
   */
  level: number;
}

export interface Loadout {
  slots: [WeaponSlot, WeaponSlot | null];
  active: 0 | 1;
  /** Ticks left in a weapon swap (Story 1.8); 0 when not swapping. */
  swapTicks: number;
}

export function createSlot(balance: Balance, weapon: WeaponId): WeaponSlot {
  const stats = weaponStats(balance, weapon);
  return { weapon, ammo: hasMagazine(stats) ? stats.magazine : 0, reloadTicks: 0, cooldownS: 0, level: 1 };
}

/** Every run starts with the Pistol and an empty second slot (GDD: start of run). */
export const STARTING_WEAPON: WeaponId = "pistol";

export function createLoadout(balance: Balance): Loadout {
  return { slots: [createSlot(balance, STARTING_WEAPON), null], active: 0, swapTicks: 0 };
}

export function activeSlot(loadout: Loadout): WeaponSlot {
  return (loadout.slots[loadout.active] ?? loadout.slots[0]) as WeaponSlot;
}

/** Story 5.1: a level clamped to 1–`maxLevel`; anything that isn't a whole number in range is 1. */
export function validLevel(balance: Balance, level: number | undefined): number {
  return level !== undefined && Number.isInteger(level) && level >= 1 && level <= balance.shop.upgrades.maxLevel ? level : 1;
}

/**
 * Sets a player's two weapons (dev loadout picker in Epic 1; the shop from Story 3.3). Both magazines
 * start full, slot 0 is active, any swap or reload in progress is cancelled. Story 5.1: `levels`
 * (dev switch `?loadout=smg:3`) sets each slot's upgrade level (out of range → 1).
 */
export function setLoadout(
  balance: Balance,
  loadout: Loadout,
  weapons: readonly [WeaponId, WeaponId | null],
  levels?: readonly [number, number],
): void {
  const s0 = createSlot(balance, weapons[0]);
  const s1 = weapons[1] ? createSlot(balance, weapons[1]) : null;
  if (levels) {
    s0.level = validLevel(balance, levels[0]);
    if (s1) s1.level = validLevel(balance, levels[1]);
  }
  loadout.slots = [s0, s1];
  loadout.active = 0;
  loadout.swapTicks = 0;
}
