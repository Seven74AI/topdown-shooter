/**
 * Story 10.6 (AC 4; B1–B4, B7): `POST /account/report` `{ note, payload }` (the browser calls `/api/account/report`).
 * Any device with a session cookie may report (guests too); the cookie's device row names the account, never an id from
 * the client. 200 `{ ok: true, code }`; 400 bad body (types, note > 500, > 200 lines, a line > 300, a serialized body
 * > 64 KB); 401 `no_account`; 403 foreign Origin; 413 a body over 64 KB by its header; 429 `rate_limited` (3 / min and
 * 30 / 24 h per IP here, 20 / 24 h per account and 2,000 / 24 h from everyone in the database: B3, B10); 503
 * `save_unavailable`.
 *
 * Logs `problem_reported { reportId, code, bytes, lines }`: no note text, no account id, no IP (B7).
 */
import { createEndpoint } from "@colyseus/core";
import { ACCOUNT_REPORT_PATH, GUEST_COOKIE, REPORT_MAX_BYTES, guestTokenSchema, reportRequestSchema, type ReportRequest, type ReportResponse } from "@topdown/shared";
import type { ReportsRepo } from "../db/reportsRepo";
import { originAllowed } from "../net/origin";
import { ipKey, type SlidingWindowLimiter } from "../net/rateLimit";
import { MAX_REPORTS_GLOBAL_PER_DAY } from "../net/limits";
import { log } from "../ops/logger";
import { hashGuestToken } from "../run/lobby";

export interface ReportRouteDeps {
  reports: ReportsRepo;
  allowedOrigins: readonly string[];
  ipLimiter: SlidingWindowLimiter;
  /** Review M3 (B10): 30 per IP per 24 h. */
  ipDayLimiter: SlidingWindowLimiter;
  logGate: SlidingWindowLimiter;
  /** Tests lower it (the race tests); default `REPORT_DAILY_MAX`. */
  dailyMax?: number;
  /** Review M3 (B10): reports from everyone per 24 h (default `MAX_REPORTS_GLOBAL_PER_DAY`). */
  globalMax?: number;
}

export type ReportOutcome = { status: 200; body: ReportResponse } | { status: 400 | 401 | 429 | 503; error: "invalid_body" | "no_account" | "rate_limited" | "save_unavailable" };

/** Store one report for the cookie's account (pure of HTTP, for tests). `request` is already schema-parsed. */
export async function storeReport(input: { cookieToken: string | null | undefined; request: ReportRequest; bytes: number }, deps: Pick<ReportRouteDeps, "reports" | "dailyMax" | "globalMax">): Promise<ReportOutcome> {
  const token = guestTokenSchema.safeParse(input.cookieToken);
  if (!token.success) return { status: 401, error: "no_account" };
  try {
    const opts = { globalMax: deps.globalMax ?? MAX_REPORTS_GLOBAL_PER_DAY, ...(deps.dailyMax === undefined ? {} : { dailyMax: deps.dailyMax }) };
    const r = await deps.reports.insert(hashGuestToken(token.data), input.request.note, input.request.payload, opts);
    if (r.outcome === "no_account") return { status: 401, error: "no_account" };
    if (r.outcome === "limited") return { status: 429, error: "rate_limited" };
    log.info({ reportId: r.id, code: r.code, bytes: input.bytes, lines: input.request.payload.lines.length }, "problem_reported");
    return { status: 200, body: { ok: true, code: r.code } };
  } catch {
    return { status: 503, error: "save_unavailable" }; // logged as db_error by the repository
  }
}

const byteLength = (body: unknown): number => (body === undefined ? 0 : Buffer.byteLength(typeof body === "string" ? body : JSON.stringify(body), "utf8"));

export function createReportRoute(deps: ReportRouteDeps) {
  return createEndpoint(ACCOUNT_REPORT_PATH, { method: "POST" }, async (ctx) => {
    const headers = ctx.request?.headers ?? (ctx.headers ? new Headers(ctx.headers) : undefined);
    const origin = headers?.get("origin");
    if (!originAllowed(origin, deps.allowedOrigins)) {
      log.warn({ origin: origin ?? null }, "account_origin_refused");
      throw ctx.error(403, { message: "forbidden" });
    }
    ctx.setHeader("cache-control", "no-store");
    const ip = headers?.get("x-real-ip")?.split(",")[0]?.trim() || headers?.get("x-forwarded-for")?.split(",")[0]?.trim() || "unknown";
    // Review N1: no (or a malformed) cookie is answered before the IP limits, so the client's fetch-a-session-and-retry
    // costs no slot. A well-formed but unknown token (a stale cookie) still costs one: it needs the database to tell.
    const cookie = ctx.getCookie(GUEST_COOKIE);
    if (!guestTokenSchema.safeParse(cookie).success) throw ctx.error(401, { message: "no_account" });
    if (!deps.ipLimiter.allow(ip) || !deps.ipDayLimiter.allow(ip)) {
      if (deps.logGate.allow(`report:${ipKey(ip)}`)) log.warn({ ip }, "report_rate_limited");
      throw ctx.error(429, { message: "rate_limited" });
    }
    const declared = Number(headers?.get("content-length") ?? NaN);
    if (Number.isFinite(declared) && declared > REPORT_MAX_BYTES) throw ctx.error(413, { message: "too_large" });
    // B1: the serialized body is measured again (a body without a length header, or one the header understated).
    const bytes = byteLength(ctx.body);
    if (bytes > REPORT_MAX_BYTES) throw ctx.error(400, { message: "invalid_body" });
    const body = reportRequestSchema.safeParse(ctx.body ?? {});
    if (!body.success) throw ctx.error(400, { message: "invalid_body" });
    const out = await storeReport({ cookieToken: cookie, request: body.data, bytes }, deps);
    if (out.status !== 200) throw ctx.error(out.status, { message: out.error });
    return out.body;
  });
}
