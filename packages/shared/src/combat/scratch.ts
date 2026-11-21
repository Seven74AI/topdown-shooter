import { ZOMBIE_POOL_CAPACITY } from "../config/constants";

/**
 * Shared scratch buffer for zombie candidate queries in the combat system (aim assist, projectile hits).
 * Sized to the whole pool so a query is never truncated. Used synchronously only.
 */
export const zombieCandidates = new Int32Array(ZOMBIE_POOL_CAPACITY);
