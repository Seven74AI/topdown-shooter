/**
 * Story 10.6 (B5) contract, created here by Story 10.7 (10.6 not merged yet; same contract, keep-both at the merge): the
 * server's daily housekeeping. `runHousekeeping` runs each step in order, catches and logs a failing step alone
 * (`housekeeping_step_failed { step }`: the next step still runs) and logs one `housekeeping_done { <step>: count }`
 * line. `index.ts` (never `createGameServer`, so tests stay clean) starts it 5 min after boot, then every 24 h on an
 * `unref()`'d timer; `npm run housekeeping -w @topdown/server` runs it once by hand.
 */
import type { RunResultsRepo } from "../db/runResultsRepo";
import { log as defaultLog } from "./logger";

export const HOUSEKEEPING_FIRST_DELAY_MS = 5 * 60_000;
export const HOUSEKEEPING_INTERVAL_MS = 24 * 60 * 60_000;
/** Rows per statement / runs per step (a long step never holds a table). */
export const HOUSEKEEPING_BATCH = 1000;

export interface HousekeepingDeps {
  runResults: Pick<RunResultsRepo, "expireAbandoned">;
}

export interface HousekeepingStep {
  name: string;
  run: (deps: HousekeepingDeps) => Promise<number>;
}

type Log = Pick<typeof defaultLog, "info" | "error">;

/** The steps, in order. */
export const housekeepingSteps: readonly HousekeepingStep[] = [
  // Story 10.7 (AC 5, B3): saved runs that expired unresumed are finished as `abandoned` (with their saved seats) and
  // deleted; open rows past ORPHAN_RUN_MS with no save at all are finished with no seats.
  { name: "expireAbandonedRuns", run: (d) => d.runResults.expireAbandoned(HOUSEKEEPING_BATCH) },
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
