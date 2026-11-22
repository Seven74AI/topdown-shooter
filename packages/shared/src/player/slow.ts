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
 * Speed this tick. Integer percent: the server and the predictor compute the same expression from
 * the same integers, so the result is bit-identical (+ − × ÷ only, see movement.ts).
 */
export function playerSpeed(baseMps: number, p: Readonly<PlayerState>): number {
  return p.slowTicksLeft > 0 ? (baseMps * (100 - p.slowPct)) / 100 : baseMps;
}

/** One tick of the slow timer (every status: a downed player's slow just runs out). */
export function tickSlow(p: PlayerState): void {
  if (p.slowTicksLeft <= 0) return;
  p.slowTicksLeft--;
  if (p.slowTicksLeft === 0) p.slowPct = 0;
}
