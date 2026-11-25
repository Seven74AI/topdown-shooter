/**
 * Story 7.2 (AC 3, 4, 8; S3, S6, brief 18 + 20): banking a run's Supplies, server only.
 *
 * One `RunBank` per run (made at Start: `runId` is a fresh UUID). The room calls it from exactly two places:
 * - `bankRunEnd` from `RunRoom.endRun` (ONE call): every seat with a `PlayerState` — members in the World or held
 *   (8.1) bank with the run's ending (`extracted` only if they were there at `run.extracted`, AC 3), remembered seats
 *   (a hold that ran out, 8.1 F8) bank `quit`;
 * - `bank` from a consented Leave mid-run (`run.leave` or `onLeave` code 4000, before the state leaves the World):
 *   ending `quit` (S3, D2: never the extract bonus).
 *
 * Each seat banks at most once per run (a second call returns the first result and delivers it again), and the
 * database makes that true across rooms and retries too: `progressRepo.addSupplies` is one transaction keyed by
 * (run_id, account_id). A seat without an account (or with no database) gets `not_saved` at once. A failed write is
 * logged `supplies_bank_failed` (with the full breakdown, so it can be granted by hand), retried once after
 * `retryMs`; a second failure is logged again and the player sees "Couldn't save this run" (no third try).
 *
 * Nothing here is awaited by the tick (7.1 AC 9): the room fires and forgets; results arrive through `deliver`.
 */
import { randomUUID } from "node:crypto";
import type { RunRewards, RunRewardsStatus } from "@topdown/shared";
import { runSupplies, suppliesEnding, type RunEnding, type RunRecord, type RunSupplies, type SuppliesEnding, type World } from "@topdown/shared";
import type { ProgressRepo } from "../db/progressRepo";

/** Review M1: what every `supplies_bank_failed` line tells the person who grants a run by hand. */
export const HAND_GRANT_NOTE = "before a hand grant, check run_rewards (run_id, account_id): a row means it was banked";

/** AC 4: the one retry waits this long. */
export const BANK_RETRY_MS = 2000;

export interface BankSeat {
  readonly playerId: string;
  readonly accountId: string | null;
  readonly record: RunRecord;
  readonly ending: SuppliesEnding;
  /** Review L4: the wave a Leave banked in (shown as "Banked when you left (wave N)" if the seat comes back). */
  readonly wave?: number;
}

export interface RunBankDeps {
  /** The progress repository, or null (no database: everyone is `not_saved`). */
  repo(): ProgressRepo | null;
  log: { info(obj: object, msg: string): void; error(obj: object, msg: string): void };
  /** Sends `run.rewards` to the seat's owner if connected (the room looks the client up by player id). */
  deliver(playerId: string, msg: RunRewards): void;
  retryMs?: number;
  nowMs?(): number;
}

/** What `run_rewards.breakdown` keeps: the payout, the ending and the record it came from (hand grants, later stories). */
interface Breakdown extends RunSupplies {
  ending: SuppliesEnding;
  leftWave: number;
  waveCount: number;
  endlessWaveCount: number;
  record: RunRecord;
}

const copyRecord = (r: RunRecord): RunRecord => ({ wavesIn: r.wavesIn, endlessWavesIn: r.endlessWavesIn, bossesIn: r.bossesIn, endlessBossesIn: r.endlessBossesIn });

function message(runId: string, seed: number, status: RunRewardsStatus, b: Omit<Breakdown, "record">, newTotal: number): RunRewards {
  return {
    ending: b.ending,
    leftWave: b.leftWave,
    runId,
    seed,
    status,
    lines: { waves: b.waves, boss: b.boss, extract: b.extract, endless: b.endless, endlessBoss: b.endlessBoss },
    waveCount: b.waveCount,
    endlessWaveCount: b.endlessWaveCount,
    rookie: b.rookie,
    total: status === "saved" ? b.total : 0,
    newTotal: status === "saved" ? newTotal : 0,
  };
}

/** A stored breakdown read back (an earlier bank of the same run): numbers only, anything missing is 0. */
function storedBreakdown(raw: Record<string, unknown>, supplies: number): Omit<Breakdown, "record"> {
  const n = (k: string): number => (typeof raw[k] === "number" && Number.isInteger(raw[k]) && (raw[k] as number) >= 0 ? (raw[k] as number) : 0);
  return {
    waves: n("waves"),
    boss: n("boss"),
    extract: n("extract"),
    endless: n("endless"),
    endlessBoss: n("endlessBoss"),
    rookie: raw.rookie === true,
    total: supplies,
    waveCount: n("waveCount"),
    endlessWaveCount: n("endlessWaveCount"),
    ending: (["wiped", "extracted", "lost", "quit"] as const).find((e) => e === raw.ending) ?? "quit",
    leftWave: n("leftWave"),
  };
}

export class RunBank {
  readonly runId: string = randomUUID();
  /** By player id: each seat banks once per run. */
  private readonly banks = new Map<string, Promise<RunRewards>>();
  /** By player id: the settled result (re-sent to a seat that comes back on Results). */
  private readonly done = new Map<string, RunRewards>();

  constructor(
    readonly seed: number,
    private readonly deps: RunBankDeps,
  ) {}

