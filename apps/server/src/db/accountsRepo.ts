/**
 * Story 7.1: accounts. The only code that reads or writes the `accounts` table (rooms and routes call these).
 * Every call: async, 2 s timeout, `db_error {op}` on failure (`withDbTimeout`). Story 7.6: a device is found through
 * `device_tokens` (one account, several devices); usernames, password and recovery-code hashes.
 */
import { and, eq, inArray, isNull, sql } from "drizzle-orm";
import type { Database } from "./client";
import { accounts, deviceTokens, progress, savedRunPlayers, savedRuns } from "./schema";
import { DB_TIMEOUT_MS, withDbTimeout } from "./timeout";
import { boundedTransaction } from "./boundedTx";

/** What the rest of the server may know about an account (never a hash). */
export interface Account {
  id: string;
  displayName: string;
  username: string | null;
}

/** Story 7.6: what a login / reset checks (hashes stay inside the auth code, never logged or sent). */
export interface AccountCredentials {
  id: string;
  username: string;
  passwordHash: string | null;
  recoveryCodeHash: string | null;
}

/** Story 7.6 (AC 2): the outcome of saving a guest as an account. */
export type SetCredentialsResult = "ok" | "taken" | "not_guest";

/**
 * Story 10.1 (AC 8, B12): what a Delete my progress removed (counts only: the log line carries no id, B13). `gone` =
 * the device's row was not there any more (deleted or switched meanwhile): nothing was written.
 */
export type DeleteAccountResult =
  | { outcome: "deleted"; kind: "guest" | "account"; guests: number; savedRunsDeleted: number; seatsRemoved: number }
  | { outcome: "gone" }
  /** An account's password hash changed between the verify and the transaction (a reset won): nothing was written. */
  | { outcome: "stale_credentials" };

export interface AccountsRepo {
  findByTokenHash(tokenHash: string): Promise<Account | null>;
  /**
   * Creates a guest account, its device row and its empty progress row in one transaction. If another request created
   * the same token's account first (two tabs at once), returns that one instead.
   */
  createGuest(tokenHash: string, displayName: string): Promise<Account>;
  setDisplayName(accountId: string, displayName: string): Promise<void>;
  /**
   * Review N2: marks a device row as used (at most once a day: one write per device per day), so rows no phone holds
   * any more (a double-submitted login's spare row, a lost phone) can be told apart and cleaned (docs/deploy.md).
   */
  touchDevice(tokenHash: string): Promise<void>;
  /** Story 7.6: the full account with this lower-cased username, or null. */
  findByUsernameLower(usernameLower: string): Promise<AccountCredentials | null>;
  /**
   * Story 7.6 (AC 2, A1): turns a GUEST into an account in place (same id, same progress): username + hashes are set
   * only while the row has no username and was never merged. `taken` = the lower-cased name exists (unique index).
   */
  setCredentials(accountId: string, c: { username: string; passwordHash: string; recoveryCodeHash: string }): Promise<SetCredentialsResult>;
  /** Story 10.1 (AC 9): every device-token hash of an account (the route checks each against the live rooms). */
  deviceHashes(accountId: string): Promise<string[]>;
  /**
   * Story 10.1 (AC 8, B12; retro E7-A8): deletes the account the device `tokenHash` plays as, in ONE bounded
   * transaction: the device row and the account row are locked; the retired guests merged into it are deleted (their
   * `merged_into` points here and has no cascade); saved runs no other account can resume are deleted, in shared ones
   * only this account's seat link goes; then the account rows, whose cascades remove `progress`, `run_rewards`,
   * `device_tokens` and `saved_run_players`. `expectAccountId` (the account the route resolved) and, for an account,
   * `expectPasswordHash` (the hash that was verified) are re-checked under the lock.
   */
  deleteAccount(tokenHash: string, expectAccountId: string, expectPasswordHash: string | null): Promise<DeleteAccountResult>;
}

const columns = { id: accounts.id, displayName: accounts.displayName, username: accounts.username };

/** A unique-index violation (PostgreSQL 23505), as pg or PGlite report it (maybe wrapped by Drizzle). */
export function isUniqueViolation(e: unknown): boolean {
  for (let x: unknown = e, i = 0; x && i < 4; x = (x as { cause?: unknown }).cause, i++) {
    if ((x as { code?: unknown }).code === "23505") return true;
  }
  return false;
}

