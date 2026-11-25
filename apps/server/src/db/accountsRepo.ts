/**
 * Story 7.1: accounts. The only code that reads or writes the `accounts` table (rooms and routes call these).
 * Every call: async, 2 s timeout, `db_error {op}` on failure (`withDbTimeout`). Story 7.6: a device is found through
 * `device_tokens` (one account, several devices); usernames, password and recovery-code hashes.
 */
import { and, eq, isNull } from "drizzle-orm";
import type { Database } from "./client";
import { accounts, deviceTokens, progress } from "./schema";
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

export interface AccountsRepo {
  findByTokenHash(tokenHash: string): Promise<Account | null>;
  /**
   * Creates a guest account, its device row and its empty progress row in one transaction. If another request created
   * the same token's account first (two tabs at once), returns that one instead.
   */
  createGuest(tokenHash: string, displayName: string): Promise<Account>;
  setDisplayName(accountId: string, displayName: string): Promise<void>;
  /** Story 7.6: the full account with this lower-cased username, or null. */
  findByUsernameLower(usernameLower: string): Promise<AccountCredentials | null>;
  /**
   * Story 7.6 (AC 2, A1): turns a GUEST into an account in place (same id, same progress): username + hashes are set
   * only while the row has no username and was never merged. `taken` = the lower-cased name exists (unique index).
   */
  setCredentials(accountId: string, c: { username: string; passwordHash: string; recoveryCodeHash: string }): Promise<SetCredentialsResult>;
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
