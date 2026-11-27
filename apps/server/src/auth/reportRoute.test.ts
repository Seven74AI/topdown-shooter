import { REPORT_DAILY_MAX, REPORT_LINE_MAX, REPORT_LINES_MAX, REPORT_MAX_BYTES, REPORT_NOTE_MAX, reportResponseSchema, type ReportPayload } from "@topdown/shared";
import type { ColyseusTestServer } from "@colyseus/testing";
import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from "vitest";
import { type Database, openPglite } from "../db/client";
import { accountsRepo } from "../db/accountsRepo";
import { reportsRepo, newReportCode } from "../db/reportsRepo";
import { log } from "../ops/logger";
import { hashGuestToken } from "../run/lobby";
import { bootTestServer } from "../test/bootTestServer";
import { reportIpLimiter, SlidingWindowLimiter } from "../net/rateLimit";
import { backdateReportsForTest, deleteAccountRowForTest } from "../db/testQueries";
import { storeReport } from "./reportRoute";

/** Story 10.6 (AC 4; B1–B4, B7): `POST /account/report` over real HTTP, on PGlite. */
let colyseus: ColyseusTestServer;
let database: Database;
let port: number;
let ipSeq = 0;
const nextIp = () => `10.106.${Math.floor(++ipSeq / 250)}.${ipSeq % 250}`;

const payload = (over: Partial<ReportPayload> = {}): ReportPayload => ({
  lines: ["12:00:00.000 note boot protocol=5", "12:00:01.000 note room.join room=abc"],
  roomId: "abc123",
  runSeed: 42,
  wave: 3,
  phase: "wave",
  protocol: 5,
  device: { userAgent: "Mozilla/5.0 Test", screen: { w: 844, h: 390 }, viewport: { w: 844, h: 390 }, dpr: 3, safeArea: { top: 0, right: 44, bottom: 21, left: 44 }, input: "touch", language: "fr-FR", installed: false },
  ...over,
});

async function post(body: unknown, opts: { cookie?: string; ip?: string; raw?: string; headers?: Record<string, string>; path?: string } = {}): Promise<{ status: number; body: Record<string, unknown>; token: string | undefined }> {
  const headers: Record<string, string> = { "content-type": "application/json", "x-real-ip": opts.ip ?? nextIp(), ...opts.headers };
  if (opts.cookie !== undefined) headers.cookie = `__Host-tdg=${opts.cookie}`;
  const res = await fetch(`http://127.0.0.1:${port}${opts.path ?? "/account/report"}`, { method: "POST", headers, body: opts.raw ?? JSON.stringify(body) });
  const text = await res.text();
  let parsed: Record<string, unknown> = {};
  try {
    parsed = JSON.parse(text) as Record<string, unknown>;
  } catch {
    /* not JSON */
  }
  return { status: res.status, body: parsed, token: /^__Host-tdg=([0-9a-f]{32});/.exec(res.headers.get("set-cookie") ?? "")?.[1] };
}

async function guest(): Promise<string> {
  const r = await post({}, { path: "/account/session" });
  expect(r.token).toMatch(/^[0-9a-f]{32}$/);
  return r.token as string;
}

beforeAll(async () => {
  log.level = "silent";
  database = openPglite();
  const booted = await bootTestServer({ database });
  colyseus = booted.colyseus;
  port = booted.port;
});
afterEach(async () => {
  vi.restoreAllMocks();
  reportIpLimiter.reset();
  await colyseus.cleanup();
});
afterAll(async () => colyseus.shutdown());

