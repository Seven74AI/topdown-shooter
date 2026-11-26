/**
 * Stories 8.4–8.6 (AC 2): the saved runs. The ONLY code that touches `saved_runs` / `saved_run_players`. Every write is
 * one `boundedTransaction` (7.2: a write reported as failed never commits later), every read is under `withDbTimeout`
 * (2 s). The snapshot is opaque here (the room's `RunSave` JSON).
 *
 * Life of a row: an autosave `upsertOpen`s it ('open': a room plays it, nobody can resume it); `saveResumable` (Save and
 * quit, everyone left in a calm phase, shutdown in a calm phase) or `markSaved` (shutdown / tick error mid-wave: the
 * last autosave) makes it 'saved' for 7 days; `claim` is the only way back to 'open' (one conditional UPDATE: S3 — two
 * resumes race, one wins); `deleteRun` when the run is lost mid-wave or finished; `releaseOpenOnBoot` after a crash.
 */
import { and, desc, eq, gt, inArray, lt, notExists, sql } from "drizzle-orm";
import { scrubSeats } from "./scrubSeats";
import { boundedTransaction, type BoundedOptions, type Tx } from "./boundedTx";
import type { Database } from "./client";
import { accounts, runRewards, savedRunPlayers, savedRuns } from "./schema";
import { DB_TIMEOUT_MS, withDbTimeout } from "./timeout";

/** D13: a saved run stays resumable this long after its last save. */
export const SAVE_KEEP_MS = 7 * 24 * 3600 * 1000;
/** D13 / E8-S11: an account keeps its newest this many resumable runs. */
export const SAVES_PER_ACCOUNT = 3;

export interface SaveLink {
  readonly accountId: string;
  readonly seatKey: string;
}

export interface SaveRow {
  /** The run id (= the save id). */
  readonly id: string;
  readonly district: string;
  readonly seed: number;
  readonly snapshot: Record<string, unknown>;
  readonly schemaVersion: number;
  readonly wave: number;
  readonly names: readonly { name: string; slot: number }[];
  /** The room playing it (its code). */
  readonly roomCode: string;
  /** Seats with an account (the only ones a resume is offered to). */
  readonly links: readonly SaveLink[];
}

export interface SavedRunListItem {
  readonly id: string;
  readonly district: string;
  readonly wave: number;
  readonly names: { name: string; slot: number }[];
  readonly savedAt: string;
  readonly expiresAt: string;
}

export type ClaimResult = { outcome: "claimed"; snapshot: Record<string, unknown>; expiresAt: Date } | { outcome: "busy" } | { outcome: "gone" };

export interface SavedRunsRepo {
  /** Autosave: insert the run 'open' for this room, or overwrite its snapshot while this room holds it. False: another room holds it. */
  upsertOpen(save: SaveRow): Promise<boolean>;
  /** The run as a resumable save now (snapshot written, 'saved', expires at `expiresAt`). False: another room holds it. */
  saveResumable(save: SaveRow, expiresAt: Date): Promise<boolean>;
  /** Mid-wave shutdown / tick error: this room's last autosave becomes resumable as it is. False: nothing to mark. */
  markSaved(id: string, roomCode: string, expiresAt: Date): Promise<boolean>;
  /** The run is lost (mid-wave leave) or finished: gone while this room holds it. True if a row was deleted. */
  deleteRun(id: string, roomCode: string): Promise<boolean>;
  /** A resumed lobby closed before its Start: the run is resumable again (its expiry unchanged). */
  releaseOpen(id: string, roomCode: string): Promise<boolean>;
  /** The account's resumable runs (not expired), newest first, at most 3. */
  listForAccount(accountId: string): Promise<SavedRunListItem[]>;
  /** S3: the only way to open a save — 'saved', not expired, linked to this account → 'open' for `roomCode`. */
  claim(id: string, accountId: string, roomCode: string): Promise<ClaimResult>;
  /** E8-S6: every 'open' row (a process that died without a clean stop) becomes resumable. Returns them. */
  releaseOpenOnBoot(expiresAt?: Date): Promise<{ id: string; snapshot: Record<string, unknown> }[]>;
  /** E8-S11: the account keeps its newest `keep` resumable runs; older links go, a run nobody is linked to is deleted. Expired runs go too. */
  pruneAccount(accountId: string, keep?: number): Promise<{ unlinked: number; deleted: string[] }>;
  /**
   * Review M2: resumable runs (not expired) with a linked account that has no `run_rewards` row for the run yet — a save
   * whose Supplies top-up was lost (a shutdown that closed the database first). The boot sweep banks them.
   */
  listUnbanked(): Promise<{ id: string; snapshot: Record<string, unknown> }[]>;
  /** Review M6: the accounts among `ids` that were merged into another (a guest that logged in): id → the account now. */
  mergedTargets(ids: readonly string[]): Promise<Map<string, string>>;
}

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
export const isRunId = (s: unknown): s is string => typeof s === "string" && UUID.test(s);

