import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { DOWNTOWN_MAP, RUN_ROOM_NAME, accountSessionResponseSchema, type AccountSessionResponse } from "@topdown/shared";
import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from "vitest";
import { accountsRepo } from "../db/accountsRepo";
import { type Database, openPglite } from "../db/client";
import { progressRepo } from "../db/progressRepo";
import { MAX_NEW_GUESTS_PER_HOUR } from "../net/limits";
import { newGuestLimiter } from "../net/rateLimit";
import { log } from "../ops/logger";
import { serverBalance } from "../rooms/RunRoom";
import { hashGuestToken } from "../run/lobby";
import { bootTestServer } from "../test/bootTestServer";
import { verifyTicket } from "./ticket";

const SECRET = "test-secret-".padEnd(48, "x");
const TOKEN_A = "a1".repeat(16);
const TOKEN_B = "b2".repeat(16);
const TOKEN_C = "c3".repeat(16);

interface Reply {
  status: number;
  body: AccountSessionResponse;
  cookie: string | null;
}

async function call(port: number, opts: { cookie?: string; deviceToken?: string; ip?: string; origin?: string; raw?: string } = {}): Promise<Reply> {
  const headers: Record<string, string> = { "content-type": "application/json", "x-real-ip": opts.ip ?? "10.0.0.1" };
  if (opts.cookie !== undefined) headers.cookie = `tdg=${opts.cookie}`;
  if (opts.origin !== undefined) headers.origin = opts.origin;
  const res = await fetch(`http://127.0.0.1:${port}/account/session`, {
    method: "POST",
    headers,
    body: opts.raw ?? JSON.stringify(opts.deviceToken === undefined ? {} : { deviceToken: opts.deviceToken }),
  });
  const text = await res.text();
  let body: unknown;
  try {
    body = JSON.parse(text);
  } catch {
    body = text;
  }
  return { status: res.status, body: body as AccountSessionResponse, cookie: res.headers.get("set-cookie") };
}

const cookieToken = (setCookie: string | null): string | undefined => /tdg=([0-9a-f]{32})/.exec(setCookie ?? "")?.[1];

