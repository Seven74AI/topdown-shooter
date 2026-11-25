/**
 * Story 7.6 (AC 1, 4–7; D11): which account a DEVICE plays as, and the two transactions that change it.
 *
 * - `logIn`: the device (its current token) becomes the account. If the device was a guest, the guest is MERGED into
 *   the account (`meta/merge.ts`), all in ONE `boundedTransaction` (7.2's bounds: a login reported as failed never
 *   commits later): both `accounts` rows locked FOR UPDATE in id order, then both `progress` rows in id order (no
 *   deadlock between two merges, and a bank of either account waits or is redirected: `progressRepo.addSupplies`),
 *   the merged row written to the account, the guest's progress row deleted, `merged_into` set, the guest's device
 *   rows deleted. The device gets a FRESH token row (decision 7.6 B1: the old token dies, so a copy of the guest key
 *   or an old ticket can never reach the account). A forgotten-password reset passes `credentials`: the new hashes are
 *   written in the same transaction, conditional on the recovery hash still being the one that was verified (two
 *   resets with one code: only one wins).
 * - `logOut`: the device's row is deleted and a new guest (account + device row + empty progress) is made; the
 *   account is untouched.
 */
import { and, asc, eq, inArray, isNull } from "drizzle-orm";
import { mergeProgress, type MergeRefunds, type MergeRow } from "../meta/merge";
import type { Account } from "./accountsRepo";
import { boundedTransaction, type BoundedOptions, type Tx } from "./boundedTx";
import type { Database } from "./client";
import type { Progress } from "./progressRepo";
import { accounts, deviceTokens, progress, type ProgressRow } from "./schema";

/** Compile-time half of the merge-writers check (`mergeRules.test.ts` is the runtime half): every column has a rule. */
type MissingMergeRule = Exclude<keyof ProgressRow, keyof typeof import("../meta/merge").MERGE_RULES>;
const everyColumnHasARule: [MissingMergeRule] extends [never] ? true : { missingRuleFor: MissingMergeRule } = true;
void everyColumnHasARule;

export interface LogInInput {
  /** SHA-256 of the token the device presented (cookie), or null (no device row yet). */
  oldTokenHash: string | null;
  /** SHA-256 of the fresh token the device gets. */
  newTokenHash: string;
  /** The account whose password (or recovery code) was verified. */
  accountId: string;
  /** Forgot password: the new hashes, written only if the recovery hash is still `expectRecoveryHash`. */
  credentials?: { expectRecoveryHash: string; passwordHash: string; recoveryCodeHash: string };
}

export type LogInResult =
  | { outcome: "ok"; account: Account; progress: Progress; merged: { guestId: string; refunds: MergeRefunds } | null }
  /** `credentials` given and the recovery hash changed meanwhile (another reset won): nothing written. */
  | { outcome: "stale_credentials" };

export interface DeviceTokensRepo {
  logIn(input: LogInInput): Promise<LogInResult>;
  /**
   * The device stops being a FULL account and becomes a new guest with `newTokenHash`. `not_logged_in`: the device's
   * row is missing or its account is a guest (a guest never logs out: its progress would be orphaned).
   */
  logOut(oldTokenHash: string, newTokenHash: string): Promise<{ outcome: "ok"; account: Account; previousAccountId: string } | { outcome: "not_logged_in" }>;
}

const accountColumns = { id: accounts.id, displayName: accounts.displayName, username: accounts.username };
const viewOf = (r: Pick<ProgressRow, "accountId" | "supplies" | "lifetimeSupplies" | "unlocks" | "training" | "districts">): Progress => ({
  accountId: r.accountId,
  supplies: r.supplies,
  lifetimeSupplies: r.lifetimeSupplies,
  unlocks: r.unlocks,
  training: r.training,
  districts: r.districts,
});