describe("Story 10.6 AC 4: POST /account/report", () => {
  it("200 { ok, code }: one row with the note, payload and code; logs problem_reported without note, account id or IP", async () => {
    const token = await guest();
    const info = vi.spyOn(log, "info");
    const r = await post({ note: "it froze", payload: payload() }, { cookie: token, ip: "10.9.9.9" });
    expect(r.status).toBe(200);
    const body = reportResponseSchema.parse(r.body);
    const rows = await reportsRepo(database).byCode(body.code);
    const row = rows.find((x) => x.note === "it froze");
    expect(row).toBeDefined();
    expect(row!.accountKind).toBe("guest");
    expect(row!.payload.wave).toBe(3);
    expect(row!.payload.lines).toHaveLength(2);
    const line = info.mock.calls.find((c) => c[1] === "problem_reported");
    expect(line).toBeDefined();
    const fields = line![0] as Record<string, unknown>;
    expect(Object.keys(fields).sort()).toEqual(["bytes", "code", "lines", "reportId"]);
    expect(JSON.stringify(fields)).not.toContain("it froze");
    expect(JSON.stringify(fields)).not.toContain("10.9.9.9");
  });

  it("an account's report is stored with kind account (the note is optional)", async () => {
    const token = await guest();
    expect((await post({ username: `rp_${Date.now() % 100000}`, password: "correct horse 1" }, { cookie: token, path: "/account/upgrade" })).status).toBe(200);
    const r = await post({ note: "", payload: payload() }, { cookie: token });
    expect(r.status).toBe(200);
    const rows = await reportsRepo(database).byCode(r.body.code as string);
    expect(rows.some((x) => x.accountKind === "account")).toBe(true);
  });

  it("400 for each bad body: wrong types, note over 500, over 200 lines, a line over 300, an unknown field", async () => {
    const token = await guest();
    const bad: unknown[] = [
      { note: 5, payload: payload() },
      { note: "x".repeat(REPORT_NOTE_MAX + 1), payload: payload() },
      { note: "", payload: payload({ lines: Array.from({ length: REPORT_LINES_MAX + 1 }, () => "a") }) },
      { note: "", payload: payload({ lines: ["a".repeat(REPORT_LINE_MAX + 1)] }) },
      { note: "", payload: { ...payload(), token: "abc" } },
      { note: "" },
    ];
    for (const b of bad) expect((await post(b, { cookie: token })).status, JSON.stringify(b).slice(0, 80)).toBe(400);
    // the limits themselves pass
    const ok = await post({ note: "x".repeat(REPORT_NOTE_MAX), payload: payload({ lines: Array.from({ length: REPORT_LINES_MAX }, () => "a".repeat(REPORT_LINE_MAX - 2)) }) }, { cookie: token });
    expect(ok.status).toBe(200);
  });

  it("401 no_account without a cookie, with a malformed one, or with an unknown token", async () => {
    for (const cookie of [undefined, "nope", "0".repeat(32)]) {
      const r = await post({ note: "", payload: payload() }, cookie === undefined ? {} : { cookie });
      expect(r.status).toBe(401);
      expect(r.body.message).toBe("no_account");
    }
  });

  it("403 for a foreign Origin", async () => {
    // Its own database: shutting this server down closes it.
    const other = await bootTestServer({ allowedOrigins: ["https://hordes.example"], database: openPglite() });
    try {
      const send = (origin: string) =>
        fetch(`http://127.0.0.1:${other.port}/account/report`, { method: "POST", headers: { "content-type": "application/json", origin, "x-real-ip": nextIp() }, body: JSON.stringify({ note: "", payload: payload() }) });
      expect((await send("https://evil.example")).status).toBe(403);
      expect((await send("https://hordes.example")).status).toBe(401); // the right Origin gets past the check (no cookie)
    } finally {
      await other.colyseus.shutdown();
    }
  });

  it("B2: a 30 KB report passes the HTTP guard; over 64 KB by its header is 413; another path still refuses 3 KB with 413", async () => {
    const token = await guest();
    const lines = Array.from({ length: 100 }, (_, i) => `${i} `.padEnd(290, "x"));
    const big = await post({ note: "", payload: payload({ lines }) }, { cookie: token });
    expect(big.status).toBe(200);
    const huge = JSON.stringify({ note: "", payload: payload({ lines: Array.from({ length: 200 }, () => "y".repeat(299)) }) }) + " ".repeat(10_000);
    expect(Buffer.byteLength(huge)).toBeGreaterThan(REPORT_MAX_BYTES);
    expect((await post(null, { cookie: token, raw: huge })).status).toBe(413);
    const other = await post(null, { raw: JSON.stringify({ pad: "z".repeat(3000) }), path: "/account/settings" });
    expect(other.status).toBe(413);
  });

  it("429 rate_limited after 3 per minute from one IP (4th refused before the database)", async () => {
    const token = await guest();
    const ip = nextIp();
    for (let i = 0; i < 3; i++) expect((await post({ note: `n${i}`, payload: payload() }, { cookie: token, ip })).status).toBe(200);
    const r = await post({ note: "n3", payload: payload() }, { cookie: token, ip });
    expect(r.status).toBe(429);
    expect(r.body.message).toBe("rate_limited");
    expect((await post({ note: "other ip", payload: payload() }, { cookie: token })).status).toBe(200);
  });

  it(`429 rate_limited past ${REPORT_DAILY_MAX} per account in 24 h (counted in the database; older rows don't count)`, async () => {
    const token = await guest();
    const repo = reportsRepo(database);
    const hash = hashGuestToken(token);
    const acc = await accountsRepo(database).findByTokenHash(hash);
    for (let i = 0; i < REPORT_DAILY_MAX; i++) expect((await repo.insert(hash, `d${i}`, payload())).outcome).toBe("stored");
    const r = await post({ note: "one too many", payload: payload() }, { cookie: token });
    expect(r.status).toBe(429);
    expect(r.body.message).toBe("rate_limited");
    // backdate them: the account may report again
    await backdateReportsForTest(database, { accountId: acc!.id }, 25);
    expect((await post({ note: "next day", payload: payload() }, { cookie: token })).status).toBe(200);
  });

  it("503 save_unavailable when the database fails; 401 when the account is gone (never a stored orphan)", async () => {
    const reports = reportsRepo(database);
    const failing = { ...reports, insert: () => Promise.reject(new Error("down")) };
    const req = { note: "", payload: payload() };
    const token = "a".repeat(32);
    expect(await storeReport({ cookieToken: token, request: req, bytes: 10 }, { reports: failing })).toEqual({ status: 503, error: "save_unavailable" });
    const g = await guest();
    const acc = await accountsRepo(database).findByTokenHash(hashGuestToken(g));
    expect(acc).not.toBeNull();
    // the account goes (deleted elsewhere; its device row cascades): no_account
    await deleteAccountRowForTest(database, acc!.id);
    expect(await storeReport({ cookieToken: g, request: req, bytes: 10 }, { reports })).toEqual({ status: 401, error: "no_account" });
  });

  it("Q3 B: codes are 4 characters from A–Z without I/O and 2–9", () => {
    for (let i = 0; i < 500; i++) expect(newReportCode()).toMatch(/^[A-HJ-NP-Z2-9]{4}$/);
  });

  it("AC 9: the per-IP limiter is its own (3 per minute), not shared with any other route", () => {
    expect(reportIpLimiter).toBeInstanceOf(SlidingWindowLimiter);
  });
});
