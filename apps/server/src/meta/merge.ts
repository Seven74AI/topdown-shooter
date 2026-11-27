/**
 * Story 7.6 (AC 6, A2; designer D11, decisions 7.6 D1 + D2): logging in on a phone whose guest has progress merges the
 * guest into the account. Pure rules here; `db/deviceTokensRepo.ts › logIn` runs them inside ONE transaction that has
 * locked both progress rows (account first by id order), writes the result to the account's row and retires the guest.
 *
 * THE MERGE-WRITERS LIST (`MERGE_RULES`): one rule per `progress` column, keyed by the Drizzle field name. A story that
 * adds a column adds its rule here — 7.9/7.10 `look` (the account's look kept unless it is the default), 7.11
 * `cosmetics` (joined) and `stats` (added), Epic 8 saved runs. `db/mergeRules.test.ts` reads the Drizzle schema and
 * fails if a column has no rule (and `deviceTokensRepo.ts` fails to typecheck).
 *
 * Nothing paid for is lost: an unlock both sides bought is refunded at its price (D1); a Training boost keeps the
 * higher level and the lower side's spend on it is refunded (D2). Refunds go to Supplies, never to lifetime Supplies
 * (lifetime counts Supplies earned in runs; the rookie lift reads it).
 */
import { PROGRESSION, findUnlock, trainingSpent, type Progression } from "@topdown/shared";

/** A `progress` row as Drizzle reads it (field names, not column names); later stories' columns ride along. */
export interface MergeRow {
  accountId: string;
  supplies: number;
  lifetimeSupplies: number;
  unlocks: string[];
  training: Record<string, number>;
  districts: string[];
  updatedAt: Date;
  [column: string]: unknown;
}

/** What a merge gave back on top of adding (logged as `account_merged {refunded}`). */
export interface MergeRefunds {
  /** Unlocks both sides bought: id → price refunded (D1). */
  unlocks: Record<string, number>;
  /** Training boosts both sides trained: id → Supplies refunded (D2). */
  training: Record<string, number>;
  total: number;
}

interface MergeContext {
  refunds: MergeRefunds;
  config: Readonly<Progression>;
  now: Date;
}

/** One column's rule: the merged value from the account's and the guest's values (refunds go into `ctx`). */
export type MergeRule = (account: unknown, guest: unknown, ctx: MergeContext) => unknown;

const int = (v: unknown): number => (typeof v === "number" && Number.isInteger(v) && v > 0 ? v : 0);
const ids = (v: unknown): string[] => (Array.isArray(v) ? [...new Set(v.filter((x): x is string => typeof x === "string"))] : []);
const levels = (v: unknown): Record<string, number> => {
  const out: Record<string, number> = {};
  if (v === null || typeof v !== "object" || Array.isArray(v)) return out;
  for (const [k, n] of Object.entries(v as Record<string, unknown>)) if (int(n) > 0) out[k] = int(n);
  return out;
};
const union = (a: unknown, g: unknown): string[] => [...new Set([...ids(a), ...ids(g)])];

/**
 * The writers list (A2). `supplies` is added AFTER the refunds are known (`mergeProgress` adds `refunds.total`).
 * Add a rule for every new `progress` column (`db/mergeRules.test.ts`).
 */
