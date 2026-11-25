import { DEFAULT_LOOK, accountSessionResponseSchema, encodeLook, lookSaveResponseSchema } from "@topdown/shared";
import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from "vitest";
import { accountsRepo } from "../db/accountsRepo";
import { type Database, openPglite } from "../db/client";
import { progressRepo, type Progress, type ProgressRepo } from "../db/progressRepo";
import { MAX_LOOK_SAVES_PER_ACCOUNT_PER_MIN } from "../net/limits";
import { SlidingWindowLimiter } from "../net/rateLimit";
import { log } from "../ops/logger";
import { hashGuestToken } from "../run/lobby";
import { bootTestServer } from "../test/bootTestServer";
import { canonicalLook, ownedFor, saveLook } from "./look";

/**
 * Story 7.10 T2 (AC 8, 11; E2; beat the rule 1, 2): `POST /account/look` through the real server and PGlite.
 */
const SECRET = "test-secret-".padEnd(48, "y");
let n = 0x700;
const freshToken = () => (++n).toString(16).padStart(4, "0").repeat(8);
const DEFAULT_CODE = encodeLook(DEFAULT_LOOK);
/** Starter parts only, odd colours (a slot-ring colour and Runner red: AC 4, no warning). */
const STARTER = "v1|top:hoodie|head:beanie|hair:mohawk|pack:school|skin:4|c:3d8bff,8b1a1a,ff8a1f";

interface Reply {
  status: number;
  body: { ok?: boolean; look?: string | null; message?: string };
}

async function post(port: number, o: { token?: string; look?: unknown; raw?: string; origin?: string; ip?: string }): Promise<Reply> {
  const headers: Record<string, string> = { "content-type": "application/json", "x-real-ip": o.ip ?? "10.7.0.1" };
  if (o.token !== undefined) headers.cookie = `__Host-tdg=${o.token}`;
  if (o.origin !== undefined) headers.origin = o.origin;
  const res = await fetch(`http://127.0.0.1:${port}/account/look`, { method: "POST", headers, body: o.raw ?? JSON.stringify({ look: o.look ?? STARTER }) });
  const text = await res.text();
  let body: unknown = text;
  try {
    body = JSON.parse(text);
  } catch {
    /* text */
  }
  return { status: res.status, body: body as Reply["body"] };
}

