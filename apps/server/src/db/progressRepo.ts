/**
 * Story 7.1: the `progress` row per account (Supplies, bought unlocks, Training, districts). 7.2–7.7 add the
 * banking and purchase writes here (one transaction each, brief 18).
 */
import { eq } from "drizzle-orm";
import type { Database } from "./client";
import { progress } from "./schema";
import { DB_TIMEOUT_MS, withDbTimeout } from "./timeout";

export interface Progress {
  accountId: string;
  supplies: number;
  lifetimeSupplies: number;
  /** Bought unlock ids only; the starter pool is `progression.json` (decision 7.1 D4). */
  unlocks: string[];
  training: Record<string, number>;
  districts: string[];
}

export interface ProgressRepo {
  get(accountId: string): Promise<Progress | null>;
  /** The empty row ("starter pool only"); a no-op when it exists. */
  createEmpty(accountId: string): Promise<void>;
}

export function progressRepo(database: Database, timeoutMs = DB_TIMEOUT_MS): ProgressRepo {
  return {
    get: (accountId) =>
      withDbTimeout(
        "progress.get",
        async () => {
          const db = await database.db();
          const rows = await db
            .select({
              accountId: progress.accountId,
              supplies: progress.supplies,
              lifetimeSupplies: progress.lifetimeSupplies,
              unlocks: progress.unlocks,
              training: progress.training,
              districts: progress.districts,
            })
            .from(progress)
            .where(eq(progress.accountId, accountId))
            .limit(1);
          return rows[0] ?? null;
        },
        timeoutMs,
      ),
    createEmpty: (accountId) =>
      withDbTimeout(
        "progress.createEmpty",
        async () => {
          const db = await database.db();
          await db.insert(progress).values({ accountId }).onConflictDoNothing();
        },
        timeoutMs,
      ),
  };
}
