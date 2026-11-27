import { randomUUID } from "node:crypto";
import pg from "pg";
import { sql } from "drizzle-orm";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { log } from "../ops/logger";
import { accountsRepo } from "./accountsRepo";
import { openPostgres, type Database } from "./client";
import { deviceTokensRepo } from "./deviceTokensRepo";
import { migrateDb } from "./migrate";
import { progressRepo } from "./progressRepo";
import { savedRunsRepo } from "./savedRunsRepo";
import { runResultsRepo } from "./runResultsRepo";
import { reportsRepo } from "./reportsRepo";
import type { ReportPayload } from "@topdown/shared";

const reportPayload: ReportPayload = { lines: ["l"], device: { userAgent: "t", screen: { w: 1, h: 1 }, viewport: { w: 1, h: 1 }, dpr: 1, safeArea: { top: 0, right: 0, bottom: 0, left: 0 }, input: "touch", language: "en", installed: false } };

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

  it("Story 10.7 (B5): a 4-seat run finish and Delete my progress of one seat's account at once, ×10 → the finish commits 4 rows (the deleted seat's account null), the delete is 'deleted', no 23503, no 503", async () => {
    const results = runResultsRepo(database);
    for (let k = 0; k < 10; k++) {
      const accs = [await acct(), await acct(), await acct(), await acct()];
      const run = randomUUID();
      await results.start({ id: run, district: "downtown", seed: 1 });
      const seats = accs.map((a, i) => ({ seat: `p${i}#1`, accountId: a.id, slot: i, loadout: "smg", wavesIn: 4, kills: i }));
      const victim = accs[k % 4]!;
      const [won, del] = await Promise.all([results.finish({ id: run, district: "downtown", seed: 1, waveReached: 4, ending: "wiped", endless: false, nightMs: 1000 }, seats), accountsRepo(database).deleteAccount(victim.token, victim.id, "p", new Set([victim.token]))]);
      expect(won).toBe(true);
      expect(del.outcome).toBe("deleted");
      const rows = ((await (await database.db()).execute(sql`select account_id, slot, waves_in from run_result_players where run_id = ${run} order by slot`)) as unknown as { rows: { account_id: string | null; slot: number; waves_in: number }[] }).rows;
      expect(rows.map((r) => r.account_id)).toEqual(accs.map((a) => (a === victim ? null : a.id)));
      expect(rows.every((r) => r.waves_in === 4)).toBe(true);
    }
  });

  it("Story 10.7 review L2 (+ L5): a finish naming an account A AND its merged guest G (G's id < A's) races Delete my progress of A, ×10 → no deadlock (40P01), no 503; both seats nulled, the run kept", async () => {
    const results = runResultsRepo(database);
    const db = await database.db();
    for (let k = 0; k < 10; k++) {
      const a = await acct();
      let g = await acct();
      while (g.id >= a.id) g = await acct(); // the merged guest sorts BEFORE the account (the deadlock order)
      await db.execute(sql`update accounts set merged_into = ${a.id} where id = ${g.id}`);
      const run = randomUUID();
      const seats = [a, g].map((x, i) => ({ seat: `p${i}#1`, accountId: x.id, slot: i, loadout: "", wavesIn: 2, kills: 0 }));
      const [won, del] = await Promise.all([results.finish({ id: run, district: "downtown", seed: 1, waveReached: 2, ending: "wiped", endless: false, nightMs: 1000 }, seats), accountsRepo(database).deleteAccount(a.token, a.id, "p", new Set([a.token]))]);
      expect(won).toBe(true);
      expect(del.outcome).toBe("deleted");
      const rows = ((await db.execute(sql`select account_id from run_result_players where run_id = ${run} order by slot`)) as unknown as { rows: { account_id: string | null }[] }).rows;
      expect(rows).toEqual([{ account_id: null }, { account_id: null }]);
    }
  });

  it("Story 10.7 review L2, forced order: a delete holding A (FOR UPDATE) and then deleting A's merged guest G (G < A) while a finish of [A, G] waits → the delete goes through (the finish locks A before G; plain id order deadlocks here)", async () => {
    const results = runResultsRepo(database);
    const db = await database.db();
    const a = await acct();
    let g = await acct();
    while (g.id >= a.id) g = await acct();
    await db.execute(sql`update accounts set merged_into = ${a.id} where id = ${g.id}`);
    const run = randomUUID();
    const tx = new pg.Client({ connectionString: URL as string });
    await tx.connect();
    try {
      await tx.query("BEGIN");
      await tx.query("SET LOCAL lock_timeout = '3s'");
      await tx.query("SELECT id FROM accounts WHERE id = $1 FOR UPDATE", [a.id]); // deleteAccount's account lock
      const finishing = results.finish({ id: run, district: "downtown", seed: 1, waveReached: 1, ending: "wiped", endless: false, nightMs: 0 }, [a, g].map((x, i) => ({ seat: `p${i}#1`, accountId: x.id, slot: i, loadout: "", wavesIn: 1, kills: 0 })));
      await new Promise((r) => setTimeout(r, 300)); // the finish is now waiting on its account locks
      await tx.query("DELETE FROM accounts WHERE id = $1", [g.id]); // then the merged guest (deleteAccount's order): never a 40P01
      await tx.query("DELETE FROM accounts WHERE id = $1", [a.id]);
      await tx.query("COMMIT");
      expect(await finishing).toBe(true);
      const rows = ((await db.execute(sql`select account_id from run_result_players where run_id = ${run}`)) as unknown as { rows: { account_id: string | null }[] }).rows;
      expect(rows).toEqual([{ account_id: null }, { account_id: null }]); // both gone first: written as no account
    } finally {
      await tx.query("ROLLBACK").catch(() => undefined);
      await tx.end();
    }
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
  // Re-review round 2 nit: `boundedTransaction` throws DbUnavailableError (no PG code) after logging `db_error {code}`;
  // the logged code tells a deadlock (40P01) and a foreign-key failure (23503) apart.
  const dbErrors: string[] = [];
  beforeAll(() => {
    const orig = log.error.bind(log);
    log.error = ((obj: unknown, msg?: string) => {
      if (msg === "db_error") dbErrors.push(String((obj as { code?: unknown }).code ?? "none"));
      return orig(obj as never, msg as never);
    }) as typeof log.error;
  });
  const takeDbErrors = (label: string): void => {
    for (const code of dbErrors.splice(0)) tally(`${label} db_error ${code}`);
  };
  /** Re-review round 2 nit: what an error from a race is (every error is a 503 for the route; 40P01 / 23503 are counted). */
  const errorCode = (e: unknown): string => {
    for (let x: unknown = e, i = 0; x && i < 5; x = (x as { cause?: unknown }).cause, i++) {
      const code = (x as { code?: unknown }).code;
      if (code === "40P01" || code === "23503") return code;
    }
    return "other";
  };
  /** Any rejected race result is an error (the route answers 503); tallied by code. */
  const countErrors = (label: string, results: PromiseSettledResult<unknown>[]): number => {
    let n = 0;
    for (const r of results) {
      if (r.status !== "rejected") continue;
      n++;
      tally(`${label} error ${errorCode(r.reason)}`);
    }
    takeDbErrors(label);
    return n;
  };


  it("re-review M2: a delete from D and a re-login of the account's OTHER phone E (it holds its own device row) at once, ×20: no 40P01, no error", async () => {
    let errors = 0;
    for (let k = 0; k < 20; k++) {
      const { id, d, e } = await twoDevices();
      const results = await Promise.allSettled([
        accountsRepo(database).deleteAccount(d, id, "p", new Set([d, e])),
        deviceTokensRepo(database).logIn({ oldTokenHash: e, newTokenHash: hex(), accountId: id, expectPasswordHash: "p" }),
      ]);
      errors += countErrors("relogin", results);
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
      errors += countErrors("two-deletes", results);
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
      errors += countErrors("reset", results);
      tally(`reset del=${results[0].status === "fulfilled" ? results[0].value.outcome : "error"} reset=${results[1].status === "fulfilled" ? results[1].value.outcome : "error"}`);
    }
    expect(errors).toBe(0);
  });

  /** A shared saved run R linking `a` and `b` (status open, room RACE). */
  async function sharedRun(a: string, b: string): Promise<{ id: string; row: Parameters<ReturnType<typeof savedRunsRepo>["upsertOpen"]>[0] }> {
    const id = randomUUID();
    const row = {
      id,
      district: "downtown",
      seed: 1,
      snapshot: { schemaVersion: 1, wave: 2, seats: [{ seatKey: `acct:${a}`, accountId: a, name: "A", slot: 0 }, { seatKey: `acct:${b}`, accountId: b, name: "B", slot: 1 }], bannedSeats: [] },
      schemaVersion: 1,
      wave: 2,
      names: [{ name: "A", slot: 0 }, { name: "B", slot: 1 }],
      roomCode: "RACE",
      links: [{ accountId: a, seatKey: `acct:${a}` }, { accountId: b, seatKey: `acct:${b}` }],
    };
    expect(await savedRunsRepo(database).upsertOpen(row)).toBe(true);
    return { id, row };
  }
  const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

  it("re-review round 2 #1 (deterministic): an autosave waiting on its run row, then a delete of a linked account, then the run row freed: no 40P01, no 23503", async () => {
    const a = await acct();
    const b = await acct();
    const run = await sharedRun(a.id, b.id);
    let free!: () => void;
    const gate = new Promise<void>((r) => (free = r));
    // a third transaction holds the run row (another writer), so the autosave queues behind it
    const holder = (await database.db()).transaction(async (tx) => {
      await tx.execute(sql`select 1 from saved_runs where id = ${run.id} for update`);
      await gate;
    });
    await sleep(100);
    const save = savedRunsRepo(database).upsertOpen(run.row);
    await sleep(200);
    const del = accountsRepo(database).deleteAccount(a.token, a.id, "p", new Set([a.token]));
    await sleep(200);
    free();
    const results = await Promise.allSettled([holder, save, del]);
    const errors = countErrors("save-deterministic", results);
    expect(errors).toBe(0);
    expect(results[2].status === "fulfilled" && results[2].value.outcome).toBe("deleted");
    const db = await database.db();
    const snap = ((await db.execute(sql`select snapshot from saved_runs where id = ${run.id}`)) as unknown as { rows: { snapshot: unknown }[] }).rows[0];
    expect(JSON.stringify(snap ?? null)).not.toContain(a.id);
  });

  it("re-review round 2 #1 (race): a delete and an autosave of a shared run linking the account at once, ×20: no 40P01, no 23503", async () => {
    let errors = 0;
    for (let k = 0; k < 20; k++) {
      const a = await acct();
      const b = await acct();
      const run = await sharedRun(a.id, b.id);
      const results = await Promise.allSettled([accountsRepo(database).deleteAccount(a.token, a.id, "p", new Set([a.token])), savedRunsRepo(database).upsertOpen(run.row)]);
      errors += countErrors("save-race", results);
      tally(`save-race del=${results[0].status === "fulfilled" ? results[0].value.outcome : "error"}`);
    }
    expect(errors).toBe(0);
  });

  it("re-review round 2 #2: a bank for a merged guest's seat and the delete of its account at once (progress(A) missing), ×20: no error", async () => {
    let errors = 0;
    for (let k = 0; k < 20; k++) {
      const a = await acct();
      const g = await accountsRepo(database).createGuest(hex(), "");
      const gToken = hex();
      await (await database.db()).execute(sql`insert into device_tokens (token_hash, account_id) values (${gToken}, ${g.id})`);
      const devHash = hex();
      const li = await deviceTokensRepo(database).logIn({ oldTokenHash: gToken, newTokenHash: devHash, accountId: a.id, expectPasswordHash: "p" });
      expect(li.outcome === "ok" && li.merged !== null).toBe(true);
      await (await database.db()).execute(sql`delete from progress where account_id = ${a.id}`);
      const results = await Promise.allSettled([
        accountsRepo(database).deleteAccount(a.token, a.id, "p", new Set([a.token, devHash])),
        progressRepo(database).addSupplies(randomUUID(), g.id, () => ({ supplies: 9, breakdown: {} })),
      ]);
      errors += countErrors("merged-bank", results);
      tally(`merged-bank del=${results[0].status === "fulfilled" ? results[0].value.outcome : "error"} bank=${results[1].status === "fulfilled" ? (results[1].value.noAccount ? "noAccount" : results[1].value.banked ? "banked" : "not") : "error"}`);
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

  it("Story 10.6 (AC 8, B4): an account with 2 reports and a merged guest with 1 → after the delete all 3 rows stay with account_id null", async () => {
    const a = await acct();
    const reports = reportsRepo(database);
    const g = hex();
    const guest = await accountsRepo(database).createGuest(g, "");
    expect((await reports.insert(g, "guest's", reportPayload)).outcome).toBe("stored");
    // merge the guest into the account (a login from the guest's phone)
    expect((await deviceTokensRepo(database).logIn({ oldTokenHash: g, newTokenHash: hex(), accountId: a.id, expectPasswordHash: "p" })).outcome).toBe("ok");
    expect(await count(sql`select count(*)::int as n from accounts where id = ${guest.id} and merged_into = ${a.id}`)).toBe(1);
    const ids: string[] = [];
    for (const n of ["one", "two"]) {
      const r = await reports.insert(a.token, n, reportPayload);
      if (r.outcome !== "stored") throw new Error(r.outcome);
      ids.push(r.id);
    }
    const devices = new Set(await accountsRepo(database).deviceHashes(a.id));
    expect((await accountsRepo(database).deleteAccount(a.token, a.id, "p", devices)).outcome).toBe("deleted");
    expect(await count(sql`select count(*)::int as n from problem_reports where id in (${ids[0]}, ${ids[1]}) and account_id is null`)).toBe(2);
    expect(await count(sql`select count(*)::int as n from problem_reports where note = 'guest''s' and account_id is null`)).toBeGreaterThanOrEqual(1);
    expect(await count(sql`select count(*)::int as n from problem_reports where account_id in (${a.id}, ${guest.id})`)).toBe(0);
    expect(await count(sql`select count(*)::int as n from progress where account_id = ${a.id}`)).toBe(0);
  });

  it("Story 10.6 (B4): a delete and 5 reports of the same account at once, ×10: the delete wins every time; each report is stored then nulled, or answered no_account; never 23503, never an error", async () => {
    let stored = 0;
    let refused = 0;
    for (let k = 0; k < 10; k++) {
      const a = await acct();
      const reports = reportsRepo(database);
      const results = await Promise.allSettled([
        accountsRepo(database).deleteAccount(a.token, a.id, "p", new Set([a.token])),
        ...Array.from({ length: 5 }, (_, i) => reports.insert(a.token, `race ${k}.${i}`, reportPayload)),
      ]);
      expect(countErrors("report-vs-delete", results)).toBe(0);
      const del = results[0] as PromiseFulfilledResult<{ outcome: string }>;
      expect(del.value.outcome).toBe("deleted");
      for (const r of results.slice(1) as PromiseFulfilledResult<{ outcome: string }>[]) {
        if (r.value.outcome === "stored") stored++;
        else {
          expect(r.value.outcome).toBe("no_account");
          refused++;
        }
      }
      expect(await count(sql`select count(*)::int as n from problem_reports where note like ${`race ${k}.%`} and account_id is not null`)).toBe(0);
      expect(await count(sql`select count(*)::int as n from problem_reports p left join accounts a on a.id = p.account_id where p.account_id is not null and a.id is null`)).toBe(0);
    }
    expect(stored + refused).toBe(50);
    tally(`report-vs-delete stored ${stored} refused ${refused}`);
  });
});
