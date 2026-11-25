import { randomUUID } from "node:crypto";
import { PROGRESSION, accountSessionResponseSchema, unlockResponseSchema, type UnlockResponse } from "@topdown/shared";
import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from "vitest";
import { accountsRepo } from "../db/accountsRepo";
import { type Database, openPglite } from "../db/client";
import { progressRepo } from "../db/progressRepo";
import { MAX_UNLOCKS_PER_ACCOUNT_PER_MIN } from "../net/limits";
import { log } from "../ops/logger";
import { hashGuestToken } from "../run/lobby";
import { bootTestServer } from "../test/bootTestServer";
import { RequestMemo, buyUnlock, unlockRequests } from "./unlock";
import { SlidingWindowLimiter } from "../net/rateLimit";

const SECRET = "test-secret-".padEnd(48, "x");
let n = 0;
/** A fresh 32-hex guest token per test (one account each). */
const freshToken = () => (++n).toString(16).padStart(4, "0").repeat(8);

interface Reply {
  status: number;
  body: UnlockResponse & { message?: string };
}

async function unlock(port: number, o: { token?: string; unlockId?: string; requestId?: string; origin?: string; raw?: string; ip?: string }): Promise<Reply> {
  const headers: Record<string, string> = { "content-type": "application/json", "x-real-ip": o.ip ?? "10.1.0.1" };
  if (o.token !== undefined) headers.cookie = `__Host-tdg=${o.token}`;
  if (o.origin !== undefined) headers.origin = o.origin;
  const res = await fetch(`http://127.0.0.1:${port}/account/unlock`, {
    method: "POST",
    headers,
    body: o.raw ?? JSON.stringify({ unlockId: o.unlockId ?? "spike_trap", requestId: o.requestId ?? randomUUID() }),
  });
  const text = await res.text();
  let body: unknown = text;
  try {
    body = JSON.parse(text);
  } catch {
    /* text */
  }
  return { status: res.status, body: body as Reply["body"] };
}

