import { sql } from "drizzle-orm";
import { describe, expect, it, vi } from "vitest";
import { log } from "../ops/logger";
import { openPostgres } from "./client";
import { migrateDb } from "./migrate";

/**
 * Opt-in (`TEST_DATABASE_URL=postgres://… npx vitest run apps/server/src/db/realPg.test.ts`): a real PostgreSQL backend
 * killed in the middle of a transaction rejects that transaction, logs `db_error`, and the process keeps serving
 * (the next query works). Skipped without the variable (no PostgreSQL in CI or the builder containers).
 */
const url = process.env.TEST_DATABASE_URL;

describe.skipIf(!url)("real PostgreSQL (opt-in)", () => {
  it("pg_terminate_backend mid-transaction: the transaction rejects, no crash, the next query works", async () => {
    vi.spyOn(log, "error").mockImplementation(() => undefined as never);
    const database = openPostgres(url as string);
    const killer = openPostgres(url as string);
    try {
      const db = await database.db();
      await migrateDb({ kind: "postgres", db });
      const k = await killer.db();
      const tx = db.transaction(async (t) => {
        const r = (await t.execute(sql`select pg_backend_pid() as pid`)) as unknown as { rows: { pid: number }[] };
        await k.execute(sql`select pg_terminate_backend(${r.rows[0]?.pid})`);
        await t.execute(sql`select pg_sleep(0.2)`);
      });
      await expect(tx).rejects.toThrow();
      const again = (await db.execute(sql`select 1 as one`)) as unknown as { rows: { one: number }[] };
      expect(again.rows[0]?.one).toBe(1);
    } finally {
      await database.close();
      await killer.close();
    }
  });
});