describe("POST /account/look (Story 7.10 AC 8, 11; E2)", () => {
  let database: Database;
  let port: number;
  let shutdown: () => Promise<void>;
  let cleanup: () => Promise<void>;

  async function account(): Promise<{ token: string; id: string }> {
    const token = freshToken();
    const res = await fetch(`http://127.0.0.1:${port}/account/session`, {
      method: "POST",
      headers: { "content-type": "application/json", "x-real-ip": `10.8.${n % 250}.${n % 200}` },
      body: JSON.stringify({ deviceToken: token }),
    });
    const s = accountSessionResponseSchema.parse(await res.json());
    if (!s.saved) throw new Error("expected saved");
    const acct = await accountsRepo(database).findByTokenHash(hashGuestToken(token));
    if (!acct) throw new Error("no account");
    return { token, id: acct.id };
  }
  const stored = async (id: string) => (await progressRepo(database).get(id))?.look;

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

  it("an owned look is stored as its canonical code and answered; one look_saved log line; the next session carries it", async () => {
    const a = await account();
    const info = vi.spyOn(log, "info");
    // a non-canonical spelling of the same look (slots out of order, uppercase would be refused per colour: keep lowercase)
    const messy = "v1|skin:4|pack:school|hair:mohawk|head:beanie|top:hoodie|c:3d8bff,8b1a1a,ff8a1f";
    const r = await post(port, { token: a.token, look: messy });
    expect(r.status).toBe(200);
    expect(lookSaveResponseSchema.parse(r.body)).toEqual({ ok: true, look: STARTER });
    expect(await stored(a.id)).toBe(STARTER); // canonical, not the request text
    expect(info.mock.calls.filter((c) => c[1] === "look_saved")).toHaveLength(1);
    const s = await fetch(`http://127.0.0.1:${port}/account/session`, { method: "POST", headers: { "content-type": "application/json", cookie: `__Host-tdg=${a.token}` }, body: "{}" });
    const sess = accountSessionResponseSchema.parse(await s.json());
    expect(sess.saved && sess.progress?.look).toBe(STARTER);
  });

  it("E2: a crafted save with head:riot (milestone) and head:prop / pack:golf (loot, milestone) stores the default parts and answers what was stored", async () => {
    const a = await account();
    const r = await post(port, { token: a.token, look: "v1|top:camo|head:riot|hair:mohawk|pack:golf|skin:4|c:3d8bff,8b1a1a,ff8a1f" });
    expect(r.status).toBe(200);
    const want = `v1|top:${DEFAULT_LOOK.top}|head:${DEFAULT_LOOK.head}|hair:mohawk|pack:${DEFAULT_LOOK.pack}|skin:4|c:3d8bff,8b1a1a,ff8a1f`;
    expect(r.body.look).toBe(want);
    expect(await stored(a.id)).toBe(want);
    expect(want).toContain("head:cap");
  });

  it("the default look (or junk that decodes to it) is stored as null (7.6 reads null as 'never customised')", async () => {
    const a = await account();
    await post(port, { token: a.token, look: STARTER });
    expect(await stored(a.id)).toBe(STARTER);
    const r = await post(port, { token: a.token, look: DEFAULT_CODE });
    expect(r.status).toBe(200);
    expect(r.body.look).toBeNull();
    expect(await stored(a.id)).toBeNull();
    await post(port, { token: a.token, look: STARTER });
    const junk = await post(port, { token: a.token, look: "v1|junk|😀" });
    expect(junk.body.look).toBeNull(); // every field replaced by its default
    expect(await stored(a.id)).toBeNull();
  });

  it("401 without a session (no cookie, a bad cookie, an unknown token); an account id in the body is refused (400), never used", async () => {
    expect((await post(port, {})).status).toBe(401);
    expect((await post(port, { token: "nothex" })).status).toBe(401);
    expect((await post(port, { token: freshToken() })).status).toBe(401);
    const a = await account();
    const b = await account();
    const r = await post(port, { token: a.token, raw: JSON.stringify({ look: STARTER, accountId: b.id }) });
    expect(r.status).toBe(400);
    expect(await stored(b.id)).toBeNull();
    expect(await stored(a.id)).toBeNull();
  });

  it(`429 after ${MAX_LOOK_SAVES_PER_ACCOUNT_PER_MIN} saves a minute per account (another account is not affected); no database write past the limit`, async () => {
    const a = await account();
    const b = await account();
    const codes: number[] = [];
    for (let i = 0; i < MAX_LOOK_SAVES_PER_ACCOUNT_PER_MIN; i++) codes.push((await post(port, { token: a.token, look: STARTER, ip: `10.9.0.${i}` })).status);
    expect(codes).toEqual(Array(MAX_LOOK_SAVES_PER_ACCOUNT_PER_MIN).fill(200));
    const over = await post(port, { token: a.token, look: DEFAULT_CODE, ip: "10.9.1.1" });
    expect(over.status).toBe(429);
    expect(await stored(a.id)).toBe(STARTER); // the 11th (default look) was NOT written
    expect((await post(port, { token: b.token, look: STARTER })).status).toBe(200);
  });

  it("413 on a body over 256 bytes (a 10 kB look, a padded body), checked before the account is looked up; nothing stored", async () => {
    const a = await account();
    const big = await post(port, { token: a.token, look: "v1|" + "x".repeat(10_000) });
    expect(big.status).toBe(413);
    const padded = await post(port, { token: a.token, raw: JSON.stringify({ look: STARTER }) + " ".repeat(300) });
    expect(padded.status).toBe(413);
    const justUnder = await post(port, { token: a.token, look: STARTER + "|" + "z".repeat(256 - 12 - STARTER.length - 1) });
    expect(justUnder.status).toBe(200);
    expect(await stored(a.id)).toBe(STARTER); // the extra field is dropped by the decoder
  });

  it("review L2 (two phones): a save with a base is stored only while the account still has that base; else the newer look is kept and answered stale", async () => {
    const a = await account();
    // phone A saves STARTER; phone B (offline earlier, edited from the default look = base null) retries OTHER
    const OTHER = "v1|top:puffer|head:hood|hair:curly|pack:duffel|skin:2|c:112233,445566,778899";
    expect((await post(port, { token: a.token, look: STARTER })).body.look).toBe(STARTER);
    const stale = await post(port, { token: a.token, raw: JSON.stringify({ look: OTHER, base: null }) });
    expect(stale.status).toBe(200);
    expect(stale.body).toEqual({ ok: true, look: STARTER, stale: true });
    expect(await stored(a.id)).toBe(STARTER); // A's newer look is kept
    // with the right base it is stored (B edited from A's look)
    const ok = await post(port, { token: a.token, raw: JSON.stringify({ look: OTHER, base: STARTER }) });
    expect(ok.body).toEqual({ ok: true, look: OTHER });
    expect(await stored(a.id)).toBe(OTHER);
    // a base that is not a plausible look is refused by the schema
    expect((await post(port, { token: a.token, raw: JSON.stringify({ look: OTHER, base: "x".repeat(100) }) })).status).toBe(400);
  });

  it("403 for a foreign Origin when origins are set (CSRF), like the other account calls", async () => {
    const booted = await bootTestServer({ database, sessionSecret: SECRET, allowedOrigins: ["https://game.example"] });
    try {
      const token = freshToken();
      const r = await post(booted.port, { token, origin: "https://evil.example" });
      expect(r.status).toBe(403);
    } finally {
      await booted.colyseus.shutdown();
    }
  });
});

