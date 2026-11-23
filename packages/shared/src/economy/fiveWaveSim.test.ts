import { describe, expect, it } from "vitest";
import { bundledBalanceFiles, loadBalance, withOverrides } from "../config/balance";
import { formatRunLine, runHeadless, type HeadlessRunLog } from "../bots/headlessRun";
import { spitStats } from "../zombies/spit";
import { trapCounters } from "../buildings/trap";
import { mineCounters } from "../buildings/mine";

/**
 * Story 3.10 (AC 5, 7, 8): the seeded run (Story 5.8: `runWaves` 6; the file keeps its 3.10 name) with 2/3/4 bots, the real balance (waves.json
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
      const byWave = [1, 2, 3, 4, 5, 6].map((w) => rs.filter((r) => r.wavesCleared >= w).length);
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


describe("six-wave bot sim with the Brute (Story 5.7, brief lines 9 and 15)", () => {
  // `runWaves` 6 (the run Story 5.8 makes live): waves 5 and 6 each bring one Brute.
  const six = loadBalance(withOverrides(bundledBalanceFiles(), [["waves", "runWaves", 6]]));
  it("every run ends; a Brute spawned in wave 5 (and 6), was killed, and its kill was paid (25 + assists)", () => {
    const lines: string[] = [];
    let reached5 = 0;
    let killed = 0;
    let pay = 0;
    for (const players of [2, 4]) {
      for (const seed of SEEDS) {
        const r = runHeadless({ balance: six, seed, players });
        expect(r.timedOut).toBe(false);
        expect(r.heldOut !== r.wiped).toBe(true);
        if (r.heldOut) expect(r.wavesCleared).toBe(6);
        if (r.reached >= 5) {
          reached5++;
          expect(r.brutes.spawnedInWave.filter((w) => w === 5), `seed ${seed} ${players}p`).toHaveLength(1);
        }
        if (r.reached >= 6) expect(r.brutes.spawnedInWave.filter((w) => w === 6)).toHaveLength(1);
        expect(r.brutes.spawnedInWave.every((w) => w === 5 || w === 6)).toBe(true);
        if (r.wavesCleared >= 5) expect(r.brutes.killed).toBeGreaterThanOrEqual(1); // a cleared wave 5 killed its Brute
        killed += r.brutes.killed;
        pay += r.brutes.killPay;
        lines.push(`${formatRunLine(r)} | Brutes spawned in waves ${r.brutes.spawnedInWave.join(",") || "-"}, killed ${r.brutes.killed}, paid ${r.brutes.killPay}`);
      }
    }
    (globalThis as unknown as { console: { info(m: string): void } }).console.info(`[sim] Story 5.7 six waves:\n${lines.join("\n")}`);
    expect(reached5).toBeGreaterThan(0);
    expect(killed).toBeGreaterThan(0);
    expect(pay).toBeGreaterThanOrEqual(12 * killed); // each Brute kill paid: 25 (+ assists) by a player, 50 % to a turret's owner (D6)
  }, 600_000);
});

describe("bot sim with the Fire Axe and the Chainsaw (Story 5.2, brief lines 9 and 15)", () => {
  it("bots that buy them still run to Results (waves ended), and both really kill", () => {
    // A test-only shopping list: the bots start with 700 (enough for the Chainsaw at the first build).
    const rich = loadBalance(withOverrides(bundledBalanceFiles(), [["economy", "startingWallet", 700]]));
    const lists: Record<string, readonly string[]> = { fire_axe: ["fire_axe", "wood_barricade"], chainsaw: ["chainsaw", "wood_barricade"] };
    const lines: string[] = [];
    for (const [weapon, list] of Object.entries(lists)) {
      let kills = 0;
      let bought = 0;
      for (const seed of [1, 2]) {
        const r = runHeadless({ balance: rich, seed, players: 4, list });
        expect(r.timedOut).toBe(false);
        expect(r.heldOut !== r.wiped).toBe(true);
        expect(r.wavesCleared).toBeGreaterThanOrEqual(1); // waves really ended
        kills += r.killsByWeapon[weapon] ?? 0;
        bought += r.purchases.flat().filter((p) => p.startsWith(`${weapon}@`)).length;
        lines.push(`${weapon} seed ${seed}: ${formatRunLine(r)} kills by ${weapon} ${r.killsByWeapon[weapon] ?? 0}`);
      }
      expect(bought).toBeGreaterThan(0);
      expect(kills).toBeGreaterThan(0); // liveness: the new weapon was used (bot survival is not difficulty evidence)
    }
    (globalThis as unknown as { console: { info(msg: string): void } }).console.info(`[five-wave sim 5.2]\n${lines.join("\n")}`);
  }, 180_000);
});

describe("five-wave bot sim with weapon upgrades (Story 5.1, brief lines 9 and 15)", () => {
  it("bots that upgrade their SMG still run to Results, and upgraded weapons really kill", () => {
    // A test-only shopping list (bots.json stays untouched): the SMG, two upgrades, then a barricade.
    const LIST = ["smg", "upgrade:smg", "upgrade:smg", "wood_barricade"];
    const lines: string[] = [];
    let upgrades = 0;
    let upgradedKills = 0;
    for (const players of [2, 4]) {
      for (const seed of [1, 2]) {
        const r = runHeadless({ balance, seed, players, list: LIST });
        expect(r.timedOut).toBe(false);
        expect(r.heldOut !== r.wiped).toBe(true);
        expect(r.wavesCleared).toBeGreaterThanOrEqual(1); // waves really ended
        for (let i = 0; i < players; i++) expect(r.wallet[i]).toBe(balance.economy.startingWallet + (r.earned[i] as number) - (r.spent[i] as number));
        upgrades += r.upgrades.reduce((a, b) => a + b, 0);
        upgradedKills += r.upgradedKills;
        lines.push(`${formatRunLine(r)} | upgrades ${r.upgrades.join("/")}, kills with an upgraded weapon ${r.upgradedKills}, spent ${r.spent.join("/")}`);
      }
    }
    (globalThis as unknown as { console: { info(msg: string): void } }).console.info(`[five-wave sim 5.1] list ${LIST.join(",")}: ${upgrades} upgrades, ${upgradedKills} upgraded kills\n${lines.join("\n")}`);
    expect(upgrades).toBeGreaterThanOrEqual(1); // liveness: upgrades were bought …
    expect(upgradedKills).toBeGreaterThanOrEqual(1); // … and an upgraded weapon really killed
  }, 180_000);
});

describe("six-wave bot sim with Bloaters (Story 5.8, brief lines 9 and 15)", () => {
  it("1–4 bots × seeds 1–4: every run reaches Results (held out or wiped); wave 6 really brings Bloaters that swell and burst", () => {
    const lines: string[] = [];
    let reached6 = 0;
    let bursts6 = 0;
    let chains = 0;
    for (const players of [1, 2, 3, 4]) {
      for (const seed of [1, 2, 3, 4]) {
        const r = runHeadless({ balance, seed, players });
        expect(r.timedOut).toBe(false);
        expect(r.heldOut !== r.wiped).toBe(true);
        expect(r.wavesCleared).toBeGreaterThanOrEqual(1); // waves really ended
        if (r.heldOut) expect(r.wavesCleared).toBe(6);
        // Bloaters only from wave 6 (D9).
        expect(r.bloaters.burstsInWave.slice(0, 5).every((n) => n === 0)).toBe(true);
        if (r.reached >= 6) {
          reached6++;
          bursts6 += r.bloaters.burstsInWave[5] ?? 0;
        }
        chains += r.bloaters.chains;
        const earned = r.earned.reduce((a, b) => a + b, 0);
        lines.push(`${formatRunLine(r)} | W6 Bloater swells ${r.bloaters.swellsInWave[5] ?? 0}, bursts ${r.bloaters.burstsInWave[5] ?? 0}, chain links ${r.bloaters.chains}, blast hits on players ${r.bloaters.playerHits}; team earned ${earned}`);
      }
    }
    (globalThis as unknown as { console: { info(m: string): void } }).console.info(`[sim] Story 5.8 six waves:\n${lines.join("\n")}`);
    expect(reached6).toBeGreaterThan(0); // liveness: some runs got to wave 6 …
    expect(bursts6).toBeGreaterThanOrEqual(reached6); // … and Bloaters burst there (≥ 1 per such run on average)
    expect(chains).toBeGreaterThanOrEqual(0);
  }, 900_000);
});
