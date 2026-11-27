/**
 * Story 10.7 (AC 1–6; B1–B6, B8): the run stats rows. The ONLY code that writes `run_results` / `run_result_players`
 * (and the only reader of `saved_runs` besides `savedRunsRepo`: the expiry step). Every write is one
 * `boundedTransaction`; reads are under `withDbTimeout`. Nothing here is awaited by a tick (the room fires and forgets,
 * `run/roomRunResults.ts`).
 *
 * Life of a row: `start` at a fresh run's Start (open: `ended_at` null), `resumed` at each resumed Start (+1 night),
 * `finish` once at the run's end (the room) or `expireAbandoned` when its save expired unresumed (the housekeeping
 * step). Both finishers use the same guarded upsert (`… WHERE run_results.ended_at IS NULL RETURNING id`) and write the
 * seat rows only when it returned a row, in the same transaction: exactly one finisher wins (B4). A finish whose start
 * insert was lost still writes the run (B8: the upsert inserts it).
 *
 * LOCK ORDER (`accountsRepo.ts`): the seats' account rows FOR KEY SHARE in id order first (lock 2), then the saved run
 * (4, expiry only), then the run row (5). An account deleted first reads as gone: its seat is written with a null
 * account (never a 23503).
 */
import { migrateRunSave } from "@topdown/shared";
import { and, asc, eq, gte, inArray, isNotNull, isNull, lt, notExists, sql } from "drizzle-orm";
import { boundedTransaction, type BoundedOptions, type Tx } from "./boundedTx";
import type { Database } from "./client";
import { accounts, runResultPlayers, runResults, savedRuns } from "./schema";
import { SAVE_KEEP_MS, isRunId } from "./savedRunsRepo";
import { DB_TIMEOUT_MS, withDbTimeout } from "./timeout";
import { log as defaultLog } from "../ops/logger";

/** B3: an open row this old with no saved run at all is finished as abandoned (one day past a save's life). */
export const ORPHAN_RUN_MS = SAVE_KEEP_MS + 24 * 3600 * 1000;

export type RunResultEnding = "wiped" | "extracted" | "lost" | "endless" | "abandoned";

/** What a run is at its first Start. */
export interface RunStartRow {
  readonly id: string;
  readonly district: string;
  readonly seed: number;
}

/** What the room knows at the run's end (`meta/runResult.ts › resultRow`). */
export interface RunEndRow extends RunStartRow {
  readonly waveReached: number;
  readonly ending: Exclude<RunResultEnding, "abandoned">;
  readonly endless: boolean;
  /** How long this night ran (B8: a lost start row is inserted with `started_at = now − this`). */
  readonly nightMs: number;
}

/** One seat of a finished run (`meta/runResult.ts › seatRow`). */
export interface RunSeatRow {
  /** The seat id (`playerId#gen`). */
  readonly seat: string;
  readonly accountId: string | null;
  readonly slot: number;
  readonly loadout: string;
  readonly wavesIn: number;
  readonly kills: number;
}

/** A finished run, as the stats read it. */
export interface StatsRun {
  readonly id: string;
  readonly endedAt: Date;
  readonly ending: RunResultEnding;
  readonly extracted: boolean;
  readonly waveReached: number;
  readonly playerCount: number;
}

/** A seat of a finished run, as the stats read it: `member` = the account now (merged guests mapped, B6), null deleted. */
export interface StatsSeat {
  readonly runId: string;
  readonly member: string | null;
  readonly loadout: string;
}

export interface RunResultsRepo {
  /** A fresh run started (an open row; a repeat does nothing). */
  start(row: RunStartRow): Promise<void>;
  /**
   * A resumed run started: +1 night on its open row (a lost row is inserted as a resumed one: 2 nights). Review L1:
   * `claimKey` (a random token per Start) counts once: a retry after a committed-but-errored attempt adds nothing.
   */
  resumed(row: RunStartRow, claimKey: string): Promise<void>;
  /** The run ended (B2, B4): true when THIS call finished it (its seat rows written), false when it was already finished. */
  finish(row: RunEndRow, seats: readonly RunSeatRow[]): Promise<boolean>;
  /** B3: finishes up to `batch` expired unresumed saves (and old orphan rows) as abandoned; returns how many runs. */
  expireAbandoned(batch: number): Promise<number>;
  /** The finished runs (`ended_at ≥ since` when given) and their seats. */
  statsRows(since: Date | null): Promise<{ runs: StatsRun[]; seats: StatsSeat[] }>;
}

type Log = Pick<typeof defaultLog, "warn">;

/**
 * The seats' accounts that exist, locked FOR KEY SHARE (LOCK ORDER 2) in `deleteAccount`'s own order (review L2): each
 * account before its merged guests (by the account they are merged into, then guests last, then id). In plain id order
 * a merged guest G < A would be locked before A while a delete of A holds A and then deletes G: a deadlock.
 */
