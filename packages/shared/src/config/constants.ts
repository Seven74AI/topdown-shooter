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
 * Story 3.4 (review H2): the build lattice. A building's min corner sits on a lattice point, sent as
 * uint8 indices in these units (48 × 32 m → 0–96 × 0–64); footprints are multiples of it, so every
 * building edge is on the lattice (and on Story 3.5's 0.5 m flow-field cells). Structural (the wire
 * format depends on it), so not a balance number.
 */
export const BUILD_GRID_M = 0.5;

/**
 * Story 3.5: the flow-field grid (architecture › Zombie Pathfinding: 0.5 m). Structural (the field's
 * cost units are quarter-metres of it), so it is not a balance number; the tuning lives in
 * `zombies.json › pathing`.
 */
export const FLOW_CELL_M = 0.5;

/**
 * Story 2.12 (architecture › lag compensation): a player's shot is tested against zombie positions
 * at most this many ticks old (12 = 600 ms since Story 8.9 T10). Netcode, not balance. The server's `REWIND_CAP_MS`
 * (apps/server/src/net/limits.ts) can only lower it, so both move together (audit H1).
 * Story 8.8, network audit §3.5: 6 → 10 (300 → 500 ms). After a 200 ms TCP stall a shot's view is
 * one-way + input queue + render delay ≈ 75 + 200 + 140 ms > 300 ms; measured at 150 ms ± 10 ms,
 * kiting Runners on the 1 % / 2 % × 200 ms lossy line: reversed hits 7.6 → 2.0 %, 11.9 → 1.3 %
 * (decision 8.8 D1). Only zombies (and the Behemoth) are rewound, so no player is wronged by it.
 * Story 8.9 T10: 10 → 12 (600 ms, 8.8 D1's fallback): 8.9's lossy-line delay is 250 ms, so the view
 * offset p95 was 11.4–11.7 ticks (18–29 % of kiting shots over a 10-tick cap).
 */
export const REWIND_MAX_TICKS = 12;

/**
 * Story 2.12: rows of the zombie position history (`combat/rewind.ts`): REWIND_MAX_TICKS back, one
 * more to interpolate a fractional tick, one spare (Story 8.8: 12 rows, ≈ 24 KB per room; Story 8.9 T10: 14 rows, ≈ 28 KB; the
 * Behemoth's history uses the same count, decision 8.8 D3).
 */
export const ZOMBIE_HISTORY_TICKS = REWIND_MAX_TICKS + 2;

/**
 * An aim shorter than this is "no aim": the weapon doesn't attack (`combat/firing.ts › tryFire`)
 * and, Story 5.2, the Chainsaw's wielder slow doesn't apply (`player/slow.ts`). The client's dead
 * zone sends a zero aim inside it.
 */
export const MIN_AIM_LEN = 1e-6;

/**
 * Story 6.1: the most fixed zombies (`waves.json › fixed`) one wave can hold: the size of the
 * preallocated per-wave spawn-point list (`WaveState.fixedAtList`). Structural (a buffer size, like
 * the pool capacities); `loadBalance` refuses a `fixed` entry above it.
 */
export const MAX_FIXED_PER_WAVE = 8;

/**
 * Story 2.4 (review): the input backlog the server's queue should settle at (2 inputs = 100 ms of
 * jitter cover). Story 8.9 moves it here: the client slows its steps while the server reports more
 * of its inputs queued than this (`PlayerState.inputQueued`). Netcode, not balance.
 */
export const INPUT_QUEUE_TARGET = 2;
