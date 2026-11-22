/** Pending expectations (and early confirmations) kept at most (Story 2.7). */
export const REVERSED_HITS_RING = 64;
/** Slack added to RTT + render delay before an unconfirmed apparent hit counts as reversed (ms). */
export const REVERSED_HIT_SLACK_MS = 300;

/** The counters on `NetSimHost.netStats` and the perf overlay. */
export interface HitCounts {
  /** Apparent hits of my cosmetic projectiles on mirror zombies that were tracked. */
  apparentHits: number;
  /** Of those, confirmed by a server `zombie.hit` with me as source and the same net id. */
  confirmed: number;
  /** Of those, unconfirmed past their deadline: the shot looked like a hit, the server said miss. */
  reversed: number;
}

/** Story 2.7: `hits 212 · reversed 4 (1.9%)` (reversed as a share of my apparent hits). */
export function hitsLine(h: HitCounts): string {
  const pct = h.apparentHits > 0 ? (100 * h.reversed) / h.apparentHits : 0;
  return `hits ${h.apparentHits} · reversed ${h.reversed} (${pct.toFixed(1)}%)`;
}

/**
 * Reversed-hit counter (Story 2.7, AC 4; read by Story 2.10). Only my own cosmetic projectiles
 * take part:
 *
 * - `apparent(netId, nowMs, windowMs)`: my bullet first crossed the mirror zombie with that full
 *   net id (`slot | generation << 8`, so a reused slot never matches an old zombie). It becomes an
 *   expectation with deadline `now + windowMs` (NetSimHost passes RTT + delay + 300 ms).
 * - `serverHit(netId, nowMs, windowMs)`, on arrival: a server `zombie.hit` from me confirms the
 *   oldest matching expectation. With a low RTT the server's hit can arrive before my bullet
 *   reaches the drawn zombie (which is 100–150 ms behind), so an unmatched hit is kept until its
 *   own deadline and confirms an expectation that comes later.
 * - `serverKilled(netId)`, on arrival, any killer: that zombie is dead on the server. A later
 *   apparent hit on its still-drawn body (unless an early hit of mine on it is still unmatched) (the death plays at the render tick) is not tracked,
 *   and pending expectations on it are dropped: the player sees it die, nothing is reversed.
 *   (Confirmation uses `zombie.hit` only: a killing shot sends both, and counting both would
 *   confirm twice.)
 * - `update(nowMs)`: expectations past their deadline count as `reversed`.
 *
 * Server hits I didn't see coming count neither way. Fixed rings, no allocation.
 */
export class ReversedHits {
  readonly counts: HitCounts = { apparentHits: 0, confirmed: 0, reversed: 0 };
  private readonly expId = new Int32Array(REVERSED_HITS_RING).fill(-1);
  private readonly expDue = new Float64Array(REVERSED_HITS_RING);
  private expNext = 0;
  private readonly hitId = new Int32Array(REVERSED_HITS_RING).fill(-1);
  private readonly hitDue = new Float64Array(REVERSED_HITS_RING);
  private hitNext = 0;
  private readonly deadIds = new Int32Array(REVERSED_HITS_RING).fill(-1);
  private deadNext = 0;

  apparent(netId: number, nowMs: number, windowMs: number): void {
    // An early hit from me first: the killing shot's hit and kill both arrive before my bullet.
    const early = this.oldest(this.hitId, this.hitDue, netId, nowMs);
    if (early >= 0) {
      this.hitId[early] = -1;
      this.counts.apparentHits++;
      this.counts.confirmed++;
      return;
    }
    if (this.isDead(netId)) return;
    this.counts.apparentHits++;
    // A full ring overwrites the oldest slot: its expectation is dropped (counted neither way).
    this.expId[this.expNext] = netId;
    this.expDue[this.expNext] = nowMs + windowMs;
    this.expNext = (this.expNext + 1) % REVERSED_HITS_RING;
  }

  serverHit(netId: number, nowMs: number, windowMs: number): void {
    const k = this.oldest(this.expId, this.expDue, netId, nowMs);
    if (k >= 0) {
      this.expId[k] = -1;
      this.counts.confirmed++;
      return;
    }
    this.hitId[this.hitNext] = netId;
    this.hitDue[this.hitNext] = nowMs + windowMs;
    this.hitNext = (this.hitNext + 1) % REVERSED_HITS_RING;
  }

  serverKilled(netId: number): void {
    this.deadIds[this.deadNext] = netId;
    this.deadNext = (this.deadNext + 1) % REVERSED_HITS_RING;
    for (let i = 0; i < REVERSED_HITS_RING; i++) if (this.expId[i] === netId) this.expId[i] = -1;
  }

  /** Counts expectations past their deadline as reversed; forgets stale early hits. */
  update(nowMs: number): void {
    for (let i = 0; i < REVERSED_HITS_RING; i++) {
      if ((this.expId[i] as number) >= 0 && (this.expDue[i] as number) < nowMs) {
        this.expId[i] = -1;
        this.counts.reversed++;
      }
      if ((this.hitId[i] as number) >= 0 && (this.hitDue[i] as number) < nowMs) this.hitId[i] = -1;
    }
  }

  reset(): void {
    this.expId.fill(-1);
    this.hitId.fill(-1);
    this.deadIds.fill(-1);
    this.counts.apparentHits = 0;
    this.counts.confirmed = 0;
    this.counts.reversed = 0;
  }

  private isDead(netId: number): boolean {
    for (let i = 0; i < REVERSED_HITS_RING; i++) if (this.deadIds[i] === netId) return true;
    return false;
  }

  /** The matching live entry with the earliest deadline (= the oldest), or -1. */
  private oldest(ids: Int32Array, due: Float64Array, netId: number, nowMs: number): number {
    let best = -1;
    for (let i = 0; i < REVERSED_HITS_RING; i++) {
      if (ids[i] !== netId || (due[i] as number) < nowMs) continue;
      if (best < 0 || (due[i] as number) < (due[best] as number)) best = i;
    }
    return best;
  }
}
