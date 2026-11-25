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
