import { cpSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { type SQL, sql } from "drizzle-orm";
import { afterEach, describe, expect, it } from "vitest";
import { log } from "../ops/logger";
import { accountsRepo } from "./accountsRepo";
import { type Database, type Db, openPglite } from "./client";
import { MIGRATIONS_FOLDER } from "./migrate";
import { progressRepo } from "./progressRepo";
import { DbUnavailableError } from "./timeout";

/** Story 7.2 (AC 4, brief 18, 21): the run_rewards migration and `progressRepo.addSupplies`. */
log.level = process.env.LOG_LEVEL ?? "silent";
const open: Database[] = [];
const fresh = (): Database => {
  const d = openPglite();
  open.push(d);
  return d;
};
afterEach(async () => {
  for (const d of open.splice(0)) await d.close();
});
async function rows<T>(db: Db, query: SQL): Promise<T[]> {
  return ((await db.execute(query)) as unknown as { rows: T[] }).rows;
}
const RUN_A = "0f1e2d3c-4b5a-4968-8776-655443322110";
const RUN_B = "1f1e2d3c-4b5a-4968-8776-655443322111";
const pays = (n: number) => () => ({ supplies: n, breakdown: { waves: n } });

async function account(database: Database, hash = "c".repeat(64)) {
  return accountsRepo(database).createGuest(hash, "Ana");
}

describe("Story 7.2: banking a run (progressRepo.addSupplies)", () => {
  it("banks once: Supplies and lifetime grow, one run_rewards row; the same (run, account) again pays nothing", async () => {
    const database = fresh();
    const acct = await account(database);
    const repo = progressRepo(database);
    const first = await repo.addSupplies(RUN_A, acct.id, pays(250));
    expect(first).toEqual({ banked: true, supplies: 250, newTotal: 250, breakdown: { waves: 250 }, nudge: true }); // 7.6: a guest's first ≥ 200
    const again = await repo.addSupplies(RUN_A, acct.id, pays(999)); // a retry, a second endRun, a reconnect
    expect(again).toEqual({ banked: false, supplies: 250, newTotal: 250, breakdown: { waves: 250 }, nudge: false });
    expect(await repo.get(acct.id)).toMatchObject({ supplies: 250, lifetimeSupplies: 250 });
    const db = await database.db();
    expect((await rows<{ n: number }>(db, sql`select count(*)::int as n from run_rewards`))[0]?.n).toBe(1);
  });

  it("the payout sees lifetime Supplies read inside the transaction (the rookie rule's input)", async () => {
    const database = fresh();
    const acct = await account(database);
    const repo = progressRepo(database);
    await repo.addSupplies(RUN_A, acct.id, pays(290));
    const seen: number[] = [];
    await repo.addSupplies(RUN_B, acct.id, (lifetime) => {
      seen.push(lifetime);
      return { supplies: 200, breakdown: {} };
    });
    expect(seen).toEqual([290]);
    expect(await repo.get(acct.id)).toMatchObject({ supplies: 490, lifetimeSupplies: 490 });
  });

  it("brief 18: two rooms ending at once for one account both bank and add up; a concurrent double-submit of ONE run pays once", async () => {
    const database = fresh();
    const acct = await account(database);
    const repo = progressRepo(database);
    const seen: number[] = [];
    const pay = (n: number) => (lifetime: number) => {
      seen.push(lifetime);
      return { supplies: n, breakdown: {} };
    };
    await Promise.all([repo.addSupplies(RUN_A, acct.id, pay(100)), repo.addSupplies(RUN_B, acct.id, pay(40))]);
    expect(await repo.get(acct.id)).toMatchObject({ supplies: 140, lifetimeSupplies: 140 });
    // Serialized: one bank saw 0, the other saw the first one's amount (never both 0: that would lose the rookie line).
    expect(seen.sort((a, b) => a - b)).toSatisfy((s: number[]) => (s[0] === 0 && (s[1] === 100 || s[1] === 40)));
    const r = await Promise.all([repo.addSupplies("2f1e2d3c-4b5a-4968-8776-655443322112", acct.id, pays(10)), repo.addSupplies("2f1e2d3c-4b5a-4968-8776-655443322112", acct.id, pays(10))]);
    expect(r.filter((x) => x.banked).length).toBe(1);
    expect(await repo.get(acct.id)).toMatchObject({ supplies: 150, lifetimeSupplies: 150 });
  });

  it("an account with no progress row gets one (empty) before the bank; an unknown account is refused (foreign key)", async () => {
    const database = fresh();
    const acct = await account(database);
    const db = await database.db();
    await db.execute(sql`delete from progress where account_id = ${acct.id}`);
    const repo = progressRepo(database);
    expect((await repo.addSupplies(RUN_A, acct.id, pays(30))).newTotal).toBe(30);
    await expect(repo.addSupplies(RUN_A, "99999999-9999-4999-8999-999999999999", pays(30))).rejects.toThrow();
  });

  it("a negative payout is clamped to 0 (a balance never goes down through a bank)", async () => {
    const database = fresh();
    const acct = await account(database);
    const r = await progressRepo(database).addSupplies(RUN_A, acct.id, pays(-50));
    expect(r.supplies).toBe(0);
    expect(r.newTotal).toBe(0);
  });

  it("re-review RR-M1: a slow connection checkout (2.5 s, past the old 2 s timer) is awaited: the result is the commit's own (banked), never 'failed'", async () => {
    const real = fresh();
    const acct = await account(real);
    const slow: Database = { kind: real.kind, db: async () => { await new Promise((r) => setTimeout(r, 2500)); return real.db(); }, close: () => real.close() };
    const t0 = performance.now();
    const r = await progressRepo(slow).addSupplies(RUN_A, acct.id, pays(40));
    expect(performance.now() - t0).toBeGreaterThanOrEqual(2400);
    expect(r).toMatchObject({ banked: true, supplies: 40, newTotal: 40 });
    expect(await progressRepo(real).get(acct.id)).toMatchObject({ supplies: 40 });
  }, 10_000);

  it("re-review RR-M1 (PostgreSQL < 17): a transaction past its budget at COMMIT time rolls back: rejected AND nothing written", async () => {
    const database = fresh();
    const acct = await account(database);
    let t = 0;
    const clock = () => (t += 1000); // BEGIN at 1000 ms, the pre-COMMIT check at 2000 ms: 1000 ms elapsed
    const repo = progressRepo(database, undefined, { now: clock, budgetMs: 500 });
    await expect(repo.addSupplies(RUN_A, acct.id, pays(40))).rejects.toBeInstanceOf(DbUnavailableError);
    expect(await progressRepo(database).get(acct.id)).toMatchObject({ supplies: 0, lifetimeSupplies: 0 });
    const db = await database.db();
    expect((await rows<{ n: number }>(db, sql`select count(*)::int as n from run_rewards`))[0]?.n).toBe(0);
    // within budget the same call commits
    let t2 = 0;
    const ok = progressRepo(database, undefined, { now: () => (t2 += 100), budgetMs: 500 });
    expect((await ok.addSupplies(RUN_A, acct.id, pays(40))).banked).toBe(true);
  });

  it("brief 21: migration 0001 runs forward on a copy of the 0000 schema with rows in it (rows kept)", async () => {
    const dir = mkdtempSync(join(tmpdir(), "mig-"));
    try {
      cpSync(MIGRATIONS_FOLDER, dir, { recursive: true });
      const journalPath = join(dir, "meta", "_journal.json");
      const journal = JSON.parse(readFileSync(journalPath, "utf8")) as { entries: { tag: string }[] };
      writeFileSync(journalPath, JSON.stringify({ ...journal, entries: journal.entries.filter((e) => e.tag === "0000_init") }));
      const [{ PGlite }, { drizzle }, { migrate }] = await Promise.all([import("@electric-sql/pglite"), import("drizzle-orm/pglite"), import("drizzle-orm/pglite/migrator")]);
      const client = new PGlite();
      try {
        const db = drizzle({ client });
        await migrate(db, { migrationsFolder: dir });
        await db.execute(sql`insert into accounts (guest_token_hash, display_name) values (${"d".repeat(64)}, 'Old')`);
        await db.execute(sql`update progress set supplies = 0`);
        const before = await db.execute(sql`select table_name from information_schema.tables where table_schema = 'public'`);
        expect((before as unknown as { rows: { table_name: string }[] }).rows.map((r) => r.table_name).sort()).toEqual(["accounts", "progress"]);
        await migrate(db, { migrationsFolder: MIGRATIONS_FOLDER });
        const n = await db.execute(sql`select count(*)::int as n from accounts`);
        expect((n as unknown as { rows: { n: number }[] }).rows[0]?.n).toBe(1);
        const t = await db.execute(sql`select count(*)::int as n from run_rewards`);
        expect((t as unknown as { rows: { n: number }[] }).rows[0]?.n).toBe(0);
      } finally {
        await client.close();
      }
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });
});
