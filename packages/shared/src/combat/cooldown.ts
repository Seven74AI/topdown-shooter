/**
 * The fire cooldown rule (Story 1.5, extracted in Story 2.7 so the server's `firing.ts` and the
 * client's local fire clock run the very same arithmetic). One tick is:
 *
 * 1. `cooldownS = cooldownTickStart(cooldownS, dtS)`: a running cooldown counts down and may end
 *    slightly negative (down to −dt: the part of this tick since it ended); a ready weapon carries
 *    no credit.
 * 2. The weapon may attack this tick when `cooldownReady(cooldownS)`.
 * 3. `cooldownS = cooldownTickEnd(cooldownS, attacked, rateHz)`: an attack adds `1 / rateHz`
 *    (keeping the exact average rate: 3/s fires every 6.67 ticks on average); a tick without one
 *    clamps back to ≥ 0, so an idle player can't save up a burst.
 *
 * A weapon that can't attack at all this tick (swapping, or the slot not in hand) uses
 * `cooldownIdle`.
 */

/** Cooldowns within this of zero count as ready (float rounding of `+= 1/rateHz`). */
export const COOLDOWN_EPS_S = 1e-6;

export function cooldownTickStart(cooldownS: number, dtS: number): number {
  return cooldownS > 0 ? Math.max(-dtS, cooldownS - dtS) : cooldownS;
}

export function cooldownReady(cooldownS: number): boolean {
  return cooldownS <= COOLDOWN_EPS_S;
}

export function cooldownTickEnd(cooldownS: number, attacked: boolean, rateHz: number): number {
  return attacked ? cooldownS + 1 / rateHz : Math.max(0, cooldownS);
}

/** A tick in which this weapon can't attack (swap in progress, or not the active slot). */
export function cooldownIdle(cooldownS: number, dtS: number): number {
  return Math.max(0, cooldownS - dtS);
}
