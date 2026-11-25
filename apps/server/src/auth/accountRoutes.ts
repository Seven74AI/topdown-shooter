/**
 * Story 7.1 AC 4, 10: `POST /account/session` on the Colyseus router (the browser calls `/api/account/session`).
 * Body `{ deviceToken? }` (the `localStorage` copy, ≤ 2 KB by the HTTP guard); the `__Host-tdg` cookie is read first.
 * Responds `{ saved, deviceToken, ticket, account }` and renews the `__Host-tdg` cookie (HttpOnly, Secure,
 * SameSite=Lax, Path=/, no Domain, 1 year). With `PUBLIC_ORIGIN` set, a foreign or missing `Origin` is refused with 403 (CSRF).
 */
import { createEndpoint } from "@colyseus/core";
import { ACCOUNT_SESSION_PATH, ACCOUNT_TRAINING_PATH, ACCOUNT_UNLOCK_PATH, GUEST_COOKIE, accountSessionRequestSchema, trainRequestSchema, unlockRequestSchema } from "@topdown/shared";
import { GUEST_COOKIE_MAX_AGE_S } from "../net/limits";
import { originAllowed } from "../net/origin";
import { log } from "../ops/logger";
import { resolveGuestSession, type GuestSessionDeps } from "./guestSession";
import { buyUnlock, refused, unlockIpAllowed, type UnlockDeps } from "./unlock";
import { buyTraining, trainIpAllowed, trainRefused, type TrainDeps } from "./train";

export interface AccountRouteDeps extends GuestSessionDeps {
  allowedOrigins: readonly string[];
  /** Story 7.3: `POST /account/unlock`. */
  unlock: Omit<UnlockDeps, "accounts" | "logGate">;
  /** Story 7.5: `POST /account/training`. */
  train: Omit<TrainDeps, "accounts" | "logGate">;
}

/** The client IP the same way Colyseus reads it for rooms (`X-Real-IP`, which Caddy sets from Cloudflare). */
function clientIp(headers: Headers | undefined): string {
  const first = (name: string) => headers?.get(name)?.split(",")[0]?.trim() || undefined;
  return first("x-real-ip") ?? first("x-forwarded-for") ?? "unknown";
}

export function createAccountRoutes(deps: AccountRouteDeps) {
  const accountSession = createEndpoint(ACCOUNT_SESSION_PATH, { method: "POST" }, async (ctx) => {
    const headers = ctx.request?.headers ?? (ctx.headers ? new Headers(ctx.headers) : undefined);
    const origin = headers?.get("origin");
    if (!originAllowed(origin, deps.allowedOrigins)) {
      log.warn({ origin: origin ?? null }, "account_origin_refused");
      throw ctx.error(403, { message: "forbidden" });
    }
    const body = accountSessionRequestSchema.safeParse(ctx.body ?? {});
    if (!body.success) throw ctx.error(400, { message: "invalid_body" });
    const { response } = await resolveGuestSession(
      { cookieToken: ctx.getCookie(GUEST_COOKIE), deviceToken: body.data.deviceToken, ip: clientIp(headers) },
      deps,
    );
    ctx.setCookie(GUEST_COOKIE, response.deviceToken, {
      httpOnly: true,
      secure: true,
      sameSite: "Lax",
      path: "/", // `__Host-` requires Path=/ and no Domain (review L5)
      maxAge: GUEST_COOKIE_MAX_AGE_S,
    });
    ctx.setHeader("cache-control", "no-store");
    return response;
  });

  /**
   * Story 7.3 (AC 5): `POST /account/unlock` `{ unlockId, requestId }`. The cookie names the account; 200 answers
   * `{ ok, unlockId, progress }` or `{ ok: false, reason, need?, progress }`; 400 bad body / unknown id, 401 no
   * account, 403 foreign Origin, 429 over the limits, 503 save server down.
   */
  const accountUnlock = createEndpoint(ACCOUNT_UNLOCK_PATH, { method: "POST" }, async (ctx) => {
    const headers = ctx.request?.headers ?? (ctx.headers ? new Headers(ctx.headers) : undefined);
    const origin = headers?.get("origin");
    if (!originAllowed(origin, deps.allowedOrigins)) {
      log.warn({ origin: origin ?? null }, "account_origin_refused");
      throw ctx.error(403, { message: "forbidden" });
    }
    ctx.setHeader("cache-control", "no-store");
    const ip = clientIp(headers);
    // Review F9: the per-IP limit first, before the body is parsed or the database is touched.
    if (!unlockIpAllowed(ip, { ipLimiter: deps.unlock.ipLimiter, logGate: deps.logGate })) throw ctx.error(429, { message: "rate_limited" });
    const body = unlockRequestSchema.safeParse(ctx.body ?? {});
    if (!body.success) {
      refused(ip, "invalid_body", deps.logGate);
      throw ctx.error(400, { message: "invalid_body" });
    }
    const out = await buyUnlock(
      { cookieToken: ctx.getCookie(GUEST_COOKIE), unlockId: body.data.unlockId, requestId: body.data.requestId, ip },
      { ...deps.unlock, accounts: deps.accounts, logGate: deps.logGate },
    );
    if (out.status !== 200) throw ctx.error(out.status, { message: out.error });
    return out.body;
  });
  /**
   * Story 7.5 (AC 3): `POST /account/training` `{ boost, level, requestId }`. Same answers and guards as the unlock:
   * 200 `{ ok, boost, level, progress }` or `{ ok: false, reason: already_trained | not_enough | maxed, need?, progress }`;
   * 400 bad body, 401 no account, 403 foreign Origin, 429 over the limits, 503 save server down.
   */
  const accountTraining = createEndpoint(ACCOUNT_TRAINING_PATH, { method: "POST" }, async (ctx) => {
    const headers = ctx.request?.headers ?? (ctx.headers ? new Headers(ctx.headers) : undefined);
    const origin = headers?.get("origin");
    if (!originAllowed(origin, deps.allowedOrigins)) {
      log.warn({ origin: origin ?? null }, "account_origin_refused");
      throw ctx.error(403, { message: "forbidden" });
    }
    ctx.setHeader("cache-control", "no-store");
    const ip = clientIp(headers);
    if (!trainIpAllowed(ip, { ipLimiter: deps.train.ipLimiter, logGate: deps.logGate })) throw ctx.error(429, { message: "rate_limited" });
    const body = trainRequestSchema.safeParse(ctx.body ?? {});
    if (!body.success) {
      trainRefused(ip, deps.logGate);
      throw ctx.error(400, { message: "invalid_body" });
    }
    const out = await buyTraining(
      { cookieToken: ctx.getCookie(GUEST_COOKIE), boost: body.data.boost, level: body.data.level, requestId: body.data.requestId, ip },
      { ...deps.train, accounts: deps.accounts, logGate: deps.logGate },
    );
    if (out.status !== 200) throw ctx.error(out.status, { message: out.error });
    return out.body;
  });
  return { accountSession, accountUnlock, accountTraining };
}