async function mergeGuest(tx: Tx, accountId: string, guestId: string): Promise<{ guestId: string; refunds: MergeRefunds } | null> {
  const [lo, hi] = accountId < guestId ? [accountId, guestId] : [guestId, accountId];
  const locked = await tx
    .select({ id: accounts.id, username: accounts.username, mergedInto: accounts.mergedInto })
    .from(accounts)
    .where(inArray(accounts.id, [lo, hi]))
    .orderBy(asc(accounts.id))
    .for("update");
  const guest = locked.find((r) => r.id === guestId);
  // Re-checked under the lock: a guest saved or merged meanwhile is not merged again.
  if (!guest || guest.username !== null || guest.mergedInto !== null) return null;
  await tx.insert(progress).values([{ accountId: lo }, { accountId: hi }]).onConflictDoNothing();
  const rows = await tx.select().from(progress).where(inArray(progress.accountId, [lo, hi])).orderBy(asc(progress.accountId)).for("update");
  const a = rows.find((r) => r.accountId === accountId);
  const g = rows.find((r) => r.accountId === guestId);
  if (!a || !g) throw new Error("progress rows missing after insert");
  const { row, refunds } = mergeProgress(a as unknown as MergeRow, g as unknown as MergeRow);
  const { accountId: _keep, ...values } = row;
  await tx.update(progress).set(values as Partial<ProgressRow>).where(eq(progress.accountId, accountId));
  await tx.delete(progress).where(eq(progress.accountId, guestId));
  await tx.update(accounts).set({ mergedInto: accountId }).where(eq(accounts.id, guestId));
  await tx.delete(deviceTokens).where(eq(deviceTokens.accountId, guestId));
  return { guestId, refunds };
}

export function deviceTokensRepo(database: Database, opts: BoundedOptions = {}): DeviceTokensRepo {
  return {
    logIn: (input) =>
      boundedTransaction(
        database,
        "devices.logIn",
        async (tx): Promise<LogInResult> => {
          if (input.credentials) {
            const changed = await tx
              .update(accounts)
              .set({ passwordHash: input.credentials.passwordHash, recoveryCodeHash: input.credentials.recoveryCodeHash })
              .where(and(eq(accounts.id, input.accountId), eq(accounts.recoveryCodeHash, input.credentials.expectRecoveryHash)))
              .returning({ id: accounts.id });
            if (changed.length === 0) return { outcome: "stale_credentials" };
          }
          let merged: { guestId: string; refunds: MergeRefunds } | null = null;
          if (input.oldTokenHash !== null) {
            const dev = await tx
              .select({ accountId: deviceTokens.accountId })
              .from(deviceTokens)
              .where(eq(deviceTokens.tokenHash, input.oldTokenHash))
              .for("update");
            const current = dev[0]?.accountId;
            if (current !== undefined && current !== input.accountId) {
              const isGuest = await tx
                .select({ id: accounts.id })
                .from(accounts)
                .where(and(eq(accounts.id, current), isNull(accounts.username), isNull(accounts.mergedInto)))
                .limit(1);
              if (isGuest.length === 1) merged = await mergeGuest(tx, input.accountId, current);
            }
            await tx.delete(deviceTokens).where(eq(deviceTokens.tokenHash, input.oldTokenHash));
          }
          await tx.insert(deviceTokens).values({ tokenHash: input.newTokenHash, accountId: input.accountId });
          const acc = await tx.select(accountColumns).from(accounts).where(eq(accounts.id, input.accountId)).limit(1);
          if (!acc[0]) throw new Error("account missing at login");
          await tx.insert(progress).values({ accountId: input.accountId }).onConflictDoNothing();
          const p = await tx.select().from(progress).where(eq(progress.accountId, input.accountId)).limit(1);
          if (!p[0]) throw new Error("progress missing at login");
          return { outcome: "ok", account: acc[0], progress: viewOf(p[0]), merged };
        },
        opts,
      ),
    logOut: (oldTokenHash, newTokenHash) =>
      boundedTransaction(
        database,
        "devices.logOut",
        async (tx) => {
          const dev = await tx
            .select({ accountId: deviceTokens.accountId, username: accounts.username })
            .from(deviceTokens)
            .innerJoin(accounts, eq(accounts.id, deviceTokens.accountId))
            .where(eq(deviceTokens.tokenHash, oldTokenHash))
            .for("update", { of: deviceTokens });
          const row = dev[0];
          if (!row || row.username === null) return { outcome: "not_logged_in" as const };
          await tx.delete(deviceTokens).where(eq(deviceTokens.tokenHash, oldTokenHash));
          const made = await tx.insert(accounts).values({ displayName: "" }).returning(accountColumns);
          const guest = made[0];
          if (!guest) throw new Error("guest insert returned nothing");
          await tx.insert(deviceTokens).values({ tokenHash: newTokenHash, accountId: guest.id });
          await tx.insert(progress).values({ accountId: guest.id });
          return { outcome: "ok" as const, account: guest, previousAccountId: row.accountId };
        },
        opts,
      ),
  };
}
