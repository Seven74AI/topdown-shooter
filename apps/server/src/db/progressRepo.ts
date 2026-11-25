/**
 * Story 7.1: the `progress` row per account (Supplies, bought unlocks, Training, districts). 7.2–7.7 add the
 * banking and purchase writes here (one transaction each, brief 18).
 */
import { and, eq, sql } from "drizzle-orm";
import type { Database } from "./client";
import { accounts, progress, runRewards, type LifetimeStatsRow } from "./schema";
import { PROGRESSION } from "@topdown/shared";
import { DB_TIMEOUT_MS, withDbTimeout } from "./timeout";

import { boundedTransaction, type BoundedOptions, type Tx } from "./boundedTx";

/** Story 7.10 (review L2): what `saveLook`'s decider returns to leave the stored look as it is. */
export const KEEP_LOOK: unique symbol = Symbol("keep_look");

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
  /** Story 7.9: the survivor look code, or null (the default look). Written only by 7.10's `saveLook` (canonical). */
  look: string | null;
  /** Story 7.11: owned milestone / loot part keys (`slot:id`). */
  cosmetics: string[];
  /** Story 7.11: lifetime counters. */
  stats: LifetimeStatsRow;
}

export type { LifetimeStatsRow } from "./schema";

/**
 * Stories 7.7 / 7.11 / 7.12: the run's meta writes, made INSIDE 7.2's bank transaction (brief 18) after the run_rewards
 * row was inserted (so a retry or a second endRun writes none of them again): `statsDelta` is added to the locked
 * `stats`; `grant` then sees the stats AFTER the increment (AC 5: lifetime milestones are checked on them), the owned
 * part keys and districts (all read under the row lock), and returns what to add (unions) plus its own breakdown keys
 * (stored in run_rewards.breakdown, so an "already banked" answer replays them).
 */
export interface RunMetaWrites {
  readonly statsDelta: LifetimeStatsRow;
  grant(statsAfter: LifetimeStatsRow, owned: ReadonlySet<string>, districts: readonly string[]): { cosmetics: readonly string[]; districts: readonly string[]; breakdown: Record<string, unknown> };
}

type Grant = ReturnType<RunMetaWrites["grant"]>;

/**
 * Story 8.4–8.6 review H1: ONE loot bag per run, across every account and every night. A grant that carries a find is
 * stripped of it when another account's `run_rewards` row of this run already holds one (a reused player id after a
 * remove, a save banked by a fresh bank, a bag dropped again after a crash resume). Under a per-run advisory lock, so
 * two banks at once can't both pay it.
 */
async function oneBagPerRun(tx: Tx, runId: string, accountId: string, grant: Grant | null): Promise<Grant | null> {
  if (!grant) return grant;
  const loot = grant.breakdown.loot as { key?: string | null } | undefined;
  if (loot === undefined) return grant;
  await tx.execute(sql`select pg_advisory_xact_lock(hashtext(${`bag:${runId}`}))`);
  const other = await tx
    .select({ x: sql`1` })
    .from(runRewards)
    .where(and(eq(runRewards.runId, runId), sql`${runRewards.accountId} <> ${accountId}`, sql`jsonb_exists(${runRewards.breakdown}, 'loot')`))
    .limit(1);
  if (other.length === 0) return grant;
  const { loot: _paid, ...rest } = grant.breakdown;
  void _paid;
  return { ...grant, cosmetics: grant.cosmetics.filter((k) => k !== loot.key), breakdown: rest };
}

const statN = (v: unknown): number => (typeof v === "number" && Number.isFinite(v) && v >= 0 ? Math.floor(v) : 0);
/** A stored `stats` value read back (anything missing or broken is 0). */
export function readStats(raw: unknown): LifetimeStatsRow {
  const o = (raw ?? {}) as Partial<Record<keyof LifetimeStatsRow, unknown>>;
  return { revives: statN(o.revives), kills: statN(o.kills), barricades: statN(o.barricades), runs: statN(o.runs) };
}
/** Re-review L3: what was played since the first bank, per field, never negative. */
const subStats = (a: LifetimeStatsRow, b: LifetimeStatsRow): LifetimeStatsRow => ({
  revives: Math.max(0, a.revives - b.revives),
  kills: Math.max(0, a.kills - b.kills),
  barricades: Math.max(0, a.barricades - b.barricades),
  runs: Math.max(0, a.runs - b.runs),
});
const addStats = (a: LifetimeStatsRow, d: LifetimeStatsRow): LifetimeStatsRow => ({
  revives: a.revives + statN(d.revives),
  kills: a.kills + statN(d.kills),
  barricades: a.barricades + statN(d.barricades),
  runs: a.runs + statN(d.runs),
});

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
  /** Story 7.6 (AC 10, D9): this bank is a guest's first of ≥ `account.saveNudgeSupplies`: show "Save my progress" once. */
  nudge: boolean;
}

