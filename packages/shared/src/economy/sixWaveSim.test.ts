import { describe, expect, it } from "vitest";
import { bundledBalanceFiles, loadBalance, withOverrides, type Balance } from "../config/balance";
import { runHeadless, type HeadlessRunLog } from "../bots/headlessRun";
import { cardItem } from "./shopCards";

/**
 * Story 5.13 (T7; brief lines 9 and 15): the seeded six-wave run with 2/3/4 bots buying from their
 * own card offers (`botBuildPhase` → real `buyCard` / `reroll`). Liveness: every run reaches Results
 * (held out or wiped) after ≥ 1 wave, cards are bought and rerolls paid, the build-0 offers respect
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
const LIST = ["smg", "wood_barricade", "running_shoes", "wood_barricade", "body_armor_1", "auto_turret", "shotgun", "revive_kit", "body_armor_2", "assault_rifle"];
const TEAM_SIZES = [2, 3, 4];
/** Build phases where every run that reaches them buys ≥ 1 card (bots pooled). */
const CARD_BUILDS = [0, 3];

function checkRun(b: Balance, r: HeadlessRunLog): void {
  expect(r.timedOut).toBe(false);
  expect(r.heldOut !== r.wiped).toBe(true);
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
  it("seeds 1–6 × 2/3/4 bots: every run ends; cards bought (builds 0 and 3, ≥ 3 per run); rerolls paid", () => {
    const lines: string[] = [];
    for (const players of TEAM_SIZES) {
      let rerolls = 0;
      for (let seed = 1; seed <= 6; seed++) {
        const r = runHeadless({ balance, seed, players, list: LIST });
        checkRun(balance, r);
        expect(sum(r.cardsByBuild)).toBeGreaterThanOrEqual(3);
        // Build phases reached: 0 … reached − 1 (a held-out run ends in Results after the last wave).
        for (const build of CARD_BUILDS) if (build < r.reached) expect(r.cardsByBuild[build] ?? 0, `${players}p seed ${seed} build ${build}`).toBeGreaterThanOrEqual(1);
        rerolls += sum(r.rerolls);
        lines.push(`${players}p seed ${seed}: ${r.heldOut ? "held out" : `wiped in W${r.reached}`}; cards by build ${r.cardsByBuild.map((n) => n ?? 0).join("/")}; rerolls ${r.rerolls.join("/")} (spent ${sum(r.rerollSpent)})`);
      }
      expect(rerolls, `${players} bots`).toBeGreaterThanOrEqual(1); // rerolls really happen
    }
    (globalThis as unknown as { console: { info(m: string): void } }).console.info(`[six-wave card sim]\n${lines.join("\n")}`);
  }, 300_000);

  it("startingWallet 400: cards from build 0 in every run, ≥ 2 per bot over the run", () => {
    const lines: string[] = [];
    for (const players of TEAM_SIZES) {
      for (let seed = 1; seed <= 3; seed++) {
        const r = runHeadless({ balance: rich, seed, players, list: LIST });
        checkRun(rich, r);
        expect(r.cardsByBuild[0] ?? 0).toBeGreaterThanOrEqual(1);
        expect(sum(r.cardsByBuild)).toBeGreaterThanOrEqual(2 * players);
        lines.push(`${players}p seed ${seed} (400): cards by build ${r.cardsByBuild.map((n) => n ?? 0).join("/")}; rerolls ${r.rerolls.join("/")}`);
      }
    }
    (globalThis as unknown as { console: { info(m: string): void } }).console.info(`[six-wave card sim, wallet 400]\n${lines.join("\n")}`);
  }, 300_000);
});
