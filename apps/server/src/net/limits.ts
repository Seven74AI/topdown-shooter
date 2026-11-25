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

/**
 * Story 5.24 (D1): `building.ghost` has its own bucket (capacity and refill per second), so a ghost
 * flood never takes tokens from the shared bucket (place / sell / move / shop) and those never starve
 * ghosts. An honest client sends ≤ 4/s.
 */
export const MAX_GHOST_MESSAGES_PER_S = 5;

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

/**
 * Story 2.12 (architecture › lag compensation): a player's shot is tested against zombie positions
 * at most this old (ms): what the shooter drew (`PlayerInput.viewTick`), clamped. A client that
 * claims an older view gets no more than this (the rewind an honest 300 ms-ping player gets).
 */
export const REWIND_CAP_MS = 300;

/**
 * Story 2.12 re-review M-A: the server accepts only the next seq (an honest client sends every seq
 * in order), so a client can't pick seqs for their spread rolls. After this many refused inputs in a
 * row (1 s of inputs) the queue resyncs to the client's seqs (a client that really restarted).
 */
export const INPUT_SEQ_RESYNC_AFTER = 20;

/** Story 7.1 (decision 7.1 D6): new guest accounts one IP may create per window; beyond it the device plays unsaved. */
export const MAX_NEW_GUESTS_PER_HOUR = 20;
export const NEW_GUEST_WINDOW_MS = 3_600_000;

/** Story 7.1 (decision 7.1 D2): a session ticket is valid this long; the client fetches a fresh one before each Create/Join. */
export const SESSION_TICKET_TTL_MS = 600_000;

/** Story 7.1: the guest cookie lives a year and is renewed on every `/account/session` call. */
export const GUEST_COOKIE_MAX_AGE_S = 31_536_000;
