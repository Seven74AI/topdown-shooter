import { describe, expect, it } from "vitest";
import { lootPartKeys, milestonePartKey } from "@topdown/shared";
import { milestonesReached, newMilestoneParts, type LifetimeStats, type MilestoneRun } from "./milestones";
import { pickLootItem } from "./loot";

const run = (over: Partial<MilestoneRun> = {}): MilestoneRun => ({ waveMask: 0, bossKilledWhileIn: false, extracted: false, district: "downtown", extractedAllFour: false, downsWaves1to10: 0, ...over });
const stats = (over: Partial<LifetimeStats> = {}): LifetimeStats => ({ revives: 0, kills: 0, barricades: 0, runs: 0, ...over });
const waves = (a: number, b: number): number => { let m = 0; for (let n = a; n <= b; n++) m |= 1 << (n - 1); return m >>> 0; };

describe("Story 7.11: milestonesReached (pure, table-driven)", () => {
  it("M1 at wave 5 (not 4), M4 at wave 15 (not 14); an out-since-wave-3 player still has the waves (M-F1)", () => {
    expect(milestonesReached(run({ waveMask: waves(1, 4) }), stats())).not.toContain("m1");
    expect(milestonesReached(run({ waveMask: waves(1, 5), downsWaves1to10: 1 }), stats())).toEqual(["m1"]);
    expect(milestonesReached(run({ waveMask: waves(1, 14), downsWaves1to10: 1 }), stats())).not.toContain("m4");
    expect(milestonesReached(run({ waveMask: waves(1, 15), downsWaves1to10: 1 }), stats())).toContain("m4");
  });

  it("M2 only extracting from Downtown; M3 the Behemoth died while in; M8 only all four standing", () => {
    expect(milestonesReached(run({ extracted: true }), stats())).toContain("m2");
    expect(milestonesReached(run({ extracted: true, district: "harbor" }), stats())).not.toContain("m2");
    expect(milestonesReached(run({ extracted: false, district: "downtown" }), stats())).not.toContain("m2");
    expect(milestonesReached(run({ bossKilledWhileIn: true }), stats())).toContain("m3");
    expect(milestonesReached(run({ extracted: true, extractedAllFour: true }), stats())).toContain("m8");
    expect(milestonesReached(run({ extracted: true, extractedAllFour: false }), stats())).not.toContain("m8");
  });

  it("lifetime boundaries: 24/25 revives, 999/1,000 kills, 99/100 barricades, 19/20 runs", () => {
    expect(milestonesReached(run(), stats({ revives: 24, kills: 999, barricades: 99, runs: 19 }))).toEqual([]);
    expect(milestonesReached(run(), stats({ revives: 25, kills: 1000, barricades: 100, runs: 20 }))).toEqual(["m5", "m6", "m7", "m9"]);
  });

  it("M10: every wave 1–10 and never downed in them; a down in wave 9 or a missed wave 1 → no", () => {
    expect(milestonesReached(run({ waveMask: waves(1, 10) }), stats())).toContain("m10");
    expect(milestonesReached(run({ waveMask: waves(1, 10), downsWaves1to10: 1 }), stats())).not.toContain("m10");
    expect(milestonesReached(run({ waveMask: waves(2, 10) }), stats())).not.toContain("m10");
  });

  it("M-F3: a part already owned is never granted again", () => {
    const owned = new Set([milestonePartKey("m1")]);
    expect(newMilestoneParts(["m1", "m3"], owned)).toEqual([{ id: "m3", key: "head:gas" }]);
    expect(newMilestoneParts(["m1"], owned)).toEqual([]);
  });
});

describe("Story 7.12: pickLootItem (AC 8, B6)", () => {
  const loot = lootPartKeys();
  it("picks from the unowned loot parts in catalogue order, deterministic from itemRoll", () => {
    expect(pickLootItem(new Set(), 0)).toBe(loot[0]);
    expect(pickLootItem(new Set(), 0.999999)).toBe(loot[9]);
    expect(pickLootItem(new Set(), 0.35)).toBe(loot[3]);
    const owned = new Set(loot.slice(0, 5));
    expect(pickLootItem(owned, 0)).toBe(loot[5]); // never an owned one
    for (let r = 0; r < 1; r += 0.01) expect(owned.has(pickLootItem(owned, r) as string)).toBe(false);
    expect(pickLootItem(new Set(["head:fire", "top:jacket"]), 0)).toBe(loot[0]); // milestone / starter keys don't matter
  });

  it("Collector: owning all ten → null (no item)", () => {
    expect(pickLootItem(new Set(loot), 0.5)).toBeNull();
    expect(pickLootItem(new Set(loot.slice(1)), 0.9)).toBe(loot[0]); // the last one left
  });
});
