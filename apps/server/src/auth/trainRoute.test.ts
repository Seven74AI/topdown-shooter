/**
 * Story 7.5 (AC 3; T1, T3; brief 15, 18): `POST /account/training` against a real PGlite through the real route.
 */
import { randomUUID } from "node:crypto";
import { accountSessionResponseSchema, trainResponseSchema, type TrainResponse } from "@topdown/shared";
import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from "vitest";
import { accountsRepo } from "../db/accountsRepo";
import { type Database, openPglite } from "../db/client";
import { progressRepo } from "../db/progressRepo";
import { log } from "../ops/logger";
import { hashGuestToken } from "../run/lobby";
import { bootTestServer } from "../test/bootTestServer";
import { trainRequests } from "./train";
import { trainAccountLimiter, trainIpLimiter } from "../net/rateLimit";

const SECRET = "test-secret-".padEnd(48, "x");
let n = 5000;
const freshToken = () => (++n).toString(16).padStart(4, "0").repeat(8);
const T0 = { max_hp: 0, damage: 0, start_money: 0, reload: 0 };

interface Reply {
  status: number;
  body: TrainResponse & { message?: string };
}

async function train(port: number, o: { token?: string; boost?: string; level?: number; requestId?: string; raw?: string; ip?: string; origin?: string }): Promise<Reply> {
  const headers: Record<string, string> = { "content-type": "application/json", "x-real-ip": o.ip ?? `10.9.${n % 250}.1` };
  if (o.token !== undefined) headers.cookie = `__Host-tdg=${o.token}`;
  if (o.origin !== undefined) headers.origin = o.origin;
  const res = await fetch(`http://127.0.0.1:${port}/account/training`, {
    method: "POST",
    headers,
    body: o.raw ?? JSON.stringify({ boost: o.boost ?? "max_hp", level: o.level ?? 1, requestId: o.requestId ?? randomUUID() }),
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

describe("POST /account/training (Story 7.5 AC 3; T1, T3)", () => {
  let database: Database;
  let port: number;
  let shutdown: () => Promise<void>;
  let cleanup: () => Promise<void>;

  async function account(supplies: number): Promise<{ token: string; id: string }> {
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
    trainRequests.clear();
    trainIpLimiter.reset();
    trainAccountLimiter.reset();
    await cleanup();
  });
  afterAll(async () => {
    await shutdown();
  });

  it("T3: levels 1–5 cost 50, 100, 150, 200, 250 (750 a boost); level 6 → maxed; one `trained` line each", async () => {
    const a = await account(800);
    const info = vi.spyOn(log, "info");
    let supplies = 800;
    for (let level = 1; level <= 5; level++) {
      const r = await train(port, { token: a.token, boost: "damage", level });
      expect(r.status).toBe(200);
      supplies -= 50 * level;
      expect(trainResponseSchema.parse(r.body)).toEqual({ ok: true, boost: "damage", level, progress: { supplies, lifetimeSupplies: 800, unlocks: [], training: { ...T0, damage: level } } });
    }
    expect(supplies).toBe(50);
    const six = await train(port, { token: a.token, boost: "damage", level: 6 });
    expect(six.body).toMatchObject({ ok: false, reason: "maxed" });
    expect(await row(a.id)).toMatchObject({ supplies: 50, training: { damage: 5 } });
    expect(info.mock.calls.filter((c) => c[1] === "trained").map((c) => (c[0] as { cost: number }).cost)).toEqual([50, 100, 150, 200, 250]);
  });

  it("beat the rule: { level: 5 } at level 0 → already_trained, nothing charged; a cost in the body → 400", async () => {
    const a = await account(1000);
    const r = await train(port, { token: a.token, boost: "reload", level: 5 });
    expect(r.body).toMatchObject({ ok: false, reason: "already_trained" });
    expect(await row(a.id)).toMatchObject({ supplies: 1000, training: {} });
    const bad = await train(port, { token: a.token, raw: JSON.stringify({ boost: "reload", level: 1, requestId: randomUUID(), cost: 1 }) });
    expect(bad.status).toBe(400);
    const unknown = await train(port, { token: a.token, raw: JSON.stringify({ boost: "speed", level: 1, requestId: randomUUID() }) });
    expect(unknown.status).toBe(400);
  });

  it("not enough → not_enough with need, the row unchanged", async () => {
    const a = await account(30);
    const r = await train(port, { token: a.token, boost: "max_hp", level: 1 });
    expect(r.body).toEqual({ ok: false, boost: "max_hp", reason: "not_enough", need: 20, progress: { supplies: 30, lifetimeSupplies: 30, unlocks: [], training: T0 } });
    expect(await row(a.id)).toMatchObject({ supplies: 30 });
  });

  it("T3 brief 18: the same requestId twice at once → one charge; two devices training the same level at once → one level", async () => {
    const a = await account(1000);
    const requestId = randomUUID();
    const [x, y] = await Promise.all([train(port, { token: a.token, boost: "start_money", level: 1, requestId }), train(port, { token: a.token, boost: "start_money", level: 1, requestId })]);
    expect(x.body).toEqual(y.body);
    expect(x.body.ok).toBe(true);
    expect(await row(a.id)).toMatchObject({ supplies: 950, training: { start_money: 1 } });
    const [p, q] = await Promise.all([train(port, { token: a.token, boost: "start_money", level: 2 }), train(port, { token: a.token, boost: "start_money", level: 2 })]);
    expect([p.body.ok, q.body.ok].sort()).toEqual([false, true]);
    expect([p.body, q.body].find((b) => !b.ok)).toMatchObject({ reason: "already_trained" });
    expect(await row(a.id)).toMatchObject({ supplies: 850, training: { start_money: 2 } });
  });

  it("two concurrent trains with Supplies for one → exactly one wins, the balance never below 0", async () => {
    const a = await account(60);
    const [p, q] = await Promise.all([train(port, { token: a.token, boost: "max_hp", level: 1 }), train(port, { token: a.token, boost: "damage", level: 1 })]);
    expect([p.body.ok, q.body.ok].filter(Boolean).length).toBe(1);
    expect([p.body, q.body].find((b) => !b.ok)).toMatchObject({ reason: "not_enough", need: 40 });
    expect((await row(a.id))?.supplies).toBe(10);
  });

  it("the session reply carries progress.training", async () => {
    const a = await account(100);
    await train(port, { token: a.token, boost: "reload", level: 1 });
    const res = await fetch(`http://127.0.0.1:${port}/account/session`, {
      method: "POST",
      headers: { "content-type": "application/json", cookie: `__Host-tdg=${a.token}`, "x-real-ip": "10.7.0.1" },
      body: "{}",
    });
    const s = accountSessionResponseSchema.parse(await res.json());
    expect(s.saved && s.progress?.training).toEqual({ ...T0, reload: 1 });
  });

  it("no cookie → 401; the database down → 503, never a fake ok", async () => {
    expect((await train(port, {})).status).toBe(401);
    const a = await account(500);
    const db = await database.db();
    const spy = vi.spyOn(db, "transaction").mockRejectedValue(new Error("down"));
    const r = await train(port, { token: a.token, boost: "max_hp", level: 1 });
    spy.mockRestore();
    expect(r.status).toBe(503);
    expect((await row(a.id))?.supplies).toBe(500);
  });
});
