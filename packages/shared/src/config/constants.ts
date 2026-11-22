/** Display name of the game; shown by the client's BootScene. */
export const GAME_TITLE = "topdown-shooter";

/** Fixed simulation tick rate shared by client prediction and server (architecture › Networking). */
export const TICK_RATE_HZ = 20;

/** Length of one simulation step in seconds (50 ms at 20 Hz). */
export const TICK_DT_S = 1 / TICK_RATE_HZ;

/**
 * The camera never shows more than VIEW_WIDTH_M × VIEW_HEIGHT_M of the map (GDD: ~24 × 13.5 m;
 * the screen edge is 12 m from the player). The server uses it for per-client views (Story 2.5).
 */
export const VIEW_WIDTH_M = 24;
export const VIEW_HEIGHT_M = 13.5;

/** Zombie pool slots: ≥ maxAlive (150) plus slots held after death (architecture › Horde Stream). */
export const ZOMBIE_POOL_CAPACITY = 256;

/** Ticks a freed zombie slot waits before reuse (1 s), so clients never interpolate a new zombie from a dead one. */
export const ZOMBIE_SLOT_HOLD_TICKS = 20;

/** Spatial hash grid cell size in meters (architecture › Decision Summary). */
export const GRID_CELL_M = 2;

/** Projectile pool slots (SMG at 12/s × 4 players × ~1 s flight fits easily). */
export const PROJECTILE_POOL_CAPACITY = 512;

/** Projectiles spawn this far outside the shooter's body (server `firing.ts` and the client's own shots, Story 2.7). */
export const MUZZLE_OFFSET_M = 0.1;

/**
 * Story 3.4: the build grid (GDD: 1 m). A building's centre is an integer grid point, sent as
 * uint8 indices; structural (the wire format depends on it), so it is not a balance number.
 */
export const BUILD_GRID_M = 1;

/**
 * Story 3.5: the flow-field grid (architecture › Zombie Pathfinding: 0.5 m). Structural (the field's
 * cost units are quarter-metres of it), so it is not a balance number; the tuning lives in
 * `zombies.json › pathing`.
 */
export const FLOW_CELL_M = 0.5;
