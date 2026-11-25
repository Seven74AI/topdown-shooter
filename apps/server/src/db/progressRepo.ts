/**
 * Story 7.1: the `progress` row per account (Supplies, bought unlocks, Training, districts). 7.2–7.7 add the
 * banking and purchase writes here (one transaction each, brief 18).
 */
import { and, eq, sql } from "drizzle-orm";
import type { Database } from "./client";
import { progress, runRewards } from "./schema";
import { DB_TIMEOUT_MS, withDbTimeout } from "./timeout";

import { boundedTransaction, type BoundedOptions } from "./boundedTx";

/** Story 7.2 (review M1 / RR-M1): the bank's bounds live in `db/boundedTx.ts` (re-exported for older imports). */
export { BANK_LOCK_TIMEOUT_MS, BANK_TX_BUDGET_MS, BANK_TX_TIMEOUT_MS } from "./boundedTx";

export interface Progress {
  accountId: string;
  supplies: number;
  lifetimeSupplies: number;
  /** Bought unlock ids only; the starter pool is `progression.json` (decision 7.1 D4). */
  unlocks: string[];
  training: Record<string, number>;
  districts: string[];
}

/** Story 7.2: what one run pays one account, computed INSIDE the bank transaction from the locked lifetime total. */
export interface RunPayout {
  supplies: number;
  breakdown: Record<string, unknown>;
}

/** Story 7.2: the result of a bank: `banked` false = this (run, account) was banked before (nothing paid now). */
export interface BankResult {
  banked: boolean;
  supplies: number;
  /** `progress.supplies` after this bank (or now, for an earlier one). */
  newTotal: number;
  breakdown: Record<string, unknown>;
}

/**
 * Story 7.3 (AC 5): the result of an unlock attempt, with the progress row as it is after it (U5: the hub shows this).
 * A missing progress row counts as the empty one (0 Supplies: `not_enough`).
 */
export type UnlockResult =
  | { outcome: "unlocked"; progress: Progress }
  | { outcome: "already_unlocked"; progress: Progress }
  | { outcome: "not_enough"; need: number; progress: Progress };

export interface ProgressRepo {
  get(accountId: string): Promise<Progress | null>;
  /** The empty row ("starter pool only"); a no-op when it exists. */
  createEmpty(accountId: string): Promise<void>;
  /**
   * Story 7.2 (AC 4, brief 18): banks one run for one account in ONE transaction: the progress row is locked
   * (`SELECT … FOR UPDATE`, so two rooms ending at once for one account add up), `pay(lifetimeBefore)` computes the
   * payout from the locked value, the `run_rewards` row is inserted (primary key (run_id, account_id): a duplicate
   * means "already banked" and nothing else is written), then Supplies and lifetime Supplies grow by the amount.
   * Later writers (7.7 district, 7.11 milestones, 7.12 loot) join this transaction.
   */
  addSupplies(runId: string, accountId: string, pay: (lifetimeBefore: number) => RunPayout): Promise<BankResult>;
  /**
   * Story 7.3 (AC 5, brief 18): buys `unlockId` for `price` (from the SERVER's progression.json, never the request) in
   * ONE conditional update: `supplies >= price AND NOT unlocks ? id`. Two concurrent buys for one account serialize on
   * the row lock and the second re-checks the condition, so the balance never goes below 0 and nothing is bought
   * twice. 0 rows → the row is re-read in the same transaction to say why. Review F1: the same `boundedTransaction` as
   * the bank (7.2 M1 / RR-M1): a purchase never commits after the route answered 503.
   */
  unlock(accountId: string, unlockId: string, price: number): Promise<UnlockResult>;
}

const progressColumns = {
  accountId: progress.accountId,
  supplies: progress.supplies,
  lifetimeSupplies: progress.lifetimeSupplies,
  unlocks: progress.unlocks,
  training: progress.training,
  districts: progress.districts,
};

export function progressRepo(database: Database, timeoutMs = DB_TIMEOUT_MS, bankOptions: BoundedOptions = {}): ProgressRepo {
  return {
    unlock: async (accountId, unlockId, price) => {
      if (!Number.isInteger(price) || price <= 0) throw new Error("unlock price must be a positive integer");
      return boundedTransaction(
        database,
        "progress.unlock",
        async (tx): Promise<UnlockResult> => {
          const updated = await tx
            .update(progress)
            .set({
              supplies: sql`${progress.supplies} - ${price}`,
              unlocks: sql`${progress.unlocks} || jsonb_build_array(${unlockId}::text)`,
              updatedAt: sql`now()`,
            })
            .where(and(eq(progress.accountId, accountId), sql`${progress.supplies} >= ${price}`, sql`NOT (${progress.unlocks} ? ${unlockId})`))
            .returning(progressColumns);
          const row = updated[0];
          if (row) return { outcome: "unlocked", progress: row };
          const now = await tx.select(progressColumns).from(progress).where(eq(progress.accountId, accountId)).limit(1);
          const current: Progress = now[0] ?? { accountId, supplies: 0, lifetimeSupplies: 0, unlocks: [], training: {}, districts: [] };
          if (current.unlocks.includes(unlockId)) return { outcome: "already_unlocked", progress: current };
          return { outcome: "not_enough", need: Math.max(1, price - current.supplies), progress: current };
        },
        bankOptions,
      );
    },
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
    // Review RR-M1: NOT under withDbTimeout (which stops waiting while the work goes on): the result is the
    // transaction's own final outcome, bounded inside the database (`boundedTransaction`).
    addSupplies: (runId, accountId, pay) =>
      boundedTransaction(
        database,
        "progress.addSupplies",
        async (tx) => {
          await tx.insert(progress).values({ accountId }).onConflictDoNothing(); // a missing row is an empty one
          const locked = await tx
            .select({ supplies: progress.supplies, lifetimeSupplies: progress.lifetimeSupplies })
            .from(progress)
            .where(eq(progress.accountId, accountId))
            .for("update");
          const before = locked[0];
          if (!before) throw new Error("progress row missing");
          const payout = pay(before.lifetimeSupplies);
          const supplies = Math.max(0, Math.floor(payout.supplies));
          const inserted = await tx
            .insert(runRewards)
            .values({ runId, accountId, supplies, breakdown: payout.breakdown })
            .onConflictDoNothing()
            .returning({ runId: runRewards.runId });
          if (inserted.length === 0) {
            const earlier = await tx
              .select({ supplies: runRewards.supplies, breakdown: runRewards.breakdown })
              .from(runRewards)
              .where(and(eq(runRewards.runId, runId), eq(runRewards.accountId, accountId)))
              .limit(1);
            const row = earlier[0];
            return { banked: false, supplies: row?.supplies ?? 0, newTotal: before.supplies, breakdown: row?.breakdown ?? {} };
          }
          const updated = await tx
            .update(progress)
            .set({
              supplies: sql`${progress.supplies} + ${supplies}`,
              lifetimeSupplies: sql`${progress.lifetimeSupplies} + ${supplies}`,
              updatedAt: sql`now()`,
            })
            .where(eq(progress.accountId, accountId))
            .returning({ supplies: progress.supplies });
          return { banked: true, supplies, newTotal: updated[0]?.supplies ?? before.supplies + supplies, breakdown: payout.breakdown };
        },
        bankOptions,
      ),
  };
}
