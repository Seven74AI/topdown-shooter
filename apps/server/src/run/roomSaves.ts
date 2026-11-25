/**
 * Stories 8.4–8.6: what the run room needs from the saved-runs side, set by `createGameServer` like 7.1's
 * `setRoomAccounts` (the room's static parts and tests reach it without room options), the per-room `SaveWriter`
 * (autosaves are never awaited by the tick: E8-S7) and the boot sweep (E8-S6).
 */
import type { SavedRunsRepo, SaveRow } from "../db/savedRunsRepo";
import { SAVE_KEEP_MS } from "../db/savedRunsRepo";

let current: SavedRunsRepo | null = null;

/** The saved-runs repository the rooms use (null = no database: saves are skipped and logged once per run). */
export function setRoomSaves(repo: SavedRunsRepo | null): void {
  current = repo;
}
export function roomSavesRepo(): SavedRunsRepo | null {
  return current;
}

export interface SaveLog {
  info(obj: object, msg: string): void;
  warn(obj: object, msg: string): void;
  error(obj: object, msg: string): void;
}

/** What an autosave hands the writer: the row and how it was taken (for the log line). */
export interface PendingSave {
  readonly row: SaveRow;
  readonly bytes: number;
  readonly kind: string;
}

/**
 * E8-S7: one write in flight per room; a newer autosave replaces a queued older one; final writes (Save and quit,
 * shutdown, mark/delete) queue behind it in order. Results are logged `run_saved {runId, bytes, ms, kind}` /
 * `run_save_failed`; nothing here is awaited by the tick (`idle()` is for shutdown and tests).
 */
export class SaveWriter {
  private queued: PendingSave | null = null;
  private scheduled = false;
  private chain: Promise<void> = Promise.resolve();

  constructor(
    private readonly repo: SavedRunsRepo,
    private readonly log: SaveLog,
    private readonly now: () => number = () => performance.now(),
  ) {}

  /** An autosave ('open'). Coalesces: while a write is in flight, only the newest queued one is written next. */
  autosave(save: PendingSave): void {
    this.queued = save;
    if (this.scheduled) return;
    this.scheduled = true;
    this.chain = this.chain.then(() => this.flushQueued());
  }

  private async flushQueued(): Promise<void> {
    this.scheduled = false;
    const s = this.queued;
    this.queued = null;
    if (!s) return;
    const t0 = this.now();
    try {
      const ok = await this.repo.upsertOpen(s.row);
      if (ok) this.log.info({ runId: s.row.id, bytes: s.bytes, ms: Math.round((this.now() - t0) * 10) / 10, kind: s.kind, wave: s.row.wave }, "run_saved");
      else this.log.warn({ runId: s.row.id, kind: s.kind, why: "not_holder" }, "run_save_failed");
    } catch {
      this.log.error({ runId: s.row.id, kind: s.kind, why: "db" }, "run_save_failed");
    }
  }

  /** A final write, after every earlier one (a queued autosave first). Resolves with its result; never rejects. */
  after<T>(op: () => Promise<T>): Promise<{ ok: true; value: T } | { ok: false }> {
    const p = this.chain
      .then(() => this.flushQueued())
      .then(async () => {
        try {
          return { ok: true as const, value: await op() };
        } catch {
          return { ok: false as const };
        }
      });
    this.chain = p.then(() => undefined);
    return p;
  }

  /** Every write so far has settled. */
  idle(): Promise<void> {
    return this.chain;
  }
}

/** A resumable save's expiry from now (D13: 7 days). */
export const saveExpiry = (nowMs = Date.now()): Date => new Date(nowMs + SAVE_KEEP_MS);

/**
 * E8-S6: at server start, every save still 'open' (a process that died without a clean stop) becomes resumable — its
 * last autosave is the save. `onReleased` (banking: E8-S4) runs for each, best effort. Logged `saved_runs_released`.
 */
export async function releaseSavesOnBoot(repo: SavedRunsRepo | null, log: SaveLog, onReleased?: (id: string, snapshot: Record<string, unknown>) => Promise<unknown>): Promise<number> {
  if (!repo) return 0;
  try {
    const rows = await repo.releaseOpenOnBoot(saveExpiry());
    log.info({ count: rows.length }, "saved_runs_released");
    // The top-ups run in the background (a slow bank never delays the server's start).
    if (onReleased) void rows.reduce<Promise<unknown>>((p, r) => p.then(() => onReleased(r.id, r.snapshot)).catch(() => undefined), Promise.resolve());
    return rows.length;
  } catch {
    log.error({ why: "db" }, "saved_runs_release_failed");
    return 0;
  }
}
