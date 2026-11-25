/**
 * Story 7.1: accounts. The only code that reads or writes the `accounts` table (rooms and routes call these).
 * Every call: async, 2 s timeout, `db_error {op}` on failure (`withDbTimeout`).
 */
import { eq } from "drizzle-orm";
import type { Database } from "./client";
import { accounts, progress } from "./schema";
import { DB_TIMEOUT_MS, withDbTimeout } from "./timeout";

/** What the rest of the server may know about an account (never a hash). */
export interface Account {
  id: string;
  displayName: string;
  username: string | null;
}

export interface AccountsRepo {
  findByTokenHash(tokenHash: string): Promise<Account | null>;
  /**
   * Creates a guest account and its empty progress row in one transaction. If another request created the same
   * token's account first (two tabs at once), returns that one instead.
   */
  createGuest(tokenHash: string, displayName: string): Promise<Account>;
  setDisplayName(accountId: string, displayName: string): Promise<void>;
}

const columns = { id: accounts.id, displayName: accounts.displayName, username: accounts.username };

export function accountsRepo(database: Database, timeoutMs = DB_TIMEOUT_MS): AccountsRepo {
  return {
    findByTokenHash: (tokenHash) =>
      withDbTimeout(
        "accounts.findByTokenHash",
        async () => {
          const db = await database.db();
          const rows = await db.select(columns).from(accounts).where(eq(accounts.guestTokenHash, tokenHash)).limit(1);
          return rows[0] ?? null;
        },
        timeoutMs,
      ),
    createGuest: (tokenHash, displayName) =>
      withDbTimeout(
        "accounts.createGuest",
        async () => {
          const db = await database.db();
          return db.transaction(async (tx) => {
            const made = await tx
              .insert(accounts)
              .values({ guestTokenHash: tokenHash, displayName })
              .onConflictDoNothing({ target: accounts.guestTokenHash })
              .returning(columns);
            const row = made[0];
            if (row === undefined) {
              const existing = await tx.select(columns).from(accounts).where(eq(accounts.guestTokenHash, tokenHash)).limit(1);
              if (existing[0] === undefined) throw new Error("guest vanished after conflict");
              return existing[0];
            }
            await tx.insert(progress).values({ accountId: row.id }).onConflictDoNothing();
            return row;
          });
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
  };
}
