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
