import { describe, expect, it } from "vitest";
import type { RunRewards } from "@topdown/shared";
import { COLLECTOR_TEXT, REWARD_GROUPS, rewardsView } from "./rewardsModel";
import { resultName } from "./ResultsScreen";

/** Stories 7.7 / 7.11 / 7.12 (brief 26): the Run rewards panel's items and unlocks groups. */
const base: RunRewards = {
  runId: "0f1e2d3c-4b5a-4968-8776-655443322110",
  seed: 7,
  status: "saved",
  lines: { waves: 100, boss: 50, extract: 100, endless: 0, endlessBoss: 0 },
  waveCount: 10,
  endlessWaveCount: 0,
  rookie: false,
  total: 250,
  newTotal: 1250,
};
const names = (slot: number): string => ["Ana", "Bo", "Cid", "Dee"][slot] ?? "";

describe("Run rewards: items (7.11, 7.12) and unlocks (7.7)", () => {
  it("brief 26 order: new items first (in the server's M1…M10 order), then my find; unlocks in their own group", () => {
    const v = rewardsView({ ...base, newItems: [{ key: "head:fire", name: "Firefighter helmet", reason: "survived wave 5" }, { key: "head:riot", name: "Riot helmet", reason: "first extraction" }], loot: { wave: 6, key: "head:cone", name: "Traffic cone" }, newDistricts: [{ id: "district_2", name: "District 2" }] }, true, 7, undefined, names);
    expect(REWARD_GROUPS).toEqual(["supplies", "items", "unlocks", "nudge"]);
    expect(v.items.map((i) => [i.text, i.sub, i.big])).toEqual([
      ["New item: Firefighter helmet", "(survived wave 5)", false],
      ["New item: Riot helmet", "(first extraction)", false],
      ["Found in wave 6: Traffic cone", "", true],
    ]);
    expect(v.unlocks).toEqual([{ id: "district_2", text: "Unlocked: District 2", sub: "coming soon" }]);
  });

  it("Collector, and a teammate's find with the finder's name (7.12 D1)", () => {
    expect(rewardsView({ ...base, loot: { wave: 4, key: null, name: "" } }, true, 7).items[0]?.text).toBe(COLLECTOR_TEXT);
    const t = rewardsView({ ...base, teamLoot: { playerId: "p2", wave: 4, key: "pack:cat", name: "Cat in the backpack" } }, true, 7, undefined, names).items[0];
    expect(t).toMatchObject({ kind: "team", text: "Cid found: Cat in the backpack", slot: 2, big: false });
    const c = rewardsView({ ...base, teamLoot: { playerId: "p1", wave: 5, key: null, name: "" } }, true, 7, undefined, names).items[0];
    expect(c?.sub).toBe("(Collector: they have every surprise item)");
  });

  it("PR #9 review L1: a find is named by the finder's SEAT: Di (p3#4) found it, Eve (p3#6) sits in p3 now → 'A teammate', never 'Eve found'", () => {
    const rows = [
      { slot: 0, name: "Ana", seat: "p0#1" },
      { slot: 3, name: "Eve", seat: "p3#6" },
    ];
    const by = (slot: number, seatId?: string) => resultName(rows, slot, seatId);
    const gone = rewardsView({ ...base, teamLoot: { playerId: "p3", seatId: "p3#4", wave: 4, key: "pack:cat", name: "Cat in the backpack" } }, true, 7, undefined, by).items[0];
    expect(gone?.text).toBe("A teammate found: Cat in the backpack");
    const here = rewardsView({ ...base, teamLoot: { playerId: "p3", seatId: "p3#6", wave: 4, key: "pack:cat", name: "Cat in the backpack" } }, true, 7, undefined, by).items[0];
    expect(here?.text).toBe("Eve found: Cat in the backpack");
    const old = rewardsView({ ...base, teamLoot: { playerId: "p0", wave: 4, key: "pack:cat", name: "Cat in the backpack" } }, true, 7, undefined, by).items[0];
    expect(old?.text).toBe("Ana found: Cat in the backpack"); // an older server (no seat id): by slot, as 7.12
  });

  it("B33 (designer override 2026-11-25): my bank failed → the find is a 'Couldn't save' row (7.2's wording), never 'Found in…'", () => {
    const failed = { ...base, status: "failed" as const, loot: { wave: 6, key: "head:cone", name: "Traffic cone" } };
    const v = rewardsView(failed, true, 7, undefined, names);
    expect(v.status).toBe("Couldn't save this run");
    expect(v.items).toEqual([{ kind: "lost", text: "Couldn't save the bag's item", sub: "(found in wave 6)", key: null, big: true, slot: -1 }]);
    expect(rewardsView({ ...failed, status: "not_saved" }, true, 7, undefined, names).items[0]?.text).toBe("Found in wave 6: Traffic cone"); // B23: an unsaved guest still sees it
  });

  it("an unsaved bank still shows the find; nothing for a message of another run; empty groups take no rows", () => {
    expect(rewardsView({ ...base, status: "not_saved", loot: { wave: 3, key: "head:pot", name: "Cooking pot" } }, true, 7).items).toHaveLength(1);
    expect(rewardsView({ ...base, loot: { wave: 3, key: "head:pot", name: "Cooking pot" } }, true, 8).items).toEqual([]);
    const v = rewardsView(base, true, 7);
    expect([v.items.length, v.unlocks.length]).toEqual([0, 0]);
  });
});
