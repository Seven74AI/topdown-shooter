/**
 * Story 7.2 (review M1, re-review RR-M1; brief 18, 20): a money transaction whose result is ALWAYS the truth.
 *
 * Rule: never report a result while the transaction can still commit. `withDbTimeout` stops WAITING after 2 s but
 * leaves the work running, so a bank it reported as failed could commit later (told "Couldn't save", paid anyway; a
 * hand grant would pay twice). `boundedTransaction` instead awaits the transaction's own outcome, and bounds that
 * outcome inside the database so it can't take long:
 * - getting a connection: the pool's own `connectionTimeoutMillis` (2 s, `db/client.ts`): a failure here is before
 *   BEGIN, nothing can commit;
 * - inside the transaction: `SET LOCAL lock_timeout` and `statement_timeout` (BANK_LOCK_TIMEOUT_MS) and, on
 *   PostgreSQL ≥ 17 (production 18, PGlite 18), `transaction_timeout` (BANK_TX_TIMEOUT_MS);
 * - on every version: the elapsed time is checked right before COMMIT; over BANK_TX_BUDGET_MS → ROLLBACK (the
 *   PostgreSQL < 17 case where each statement is under its timeout but the sum is not).
 * COMMIT itself is not cut by `statement_timeout`; a COMMIT (or a ROLLBACK) whose reply never comes is settled by
 * the client query timeout (`PG_QUERY_TIMEOUT_MS` 3 s, `db/client.ts`) and TCP keepalive. Worst case per attempt ≈
 * 2 s (checkout) + 1.8 s (budget) + 3 s (an unanswered COMMIT) + 3 s (the ROLLBACK on the same dead line) ≈ 10 s;
 * normally a few ms. A failure is logged `db_error {op}` and thrown as `DbUnavailableError`; only then does the
 * caller retry.
 *
 * One case stays (re-review 2, documented): a COMMIT that LANDED but whose reply was lost with the database then
 * unreachable is reported as failed although paid. The next attempt (duplicate key → "saved") or, after two
 * failures, the hand-grant check (`docs/deploy.md` › Database: look in `run_rewards` first) covers it.
 *
 * Reusable: 7.3 (unlock purchase), 7.5 (Training), 7.7 / 7.11 / 7.12 (writers in the bank) can wrap their own money
 * transactions in it.
 */
import { sql } from "drizzle-orm";
import { log } from "../ops/logger";
import type { Database, Db } from "./client";
import { DbUnavailableError, dbErrText } from "./timeout";

/** A lock wait or a single statement longer than this fails (and rolls the transaction back). */
export const BANK_LOCK_TIMEOUT_MS = 1500;
/** PostgreSQL ≥ 17: the whole transaction is cut at this. */
export const BANK_TX_TIMEOUT_MS = 1800;
/** Every version: past this (from BEGIN) the transaction rolls back instead of committing. */
export const BANK_TX_BUDGET_MS = 1800;

/** The transaction handle the body receives (Drizzle's). */
export type Tx = Parameters<Parameters<Db["transaction"]>[0]>[0];

class OverBudget extends Error {
  constructor(readonly ms: number) {
    super(`transaction over budget (${Math.round(ms)} ms): rolled back`);
  }
}

/** `server_version_num` ≥ 170000 (transaction_timeout exists), read once per database handle. */
const txTimeoutSupport = new WeakMap<Database, Promise<boolean>>();
function hasTxTimeout(database: Database, db: Db): Promise<boolean> {
  let p = txTimeoutSupport.get(database);
  if (!p) {
    p = db
      .execute(sql`select current_setting('server_version_num')::int as v`)
      .then((r) => ((r as unknown as { rows: { v: number }[] }).rows[0]?.v ?? 0) >= 170000)
      .catch(() => {
        txTimeoutSupport.delete(database);
        return false;
      });
    txTimeoutSupport.set(database, p);
  }
  return p;
}

export interface BoundedOptions {
  /** Clock (ms); tests pass a fake. */
  now?: () => number;
  /** Override the pre-COMMIT budget (tests). */
  budgetMs?: number;
}

/**
 * Runs `body` in one transaction that either commits within its bounds or rolls back, and resolves / rejects only
 * once that outcome is final. Never raced against a timer.
 */
export async function boundedTransaction<T>(database: Database, op: string, body: (tx: Tx) => Promise<T>, opts: BoundedOptions = {}): Promise<T> {
  const now = opts.now ?? (() => performance.now());
  const budget = opts.budgetMs ?? BANK_TX_BUDGET_MS;
  try {
    const db = await database.db(); // PGlite opens here; Postgres connects lazily (pool checkout inside transaction())
    const txTimeout = await hasTxTimeout(database, db);
    return await db.transaction(async (tx) => {
      const t0 = now();
      await tx.execute(sql.raw(`SET LOCAL lock_timeout = '${BANK_LOCK_TIMEOUT_MS}ms'`));
      await tx.execute(sql.raw(`SET LOCAL statement_timeout = '${BANK_LOCK_TIMEOUT_MS}ms'`));
      if (txTimeout) await tx.execute(sql.raw(`SET LOCAL transaction_timeout = '${BANK_TX_TIMEOUT_MS}ms'`));
      const result = await body(tx);
      const ms = now() - t0;
      if (ms > budget) throw new OverBudget(ms); // → ROLLBACK, never a late COMMIT
      return result;
    });
  } catch (e) {
    const reason = "error";
    // Story 10.1 re-review round 2: + the PostgreSQL error code (40P01 deadlock, 23503 foreign key…) from the cause chain.
    log.error({ op, reason, err: dbErrText(e), code: pgCode(e) }, "db_error"); // review L5: never the query parameters
    throw e instanceof DbUnavailableError ? e : new DbUnavailableError(op, reason);
  }
}

/** Story 10.1 re-review round 2: the PostgreSQL SQLSTATE of an error or its causes (Drizzle wraps it), or null. */
export function pgCode(e: unknown): string | null {
  for (let x: unknown = e, i = 0; x && i < 5; x = (x as { cause?: unknown }).cause, i++) {
    const code = (x as { code?: unknown }).code;
    if (typeof code === "string" && /^[0-9A-Z]{5}$/.test(code)) return code;
  }
  return null;
}
