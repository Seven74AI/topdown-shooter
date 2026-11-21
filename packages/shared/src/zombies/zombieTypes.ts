/** Zombie type index ↔ balance id. Order is fixed; append only (the index goes on the wire in Story 2.5). */
export const ZOMBIE_TYPES = ["walker"] as const;
export type ZombieTypeId = (typeof ZOMBIE_TYPES)[number];

/** Per-zombie behaviour state stored as a u8 in the pool. More states arrive later (flank, windup, rush…). */
export const ZOMBIE_STATE = {
  FREE: 0,
  CHASE: 1,
} as const;

export function zombieTypeIndex(type: ZombieTypeId): number {
  return ZOMBIE_TYPES.indexOf(type);
}
