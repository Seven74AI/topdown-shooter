/**
 * Story 7.2: read-only queries for tests outside `src/db` (brief 21: only this folder talks SQL). Never used by the
 * game server itself.
 */
import { eq, sql } from "drizzle-orm";
import type { Database } from "./client";
import { accounts, problemReports, progress, runRewards } from "./schema";

/** How many `run_rewards` rows an account has (one per banked run). */
export async function countRunRewards(database: Database, accountId: string): Promise<number> {
  const db = await database.db();
  const rows = await db.select({ n: sql<number>`count(*)::int` }).from(runRewards).where(eq(runRewards.accountId, accountId));
  return rows[0]?.n ?? 0;
}

/** Stories 7.7 / 7.11 (tests only): set an account's unlocked districts and owned parts. */
export async function setProgressListsForTest(database: Database, accountId: string, districts: string[], cosmetics: string[]): Promise<void> {
  const db = await database.db();
  await db.update(progress).set({ districts, cosmetics }).where(eq(progress.accountId, accountId));
}

/**
 * Story 10.1 (tests only): how many rows each account-keyed table holds for these account ids, and whether these saved
 * runs still exist (Delete my progress must leave 0 of each, B12).
 */
export async function accountFootprintForTest(database: Database, accountIds: readonly string[], savedRunIds: readonly string[] = []): Promise<Record<string, number>> {
  const db = await database.db();
  const ids = sql.join(accountIds.map((id) => sql`${id}::uuid`), sql`, `);
  const runIds = savedRunIds.length > 0 ? sql.join(savedRunIds.map((id) => sql`${id}::uuid`), sql`, `) : sql`NULL::uuid`;
  const one = async (q: ReturnType<typeof sql>): Promise<number> => ((await db.execute(q)) as unknown as { rows: { n: number }[] }).rows[0]?.n ?? 0;
  return {
    accounts: await one(sql`select count(*)::int as n from accounts where id in (${ids}) or merged_into in (${ids})`),
    progress: await one(sql`select count(*)::int as n from progress where account_id in (${ids})`),
    runRewards: await one(sql`select count(*)::int as n from run_rewards where account_id in (${ids})`),
    deviceTokens: await one(sql`select count(*)::int as n from device_tokens where account_id in (${ids})`),
    savedRunPlayers: await one(sql`select count(*)::int as n from saved_run_players where account_id in (${ids})`),
    savedRuns: await one(sql`select count(*)::int as n from saved_runs where id in (${runIds})`),
  };
}

/** Story 10.1 review L5 (tests only): a saved run's snapshot and list names. */
export async function savedRunForTest(database: Database, id: string): Promise<{ snapshot: Record<string, unknown>; names: { name: string; slot: number }[] } | null> {
  const db = await database.db();
  const r = ((await db.execute(sql`select snapshot, names from saved_runs where id = ${id}::uuid`)) as unknown as { rows: { snapshot: Record<string, unknown>; names: { name: string; slot: number }[] }[] }).rows[0];
  return r ?? null;
}

/** Story 10.7 (tests only): a run's `run_results` row (snake_case columns), or undefined. */
export async function runResultForTest(database: Database, id: string): Promise<Record<string, unknown> | undefined> {
  const db = await database.db();
  return ((await db.execute(sql`select * from run_results where id = ${id}::uuid`)) as unknown as { rows: Record<string, unknown>[] }).rows[0];
}

/** Story 10.7 (tests only): a run's seat rows, by slot then seat id. */
export async function runResultSeatsForTest(database: Database, id: string): Promise<{ seat: string; account_id: string | null; slot: number; loadout: string; waves_in: number; kills: number }[]> {
  const db = await database.db();
  return ((await db.execute(sql`select seat, account_id, slot, loadout, waves_in, kills from run_result_players where run_id = ${id}::uuid order by slot, seat`)) as unknown as { rows: { seat: string; account_id: string | null; slot: number; loadout: string; waves_in: number; kills: number }[] }).rows;
}

/** Story 10.6 (tests only): move reports back in time (`hours` ago). `ids` absent = every report of the account. */
export async function backdateReportsForTest(database: Database, filter: { accountId?: string; ids?: readonly string[] }, hours: number): Promise<void> {
  const db = await database.db();
  const at = new Date(Date.now() - hours * 3_600_000);
  const where = filter.ids ? sql`${problemReports.id} in (${sql.join(filter.ids.map((id) => sql`${id}::uuid`), sql`, `)})` : eq(problemReports.accountId, filter.accountId ?? "00000000-0000-0000-0000-000000000000");
  await db.update(problemReports).set({ createdAt: at }).where(where);
}

/** Story 10.6 (tests only): the reports an account (or, with null, no account) holds, and the whole table's count. */
export async function reportsForTest(database: Database, accountId: string | null): Promise<{ id: string; accountId: string | null }[]> {
  const db = await database.db();
  const where = accountId === null ? sql`${problemReports.accountId} is null` : eq(problemReports.accountId, accountId);
  return db.select({ id: problemReports.id, accountId: problemReports.accountId }).from(problemReports).where(where);
}

/** Story 10.6 (tests only): delete an account row directly (its device rows cascade; its reports are set null). */
export async function deleteAccountRowForTest(database: Database, accountId: string): Promise<void> {
  const db = await database.db();
  await db.delete(accounts).where(eq(accounts.id, accountId));
}

/** Story 10.6 (tests only): every report row (housekeeping tests). */
export async function countReportsForTest(database: Database): Promise<number> {
  const db = await database.db();
  const rows = await db.select({ n: sql<number>`count(*)::int` }).from(problemReports);
  return rows[0]?.n ?? 0;
}
