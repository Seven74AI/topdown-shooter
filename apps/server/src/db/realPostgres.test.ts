import { randomUUID } from "node:crypto";
import pg from "pg";
import { sql } from "drizzle-orm";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { log } from "../ops/logger";
import { BANK_RETRY_MS, RunBank } from "../meta/banking";
import { accountsRepo } from "./accountsRepo";
import { openPostgres, type Database } from "./client";
import { migrateDb } from "./migrate";
import { progressRepo } from "./progressRepo";
import { countRunRewards } from "./testQueries";

/**
 * Story 7.2 review L1 + M1 (brief 18, 20): banking on a REAL PostgreSQL (the PGlite tests run on one connection, so
 * they can't see a race). Opt-in: skipped unless `TEST_DATABASE_URL` points at an empty scratch database (CI, the VPS
 * or a local `postgres`), e.g. `TEST_DATABASE_URL=postgres://postgres@127.0.0.1:5432/t72 npx vitest run realPostgres`.
 * From the review's probe (`_bmad-output/implementation-artifacts/7-2-review-probes/realPostgres.probe.ts.txt`).
 */
const URL = process.env.TEST_DATABASE_URL;
log.level = process.env.LOG_LEVEL ?? "silent";
let database: Database;

describe.skipIf(!URL)("Story 7.2: banking on real PostgreSQL (TEST_DATABASE_URL)", () => {
  beforeAll(async () => {
    database = openPostgres(URL as string);
    await migrateDb({ kind: "postgres", db: await database.db() });
  });
  afterAll(async () => database?.close());

  const acct = async () => accountsRepo(database).createGuest(randomUUID().replace(/-/g, "").padEnd(64, "a"), "Ana");
  const rookiePay = (raw: number) => (life: number) => ({ supplies: life < 300 ? raw * 2 : raw, breakdown: { life } });

  it("L1 (FOR UPDATE): two runs ending at once around lifetime 250 → only one doubled (400, never 450), 10 tries", async () => {
    for (let k = 0; k < 10; k++) {
      const a = await acct();
      const repo = progressRepo(database);
      await repo.addSupplies(randomUUID(), a.id, () => ({ supplies: 250, breakdown: {} }));
      await Promise.all([repo.addSupplies(randomUUID(), a.id, rookiePay(50)), repo.addSupplies(randomUUID(), a.id, rookiePay(50))]);
      expect((await repo.get(a.id))?.lifetimeSupplies).toBe(400); // 250 + 100 (the first, rookie) + 50
    }
  });

  it("20 runs ending at once for one account add up exactly", async () => {
    const a = await acct();
    const repo = progressRepo(database);
    await Promise.all(Array.from({ length: 20 }, () => repo.addSupplies(randomUUID(), a.id, () => ({ supplies: 7, breakdown: {} }))));
    expect((await repo.get(a.id))?.supplies).toBe(140);
  });

  it("a concurrent double-submit of ONE (run, account) ×10 pays once", async () => {
    const a = await acct();
    const repo = progressRepo(database);
    const run = randomUUID();
    const rs = await Promise.all(Array.from({ length: 10 }, () => repo.addSupplies(run, a.id, () => ({ supplies: 33, breakdown: { x: 1 } }))));
    expect(rs.filter((r) => r.banked).length).toBe(1);
    expect((await repo.get(a.id))?.supplies).toBe(33);
    expect(await countRunRewards(database, a.id)).toBe(1);
  });

  it("a brand-new account (no progress row): two banks at once both land", async () => {
    const a = await acct();
    const db = await database.db();
    await db.execute(sql`delete from progress where account_id = ${a.id}`);
    const repo = progressRepo(database);
    await Promise.all([repo.addSupplies(randomUUID(), a.id, () => ({ supplies: 5, breakdown: {} })), repo.addSupplies(randomUUID(), a.id, () => ({ supplies: 5, breakdown: {} }))]);
    expect((await repo.get(a.id))?.supplies).toBe(10);
  });

  /** Another session holds the progress row (`FOR UPDATE`) for `ms`. */
  async function lockFor(accountId: string, ms: number): Promise<void> {
    const c = new pg.Client({ connectionString: URL });
    await c.connect();
    await c.query("begin");
    await c.query("select * from progress where account_id = $1 for update", [accountId]);
    setTimeout(() => void c.query("commit").then(() => c.end()), ms);
  }

  for (const [lockMs, expected] of [
    [3000, { status: "saved", supplies: 1050, rows: 1 }], // the first attempt gives up, the retry (after 2 s) gets the row: paid once
    [5500, { status: "failed", supplies: 1000, rows: 0 }], // M1: both attempts give up AND nothing commits later
  ] as const) {
    it(`M1: a row locked ${lockMs / 1000} s → ${expected.status}, and the money matches what the player was told`, async () => {
      const a = await acct();
      const repo = progressRepo(database);
      await repo.addSupplies(randomUUID(), a.id, () => ({ supplies: 1000, breakdown: {} })); // lifetime 1000: no rookie
      const before = await countRunRewards(database, a.id);
      await lockFor(a.id, lockMs);
      const bank = new RunBank(7, { repo: () => repo, log: { info: () => {}, error: () => {} }, deliver: () => {}, retryMs: BANK_RETRY_MS });
      const r = await bank.bank({ playerId: "p1", accountId: a.id, record: { wavesIn: 5, endlessWavesIn: 0, bossesIn: 0, endlessBossesIn: 0 }, ending: "wiped" });
      await new Promise((res) => setTimeout(res, Math.max(0, lockMs - 3000) + 2000)); // well past the lock: any late commit has landed
      expect(r.status).toBe(expected.status);
      expect((await repo.get(a.id))?.supplies).toBe(expected.supplies);
      expect((await countRunRewards(database, a.id)) - before).toBe(expected.rows);
    }, 20_000);
  }
});
