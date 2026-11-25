import { describe, expect, it } from "vitest";
import type { RunRewards } from "@topdown/shared";
import { COLLECTOR_TEXT, REWARD_GROUPS, rewardsView } from "./rewardsModel";

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
  });

  it("an unsaved bank still shows the find; nothing for a message of another run; empty groups take no rows", () => {
    expect(rewardsView({ ...base, status: "not_saved", loot: { wave: 3, key: "head:pot", name: "Cooking pot" } }, true, 7).items).toHaveLength(1);
    expect(rewardsView({ ...base, loot: { wave: 3, key: "head:pot", name: "Cooking pot" } }, true, 8).items).toEqual([]);
    const v = rewardsView(base, true, 7);
    expect([v.items.length, v.unlocks.length]).toEqual([0, 0]);
  });
});