describe("POST /account/session (Story 7.1 AC 4)", () => {
  let database: Database;
  let port: number;
  let shutdown: () => Promise<void>;
  let cleanup: () => Promise<void>;

  beforeAll(async () => {
    database = openPglite();
    const booted = await bootTestServer({ database, sessionSecret: SECRET });
    port = booted.port;
    shutdown = () => booted.colyseus.shutdown();
    cleanup = () => booted.colyseus.cleanup();
  });
  afterEach(async () => {
    vi.restoreAllMocks();
    await cleanup();
  });
  afterAll(async () => {
    await shutdown();
  });

  it("P1: a new device gets a guest account and an empty progress row with no form", async () => {
    const r = await call(port);
    expect(r.status).toBe(200);
    const body = accountSessionResponseSchema.parse(r.body);
    if (!body.saved) throw new Error("expected saved");
    expect(body.deviceToken).toMatch(/^[0-9a-f]{32}$/);
    expect(body.account).toEqual({ displayName: "", username: null });
    const accountId = verifyTicket(body.ticket, SECRET);
    expect(accountId).not.toBeNull();
    const found = await accountsRepo(database).findByTokenHash(hashGuestToken(body.deviceToken));
    expect(found?.id).toBe(accountId);
    expect(await progressRepo(database).get(accountId as string)).toMatchObject({ supplies: 0, lifetimeSupplies: 0, unlocks: [], training: {}, districts: [] });
    // P4: the cookie copy is HttpOnly, Secure, SameSite=Lax, Path=/api, a year, renewed now.
    expect(cookieToken(r.cookie)).toBe(body.deviceToken);
    expect(r.cookie).toMatch(/HttpOnly/i);
    expect(r.cookie).toMatch(/Secure/i);
    expect(r.cookie).toMatch(/SameSite=Lax/i);
    expect(r.cookie).toMatch(/Path=\/api/);
    expect(r.cookie).toMatch(/Max-Age=31536000/);
  });

  it("keeps a valid presented token that has no account yet (a phone keeps its Story 2.3 identity)", async () => {
    const r = await call(port, { deviceToken: TOKEN_C });
    expect(r.body.saved).toBe(true);
    expect(r.body.deviceToken).toBe(TOKEN_C);
    expect(cookieToken(r.cookie)).toBe(TOKEN_C);
    expect(await accountsRepo(database).findByTokenHash(hashGuestToken(TOKEN_C))).not.toBeNull();
  });

  it("P2: localStorage cleared (cookie only) and cookie gone (token only) both find the same account; both are written back", async () => {
    const first = await call(port, { deviceToken: TOKEN_A });
    const id = verifyTicket(first.body.ticket, SECRET);
    expect(id).not.toBeNull();

    const cookieOnly = await call(port, { cookie: TOKEN_A });
    expect(verifyTicket(cookieOnly.body.ticket, SECRET)).toBe(id);
    expect(cookieOnly.body.deviceToken).toBe(TOKEN_A); // localStorage rewritten from it
    expect(cookieToken(cookieOnly.cookie)).toBe(TOKEN_A);

    const tokenOnly = await call(port, { deviceToken: TOKEN_A });
    expect(verifyTicket(tokenOnly.body.ticket, SECRET)).toBe(id);
    expect(cookieToken(tokenOnly.cookie)).toBe(TOKEN_A); // cookie rewritten from it

    const both = await call(port, { cookie: TOKEN_A, deviceToken: TOKEN_A });
    expect(verifyTicket(both.body.ticket, SECRET)).toBe(id);
  });

  it("P2 / D3: cookie and localStorage disagree → the cookie wins and both are rewritten to it", async () => {
    const a = verifyTicket((await call(port, { deviceToken: TOKEN_A })).body.ticket, SECRET);
    const b = verifyTicket((await call(port, { deviceToken: TOKEN_B })).body.ticket, SECRET);
    expect(a).not.toBe(b);
    const r = await call(port, { cookie: TOKEN_A, deviceToken: TOKEN_B });
    expect(verifyTicket(r.body.ticket, SECRET)).toBe(a);
    expect(r.body.deviceToken).toBe(TOKEN_A);
    expect(cookieToken(r.cookie)).toBe(TOKEN_A);
    // A cookie with no account and a token with one: the token's account wins (first that matches).
    const r2 = await call(port, { cookie: "d4".repeat(16), deviceToken: TOKEN_B });
    expect(verifyTicket(r2.body.ticket, SECRET)).toBe(b);
    expect(cookieToken(r2.cookie)).toBe(TOKEN_B);
  });

  it("P4: never logs the token, its hash or the ticket", async () => {
    const lines: string[] = [];
    for (const level of ["info", "warn", "error", "debug"] as const) {
      vi.spyOn(log, level).mockImplementation(((...args: unknown[]) => void lines.push(JSON.stringify(args))) as never);
    }
    const r = await call(port, { cookie: TOKEN_B, deviceToken: TOKEN_A });
    expect(lines.length).toBeGreaterThan(0); // liveness: the route logged something
    const all = lines.join("\n");
    for (const secret of [TOKEN_A, TOKEN_B, hashGuestToken(TOKEN_A), hashGuestToken(TOKEN_B), r.body.ticket ?? "none"]) expect(all).not.toContain(secret);
  });

  it(`limits: the ${MAX_NEW_GUESTS_PER_HOUR + 1}th new guest from one IP in an hour plays unsaved; an existing account from it still resolves`, async () => {
    const ip = "203.0.113.9";
    const known = await call(port, { deviceToken: TOKEN_A, ip: "198.51.100.1" });
    newGuestLimiter.reset();
    for (let i = 0; i < MAX_NEW_GUESTS_PER_HOUR; i++) expect((await call(port, { ip })).body.saved).toBe(true);
    const over = await call(port, { ip });
    expect(over.status).toBe(200);
    expect(over.body).toEqual({ saved: false, deviceToken: expect.stringMatching(/^[0-9a-f]{32}$/), ticket: null, account: null });
    expect(await accountsRepo(database).findByTokenHash(hashGuestToken(over.body.deviceToken))).toBeNull();
    const existing = await call(port, { ip, cookie: TOKEN_A });
    expect(verifyTicket(existing.body.ticket, SECRET)).toBe(verifyTicket(known.body.ticket, SECRET));
    expect((await call(port, { ip: "203.0.113.10" })).body.saved).toBe(true);
  });

  it("refuses a body over 2 KB (413), a malformed or oversized token or extra fields (400)", async () => {
    expect((await call(port, { raw: JSON.stringify({ deviceToken: "a".repeat(3000) }) })).status).toBe(413);
    expect((await call(port, { deviceToken: "a".repeat(64) })).status).toBe(400);
    expect((await call(port, { deviceToken: "XYZ" })).status).toBe(400);
    expect((await call(port, { raw: JSON.stringify({ deviceToken: TOKEN_A, accountId: "x" }) })).status).toBe(400);
  });
});

