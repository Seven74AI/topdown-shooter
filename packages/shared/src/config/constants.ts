/** Display name of the game; shown by the client's BootScene. */
export const GAME_TITLE = "topdown-shooter";

/** Fixed simulation tick rate shared by client prediction and server (architecture › Networking). */
export const TICK_RATE_HZ = 20;

/** Length of one simulation step in seconds (50 ms at 20 Hz). */
export const TICK_DT_S = 1 / TICK_RATE_HZ;
