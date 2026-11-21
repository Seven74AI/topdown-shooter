import type { Balance } from "../config/balance";

/** Zombie type index ↔ balance id. Order is fixed; append only (the index goes on the wire in Story 2.5). */
export const ZOMBIE_TYPES = ["walker"] as const;
export type ZombieTypeId = (typeof ZOMBIE_TYPES)[number];

/** Per-zombie behaviour state stored as a u8 in the pool. More states arrive later (flank, windup, rush…). */
export const ZOMBIE_STATE = {
  FREE: 0,
  CHASE: 1,
  /** One of the last zombies of a wave: marked on screen, heads straight for the nearest player (FR30). */
  RUSH: 2,
} as const;

export function zombieTypeIndex(type: ZombieTypeId): number {
  return ZOMBIE_TYPES.indexOf(type);
}

const maxRadiusCache = new WeakMap<Balance, number>();

/** Largest zombie radius in balance (for query margins). Cached per Balance object. */
export function maxZombieRadius(balance: Balance): number {
  let r = maxRadiusCache.get(balance);
  if (r === undefined) {
    r = 0;
    for (const t of Object.values(balance.zombies.types)) r = Math.max(r, t.radiusM);
    maxRadiusCache.set(balance, r);
  }
  return r;
}
