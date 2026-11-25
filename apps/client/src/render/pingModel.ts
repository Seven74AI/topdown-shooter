import { MAX_PLAYERS, PING_KINDS, PING_SHOW_MS, TICK_RATE_HZ } from "@topdown/shared";

/**
 * Story 8.7 (AC 6): the pings on this device — one live ping per slot (D15: a new one replaces the old one), shown for
 * `PING_SHOW_MS` (4 s). Pure and preallocated (4 slots, no allocation per message or per frame, brief 7). Never World
 * state (P5): nothing in the sim, the Predictor or a replay reads it.
 *
 * Timing (decision 8.7 B4): messages arrive outside frames, so arrival and frame times are both read from the same
 * monotonic clock (`performance.now()` in the game, passed in here). A ping's age is the larger of how long it waited in
 * the inbox and how many server ticks old it is by the host's tick estimate; one older than 4 s (a hidden tab waking,
 * a long TCP stall) is never shown, and a younger one shows only for what is left of its 4 s.
 */
export interface PingSlot {
  /** −1 = no ping in this slot. */
  kind: number;
  /** World metres (the server's stamp: the sender's position). */
  x: number;
  y: number;
  /** When it started on this device (clock ms; it ends `PING_SHOW_MS` later). */
  startMs: number;
}

interface Pending {
  has: boolean;
  kind: number;
  x: number;
  y: number;
  tick: number;
  atMs: number;
}

const isInt = (v: unknown, lo: number, hi: number): v is number => typeof v === "number" && Number.isInteger(v) && v >= lo && v <= hi;

export class PingModel {
  readonly slots: readonly PingSlot[];
  private readonly pending: readonly Pending[];
  /** Pings dropped as too old (> 4 s) since the model was made (debug / tests). */
  staleDropped = 0;

  constructor() {
    const s: PingSlot[] = [];
    const p: Pending[] = [];
    for (let i = 0; i < MAX_PLAYERS; i++) {
      s.push({ kind: -1, x: 0, y: 0, startMs: Number.NEGATIVE_INFINITY });
      p.push({ has: false, kind: 0, x: 0, y: 0, tick: 0, atMs: 0 });
    }
    this.slots = s;
    this.pending = p;
  }

  /** A `ping.shown` payload `[slot, kindIdx, xDm, yDm, tick]` (decimetres) that arrived at `atMs`; anything malformed is ignored. */
  receive(m: unknown, atMs: number): void {
    if (!Array.isArray(m) || m.length !== 5) return;
    const [slot, kind, x, y, tick] = m as unknown[];
    if (!isInt(slot, 0, MAX_PLAYERS - 1) || !isInt(kind, 0, PING_KINDS.length - 1) || !isInt(x, -1e6, 1e6) || !isInt(y, -1e6, 1e6) || !isInt(tick, 0, Number.MAX_SAFE_INTEGER)) return;
    const q = this.pending[slot] as Pending;
    q.has = true; // a second one from the same slot before the next frame replaces it (one live ping per player)
    q.kind = kind;
    q.x = x / 10;
    q.y = y / 10;
    q.tick = tick;
    q.atMs = atMs;
  }

  /**
   * Shows `slot`'s ping now (replacing its old one) unless it is already `ageMs` ≥ 4 s old. Returns whether it shows.
   */
  show(slot: number, kind: number, x: number, y: number, nowMs: number, ageMs = 0): boolean {
    const s = this.slots[slot];
    if (!s) return false;
    if (ageMs >= PING_SHOW_MS) {
      this.staleDropped++;
      return false;
    }
    s.kind = kind;
    s.x = x;
    s.y = y;
    s.startMs = nowMs - Math.max(0, ageMs);
    return true;
  }

  /**
   * One frame: shows what arrived since the last frame (each slot's newest), then expires old pings. `serverTick`: the
   * host's server-tick estimate now (≤ 0 = unknown). Returns a bit per slot whose ping started this frame (the sound).
   */
  update(nowMs: number, serverTick: number): number {
    let started = 0;
    for (let i = 0; i < MAX_PLAYERS; i++) {
      const q = this.pending[i] as Pending;
      if (q.has) {
        q.has = false;
        const waited = nowMs - q.atMs;
        const ticksOld = serverTick > 0 ? ((serverTick - q.tick) * 1000) / TICK_RATE_HZ : 0;
        if (this.show(i, q.kind, q.x, q.y, nowMs, Math.max(waited, ticksOld))) started |= 1 << i;
      }
    }
    this.expire(nowMs);
    return started;
  }

  /** Ends every ping shown `PING_SHOW_MS` or longer ago. */
  expire(nowMs: number): void {
    for (const s of this.slots) if (s.kind >= 0 && nowMs - s.startMs >= PING_SHOW_MS) s.kind = -1;
  }

  /** `slot`'s live ping (kind ≥ 0), or null. */
  live(slot: number): Readonly<PingSlot> | null {
    const s = this.slots[slot];
    return s && s.kind >= 0 ? s : null;
  }

  /** A player left (`player.left`): their ping goes. */
  clearSlot(slot: number): void {
    const s = this.slots[slot];
    if (s) s.kind = -1;
    const q = this.pending[slot];
    if (q) q.has = false;
  }

  /** The lobby, Results, the end of the session. */
  clearAll(): void {
    for (let i = 0; i < MAX_PLAYERS; i++) this.clearSlot(i);
  }
}
