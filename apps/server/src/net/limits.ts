/**
 * Security limits for client traffic (architecture › Security and Operations). These are not
 * gameplay numbers, so they live here and not in balance.
 */

/** Largest client frame (and join options JSON) accepted, in bytes. A real client sends ~200. */
export const MAX_CLIENT_MESSAGE_BYTES = 1024;

/** `input.send` bucket: capacity and refill per second (inputs are sent 20/s). */
export const MAX_INPUTS_PER_S = 25;

/** Shared bucket for every other client message type: capacity and refill per second. */
export const MAX_OTHER_MESSAGES_PER_S = 10;

/** At most one `client_message_rejected` warn per client and reason in this window. */
export const DROP_LOG_INTERVAL_MS = 10_000;

/** Rooms one IP may create per `ROOM_CREATE_WINDOW_MS` (Story 2.2 AC 3); more are `rate_limited`. */
export const MAX_ROOM_CREATES_PER_MIN = 10;
export const ROOM_CREATE_WINDOW_MS = 60_000;

/**
 * Story 2.7 (architecture › hit validation): a new projectile's first sweep is advanced by half the
 * shooter's RTT, but never by more than this (ms). Past it, a high-ping player's shots stop
 * reaching further back in time, so others aren't hit by what they no longer see.
 */
export const SHOT_ADVANCE_CAP_MS = 150;