/** The linked accounts that exist (a made-up or deleted account is not among them). */
async function knownAccounts(tx: Tx, links: readonly SaveLink[]): Promise<Set<string>> {
  const wanted = links.filter((l) => isRunId(l.accountId));
  if (wanted.length === 0) return new Set();
  return new Set((await tx.select({ id: accounts.id }).from(accounts).where(inArray(accounts.id, wanted.map((l) => l.accountId)))).map((r) => r.id));
}

/** The links whose account exists (a made-up or deleted account is skipped, never a failed save). */
async function writeLinks(tx: Tx, id: string, links: readonly SaveLink[], known: ReadonlySet<string>): Promise<void> {
  await tx.delete(savedRunPlayers).where(eq(savedRunPlayers.savedRunId, id));
  const wanted = links.filter((l) => isRunId(l.accountId));
  if (wanted.length === 0) return;
  const rows = wanted.filter((l, i) => known.has(l.accountId) && wanted.findIndex((x) => x.accountId === l.accountId) === i).map((l) => ({ savedRunId: id, accountId: l.accountId, seatKey: l.seatKey }));
  if (rows.length > 0) await tx.insert(savedRunPlayers).values(rows);
}

export function savedRunsRepo(database: Database, timeoutMs = DB_TIMEOUT_MS, bounded: BoundedOptions = {}): SavedRunsRepo {
  const write = <T>(op: string, body: (tx: Tx) => Promise<T>): Promise<T> => boundedTransaction(database, op, body, bounded);
  /** Insert or overwrite while this room holds the row (or nobody does yet). */
  const put = (op: string, s: SaveRow, status: "open" | "saved", expiresAt: Date | null): Promise<boolean> =>
    write(op, async (tx) => {
      // Story 10.1 re-review L5-live: a seat whose account was deleted (Delete my progress) while this room remembered it
      // is scrubbed before it is written, like the delete scrubbed it (one helper), so an autosave never writes it back.
      const known = await knownAccounts(tx, s.links);
      const gone = new Set(s.links.filter((l) => isRunId(l.accountId) && !known.has(l.accountId)).map((l) => l.accountId));
      const scrubbed = gone.size > 0 ? scrubSeats(s.snapshot, s.names, gone) : null;
      const snapshot = scrubbed?.snapshot ?? s.snapshot;
      const names = scrubbed?.names ?? [...s.names];
      const values = { district: s.district, seed: s.seed, snapshot, schemaVersion: s.schemaVersion, wave: s.wave, names, status, roomCode: status === "open" ? s.roomCode : null, updatedAt: sql`now()` };
      // Review L: an autosave never touches the expiry or saved_at (a claimed run keeps both); a resumable save sets them.
      const ends = status === "saved" ? { expiresAt, savedAt: sql`now()` } : {};
      const done = await tx
        .insert(savedRuns)
        .values({ id: s.id, ...values, expiresAt, ...(status === "saved" ? { savedAt: sql`now()` } : {}) })
        .onConflictDoUpdate({ target: savedRuns.id, set: { ...values, ...ends }, setWhere: sql`${savedRuns.status} = 'open' and ${savedRuns.roomCode} = ${s.roomCode}` })
        .returning({ id: savedRuns.id });
      if (done.length === 0) return false;
      await writeLinks(tx, s.id, s.links, known);
      return true;
    });
  return {
    upsertOpen: (s) => put("savedRuns.upsertOpen", s, "open", null),
    saveResumable: (s, expiresAt) => put("savedRuns.saveResumable", s, "saved", expiresAt),
    markSaved: (id, roomCode, expiresAt) =>
      write("savedRuns.markSaved", async (tx) => {
        const r = await tx
          .update(savedRuns)
          .set({ status: "saved", roomCode: null, expiresAt, savedAt: sql`now()`, updatedAt: sql`now()` })
          .where(and(eq(savedRuns.id, id), eq(savedRuns.status, "open"), eq(savedRuns.roomCode, roomCode)))
          .returning({ id: savedRuns.id });
        return r.length > 0;
      }),
    deleteRun: (id, roomCode) =>
      write("savedRuns.deleteRun", async (tx) => {
        const r = await tx
          .delete(savedRuns)
          .where(and(eq(savedRuns.id, id), eq(savedRuns.status, "open"), eq(savedRuns.roomCode, roomCode)))
          .returning({ id: savedRuns.id });
        return r.length > 0;
      }),
    releaseOpen: (id, roomCode) =>
      write("savedRuns.releaseOpen", async (tx) => {
        const r = await tx
          .update(savedRuns)
          .set({ status: "saved", roomCode: null })
          .where(and(eq(savedRuns.id, id), eq(savedRuns.status, "open"), eq(savedRuns.roomCode, roomCode)))
          .returning({ id: savedRuns.id });
        return r.length > 0;
      }),
    listForAccount: (accountId) =>
      withDbTimeout(
        "savedRuns.listForAccount",
        async () => {
          if (!isRunId(accountId)) return [];
          const db = await database.db();
          const rows = await db
            .select({ id: savedRuns.id, district: savedRuns.district, wave: savedRuns.wave, names: savedRuns.names, savedAt: sql<Date>`coalesce(${savedRuns.savedAt}, ${savedRuns.updatedAt})`.mapWith(savedRuns.updatedAt), expiresAt: savedRuns.expiresAt })
            .from(savedRunPlayers)
            .innerJoin(savedRuns, eq(savedRuns.id, savedRunPlayers.savedRunId))
            .where(and(eq(savedRunPlayers.accountId, accountId), eq(savedRuns.status, "saved"), gt(savedRuns.expiresAt, sql`now()`)))
            .orderBy(desc(sql`coalesce(${savedRuns.savedAt}, ${savedRuns.updatedAt})`), desc(savedRuns.id))
            .limit(SAVES_PER_ACCOUNT);
          return rows.map((r) => ({ id: r.id, district: r.district, wave: r.wave, names: Array.isArray(r.names) ? r.names.map((n) => ({ name: String(n.name), slot: Number(n.slot) })) : [], savedAt: r.savedAt.toISOString(), expiresAt: (r.expiresAt ?? r.savedAt).toISOString() }));
        },
        timeoutMs,
      ),
    claim: (id, accountId, roomCode) =>
      write("savedRuns.claim", async (tx): Promise<ClaimResult> => {
        if (!isRunId(id) || !isRunId(accountId)) return { outcome: "gone" };
        const linked = sql`exists (select 1 from ${savedRunPlayers} where ${savedRunPlayers.savedRunId} = ${savedRuns.id} and ${savedRunPlayers.accountId} = ${accountId})`;
        const won = await tx
          .update(savedRuns)
          .set({ status: "open", roomCode, updatedAt: sql`now()` })
          .where(and(eq(savedRuns.id, id), eq(savedRuns.status, "saved"), gt(savedRuns.expiresAt, sql`now()`), linked))
          .returning({ snapshot: savedRuns.snapshot, expiresAt: savedRuns.expiresAt });
        const row = won[0];
        if (row) return { outcome: "claimed", snapshot: row.snapshot, expiresAt: row.expiresAt ?? new Date() };
        // Why not: in play somewhere (and yours) → busy; anything else (expired, deleted, not yours) → gone.
        const now = await tx.select({ status: savedRuns.status }).from(savedRuns).where(and(eq(savedRuns.id, id), linked)).limit(1);
        return now[0]?.status === "open" ? { outcome: "busy" } : { outcome: "gone" };
      }),
    releaseOpenOnBoot: () =>
      write("savedRuns.releaseOpenOnBoot", async (tx) =>
        // Review L: a claimed run keeps its expiry (coalesce); a run only ever autosaved gets one now.
        tx
          .update(savedRuns)
          // Re-review L4 (D13): resumable for SAVE_KEEP_MS after its LAST save (the row's last write: the last autosave, or
          // the claim when none followed), never the claim's old expiry.
          .set({ status: "saved", roomCode: null, expiresAt: sql`${savedRuns.updatedAt} + ${`${SAVE_KEEP_MS} milliseconds`}::interval`, savedAt: sql`${savedRuns.updatedAt}`, updatedAt: sql`now()` })
          .where(eq(savedRuns.status, "open"))
          .returning({ id: savedRuns.id, snapshot: savedRuns.snapshot }),
      ),
    pruneAccount: (accountId, keep = SAVES_PER_ACCOUNT) =>
      write("savedRuns.pruneAccount", async (tx) => {
        await tx.delete(savedRuns).where(and(eq(savedRuns.status, "saved"), lt(savedRuns.expiresAt, sql`now()`)));
        const mine = await tx
          .select({ id: savedRuns.id })
          .from(savedRunPlayers)
          .innerJoin(savedRuns, eq(savedRuns.id, savedRunPlayers.savedRunId))
          .where(and(eq(savedRunPlayers.accountId, accountId), eq(savedRuns.status, "saved")))
          .orderBy(desc(sql`coalesce(${savedRuns.savedAt}, ${savedRuns.updatedAt})`), desc(savedRuns.id));
        const old = mine.slice(keep).map((r) => r.id);
        if (old.length === 0) return { unlinked: 0, deleted: [] };
        await tx.delete(savedRunPlayers).where(and(eq(savedRunPlayers.accountId, accountId), inArray(savedRunPlayers.savedRunId, old)));
        const orphan = await tx
          .delete(savedRuns)
          .where(and(inArray(savedRuns.id, old), eq(savedRuns.status, "saved"), notExists(tx.select({ x: sql`1` }).from(savedRunPlayers).where(eq(savedRunPlayers.savedRunId, savedRuns.id)))))
          .returning({ id: savedRuns.id });
        return { unlinked: old.length, deleted: orphan.map((r) => r.id) };
      }),
    listUnbanked: () =>
      withDbTimeout(
        "savedRuns.listUnbanked",
        async () => {
          const db = await database.db();
          // Re-review H: a row on an account merged into the link's account (the guest it was) counts as banked.
          const unbanked = sql`exists (select 1 from ${savedRunPlayers} where ${savedRunPlayers.savedRunId} = ${savedRuns.id} and not exists (select 1 from ${runRewards} where ${runRewards.runId} = ${savedRuns.id} and (${runRewards.accountId} = ${savedRunPlayers.accountId} or ${runRewards.accountId} in (select ${accounts.id} from ${accounts} where ${accounts.mergedInto} = ${savedRunPlayers.accountId}))))`;
          return db.select({ id: savedRuns.id, snapshot: savedRuns.snapshot }).from(savedRuns).where(and(eq(savedRuns.status, "saved"), gt(savedRuns.expiresAt, sql`now()`), unbanked));
        },
        timeoutMs * 5,
      ),
    mergedTargets: (ids) =>
      withDbTimeout(
        "savedRuns.mergedTargets",
        async () => {
          const wanted = ids.filter(isRunId);
          if (wanted.length === 0) return new Map<string, string>();
          const db = await database.db();
          const rows = await db.select({ id: accounts.id, into: accounts.mergedInto }).from(accounts).where(inArray(accounts.id, wanted));
          return new Map(rows.filter((r) => r.into !== null).map((r) => [r.id, r.into as string]));
        },
        timeoutMs,
      ),
  };
}