describe("POST /account/session with PUBLIC_ORIGIN (Story 7.1 AC 10, CSRF)", () => {
  it("refuses a foreign or missing Origin with 403 and accepts the game's own", async () => {
    const { colyseus, port } = await bootTestServer({ allowedOrigins: ["https://hordes.example"], sessionSecret: SECRET });
    try {
      expect((await call(port, { origin: "https://evil.example" })).status).toBe(403);
      expect((await call(port)).status).toBe(403);
      const ok = await call(port, { origin: "https://hordes.example" });
      expect(ok.status).toBe(200);
      expect(ok.body.saved).toBe(true);
    } finally {
      await colyseus.shutdown();
    }
  });
});

describe("P3: the save server is down", () => {
  it("answers 200 saved:false with no ticket, keeps the presented token, and logs db_error", async () => {
    const down: Database = { kind: "postgres", db: () => Promise.reject(new Error("ECONNREFUSED")), close: async () => {} };
    const { colyseus, port } = await bootTestServer({ database: down, sessionSecret: SECRET });
    // After the boot: it sets the log level, which replaces pino's methods (and a spy made earlier).
    const errors = vi.spyOn(log, "error");
    try {
      const r = await call(port, { deviceToken: TOKEN_A });
      expect(r.status).toBe(200);
      expect(r.body).toEqual({ saved: false, deviceToken: TOKEN_A, ticket: null, account: null });
      expect(cookieToken(r.cookie)).toBe(TOKEN_A);
      expect(errors).toHaveBeenCalledWith(expect.objectContaining({ op: "accounts.findByTokenHash" }), "db_error");
      // Rooms still open while the database is down (a create is accepted).
      const client = await colyseus.sdk.create(RUN_ROOM_NAME, {
        intent: "create",
        name: "Ana",
        balanceVersion: serverBalance.version,
        mapVersion: DOWNTOWN_MAP.version,
        guestToken: TOKEN_A,
      });
      expect(client.roomId).toBeTruthy();
      await client.leave();
    } finally {
      vi.restoreAllMocks();
      await colyseus.shutdown();
    }
  });
});

describe("P5: a restart finds the same account", () => {
  it("two test servers one after the other on one PGlite directory resolve the cookie to the same account", async () => {
    const dir = mkdtempSync(join(tmpdir(), "td-p5-"));
    try {
      const one = await bootTestServer({ database: openPglite(dir), sessionSecret: SECRET });
      const first = await call(one.port);
      await one.colyseus.shutdown();
      const id = verifyTicket(first.body.ticket, SECRET);
      expect(id).not.toBeNull();

      const twoDb = openPglite(dir);
      const two = await bootTestServer({ database: twoDb, sessionSecret: SECRET });
      try {
        const again = await call(two.port, { cookie: first.body.deviceToken });
        // The second server really read the row: same id, and still exactly one account for the token.
        expect(verifyTicket(again.body.ticket, SECRET)).toBe(id);
        expect((await accountsRepo(twoDb).findByTokenHash(hashGuestToken(first.body.deviceToken)))?.id).toBe(id);
      } finally {
        await two.colyseus.shutdown();
      }
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });
});
