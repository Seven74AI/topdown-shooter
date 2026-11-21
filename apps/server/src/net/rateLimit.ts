import { MAX_ROOM_CREATES_PER_MIN, ROOM_CREATE_WINDOW_MS } from "./limits";

/**
 * Sliding-window limiter keyed by a string (an IP for room creation, Story 2.2): at most `limit`
 * allowed calls per key in any `windowMs`. Refused calls are not counted. Expired entries (and
 * keys left empty) are pruned on every call, so the map only holds keys active in the last window.
 */
export class SlidingWindowLimiter {
  private readonly hits = new Map<string, number[]>();

  constructor(
    private readonly limit: number,
    private readonly windowMs: number,
    private readonly now: () => number = Date.now,
  ) {}

  /** Records a call for `key` and returns true, or returns false when `key` is over the limit. */
  allow(key: string): boolean {
    const now = this.now();
    this.prune(now);
    const times = this.hits.get(key) ?? [];
    if (times.length >= this.limit) return false;
    times.push(now);
    this.hits.set(key, times);
    return true;
  }

  /** Keys with entries still in the window. */
  get size(): number {
    return this.hits.size;
  }

  reset(): void {
    this.hits.clear();
  }

  private prune(now: number): void {
    const cutoff = now - this.windowMs;
    for (const [key, times] of this.hits) {
      // Entries are in time order: drop the expired prefix.
      let i = 0;
      while (i < times.length && (times[i] as number) <= cutoff) i++;
      if (i === times.length) this.hits.delete(key);
      else if (i > 0) times.splice(0, i);
    }
  }
}

/**
 * Room creations per client IP (Story 2.2 AC 3), on the server clock. One per process; the test
 * helper resets it between tests.
 */
export const roomCreateLimiter = new SlidingWindowLimiter(MAX_ROOM_CREATES_PER_MIN, ROOM_CREATE_WINDOW_MS);
