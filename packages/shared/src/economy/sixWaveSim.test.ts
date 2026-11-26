import { describe, expect, it } from "vitest";
import { bundledBalanceFiles, loadBalance, withOverrides, type Balance } from "../config/balance";
import { runHeadless, type HeadlessRunLog } from "../bots/headlessRun";
import { cardItem } from "./shopCards";

/**
 * Story 5.13 (T7; brief lines 9 and 15): the seeded six-wave run with 2/3/4 bots buying from their
 * own card offers (`botBuildPhase` → real `buyCard` / `reroll`). Liveness: every run reaches Results
 * (extracted or wiped) after ≥ 1 wave, cards are bought and rerolls paid, the build-0 offers respect
 * the floor. Bot survival is not difficulty evidence.
 *
 * Designer 2026-11-24: start money 200 (was 100), so build 0 buys a card. With earnings as built
 * (4.10 deferred) the bots still spend builds 1–2 (and some later ones) on barricades, the turret and
 * upgrades, so "a card in every build" does not hold; asserted: a card in build 0 and in build 3 of
 * every run that reaches them, ≥ 3 cards per run (the printed table shows every build).
 */
const balance = loadBalance();
const rich = loadBalance(withOverrides(bundledBalanceFiles(), [["economy", "startingWallet", 400]]));
/** A card-minded shopping list (bots.json's default list buys buildings first and stays as built). */
const LIST = ["smg", "wood_barricade", "running_shoes", "tactical_flashlight", "wood_barricade", "body_armor_1", "auto_turret", "shotgun", "revive_kit", "body_armor_2", "assault_rifle"];
const TEAM_SIZES = [2, 3, 4];
/** Build phases where every run that reaches them buys ≥ 1 card (bots pooled). */
const CARD_BUILDS = [0, 3];

function checkRun(b: Balance, r: HeadlessRunLog): void {
  expect(r.timedOut).toBe(false);
  expect((r.ending === "extracted") !== r.wiped).toBe(true);
  expect(r.wavesCleared).toBeGreaterThanOrEqual(1);
  // Money adds up (cards and rerolls included); decay refunds (50 % of a destroyed building) are
  // paid outside `earned`, logged for the team only.
  let gap = 0;
  for (let i = 0; i < r.players; i++) {
    const d = (r.wallet[i] as number) - (b.economy.startingWallet + (r.earned[i] as number) - (r.spent[i] as number));
    expect(d).toBeGreaterThanOrEqual(0);
    gap += d;
  }
  expect(gap).toBe(r.earnedBy.refund);
  for (let i = 0; i < r.players; i++) {
    expect(r.rerollSpent[i]).toBe((r.rerolls[i] as number) * b.shop.reroll.price);
    // Build 0: a full, floor-respecting offer for every bot (drawn before any buy).
    const first = r.firstOffers[i] as string[];
    expect(first.length).toBe(b.shop.cards);
    expect(first.every((id) => id !== "")).toBe(true);
    expect(first.some((id) => cardItem(b, id)?.kind === "weapon")).toBe(true);
    expect(first.some((id) => cardItem(b, id)?.kind === "gear")).toBe(true);
  }
}

const sum = (xs: readonly (number | undefined)[]) => xs.reduce<number>((a, x) => a + (x ?? 0), 0);

describe("six-wave card sim (Story 5.13: bots buy from their cards; seeded)", () => {
  // E8-A8 (no test over 30 s): one test per run (team size × seed, a few s each), then the per-team-size totals. Same
  // runs and the same assertions as the old two tests (89 s and 51 s in CI); the totals need every run test to have
  // run first (a -t filter on one run fails them).
  const RUNS = TEAM_SIZES.flatMap((players) => [1, 2, 3, 4, 5, 6].map((seed) => [players, seed] as const));
  const rerollsBy = new Map<number, number>();
  const lines: string[] = [];
  it.each(RUNS)("%i bots, seed %i: the run ends; cards bought (builds 0 and 3, ≥ 3 per run); rerolls paid", (players, seed) => {
    const r = runHeadless({ balance, seed, players, list: LIST });
    checkRun(balance, r);
    expect(sum(r.cardsByBuild)).toBeGreaterThanOrEqual(3);
    // Build phases reached: 0 … reached − 1 (an extracted run ends in Results after the vote after the last wave).
    for (const build of CARD_BUILDS) if (build < r.reached) expect(r.cardsByBuild[build] ?? 0, `${players}p seed ${seed} build ${build}`).toBeGreaterThanOrEqual(1);
    rerollsBy.set(players, (rerollsBy.get(players) ?? 0) + sum(r.rerolls));
    lines.push(`${players}p seed ${seed}: ${(r.ending === "extracted") ? "extracted" : `wiped in W${r.reached}`}; cards by build ${r.cardsByBuild.map((n) => n ?? 0).join("/")}; rerolls ${r.rerolls.join("/")} (spent ${sum(r.rerollSpent)})`);
  }, 120_000);

  it("seeds 1–6 × 2/3/4 bots together: rerolls really happen for every team size", () => {
    expect(lines.length, "every run test above ran and passed").toBe(RUNS.length);
    for (const players of TEAM_SIZES) expect(rerollsBy.get(players) ?? 0, `${players} bots`).toBeGreaterThanOrEqual(1);
    (globalThis as unknown as { console: { info(m: string): void } }).console.info(`[six-wave card sim]\n${lines.join("\n")}`);
  });

  const RICH_RUNS = TEAM_SIZES.flatMap((players) => [1, 2, 3].map((seed) => [players, seed] as const));
  it.each(RICH_RUNS)("startingWallet 400, %i bots, seed %i: cards from build 0, ≥ 2 per bot over the run", (players, seed) => {
    const r = runHeadless({ balance: rich, seed, players, list: LIST });
    checkRun(rich, r);
    expect(r.cardsByBuild[0] ?? 0).toBeGreaterThanOrEqual(1);
    expect(sum(r.cardsByBuild)).toBeGreaterThanOrEqual(2 * players);
    (globalThis as unknown as { console: { info(m: string): void } }).console.info(`[six-wave card sim, wallet 400] ${players}p seed ${seed} (400): cards by build ${r.cardsByBuild.map((n) => n ?? 0).join("/")}; rerolls ${r.rerolls.join("/")}`);
  }, 120_000);
});