export const MERGE_RULES = {
  /** The merged row is the account's. */
  accountId: (a) => a,
  /** Added (+ the refunds, by `mergeProgress`). */
  supplies: (a, g) => int(a) + int(g),
  /** Added; refunds are not earnings. */
  lifetimeSupplies: (a, g) => int(a) + int(g),
  /** Joined; an unlock both bought refunds its SERVER price (D1). An id the server no longer sells is kept, no refund. */
  unlocks: (a, g, ctx) => {
    const guest = new Set(ids(g));
    for (const id of ids(a)) {
      if (!guest.has(id)) continue;
      const price = findUnlock(id, ctx.config)?.price ?? 0;
      if (price > 0) {
        ctx.refunds.unlocks[id] = price;
        ctx.refunds.total += price;
      }
    }
    return union(a, g);
  },
  /** The higher level per boost; the lower side's spend on that boost is refunded (D2; equal levels refund one side). */
  training: (a, g, ctx) => {
    const acc = levels(a);
    const gst = levels(g);
    const out: Record<string, number> = { ...acc };
    for (const [boost, gl] of Object.entries(gst)) {
      const al = acc[boost] ?? 0;
      out[boost] = Math.max(al, gl);
      if (al === 0) continue;
      const refund = trainingSpent(Math.min(al, gl), ctx.config);
      if (refund > 0) {
        ctx.refunds.training[boost] = refund;
        ctx.refunds.total += refund;
      }
    }
    return out;
  },
  /** Joined (7.7). */
  districts: (a, g) => union(a, g),
  /** The merge time. */
  updatedAt: (_a, _g, ctx) => ctx.now,
  /** Story 7.9 / 7.10: the account's look kept unless it is the default (null), then the guest's. */
  look: (a, g) => (typeof a === "string" ? a : typeof g === "string" ? g : null),
  /** Story 7.11 / 7.12: owned milestone and loot parts, joined (an item owned on either side stays owned). */
  cosmetics: (a, g) => union(a, g),
  /** Story 7.11: the lifetime stats (M5, M6, M7, M9), added per key (both sides' runs really happened). */
  stats: (a, g) => {
    const o = (v: unknown): Record<string, unknown> => (v !== null && typeof v === "object" ? (v as Record<string, unknown>) : {});
    const [x, y] = [o(a), o(g)];
    return { revives: int(x.revives) + int(y.revives), kills: int(x.kills) + int(y.kills), barricades: int(x.barricades) + int(y.barricades), runs: int(x.runs) + int(y.runs) };
  },
  /** Story 10.1 (AC 6): the account's synced settings kept unless it has none (null), then the guest's. */
  settings: (a, g) => (a !== null && typeof a === "object" ? a : g !== null && typeof g === "object" ? g : null),
} satisfies Record<string, MergeRule>;

export type MergeColumn = keyof typeof MERGE_RULES;

/**
 * The account's row after merging the guest's into it, and what was refunded. Pure: the caller has locked both rows.
 * A column with no rule throws (never silently dropped: `db/mergeRules.test.ts` catches it before that).
 */
export function mergeProgress(
  account: MergeRow,
  guest: MergeRow,
  config: Readonly<Progression> = PROGRESSION,
  now: Date = new Date(),
): { row: MergeRow; refunds: MergeRefunds } {
  const ctx: MergeContext = { refunds: { unlocks: {}, training: {}, total: 0 }, config, now };
  const rules = MERGE_RULES as Record<string, MergeRule>;
  const row: Record<string, unknown> = {};
  for (const column of new Set([...Object.keys(account), ...Object.keys(guest)])) {
    const rule = rules[column];
    if (rule === undefined) throw new Error(`progress.${column} has no merge rule (meta/merge.ts MERGE_RULES)`);
    row[column] = rule(account[column], guest[column], ctx);
  }
  row.supplies = (row.supplies as number) + ctx.refunds.total;
  return { row: row as MergeRow, refunds: ctx.refunds };
}

/**
 * Review M6 (Stories 8.4–8.6): every OTHER table keyed by an account, and what a guest merge does with it
 * (`deviceTokensRepo.mergeGuest`). `db/mergeRules.test.ts` fails when a table with an `accountId` column is missing here.
 */
export const ACCOUNT_TABLE_MERGES = {
  progress: "merged by MERGE_RULES",
  deviceTokens: "the guest's devices are deleted (the device that logged in gets a fresh row)",
  runRewards: "kept on the guest as history (a late bank of the guest pays the account: mergedInto)",
  savedRunPlayers: "re-pointed to the account (a run both played keeps one link); a resume maps the save's guest seat by mergedInto",
  runResultPlayers: "kept on the guest as history (Story 10.7 B6: the stats map it through mergedInto)",
} as const;
