/**
 * Story 7.1 AC 4, 10: `POST /account/session` on the Colyseus router (the browser calls `/api/account/session`).
 * Body `{ deviceToken? }` (the `localStorage` copy, ≤ 2 KB by the HTTP guard); the `__Host-tdg` cookie is read first.
 * Responds `{ saved, deviceToken, ticket, account }` and renews the `__Host-tdg` cookie (HttpOnly, Secure,
 * SameSite=Lax, Path=/, no Domain, 1 year). With `PUBLIC_ORIGIN` set, a foreign or missing `Origin` is refused with 403 (CSRF).
 */
import { createEndpoint } from "@colyseus/core";
import { ACCOUNT_SESSION_PATH, GUEST_COOKIE, accountSessionRequestSchema } from "@topdown/shared";
import { GUEST_COOKIE_MAX_AGE_S } from "../net/limits";
import { originAllowed } from "../net/origin";
import { log } from "../ops/logger";
import { resolveGuestSession, type GuestSessionDeps } from "./guestSession";

export interface AccountRouteDeps extends GuestSessionDeps {
  allowedOrigins: readonly string[];
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
  return { accountSession };
}
