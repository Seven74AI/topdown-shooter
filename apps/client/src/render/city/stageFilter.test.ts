import { describe, expect, it } from "vitest";
import { DOWNTOWN_MAP, createObstacles } from "@topdown/shared";
import { hazardsAt, propsAt, staticKey, staticSolids } from "./stageFilter";
import { CAR_COLORS, DOWNTOWN_DRESSING, carStyle } from "./dressing";

const names = (l: readonly { name: string }[]): string[] => l.map((o) => o.name).sort();

describe("what the static city draws at a stage", () => {
  it("hazards only once their stage is reached (gas leak 2, car fires 3)", () => {
    expect(hazardsAt(DOWNTOWN_MAP, 1)).toEqual([]);
    expect(names(hazardsAt(DOWNTOWN_MAP, 2))).toEqual(["gas_leak_zone"]);
    expect(names(hazardsAt(DOWNTOWN_MAP, 3))).toEqual(["fire_parked_car_2", "fire_street_car_west", "gas_leak_zone"]);
    for (const h of DOWNTOWN_MAP.hazards) for (let s = 1; s <= 5; s++) expect(hazardsAt(DOWNTOWN_MAP, s).includes(h)).toBe(h.minStage <= s);
  });
  it("stage props are cumulative: debris that fell at stage 2 is still there at 3", () => {
    const at = (s: number): string[] => names(propsAt(DOWNTOWN_MAP, s).filter((p) => p.kind === "debris"));
    expect(at(1)).toEqual([]);
    expect(at(2)).toEqual(["debris_east", "debris_west"]);
    expect(at(3)).toEqual(["debris_east", "debris_mid", "debris_south", "debris_west"]);
    expect(propsAt(DOWNTOWN_MAP, 1).length).toBe(DOWNTOWN_MAP.stages[0]?.length);
  });
  it("cover comes from the active obstacle list: the barrier from stage 2, sandbags from 3", () => {
    const kinds = (s: number): string[] => createObstacles(DOWNTOWN_MAP, s).cover.map((c) => c.kind);
    expect(kinds(1)).not.toContain("barrier");
    expect(kinds(2)).toContain("barrier");
    expect(kinds(2)).not.toContain("sandbags");
    expect(kinds(3)).toContain("sandbags");
  });
  it("the bus's collision copy is skipped while its cover twin is drawn, kept if the twin is gone", () => {
    const cover = createObstacles(DOWNTOWN_MAP, 1).cover;
    expect(names(staticSolids(DOWNTOWN_MAP, cover))).not.toContain("city_bus");
    expect(staticSolids(DOWNTOWN_MAP, cover)).toHaveLength(DOWNTOWN_MAP.solids.length - 1);
    expect(names(staticSolids(DOWNTOWN_MAP, cover.filter((c) => c.kind !== "bus")))).toContain("city_bus");
  });
  it("staticKey changes with the stage and with the obstacles version", () => {
    expect(staticKey(1, 0)).not.toBe(staticKey(2, 0));
    expect(staticKey(2, 0)).not.toBe(staticKey(2, 1));
  });
});

describe("car styles", () => {
  it("named cars use the dressing; a car added by a mutation gets a stable colour and a front along its length", () => {
    expect(carStyle(DOWNTOWN_DRESSING, "street_car_west", 4.5, 2)).toEqual({ front: "right", variant: 3 });
    const a = carStyle(DOWNTOWN_DRESSING, "moved_car_9", 2, 4.5);
    expect(a).toEqual(carStyle(DOWNTOWN_DRESSING, "moved_car_9", 2, 4.5));
    expect(["up", "down"]).toContain(a.front);
    expect(a.variant).toBeLessThan(CAR_COLORS.length);
    expect(["left", "right"]).toContain(carStyle(DOWNTOWN_DRESSING, "moved_car_9", 4.5, 2).front);
  });
});
