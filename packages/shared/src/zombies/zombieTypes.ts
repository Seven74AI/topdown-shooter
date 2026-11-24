import type { Balance } from "../config/balance";

/** Zombie type index ↔ balance id. Order is fixed; append only (the index goes on the wire in Story 2.5). */
export const ZOMBIE_TYPES = ["walker", "crawler", "runner", "spitter", "brute", "bloater"] as const; // Story 5.6: spitter = 3; Story 5.7: brute = 4; Story 5.8: bloater = 5
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
  /**
   * Story 5.8: a Bloater swelling before it bursts (FR-A: stands still, never bites, always ends in
   * a blast; streamed in the horde nibble, so a client that missed the event still draws it). A
   * rushing Bloater that swells shows SWELL too (it no longer moves: its rush marker is moot).
   * Values stay ≤ 7 (Story 5.4 reserves the nibble's bit 3 for "burning").
   */
  SWELL: 5,
  /**
   * Story 6.8 (DD6): a stampede Runner — runs straight along its lane, no target, no flanking, not a
   * wave zombie; hits each standing player it touches once (F7). Becomes CHASE (or RUSH) when it
   * converts (F8). Streamed in the horde nibble (≤ 7).
   */
  STAMPEDE: 6,
} as const;

/** Story 5.8: a Bloater's swell (the telegraph: growing, glowing, the fuse ring). */
export function isSwellState(state: number): boolean {
  return state === ZOMBIE_STATE.SWELL;
}

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