/**
 * Story 7.3 (AC 5): the result of an unlock attempt, with the progress row as it is after it (U5: the hub shows this).
 * A missing progress row counts as the empty one (0 Supplies: `not_enough`).
 */
export type UnlockResult =
  | { outcome: "unlocked"; progress: Progress }
  | { outcome: "already_unlocked"; progress: Progress }
  | { outcome: "not_enough"; need: number; progress: Progress };

/**
 * Story 7.5 (AC 3, T3): the result of a Training purchase, with the progress row as it is after it. A missing progress
 * row counts as the empty one (0 Supplies, every level 0).
 */
export type TrainResult =
  | { outcome: "trained"; progress: Progress }
  | { outcome: "already_trained"; progress: Progress }
  | { outcome: "maxed"; progress: Progress }
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
   * Story 8.2 (AC 13, decision E8-J6) `topUp`: the seat banked this run before (a Leave) and came back. An existing
   * row is then RAISED to the new total and only `new − already` (≥ 0) is added to Supplies and lifetime Supplies; new
   * items and districts are granted (a set union, so nothing twice); lifetime stats are not added again (they were
   * counted with the first bank: decision 8.2 B5). Two concurrent top-ups serialize on the progress row lock.
   */
  addSupplies(runId: string, accountId: string, pay: (lifetimeBefore: number) => RunPayout, meta?: RunMetaWrites, topUp?: boolean): Promise<BankResult>;
  /**
   * Story 7.3 (AC 5, brief 18): buys `unlockId` for `price` (from the SERVER's progression.json, never the request) in
   * ONE conditional update: `supplies >= price AND NOT unlocks ? id`. Two concurrent buys for one account serialize on
   * the row lock and the second re-checks the condition, so the balance never goes below 0 and nothing is bought
   * twice. 0 rows → the row is re-read in the same transaction to say why. Review F1: the same `boundedTransaction` as
   * the bank (7.2 M1 / RR-M1): a purchase never commits after the route answered 503.
   */
  unlock(accountId: string, unlockId: string, price: number): Promise<UnlockResult>;
  /**
   * Story 7.10 (AC 8, E2; brief 15, 18, 21): writes the account's look in ONE bounded transaction. The progress row is
   * created if missing and locked, `canonical(row)` decides what to store FROM THE LOCKED ROW (the owned set is read
   * there: 7.11's `cosmetics` joins the row), and `look` is replaced by its result (null = the default look). Returns
   * what was stored. The raw request never reaches this method, only the decoder's output.
   */
  saveLook(accountId: string, canonical: (row: Progress) => string | null | typeof KEEP_LOOK): Promise<{ look: string | null; written: boolean }>;
  /**
   * Story 7.5 (AC 3, T3; brief 18): buys Training level `level` of `boost` for `cost` (both from the SERVER's
   * progression.json) in ONE conditional update: `supplies >= cost AND COALESCE((training->>boost)::int, 0) = level − 1`
   * (and `level <= maxLevel`). Two concurrent trains serialize on the row lock; the second re-checks and finds the level
   * already bought (or the Supplies gone), so one level is bought and charged once. 0 rows → re-read in the same
   * transaction to say why. In 7.2's `boundedTransaction`, like the unlock.
   */
  train(accountId: string, boost: string, level: number, cost: number, maxLevel: number): Promise<TrainResult>;
}