async function knownAccounts(tx: Tx, seats: readonly RunSeatRow[]): Promise<Set<string>> {
  const ids = [...new Set(seats.map((s) => s.accountId).filter((a): a is string => isRunId(a)))];
  if (ids.length === 0) return new Set();
  const rows = await tx
    .select({ id: accounts.id })
    .from(accounts)
    .where(inArray(accounts.id, ids))
    .orderBy(sql`coalesce(${accounts.mergedInto}, ${accounts.id})`, sql`${accounts.mergedInto} is not null`, asc(accounts.id))
    .for("key share");
  return new Set(rows.map((r) => r.id));
}

const int = (v: unknown): number => (typeof v === "number" && Number.isFinite(v) ? Math.max(0, Math.floor(v)) : 0);

/** The guarded finish (B4, B8): the run row finished once, then its seats. */
async function finishIn(tx: Tx, values: typeof runResults.$inferInsert, seats: readonly RunSeatRow[], known: ReadonlySet<string>): Promise<boolean> {
  // The finish never moves `started_at` (night 1's) or `nights_played` (the resumes) of an open row.
  const set = { district: values.district, seed: values.seed, playerCount: values.playerCount, waveReached: values.waveReached, extracted: values.extracted, ending: values.ending, endless: values.endless, endedAt: values.endedAt };
  const won = await tx
    .insert(runResults)
    .values(values)
    .onConflictDoUpdate({ target: runResults.id, set, setWhere: isNull(runResults.endedAt) })
    .returning({ id: runResults.id });
  if (won.length === 0) return false;
  const rows = uniqueSeats(seats).map((s) => ({ runId: values.id, seat: s.seat.slice(0, 64), accountId: s.accountId !== null && known.has(s.accountId) ? s.accountId : null, slot: int(s.slot), loadout: s.loadout.slice(0, 200), wavesIn: int(s.wavesIn), kills: int(s.kills) }));
  if (rows.length > 0) await tx.insert(runResultPlayers).values(rows).onConflictDoNothing();
  return true;
}

/** One row per seat id (the first wins). */
const uniqueSeats = (seats: readonly RunSeatRow[]): RunSeatRow[] => seats.filter((s, i) => seats.findIndex((x) => x.seat === s.seat) === i);

/** The seats of a saved run's snapshot (through `migrateRunSave`, so an older save still reads), or null unreadable. */
export function savedSeats(snapshot: unknown): { seats: RunSeatRow[]; endless: boolean } | null {
  const m = migrateRunSave(snapshot);
  if (!m.ok) return null;
  const seats: RunSeatRow[] = [];
  for (const x of m.save.seats) {
    const p = (x.player ?? {}) as Record<string, unknown>;
    const bought = Array.isArray(p.weaponsBought) ? p.weaponsBought.filter((w): w is string => typeof w === "string") : [];
    seats.push({ seat: `${x.playerId}#${x.seatGen ?? 0}`, accountId: x.accountId, slot: int(x.slot), loadout: [...new Set(bought)].sort().join("+"), wavesIn: int(p.wavesIn) + int(p.endlessWavesIn), kills: int(p.kills) });
  }
  const run = (m.save.world as { run?: { endless?: unknown } }).run;
  return { seats, endless: run?.endless === true };
}

