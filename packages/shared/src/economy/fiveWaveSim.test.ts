import { describe, expect, it } from "vitest";
import { loadBalance } from "../config/balance";
import { formatRunLine, runHeadless, type HeadlessRunLog } from "../bots/headlessRun";

/**
 * Story 3.10 (AC 5, 7, 8): the seeded 5-wave run with 2/3/4 bots, the real balance (waves.json
 * curve, mix and player-count scale) and every real system. The bots shop from `bots.json ›
 * shoppingList` in each build phase (real shop and placement rules) and tap Ready. Each player's
 * earnings go to the test output, next to the GDD target cut to 5 waves (story Dev Notes: earned ≈
 * 650–790 per player). `tools/sims/fiveWave.ts` runs the same with more seeds and balance overrides.
 *
 * The sims of 3.2/3.3 once stopped running without failing, so this one must prove it ran: every
 * run ends in Results (held out or wiped, never the tick limit), clears at least one wave, and the
 * bots buy weapons and place buildings; money adds up for every player.
 */
const balance = loadBalance();
const SEEDS = [1, 2, 3];
const TEAM_SIZES = [2, 3, 4];

describe("five-wave bot sim (Story 3.10: 2/3/4 bots, shopping and building, seeded)", () => {
  it("every run really runs to Results; logs survival by wave and each player's earnings", () => {
    const lines: string[] = [];
    const runs: HeadlessRunLog[] = [];
    for (const players of TEAM_SIZES) {
      let weapons = 0;
      let buildings = 0;
      for (const seed of SEEDS) {
        const r = runHeadless({ balance, seed, players });
        runs.push(r);
        expect(r.timedOut).toBe(false);
        expect(r.heldOut !== r.wiped).toBe(true); // exactly one ending
        expect(r.wavesCleared).toBeGreaterThanOrEqual(1);
        expect(r.waves.length).toBe(r.reached);
        expect(r.waves[0]?.size).toBe(Math.round(balance.waves.zombiesPerWave * (balance.waves.playerCountScale[players - 1] as number)));
        if (r.heldOut) expect(r.wavesCleared).toBe(balance.waves.runWaves);
        for (let i = 0; i < players; i++) {
          expect(r.earned[i]).toBeGreaterThan(0);
          expect(r.wallet[i]).toBe(balance.economy.startingWallet + (r.earned[i] as number) - (r.spent[i] as number)); // money adds up
        }
        expect(r.earnedBy.kill + r.earnedBy.assist + r.earnedBy.revive + r.earnedBy.wave).toBe(r.earned.reduce((a, b) => a + b, 0));
        weapons += r.purchases.reduce((a, p) => a + p.length, 0);
        buildings += r.buildingsPlaced.reduce((a, b) => a + b, 0);
        lines.push(formatRunLine(r));
      }
      expect(weapons).toBeGreaterThan(0); // the bots really shopped …
      expect(buildings).toBeGreaterThan(0); // … and built
    }
    // AC 5: at least one full 5-wave run with 4 bots (its earnings are the comparison with the GDD).
    expect(runs.some((r) => r.players === 4 && r.heldOut)).toBe(true);
    const summary = TEAM_SIZES.map((n) => {
      const rs = runs.filter((r) => r.players === n);
      const earned = rs.flatMap((r) => r.earned);
      const mean = Math.round(earned.reduce((a, b) => a + b, 0) / earned.length);
      const byWave = [1, 2, 3, 4, 5].map((w) => rs.filter((r) => r.wavesCleared >= w).length);
      return `${n}p: held out ${rs.filter((r) => r.heldOut).length}/${rs.length}, cleared by wave ${byWave.join("/")}, earned per player mean ${mean} (${Math.min(...earned)}–${Math.max(...earned)})`;
    });
    (globalThis as unknown as { console: { info(msg: string): void } }).console.info(
      `[five-wave sim] GDD target cut to 5 waves: earned ≈ 650–790 per player\n${lines.join("\n")}\n${summary.join("\n")}`,
    );
  }, 180_000);
});
