import { describe, expect, it } from "vitest";
import { loadBalance } from "@topdown/shared";
import { BuildSpend } from "./buildSpend";

const balance = loadBalance();

describe("Story 5.20: BuildSpend (my spend per building this build phase, from events)", () => {
  it("my place at the type's price, my upgrades add their step; teammates' don't count; build.started forgets; sold/destroyed drop", () => {
    const s = new BuildSpend();
    s.handle({ type: "building.placed", buildingId: 4, buildingType: "wood_barricade", ownerId: "p0", gx: 1, gy: 1, rot: 0 }, "p0", balance);
    s.handle({ type: "building.placed", buildingId: 5, buildingType: "auto_turret", ownerId: "p1", gx: 9, gy: 1, rot: 0 }, "p0", balance);
    s.handle({ type: "building.upgraded", buildingId: 4, playerId: "p0", cost: 50, toType: "reinforced_barricade", x: 0, y: 0 }, "p0", balance);
    expect([s.spentOn(4), s.spentOn(5), s.spentOn(6)]).toEqual([90, 0, 0]);
    s.handle({ type: "build.started", wave: 2 }, "p0", balance);
    expect(s.spentOn(4)).toBe(0);
    s.handle({ type: "building.upgraded", buildingId: 4, playerId: "p0", cost: 70, toType: "metal_barricade", x: 0, y: 0 }, "p0", balance);
    expect(s.spentOn(4)).toBe(70);
    s.handle({ type: "building.sold", buildingId: 4, buildingType: "metal_barricade", ownerId: "p0", rot: 0, refund: 115, x: 0, y: 0 }, "p0", balance);
    expect(s.spentOn(4)).toBe(0);
  });
});
