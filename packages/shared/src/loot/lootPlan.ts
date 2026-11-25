import type { Balance } from "../config/balance";
import type { Rng } from "../core/rng";

/**
 * Story 7.12 (AC 1–2, B1, B2): the run's loot plan, made once at run start from the salted `loot`
 * stream, in this order: `has = next() < runChance`; if `has`: `wave` uniform in
 * `firstWave`–`lastWave`, `killFrac` and `itemRoll` uniform in [0, 1), then the bag's look
 * (`variant`, 7-UI-6: one of `variants`, never the previous run's look when the server knows it).
 * The rate doesn't depend on zombies or players; never past `waves.runWaves` (endless has none).
 * World state (`world.loot.plan`), never sent to clients.
 */
export interface LootPlan {
  has: boolean;
  /** The wave the bag drops in (0: none). */
  wave: number;
  /** The share of that wave's kills at which it drops: kill `1 + floor(killFrac × size)`. */
  killFrac: number;
  /** The server's item pick from the finder's unowned loot parts (T5; the World never reads it). */
  itemRoll: number;
  /** The bag's look (0–variants−1; LB4, LB5, LB6, LB7, LB8). */
  variant: number;
}

export function emptyLootPlan(): LootPlan {
  return { has: false, wave: 0, killFrac: 0, itemRoll: 0, variant: 0 };
}

/**
 * 7-UI-6 "never the same twice in a row": a look other than `prev` (−1: any), uniform over the rest.
 */
export function pickLootVariant(rng: Rng, variants: number, prev: number): number {
  if (variants <= 1) return 0;
  if (prev < 0 || prev >= variants) return rng.int(0, variants - 1);
  const v = rng.int(0, variants - 2);
  return v >= prev ? v + 1 : v;
}

/** Fills `out` with the run's plan (draws only from `rng`, the `loot` stream). */
export function makeLootPlan(rng: Rng, balance: Balance, prevVariant: number, out: LootPlan = emptyLootPlan()): LootPlan {
  const l = balance.loot;
  out.has = rng.next() < l.runChance;
  if (!out.has) {
    out.wave = 0;
    out.killFrac = 0;
    out.itemRoll = 0;
    out.variant = 0;
    return out;
  }
  // B1: never an endless wave, also with a shorter run (tests' `runWaves` overrides)
  out.wave = rng.int(Math.min(l.firstWave, balance.waves.runWaves), Math.min(l.lastWave, balance.waves.runWaves));
  out.killFrac = rng.next();
  out.itemRoll = rng.next();
  out.variant = pickLootVariant(rng, l.variants, prevVariant);
  return out;
}

/** The kill that drops the bag in a wave of `size` zombies (1-based; AC 3). */
export function lootKillIndex(killFrac: number, size: number): number {
  return 1 + Math.floor(killFrac * Math.max(0, size));
}
