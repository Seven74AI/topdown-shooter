import { randomUUID } from "node:crypto";
import { sql } from "drizzle-orm";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { log } from "../ops/logger";
import { accountsRepo, adminsRepo } from "./accountsRepo";
import { runAdminCommand } from "./adminCommand";
import { openPostgres, type Database } from "./client";
import { deviceTokensRepo } from "./deviceTokensRepo";
import { migrateDb } from "./migrate";
import { progressRepo } from "./progressRepo";

/**
 * Story 7.6 (brief 18, 19): the guest merge, logins and upgrades on a REAL PostgreSQL (the PGlite tests run on one
 * connection and can't see a race). Opt-in like 7.2's `realPostgres.test.ts`: skipped unless `TEST_DATABASE_URL`
 * names an empty scratch database, e.g. `TEST_DATABASE_URL=postgres://postgres@127.0.0.1:5432/t76 npx vitest run realPostgresAccounts`.
 */
/**
 * Review nit (Stories 8.4–8.6): the real-PostgreSQL files share one scratch database and each migrates it; run them
 * one file at a time: `TEST_DATABASE_URL=… npx vitest run realPostgres --no-file-parallelism` (CI: the `postgres` job, E7-A1).
 */
const URL = process.env.TEST_DATABASE_URL;
log.level = process.env.LOG_LEVEL ?? "silent";
let database: Database;
const hex = () => randomUUID().replace(/-/g, "").padEnd(64, "0");

