/**
 * Story 7.1 AC 4, 10: `POST /account/session` on the Colyseus router (the browser calls `/api/account/session`).
 * Body `{ deviceToken? }` (the `localStorage` copy, ≤ 2 KB by the HTTP guard); the `__Host-tdg` cookie is read first.
 * Responds `{ saved, deviceToken, ticket, account }` and renews the `__Host-tdg` cookie (HttpOnly, Secure,
 * SameSite=Lax, Path=/, no Domain, 1 year). With `PUBLIC_ORIGIN` set, a foreign or missing `Origin` is refused with 403 (CSRF).
 */
import { createEndpoint } from "@colyseus/core";
import {
  ACCOUNT_LOGIN_PATH,
  ACCOUNT_LOGOUT_PATH,
  ACCOUNT_RECOVER_PATH,
  ACCOUNT_SESSION_PATH,
  ACCOUNT_UNLOCK_PATH,
  ACCOUNT_UPGRADE_PATH,
  GUEST_COOKIE,
  accountSessionRequestSchema,
  loginRequestSchema,
  logoutRequestSchema,
  recoverRequestSchema,
  unlockRequestSchema,
  upgradeRequestSchema,
} from "@topdown/shared";
import { GUEST_COOKIE_MAX_AGE_S } from "../net/limits";
import { originAllowed } from "../net/origin";
import { log } from "../ops/logger";
import { resolveGuestSession, type GuestSessionDeps } from "./guestSession";
import { buyUnlock, refused, unlockIpAllowed, type UnlockDeps } from "./unlock";
import { actionIpAllowed, logIn, logOut, loginIpAllowed, recoverAccount, upgradeAccount, type AccountAuthDeps, type AuthOutcome } from "./accountAuth";

export interface AccountRouteDeps extends GuestSessionDeps {
  allowedOrigins: readonly string[];
  /** Story 7.3: `POST /account/unlock`. */
  unlock: Omit<UnlockDeps, "accounts" | "logGate">;
  /** Story 7.6: upgrade, login, recover, logout. */
  auth: Omit<AccountAuthDeps, "accounts" | "logGate" | "sessionSecret">;
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
    setGuestCookie(ctx, response.deviceToken); // `__Host-` requires Path=/ and no Domain (review L5)
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
   * Story 7.6: the four account actions. Same Origin check and `no-store` as the others; the per-IP limit is checked
   * before the body is parsed; a non-200 answers `{ message: AccountErrorCode }`. Login / recover / logout renew the
   * cookie with the device's NEW token (decision 7.6 B1).
   */
  const authDeps: AccountAuthDeps = { ...deps.auth, accounts: deps.accounts, logGate: deps.logGate, sessionSecret: deps.sessionSecret };
  /** The parts of the Colyseus endpoint context these routes use. */
  interface Ctx {
    request?: Request | undefined;
    headers?: ConstructorParameters<typeof Headers>[0] | undefined;
    error(status: 400 | 401 | 403 | 409 | 429 | 503, body: { message: string }): Error;
    setHeader(name: string, value: string): void;
    setCookie: (name: string, value: string, opts: Record<string, unknown>) => unknown;
  }
  const guard = (ctx: Ctx): string => {
    const headers = ctx.request?.headers ?? (ctx.headers ? new Headers(ctx.headers) : undefined);
    const origin = headers?.get("origin");
    if (!originAllowed(origin, deps.allowedOrigins)) {
      log.warn({ origin: origin ?? null }, "account_origin_refused");
      throw ctx.error(403, { message: "forbidden" });
    }
    ctx.setHeader("cache-control", "no-store");
    return clientIp(headers);
  };
  const answer = <T>(ctx: Ctx, out: AuthOutcome<T>): T => {
    if (out.status !== 200) throw ctx.error(out.status, { message: out.error });
    if (out.deviceToken !== undefined) setGuestCookie(ctx, out.deviceToken);
    return out.body;
  };
  const badBody = (ctx: Ctx): never => {
    throw ctx.error(400, { message: "invalid_body" });
  };

  const accountUpgrade = createEndpoint(ACCOUNT_UPGRADE_PATH, { method: "POST" }, async (ctx) => {
    const ip = guard(ctx);
    if (!actionIpAllowed(ip, authDeps)) throw ctx.error(429, { message: "rate_limited" });
    const body = upgradeRequestSchema.safeParse(ctx.body ?? {});
    if (!body.success) return badBody(ctx);
    return answer(ctx, await upgradeAccount({ cookieToken: ctx.getCookie(GUEST_COOKIE), ...body.data, ip }, authDeps));
  });
  const accountLogin = createEndpoint(ACCOUNT_LOGIN_PATH, { method: "POST" }, async (ctx) => {
    const ip = guard(ctx);
    if (!loginIpAllowed(ip, authDeps)) throw ctx.error(429, { message: "rate_limited" });
    const body = loginRequestSchema.safeParse(ctx.body ?? {});
    if (!body.success) return badBody(ctx);
    return answer(ctx, await logIn({ cookieToken: ctx.getCookie(GUEST_COOKIE), ...body.data, ip }, authDeps));
  });
  const accountRecover = createEndpoint(ACCOUNT_RECOVER_PATH, { method: "POST" }, async (ctx) => {
    const ip = guard(ctx);
    if (!loginIpAllowed(ip, authDeps)) throw ctx.error(429, { message: "rate_limited" });
    const body = recoverRequestSchema.safeParse(ctx.body ?? {});
    if (!body.success) return badBody(ctx);
    return answer(ctx, await recoverAccount({ cookieToken: ctx.getCookie(GUEST_COOKIE), ...body.data, ip }, authDeps));
  });
  const accountLogout = createEndpoint(ACCOUNT_LOGOUT_PATH, { method: "POST" }, async (ctx) => {
    const ip = guard(ctx);
    if (!actionIpAllowed(ip, authDeps)) throw ctx.error(429, { message: "rate_limited" });
    const body = logoutRequestSchema.safeParse(ctx.body ?? {});
    if (!body.success) return badBody(ctx);
    return answer(ctx, await logOut({ cookieToken: ctx.getCookie(GUEST_COOKIE), ip }, authDeps));
  });
  return { accountSession, accountUnlock, accountUpgrade, accountLogin, accountRecover, accountLogout };
}

/** The `__Host-tdg` cookie (HttpOnly, Secure, SameSite=Lax, Path=/, no Domain, 1 year). */
function setGuestCookie(ctx: { setCookie: (name: string, value: string, opts: Record<string, unknown>) => unknown }, token: string): void {
  ctx.setCookie(GUEST_COOKIE, token, { httpOnly: true, secure: true, sameSite: "Lax", path: "/", maxAge: GUEST_COOKIE_MAX_AGE_S });
}
