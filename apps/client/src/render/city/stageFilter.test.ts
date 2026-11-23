import { describe, expect, it } from "vitest";
import { DOWNTOWN_MAP, createObstacles } from "@topdown/shared";
import { blockNames, drawnWalls, hazardsAt, stageGroupAt, staticKey } from "./stageFilter";
import { downtownScene } from "./testScene";
import { CAR_COLORS, DOWNTOWN_DRESSING, carStyle } from "./dressing";

const names = (l: readonly { name: string }[]): string[] => l.map((o) => o.name).sort();

describe("what the static city draws at a stage", () => {
  it("hazards only once their stage is reached (gas leak 2); fire zones never (fires come from decay.fires)", () => {
    expect(hazardsAt(DOWNTOWN_MAP, 1)).toEqual([]);
    expect(names(hazardsAt(DOWNTOWN_MAP, 2))).toEqual(["gas_leak_zone"]);
    expect(names(hazardsAt(DOWNTOWN_MAP, 3))).toEqual(["gas_leak_zone"]);
    for (const h of DOWNTOWN_MAP.hazards) for (let s = 1; s <= 5; s++) expect(hazardsAt(DOWNTOWN_MAP, s).includes(h)).toBe(h.minStage <= s && h.kind !== "fire");
  });
  it("only the burning car chosen this run is on fire (4.5 variants)", () => {
    // Story 4.7: bits 0–5 are the moved cars, 6–7 the two fire candidates.
    expect(downtownScene(2, 0b11001111).fires).toEqual([]);
    expect(downtownScene(3, 0b01001111).fires.map((f) => f.target)).toEqual(["parked_car_2"]);
    expect(downtownScene(3, 0b10001111).fires.map((f) => f.target)).toEqual(["street_car_west"]);
  });
  it("stage groups swap over the stage-1 base (architecture: DecayView swaps stageN_* groups)", () => {
    const at = (s: number): string[] => names(stageGroupAt(DOWNTOWN_MAP, s));
    expect(at(1)).toEqual([]);
    expect(at(2)).toEqual(["debris_east", "debris_west"]);
    expect(at(3)).toEqual(["debris_mid", "debris_south"]);
    expect(at(4)).toEqual([]);
  });
  it("cover comes from the active obstacle list: the barrier from stage 2, sandbags from 3, mutations applied", () => {
    const kinds = (s: number): string[] => createObstacles(DOWNTOWN_MAP, s).cover.map((c) => c.kind);
    expect(kinds(1)).not.toContain("barrier");
    expect(kinds(2)).toContain("barrier");
    expect(kinds(2)).not.toContain("sandbags");
    expect(kinds(3)).toContain("sandbags");
    // Story 4.7: a moved car (bit 0) leaves the curb and appears in the road; police lines from stage 2.
    const s2 = names(downtownScene(2, 0b01001111).cover);
    expect(s2).toContain("curb_car_west_far_in_road");
    expect(s2).not.toContain("curb_car_west_far");
    expect(s2).toEqual(expect.arrayContaining(["police_line_lot", "police_line_gas"]));
    expect(s2).not.toContain("parked_car_3");
  });
  it("walls come from obstacles.walls: the bus's twin is skipped, the dumpster (a block) appears at stage 2", () => {
    const s1 = downtownScene(1);
    expect(names(drawnWalls(s1.walls, s1.cover))).not.toContain("city_bus");
    expect(names(drawnWalls(s1.walls, s1.cover.filter((c) => c.kind !== "bus")))).toContain("city_bus");
    expect(names(drawnWalls(s1.walls, s1.cover))).not.toContain("dumpster_alley_3");
    const s2 = downtownScene(2);
    expect(names(drawnWalls(s2.walls, s2.cover))).toContain("dumpster_alley_3");
    expect(blockNames(DOWNTOWN_MAP).has("dumpster_alley_3")).toBe(true);
  });
  it("staticKey changes with the stage, the obstacles version and the fire count", () => {
    expect(staticKey(1, 0, 0)).not.toBe(staticKey(2, 0, 0));
    expect(staticKey(2, 0, 0)).not.toBe(staticKey(2, 1, 0));
    expect(staticKey(3, 4, 0)).not.toBe(staticKey(3, 4, 1));
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

describe("random streams per thing (review L: roofs never shift when stage debris appears)", () => {
  it("a thing's stream depends only on its own key", async () => {
    const { rng } = await import("./drawCity");
    const a1 = rng("se_offices");
    const first = [a1(), a1(), a1()];
    const other = rng("debris_west");
    for (let i = 0; i < 50; i++) other(); // another object drawing first
    const a2 = rng("se_offices");
    expect([a2(), a2(), a2()]).toEqual(first);
    expect(rng("nw_apartments")()).not.toBe(first[0]);
  });
  it("keys that share a prefix or differ only at the end still give different streams (re-review L4)", async () => {
    const { rng } = await import("./drawCity");
    const keys = ["debris_east", "debris_west", "debris_wesX", "parked_car_2", "parked_car_3", "ground_cracks", "ground_litter", "ground_patches", "se_offices", "sw_offices"];
    const firsts = keys.map((k) => {
      const r = rng(k);
      return [r(), r(), r()].join(",");
    });
    expect(new Set(firsts).size).toBe(keys.length);
  });
});
