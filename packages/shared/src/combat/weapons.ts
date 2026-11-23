import type { Balance } from "../config/balance";
import type { GunStats, MeleeStats, WeaponStats } from "../config/balanceSchema";

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
 * Story 5.1: the price of one upgrade level of `weapon` (every level costs the same, GDD "60 % of
 * the base price per level"): `round(upgrades.priceShare × (upgradeBasePrice ?? price))`.
 */
export function upgradePrice(balance: Balance, weapon: WeaponId): number {
  const stats = weaponStats(balance, weapon);
  return Math.round(balance.shop.upgrades.priceShare * (stats.upgradeBasePrice ?? stats.price));
}
