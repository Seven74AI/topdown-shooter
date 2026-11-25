/**
 * Story 7.2: read-only queries for tests outside `src/db` (brief 21: only this folder talks SQL). Never used by the
 * game server itself.
 */
import { eq, sql } from "drizzle-orm";
import type { Database } from "./client";
import { runRewards } from "./schema";

/** How many `run_rewards` rows an account has (one per banked run). */
export async function countRunRewards(database: Database, accountId: string): Promise<number> {
  const db = await database.db();
  const rows = await db.select({ n: sql<number>`count(*)::int` }).from(runRewards).where(eq(runRewards.accountId, accountId));
  return rows[0]?.n ?? 0;
}
