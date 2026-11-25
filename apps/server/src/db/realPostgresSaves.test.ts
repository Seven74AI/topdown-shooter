import { randomUUID } from "node:crypto";
import { sql } from "drizzle-orm";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { log } from "../ops/logger";
import { accountsRepo } from "./accountsRepo";
import { openPostgres, type Database } from "./client";
import { migrateDb } from "./migrate";
import { progressRepo } from "./progressRepo";
import { SAVE_KEEP_MS, savedRunsRepo, type SaveRow } from "./savedRunsRepo";
import { countRunRewards } from "./testQueries";
import { bankSavedRun } from "../meta/saveBank";
import { captureRunSave, loadBalance, playToBuild, DOWNTOWN_MAP, type RunSave } from "@topdown/shared";

/**
 * Stories 8.4–8.6 on a REAL PostgreSQL (TEST_DATABASE_URL; PGlite runs on one connection and can't race): S3 (two
 * resumes at once: one wins) and S4 (a save's Supplies top-up raced against itself and the final bank: paid once).
 * Opt-in like `realPostgres.test.ts`: `TEST_DATABASE_URL=postgres://postgres@127.0.0.1:5432/t86 npx vitest run realPostgresSaves`.
 */
/**
 * Review nit (Stories 8.4–8.6): the real-PostgreSQL files share one scratch database and each migrates it; run them
 * one file at a time: `TEST_DATABASE_URL=… npx vitest run realPostgres --no-file-parallelism` (CI skips them).
 */
const URL = process.env.TEST_DATABASE_URL;
log.level = process.env.LOG_LEVEL ?? "silent";
let database: Database;

const later = () => new Date(Date.now() + SAVE_KEEP_MS);
const row = (id: string, accounts: string[]): SaveRow => ({ id, district: "downtown", seed: 1, snapshot: { schemaVersion: 1 }, schemaVersion: 1, wave: 2, names: [], roomCode: "ABCD", links: accounts.map((a) => ({ accountId: a, seatKey: `acct:${a}` })) });
const acct = async () => (await accountsRepo(database).createGuest(randomUUID().replace(/-/g, "").padEnd(64, "b"), "Ana")).id;

describe.skipIf(!URL)("Stories 8.4–8.6: saves on real PostgreSQL (TEST_DATABASE_URL)", () => {
  beforeAll(async () => {
    database = openPostgres(URL as string);
    await migrateDb({ kind: "postgres", db: await database.db() });
  });
  afterAll(async () => database?.close());

  it("S3: 8 resumes of one save at once (two accounts, separate connections) → exactly one claim, ×10", async () => {
    const repo = savedRunsRepo(database);
    for (let round = 0; round < 10; round++) {
      const [a, b] = [await acct(), await acct()];
      const id = randomUUID();
      expect(await repo.saveResumable(row(id, [a, b]), later())).toBe(true);
      const r = await Promise.all(Array.from({ length: 8 }, (_, i) => repo.claim(id, i % 2 === 0 ? a : b, `R${round}${i}`)));
      expect(r.filter((x) => x.outcome === "claimed")).toHaveLength(1);
      expect(r.filter((x) => x.outcome === "busy")).toHaveLength(7);
    }
  });

  it("S4: one save banked 6 times at once + the final bank → one run_rewards row per account, the Supplies of one run", async () => {
    const balance = loadBalance();
    const progress = progressRepo(database);
    const [a, b] = [await acct(), await acct()];
    const played = playToBuild({ players: 2, waves: 3, buildings: 2 });
    const seats = played.seats.map((s, i) => ({ ...s, accountId: i === 0 ? a : b, seatKey: `acct:${i === 0 ? a : b}` }));
    const save = JSON.parse(JSON.stringify(captureRunSave(played.world, seats, { runId: randomUUID(), district: "downtown" }))) as RunSave;
    const deps = { balance, map: DOWNTOWN_MAP, repo: () => progress, log, retryMs: 10 };
    const results = await Promise.all(Array.from({ length: 6 }, () => bankSavedRun(save, deps)));
    const totals = results.flat().filter((r) => r.status === "saved").map((r) => r.total);
    expect(totals.length).toBe(12);
    const each = (await progress.get(a))!.supplies;
    expect(each).toBeGreaterThan(0);
    expect((await progress.get(b))!.supplies).toBe(each);
    expect(await countRunRewards(database, a)).toBe(1);
    // the same save again later (a second Save and quit with nothing played): nothing more
    await bankSavedRun(save, deps);
    expect((await progress.get(a))!.supplies).toBe(each);
  });

  it("review H1: two accounts banking a find for one run at once (separate connections) → exactly one owns it, ×10", async () => {
    const progress = progressRepo(database);
    const key = "pack:cat";
    const meta = { statsDelta: { revives: 0, kills: 0, barricades: 0, runs: 1 }, grant: () => ({ cosmetics: [key], districts: [], breakdown: { loot: { wave: 3, key, name: "Cat" } } }) };
    for (let round = 0; round < 10; round++) {
      const [a, b] = [await acct(), await acct()];
      const run = randomUUID();
      await Promise.all([progress.addSupplies(run, a, () => ({ supplies: 5, breakdown: {} }), meta), progress.addSupplies(run, b, () => ({ supplies: 5, breakdown: {} }), meta)]);
      const owners = [(await progress.get(a))!.cosmetics.includes(key), (await progress.get(b))!.cosmetics.includes(key)].filter(Boolean);
      expect(owners).toHaveLength(1);
    }
  });

  it("re-review H: a guest's bank, a merge, then the account's top-ups at once ×5 → one row, paid once", async () => {
    const progress = progressRepo(database);
    const [g, a] = [await acct(), await acct()];
    const run = randomUUID();
    await progress.addSupplies(run, g, () => ({ supplies: 20, breakdown: {} }));
    const db = await database.db();
    await db.execute(sql`update accounts set merged_into = ${a} where id = ${g}`);
    const before = (await progress.get(a))!.supplies;
    await Promise.all(Array.from({ length: 5 }, () => progress.addSupplies(run, a, () => ({ supplies: 20, breakdown: {} }), undefined, true)));
    expect((await progress.get(a))!.supplies).toBe(before);
    const n = ((await db.execute(sql`select count(*)::int as n from run_rewards where run_id = ${run}`)) as unknown as { rows: { n: number }[] }).rows[0]!.n;
    expect(n).toBe(1);
  });
});

