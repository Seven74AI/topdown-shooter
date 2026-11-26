import { randomUUID } from "node:crypto";
import { sql } from "drizzle-orm";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { log } from "../ops/logger";
import { accountsRepo } from "./accountsRepo";
import { openPostgres, type Database } from "./client";
import { deviceTokensRepo } from "./deviceTokensRepo";
import { migrateDb } from "./migrate";
import { progressRepo } from "./progressRepo";

/**
 * Story 10.1 review (M2, L3, L4, M3, L6): Delete my progress racing logins and banks on a REAL PostgreSQL (PGlite runs on
 * one connection and can't show a race or a deadlock). Opt-in like the other real-PG files:
 * `TEST_DATABASE_URL=postgres://… npx vitest run realPostgresDelete --no-file-parallelism`.
 */
const URL = process.env.TEST_DATABASE_URL;
log.level = process.env.LOG_LEVEL ?? "silent";
let database: Database;
const hex = () => randomUUID().replace(/-/g, "").padEnd(64, "0");
const name = () => `d${randomUUID().slice(0, 12)}`;

describe.skipIf(!URL)("Story 10.1: Delete my progress on real PostgreSQL (TEST_DATABASE_URL)", () => {
  beforeAll(async () => {
    database = openPostgres(URL as string);
    await migrateDb({ kind: "postgres", db: await database.db() });
  });
  afterAll(async () => database?.close());

  async function acct(): Promise<{ token: string; id: string }> {
    const token = hex();
    const a = await accountsRepo(database).createGuest(token, "");
    expect(await accountsRepo(database).setCredentials(a.id, { username: name(), passwordHash: "p", recoveryCodeHash: "r" })).toBe("ok");
    return { token, id: a.id };
  }
  const count = async (q: ReturnType<typeof sql>): Promise<number> => ((await (await database.db()).execute(q)) as unknown as { rows: { n: number }[] }).rows[0]?.n ?? 0;

  it("M2 / L3 / L4: a delete and a login of a new phone at the same moment, ×20: never a deadlock or a 503; either the delete wins (the login is stale) or the login wins (new_device, nothing deleted)", async () => {
    let deleted = 0;
    let kept = 0;
    for (let k = 0; k < 20; k++) {
      const a = await acct();
      const repo = accountsRepo(database);
      const checked = new Set([a.token]);
      const [del, login] = await Promise.all([repo.deleteAccount(a.token, a.id, "p", checked), deviceTokensRepo(database).logIn({ oldTokenHash: null, newTokenHash: hex(), accountId: a.id, expectPasswordHash: "p" })]);
      if (del.outcome === "deleted") {
        deleted++;
        expect(login.outcome).toBe("stale_credentials");
        expect(await count(sql`select count(*)::int as n from device_tokens where account_id = ${a.id}`)).toBe(0);
      } else {
        kept++;
        expect(del.outcome).toBe("new_device");
        expect(login.outcome).toBe("ok");
        expect(await count(sql`select count(*)::int as n from accounts where id = ${a.id}`)).toBe(1);
      }
    }
    expect(deleted + kept).toBe(20);
  });

  /** An account with two devices D and E (both checked by the route). */
  async function twoDevices(): Promise<{ id: string; d: string; e: string }> {
    const a = await acct();
    const e = hex();
    const r = await deviceTokensRepo(database).logIn({ oldTokenHash: null, newTokenHash: e, accountId: a.id, expectPasswordHash: "p" });
    expect(r.outcome).toBe("ok");
    return { id: a.id, d: a.token, e };
  }
  const tallies = new Map<string, number>();
  const tally = (k: string): void => void tallies.set(k, (tallies.get(k) ?? 0) + 1);
  afterAll(() => {
    if (tallies.size > 0) console.info(`race tallies: ${JSON.stringify(Object.fromEntries(tallies))}`);
  });
  const isDeadlockOr503 = (e: unknown): boolean => {
    for (let x: unknown = e, i = 0; x && i < 5; x = (x as { cause?: unknown }).cause, i++) if ((x as { code?: unknown }).code === "40P01") return true;
    return true; // any thrown error is a 503 for the route
  };

  it("re-review M2: a delete from D and a re-login of the account's OTHER phone E (it holds its own device row) at once, ×20: no 40P01, no error", async () => {
    let errors = 0;
    for (let k = 0; k < 20; k++) {
      const { id, d, e } = await twoDevices();
      const results = await Promise.allSettled([
        accountsRepo(database).deleteAccount(d, id, "p", new Set([d, e])),
        deviceTokensRepo(database).logIn({ oldTokenHash: e, newTokenHash: hex(), accountId: id, expectPasswordHash: "p" }),
      ]);
      for (const r of results) if (r.status === "rejected" && isDeadlockOr503(r.reason)) errors++;
      const [del, login] = results;
      tally(`relogin del=${del.status === "fulfilled" ? del.value.outcome : "error"} login=${login.status === "fulfilled" ? login.value.outcome : "error"}`);
      if (del.status === "fulfilled" && del.value.outcome === "deleted") expect(login.status === "fulfilled" && login.value.outcome).toBe("stale_credentials");
    }
    expect(errors).toBe(0);
  });

  it("re-review M2: two deletes of one account from its phones D and E at once, ×20: no 40P01, no error, the account goes exactly once", async () => {
    let errors = 0;
    for (let k = 0; k < 20; k++) {
      const { id, d, e } = await twoDevices();
      const both = new Set([d, e]);
      const results = await Promise.allSettled([accountsRepo(database).deleteAccount(d, id, "p", both), accountsRepo(database).deleteAccount(e, id, "p", both)]);
      for (const r of results) if (r.status === "rejected" && isDeadlockOr503(r.reason)) errors++;
      const outcomes = results.map((r) => (r.status === "fulfilled" ? r.value.outcome : "error"));
      tally(`two-deletes ${[...outcomes].sort().join("+")}`);
      expect(outcomes.filter((o) => o === "deleted").length).toBeLessThanOrEqual(1);
    }
    expect(errors).toBe(0);
  });

  it("re-review M2 (lock-order audit): a delete and a forgotten-password reset of the same account at once, ×20: no 40P01, no error", async () => {
    let errors = 0;
    for (let k = 0; k < 20; k++) {
      const { id, d, e } = await twoDevices();
      await (await database.db()).execute(sql`update accounts set recovery_code_hash = 'r' where id = ${id}`);
      const results = await Promise.allSettled([
        accountsRepo(database).deleteAccount(d, id, "p", new Set([d, e])),
        deviceTokensRepo(database).logIn({ oldTokenHash: e, newTokenHash: hex(), accountId: id, credentials: { expectRecoveryHash: "r", passwordHash: "p2", recoveryCodeHash: "r2" } }),
      ]);
      for (const r of results) if (r.status === "rejected" && isDeadlockOr503(r.reason)) errors++;
      tally(`reset del=${results[0].status === "fulfilled" ? results[0].value.outcome : "error"} reset=${results[1].status === "fulfilled" ? results[1].value.outcome : "error"}`);
    }
    expect(errors).toBe(0);
  });

  it("M3: a bank racing the delete of its account, ×20: never an error; the money lands before the delete or nowhere", async () => {
    for (let k = 0; k < 20; k++) {
      const a = await acct();
      const run = randomUUID();
      const [, bank] = await Promise.all([accountsRepo(database).deleteAccount(a.token, a.id, "p", new Set([a.token])), progressRepo(database).addSupplies(run, a.id, () => ({ supplies: 25, breakdown: {} }))]);
      expect(typeof bank.banked).toBe("boolean");
      expect(await count(sql`select count(*)::int as n from run_rewards where account_id = ${a.id}`)).toBe(0);
    }
  });

  it("L6: the bag marker survives the finder's delete; a later bank of the run gets no second bag", async () => {
    const finder = await acct();
    const other = await acct();
    const run = randomUUID();
    const repo = progressRepo(database);
    const meta = (key: string) => ({ statsDelta: { revives: 0, kills: 0, barricades: 0, runs: 1 }, grant: () => ({ cosmetics: [key], districts: [], breakdown: { loot: { key } } }) });
    expect((await repo.addSupplies(run, finder.id, () => ({ supplies: 1, breakdown: {} }), meta("hat:red"))).breakdown.loot).toEqual({ key: "hat:red" });
    expect((await accountsRepo(database).deleteAccount(finder.token, finder.id, "p", new Set([finder.token]))).outcome).toBe("deleted");
    expect(await count(sql`select count(*)::int as n from paid_bags where run_id = ${run}`)).toBe(1);
    expect((await repo.addSupplies(run, other.id, () => ({ supplies: 1, breakdown: {} }), meta("hat:blue"))).breakdown.loot).toBeUndefined();
  });
});
