import { describe, expect, it } from "vitest";
import { buildingStats, loadBalance, type BuildingTypeStats } from "@topdown/shared";
import { rangeRings } from "./rangeRings";

/** Story 5.17 (AC 7): range rings read generically from balance. */
const balance = loadBalance();
describe("rangeRings", () => {
  it("turret rangeM (not projectileRangeM); mine trigger and blast; none for a barricade", () => {
    expect(rangeRings(buildingStats(balance, "auto_turret"))).toEqual([{ key: "turret.rangeM", radiusM: 8 }]);
    expect(rangeRings(buildingStats(balance, "mine"))).toEqual([
      { key: "mine.triggerRadiusM", radiusM: 1 },
      { key: "mine.blastRadiusM", radiusM: 2.5 },
    ]);
    expect(rangeRings(buildingStats(balance, "wood_barricade"))).toEqual([]);
    expect(rangeRings(buildingStats(balance, "spike_trap"))).toEqual([]);
    expect(rangeRings(undefined)).toEqual([]);
  });
  it("a later type's heal / light / plate radius gets a ring with no UI change (5.10, 5.14)", () => {
    const base = buildingStats(balance, "wood_barricade") as BuildingTypeStats;
    const med = { ...base, heal: { radiusM: 2, hpPerS: 5 } } as unknown as BuildingTypeStats;
    const flood = { ...base, light: { radiusM: 4 } } as unknown as BuildingTypeStats;
    const bear = { ...base, bearTrap: { plateRadiusM: 0.4, holdS: 3 } } as unknown as BuildingTypeStats;
    expect(rangeRings(med)).toEqual([{ key: "heal.radiusM", radiusM: 2 }]);
    expect(rangeRings(flood)).toEqual([{ key: "light.radiusM", radiusM: 4 }]);
    expect(rangeRings(bear)).toEqual([{ key: "bearTrap.plateRadiusM", radiusM: 0.4 }]);
  });
  it("cached: the same array every call (no allocation per frame)", () => {
    const s = buildingStats(balance, "mine");
    expect(rangeRings(s)).toBe(rangeRings(s));
  });
});
