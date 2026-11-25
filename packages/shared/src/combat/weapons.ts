import type { Balance } from "../config/balance";
import type { FlameStats, GunStats, LauncherStats, MeleeStats, WeaponStats } from "../config/balanceSchema";
import { TICK_RATE_HZ } from "../config/constants";
import { damageMul, trainedReloadS } from "../meta/training";

/** A balance weapon id ("pistol", "smg", …). Validated against balance at use. */
export type WeaponId = string;

const indexCache = new WeakMap<Balance, readonly WeaponId[]>();

/** Weapon ids in balance order: the u8 index stored in pools and sent on the wire. */
export function weaponIds(balance: Balance): readonly WeaponId[] {
  let ids = indexCache.get(balance);
  if (!ids) {
    ids = Object.freeze(Object.keys(balance.weapons));
    indexCache.set(balance, ids);
  }
  return ids;
}

export function weaponStats(balance: Balance, id: WeaponId): WeaponStats {
  const stats = balance.weapons[id];
  if (!stats) throw new Error(`weaponStats: unknown weapon ${id}`);
  return stats as WeaponStats;
}

export const isGun = (w: WeaponStats): w is GunStats => w.kind === "gun";
export const isMelee = (w: WeaponStats): w is MeleeStats => w.kind === "melee";
/** Story 5.4: the Flamethrower and the Gas torch (a cone every tick, fuel in the slot's `ammo`). */
export const isFlame = (w: WeaponStats): w is FlameStats => w.kind === "flame";

/** Story 5.4: a flame weapon's full tank in ticks (its `ammo` when full). */
export const fuelTicksOf = (w: FlameStats): number => Math.round(w.fuelS * TICK_RATE_HZ);

/**
 * Story 5.4: what a full slot holds: a gun's or launcher's magazine, a flame weapon's fuel ticks, 0 for melee.
 * Every "full magazine" (createSlot, reload end, the HUD, the client's fire clock) uses this.
 */
export function magazineOf(w: WeaponStats): number {
  return w.kind === "gun" || w.kind === "launcher" ? w.magazine : w.kind === "flame" ? fuelTicksOf(w) : 0;
}

/** Story 5.4: the weapon uses ammo (and reloads at 0): guns, launchers (5.5) and flame weapons. */
export const usesAmmo = (w: WeaponStats): w is GunStats | LauncherStats | FlameStats => w.kind !== "melee";
/** Story 5.5: the Grenade Launcher (lobs a round; magazine and reload as a gun's). */
export const isLauncher = (w: WeaponStats): w is LauncherStats => w.kind === "launcher";
/** Story 5.5: a weapon with a magazine and a reload (guns and launchers): the shared ammo rules. */
export const hasMagazine = (w: WeaponStats): w is GunStats | LauncherStats => w.kind === "gun" || w.kind === "launcher";

/**
 * Story 5.1 (F2, F5): the ONE damage source for player weapons. Level L deals
 * `damage × (1 + upgrades.damagePerLevel × (L − 1))` per bullet, pellet, swing or tick: I = 100 %,
 * II = 125 %, III = 150 %, IV = 175 %. Exact (no rounding: Pistol IV = 8.75). Used by the server,
 * solo, bots and the replay alike (all through `step`); the client never decides damage.
 * Pure, allocation-free. Melee/new weapons (5.2 axe swing, chainsaw tick) must take their damage
 * from here too.
 */
export function weaponDamage(balance: Balance, weapon: WeaponId, level: number): number {
  return weaponStats(balance, weapon).damage * (1 + balance.shop.upgrades.damagePerLevel * (level - 1));
}

/**
 * Story 7.5 (AC 4, decision 7.5 D2): the damage of a PLAYER's own weapon: `weaponDamage` × (1 + 1 % × the owner's
 * Training damage level). Every player-weapon damage read goes through here (melee, bullets, flames, the launcher;
 * `weaponDamage.grep.test.ts` refuses a stray call); turrets, traps, mines, hand grenades and molotovs are not trained.
 * `owner` null (a round whose owner left) = Training 0. At level 0 the number is exactly `weaponDamage`.
 */
export function playerWeaponDamage(balance: Balance, owner: { readonly trainDmg: number } | null, weapon: WeaponId, level: number): number {
  const base = weaponDamage(balance, weapon, level);
  const t = owner === null ? 0 : owner.trainDmg;
  return t === 0 ? base : base * damageMul(t);
}

/**
 * Story 7.5 (AC 4, decision 7.5 D4): the reload seconds of `p` for a weapon with `reloadS` (Training reload level
 * applied). The five reload starts in `firing.ts` and the client's predicted reload all use it, so they can't drift.
 */
export function reloadSecondsFor(p: { readonly trainReload: number }, stats: { readonly reloadS: number }): number {
  return p.trainReload === 0 ? stats.reloadS : trainedReloadS(stats.reloadS, p.trainReload);
}

/**
 * Story 5.1: the price of one upgrade level of `weapon` (every level costs the same, GDD "60 % of
 * the base price per level"): `round(upgrades.priceShare × (upgradeBasePrice ?? price))`.
 */
export function upgradePrice(balance: Balance, weapon: WeaponId): number {
  const stats = weaponStats(balance, weapon);
  return Math.round(balance.shop.upgrades.priceShare * (stats.upgradeBasePrice ?? stats.price));
}
