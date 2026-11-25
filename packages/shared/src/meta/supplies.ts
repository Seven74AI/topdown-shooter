import { PROGRESSION, type Progression } from "../config/progression";

/**
 * Story 7.2 (AC 2; S1, S4, S5, FR78): the Supplies one player banks for one run, from the server's run record
 * (`meta/runRecord.ts`, the four `PlayerState` counters) and how the run ended for them. Pure, integers only, every
 * number from `progression.json › supplies`. Only the server calls it to bank (S6); the client never sends an amount.
 *
 * - `waves`: every wave 1–10 the player was in × `perWave` (a loss pays too: S1; the wave a wipe falls in counts, D8);
 * - `boss`: the wave-10 Behemoth (at most one) × `behemoth`, kept on any ending;
 * - `extract`: `extract` only when the team extracted with the player in the run (a quitter never gets it: D2);
 * - `endless` / `endlessBoss`: endless waves × `perEndlessWave` and endless Behemoths × `endlessBehemoth`, ONLY on an
 *   extract (S4 "a bet": a wipe after Stay loses them, D5);
 * - `rookie`: lifetime Supplies before this run below `rookieLift.belowLifetime` → the whole run × `multiplier`
 *   (S5: the run that crosses the line is still doubled, D3).
 */
export type SuppliesEnding = "wiped" | "extracted" | "lost" | "quit";

/** The four counters of `PlayerState` the Supplies are paid from. */
export interface RunRecord {
  readonly wavesIn: number;
  readonly endlessWavesIn: number;
  readonly bossesIn: number;
  readonly endlessBossesIn: number;
}

export interface SuppliesLines {
  waves: number;
  boss: number;
  extract: number;
  endless: number;
  endlessBoss: number;
}

export interface RunSupplies extends SuppliesLines {
  rookie: boolean;
  total: number;
}

export type SuppliesConfig = Progression["supplies"];

const count = (n: number): number => (Number.isInteger(n) && n > 0 ? n : 0);

export function runSupplies(record: RunRecord, ending: SuppliesEnding, lifetimeBefore: number, cfg: SuppliesConfig = PROGRESSION.supplies): RunSupplies {
  const extracted = ending === "extracted";
  const endlessBosses = count(record.endlessBossesIn);
  const runBosses = Math.max(0, count(record.bossesIn) - endlessBosses);
  const waves = count(record.wavesIn) * cfg.perWave;
  const boss = Math.min(runBosses, 1) * cfg.behemoth;
  const extract = extracted ? cfg.extract : 0;
  const endless = extracted ? count(record.endlessWavesIn) * cfg.perEndlessWave : 0;
  const endlessBoss = extracted ? endlessBosses * cfg.endlessBehemoth : 0;
  const rookie = lifetimeBefore < cfg.rookieLift.belowLifetime;
  const total = (waves + boss + extract + endless + endlessBoss) * (rookie ? cfg.rookieLift.multiplier : 1);
  return { waves, boss, extract, endless, endlessBoss, rookie, total };
}

/** The ending a player banks with: the run's ending, or `quit` for a player who was not in the run when it ended. */
export function suppliesEnding(runEnding: "none" | "wiped" | "extracted" | "lost", inRunAtEnd: boolean): SuppliesEnding {
  if (!inRunAtEnd || runEnding === "none") return "quit";
  return runEnding;
}