describe("saveLook (unit): owned set from the locked row, 503 when the save server fails", () => {
  const limiter = () => new SlidingWindowLimiter(100, 60_000);
  const accounts = { findByTokenHash: async () => ({ id: "acc-1" }) } as never;

  it("the owned set comes from the row (7.11's cosmetics), never from the request", async () => {
    const row = { accountId: "acc-1", supplies: 0, lifetimeSupplies: 0, unlocks: [], training: {}, districts: [], look: null } as Progress;
    expect(ownedFor(row).has("head:riot")).toBe(false);
    expect(ownedFor({ ...row, cosmetics: ["head:riot"] } as Progress).has("head:riot")).toBe(true);
    let written: string | null | undefined;
    const progress = { saveLook: async (_id: string, f: (r: Progress) => string | null) => ({ look: (written = f({ ...row, cosmetics: ["head:riot"] } as Progress)), written: true }) } as unknown as ProgressRepo;
    const out = await saveLook({ cookieToken: "ab".repeat(16), look: STARTER.replace("head:beanie", "head:riot") }, { accounts, progress, ipLimiter: limiter(), accountLimiter: limiter(), logGate: limiter() });
    expect(out).toEqual({ status: 200, body: { ok: true, look: STARTER.replace("head:beanie", "head:riot") } });
    expect(written).toContain("head:riot");
  });

  it("a failing repository → 503 save_unavailable (the client keeps the look on the phone, AC 9)", async () => {
    const progress = { saveLook: async () => Promise.reject(new Error("db down")) } as unknown as ProgressRepo;
    expect(await saveLook({ cookieToken: "ab".repeat(16), look: STARTER }, { accounts, progress, ipLimiter: limiter(), accountLimiter: limiter(), logGate: limiter() })).toEqual({ status: 503, error: "save_unavailable" });
    const brokenAccounts = { findByTokenHash: async () => Promise.reject(new Error("db down")) } as never;
    expect(await saveLook({ cookieToken: "ab".repeat(16), look: STARTER }, { accounts: brokenAccounts, progress, ipLimiter: limiter(), accountLimiter: limiter(), logGate: limiter() })).toEqual({ status: 503, error: "save_unavailable" });
  });

  it("AC 4: the four slot colours and Runner red save unchanged (no warning, no change)", () => {
    for (const c of ["3d8bff", "ff8a1f", "34c759", "b05cff", "8b1a1a"]) {
      const code = `v1|top:hoodie|head:beanie|hair:mohawk|pack:school|skin:4|c:${c},${c},${c}`;
      expect(canonicalLook(code, ownedFor({} as Progress)).look).toBe(code);
    }
  });
});
