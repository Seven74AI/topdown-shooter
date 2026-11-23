import type { Balance } from "../config/balance";

/** Zombie type index ↔ balance id. Order is fixed; append only (the index goes on the wire in Story 2.5). */
export const ZOMBIE_TYPES = ["walker", "crawler", "runner", "spitter", "brute"] as const; // Story 5.6: spitter = 3; Story 5.7: brute = 4
export type ZombieTypeId = (typeof ZOMBIE_TYPES)[number];

/** Per-zombie behaviour state stored as a u8 in the pool. More states arrive later (flank, windup, rush…). */
export const ZOMBIE_STATE = {
  FREE: 0,
  CHASE: 1,
  /** One of the last zombies of a wave: marked on screen, heads straight for the nearest player (FR30). */
  RUSH: 2,
  /** Story 5.6: a Spitter rearing back before a spit (the telegraph; streamed in the horde nibble). Story 5.7: also a Brute's raised arms before a swing. */
  WINDUP: 3,
  /** Story 5.6: a rushing Spitter (FR30, still marked) in its windup. */
  RUSH_WINDUP: 4,
} as const;

/** Story 5.6: rushing (FR30), whether or not in a windup. Every "is it rushing" check uses this. */
export function isRushState(state: number): boolean {
  return state === ZOMBIE_STATE.RUSH || state === ZOMBIE_STATE.RUSH_WINDUP;
}

/** Story 5.6: a Spitter's windup (rushing or not): the glowing mouth on screen. */
export function isWindupState(state: number): boolean {
  return state === ZOMBIE_STATE.WINDUP || state === ZOMBIE_STATE.RUSH_WINDUP;
}

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
