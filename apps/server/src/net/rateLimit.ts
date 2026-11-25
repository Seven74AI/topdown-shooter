import { isIPv4, isIPv6 } from "node:net";
import {
  ACCOUNT_SESSION_WINDOW_MS,
  MAX_ACCOUNT_SESSIONS_PER_MIN,
  MAX_NEW_GUESTS_PER_HOUR,
  MAX_ROOM_CREATES_PER_MIN,
  NEW_GUEST_WINDOW_MS,
  ROOM_CREATE_WINDOW_MS,
  MAX_UNLOCKS_PER_ACCOUNT_PER_MIN,
  MAX_UNLOCK_CALLS_PER_IP_PER_MIN,
  UNLOCK_WINDOW_MS,
} from "./limits";

/**
 * The key a client IP is rate-limited under (Story 2.2 review). One home or phone connection on
 * IPv6 usually gets a whole /64 and can pick any address in it, so IPv6 is keyed by its /64 prefix
 * (`2001:db8:1:2::/64`). An IPv4-mapped IPv6 address (`::ffff:1.2.3.4`) is keyed by its IPv4.
 * IPv4, and anything that is not an IP (`"unknown"`, garbage in a header), is used as given.
 */
export function ipKey(ip: string): string {
  let addr = ip.trim();
  if (addr.startsWith("[") && addr.endsWith("]")) addr = addr.slice(1, -1);
  const zone = addr.indexOf("%");
  if (zone !== -1) addr = addr.slice(0, zone);
  if (isIPv4(addr)) return addr;
  if (!isIPv6(addr)) return ip;
  const groups = expandIPv6(addr.toLowerCase());
  // ::ffff:a.b.c.d (and its hex spelling ::ffff:0102:0304) is IPv4 on a dual-stack socket.
  if (groups.slice(0, 5).every((g) => g === 0) && groups[5] === 0xffff) {
    const hi = groups[6] as number;
    const lo = groups[7] as number;
    return `${hi >> 8}.${hi & 0xff}.${lo >> 8}.${lo & 0xff}`;
  }
  const prefix = groups.slice(0, 4).map((g) => g.toString(16));
  return `${prefix.join(":")}::/64`;
}

/** The eight 16-bit groups of a valid IPv6 address (`::` expanded, a trailing IPv4 split in two). */
function expandIPv6(addr: string): number[] {
  const parse = (part: string): number[] =>
    part === ""
      ? []
      : part.split(":").flatMap((g) => {
          if (!g.includes(".")) return [parseInt(g, 16)];
          const [a = 0, b = 0, c = 0, d = 0] = g.split(".").map(Number);
          return [(a << 8) | b, (c << 8) | d];
        });
  const [head = "", tail] = addr.split("::");
  const left = parse(head);
  if (tail === undefined) return left;
  const right = parse(tail);
  return [...left, ...new Array<number>(8 - left.length - right.length).fill(0), ...right];
}

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
    /** Maps a caller's key to the bucket it counts against (e.g. `ipKey`). */
    private readonly keyOf: (key: string) => string = (key) => key,
  ) {}

  /** Records a call for `key` and returns true, or returns false when `key` is over the limit. */
  allow(rawKey: string): boolean {
    const key = this.keyOf(rawKey);
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
 * Room creations per client IP (Story 2.2 AC 3), on the server clock, keyed by `ipKey` (IPv6 per
 * /64). One per process; the test helper resets it between tests.
 */
export const roomCreateLimiter = new SlidingWindowLimiter(
  MAX_ROOM_CREATES_PER_MIN,
  ROOM_CREATE_WINDOW_MS,
  Date.now,
  ipKey,
);

/**
 * Story 7.1 (decision 7.1 D6): NEW guest accounts per client IP per hour (`/account/session`), keyed by `ipKey`.
 * Resolving an existing account is never limited. One per process; the test helper resets it between tests.
 */
export const newGuestLimiter = new SlidingWindowLimiter(MAX_NEW_GUESTS_PER_HOUR, NEW_GUEST_WINDOW_MS, Date.now, ipKey);

/** Story 7.1 review L4: every `/account/session` call per client IP per minute (before any database work). */
export const accountSessionLimiter = new SlidingWindowLimiter(MAX_ACCOUNT_SESSIONS_PER_MIN, ACCOUNT_SESSION_WINDOW_MS, Date.now, ipKey);

/** Story 7.3: `/account/unlock` calls per client IP per minute (before any database work). */
export const unlockIpLimiter = new SlidingWindowLimiter(MAX_UNLOCK_CALLS_PER_IP_PER_MIN, UNLOCK_WINDOW_MS, Date.now, ipKey);

/** Story 7.3 (AC 5): `/account/unlock` calls per account (id) per minute. */
export const unlockAccountLimiter = new SlidingWindowLimiter(MAX_UNLOCKS_PER_ACCOUNT_PER_MIN, UNLOCK_WINDOW_MS, Date.now, (key) => key);

/** Story 7.1 review L4: a rate-limit warning is logged at most once per IP and kind per minute (a flood can't push real logs out). */
export const rateLimitLogGate = new SlidingWindowLimiter(1, ACCOUNT_SESSION_WINDOW_MS, Date.now, (key) => key);
