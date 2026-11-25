/**
 * Story 7.5 (AC 1, 4; designer D6; decisions 7.5 D1, D2, D4): what a player's Training levels do in a run. Pure;
 * every number comes from `progression.json › training` (part of `balanceVersion`, decision 7.5 D3).
 *
 * Training ALWAYS applies in full and only to its owner (D6): every helper takes ONE player's own level, never a team
 * value. Levels are set once when the survivor is created (`addPlayer`) and never change in a run.
 */
import type { Balance } from "../config/balance";
import { PROGRESSION, TRAINING_BOOSTS, type Training, type TrainingBoostId } from "../config/progression";
import { ticksFor } from "../core/time";

/** The four levels a survivor starts a run with (`addPlayer` options; default all 0). */
export interface TrainingLevels {
  readonly maxHp: number;
  readonly damage: number;
  readonly startMoney: number;
  readonly reload: number;
}

export const NO_TRAINING: TrainingLevels = Object.freeze({ maxHp: 0, damage: 0, startMoney: 0, reload: 0 });

/** The training data (the bundled `progression.json` by default). */
const T = (): Readonly<Training> => PROGRESSION.training;

const boost = (id: TrainingBoostId, t: Readonly<Training> = T()) => t.boosts[TRAINING_BOOSTS.indexOf(id)] as Training["boosts"][number];

/** A level clamped to 0..maxLevel (a bad saved value never gives more than the cap). */
export function clampLevel(level: unknown, t: Readonly<Training> = T()): number {
  const n = typeof level === "number" && Number.isFinite(level) ? Math.floor(level) : 0;
  return Math.max(0, Math.min(t.maxLevel, n));
}

/** `progress.training` (jsonb `{ max_hp: 0..5, … }`, absent = 0) → the run-start levels (clamped). */
export function levelsFromProgress(training: Readonly<Record<string, unknown>> | null | undefined): TrainingLevels {
  if (!training) return NO_TRAINING;
  return {
    maxHp: clampLevel(training.max_hp),
    damage: clampLevel(training.damage),
    startMoney: clampLevel(training.start_money),
    reload: clampLevel(training.reload),
  };
}

/** Level of one boost in `progress.training` (absent or bad = 0). */
export function levelOf(training: Readonly<Record<string, unknown>> | null | undefined, id: TrainingBoostId): number {
  return clampLevel(training?.[id]);
}

/** Decision 7.5 D1: base `player.json › maxHp` × (1 + 2 % × L), rounded (100 → 102 … 110). Armor adds on top. */
export function trainedMaxHp(balance: Balance, level: number): number {
  return Math.round(balance.player.maxHp * (1 + ((boost("max_hp").pctPerLevel as number) * clampLevel(level)) / 100));
}

/** Start money: `economy.json › startingWallet` + 10 × L (200 → 250). */
export function trainedStartMoney(balance: Balance, level: number): number {
  return balance.economy.startingWallet + (boost("start_money").perLevel as number) * clampLevel(level);
}

/** Decision 7.5 D2: the multiplier on the player's OWN weapon damage (1 + 1 % × L). */
export function damageMul(level: number): number {
  return 1 + ((boost("damage").pctPerLevel as number) * clampLevel(level)) / 100;
}

/** The reload time in seconds after Training: `reloadS × (1 − 1 % × L)`. */
export function trainedReloadS(reloadS: number, level: number): number {
  return reloadS * (1 - ((boost("reload").pctPerLevel as number) * clampLevel(level)) / 100);
}

/** Decision 7.5 D4: the reload in whole ticks (`ticksFor` rounds; short reloads change only from level 2–3). */
export function reloadTicksFor(reloadS: number, level: number): number {
  return ticksFor(trainedReloadS(reloadS, level));
}

/** Story 7.5 (T3): the Supplies price of level `level` (1..maxLevel): `costPerLevel × level`. */
export function trainingCost(level: number, t: Readonly<Training> = T()): number {
  return t.costPerLevel * level;
}

/** Percent (or amount) a boost gives at `level`: "Now: +6 % max HP". */
export function boostValue(id: TrainingBoostId, level: number): number {
  const b = boost(id);
  return (b.pctPerLevel ?? b.perLevel ?? 0) * clampLevel(level);
}