describe("POST /account/unlock (Story 7.3 AC 5; U2, U3, U5)", () => {
  let database: Database;
  let port: number;
  let shutdown: () => Promise<void>;
  let cleanup: () => Promise<void>;

  /** A guest account (made through the real session route) with `supplies` banked; returns its token and id. */
  async function account(supplies: number): Promise<{ token: string; id: string }> {
    const token = freshToken();
    const res = await fetch(`http://127.0.0.1:${port}/account/session`, {
      method: "POST",
      headers: { "content-type": "application/json", "x-real-ip": `10.2.${n % 250}.${n % 200}` },
      body: JSON.stringify({ deviceToken: token }),
    });
    const s = accountSessionResponseSchema.parse(await res.json());
    if (!s.saved) throw new Error("expected saved");
    const acct = await accountsRepo(database).findByTokenHash(hashGuestToken(token));
    if (!acct) throw new Error("no account");
    if (supplies > 0) await progressRepo(database).addSupplies(randomUUID(), acct.id, () => ({ supplies, breakdown: {} }));
    return { token, id: acct.id };
  }
  const row = async (id: string) => progressRepo(database).get(id);

  beforeAll(async () => {
    database = openPglite();
    const booted = await bootTestServer({ database, sessionSecret: SECRET });
    port = booted.port;
    shutdown = () => booted.colyseus.shutdown();
    cleanup = () => booted.colyseus.cleanup();
  });
  afterEach(async () => {
    vi.restoreAllMocks();
    unlockRequests.clear();
    await cleanup();
  });
  afterAll(async () => {
    await shutdown();
  });

  it("enough Supplies → Supplies down by the FILE price, the id added, one `unlocked` log line, the server's progress answered", async () => {
    const a = await account(340);
    const info = vi.spyOn(log, "info");
    const r = await unlock(port, { token: a.token, unlockId: "chainsaw" });
    expect(r.status).toBe(200);
    const body = unlockResponseSchema.parse(r.body);
    expect(body).toEqual({ ok: true, unlockId: "chainsaw", progress: { supplies: 40, lifetimeSupplies: 340, unlocks: ["chainsaw"] } });
    expect(await row(a.id)).toMatchObject({ supplies: 40, lifetimeSupplies: 340, unlocks: ["chainsaw"] });
    const lines = info.mock.calls.filter((c) => c[1] === "unlocked");
    expect(lines).toEqual([[{ accountId: a.id, unlockId: "chainsaw", price: 300, suppliesAfter: 40 }, "unlocked"]]);
  });

  it("the session reply carries the same progress (AC 4, U5)", async () => {
    const a = await account(150);
    await unlock(port, { token: a.token, unlockId: "spike_trap" });
    const res = await fetch(`http://127.0.0.1:${port}/account/session`, {
      method: "POST",
      headers: { "content-type": "application/json", cookie: `__Host-tdg=${a.token}`, "x-real-ip": "10.3.0.1" },
      body: "{}",
    });
    const s = accountSessionResponseSchema.parse(await res.json());
    expect(s.saved && s.progress).toEqual({ supplies: 50, lifetimeSupplies: 150, unlocks: ["spike_trap"] });
  });

  it("U3: not enough → not_enough with `need`, the row unchanged", async () => {
    const a = await account(340);
    const r = await unlock(port, { token: a.token, unlockId: "flamethrower" });
    expect(r.status).toBe(200);
    expect(unlockResponseSchema.parse(r.body)).toEqual({ ok: false, unlockId: "flamethrower", reason: "not_enough", need: 60, progress: { supplies: 340, lifetimeSupplies: 340, unlocks: [] } });
    expect(await row(a.id)).toMatchObject({ supplies: 340, unlocks: [] });
    // a brand-new account (0 Supplies): need = the whole price
    const b = await account(0);
    expect((await unlock(port, { token: b.token, unlockId: "spike_trap" })).body).toMatchObject({ ok: false, reason: "not_enough", need: 100 });
  });

  it("U3: already unlocked → already_unlocked, nothing charged (a second tap with a new requestId)", async () => {
    const a = await account(1000);
    expect((await unlock(port, { token: a.token, unlockId: "mine" })).body.ok).toBe(true);
    const again = await unlock(port, { token: a.token, unlockId: "mine" });
    expect(again.body).toEqual({ ok: false, unlockId: "mine", reason: "already_unlocked", progress: { supplies: 900, lifetimeSupplies: 1000, unlocks: ["mine"] } });
    expect(await row(a.id)).toMatchObject({ supplies: 900, unlocks: ["mine"] });
  });

  it("U3: the same requestId twice (a retry, and a double-submit at once) → one charge, the first answer both times", async () => {
    const a = await account(500);
    const requestId = randomUUID();
    const [x, y] = await Promise.all([unlock(port, { token: a.token, unlockId: "bear_trap", requestId }), unlock(port, { token: a.token, unlockId: "bear_trap", requestId })]);
    const z = await unlock(port, { token: a.token, unlockId: "bear_trap", requestId });
    for (const r of [x, y, z]) expect(r.body).toEqual({ ok: true, unlockId: "bear_trap", progress: { supplies: 400, lifetimeSupplies: 500, unlocks: ["bear_trap"] } });
    expect(await row(a.id)).toMatchObject({ supplies: 400, unlocks: ["bear_trap"] });
  });

  it("brief 18 liveness: two concurrent buys of DIFFERENT items with Supplies for one → exactly one ok AND one not_enough", async () => {
    const a = await account(350);
    const [p, q] = await Promise.all([unlock(port, { token: a.token, unlockId: "gas_torch" }), unlock(port, { token: a.token, unlockId: "med_station" })]);
    const bodies = [p.body, q.body];
    expect(bodies.filter((b) => b.ok).length).toBe(1);
    expect(bodies.filter((b) => !b.ok && b.reason === "not_enough").length).toBe(1);
    const final = await row(a.id);
    expect(final?.unlocks.length).toBe(1);
    expect(final?.supplies).toBe(final?.unlocks[0] === "gas_torch" ? 0 : 50);
  });

  it("two devices on one account (same cookie) buying the same item at once → one ok, one already_unlocked, one charge", async () => {
    const a = await account(600);
    const rs = await Promise.all([unlock(port, { token: a.token, unlockId: "grenade_launcher" }), unlock(port, { token: a.token, unlockId: "grenade_launcher" })]);
    expect(rs.map((r) => (r.body.ok ? "ok" : r.body.reason)).sort()).toEqual(["already_unlocked", "ok"]);
    expect(await row(a.id)).toMatchObject({ supplies: 100, unlocks: ["grenade_launcher"] });
  });

  it("beat the rule: a price in the body, an extra accountId, an unknown id, a bad requestId → 400; nothing charged", async () => {
    const a = await account(500);
    const raw = (o: object) => unlock(port, { token: a.token, raw: JSON.stringify(o) });
    expect((await raw({ unlockId: "chainsaw", requestId: randomUUID(), price: -500 })).status).toBe(400);
    expect((await raw({ unlockId: "chainsaw", requestId: randomUUID(), accountId: a.id })).status).toBe(400);
    expect((await raw({ unlockId: "chainsaw", requestId: "not-a-uuid" })).status).toBe(400);
    expect((await raw({ unlockId: 7, requestId: randomUUID() })).status).toBe(400);
    const unknown = await unlock(port, { token: a.token, unlockId: "pistol" }); // a starter item is not an unlock
    expect(unknown.status).toBe(400);
    expect(unknown.body.message).toBe("unknown_unlock");
    expect((await unlock(port, { token: a.token, raw: "not json" })).status).toBe(400);
    expect(await row(a.id)).toMatchObject({ supplies: 500, unlocks: [] });
  });

  it("no cookie, a malformed cookie or a cookie of no account → 401", async () => {
    expect((await unlock(port, {})).status).toBe(401);
    expect((await unlock(port, { token: "zz" })).status).toBe(401);
    expect((await unlock(port, { token: "fe".repeat(16) })).status).toBe(401);
  });

  it("20 calls per account per minute, then 429 (and nothing more is bought)", async () => {
    const a = await account(10_000);
    const ids = PROGRESSION.unlocks.map((u) => u.id);
    let ok = 0;
    for (let i = 0; i < MAX_UNLOCKS_PER_ACCOUNT_PER_MIN; i++) {
      const r = await unlock(port, { token: a.token, unlockId: ids[i % ids.length] as string });
      expect(r.status).toBe(200);
      if (r.body.ok) ok++;
    }
    expect(ok).toBe(ids.length);
    const over = await unlock(port, { token: a.token, unlockId: "chainsaw" });
    expect(over.status).toBe(429);
  });

  it("review F3: accounts A and B sending the SAME requestId → B gets its own answer (its progress) and is charged", async () => {
    const a = await account(500);
    const b = await account(250);
    const requestId = randomUUID();
    const ra = await unlock(port, { token: a.token, unlockId: "mine", requestId });
    const rb = await unlock(port, { token: b.token, unlockId: "mine", requestId });
    expect(ra.body).toEqual({ ok: true, unlockId: "mine", progress: { supplies: 400, lifetimeSupplies: 500, unlocks: ["mine"] } });
    expect(rb.body).toEqual({ ok: true, unlockId: "mine", progress: { supplies: 150, lifetimeSupplies: 250, unlocks: ["mine"] } });
    expect(await row(b.id)).toMatchObject({ supplies: 150, unlocks: ["mine"] });
    // and B replaying A's id for another item never sees A's numbers
    const rb2 = await unlock(port, { token: b.token, unlockId: "bear_trap", requestId: randomUUID() });
    expect(rb2.body.progress.supplies).toBe(50);
  });

  it("review F4 + F9: 60 calls per IP per minute (no cookie → 401), then 429 — before the body is read — and one log line", async () => {
    const warn = vi.spyOn(log, "warn");
    const ip = "10.9.9.9";
    for (let i = 0; i < 60; i++) expect((await unlock(port, { ip })).status).toBe(401);
    expect((await unlock(port, { ip })).status).toBe(429);
    expect((await unlock(port, { ip, raw: "{}" })).status).toBe(429); // F9: the limit comes before body validation (unparsable JSON is refused by the router itself)
    expect((await unlock(port, { ip, unlockId: "nope" })).status).toBe(429);
    expect(warn.mock.calls.filter((c) => c[1] === "unlock_rate_limited")).toEqual([[{ ip }, "unlock_rate_limited"]]);
    expect((await unlock(port, { ip: "10.9.9.10" })).status).toBe(401); // another IP is not limited
  });

  it("review F9: a bad body and an unknown id are logged (once per IP and reason), never silently dropped", async () => {
    const warn = vi.spyOn(log, "warn");
    const ip = "10.8.8.8";
    await unlock(port, { ip, raw: "{}" });
    await unlock(port, { ip, raw: "{}" });
    await unlock(port, { ip, unlockId: "nope" });
    expect(warn.mock.calls.filter((c) => c[1] === "unlock_refused")).toEqual([
      [{ ip, reason: "invalid_body" }, "unlock_refused"],
      [{ ip, reason: "unknown_unlock" }, "unlock_refused"],
    ]);
  });

  it("review F5: a failed answer is forgotten — the database fails once, the retry with the SAME requestId succeeds", async () => {
    const a = await account(500);
    const requestId = randomUUID();
    const db = await database.db();
    const spy = vi.spyOn(db, "transaction").mockRejectedValueOnce(new Error("down"));
    const first = await unlock(port, { token: a.token, unlockId: "floodlight", requestId });
    expect(first.status).toBe(503);
    spy.mockRestore();
    const retry = await unlock(port, { token: a.token, unlockId: "floodlight", requestId });
    expect(retry.body).toEqual({ ok: true, unlockId: "floodlight", progress: { supplies: 380, lifetimeSupplies: 500, unlocks: ["floodlight"] } });
  });

  it("the database down → 503, never a fake ok", async () => {
    const a = await account(500);
    const db = await database.db();
    const spy = vi.spyOn(db, "transaction").mockRejectedValue(new Error("down"));
    const r = await unlock(port, { token: a.token, unlockId: "mine" });
    spy.mockRestore();
    expect(r.status).toBe(503);
    expect(await row(a.id)).toMatchObject({ supplies: 500, unlocks: [] });
  });
});

