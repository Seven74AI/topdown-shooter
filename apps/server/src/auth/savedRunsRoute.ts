/**
 * Story 8.6 (AC 11, D13): `POST /saved-runs` `{ deviceToken? }` on the Colyseus router (the browser calls `/api/saved-runs`;
 * a POST like 7.1's session route so the `localStorage` copy of the device token works where the cookie can't, builder
 * decision 8.6-B2): the caller's
 * resumable saved runs, newest first, at most 3 — `[{ id, district, wave, names: [{ name, slot }], savedAt, expiresAt }]`.
 * Authenticated exactly like 7.1's account routes: the `__Host-tdg` cookie (else the body's device token) names the
 * device, its row names the account (never an account id from the client). No cookie / no account → `[]` (nothing to show); database down → 503 (the
 * start screen shows "Couldn't load saved games" + Retry; Create, Join and Practice still work).
 */
import { createEndpoint } from "@colyseus/core";
import { GUEST_COOKIE, guestTokenSchema, type SavedRunSummary } from "@topdown/shared";
import type { AccountsRepo } from "../db/accountsRepo";
import type { SavedRunsRepo } from "../db/savedRunsRepo";
import { originAllowed } from "../net/origin";
import type { SlidingWindowLimiter } from "../net/rateLimit";
import { log } from "../ops/logger";
import { hashGuestToken } from "../run/lobby";

export const SAVED_RUNS_PATH = "/saved-runs";

export interface SavedRunsRouteDeps {
  accounts: AccountsRepo;
  saves: SavedRunsRepo;
  allowedOrigins: readonly string[];
  ipLimiter: SlidingWindowLimiter;
}

export type SavedRunsOutcome = { status: 200; body: SavedRunSummary[] } | { status: 429 | 503; error: string };

/** The list for a cookie token (pure of HTTP, for tests). */
export async function listSavedRuns(cookieToken: string | null | undefined, ip: string, deps: Omit<SavedRunsRouteDeps, "allowedOrigins">): Promise<SavedRunsOutcome> {
  if (!deps.ipLimiter.allow(ip)) return { status: 429, error: "rate_limited" };
  const token = guestTokenSchema.safeParse(cookieToken);
  if (!token.success) return { status: 200, body: [] };
  try {
    const account = await deps.accounts.findByTokenHash(hashGuestToken(token.data));
    if (account === null) return { status: 200, body: [] };
    const rows = await deps.saves.listForAccount(account.id);
    return { status: 200, body: rows.map((r) => ({ id: r.id, district: r.district, wave: r.wave, names: r.names.map((n) => ({ name: n.name.slice(0, 24), slot: n.slot })), savedAt: r.savedAt, expiresAt: r.expiresAt })) };
  } catch {
    return { status: 503, error: "save_unavailable" }; // logged as db_error by the repository
  }
}

export function createSavedRunsRoute(deps: SavedRunsRouteDeps) {
  return createEndpoint(SAVED_RUNS_PATH, { method: "POST" }, async (ctx) => {
    const headers = ctx.request?.headers ?? (ctx.headers ? new Headers(ctx.headers) : undefined);
    const origin = headers?.get("origin");
    if (origin && !originAllowed(origin, deps.allowedOrigins)) {
      log.warn({ origin }, "account_origin_refused");
      throw ctx.error(403, { message: "forbidden" });
    }
    ctx.setHeader("cache-control", "no-store");
    // Review L: the rate key is the IP Colyseus already resolved (X-Real-IP from Caddy), never a client-set header.
    const ip = (ctx as { ip?: string }).ip ?? headers?.get("x-real-ip")?.trim() ?? "unknown";
    const body = (ctx.body ?? {}) as { deviceToken?: unknown };
    const cookie = ctx.getCookie(GUEST_COOKIE);
    const out = await listSavedRuns(cookie ?? (typeof body.deviceToken === "string" ? body.deviceToken : undefined), ip, deps);
    if (out.status !== 200) throw ctx.error(out.status, { message: out.error });
    return out.body;
  });
}
