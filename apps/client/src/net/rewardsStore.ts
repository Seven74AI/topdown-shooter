import { runRewardsSchema, runStartedSchema, type RunRewards } from "@topdown/shared";

/**
 * Story 7.2 (AC 5, 6): this phone's `run.rewards` (server truth: the client never computes or sends an amount, S6).
 *
 * - `receive` keeps the latest message (from the RunInbox, or the Leave path). It may arrive before or after the
 *   Results patch: the Results screen reads the store, and shows a message only when its `seed` matches the Results
 *   table's run seed (a late message of an earlier run never shows on a newer Results).
 * - Decision 7.2 D4: a player who Leaves mid-run sees "+40 Supplies banked from your last run" once on the start
 *   screen: `rememberLeave` keeps the result in localStorage (try/catch: private windows and blocked storage just
 *   show nothing), `takeLeaveLine` returns the line once and forgets it.
 */
export const LAST_BANK_KEY = "tds.lastBank";

type Listener = (m: RunRewards | null) => void;

export interface KeyValueStore {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
  removeItem(key: string): void;
}

const browserStorage = (): KeyValueStore | null => {
  try {
    return globalThis.localStorage ?? null;
  } catch {
    return null;
  }
};

export class RewardsStore {
  private latest: RunRewards | null = null;
  /** Re-review RR-L1 (B18 amended): the current run's id from `run.started`; only its `run.rewards` are accepted. */
  private runId: string | null = null;
  private readonly listeners = new Set<Listener>();

  constructor(private readonly storage: () => KeyValueStore | null = browserStorage) {}

  /** Story 10.12 review L5: the current online run's id (`run.started`), or null before one; the cheat panel keys its online state by it. */
  get currentRunId(): string | null {
    return this.runId;
  }

  get(): RunRewards | null {
    return this.latest;
  }

  /** The rewards of the run with this seed, or null (not arrived yet: "Saving…"). */
  forSeed(seed: number): RunRewards | null {
    return this.latest !== null && this.latest.seed === seed ? this.latest : null;
  }

  /**
   * A `run.rewards` payload (unknown: validated here; garbage is ignored). Returns the parsed message or null.
   * `leave`: the answer to this phone's own Leave (D4): kept for the start screen BEFORE the listeners hear of it.
   */
  receive(raw: unknown, leave = false): RunRewards | null {
    const parsed = runRewardsSchema.safeParse(raw);
    if (!parsed.success) return null;
    if (leave) this.rememberLeave(parsed.data); // N-RR2-2: kept for the start screen even if the phone already joined a new run
    if (parsed.data.runId !== this.runId) return null; // another run's (late) message, or before run.started
    this.latest = parsed.data;
    for (const l of this.listeners) l(this.latest);
    return this.latest;
  }

  /**
   * Re-review RR-L1 (B18 amended): `run.started { runId }` — this run is now the only one whose rewards are accepted.
   * A new run id forgets the previous run's rewards ("Saving…" again on its Results); the same id (a rejoin) keeps them.
   */
  setRun(raw: unknown): void {
    const parsed = runStartedSchema.safeParse(raw);
    if (!parsed.success || parsed.data.runId === this.runId) return;
    this.runId = parsed.data.runId;
    this.latest = null;
    for (const l of this.listeners) l(null);
  }

  subscribe(l: Listener): () => void {
    this.listeners.add(l);
    return () => {
      this.listeners.delete(l);
    };
  }

  /** D4: a Leave's bank result, for the start screen's one-time line (only a saved bank with Supplies in it). */
  rememberLeave(m: RunRewards): void {
    if (m.status !== "saved" || m.total <= 0) return;
    try {
      this.storage()?.setItem(LAST_BANK_KEY, JSON.stringify({ runId: m.runId, total: m.total }));
    } catch {
      /* storage blocked: nothing to show later */
    }
  }

  /** D4: "+40 Supplies banked from your last run" once, then forgotten; null when there is none. */
  takeLeaveLine(): string | null {
    try {
      const s = this.storage();
      const raw = s?.getItem(LAST_BANK_KEY);
      if (!s || !raw) return null;
      s.removeItem(LAST_BANK_KEY);
      const v = JSON.parse(raw) as { total?: unknown };
      const total = typeof v.total === "number" && Number.isInteger(v.total) && v.total > 0 ? v.total : 0;
      return total > 0 ? `+${formatSupplies(total)} Supplies banked from your last run` : null;
    } catch {
      return null;
    }
  }
}

/** "1,240" (en-US grouping, the Results look). */
export function formatSupplies(n: number): string {
  return Math.max(0, Math.floor(n)).toLocaleString("en-US");
}

export const rewardsStore = new RewardsStore();
