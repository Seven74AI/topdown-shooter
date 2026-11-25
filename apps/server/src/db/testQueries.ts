/**
 * Story 7.2: read-only queries for tests outside `src/db` (brief 21: only this folder talks SQL). Never used by the
 * game server itself.
 */
import { eq, sql } from "drizzle-orm";
import type { Database } from "./client";
import { progress, runRewards } from "./schema";

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
