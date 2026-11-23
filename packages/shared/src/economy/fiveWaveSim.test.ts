import { describe, expect, it } from "vitest";
import { bundledBalanceFiles, loadBalance, withOverrides } from "../config/balance";
import { formatRunLine, runHeadless, type HeadlessRunLog } from "../bots/headlessRun";
import { spitStats } from "../zombies/spit";
import { trapCounters } from "../buildings/trap";
import { mineCounters } from "../buildings/mine";

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
/** Story 5.3's gun sim: every bot can buy either new gun in the first build phase. */
const richBalance = loadBalance(withOverrides(bundledBalanceFiles(), [["economy", "startingWallet", 500]]));
const SEEDS = [1, 2, 3];
const TEAM_SIZES = [2, 3, 4];

describe("five-wave bot sim (Story 3.10: 2/3/4 bots, shopping and building, seeded)", () => {
  it("every run really runs to Results; logs survival by wave and each player's earnings", () => {
    const lines: string[] = [];
    const runs: HeadlessRunLog[] = [];
    const spits0 = { spits: spitStats.spits, hits: spitStats.spitHits, acid: spitStats.acidHits };
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
    // Story 5.6 (liveness): Spitters (waves 4–5) really spat and hit in the runs that got there; every such wave ended (held-out runs above).
    const spits = spitStats.spits - spits0.spits;
    const spitHits = spitStats.spitHits - spits0.hits;
    const acidHits = spitStats.acidHits - spits0.acid;
    const reached4 = runs.filter((r) => r.reached >= 4).length;
    expect(reached4).toBeGreaterThan(0);
    expect(spits).toBeGreaterThan(reached4);
    expect(spitHits).toBeGreaterThanOrEqual(1);
    lines.push(`Story 5.6: ${reached4} runs reached wave 4; ${spits} spits, ${spitHits} spit hits, ${acidHits} acid puddle hits`);
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

describe("five-wave bot sim with spike traps and mines (Story 5.9, task 8.2)", () => {
  /** A test-local shopping list (bots.json stays untouched): the SMG, then traps and mines, then barricades. */
  const LIST = ["smg", "spike_trap", "mine", "spike_trap", "mine", "wood_barricade", "wood_barricade"];
  it("every run ends (held out or wiped, never the tick limit); traps and mines really fired; earnings vs spend logged", () => {
    trapCounters.pulses = trapCounters.kills = trapCounters.wornOut = 0;
    mineCounters.exploded = 0;
    const lines: string[] = [];
    let placed = 0;
    for (const players of [2, 4]) {
      for (const seed of [1, 2]) {
        const r = runHeadless({ balance, seed, players, list: LIST });
        expect(r.timedOut).toBe(false);
        expect(r.heldOut !== r.wiped).toBe(true);
        expect(r.wavesCleared).toBeGreaterThanOrEqual(1);
        for (const w of r.waves.slice(0, r.wavesCleared)) expect(w.size).toBeGreaterThan(0);
        placed += r.buildingsPlaced.reduce((a, b) => a + b, 0);
        const earned = r.earned.reduce((a, b) => a + b, 0);
        const spent = r.spent.reduce((a, b) => a + b, 0);
        lines.push(`${formatRunLine(r)} | team earned ${earned}, spent ${spent}`);
      }
    }
    (globalThis as unknown as { console: { info(msg: string): void } }).console.info(
      `[five-wave sim 5.9] list ${LIST.join(",")}: ${placed} buildings placed, ${trapCounters.pulses} spike hits, ${trapCounters.kills} trap kills, ${trapCounters.wornOut} worn out, ${mineCounters.exploded} mines exploded\n${lines.join("\n")}`,
    );
    expect(placed).toBeGreaterThan(0);
    expect(trapCounters.pulses).toBeGreaterThan(0); // liveness: the traps really worked in real waves
    expect(mineCounters.exploded).toBeGreaterThan(0);
  }, 180_000);
});
describe("five-wave bot sim with the Shotgun and the Assault Rifle (Story 5.3, brief line 15)", () => {
  it("bots that buy them still run to Results, and the new guns really kill", () => {
    // A test-only shopping list (not bots.json): bot 1 buys the Shotgun, bot 2 the Assault Rifle when affordable.
    const lists: Record<string, readonly string[]> = { shotgun: ["shotgun", "wood_barricade"], assault_rifle: ["assault_rifle", "wood_barricade"] };
    const lines: string[] = [];
    for (const [weapon, list] of Object.entries(lists)) {
      let kills = 0;
      let bought = 0;
      for (const seed of [1, 2]) {
        // Merge with 5.6: Spitters (wave 4) now wipe these pistol bots before they can save 450 for the
        // Assault Rifle, so the bots start with that money (this test checks the guns kill, not survival).
        const r = runHeadless({ balance: richBalance, seed, players: 4, list });
        expect(r.timedOut).toBe(false);
        expect(r.heldOut !== r.wiped).toBe(true);
        expect(r.wavesCleared).toBeGreaterThanOrEqual(1);
        kills += r.killsByWeapon[weapon] ?? 0;
        bought += r.purchases.flat().filter((p) => p.startsWith(`${weapon}@`)).length;
        lines.push(`${weapon} seed ${seed}: ${formatRunLine(r)} kills by ${weapon} ${r.killsByWeapon[weapon] ?? 0}`);
      }
      expect(bought).toBeGreaterThan(0);
      expect(kills).toBeGreaterThan(0); // liveness: the new gun was used (bot survival is not difficulty evidence)
    }
    (globalThis as unknown as { console: { info(msg: string): void } }).console.info(`[five-wave sim 5.3]\n${lines.join("\n")}`);
  }, 180_000);
});

