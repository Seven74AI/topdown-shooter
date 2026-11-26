import type { Balance } from "../config/balance";

/**
 * Story 8.2 (J1, FR72, Epic 8 D7, decisions E8-J1 / E8-J2): a late joiner's starting money. Pure; the
 * server is the only caller (the client shows the wallet from the patch, never computes it).
 *
 *   max(ownStart, lateJoin.base + ⌊lateJoin.avgShare × avg⌋)
 *
 * `avg` = the mean `earned` over `seats`: the seats in the fight now (present in the World + held),
 * the joiner and remembered seats excluded by the caller (E8-J2); no seat → 0. `ownStart` is the
 * joiner's own normal start money (`economy.startingWallet`, + Story 7.5 Training start money), so a
 * join in the first build phase never pays less than a lobby start (E8-J1).
 */
export function lateJoinWallet(seats: Iterable<{ readonly earned: number }>, balance: Balance, ownStart: number): number {
  let sum = 0;
  let n = 0;
  for (const s of seats) {
    sum += s.earned;
    n++;
  }
  const avg = n === 0 ? 0 : sum / n;
  const lj = balance.economy.lateJoin;
  return Math.max(ownStart, lj.base + Math.floor(lj.avgShare * avg));
}

/** The team average `earned` over `seats` (0 with none), for the `player_joined_mid_run` log line. */
export function averageEarned(seats: Iterable<{ readonly earned: number }>): number {
  let sum = 0;
  let n = 0;
  for (const s of seats) {
    sum += s.earned;
    n++;
  }
  return n === 0 ? 0 : sum / n;
}
