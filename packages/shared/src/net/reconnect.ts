/**
 * Story 8.1: the phone's side of a reconnect, shared by the game client and the bots (brief 20:
 * same client everywhere). Pure: no DOM, no SDK import; time and scheduling are passed in, so the
 * tests drive it with a fake clock. Timing counts ms of the caller's clock (brief 7).
 */

/** Story 8.1 numbers (netcode, not balance; brief 7): each line says which AC / decision set it. */
export const RECONNECT = {
  /** AC 5: no message of any kind for this long (horde frames arrive 20×/s, pings 1×/s) = the line is dead. */
  watchdogMs: 3000,
  /** AC 4: the SDK's token reconnect, retried every 0.5 s → 3 s (backoff) … */
  minDelayMs: 500,
  maxDelayMs: 3000,
  /** … for the whole 120 s hold (40 × 3 s), then the SDK gives up and the takeover path decides. */
  maxRetries: 40,
  /**
   * AC 6 / dev notes "the takeover is the robust path": when the token reconnect hasn't brought the
   * seat back this long after the drop, a fresh join by guest token takes the seat over (the server
   * may still believe the old socket alive for 12–15 s, refusing the token meanwhile).
   */
  takeoverAfterMs: 2000,
  /** A takeover attempt that failed on the network (the line is still cut) is tried again after this. */
  retryMs: 1000,
  /** D4: while the seat is only remembered (`seat_kept`), the phone asks again this often. */
  seatRetryMs: 3000,
  /** Give up the takeover after the hold plus slack (the server has freed the seat by then). */
  giveUpMs: 130_000,
  /** AC 7 (D6): a page hidden longer than this whose reconnect hasn't opened `rescueOpenMs` after it is shown reloads. */
  hiddenRescueMs: 10_000,
  rescueOpenMs: 5000,
} as const;

/** The slice of the Colyseus SDK's `room.reconnection` options this story sets. */
export interface ReconnectionLike {
  enabled: boolean;
  maxRetries: number;
  minDelay: number;
  maxDelay: number;
  maxEnqueuedMessages: number;
}

/**
 * AC 4, F7: the SDK's automatic reconnection: on, retrying for the 120 s hold, and with the offline
 * queue OFF (`maxEnqueuedMessages = 0`: the SDK's default 10 would replay inputs, shop taps and
 * Ready presses made while the line was down). `minUptime` stays at the SDK's 5 s: a drop in the
 * first 5 s after joining is handled by the takeover path.
 */
export function configureReconnection(r: ReconnectionLike): void {
  r.enabled = true;
  r.maxRetries = RECONNECT.maxRetries;
  r.minDelay = RECONNECT.minDelayMs;
  r.maxDelay = RECONNECT.maxDelayMs;
  r.maxEnqueuedMessages = 0;
}

/**
 * AC 5: the no-data watchdog. `heard(now)` on every message of any kind; `fired(now)` is true once
 * per silence longer than `limitMs` (re-armed by the next `heard`). Disarmed until the first
 * `heard`, and by `disarm()` (lobby, results, already reconnecting).
 */
export class Watchdog {
  private lastMs = 0;
  private armed = false;
  constructor(private readonly limitMs: number = RECONNECT.watchdogMs) {}
  heard(nowMs: number): void {
    this.lastMs = nowMs;
    this.armed = true;
  }
  disarm(): void {
    this.armed = false;
  }
  /** Ms since the last message (0 while disarmed). */
  silentMs(nowMs: number): number {
    return this.armed ? nowMs - this.lastMs : 0;
  }
  fired(nowMs: number): boolean {
    if (!this.armed || nowMs - this.lastMs <= this.limitMs) return false;
    this.armed = false;
    return true;
  }
}

/** What a takeover join answered. */
export type RecoveryJoin<R> = { ok: true; room: R } | { ok: false; reason: "seat_kept" | "gone" | "network" };

