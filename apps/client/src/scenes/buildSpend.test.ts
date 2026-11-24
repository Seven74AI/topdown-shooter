import { describe, expect, it } from "vitest";
import { addPlayer, createWorld, loadBalance, placeBuilding, startBuild } from "@topdown/shared";
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

  it("review M1: my med station bought this phase that heals someone (on the World I see) is marked used: label 'Sell'", () => {
    const world = createWorld({ balance, seed: 1, systems: { waves: () => {} } });
    addPlayer(world, "p0", 30, 16);
    startBuild(world);
    const me = world.players.get("p0");
    if (!me) throw new Error("p0");
    me.wallet = 1000;
    const r = placeBuilding(world, "p0", { type: "med_station", gx: 61, gy: 31, rot: 0 });
    if (!r.ok) throw new Error(r.error);
    const s = new BuildSpend();
    s.handle({ type: "building.placed", buildingId: r.value.id, buildingType: "med_station", ownerId: "p0", gx: 61, gy: 31, rot: 0 }, "p0", balance);
    s.watchUsed(world, "p0");
    expect(s.spentOn(r.value.id)).toBe(400); // full HP: no use yet
    me.hp = 40;
    s.watchUsed(world, "p0");
    expect(s.spentOn(r.value.id)).toBe(0); // healing me now: the take-back falls to the sell share
  });
});
