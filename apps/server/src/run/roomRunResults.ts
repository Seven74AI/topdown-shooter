/**
 * Story 10.7 (B1, B8): the run stats repository the rooms use, set by `createGameServer` like `setRoomSaves` (null = no
 * database: nothing is recorded, B7), and the room's fire-and-forget write: one retry after `BANK_RETRY_MS`, then
 * `run_result_failed { runId, op, why }` (no names). Never awaited by a tick.
 */
import type { RunResultsRepo } from "../db/runResultsRepo";
import { dbErrText } from "../db/timeout";
import { BANK_RETRY_MS } from "../meta/banking";

let current: RunResultsRepo | null = null;

export function setRoomRunResults(repo: RunResultsRepo | null): void {
  current = repo;
}
export function roomRunResults(): RunResultsRepo | null {
  return current;
}

/**
 * Runs `write` (twice at most) once `after` (the run's earlier write) settled; never rejects. Resolves once it settled
 * (tests await it).
 */
export async function recordRunResult(runId: string, op: string, write: (repo: RunResultsRepo) => Promise<unknown>, log: { error(obj: object, msg: string): void }, retryMs = BANK_RETRY_MS, after: Promise<void> = Promise.resolve()): Promise<void> {
  const repo = current;
  if (!repo) return;
  await after;
  for (let attempt = 1; attempt <= 2; attempt++) {
    try {
      await write(repo);
      return;
    } catch (e) {
      if (attempt === 2) log.error({ runId, op, why: dbErrText(e) }, "run_result_failed");
      else await new Promise((r) => setTimeout(r, retryMs));
    }
  }
}
