/**
 * A token bucket rate limit (Story 2.1): holds up to `capacity` tokens and refills `refillPerS`
 * per second. A bucket, not a 1-second window, so the burst after a 4G stall is accepted while a
 * sustained flood is not. Time is passed in (the room clock), so tests need no real waiting.
 */
export class TokenBucket {
  private tokens: number;
  private lastMs: number;

  constructor(
    readonly capacity: number,
    readonly refillPerS: number,
    nowMs: number,
  ) {
    this.tokens = capacity;
    this.lastMs = nowMs;
  }

  /** Takes one token if there is one. */
  take(nowMs: number): boolean {
    if (nowMs > this.lastMs) {
      this.tokens = Math.min(this.capacity, this.tokens + ((nowMs - this.lastMs) * this.refillPerS) / 1000);
      this.lastMs = nowMs;
    }
    if (this.tokens < 1) return false;
    this.tokens -= 1;
    return true;
  }
}