  /** This seat's settled result, if any (a reconnect on Results gets it again). */
  resultFor(playerId: string): RunRewards | undefined {
    return this.done.get(playerId);
  }

  /** Whether this seat has started banking this run. */
  has(playerId: string): boolean {
    return this.banks.has(playerId);
  }

  /** Banks one seat (once per run; a repeat delivers the first result again). Never rejects. */
  bank(seat: BankSeat): Promise<RunRewards> {
    const earlier = this.banks.get(seat.playerId);
    if (earlier) {
      void earlier.then((m) => this.deps.deliver(seat.playerId, m));
      return earlier;
    }
    const p = this.run(seat).then((m) => {
      this.done.set(seat.playerId, m);
      this.deps.deliver(seat.playerId, m);
      return m;
    });
    this.banks.set(seat.playerId, p);
    return p;
  }

  /**
   * AC 3, 4: the run ended. Seats in the World or held bank with the run's ending; remembered seats bank `quit`.
   * Logs `run_supplies {runId, supplies, rookie, status}` per player once every bank settled (AC 8).
   */
  bankRunEnd(
    world: Readonly<World>,
    members: Iterable<{ readonly playerId: string; readonly accountId: string | null }>,
    remembered: Iterable<{ readonly playerId: string; readonly accountId: string | null; readonly player: RunRecord }>,
  ): Promise<RunRewards[]> {
    const ending: RunEnding = world.run.ending;
    const all: Promise<RunRewards>[] = [];
    const ids: string[] = [];
    for (const m of members) {
      const p = world.players.get(m.playerId) ?? world.heldPlayers.get(m.playerId)?.player;
      if (!p) continue;
      ids.push(m.playerId);
      all.push(this.bank({ playerId: m.playerId, accountId: m.accountId, record: copyRecord(p), ending: suppliesEnding(ending, true) }));
    }
    for (const s of remembered) {
      ids.push(s.playerId);
      all.push(this.bank({ playerId: s.playerId, accountId: s.accountId, record: copyRecord(s.player), ending: "quit" }));
    }
    return Promise.all(all).then((results) => {
      const supplies: Record<string, number> = {};
      const rookie: Record<string, boolean> = {};
      const status: Record<string, RunRewardsStatus> = {};
      results.forEach((r, i) => {
        const id = ids[i] as string;
        supplies[id] = r.total;
        rookie[id] = r.rookie;
        status[id] = r.status;
      });
      this.deps.log.info({ runId: this.runId, supplies, rookie, status }, "run_supplies");
      return results;
    });
  }

  private async run(seat: BankSeat): Promise<RunRewards> {
    const record = copyRecord(seat.record);
    const leftWave = seat.ending === "quit" ? Math.max(0, Math.floor(seat.wave ?? 0)) : 0;
    const repo = this.deps.repo();
    if (seat.accountId === null || repo === null) {
      const est = runSupplies(record, seat.ending, Number.POSITIVE_INFINITY); // no rookie guess: the lifetime is unknown
      return message(this.runId, this.seed, "not_saved", { ...est, waveCount: record.wavesIn, endlessWaveCount: record.endlessWavesIn, ending: seat.ending, leftWave }, 0);
    }
    const accountId = seat.accountId;
    const now = this.deps.nowMs ?? (() => performance.now());
    const pay = (lifetimeBefore: number) => {
      const s = runSupplies(record, seat.ending, lifetimeBefore);
      const breakdown: Breakdown = { ...s, ending: seat.ending, leftWave, waveCount: record.wavesIn, endlessWaveCount: record.endlessWavesIn, record };
      return { supplies: s.total, breakdown: breakdown as unknown as Record<string, unknown> };
    };
    for (let attempt = 1; attempt <= 2; attempt++) {
      const t0 = now();
      try {
        const r = await repo.addSupplies(this.runId, accountId, pay);
        const b = storedBreakdown(r.breakdown, r.supplies);
        this.deps.log.info({ runId: this.runId, accountId, total: r.supplies, ms: Math.round((now() - t0) * 10) / 10, already: !r.banked }, "supplies_banked");
        const m = message(this.runId, this.seed, "saved", b, r.newTotal);
        return r.nudge ? { ...m, nudge: true } : m; // Story 7.6 (AC 10): the one-time "Save my progress" line
      } catch (e) {
        const err = e instanceof Error ? e.message.slice(0, 200) : String(e).slice(0, 200);
        // Review M1: a failed bank never commits later (progressRepo bounds it inside PostgreSQL); still, a hand grant
        // checks run_rewards first (docs/deploy.md › Database).
        this.deps.log.error({ runId: this.runId, accountId, err, attempt, ending: seat.ending, record, handGrant: HAND_GRANT_NOTE }, "supplies_bank_failed");
        if (attempt === 1) await new Promise((r) => setTimeout(r, this.deps.retryMs ?? BANK_RETRY_MS));
      }
    }
    const est = runSupplies(record, seat.ending, Number.POSITIVE_INFINITY);
    return message(this.runId, this.seed, "failed", { ...est, waveCount: record.wavesIn, endlessWaveCount: record.endlessWavesIn, ending: seat.ending, leftWave }, 0);
  }
}
