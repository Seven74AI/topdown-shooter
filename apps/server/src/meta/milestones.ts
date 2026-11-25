import { MILESTONES, milestonePartKey, type Milestone, type MilestoneId } from "@topdown/shared";

/**
 * Story 7.11 (AC 4, 10, M-F1–M-F4): which milestones a seat reached in a run — pure and table-driven
 * from `milestones.json`. The bank (Story 7.2's end-of-run transaction) calls it per seat with the
 * seat's run record and its lifetime stats AFTER this run's increment (AC 5), then grants the parts
 * the account doesn't own yet (`newMilestoneParts`). Nothing here reads the database.
 */
export interface MilestoneRun {
  /** Waves that ENDED while this seat was in the run (playing, downed, out or held all count: 7.2's rule, D1). */
  readonly wavesIn: ReadonlySet<number>;
  /** The Behemoth died while this seat was in the run (not only for the finisher, D1). */
  readonly bossKilledWhileIn: boolean;
  /** The team extracted while this seat was in the run, and from which district (7.7's id). */
  readonly extracted: boolean;
  readonly district: string;
  /** At the extract tick: exactly 4 players in the World, all standing (D5; a held seat breaks it). */
  readonly extractedAllFour: boolean;
  /** This seat's downs during waves 1–10 (D7: endless downs don't matter). */
  readonly downsWaves1to10: number;
}

/** Lifetime counters after this run's increment (`progress.stats`). */
export interface LifetimeStats {
  readonly revives: number;
  readonly kills: number;
  readonly barricades: number;
  readonly runs: number;
}

function reached(m: Milestone, run: MilestoneRun, stats: LifetimeStats): boolean {
  const r = m.rule;
  switch (r.kind) {
    case "wave_cleared":
      return run.wavesIn.has(r.n);
    case "extracted":
      return run.extracted && run.district === r.district;
    case "boss_killed":
      return run.bossKilledWhileIn;
    case "lifetime_revives":
      return stats.revives >= r.n;
    case "lifetime_kills":
      return stats.kills >= r.n;
    case "lifetime_barricades":
      return stats.barricades >= r.n;
    case "lifetime_runs":
      return stats.runs >= r.n;
    case "extracted_all_four":
      return run.extracted && run.extractedAllFour;
    case "wave10_never_downed": {
      for (let w = 1; w <= 10; w++) if (!run.wavesIn.has(w)) return false;
      return run.downsWaves1to10 === 0;
    }
  }
}

/** The milestones this run + these stats satisfy (owned or not), in m1…m10 order. */
export function milestonesReached(run: MilestoneRun, stats: LifetimeStats, list: readonly Milestone[] = MILESTONES): MilestoneId[] {
  return list.filter((m) => reached(m, run, stats)).map((m) => m.id);
}

/** M-F3: the part keys of `ids` the account doesn't own yet (granted once, never listed again). */
export function newMilestoneParts(ids: readonly MilestoneId[], owned: ReadonlySet<string>): { id: MilestoneId; key: string }[] {
  const out: { id: MilestoneId; key: string }[] = [];
  for (const id of ids) {
    const key = milestonePartKey(id);
    if (!owned.has(key)) out.push({ id, key });
  }
  return out;
}
