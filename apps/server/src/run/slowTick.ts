/** A tick slower than this is logged (architecture › Logging): 40 ms of the 50 ms budget. */
export const SLOW_TICK_MS = 40;
/** At most one `slow_tick` line per this window; the others are counted into the next line. */
export const SLOW_TICK_LOG_INTERVAL_MS = 1000;

/** Log line names: ticks, and Colyseus's patch interval (Story 2.5). */
export const SLOW_TICK_MESSAGE = "slow_tick";
export const SLOW_PATCH_MESSAGE = "slow_patch";

export interface SlowTickLogger {
  warn(obj: object, msg: string): void;
}

/**
 * Watches tick durations (Story 2.4, AC 5). A tick over SLOW_TICK_MS logs
 * `warn { roomId, tick, tickMs, count }`, at most once per second; `count` is how many slow ticks
 * happened since the last line, this one included. Also keeps the max and mean for tests and ops.
 * The room keeps a second one for patch encoding (`slow_patch`, Story 2.5), which Colyseus runs
 * on its own interval outside the tick.
 */
export class SlowTickWatch {
  private lastLogMs = -Infinity;
  private pending = 0;
  /** Ticks observed, total and max duration (ms). */
  ticks = 0;
  totalMs = 0;
  maxMs = 0;
  /** Story 2.10: the same since the last `takeWindow()` (one wave), plus the slow ones in it. */
  readonly window = { ticks: 0, totalMs: 0, maxMs: 0, slow: 0 };

  constructor(
    private readonly roomId: string,
    private readonly log: SlowTickLogger,
    private readonly now: () => number,
    private readonly message = SLOW_TICK_MESSAGE,
  ) {}

  observe(tickMs: number, tick: number): void {
    this.ticks++;
    this.totalMs += tickMs;
    if (tickMs > this.maxMs) this.maxMs = tickMs;
    const w = this.window;
    w.ticks++;
    w.totalMs += tickMs;
    if (tickMs > w.maxMs) w.maxMs = tickMs;
    if (!(tickMs > SLOW_TICK_MS)) return;
    w.slow++;
    this.pending++;
    const now = this.now();
    if (now - this.lastLogMs < SLOW_TICK_LOG_INTERVAL_MS) return;
    this.log.warn({ roomId: this.roomId, tick, tickMs: Math.round(tickMs * 10) / 10, count: this.pending }, this.message);
    this.lastLogMs = now;
    this.pending = 0;
  }

  /** Rounded window numbers for a log line (`tick_stats`, Story 2.10); the window restarts. */
  takeWindow(): { ticks: number; avgMs: number; maxMs: number; slow: number } {
    const w = this.window;
    const out = { ticks: w.ticks, avgMs: w.ticks === 0 ? 0 : round2(w.totalMs / w.ticks), maxMs: round2(w.maxMs), slow: w.slow };
    w.ticks = 0;
    w.totalMs = 0;
    w.maxMs = 0;
    w.slow = 0;
    return out;
  }

  get meanMs(): number {
    return this.ticks === 0 ? 0 : this.totalMs / this.ticks;
  }
}

const round2 = (n: number): number => Math.round(n * 100) / 100;
