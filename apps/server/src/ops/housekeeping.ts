/**
 * Story 10.6 (B5): the server's daily housekeeping. `runHousekeeping` runs each step in order, catches and logs a
 * failing step alone (`housekeeping_step_failed { step }`: the next step still runs) and logs one
 * `housekeeping_done { <step>: count }` line. `index.ts` (never `createGameServer`, so tests stay clean) starts it 5 min
 * after boot, then every 24 h on an `unref()`'d timer; `npm run housekeeping -w @topdown/server` runs it once by hand.
 *
 * Story 10.7 adds its own step to `housekeepingSteps`.
 */
import { REPORT_KEEP_DAYS } from "@topdown/shared";
import type { ReportsRepo } from "../db/reportsRepo";
import { log as defaultLog } from "./logger";

export const HOUSEKEEPING_FIRST_DELAY_MS = 5 * 60_000;
export const HOUSEKEEPING_INTERVAL_MS = 24 * 60 * 60_000;
/** Rows per delete statement (a long delete never holds the table). */
export const HOUSEKEEPING_BATCH = 1000;

export interface HousekeepingDeps {
  reports: Pick<ReportsRepo, "deleteOlderThan">;
}

export interface HousekeepingStep {
  name: string;
  run: (deps: HousekeepingDeps) => Promise<number>;
}

type Log = Pick<typeof defaultLog, "info" | "error">;

/** The steps, in order. */
export const housekeepingSteps: readonly HousekeepingStep[] = [
  // Step 1 (Story 10.6, AC 6): problem reports are kept 30 days.
  { name: "problemReports", run: (d) => d.reports.deleteOlderThan(REPORT_KEEP_DAYS, HOUSEKEEPING_BATCH) },
];

/** Runs every step once; resolves with the counts (a failed step is absent). Never throws. */
export async function runHousekeeping(deps: HousekeepingDeps, steps: readonly HousekeepingStep[] = housekeepingSteps, log: Log = defaultLog): Promise<Record<string, number>> {
  const done: Record<string, number> = {};
  for (const step of steps) {
    try {
      done[step.name] = await step.run(deps);
    } catch (e) {
      log.error({ step: step.name, err: e instanceof Error ? e.message : String(e) }, "housekeeping_step_failed");
    }
  }
  log.info(done, "housekeeping_done");
  return done;
}

/** Starts the schedule (first run after 5 min, then every 24 h); returns the stop function (shutdown). */
export function startHousekeeping(deps: HousekeepingDeps, opts: { firstDelayMs?: number; intervalMs?: number } = {}): () => void {
  let interval: ReturnType<typeof setInterval> | null = null;
  const first = setTimeout(() => {
    void runHousekeeping(deps);
    interval = setInterval(() => void runHousekeeping(deps), opts.intervalMs ?? HOUSEKEEPING_INTERVAL_MS);
    interval.unref();
  }, opts.firstDelayMs ?? HOUSEKEEPING_FIRST_DELAY_MS);
  first.unref();
  return () => {
    clearTimeout(first);
    if (interval) clearInterval(interval);
  };
}
