import type { Balance } from "../config/balance";
import { MIN_AIM_LEN } from "../config/constants";
import type { PlayerInput } from "../net/input";
import { activeSlot } from "../combat/loadout";
import type { PlayerState } from "./player";

/**
 * Movement slows (Story 3.9, FR22: a Crawler bite slows 30 % for 1 s). The state is two integers
 * on the player, `slowTicksLeft` and `slowPct`; both go on the wire so the client's prediction
 * moves at exactly the server's speed (`movePlayers` runs on both sides).
 *
 * - A new slow refreshes the remaining time and never stacks: `max(left, ticks)` and the stronger
 *   percent while one is active (one Crawler bite after another stays 30 % for 1 s).
 * - `movePlayers` uses `playerSpeed` for a tick, then `tickSlow` counts it down: a slow set in the
 *   zombie system of tick T slows exactly the `ticks` movement ticks T+1 … T+ticks.
 */
export function slowPlayer(p: PlayerState, pct: number, ticks: number): void {
  if (pct <= 0 || ticks <= 0) return;
  const activePct = p.slowTicksLeft > 0 ? p.slowPct : 0;
  p.slowPct = Math.max(activePct, pct);
  p.slowTicksLeft = Math.max(p.slowTicksLeft, ticks);
}

/**
 * Story 5.2 (F5): the wielder slow this tick, in integer percent: the active weapon's
 * `wielderSlowPct` (the Chainsaw's 20) while attacking with it (alive, not swapping, fire held with
 * an aim of at least `MIN_AIM_LEN`, the `tryFire` gate), else 0. Read at movement time, before the
 * combat system of the same tick (so "swapping" is the state the previous tick left). Shared by
 * the server, solo and the client's Predictor (which mirrors the active weapon and swap per seq
 * from its local fire clock), so the predicted speed is the server's.
 */
export function wielderSlowPct(balance: Balance, p: Readonly<PlayerState>, input: Readonly<PlayerInput> | undefined): number {
  if (!input || !input.fire || p.status !== "alive" || p.loadout.swapTicks > 0) return 0;
  if (Math.sqrt(input.aimX * input.aimX + input.aimY * input.aimY) < MIN_AIM_LEN) return 0;
  const stats = balance.weapons[activeSlot(p.loadout).weapon];
  return stats?.kind === "melee" ? stats.wielderSlowPct : 0;
}

/**
 * Speed this tick. Integer percent: the server and the predictor compute the same expression from
 * the same integers, so the result is bit-identical (+ − × ÷ only, see movement.ts). Story 5.2:
 * the wielder slow (`wieldPct`) multiplies with a bite slow (0.8 × 0.7 = 56 %, never the stronger
 * only); other slows (5.6, 5.8) join this one formula as further factors. Story 5.11: a gear speed
 * bonus (`bonusPct`, the running shoes' 10) multiplies first: `base × (100 + bonus) / 100`, then
 * every slow — bonus and slows never add.
 */
export function playerSpeed(baseMps: number, p: Readonly<PlayerState>, wieldPct = 0, bonusPct = 0): number {
  const base = bonusPct > 0 ? (baseMps * (100 + bonusPct)) / 100 : baseMps;
  const slow = p.slowTicksLeft > 0 ? p.slowPct : 0;
  if (wieldPct <= 0) return slow > 0 ? (base * (100 - slow)) / 100 : base;
  return (base * (100 - slow) * (100 - wieldPct)) / 10000;
}

/** One tick of the slow timer (every status: a downed player's slow just runs out). */
export function tickSlow(p: PlayerState): void {
  if (p.slowTicksLeft <= 0) return;
  p.slowTicksLeft--;
  if (p.slowTicksLeft === 0) p.slowPct = 0;
}
