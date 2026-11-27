/**
 * Story 10.6 (AC 4–8; B3–B5): "Report a problem". The only code that reads or writes `problem_reports`.
 *
 * `insert` runs in ONE bounded transaction: find the device's account → lock that account row `FOR NO KEY UPDATE`
 * (LOCK ORDER step 2 only, `accountsRepo.ts`) → count its reports of the last 24 h → insert, or answer `limited`.
 * The row lock serializes one account's reports (the daily limit holds under racing requests and across restarts) and
 * serializes a report with 10.1's delete (which holds the same row `FOR UPDATE`): a report either lands before the
 * delete (then the delete nulls its `account_id`) or finds the account gone (`no_account`), never a foreign-key error.
 * (`FOR KEY SHARE` alone would let two reports count 19 at once: build decision 10.6-B8.)
 */
import { randomInt } from "node:crypto";
import { REPORT_CODE_ALPHABET, REPORT_CODE_LENGTH, REPORT_DAILY_MAX, type ReportPayload } from "@topdown/shared";
import { and, desc, eq, gte, lt, sql } from "drizzle-orm";
import type { Database } from "./client";
import { accounts, deviceTokens, problemReports } from "./schema";
import { boundedTransaction } from "./boundedTx";
import { DB_TIMEOUT_MS, withDbTimeout } from "./timeout";

export type ReportInsertResult = { outcome: "stored"; id: string; code: string } | { outcome: "no_account" } | { outcome: "limited" };

/** One report as the operator command reads it. */
export interface ReportRow {
  id: string;
  createdAt: Date;
  code: string;
  /** guest / account / deleted (the account was deleted: `account_id` is null). */
  accountKind: "guest" | "account" | "deleted";
  note: string;
  payload: ReportPayload;
}

export interface ReportsRepo {
  insert(tokenHash: string, note: string, payload: ReportPayload, opts?: { dailyMax?: number; code?: string }): Promise<ReportInsertResult>;
  list(limit: number): Promise<ReportRow[]>;
  byCode(code: string): Promise<ReportRow[]>;
  byId(id: string): Promise<ReportRow | null>;
  /** B5: deletes reports older than `days`, `batch` rows per statement; the number deleted. */
  deleteOlderThan(days: number, batch?: number): Promise<number>;
}

const DAY_MS = 86_400_000;

/** Q3 B: 4 characters from A–Z without I/O and 2–9. */
export function newReportCode(): string {
  let s = "";
  for (let i = 0; i < REPORT_CODE_LENGTH; i++) s += REPORT_CODE_ALPHABET[randomInt(REPORT_CODE_ALPHABET.length)];
  return s;
}

/** `onBatch` (tests): called with each delete statement's row count. */
export function reportsRepo(database: Database, timeoutMs = DB_TIMEOUT_MS, onBatch?: (n: number) => void): ReportsRepo {
  const select = async (where: ReturnType<typeof eq> | undefined, limit: number): Promise<ReportRow[]> => {
    const db = await database.db();
    const q = db
      .select({ id: problemReports.id, createdAt: problemReports.createdAt, code: problemReports.code, note: problemReports.note, payload: problemReports.payload, accountId: problemReports.accountId, username: accounts.username })
      .from(problemReports)
      .leftJoin(accounts, eq(accounts.id, problemReports.accountId));
    const rows = await (where ? q.where(where) : q).orderBy(desc(problemReports.createdAt)).limit(limit);
    return rows.map((r) => ({
      id: r.id,
      createdAt: r.createdAt,
      code: r.code,
      accountKind: r.accountId === null ? "deleted" : r.username === null ? "guest" : "account",
      note: r.note,
      payload: r.payload as ReportPayload,
    }));
  };
  return {
    // Not under withDbTimeout: a report answered "failed" must never commit later (the player would send it twice).
    insert: (tokenHash, note, payload, opts = {}) =>
      boundedTransaction(database, "reports.insert", async (tx): Promise<ReportInsertResult> => {
        const dev = await tx.select({ accountId: deviceTokens.accountId }).from(deviceTokens).where(eq(deviceTokens.tokenHash, tokenHash));
        const id = dev[0]?.accountId;
        if (id === undefined) return { outcome: "no_account" };
        const locked = await tx.select({ id: accounts.id }).from(accounts).where(eq(accounts.id, id)).for("no key update");
        if (locked.length === 0) return { outcome: "no_account" }; // deleted meanwhile (10.1)
        const since = new Date(Date.now() - DAY_MS);
        const counted = await tx
          .select({ n: sql<number>`count(*)::int` })
          .from(problemReports)
          .where(and(eq(problemReports.accountId, id), gte(problemReports.createdAt, since)));
        if ((counted[0]?.n ?? 0) >= (opts.dailyMax ?? REPORT_DAILY_MAX)) return { outcome: "limited" };
        const code = opts.code ?? newReportCode();
        const rows = await tx.insert(problemReports).values({ accountId: id, code, note, payload }).returning({ id: problemReports.id });
        return { outcome: "stored", id: rows[0]!.id, code };
      }),
    list: (limit) => withDbTimeout("reports.list", () => select(undefined, limit), timeoutMs),
    byCode: (code) => withDbTimeout("reports.byCode", () => select(eq(problemReports.code, code), 50), timeoutMs),
    byId: (id) => withDbTimeout("reports.byId", async () => (await select(eq(problemReports.id, id), 1))[0] ?? null, timeoutMs),
    deleteOlderThan: async (days, batch = 1000) => {
      const before = new Date(Date.now() - days * DAY_MS);
      let total = 0;
      for (;;) {
        const n = await withDbTimeout(
          "reports.deleteOlderThan",
          async () => {
            const db = await database.db();
            const old = db.select({ id: problemReports.id }).from(problemReports).where(lt(problemReports.createdAt, before)).limit(batch);
            const gone = await db.delete(problemReports).where(sql`${problemReports.id} in (${old})`).returning({ id: problemReports.id });
            return gone.length;
          },
          timeoutMs,
        );
        onBatch?.(n);
        total += n;
        if (n < batch) return total;
      }
    },
  };
}
