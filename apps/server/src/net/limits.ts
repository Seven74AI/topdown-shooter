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
 * claims an older view gets no more than this (clamped, never more).
 * Story 8.8, network audit §3.5: 300 → 500 ms, together with `REWIND_MAX_TICKS` 6 → 10 (the cap is
 * the `min` of both, audit H1). An honest player whose inputs waited behind a 200 ms TCP stall asks
 * for ~415 ms; the targets are zombies, so a cheater claiming an old view only helps their team
 * (decision 8.8 D1).
 * Story 8.9 T10 (8.8 D1's fallback): 500 → 600 ms with `REWIND_MAX_TICKS` 10 → 12. With 8.9's 250 ms
 * render delay on a lossy line a shot's view is ~75 + queue + 250 ms: at 500 ms 18–29 % of kiting
 * shots were over the cap (view offset p95 11.4–11.7 ticks); at 600 ms see docs/perf/network-pass-2026-11.md § 8.9.
 */
export const REWIND_CAP_MS = 600;

/**
 * Story 2.12 re-review M-A: the server accepts only the next seq (an honest client sends every seq
 * in order), so a client can't pick seqs for their spread rolls. After this many refused inputs in a
 * row (1 s of inputs) the queue resyncs to the client's seqs (a client that really restarted).
 */
export const INPUT_SEQ_RESYNC_AFTER = 20;

/**
 * Story 8.1 (decision 8.1 D1): a connected player with no input for this many ticks (3 s) in a wave
 * is put on hold like a drop (hidden tab, app switch, a dead spot the socket hasn't noticed). Inputs
 * arrive 20×/s, so 3 s of none is never a normal line (the lossy line's stalls are 200–400 ms).
 */
export const QUIET_HOLD_TICKS = 60;
/** Story 8.1 (Epic 8 D1): seconds a dropped (or quiet) player's seat is held before it is freed and remembered. */
export const HOLD_S = 120;
/** Story 8.1 (Epic 8 D5): the restart count after a freeze, in seconds (3-2-1). */
export const RESUME_COUNT_S = 3;
/**
 * Story 8.1 (decision 8.1 D8): the transport's silent-socket limit: a ping every 3 s, terminated after
 * 4 unanswered (≈ 12–15 s; Colyseus's default 2 ≈ 6–9 s). With D1 the survivor is already safe after 3 s.
 */
export const TRANSPORT_PING_INTERVAL_MS = 3000;
export const TRANSPORT_PING_MAX_RETRIES = 4;
/** Story 8.1: close codes for a seat that moved (shared with the client: `net/reconnect.ts`). */
export { CLOSE_SEAT_KEPT, CLOSE_TAKEN_OVER } from "@topdown/shared";
/**
 * Story 8.1 (F7, brief 21): an input whose view tick (`viewTick`, the tick the phone drew) is more
 * than this many ticks (2 s) behind the server was made while the line was down (a cut, a tunnel) and
 * arrives late in the TCP burst: its seq counts as received, nothing of it is applied, and it never
 * ends a quiet hold. A live phone's view lags by RTT/2 + render delay (≤ 0.75 s on the lossy line).
 */
export const STALE_INPUT_TICKS = 40;

/** Story 7.1 (decision 7.1 D6): new guest accounts one IP may create per window; beyond it the device plays unsaved. */
export const MAX_NEW_GUESTS_PER_HOUR = 20;
export const NEW_GUEST_WINDOW_MS = 3_600_000;

/**
 * Story 7.1 review L4 (brief 15): `/account/session` calls per IP per minute, checked before any database work; over
 * it the device plays unsaved. An honest phone calls it on start-up and before each Create / Join (8.1 rejoins too).
 */
export const MAX_ACCOUNT_SESSIONS_PER_MIN = 30;
export const ACCOUNT_SESSION_WINDOW_MS = 60_000;

/** Story 7.1 (decision 7.1 D2): a session ticket is valid this long; the client fetches a fresh one before each Create/Join. */
export const SESSION_TICKET_TTL_MS = 600_000;

/** Story 7.1: the guest cookie lives a year and is renewed on every `/account/session` call. */
export const GUEST_COOKIE_MAX_AGE_S = 31_536_000;

/** Story 7.3 (AC 5): `/account/unlock` calls per account per minute (no one taps faster); over it → 429. */
export const MAX_UNLOCKS_PER_ACCOUNT_PER_MIN = 20;
/** Story 7.3 (brief 15): `/account/unlock` calls per client IP per minute, checked before any database work. */
export const MAX_UNLOCK_CALLS_PER_IP_PER_MIN = 60;
export const UNLOCK_WINDOW_MS = 60_000;
/** Story 7.5 (AC 3): `/account/training` per account per minute (same rule as an unlock); over it → 429. */
export const MAX_TRAINS_PER_ACCOUNT_PER_MIN = 20;
/** Story 7.5 (brief 15): `/account/training` calls per client IP per minute, checked before any database work. */
export const MAX_TRAIN_CALLS_PER_IP_PER_MIN = 60;
/** Story 7.3 (AC 5, U3): a repeated `requestId` within this long gets the first answer (in-memory, per process). */
export const UNLOCK_REQUEST_TTL_MS = 600_000;
/** Story 7.3: the request-id map holds at most this many answers (oldest dropped first). */
export const UNLOCK_REQUEST_CAP = 10_000;

/** Story 7.6 (AC 8, A3, NFR12): login + forgot-password attempts per client IP per minute (right or wrong, shared). */
export const MAX_LOGIN_ATTEMPTS_PER_IP_PER_MIN = 5;
/**
 * Story 7.6 (brief 19, decision 7.6 B3 as amended by review M1): WRONG login / forgot-password answers per USERNAME per
 * minute from any address (names that don't exist count the same). Over it only the addresses that already failed for
 * that name are refused: the owner, from a clean address, is never locked out (7.6 D6).
 */
export const MAX_LOGIN_ATTEMPTS_PER_NAME_PER_MIN = 10;
/** Story 7.6 (AC 8): upgrade / logout calls per account per minute (7.3's per-account limiter pattern). */
export const MAX_ACCOUNT_ACTIONS_PER_ACCOUNT_PER_MIN = 10;
/** Story 7.6 (brief 15; the 7.3 B5 pattern): upgrade / logout calls per IP per minute, before any database or hashing work. */
export const MAX_ACCOUNT_ACTIONS_PER_IP_PER_MIN = 30;
export const LOGIN_WINDOW_MS = 60_000;
/** Story 7.6 (D4): Argon2id at the OWASP minimum: 19 MiB, 2 passes, 1 lane (≈ 50 ms per hash on the VPS). */
export const ARGON2_MEMORY_KIB = 19_456;
export const ARGON2_PASSES = 2;
export const ARGON2_LANES = 1;

/** Story 7.6 review L1: how long a join waits for the ticket's device-row check before trusting the ticket (P3). */
export const TICKET_ROW_CHECK_MS = 1000;

/**
 * Story 7.6 review L6 (decision 7.6 B18): Save my progress's name check ("That name is taken" tells a name exists)
 * per client IP per minute: an enumeration costs one address a minute per 10 names.
 */
export const MAX_NAME_CHECKS_PER_IP_PER_MIN = 10;
/** Story 7.10 (AC 11): `/account/look` saves per account per minute; over it → 429 ("Too many saves, try again in a minute"). */
export const MAX_LOOK_SAVES_PER_ACCOUNT_PER_MIN = 10;
/** Story 7.10 (brief 15): `/account/look` calls per client IP per minute, checked before the body or the database. */
export const MAX_LOOK_CALLS_PER_IP_PER_MIN = 60;
export const LOOK_WINDOW_MS = 60_000;
/** Story 7.10 (D3): `lobby.set_look` messages per client per second (inside the guard's ~10/s non-input bucket). */
export const MAX_LOBBY_LOOKS_PER_S = 2;
