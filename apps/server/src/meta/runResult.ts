/**
 * Story 10.7 (AC 2, 7; B2, designer Q1 = C, Q4 = B): the run stats numbers, pure (unit-tested without a room). The room
 * builds a seat's row at the seat's bank (`RunBank`: a Leave, a remove, the run's end) from the same PlayerState the
 * bank reads, and the run's row at its end.
 */
import type { PlayerState, World } from "@topdown/shared";
import type { RunEndRow, RunSeatRow } from "../db/runResultsRepo";

/** Q1 = C: the weapons a seat bought, each once, sorted, joined by "+" ("" = none bought). Levels never matter. */
export function loadoutKey(bought: readonly string[] | undefined): string {
  if (!bought || bought.length === 0) return "";
  return [...new Set(bought)].sort().join("+");
}

/** The PlayerState fields a seat row reads. */
export type ResultPlayer = Pick<PlayerState, "wavesIn" | "endlessWavesIn" | "kills"> & { readonly weaponsBought?: readonly string[] };

/** A seat's row (copies only): waves in = main + endless waves, own kills (7.11), the bought weapons. */
export function seatRow(p: Readonly<ResultPlayer>, seat: string, slot: number, accountId: string | null): RunSeatRow {
  return { seat, accountId, slot, loadout: loadoutKey(p.weaponsBought), wavesIn: p.wavesIn + p.endlessWavesIn, kills: p.kills };
}

/**
 * The run's row at its end (B2). `left`: the run is over because the team left (all gone mid-wave, a quit) → `lost`
 * whatever the World says; otherwise the World's ending (`none` → `lost`).
 */
export function resultRow(world: Readonly<World>, run: { id: string; district: string; seed: number; nightMs: number }, waveReached: number, left: boolean): RunEndRow {
  const e = world.run.ending;
  const ending: RunEndRow["ending"] = left ? "lost" : e === "wiped" || e === "extracted" ? e : "lost";
  return { id: run.id, district: run.district, seed: run.seed, waveReached, ending, endless: world.run.endless, nightMs: Math.max(0, run.nightMs) };
}
