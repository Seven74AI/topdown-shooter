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
