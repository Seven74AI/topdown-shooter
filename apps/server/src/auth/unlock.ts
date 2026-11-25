/**
 * Story 7.3 (AC 5; U2, U3, U5; brief 15, 18): buying one unlock with Supplies. The account comes from the guest
 * cookie only (never an id in the body); the price comes from the server's `progression.json` (never the body); the
 * purchase is one conditional update in the repository (balance never below 0, never bought twice). A repeated
 * `requestId` from the same account within 10 min gets the first answer (in-memory, capped; an answer still in flight
 * is shared, so a double-submit with one id runs the database once). Logs `unlocked {accountId, unlockId, price,
 * suppliesAfter}`; never a token or a cookie.
 */
import { TRAINING_BOOSTS, findUnlock, guestTokenSchema, levelOf, type ProgressView, type UnlockResponse } from "@topdown/shared";
import type { AccountsRepo } from "../db/accountsRepo";
import type { Progress, ProgressRepo } from "../db/progressRepo";
import { UNLOCK_REQUEST_CAP, UNLOCK_REQUEST_TTL_MS } from "../net/limits";
import { ipKey, type SlidingWindowLimiter } from "../net/rateLimit";
import { log } from "../ops/logger";
import { hashGuestToken } from "../run/lobby";

export interface UnlockDeps {
  accounts: AccountsRepo;
  progress: ProgressRepo;
  /** Checked by the route (`unlockIpAllowed`) before the body is parsed (review F9). */
  ipLimiter: SlidingWindowLimiter;
  accountLimiter: SlidingWindowLimiter;
  logGate: SlidingWindowLimiter;
  requests: RequestMemo;
}

export interface UnlockInput {
  cookieToken: string | null | undefined;
  unlockId: string;
  requestId: string;
  ip: string;
}

/** What the route answers: an HTTP status and, for 200, the body. */
export type UnlockOutcome =
  | { status: 200; body: UnlockResponse }
  | { status: 400 | 401 | 429 | 503; error: "unknown_unlock" | "no_account" | "rate_limited" | "save_unavailable" };

export const toView = (p: Progress): ProgressView => ({
  supplies: p.supplies,
  lifetimeSupplies: p.lifetimeSupplies,
  unlocks: [...p.unlocks],
  training: trainingView(p.training), // Story 7.5 (AC 3)
  districts: [...p.districts], // Story 7.7
  cosmetics: [...p.cosmetics], // Story 7.11
});

/** Story 7.5: the saved levels of the four boosts (clamped; absent = 0), never anything else from the jsonb. */
export function trainingView(t: Readonly<Record<string, unknown>> | null | undefined): Record<string, number> {
  const out: Record<string, number> = {};
  for (const id of TRAINING_BOOSTS) out[id] = levelOf(t, id);
  return out;
}

/**
 * The request-id memo (U3): `accountId:requestId` → the answer (a promise, so a second call while the first is still
 * in the database waits for it). Entries live `ttlMs`; at most `cap` (the oldest go first). A failed call is forgotten,
 * so its retry runs again (the conditional update still can't charge twice).
 */
export class RequestMemo<T = UnlockOutcome> {
  private readonly entries = new Map<string, { atMs: number; answer: Promise<T> }>();

  constructor(
    private readonly ttlMs = UNLOCK_REQUEST_TTL_MS,
    private readonly cap = UNLOCK_REQUEST_CAP,
    private readonly now: () => number = Date.now,
  ) {}

  get(key: string): Promise<T> | undefined {
    this.prune();
    return this.entries.get(key)?.answer;
  }

  set(key: string, answer: Promise<T>): void {
    this.prune();
    this.entries.delete(key);
    this.entries.set(key, { atMs: this.now(), answer });
    while (this.entries.size > this.cap) {
      const oldest = this.entries.keys().next().value as string;
      this.entries.delete(oldest);
    }
  }

  delete(key: string): void {
    this.entries.delete(key);
  }

  get size(): number {
    return this.entries.size;
  }

  clear(): void {
    this.entries.clear();
  }

  private prune(): void {
    const cutoff = this.now() - this.ttlMs;
    for (const [key, e] of this.entries) {
      if (e.atMs > cutoff) break; // insertion order = time order
      this.entries.delete(key);
    }
  }
}

/** One process-wide memo (the server is one process); tests make their own or clear this one. */
export const unlockRequests = new RequestMemo();

/**
 * Review F9 (brief 15): the per-IP limit, first thing in the route (before the body is parsed or the database is
 * touched); a refused call is logged once per IP per minute.
 */
export function unlockIpAllowed(ip: string, deps: Pick<UnlockDeps, "ipLimiter" | "logGate">): boolean {
  if (deps.ipLimiter.allow(ip)) return true;
  if (deps.logGate.allow(`unlock:${ipKey(ip)}`)) log.warn({ ip }, "unlock_rate_limited");
  return false;
}

/** Review F9: a refused body or unknown id is logged (once per IP and reason per minute), never silently dropped. */
export function refused(ip: string, reason: "invalid_body" | "unknown_unlock", logGate: SlidingWindowLimiter): void {
  if (logGate.allow(`unlock_${reason}:${ipKey(ip)}`)) log.warn({ ip, reason }, "unlock_refused");
}

export async function buyUnlock(input: UnlockInput, deps: UnlockDeps): Promise<UnlockOutcome> {
  // Review F9: the per-IP limit is checked by the route before the body is even read (`unlockIpAllowed`).
  const unlock = findUnlock(input.unlockId);
  if (unlock === undefined) {
    refused(input.ip, "unknown_unlock", deps.logGate);
    return { status: 400, error: "unknown_unlock" };
  }
  const token = guestTokenSchema.safeParse(input.cookieToken);
  if (!token.success) return { status: 401, error: "no_account" };
  let accountId: string;
  try {
    const account = await deps.accounts.findByTokenHash(hashGuestToken(token.data));
    if (account === null) return { status: 401, error: "no_account" };
    accountId = account.id;
  } catch {
    return { status: 503, error: "save_unavailable" }; // already logged as db_error by the repository
  }
  const key = `${accountId}:${input.requestId}`;
  const earlier = deps.requests.get(key);
  if (earlier !== undefined) return earlier;
  if (!deps.accountLimiter.allow(accountId)) {
    if (deps.logGate.allow(`unlock:${accountId}`)) log.warn({ accountId }, "unlock_rate_limited");
    return { status: 429, error: "rate_limited" };
  }
  const answer = run(accountId, unlock.id, unlock.price, deps);
  deps.requests.set(key, answer);
  const result = await answer;
  if (result.status !== 200) deps.requests.delete(key);
  return result;
}

async function run(accountId: string, unlockId: string, price: number, deps: UnlockDeps): Promise<UnlockOutcome> {
  try {
    const r = await deps.progress.unlock(accountId, unlockId, price);
    const progress = toView(r.progress);
    if (r.outcome === "unlocked") {
      log.info({ accountId, unlockId, price, suppliesAfter: progress.supplies }, "unlocked");
      return { status: 200, body: { ok: true, unlockId, progress } };
    }
    if (r.outcome === "already_unlocked") return { status: 200, body: { ok: false, unlockId, reason: "already_unlocked", progress } };
    return { status: 200, body: { ok: false, unlockId, reason: "not_enough", need: r.need, progress } };
  } catch {
    return { status: 503, error: "save_unavailable" };
  }
}
