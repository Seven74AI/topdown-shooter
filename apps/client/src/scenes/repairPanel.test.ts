import { describe, expect, it } from "vitest";
import { addPlayer, createWorld, loadBalance, placeBuilding, removeBuilding, startBuild, startWave, type Building, type World } from "@topdown/shared";
import { RepairPanel, repairRefusalText } from "./repairPanel";

const balance = loadBalance();
const names = (id: string) => (id === "p1" ? "Bo" : id);

function setup(): { world: World; b: Building } {
  const world = createWorld({ balance, seed: 1, systems: { waves: () => {} } });
  addPlayer(world, "p0", 10, 10);
  addPlayer(world, "p1", 30, 20);
  startBuild(world);
  const r = placeBuilding(world, "p1", { type: "wood_barricade", gx: 10, gy: 14, rot: 0 });
  if (!r.ok) throw new Error(r.error);
  return { world, b: r.value };
}

describe("RepairPanel (Story 3.7)", () => {
  it("a tap on a damaged teammate's barricade opens it with the name, HP, owner and the full-repair cost", () => {
    const { world, b } = setup();
    b.hp = 100;
    const p = new RepairPanel();
    p.tap(world, (b.minX + b.maxX) / 2, b.maxY + 0.25); // inside the 0.4 m tolerance of the 0.5 m barricade
    expect(p.update(world, "p0", true, names)).toBe(true);
    expect(p.id).toBe(b.id);
    expect(p.info).toBe("Wood barricade · Bo's\nHP 100 / 200");
    expect(p.label).toBe("Repair $20");
    expect(p.reason).toBe("");
    expect(p.error).toBeNull();
  });

  it("my own building has no owner tag; full HP and too little money show the reason; texts follow the HP", () => {
    const { world, b } = setup();
    const p = new RepairPanel();
    p.tap(world, (b.minX + b.maxX) / 2, (b.minY + b.maxY) / 2);
    p.update(world, "p1", true, names);
    expect(p.info).toBe("Wood barricade\nHP 200 / 200");
    expect(p.reason).toBe("Nothing to repair");
    b.hp = 12.3; // synced HP is rounded up
    const me = world.players.get("p1");
    if (!me) throw new Error("no p1");
    me.wallet = 5;
    p.update(world, "p1", true, names);
    expect(p.info).toBe("Wood barricade\nHP 13 / 200");
    expect(p.reason).toBe("Not enough money");
  });

  it("closes on a tap on empty ground, when not allowed, when the building is gone; press returns the id once", () => {
    const { world, b } = setup();
    b.hp = 10;
    const p = new RepairPanel();
    p.tap(world, (b.minX + b.maxX) / 2, (b.minY + b.maxY) / 2);
    p.tap(world, b.maxX + 5, b.maxY + 5);
    expect(p.open).toBe(false);
    p.tap(world, (b.minX + b.maxX) / 2, (b.minY + b.maxY) / 2);
    expect(p.update(world, "p0", false, names)).toBe(false);
    p.tap(world, (b.minX + b.maxX) / 2, (b.minY + b.maxY) / 2);
    removeBuilding(world, b.id);
    expect(p.update(world, "p0", true, names)).toBe(false);
    const { world: w2, b: b2 } = setup();
    p.tap(w2, (b2.minX + b2.maxX) / 2, (b2.minY + b2.maxY) / 2);
    expect(p.press()).toBe(b2.id);
    expect(p.press()).toBe(0);
    startWave(w2);
    p.tap(w2, (b2.minX + b2.maxX) / 2, (b2.minY + b2.maxY) / 2);
    expect(p.update(w2, "p0", true, names)).toBe(true); // `allowed` is the scene's call; the reason says why
    expect(p.reason).toBe("Only during the build phase");
  });

  it("closes when the wave number changed, even if the phase is build again (hidden tab slept through a wave; 3.7 review)", () => {
    const { world, b } = setup();
    b.hp = 100;
    const p = new RepairPanel();
    p.tap(world, (b.minX + b.maxX) / 2, (b.minY + b.maxY) / 2);
    expect(p.update(world, "p0", true, names)).toBe(true);
    world.waves.number += 1; // a whole wave passed between two frames
    expect(p.update(world, "p0", true, names)).toBe(false);
  });

  it("has a text for every refusal", () => {
    expect(repairRefusalText("money")).toBe("Not enough money");
    expect(repairRefusalText("full_hp")).toBe("Nothing to repair");
    expect(repairRefusalText("not_build_phase")).toBe("Only during the build phase");
    expect(repairRefusalText("gone")).toBe("That building is gone");
    expect(repairRefusalText("unknown_player")).toBe("Can't repair that");
  });
});
