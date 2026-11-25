/**
 * Story 7.5 (AC 3; T3; brief 15, 18): buying one Training level with Supplies, the 7.3 unlock route's pattern. The
 * account comes from the guest cookie only; the cost (`costPerLevel × level`) and the cap come from the server's
 * `progression.json`, never the body; the purchase is one conditional update (`progressRepo.train`): exactly `level`
 * when it is the current level + 1, the balance never below 0, one level per double tap or two phones. A repeated
 * `requestId` from the same account within 10 min gets the first answer. Logs `trained {accountId, boost, level, cost}`.
 */
import { PROGRESSION, guestTokenSchema, trainingCost, type TrainResponse, type TrainingBoostId } from "@topdown/shared";
import type { AccountsRepo } from "../db/accountsRepo";
import type { ProgressRepo } from "../db/progressRepo";
import { ipKey, type SlidingWindowLimiter } from "../net/rateLimit";
import { log } from "../ops/logger";
import { hashGuestToken } from "../run/lobby";
import { RequestMemo, toView } from "./unlock";

export interface TrainDeps {
  accounts: AccountsRepo;
  progress: ProgressRepo;
  ipLimiter: SlidingWindowLimiter;
  accountLimiter: SlidingWindowLimiter;
  logGate: SlidingWindowLimiter;
  requests: RequestMemo<TrainOutcome>;
}

export interface TrainInput {
  cookieToken: string | null | undefined;
  boost: TrainingBoostId;
  level: number;
  requestId: string;
  ip: string;
}

export type TrainOutcome = { status: 200; body: TrainResponse } | { status: 401 | 429 | 503; error: "no_account" | "rate_limited" | "save_unavailable" };

/** One process-wide memo (the server is one process); tests make their own. */
export const trainRequests = new RequestMemo<TrainOutcome>();

/** Brief 15: the per-IP limit, first thing in the route (before the body is parsed or the database is touched). */
export function trainIpAllowed(ip: string, deps: Pick<TrainDeps, "ipLimiter" | "logGate">): boolean {
  if (deps.ipLimiter.allow(ip)) return true;
  if (deps.logGate.allow(`train:${ipKey(ip)}`)) log.warn({ ip }, "train_rate_limited");
  return false;
}

/** A refused body is logged once per IP per minute. */
export function trainRefused(ip: string, logGate: SlidingWindowLimiter): void {
  if (logGate.allow(`train_invalid_body:${ipKey(ip)}`)) log.warn({ ip, reason: "invalid_body" }, "train_refused");
}

export async function buyTraining(input: TrainInput, deps: TrainDeps): Promise<TrainOutcome> {
  const token = guestTokenSchema.safeParse(input.cookieToken);
  if (!token.success) return { status: 401, error: "no_account" };
  let accountId: string;
  try {
    const account = await deps.accounts.findByTokenHash(hashGuestToken(token.data));
    if (account === null) return { status: 401, error: "no_account" };
    accountId = account.id;
  } catch {
    return { status: 503, error: "save_unavailable" };
  }
  const key = `${accountId}:${input.requestId}`;
  const earlier = deps.requests.get(key);
  if (earlier !== undefined) return earlier;
  if (!deps.accountLimiter.allow(accountId)) {
    if (deps.logGate.allow(`train:${accountId}`)) log.warn({ accountId }, "train_rate_limited");
    return { status: 429, error: "rate_limited" };
  }
  const answer = run(accountId, input.boost, input.level, deps);
  deps.requests.set(key, answer);
  const result = await answer;
  if (result.status !== 200) deps.requests.delete(key);
  return result;
}

async function run(accountId: string, boost: TrainingBoostId, level: number, deps: TrainDeps): Promise<TrainOutcome> {
  const maxLevel = PROGRESSION.training.maxLevel;
  const cost = trainingCost(Math.min(level, maxLevel));
  try {
    const r = await deps.progress.train(accountId, boost, level, cost, maxLevel);
    const progress = toView(r.progress);
    if (r.outcome === "trained") {
      log.info({ accountId, boost, level, cost, suppliesAfter: progress.supplies }, "trained");
      return { status: 200, body: { ok: true, boost, level, progress } };
    }
    if (r.outcome === "not_enough") return { status: 200, body: { ok: false, boost, reason: "not_enough", need: r.need, progress } };
    return { status: 200, body: { ok: false, boost, reason: r.outcome, progress } };
  } catch {
    return { status: 503, error: "save_unavailable" };
  }
}
