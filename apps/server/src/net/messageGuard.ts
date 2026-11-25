import { DROP_LOG_INTERVAL_MS, MAX_GHOST_MESSAGES_PER_S, MAX_INPUTS_PER_S, MAX_OTHER_MESSAGES_PER_S, PING_PER_S } from "./limits";
import { TokenBucket } from "./tokenBucket";

/**
 * Client message hygiene (Story 2.1, AC 5). Every handler goes through `guard(schema, handler)`:
 * a rate check, then `safeParse`. A message that fails either is dropped (the client stays
 * connected) and counted. Never pass a schema to `room.onMessage(type, schema, cb)`: in Colyseus
 * 0.18 a failed validation there disconnects the client.
 */
export type DropReason = "invalid" | "unknown_type" | "rate" | "too_large";
const DROP_REASONS: readonly DropReason[] = ["invalid", "unknown_type", "rate", "too_large"];

/** `input.send` has its own bucket, Story 5.24's `building.ghost` and Story 8.7's `ping.send` too; every other type shares one. */
export type MessageBucket = "input" | "other" | "ghost" | "ping";

/** The part of a zod schema the guard uses (zod's `safeParse` result fits it). */
export interface SafeParser<T> {
  safeParse(value: unknown): { success: true; data: T } | { success: false };
}

export interface GuardLogger {
  warn(obj: object, msg: string): void;
}

interface GuardClient {
  readonly sessionId: string;
}

/** Per-client state: three buckets and drop counters, logged at most once per reason per window. */
class ClientGuard {
  readonly input: TokenBucket;
  readonly other: TokenBucket;
  readonly ghost: TokenBucket;
  /** Story 8.7 (E8-P5): 1/s, burst 1. */
  readonly ping: TokenBucket;
  readonly dropped: Record<DropReason, number> = { invalid: 0, unknown_type: 0, rate: 0, too_large: 0 };
  readonly lastLogMs: Record<DropReason, number> = {
    invalid: -Infinity,
    unknown_type: -Infinity,
    rate: -Infinity,
    too_large: -Infinity,
  };

  constructor(
    readonly playerId: string,
    nowMs: number,
  ) {
    this.input = new TokenBucket(MAX_INPUTS_PER_S, MAX_INPUTS_PER_S, nowMs);
    this.other = new TokenBucket(MAX_OTHER_MESSAGES_PER_S, MAX_OTHER_MESSAGES_PER_S, nowMs);
    this.ghost = new TokenBucket(MAX_GHOST_MESSAGES_PER_S, MAX_GHOST_MESSAGES_PER_S, nowMs);
    this.ping = new TokenBucket(PING_PER_S, PING_PER_S, nowMs);
  }
}

export class MessageGuard<C extends GuardClient> {
  private readonly clients = new Map<string, ClientGuard>();

  constructor(
    private readonly now: () => number,
    private readonly log: GuardLogger,
  ) {}

  /**
   * Starts tracking a client (call in `onJoin`). Story 8.1 review L2: with `keep`, an existing guard
   * for the same session (a reconnect) is kept: its buckets and drop counters carry over.
   */
  add(client: C, playerId: string, keep = false): void {
    if (keep && this.clients.has(client.sessionId)) return;
    this.clients.set(client.sessionId, new ClientGuard(playerId, this.now()));
  }

  /** Story 8.1 review L2: a seat taken over by a new session keeps its guard (no fresh buckets by reconnecting). */
  rename(fromSessionId: string, toSessionId: string): void {
    const g = this.clients.get(fromSessionId);
    if (!g) return;
    this.clients.delete(fromSessionId);
    this.clients.set(toSessionId, g);
  }

  /** Stops tracking a client and logs drops not reported yet (call in `onLeave`). */
  remove(client: C): void {
    const g = this.clients.get(client.sessionId);
    if (!g) return;
    for (const reason of DROP_REASONS) if (g.dropped[reason] > 0) this.report(g, reason, this.now());
    this.clients.delete(client.sessionId);
  }

  /** Wraps a handler: rate check, then validation; the handler only sees valid messages. */
  guard<T>(
    schema: SafeParser<T>,
    handler: (client: C, message: T) => void,
    bucket: MessageBucket = "other",
    /** Story 2.12 re-review M-B: told about each message the rate bucket dropped (unvalidated). */
    onRateDrop?: (client: C, message: unknown) => void,
  ): (client: C, message: unknown) => void {
    return (client, message) => {
      const g = this.clients.get(client.sessionId);
      if (!g) return; // not joined (or already left): nothing to deliver to
      const now = this.now();
      if (!g[bucket].take(now)) {
        onRateDrop?.(client, message);
        return this.count(g, "rate", now);
      }
      const parsed = schema.safeParse(message);
      if (!parsed.success) return this.count(g, "invalid", now);
      handler(client, parsed.data);
    };
  }

  /**
   * An unknown message type (the `"*"` handler): costs a token from the client's shared bucket like
   * any other message, then is dropped and counted.
   */
  unknown(client: C): void {
    const g = this.clients.get(client.sessionId);
    if (!g) return;
    const now = this.now();
    this.count(g, g.other.take(now) ? "unknown_type" : "rate", now);
  }

  /** Records a drop for a client (e.g. `too_large` from ws). */
  drop(client: C, reason: DropReason): void {
    const g = this.clients.get(client.sessionId);
    if (g) this.count(g, reason, this.now());
  }

  /** Drops counted and not yet logged, per reason (for tests). */
  pending(client: C): Readonly<Record<DropReason, number>> | undefined {
    return this.clients.get(client.sessionId)?.dropped;
  }

  private count(g: ClientGuard, reason: DropReason, now: number): void {
    g.dropped[reason]++;
    if (now - g.lastLogMs[reason] >= DROP_LOG_INTERVAL_MS) this.report(g, reason, now);
  }

  private report(g: ClientGuard, reason: DropReason, now: number): void {
    this.log.warn({ playerId: g.playerId, reason, dropped: g.dropped[reason] }, "client_message_rejected");
    g.dropped[reason] = 0;
    g.lastLogMs[reason] = now;
  }
}
