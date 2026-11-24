import { describe, expect, it } from "vitest";
import { UPGRADE_ERRORS, addPlayer, createWorld, loadBalance, placeBuilding, removeBuilding, setBuildingType, startBuild, startWave, upgradeBuilding, type Building, type World } from "@topdown/shared";
import { RepairPanel, repairRefusalText, upgradeRefusalText } from "./repairPanel";

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
    expect(p.info).toBe("Wood barricade · Bo's · HP 100/200\nOnly Bo can move, upgrade or\u00a0sell\u00a0it"); // Story 5.21 (AC 1, 2)
    expect(p.label).toBe("Repair $20");
    expect(p.reason).toBe("");
    expect(p.error).toBeNull();
  });

  it("my own building has no owner tag; full HP and too little money show the reason; texts follow the HP", () => {
    const { world, b } = setup();
    const p = new RepairPanel();
    p.tap(world, (b.minX + b.maxX) / 2, (b.minY + b.maxY) / 2);
    p.update(world, "p1", true, names);
    expect(p.info).toBe("Wood barricade · Yours · HP 200/200\n→ Reinforced barricade · 350 HP"); // Story 5.9: my own: the next tier
    expect(p.reason).toBe("Nothing to repair");
    b.hp = 12.3; // synced HP is rounded up
    const me = world.players.get("p1");
    if (!me) throw new Error("no p1");
    me.wallet = 5;
    p.update(world, "p1", true, names);
    expect(p.info).toBe("Wood barricade · Yours · HP 13/200\n→ Reinforced barricade · 350 HP");
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

describe("RepairPanel upgrade line (Story 5.9)", () => {
  const open = (world: World, b: Building, who: string): RepairPanel => {
    const p = new RepairPanel();
    p.tap(world, (b.minX + b.maxX) / 2, (b.minY + b.maxY) / 2);
    p.update(world, who, true, names);
    return p;
  };

  it("shows the next tier's name, HP and price on MY upgradable building only", () => {
    const { world, b } = setup();
    const mine = open(world, b, "p1");
    expect(mine.upgradeShown).toBe(true);
    expect(mine.upgradeLabel).toBe("Upgrade $50");
    expect(mine.info.split("\n")[1]).toBe("→ Reinforced barricade · 350 HP");
    expect(mine.upgradeReason).toBe("");
    const theirs = open(world, b, "p0");
    expect(theirs.upgradeShown).toBe(false);
    expect(theirs.info).not.toContain("→");
    setBuildingType(world, b, "metal_barricade");
    const top = open(world, b, "p1");
    expect(top.upgradeShown).toBe(false); // the strongest tier: no Upgrade
  });

  it("predicts the refusal text (money); pending after a press until the World shows the new tier", () => {
    const { world, b } = setup();
    const me = world.players.get("p1");
    if (!me) throw new Error("p1");
    me.wallet = 10;
    const p = open(world, b, "p1");
    expect(p.upgradeReason).toBe("Not enough money");
    me.wallet = 500;
    p.update(world, "p1", true, names);
    expect(p.upgradeReason).toBe("");
    expect(p.pressUpgrade(world)).toBe(b.id);
    expect(p.pressUpgrade(world)).toBe(0); // a second tap while pending sends nothing
    p.update(world, "p1", true, names);
    expect([p.open, p.upgradePending, p.upgradeLabel]).toEqual([true, true, "Upgrading…"]);
    expect(p.info).toBe("Wood barricade · Yours · HP 200/200"); // still the old tier: server truth
    upgradeBuilding(world, "p1", b.id); // what the next state patch carries
    p.update(world, "p1", true, names);
    expect(p.upgradePending).toBe(false);
    expect(p.info).toBe("Reinforced barricade · Yours · HP 350/350\n→ Metal barricade · 600 HP");
    expect(p.upgradeLabel).toBe("Upgrade $70");
    p.pressUpgrade(world);
    p.upgradeRefused(); // a refusal ends the wait
    p.update(world, "p1", true, names);
    expect(p.upgradeLabel).toBe("Upgrade $70");
  });

  it("has a text for every refusal reason", () => {
    for (const e of UPGRADE_ERRORS) expect(upgradeRefusalText(e).length).toBeGreaterThan(0);
  });
});

describe("Story 5.20: Sell / Take back in the panel (AC 8)", () => {
  it("my building: 'Take back +$40' when all of it was paid this phase, 'Sell +$20' otherwise; a teammate's has no Sell", () => {
    const { world, b } = setup();
    const p = new RepairPanel();
    p.tap(world, (b.minX + b.maxX) / 2, (b.minY + b.maxY) / 2);
    p.update(world, "p1", true, names, (id) => (id === b.id ? 40 : 0));
    expect([p.sellShown, p.sellLabelText, p.sellReason]).toEqual([true, "Take back +$40", ""]);
    p.update(world, "p1", true, names, () => 0);
    expect(p.sellLabelText).toBe("Sell +$20");
    setBuildingType(world, b, "metal_barricade");
    p.update(world, "p1", true, names, () => 70); // old wood → reinforced last phase, metal now
    expect(p.sellLabelText).toBe("Sell +$115"); // 70 + floor(0.5 × 90)
    p.update(world, "p0", true, names);
    expect(p.sellShown).toBe(false);
    expect(p.pressSell()).toBe(0);
  });

  it("pressSell sends my building's id and closes; downed: the reason shows and nothing is sent", () => {
    const { world, b } = setup();
    const p = new RepairPanel();
    p.tap(world, (b.minX + b.maxX) / 2, (b.minY + b.maxY) / 2);
    const me = world.players.get("p1");
    if (!me) throw new Error("p1");
    me.status = "downed";
    p.update(world, "p1", true, names);
    expect(p.sellReason).toBe("Not while you're down");
    expect(p.pressSell()).toBe(0);
    me.status = "alive";
    p.update(world, "p1", true, names);
    expect(p.pressSell()).toBe(b.id);
    expect(p.open).toBe(false);
  });
});

describe("Story 5.21 / 5.22: the action bar's button sets (F3)", () => {
  it("MY building: Move, Upgrade, Repair, Sell; a teammate's: Repair only + who may change it", () => {
    const { world, b } = setup(); // p1's barricade
    const mine = new RepairPanel();
    mine.tap(world, (b.minX + b.maxX) / 2, (b.minY + b.maxY) / 2);
    mine.update(world, "p1", true, names);
    expect([mine.moveShown, mine.upgradeShown, mine.sellShown, mine.moveErrorNow, mine.moveLabel]).toEqual([true, true, true, null, "Move"]);
    expect(mine.info).not.toContain("Only");
    const theirs = new RepairPanel();
    theirs.tap(world, (b.minX + b.maxX) / 2, (b.minY + b.maxY) / 2);
    theirs.update(world, "p0", true, names);
    expect([theirs.moveShown, theirs.upgradeShown, theirs.sellShown]).toEqual([false, false, false]);
    expect(theirs.info.split("\n")[1]).toBe("Only Bo can move, upgrade or\u00a0sell\u00a0it");
    expect(theirs.pressMove()).toBe(0); // F3: never picks up a teammate's
    expect(theirs.open).toBe(true);
  });

  it("pressMove picks my building up (the panel closes); not while a move of it waits ('Moving…'), not while I'm down", () => {
    const { world, b } = setup();
    const p = new RepairPanel();
    const tap = () => p.tap(world, (b.minX + b.maxX) / 2, (b.minY + b.maxY) / 2);
    tap();
    p.update(world, "p1", true, names, () => 0, (id) => id === b.id);
    expect([p.movePending, p.moveLabel, p.pressMove(), p.open]).toEqual([true, "Moving…", 0, true]);
    p.update(world, "p1", true, names, () => 0, () => false);
    expect(p.moveLabel).toBe("Move");
    const p1 = world.players.get("p1");
    if (!p1) throw new Error("p1");
    p1.status = "downed";
    p.update(world, "p1", true, names);
    expect([p.moveErrorNow, p.moveReason, p.pressMove()]).toEqual(["not_alive", "Not while you're down", 0]);
    p1.status = "alive";
    p.update(world, "p1", true, names);
    expect(p.pressMove()).toBe(b.id);
    expect(p.open).toBe(false);
  });

  it("a pick-up is never refused for its own spot (a teammate standing on my spike trap doesn't block picking it up)", () => {
    const { world } = setup();
    const owner = world.players.get("p1");
    if (owner) owner.wallet = 1000;
    const r = placeBuilding(world, "p1", { type: "spike_trap", gx: 40, gy: 40, rot: 0 });
    if (!r.ok) throw new Error(r.error);
    const p0 = world.players.get("p0");
    if (!p0) throw new Error("p0");
    p0.x = (r.value.minX + r.value.maxX) / 2;
    p0.y = (r.value.minY + r.value.maxY) / 2;
    const p = new RepairPanel();
    p.tap(world, p0.x, p0.y);
    p.update(world, "p1", true, names);
    expect([p.id, p.moveErrorNow]).toEqual([r.value.id, null]);
  });

  it("barReason: the first refusal among Upgrade, Repair (not full HP: the label says it), Sell, Move", () => {
    const { world, b } = setup();
    const p1 = world.players.get("p1");
    if (!p1) throw new Error("p1");
    const p = new RepairPanel();
    p.tap(world, (b.minX + b.maxX) / 2, (b.minY + b.maxY) / 2);
    p1.wallet = 0;
    p.update(world, "p1", true, names);
    expect(p.barReason).toBe("Not enough money"); // the upgrade (full HP: no repair reason)
    p1.wallet = 1000;
    p.update(world, "p1", true, names);
    expect(p.barReason).toBe("");
    b.hp = 10;
    p1.wallet = 5;
    setBuildingType(world, b, "metal_barricade", 10); // top tier: no upgrade
    p.update(world, "p1", true, names);
    expect([p.upgradeShown, p.barReason]).toEqual([false, "Not enough money"]); // the repair's
  });
});