describe.skipIf(!URL)("Story 7.6: accounts on real PostgreSQL (TEST_DATABASE_URL)", () => {
  beforeAll(async () => {
    database = openPostgres(URL as string);
    await migrateDb({ kind: "postgres", db: await database.db() });
  });
  afterAll(async () => database?.close());

  /** A device (token hash) whose account has `supplies`; `username` makes it a full account. */
  async function device(supplies: number, username?: string): Promise<{ token: string; id: string }> {
    const token = hex();
    const a = await accountsRepo(database).createGuest(token, "");
    const db = await database.db();
    await db.execute(sql`update progress set supplies = ${supplies}, lifetime_supplies = ${supplies} where account_id = ${a.id}`);
    if (username) expect(await accountsRepo(database).setCredentials(a.id, { username, passwordHash: "p", recoveryCodeHash: "r" })).toBe("ok");
    return { token, id: a.id };
  }
  const name = () => `u${randomUUID().slice(0, 12)}`;

  it("10 guest phones logging into one account at once: every guest merged once, Supplies add up exactly, no deadlock", async () => {
    const acct = await device(1000, name());
    const guests = await Promise.all(Array.from({ length: 10 }, (_, i) => device(i + 1)));
    const devices = deviceTokensRepo(database);
    const rs = await Promise.all(guests.map((g) => devices.logIn({ oldTokenHash: g.token, newTokenHash: hex(), accountId: acct.id })));
    expect(rs.every((r) => r.outcome === "ok" && r.merged !== null)).toBe(true);
    expect((await progressRepo(database).get(acct.id))?.supplies).toBe(1000 + 55);
  });

  it("merges in both id orders at once (guest A → account B while guest C → account A's twin) never deadlock, ×10", async () => {
    for (let k = 0; k < 10; k++) {
      const [x, y] = await Promise.all([device(10, name()), device(20, name())]);
      const [gx, gy] = await Promise.all([device(1), device(2)]);
      const devices = deviceTokensRepo(database);
      await Promise.all([
        devices.logIn({ oldTokenHash: gx.token, newTokenHash: hex(), accountId: y.id }),
        devices.logIn({ oldTokenHash: gy.token, newTokenHash: hex(), accountId: x.id }),
      ]);
      expect((await progressRepo(database).get(x.id))?.supplies).toBe(12);
      expect((await progressRepo(database).get(y.id))?.supplies).toBe(21);
    }
  });

  it("a bank of a guest and that guest's merge at the same moment: the run's Supplies reach the account exactly once, ×20", async () => {
    for (let k = 0; k < 20; k++) {
      const acct = await device(100, name());
      const g = await device(5);
      const repo = progressRepo(database);
      const ops = [
        () => repo.addSupplies(randomUUID(), g.id, () => ({ supplies: 30, breakdown: {} })),
        () => deviceTokensRepo(database).logIn({ oldTokenHash: g.token, newTokenHash: hex(), accountId: acct.id }),
      ];
      if (k % 2) ops.reverse();
      const rs = await Promise.allSettled(ops.map((f) => f()));
      expect(rs.every((r) => r.status === "fulfilled")).toBe(true);
      expect((await repo.get(acct.id))?.supplies).toBe(135);
      expect(await repo.get(g.id)).toBeNull();
    }
  });

  it("two banks of one guest at once, both ≥ 200: no deadlock on the nudge flag, nudged once, paid twice", async () => {
    for (let k = 0; k < 10; k++) {
      const g = await device(0);
      const repo = progressRepo(database);
      const rs = await Promise.all([0, 1].map(() => repo.addSupplies(randomUUID(), g.id, () => ({ supplies: 250, breakdown: {} }))));
      expect(rs.filter((r) => r.nudge)).toHaveLength(1);
      expect((await repo.get(g.id))?.supplies).toBe(500);
    }
  });

  it("two guests saving the same name (different case) at once: exactly one gets it", async () => {
    for (let k = 0; k < 5; k++) {
      const [a, b] = await Promise.all([device(0), device(0)]);
      const n = name();
      const acc = accountsRepo(database);
      const rs = await Promise.all([acc.setCredentials(a.id, { username: n, passwordHash: "p", recoveryCodeHash: "r" }), acc.setCredentials(b.id, { username: n.toUpperCase(), passwordHash: "p", recoveryCodeHash: "r" })]);
      expect(rs.sort()).toEqual(["ok", "taken"]);
    }
  });

  it("review L4: a reset and a login from ONE device at the same moment never deadlock (both settle, ×10)", async () => {
    for (let k = 0; k < 10; k++) {
      const acct = await device(0, name());
      const phone = await device(3);
      const devices = deviceTokensRepo(database);
      const rs = await Promise.allSettled([
        devices.logIn({ oldTokenHash: phone.token, newTokenHash: hex(), accountId: acct.id, credentials: { expectRecoveryHash: "r", passwordHash: "p2", recoveryCodeHash: "r2" } }),
        devices.logIn({ oldTokenHash: phone.token, newTokenHash: hex(), accountId: acct.id, expectPasswordHash: "p" }),
      ]);
      expect(rs.map((r) => r.status)).toEqual(["fulfilled", "fulfilled"]);
      expect((await progressRepo(database).get(acct.id))?.supplies).toBe(3); // the guest merged exactly once
    }
  });

  it("review M2 race: a login that verified the OLD password and commits after a reset is refused (the thief stays out)", async () => {
    const acct = await device(0, name());
    const devices = deviceTokensRepo(database);
    await devices.logIn({ oldTokenHash: null, newTokenHash: hex(), accountId: acct.id, credentials: { expectRecoveryHash: "r", passwordHash: "p2", recoveryCodeHash: "r2" } });
    expect((await devices.logIn({ oldTokenHash: null, newTokenHash: hex(), accountId: acct.id, expectPasswordHash: "p" })).outcome).toBe("stale_credentials");
  });

  it("two resets with the same recovery code at once: one wins, the other writes nothing", async () => {
    const acct = await device(0, name());
    const devices = deviceTokensRepo(database);
    const rs = await Promise.all(
      [1, 2].map((i) => devices.logIn({ oldTokenHash: null, newTokenHash: hex(), accountId: acct.id, credentials: { expectRecoveryHash: "r", passwordHash: `p${i}`, recoveryCodeHash: `r${i}` } })),
    );
    expect(rs.map((r) => r.outcome).sort()).toEqual(["ok", "stale_credentials"]);
  });

  it("Story 10.11 (AC 1): is_admin defaults to false; setAdmin marks only a registered account (case-blind); a guest is never matched", async () => {
    const n = name();
    const a = await device(0, n);
    const g = await device(0);
    expect((await accountsRepo(database).findByTokenHash(a.token))?.isAdmin).toBe(false);
    expect((await accountsRepo(database).findByTokenHash(g.token))?.isAdmin).toBe(false);
    // Case-blind: the operator types the name in upper case (the command lower-cases it for username_lower).
    expect(await runAdminCommand(["add", n.toUpperCase()], adminsRepo(database), () => {})).toBe(0);
    expect((await accountsRepo(database).findByTokenHash(a.token))?.isAdmin).toBe(true);
    expect((await adminsRepo(database).listAdmins()).some((x) => x.accountId === a.id && x.username === n)).toBe(true);
    expect(await adminsRepo(database).setAdmin("no_such_user_1011", true)).toBeNull();
    expect(await adminsRepo(database).setAdmin(n, false)).toEqual({ accountId: a.id });
    expect((await adminsRepo(database).listAdmins()).some((x) => x.accountId === a.id)).toBe(false);
  });
});
