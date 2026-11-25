import { describe, expect, it } from "vitest";
import { PROGRESSION } from "../config/progression";
import { runSupplies, suppliesEnding, type RunRecord, type SuppliesEnding } from "./supplies";

/** Story 7.2 (AC 2, test plan): every row of the story's `runSupplies` table, then the rules S1, S4, S5, S7 by name. */
const rec = (wavesIn: number, bossesIn = 0, endlessWavesIn = 0, endlessBossesIn = 0): RunRecord => ({ wavesIn, bossesIn, endlessWavesIn, endlessBossesIn });
const VETERAN = 10_000; // lifetime well past the rookie line: no doubling

const TABLE: readonly { name: string; record: RunRecord; ending: SuppliesEnding; lifetime: number; total: number }[] = [
  { name: "wipe in wave 5 (D8: the wave the team falls in counts)", record: rec(5), ending: "wiped", lifetime: VETERAN, total: 50 },
  { name: "wipe in wave 9", record: rec(9), ending: "wiped", lifetime: VETERAN, total: 90 },
  { name: "wipe in a build phase after wave 4", record: rec(4), ending: "wiped", lifetime: VETERAN, total: 40 },
  { name: "wave-10 extract with the Behemoth killed", record: rec(10, 1), ending: "extracted", lifetime: VETERAN, total: 250 },
  { name: "endless extract after 3 endless waves", record: rec(10, 1, 3), ending: "extracted", lifetime: VETERAN, total: 310 },
  { name: "endless wipe after 3 endless waves (S4: endless lost, waves 1–10 + boss kept)", record: rec(10, 1, 3), ending: "lost", lifetime: VETERAN, total: 150 },
  { name: "endless extract with a wave-15 Behemoth (D5: +50)", record: rec(10, 2, 5, 1), ending: "extracted", lifetime: VETERAN, total: 100 + 50 + 100 + 100 + 50 },
  { name: "endless wipe with a wave-15 Behemoth (D5: lost)", record: rec(10, 2, 6, 1), ending: "lost", lifetime: VETERAN, total: 150 },
  { name: "quitter during wave 6 (the wave they left in doesn't count)", record: rec(5), ending: "quit", lifetime: VETERAN, total: 50 },
  { name: "quitter after the boss, team extracts later (D2: no +100)", record: rec(10, 1), ending: "quit", lifetime: VETERAN, total: 150 },
  { name: "rookie 290 lifetime + a 100 run → 200 (crosses 300, still doubled)", record: rec(10), ending: "wiped", lifetime: 290, total: 200 },
  { name: "rookie exactly 300 → not doubled", record: rec(10), ending: "wiped", lifetime: 300, total: 100 },
  { name: "a brand-new player wiping in wave 5 → 100", record: rec(5), ending: "wiped", lifetime: 0, total: 100 },
  { name: "no wave ended (a wipe in wave 1 on purpose counts wave 1 only)", record: rec(1), ending: "wiped", lifetime: VETERAN, total: 10 },
  { name: "nothing at all", record: rec(0), ending: "wiped", lifetime: VETERAN, total: 0 },
];

describe("Story 7.2: runSupplies (the test-plan table)", () => {
  for (const row of TABLE) {
    it(row.name, () => {
      expect(runSupplies(row.record, row.ending, row.lifetime).total).toBe(row.total);
    });
  }
});

describe("Story 7.2: the Supplies rules", () => {
  it("S1 Every run pays, even a loss: a wave-5 wipe = 50; a wave-10 extract with the boss = 100 + 50 + 100", () => {
    expect(runSupplies(rec(5), "wiped", VETERAN)).toEqual({ waves: 50, boss: 0, extract: 0, endless: 0, endlessBoss: 0, rookie: false, total: 50 });
    expect(runSupplies(rec(10, 1), "extracted", VETERAN)).toEqual({ waves: 100, boss: 50, extract: 100, endless: 0, endlessBoss: 0, rookie: false, total: 250 });
  });

  it("S4 Staying is a bet: an endless wipe keeps waves 1–10 and the wave-10 Behemoth only", () => {
    const r = runSupplies(rec(10, 3, 12, 2), "lost", VETERAN);
    expect(r).toEqual({ waves: 100, boss: 50, extract: 0, endless: 0, endlessBoss: 0, rookie: false, total: 150 });
    const x = runSupplies(rec(10, 3, 12, 2), "extracted", VETERAN);
    expect(x).toEqual({ waves: 100, boss: 50, extract: 100, endless: 240, endlessBoss: 100, rookie: false, total: 590 });
  });

  it("S5 New friends catch up: below 300 lifetime the whole run is × 2 and flagged", () => {
    const r = runSupplies(rec(9, 0), "wiped", 0);
    expect(r.rookie).toBe(true);
    expect(r.total).toBe(180);
    expect(r.waves).toBe(90); // the lines stay unscaled: the panel shows "Waves 9 × 10 = 90" then "Rookie bonus × 2"
    expect(runSupplies(rec(9, 0), "wiped", 299).rookie).toBe(true);
    expect(runSupplies(rec(9, 0), "wiped", 300).rookie).toBe(false);
  });

  it("S7 Solo online pays the same: the function has no team size (one player's record = a team member's)", () => {
    expect(runSupplies.length).toBeLessThanOrEqual(4);
    const solo = runSupplies(rec(10, 1), "extracted", VETERAN);
    const teamMember = runSupplies(rec(10, 1), "extracted", VETERAN);
    expect(solo).toEqual(teamMember);
  });

  it("at most one wave-10 Behemoth pays (a dev boss-wave run with two run Behemoths still pays 50)", () => {
    expect(runSupplies(rec(10, 2), "wiped", VETERAN).boss).toBe(50);
  });

  it("every number comes from progression.json (a changed config changes the result)", () => {
    const cfg = { ...PROGRESSION.supplies, perWave: 7, extract: 3, rookieLift: { belowLifetime: 0, multiplier: 2 } };
    expect(runSupplies(rec(2), "extracted", 0, cfg).total).toBe(17);
  });

  it("garbage counters (negative, fractional) count as 0: the result is always a non-negative integer", () => {
    const r = runSupplies({ wavesIn: -3, bossesIn: 1.5, endlessWavesIn: Number.NaN, endlessBossesIn: -1 }, "extracted", VETERAN);
    expect(r.total).toBe(100);
    expect(Number.isInteger(r.total)).toBe(true);
  });

  it("suppliesEnding: the run's ending for a player in the run at its end, else quit", () => {
    expect(suppliesEnding("extracted", true)).toBe("extracted");
    expect(suppliesEnding("extracted", false)).toBe("quit");
    expect(suppliesEnding("lost", true)).toBe("lost");
    expect(suppliesEnding("none", true)).toBe("quit");
  });
});