export function runResultsRepo(database: Database, timeoutMs = DB_TIMEOUT_MS, bounded: BoundedOptions = {}, log: Log = defaultLog): RunResultsRepo {
  const write = <T>(op: string, body: (tx: Tx) => Promise<T>): Promise<T> => boundedTransaction(database, op, body, bounded);
  return {
    start: async (r) => {
      if (!isRunId(r.id)) return;
      await write("runResults.start", (tx) => tx.insert(runResults).values({ id: r.id, district: r.district, seed: r.seed }).onConflictDoNothing());
    },
    resumed: async (r, claimKey) => {
      if (!isRunId(r.id)) return;
      await write("runResults.resumed", (tx) =>
        tx
          .insert(runResults)
          .values({ id: r.id, district: r.district, seed: r.seed, nightsPlayed: 2, lastResume: claimKey })
          .onConflictDoUpdate({ target: runResults.id, set: { nightsPlayed: sql`${runResults.nightsPlayed} + 1`, lastResume: claimKey }, setWhere: sql`${runResults.endedAt} is null and ${runResults.lastResume} is distinct from ${claimKey}` }),
      );
    },
    finish: async (r, seats) => {
      if (!isRunId(r.id)) return false;
      return write("runResults.finish", async (tx) => {
        const known = await knownAccounts(tx, seats);
        const values = {
          id: r.id,
          district: r.district,
          seed: r.seed,
          playerCount: uniqueSeats(seats).length, // review nit: the rows really written
          waveReached: int(r.waveReached),
          extracted: r.ending === "extracted",
          ending: r.ending,
          endless: r.endless,
          startedAt: sql`now() - ${`${int(r.nightMs)} milliseconds`}::interval`,
          endedAt: sql`now()`,
        } as unknown as typeof runResults.$inferInsert;
        return finishIn(tx, values, seats, known);
      });
    },
    expireAbandoned: async (batch) => {
      let done = 0;
      const db = await database.db();
      const expired = await withDbTimeout(
        "runResults.expiredSaves",
        () =>
          db
            .select({ id: savedRuns.id, district: savedRuns.district, seed: savedRuns.seed, wave: savedRuns.wave, snapshot: savedRuns.snapshot })
            .from(savedRuns)
            .where(and(eq(savedRuns.status, "saved"), lt(savedRuns.expiresAt, sql`now()`)))
            .orderBy(asc(savedRuns.expiresAt))
            .limit(batch),
        timeoutMs * 5,
      );
      for (const s of expired) {
        const read = savedSeats(s.snapshot);
        if (read === null) log.warn({ runId: s.id }, "run_result_unreadable_save");
        const seats = read?.seats ?? [];
        const finished = await write("runResults.expire", async (tx) => {
          const known = await knownAccounts(tx, seats);
          // LOCK ORDER 4: the save goes first (only while still an expired 'saved' row: a claim refuses it, B4).
          const gone = await tx
            .delete(savedRuns)
            .where(and(eq(savedRuns.id, s.id), eq(savedRuns.status, "saved"), lt(savedRuns.expiresAt, sql`now()`)))
            .returning({ expiresAt: savedRuns.expiresAt, createdAt: savedRuns.createdAt });
          const row = gone[0];
          if (!row) return false;
          const values = {
            id: s.id,
            district: s.district,
            seed: s.seed,
            playerCount: uniqueSeats(seats).length,
            waveReached: int(s.wave),
            extracted: false,
            ending: "abandoned",
            endless: read?.endless ?? false,
            startedAt: row.createdAt,
            endedAt: row.expiresAt ?? sql`now()`,
          } as unknown as typeof runResults.$inferInsert;
          // Review L3: counted only when THIS step finished it (the room may have won). The save is deleted either way: an
          // expired save of a run that is already finished is garbage nobody can resume.
          return finishIn(tx, values, seats, known);
        });
        if (finished) done++;
      }
      // B3: open rows this old with no saved run at all (a crash before any autosave, a lost room): no seats. Review L3:
      // at most `batch` per run (oldest first).
      const orphans = await write("runResults.expireOrphans", (tx) => {
        const old = and(isNull(runResults.endedAt), lt(runResults.startedAt, sql`now() - ${`${ORPHAN_RUN_MS} milliseconds`}::interval`), notExists(tx.select({ x: sql`1` }).from(savedRuns).where(eq(savedRuns.id, runResults.id))));
        const ids = tx.select({ id: runResults.id }).from(runResults).where(old).orderBy(asc(runResults.startedAt)).limit(batch);
        return tx
          .update(runResults)
          .set({ ending: "abandoned", endedAt: sql`now()`, extracted: false })
          .where(and(old, inArray(runResults.id, ids)))
          .returning({ id: runResults.id });
      });
      return done + orphans.length;
    },
    statsRows: (since) =>
      withDbTimeout(
        "runResults.statsRows",
        async () => {
          const db = await database.db();
          const when = since === null ? isNotNull(runResults.endedAt) : and(isNotNull(runResults.endedAt), gte(runResults.endedAt, since));
          const runs = await db
            .select({ id: runResults.id, endedAt: runResults.endedAt, ending: runResults.ending, extracted: runResults.extracted, waveReached: runResults.waveReached, playerCount: runResults.playerCount })
            .from(runResults)
            .where(when)
            .orderBy(asc(runResults.endedAt), asc(runResults.id));
          const seats = await db
            .select({ runId: runResultPlayers.runId, member: sql<string | null>`coalesce(${accounts.mergedInto}, ${runResultPlayers.accountId})`, loadout: runResultPlayers.loadout })
            .from(runResultPlayers)
            .innerJoin(runResults, eq(runResults.id, runResultPlayers.runId))
            .leftJoin(accounts, eq(accounts.id, runResultPlayers.accountId))
            .where(when)
            .orderBy(asc(runResultPlayers.runId), asc(runResultPlayers.seat));
          return { runs: runs.map((r) => ({ ...r, endedAt: r.endedAt as Date, ending: r.ending as RunResultEnding })), seats };
        },
        timeoutMs * 15,
      ),
  };
}