const progressColumns = {
  accountId: progress.accountId,
  supplies: progress.supplies,
  lifetimeSupplies: progress.lifetimeSupplies,
  unlocks: progress.unlocks,
  training: progress.training,
  districts: progress.districts,
  look: progress.look,
  cosmetics: progress.cosmetics, // Story 7.11
  stats: progress.stats,
};
/** A row from `progressColumns` with its stats read back (Story 7.11). */
const asProgress = (r: Omit<Progress, "stats"> & { stats: unknown }): Progress => ({ ...r, stats: readStats(r.stats) });

export function progressRepo(database: Database, timeoutMs = DB_TIMEOUT_MS, bankOptions: BoundedOptions = {}): ProgressRepo {
  return {
    train: async (accountId, boost, level, cost, maxLevel) => {
      if (!Number.isInteger(cost) || cost <= 0) throw new Error("training cost must be a positive integer");
      if (!Number.isInteger(level) || level < 1) throw new Error("training level must be a positive integer");
      return boundedTransaction(
        database,
        "progress.train",
        async (tx): Promise<TrainResult> => {
          if (level <= maxLevel) {
            const updated = await tx
              .update(progress)
              .set({
                supplies: sql`${progress.supplies} - ${cost}`,
                training: sql`jsonb_set(${progress.training}, ARRAY[${boost}::text], to_jsonb(${level}::int), true)`,
                updatedAt: sql`now()`,
              })
              .where(
                and(
                  eq(progress.accountId, accountId),
                  sql`${progress.supplies} >= ${cost}`,
                  sql`COALESCE((${progress.training} ->> ${boost})::int, 0) = ${level - 1}`,
                ),
              )
              .returning(progressColumns);
            const row = updated[0];
            if (row) return { outcome: "trained", progress: asProgress(row) };
          }
          const now = await tx.select(progressColumns).from(progress).where(eq(progress.accountId, accountId)).limit(1);
          const current: Progress = now[0] ? asProgress(now[0]) : { accountId, supplies: 0, lifetimeSupplies: 0, unlocks: [], training: {}, districts: [], look: null, cosmetics: [], stats: readStats(null) };
          const have = typeof current.training[boost] === "number" ? current.training[boost] : 0;
          if (have >= maxLevel || level > maxLevel) return { outcome: "maxed", progress: current };
          if (have !== level - 1) return { outcome: "already_trained", progress: current };
          return { outcome: "not_enough", need: Math.max(1, cost - current.supplies), progress: current };
        },
        bankOptions,
      );
    },
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
          if (row) return { outcome: "unlocked", progress: asProgress(row) };
          const now = await tx.select(progressColumns).from(progress).where(eq(progress.accountId, accountId)).limit(1);
          const current: Progress = now[0] ? asProgress(now[0]) : { accountId, supplies: 0, lifetimeSupplies: 0, unlocks: [], training: {}, districts: [], look: null, cosmetics: [], stats: readStats(null) };
          if (current.unlocks.includes(unlockId)) return { outcome: "already_unlocked", progress: current };
          return { outcome: "not_enough", need: Math.max(1, price - current.supplies), progress: current };
        },
        bankOptions,
      );
    },
    // Story 7.10: the same bounded transaction as the bank and the unlock (a save never commits after the route answered 503).
    saveLook: (accountId, canonical) =>
      boundedTransaction(
        database,
        "progress.saveLook",
        async (tx) => {
          await tx.insert(progress).values({ accountId }).onConflictDoNothing(); // a missing row is an empty one
          const locked = await tx.select(progressColumns).from(progress).where(eq(progress.accountId, accountId)).for("update");
          const row = locked[0];
          if (!row) throw new Error("progress row missing");
          const look = canonical(asProgress(row)); // 7.11: the owned parts (cosmetics) of the locked row
          if (look === KEEP_LOOK) return { look: row.look, written: false }; // review L2: a newer look is stored: keep it
          const updated = await tx.update(progress).set({ look, updatedAt: sql`now()` }).where(eq(progress.accountId, accountId)).returning({ look: progress.look });
          return { look: updated[0]?.look ?? null, written: true };
        },
        bankOptions,
      ),
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
              look: progress.look,
              cosmetics: progress.cosmetics,
              stats: progress.stats,
            })
            .from(progress)
            .where(eq(progress.accountId, accountId))
            .limit(1);
          const r = rows[0];
          return r ? { ...r, stats: readStats(r.stats) } : null;
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
    addSupplies: (runId, accountId, pay, meta, topUp = false) =>
      boundedTransaction(
        database,
        "progress.addSupplies",
        async (tx) => {
          // Story 7.6: the seat's account row first (FOR NO KEY UPDATE: a login merge holds FOR UPDATE, so a bank and a
          // merge of one guest run one after the other). A guest merged into an account pays that account (its
          // `run_rewards` row keeps the seat's id: the (run, seat account) guard is unchanged).
          const acc = await tx
            .select({ mergedInto: accounts.mergedInto, username: accounts.username, saveNudged: accounts.saveNudged })
            .from(accounts)
            .where(eq(accounts.id, accountId))
            .for("no key update");
          const payee = acc[0]?.mergedInto ?? accountId;
          await tx.insert(progress).values({ accountId: payee }).onConflictDoNothing(); // a missing row is an empty one
          const locked = await tx
            .select({ supplies: progress.supplies, lifetimeSupplies: progress.lifetimeSupplies, cosmetics: progress.cosmetics, stats: progress.stats, districts: progress.districts })
            .from(progress)
            .where(eq(progress.accountId, payee))
            .for("update");
          const before = locked[0];
          if (!before) throw new Error("progress row missing");
          const owned = new Set(before.cosmetics ?? []);
          const districtsBefore = Array.isArray(before.districts) ? before.districts : [];
          const rowWhere = and(eq(runRewards.runId, runId), eq(runRewards.accountId, accountId));
          if (topUp) {
            // Story 8.2 (E8-J6) top-up: the seat banked this run before (its Leave) and came back.
            const earlier = (await tx.select({ supplies: runRewards.supplies, breakdown: runRewards.breakdown }).from(runRewards).where(rowWhere).limit(1))[0];
            if (earlier) {
              // Review M1: the rookie rule sees the lifetime BEFORE this run (the first bank's part taken back out).
              const payout = pay(Math.max(0, before.lifetimeSupplies - earlier.supplies));
              const supplies = Math.max(0, Math.floor(payout.supplies));
              const diff = supplies - earlier.supplies;
              // Review H2 + re-review L3: the first bank stored its stats delta in the row; the top-up adds and grants only
              // what was played since (full − earlier, per field, ≥ 0): exact, never twice. A row without one adds nothing.
              const earlierBreakdown = (earlier.breakdown as Record<string, unknown> | null) ?? {};
              const earlierDelta = earlierBreakdown.statsDelta === undefined ? null : readStats(earlierBreakdown.statsDelta);
              const extraDelta = meta && earlierDelta ? subStats(readStats(meta.statsDelta), earlierDelta) : null;
              const statsNow = extraDelta ? addStats(readStats(before.stats), extraDelta) : readStats(before.stats);
              const statsMoved = extraDelta !== null && (extraDelta.kills > 0 || extraDelta.revives > 0 || extraDelta.barricades > 0 || extraDelta.runs > 0);
              // …and the first bank's loot find is kept (never a second item).
              const grant = await oneBagPerRun(tx, runId, accountId, meta ? meta.grant(statsNow, owned, districtsBefore) : null);
              const earlierLoot = (earlier.breakdown as Record<string, unknown> | null)?.loot;
              const grantLootKey = (grant?.breakdown.loot as { key?: string | null } | undefined)?.key ?? null;
              const cosmeticsNow = grant ? grant.cosmetics.filter((k) => earlierLoot === undefined || k !== grantLootKey) : [];
              const metaLines: Record<string, unknown> = grant ? { ...grant.breakdown } : {};
              if (meta) metaLines.statsDelta = earlierDelta && extraDelta ? addStats(earlierDelta, extraDelta) : earlierBreakdown.statsDelta; // what is counted so far
              if (earlierLoot !== undefined) metaLines.loot = earlierLoot; // the first find stays the find
              const topExtra: Partial<typeof progress.$inferInsert> = {};
              if (statsMoved) topExtra.stats = statsNow;
              const newKeys = cosmeticsNow.filter((k) => !owned.has(k));
              if (newKeys.length > 0) topExtra.cosmetics = [...owned, ...new Set(newKeys)];
              const newDistricts = (grant?.districts ?? []).filter((d) => !districtsBefore.includes(d));
              if (newDistricts.length > 0) topExtra.districts = [...districtsBefore, ...new Set(newDistricts)];
              const paid = Math.max(0, diff);
              const granted = newKeys.length > 0 || newDistricts.length > 0 || statsMoved;
              if (paid === 0 && !granted) return { banked: false, supplies: earlier.supplies, newTotal: before.supplies, breakdown: (earlier.breakdown as Record<string, unknown>) ?? {}, nudge: false };
              const breakdown = paid > 0 ? { ...payout.breakdown, ...metaLines } : { ...((earlier.breakdown as Record<string, unknown>) ?? {}), ...metaLines };
              await tx.update(runRewards).set({ supplies: Math.max(supplies, earlier.supplies), breakdown }).where(rowWhere);
              const raised = await tx
                .update(progress)
                .set({ supplies: sql`${progress.supplies} + ${paid}`, lifetimeSupplies: sql`${progress.lifetimeSupplies} + ${paid}`, ...topExtra, updatedAt: sql`now()` })
                .where(eq(progress.accountId, payee))
                .returning({ supplies: progress.supplies });
              // Review M1: with nothing more to pay, new items and districts are still granted (not Supplies).
              return { banked: true, supplies: Math.max(supplies, earlier.supplies), newTotal: raised[0]?.supplies ?? before.supplies + paid, breakdown, nudge: false };
            }
          }
          const payout = pay(before.lifetimeSupplies);
          const supplies = Math.max(0, Math.floor(payout.supplies));
          // Stories 7.7 / 7.11 / 7.12: the meta writes, computed from the locked row (written below only if this bank is new).
          const statsAfter = meta ? addStats(readStats(before.stats), meta.statsDelta) : null;
          const grant = await oneBagPerRun(tx, runId, accountId, meta && statsAfter ? meta.grant(statsAfter, owned, districtsBefore) : null);
          // Re-review L3: the stats delta this bank counts rides in the row (a later top-up adds only what came after).
          const breakdown = grant && meta ? { ...payout.breakdown, ...grant.breakdown, statsDelta: meta.statsDelta } : payout.breakdown;
          const inserted = await tx
            .insert(runRewards)
            .values({ runId, accountId, supplies, breakdown })
            .onConflictDoNothing()
            .returning({ runId: runRewards.runId });
          if (inserted.length === 0) {
            const earlier = await tx.select({ supplies: runRewards.supplies, breakdown: runRewards.breakdown }).from(runRewards).where(rowWhere).limit(1);
            const row = earlier[0];
            return { banked: false, supplies: row?.supplies ?? 0, newTotal: before.supplies, breakdown: row?.breakdown ?? {}, nudge: false };
          }
          const extra: Partial<typeof progress.$inferInsert> = {};
          if (grant && statsAfter) {
            extra.stats = statsAfter; // under the row lock: two runs of one account ending at once both add (AC 5)
            const newKeys = grant.cosmetics.filter((k) => !owned.has(k));
            if (newKeys.length > 0) extra.cosmetics = [...owned, ...new Set(newKeys)];
            const newDistricts = grant.districts.filter((d) => !districtsBefore.includes(d));
            if (newDistricts.length > 0) extra.districts = [...districtsBefore, ...new Set(newDistricts)];
          }
          const updated = await tx
            .update(progress)
            .set({
              supplies: sql`${progress.supplies} + ${supplies}`,
              lifetimeSupplies: sql`${progress.lifetimeSupplies} + ${supplies}`,
              ...extra,
              updatedAt: sql`now()`,
            })
            .where(eq(progress.accountId, payee))
            .returning({ supplies: progress.supplies });
          // Story 7.6 (AC 10): a guest (not merged) whose bank reaches the nudge line for the first time.
          let nudge = false;
          const a = acc[0];
          if (a && payee === accountId && a.username === null && !a.saveNudged && supplies >= PROGRESSION.account.saveNudgeSupplies) {
            await tx.update(accounts).set({ saveNudged: true }).where(eq(accounts.id, accountId));
            nudge = true;
          }
          return { banked: true, supplies, newTotal: updated[0]?.supplies ?? before.supplies + supplies, breakdown, nudge }; // Stories 7.7 / 7.11 / 7.12: with the meta lines
        },
        bankOptions,
      ),
  };
}
