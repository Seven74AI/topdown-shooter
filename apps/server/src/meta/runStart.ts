/**
 * Stories 7.4 (AC 2, K8; decision 7.4 D3) and 7.5 (AC 6, T5): the run-start progress read, written once for both.
 * When the host taps Start, every member's progress is read IN PARALLEL (each `progressRepo.get` has its own 2 s
 * timeout, `db/timeout.ts`) and turned into the values the run starts with: the unlock mask (`unlockMask`) and the
 * Training levels (`levelsFromProgress`). A member with no account, no progress row or a failed / slow read gets the
 * starter pool and Training 0, and the run still starts (decision 7.4 D3). Nothing here runs in the tick.
 *
 * Read at Start, not at join: an unlock or a Training level bought in the lobby counts for this run (K8, T5); one
 * bought during the run (a second device) counts from the next Start.
 */
import { NO_TRAINING, PROGRESSION, STARTER_ONLY, levelsFromProgress, unlockMask, type TrainingLevels } from "@topdown/shared";
import type { ProgressRepo } from "../db/progressRepo";
import { DB_TIMEOUT_MS } from "../db/timeout";

/** One member as the run starts with it (Notes for the merge: the one type 7.4 and 7.5 share). */
export interface RunPlayerInit {
  readonly playerId: string;
  readonly slot: number;
  readonly unlocks: number;
  readonly training: TrainingLevels;
  /** How the values were found (logged in `run_started`). */
  readonly source: "progress" | "no_account" | "no_row" | "read_failed";
}

export interface RunStartMember {
  readonly playerId: string;
  readonly slot: number;
  readonly accountId: string | null;
}

const starter = (m: RunStartMember, source: RunPlayerInit["source"]): RunPlayerInit => ({ playerId: m.playerId, slot: m.slot, unlocks: STARTER_ONLY, training: NO_TRAINING, source });

/**
 * Reads every member's progress (parallel, bounded by `timeoutMs` overall as a second guard beside the repository's
 * own timeout) and never throws. `repo` null (no database) → everyone starter.
 */
export async function loadRunInits(members: readonly RunStartMember[], repo: ProgressRepo | null, timeoutMs = DB_TIMEOUT_MS): Promise<RunPlayerInit[]> {
  return Promise.all(
    members.map(async (m): Promise<RunPlayerInit> => {
      if (m.accountId === null) return starter(m, "no_account");
      if (repo === null) return starter(m, "read_failed");
      let timer: ReturnType<typeof setTimeout> | undefined;
      try {
        const row = await Promise.race([
          repo.get(m.accountId),
          new Promise<"timeout">((resolve) => {
            timer = setTimeout(() => resolve("timeout"), timeoutMs + 50);
          }),
        ]);
        if (row === "timeout") return starter(m, "read_failed");
        if (row === null) return starter(m, "no_row");
        return { playerId: m.playerId, slot: m.slot, unlocks: unlockMask(PROGRESSION, row.unlocks), training: levelsFromProgress(row.training), source: "progress" };
      } catch {
        return starter(m, "read_failed"); // logged as db_error by the repository
      } finally {
        if (timer !== undefined) clearTimeout(timer);
      }
    }),
  );
}

/**
 * Story 7.4 (AC 10): `DEV_UNLOCKS=all|starter` (dev only; production ignores it) replaces every member's mask;
 * `DEV_SHOP_ALL` implies all. Returns the mask to force, or null (the real masks).
 */
export function pickDevUnlocks(env: { readonly NODE_ENV?: string | undefined; readonly DEV_UNLOCKS?: string | undefined }, shopAll: boolean): {
  readonly mask: number | null;
  readonly ignored: null | "production" | "bad_value";
} {
  const raw = env.DEV_UNLOCKS?.trim();
  if (!raw && !shopAll) return { mask: null, ignored: null };
  if (env.NODE_ENV === "production") return { mask: null, ignored: raw ? "production" : null };
  if (shopAll || raw === "all") return { mask: 0xffffffff >>> 0, ignored: null };
  if (raw === "starter") return { mask: STARTER_ONLY, ignored: null };
  return { mask: null, ignored: "bad_value" };
}
