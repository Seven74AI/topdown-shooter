import { mkdtempSync, readFileSync, readdirSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { type SQL, sql } from "drizzle-orm";
import { afterEach, describe, expect, it, vi } from "vitest";
import { log } from "../ops/logger";
import { accountsRepo } from "./accountsRepo";
import { EventEmitter } from "node:events";
import { type Database, type Db, createPool, databaseFromEnv, openPglite } from "./client";
import { MIGRATIONS_FOLDER, migrateDb } from "./migrate";
import { progressRepo } from "./progressRepo";
import { boundedTransaction } from "./boundedTx";
import { DbUnavailableError, dbErrText, withDbTimeout } from "./timeout";

log.level = process.env.LOG_LEVEL ?? "silent";
const open: Database[] = [];
const fresh = (dir?: string): Database => {
  const d = openPglite(dir);
  open.push(d);
  return d;
};
afterEach(async () => {
  for (const d of open.splice(0)) await d.close();
  vi.restoreAllMocks();
});

/** Rows of a raw query (the driver-neutral `Db` type leaves `execute`'s result untyped). */
async function rows<T>(db: Db, query: SQL): Promise<T[]> {
  return ((await db.execute(query)) as unknown as { rows: T[] }).rows;
}

const HASH_A = "a".repeat(64);
const HASH_B = "b".repeat(64);

describe("migrations (Story 7.1 AC 2)", () => {
  it("the committed SQL creates exactly these tables: accounts and progress (7.1), run_rewards (7.2), device_tokens (7.6), saved_runs + saved_run_players (8.4), paid_bags (10.1 review L6), problem_reports (10.6), run_results + run_result_players (10.7)", () => {
    const files = readdirSync(MIGRATIONS_FOLDER).filter((f) => f.endsWith(".sql"));
    const creates = files.flatMap((f) => [...readFileSync(join(MIGRATIONS_FOLDER, f), "utf8").matchAll(/CREATE TABLE "(\w+)"/g)].map((m) => m[1]));
    expect(creates.sort()).toEqual(["accounts", "device_tokens", "paid_bags", "problem_reports", "progress", "run_result_players", "run_results", "run_rewards", "saved_run_players", "saved_runs"]);
  });

  it("applies once, and a second run is a no-op (same tables, one recorded migration, rows kept)", async () => {
    const database = fresh();
    const db = await database.db(); // first open migrates
    await accountsRepo(database).createGuest(HASH_A, "Ana");
    await migrateDb({ kind: "pglite", db });
    const tables = await rows<{ table_name: string }>(db, sql`select table_name from information_schema.tables where table_schema = 'public' order by table_name`);
    expect(tables.map((r) => r.table_name)).toEqual(["accounts", "device_tokens", "paid_bags", "problem_reports", "progress", "run_result_players", "run_results", "run_rewards", "saved_run_players", "saved_runs"]);
    const applied = await rows<{ n: number }>(db, sql`select count(*)::int as n from drizzle.__drizzle_migrations`);
    expect(applied[0]?.n).toBe(readdirSync(MIGRATIONS_FOLDER).filter((f) => f.endsWith(".sql")).length);
    const accounts = await rows<{ n: number }>(db, sql`select count(*)::int as n from accounts`);
    expect(accounts[0]?.n).toBe(1);
  });

  it("a balance can't go below 0 (check constraint)", async () => {
    const database = fresh();
    const acct = await accountsRepo(database).createGuest(HASH_A, "");
    const db = await database.db();
    await expect(db.execute(sql`update progress set supplies = -1 where account_id = ${acct.id}`)).rejects.toThrow();
  });
});

describe("repositories (Story 7.1 AC 8)", () => {
  it("createGuest makes an account and an empty progress row; find and setDisplayName round-trip", async () => {
    const database = fresh();
    const accounts = accountsRepo(database);
    expect(await accounts.findByTokenHash(HASH_A)).toBeNull();
    const made = await accounts.createGuest(HASH_A, "");
    expect(made).toEqual({ id: expect.stringMatching(/^[0-9a-f-]{36}$/), displayName: "", username: null, isAdmin: false });
    expect(await accounts.findByTokenHash(HASH_A)).toEqual(made);
    expect(await accounts.findByTokenHash(HASH_B)).toBeNull();
    await accounts.setDisplayName(made.id, "Bea");
    expect((await accounts.findByTokenHash(HASH_A))?.displayName).toBe("Bea");
    expect(await progressRepo(database).get(made.id)).toEqual({ accountId: made.id, supplies: 0, lifetimeSupplies: 0, unlocks: [], training: {}, districts: [], look: null, cosmetics: [], stats: { revives: 0, kills: 0, barricades: 0, runs: 0 }, settings: null }); // + Story 7.11, 10.1
  });

  it("two createGuest calls for one token at once give one account (no duplicate, no error)", async () => {
    const database = fresh();
    const accounts = accountsRepo(database);
    const [a, b] = await Promise.all([accounts.createGuest(HASH_A, ""), accounts.createGuest(HASH_A, "")]);
    expect(a.id).toBe(b.id);
    const db = await database.db();
    const n = await rows<{ n: number }>(db, sql`select count(*)::int as n from accounts`);
    expect(n[0]?.n).toBe(1);
  });

  it("progress.createEmpty is idempotent and get of an unknown account is null", async () => {
    const database = fresh();
    const acct = await accountsRepo(database).createGuest(HASH_B, "");
    const progress = progressRepo(database);
    await progress.createEmpty(acct.id);
    expect((await progress.get(acct.id))?.supplies).toBe(0);
    expect(await progress.get("00000000-0000-0000-0000-000000000000")).toBeNull();
  });

  it("P5: a second database opened on the same PGlite directory finds the same account", async () => {
    const dir = mkdtempSync(join(tmpdir(), "td-pglite-"));
    try {
      const first = openPglite(dir);
      const made = await accountsRepo(first).createGuest(HASH_A, "Cy");
      await first.close();
      const second = openPglite(dir);
      const found = await accountsRepo(second).findByTokenHash(HASH_A);
      await second.close();
      expect(found?.id).toBe(made.id);
      expect(found?.displayName).toBe("Cy");
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });
});

describe("timeouts and errors (Story 7.1 AC 9, P3)", () => {
  it("a call that never answers fails after the timeout with db_error {op}", async () => {
    const spy = vi.spyOn(log, "error");
    const hung: Database = { kind: "postgres", db: () => new Promise(() => {}), close: async () => {} };
    const t0 = Date.now();
    await expect(accountsRepo(hung, 50).findByTokenHash(HASH_A)).rejects.toBeInstanceOf(DbUnavailableError);
    expect(Date.now() - t0).toBeGreaterThanOrEqual(45);
    expect(spy).toHaveBeenCalledWith(expect.objectContaining({ op: "accounts.findByTokenHash", reason: "timeout" }), "db_error");
    // The hash is never in the log line.
    expect(JSON.stringify(spy.mock.calls)).not.toContain(HASH_A);
  });

  it("the default timeout is 2 s", async () => {
    vi.useFakeTimers();
    try {
      const p = withDbTimeout("x", () => new Promise(() => {}));
      const settled = vi.fn();
      p.catch(settled);
      await vi.advanceTimersByTimeAsync(1999);
      expect(settled).not.toHaveBeenCalled();
      await vi.advanceTimersByTimeAsync(1);
      expect(settled).toHaveBeenCalledWith(expect.any(DbUnavailableError));
    } finally {
      vi.useRealTimers();
    }
  });

  it("a failing database (unreachable Postgres) rejects as DbUnavailableError", async () => {
    vi.spyOn(log, "error").mockImplementation(() => undefined as never);
    const down = databaseFromEnv({ DATABASE_URL: "postgres://u:p@127.0.0.1:1/none" }, "unused");
    open.push(down);
    await expect(accountsRepo(down).findByTokenHash(HASH_A)).rejects.toBeInstanceOf(DbUnavailableError);
  });

  it("a checked-out client losing its backend mid-transaction logs db_error and never crashes the process", async () => {
    const errors = vi.spyOn(log, "error").mockImplementation(() => undefined as never);
    const pool = createPool("postgres://u:p@127.0.0.1:1/none");
    try {
      expect((pool as unknown as { options: { keepAlive?: boolean } }).options.keepAlive).toBe(true);
      // What pg-pool does when it hands out a new client: emit `connect` with it.
      const client = new EventEmitter();
      pool.emit("connect", client as never);
      // An EventEmitter with no `error` listener throws on emit (that was the uncaughtException).
      expect(() => client.emit("error", new Error("terminating connection due to administrator command"))).not.toThrow();
      expect(errors).toHaveBeenCalledWith(expect.objectContaining({ op: "client", err: "terminating connection due to administrator command" }), "db_error");
      // Idle-client errors (the pool's own event) are handled too.
      expect(() => pool.emit("error", new Error("idle lost"), client as never)).not.toThrow();
    } finally {
      await pool.end();
    }
  });

  it("production without DATABASE_URL refuses; dev falls back to PGlite", () => {
    expect(() => databaseFromEnv({ NODE_ENV: "production" }, "unused")).toThrow(/DATABASE_URL/);
    const dev = databaseFromEnv({}, "memory://");
    open.push(dev);
    expect(dev.kind).toBe("pglite");
  });
});

describe("db_error text (Story 7.6 review L5)", () => {
  it("never carries a query's parameters (token or password hashes), however the error is wrapped", async () => {
    const drizzleLike = new Error(`Failed query: select "account_id" from "device_tokens" where "token_hash" = $1 for update\nparams: ${"a7".repeat(32)}`);
    expect(dbErrText(drizzleLike)).toBe('Failed query: select "account_id" from "device_tokens" where "token_hash" = $1 for update');
    expect(dbErrText("plain")).toBe("plain");
    expect(dbErrText(new Error("x".repeat(500)))).toHaveLength(200);
    const lines: string[] = [];
    vi.spyOn(log, "error").mockImplementation(((...args: unknown[]) => void lines.push(JSON.stringify(args))) as never);
    await expect(withDbTimeout("probe", async () => Promise.reject(drizzleLike))).rejects.toThrow(DbUnavailableError);
    expect(lines.join("\n")).toContain("db_error");
    await expect(boundedTransaction(fresh(), "probe.tx", async () => Promise.reject(drizzleLike))).rejects.toThrow(DbUnavailableError);
    expect(lines.filter((l) => l.includes("probe.tx"))).toHaveLength(1);
    expect(lines.join("\n")).not.toContain("a7a7a7a7");
  });
});