describe("POST /account/unlock with PUBLIC_ORIGIN (CSRF)", () => {
  it("a foreign or missing Origin → 403 before anything else", async () => {
    const { colyseus, port } = await bootTestServer({ allowedOrigins: ["https://hordes.example"], sessionSecret: SECRET });
    try {
      expect((await unlock(port, { token: freshToken(), origin: "https://evil.example" })).status).toBe(403);
      expect((await unlock(port, { token: freshToken() })).status).toBe(403);
      expect((await unlock(port, { origin: "https://hordes.example" })).status).toBe(401);
    } finally {
      await colyseus.shutdown();
    }
  });
});

describe("RequestMemo (U3)", () => {
  it("returns the first answer within the TTL, forgets after it, holds at most `cap`", async () => {
    let t = 0;
    const memo = new RequestMemo(1000, 3, () => t);
    const a = Promise.resolve({ status: 429 as const, error: "rate_limited" as const });
    memo.set("k1", a);
    expect(memo.get("k1")).toBe(a);
    t = 999;
    expect(memo.get("k1")).toBe(a);
    t = 1000;
    expect(memo.get("k1")).toBeUndefined();
    for (const k of ["a", "b", "c", "d"]) memo.set(k, a);
    expect(memo.size).toBe(3);
    expect(memo.get("a")).toBeUndefined();
    expect(memo.get("d")).toBe(a);
  });

  it("an unknown id is refused before any database call", async () => {
    const accounts = { findByTokenHash: vi.fn() };
    const out = await buyUnlock(
      { cookieToken: "ab".repeat(16), unlockId: "nope", requestId: randomUUID(), ip: "1.2.3.4" },
      {
        accounts: accounts as never,
        progress: {} as never,
        ipLimiter: new SlidingWindowLimiter(10, 1000),
        accountLimiter: new SlidingWindowLimiter(10, 1000),
        logGate: new SlidingWindowLimiter(1, 1000),
        requests: new RequestMemo(),
      },
    );
    expect(out).toEqual({ status: 400, error: "unknown_unlock" });
    expect(accounts.findByTokenHash).not.toHaveBeenCalled();
  });
});