export function accountsRepo(database: Database, timeoutMs = DB_TIMEOUT_MS): AccountsRepo {
  const byToken = async (tokenHash: string): Promise<Account | null> => {
    const db = await database.db();
    const rows = await db
      .select(columns)
      .from(deviceTokens)
      .innerJoin(accounts, eq(accounts.id, deviceTokens.accountId))
      .where(eq(deviceTokens.tokenHash, tokenHash))
      .limit(1);
    return rows[0] ?? null;
  };
  return {
    deviceHashes: (accountId) =>
      withDbTimeout(
        "accounts.deviceHashes",
        async () => {
          const db = await database.db();
          const rows = await db.select({ h: deviceTokens.tokenHash }).from(deviceTokens).where(eq(deviceTokens.accountId, accountId));
          return rows.map((r) => r.h);
        },
        timeoutMs,
      ),
    // Not under withDbTimeout: a delete reported as failed must never commit later (the player would retry a ghost).
    deleteAccount: (tokenHash, expectAccountId, expectPasswordHash) =>
      boundedTransaction(database, "accounts.deleteAccount", async (tx): Promise<DeleteAccountResult> => {
        // One lock order with the 7.6 switches: the device row, then the account row.
        const dev = await tx.select({ accountId: deviceTokens.accountId }).from(deviceTokens).where(eq(deviceTokens.tokenHash, tokenHash)).for("update");
        const id = dev[0]?.accountId;
        if (id === undefined || id !== expectAccountId) return { outcome: "gone" };
        const acc = await tx.select({ username: accounts.username, passwordHash: accounts.passwordHash }).from(accounts).where(eq(accounts.id, id)).for("update");
        const a = acc[0];
        if (!a) return { outcome: "gone" };
        if (a.username !== null && a.passwordHash !== expectPasswordHash) return { outcome: "stale_credentials" };
        const guests = (await tx.select({ id: accounts.id }).from(accounts).where(eq(accounts.mergedInto, id))).map((r) => r.id);
        const mine = [id, ...guests];
        // B12: my saved runs; a run with a link to an account that is not mine stays (only my links go, by cascade).
        const links = await tx.select({ run: savedRunPlayers.savedRunId, acc: savedRunPlayers.accountId }).from(savedRunPlayers).where(inArray(savedRunPlayers.savedRunId, tx.select({ r: savedRunPlayers.savedRunId }).from(savedRunPlayers).where(inArray(savedRunPlayers.accountId, mine))));
        const mineSet = new Set(mine);
        const runs = new Map<string, boolean>(); // run → shared with an account that is not mine
        for (const l of links) runs.set(l.run, (runs.get(l.run) ?? false) || !mineSet.has(l.acc));
        const solo = [...runs].filter(([, sharedRun]) => !sharedRun).map(([run]) => run);
        const seatsRemoved = links.filter((l) => mineSet.has(l.acc) && runs.get(l.run) === true).length;
        if (solo.length > 0) await tx.delete(savedRuns).where(inArray(savedRuns.id, solo));
        if (guests.length > 0) await tx.delete(accounts).where(inArray(accounts.id, guests));
        await tx.delete(accounts).where(eq(accounts.id, id));
        return { outcome: "deleted", kind: a.username === null ? "guest" : "account", guests: guests.length, savedRunsDeleted: solo.length, seatsRemoved };
      }),
    findByTokenHash: (tokenHash) => withDbTimeout("accounts.findByTokenHash", () => byToken(tokenHash), timeoutMs),
    createGuest: (tokenHash, displayName) =>
      withDbTimeout(
        "accounts.createGuest",
        async () => {
          const db = await database.db();
          try {
            return await db.transaction(async (tx) => {
              const existing = await tx.select({ accountId: deviceTokens.accountId }).from(deviceTokens).where(eq(deviceTokens.tokenHash, tokenHash)).limit(1);
              if (existing[0] !== undefined) {
                const row = await tx.select(columns).from(accounts).where(eq(accounts.id, existing[0].accountId)).limit(1);
                if (row[0] !== undefined) return row[0];
              }
              const made = await tx.insert(accounts).values({ displayName }).returning(columns);
              const row = made[0];
              if (row === undefined) throw new Error("guest insert returned nothing");
              await tx.insert(deviceTokens).values({ tokenHash, accountId: row.id }); // a racing twin → 23505 → re-read below
              await tx.insert(progress).values({ accountId: row.id }).onConflictDoNothing();
              return row;
            });
          } catch (e) {
            if (!isUniqueViolation(e)) throw e;
            const other = await byToken(tokenHash);
            if (other === null) throw new Error("guest vanished after conflict", { cause: e });
            return other;
          }
        },
        timeoutMs,
      ),
    setDisplayName: (accountId, displayName) =>
      withDbTimeout(
        "accounts.setDisplayName",
        async () => {
          const db = await database.db();
          await db.update(accounts).set({ displayName }).where(eq(accounts.id, accountId));
        },
        timeoutMs,
      ),
    touchDevice: (tokenHash) =>
      withDbTimeout(
        "accounts.touchDevice",
        async () => {
          const db = await database.db();
          await db
            .update(deviceTokens)
            .set({ lastSeenAt: sql`now()` })
            .where(and(eq(deviceTokens.tokenHash, tokenHash), sql`${deviceTokens.lastSeenAt} < now() - interval '1 day'`));
        },
        timeoutMs,
      ),
    findByUsernameLower: (usernameLower) =>
      withDbTimeout(
        "accounts.findByUsernameLower",
        async () => {
          const db = await database.db();
          const rows = await db
            .select({ id: accounts.id, username: accounts.username, passwordHash: accounts.passwordHash, recoveryCodeHash: accounts.recoveryCodeHash })
            .from(accounts)
            .where(eq(accounts.usernameLower, usernameLower))
            .limit(1);
          const r = rows[0];
          return r && r.username !== null ? { ...r, username: r.username } : null;
        },
        timeoutMs,
      ),
    // Not under withDbTimeout (which stops waiting while the work goes on): a save reported as failed must never commit
    // later (the player would never see the recovery code). Bounded inside the database like 7.2's bank.
    setCredentials: (accountId, c) =>
      boundedTransaction(database, "accounts.setCredentials", async (tx): Promise<SetCredentialsResult> => {
        try {
          // A savepoint, so a unique violation is an answer ("taken"), not an aborted transaction.
          return await tx.transaction(async (sp) => {
            const done = await sp
              .update(accounts)
              .set({ username: c.username, usernameLower: c.username.toLowerCase(), passwordHash: c.passwordHash, recoveryCodeHash: c.recoveryCodeHash })
              .where(and(eq(accounts.id, accountId), isNull(accounts.username), isNull(accounts.mergedInto)))
              .returning({ id: accounts.id });
            return done.length === 1 ? "ok" : "not_guest";
          });
        } catch (e) {
          if (isUniqueViolation(e)) return "taken";
          throw e;
        }
      }),
  };
}