export interface RecoveryDeps<R> {
  /** A fresh join of the same room by guest token (the server matches the seat: AC 6). */
  join(): Promise<RecoveryJoin<R>>;
  /** The seat is back on a NEW room object. */
  onRecovered(room: R): void;
  /** The hold ran out: the seat is remembered, the phone waits for a build phase (D4). Called on every refusal. */
  onSeatKept(): void;
  /** No seat to take back (the run ended, the room is gone, or the give-up time passed). */
  onGone(): void;
  now(): number;
  /** Runs `fn` after `ms`; returns a cancel. */
  schedule(fn: () => void, ms: number): () => void;
}

/**
 * AC 6, 9: takes a seat back with fresh joins until it works. One attempt in flight at a time;
 * `seat_kept` retries every `seatRetryMs` (for as long as the player waits: D4), a network failure
 * every `retryMs` until `giveUpMs` after `start()`. `cancel()` (the token reconnect won, or Leave)
 * stops it; a successful join that arrives after `cancel()` is handed to `onLate` (see there).
 */
export class SeatRecovery<R> {
  private running = false;
  private startedMs = 0;
  private cancelTimer: (() => void) | null = null;
  private epoch = 0;
  /** Attempts made (tests and the overlay). */
  attempts = 0;
  constructor(
    private readonly deps: RecoveryDeps<R>,
    /**
     * A room joined by an attempt that was cancelled meanwhile (the SDK's token reconnect won first,
     * or the player pressed Leave). The server's rule is "the newest connection takes the seat" (D5),
     * and a takeover that succeeded is always the newest: it HOLDS the seat now (the token-reconnected
     * socket was closed with 4021). Adopt it, unless the player left on purpose (then leave it,
     * consented). Never close it non-consented and walk away (the seat would sit on hold).
     */
    private readonly onLate: (room: R) => void = () => {},
  ) {}

  get active(): boolean {
    return this.running;
  }

  start(): void {
    if (this.running) return;
    this.running = true;
    this.startedMs = this.deps.now();
    this.attempt();
  }

  cancel(): void {
    this.running = false;
    this.epoch++;
    this.cancelTimer?.();
    this.cancelTimer = null;
  }

  /**
   * An attempt is waiting for its answer. One at a time, and never timed out: a cut line holds the
   * request until it is whole again (then it answers at once), and two takeovers in flight from the
   * same phone would fight over the seat.
   */
  get inFlight(): boolean {
    return this.pending;
  }

  private pending = false;

  private attempt(): void {
    const epoch = ++this.epoch;
    this.cancelTimer = null;
    this.attempts++;
    this.pending = true;
    const settle = (r: RecoveryJoin<R>): void => {
      this.pending = false;
      this.answer(epoch, r);
    };
    void this.deps.join().then(settle, () => settle({ ok: false, reason: "network" }));
  }

  private answer(epoch: number, r: RecoveryJoin<R>): void {
    if (epoch !== this.epoch || !this.running) {
      if (r.ok) this.onLate(r.room);
      return;
    }
    if (r.ok) {
      this.running = false;
      this.deps.onRecovered(r.room);
      return;
    }
    if (r.reason === "gone" || (r.reason === "network" && this.deps.now() - this.startedMs > RECONNECT.giveUpMs)) {
      this.running = false;
      this.deps.onGone();
      return;
    }
    if (r.reason === "seat_kept") this.deps.onSeatKept();
    this.cancelTimer = this.deps.schedule(() => this.attempt(), r.reason === "seat_kept" ? RECONNECT.seatRetryMs : RECONNECT.retryMs);
  }
}

/**
 * AC 7 (WebKit 308073, D6: any browser): a page that was hidden longer than `hiddenRescueMs` and
 * whose reconnect has still not opened `rescueOpenMs` after it was shown again reloads (the
 * sessionStorage seat then takes it straight back). `hiddenForMs` is how long the last hide lasted.
 */
export function shouldRescueReload(hiddenForMs: number, shownForMs: number, reconnecting: boolean): boolean {
  return reconnecting && hiddenForMs > RECONNECT.hiddenRescueMs && shownForMs >= RECONNECT.rescueOpenMs;
}

/** Close codes (mirrors `apps/server/src/net/limits.ts`): not consented, and not ones the SDK auto-reconnects on. */
export const CLOSE_SEAT_KEPT = 4020;
export const CLOSE_TAKEN_OVER = 4021;
