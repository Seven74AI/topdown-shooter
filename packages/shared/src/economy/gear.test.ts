import { describe, expect, it } from "vitest";
import { loadBalance } from "../config/balance";
import { loadDevBalance } from "../config/devBalance";
import { createWorld, type World } from "../core/world";
import { addPlayer, type PlayerState } from "../player/player";
import { startBuild, startWave } from "../run/runStateMachine";
import { downPlayer, returnOutPlayers } from "../player/downed";
import { allGear, armorBonus, buyGear, effectiveMaxHp, gearBit, gearIds, ownsGear, reviveTicksFor, shopGear, speedBonusPct } from "./gear";
import { buyItem, buyWeapon, upgradeWeapon } from "./shop";

const balance = loadBalance();
const NO_WAVES = { waves: () => {} };

function setup(wallet: number, b = balance): { world: World; p: PlayerState } {
  const world = createWorld({ balance: b, seed: 7, systems: NO_WAVES });
  addPlayer(world, "p0", 10, 10);
  startBuild(world);
  const p = world.players.get("p0") as PlayerState;
  p.wallet = wallet;
  return { world, p };
}

const A1 = "body_armor_1";
const A2 = "body_armor_2";

describe("gear table (Story 5.11)", () => {
  it("bit order is gear.json key order; the shop lists 4 items, the flashlight is hidden", () => {
    expect(gearIds(balance)).toEqual([A1, A2, "running_shoes", "revive_kit", "tactical_flashlight"]);
    expect([A1, A2, "running_shoes", "revive_kit", "tactical_flashlight"].map((id) => gearBit(balance, id))).toEqual([1, 2, 4, 8, 16]);
    expect(gearBit(balance, "jetpack")).toBe(0);
    expect(shopGear(balance).map((g) => [g.id, g.price])).toEqual([
      [A1, 150],
      [A2, 350],
      ["running_shoes", 150],
      ["revive_kit", 150],
    ]);
    expect(allGear(balance)).toHaveLength(5);
  });

  it("armor bonus is the best tier only; speed bonus 10 %; revive kit 30 ticks, else 60", () => {
    expect(armorBonus(balance, 0)).toBe(0);
    expect(armorBonus(balance, 1)).toBe(25);
    expect(armorBonus(balance, 2)).toBe(50);
    expect(armorBonus(balance, 3)).toBe(50); // never 75
    expect(effectiveMaxHp(balance, 3)).toBe(150);
    expect(speedBonusPct(balance, 4)).toBe(10);
    expect(speedBonusPct(balance, 1 | 2 | 8 | 16)).toBe(0);
    expect(reviveTicksFor(balance, 8)).toBe(30);
    expect(reviveTicksFor(balance, 0)).toBe(60);
    expect(reviveTicksFor(balance, 4)).toBe(60);
  });
});

describe("buyGear refusals, in order (Story 5.11)", () => {
  it("not_build → unknown_player → not_for_sale → already_owned → insufficient_funds; nothing changes", () => {
    const { world, p } = setup(1000);
    startWave(world);
    expect(buyGear(world, "p0", A1)).toEqual({ ok: false, error: "not_build" }); // G6
    expect(buyGear(world, "nobody", "jetpack")).toEqual({ ok: false, error: "not_build" });
    const s = setup(100);
    expect(buyGear(s.world, "nobody", "jetpack")).toEqual({ ok: false, error: "unknown_player" });
    expect(buyGear(s.world, "p0", "jetpack")).toEqual({ ok: false, error: "not_for_sale" });
    expect(buyGear(s.world, "p0", "tactical_flashlight")).toEqual({ ok: false, error: "not_for_sale" }); // G5
    expect(buyGear(s.world, "p0", A1)).toEqual({ ok: false, error: "insufficient_funds" });
    expect(s.p.wallet).toBe(100);
    expect(s.p.gear).toBe(0);
    s.p.wallet = 150;
    expect(buyGear(s.world, "p0", A1)).toEqual({ ok: true, value: { item: A1, price: 150 } });
    expect(buyGear(s.world, "p0", A1)).toEqual({ ok: false, error: "already_owned" }); // G1, before the money check
    expect(s.p.wallet).toBe(0);
    expect(p.gear).toBe(0);
  });

  it("buyItem dispatches gear ids and refuses others in the same order", () => {
    const { world, p } = setup(200);
    expect(buyItem(world, "p0", "running_shoes")).toEqual({ ok: true, value: { item: "running_shoes", price: 150 } });
    expect(ownsGear(balance, p, "running_shoes")).toBe(true);
    expect(buyItem(world, "p0", "medkit_xl")).toEqual({ ok: false, error: "not_for_sale" });
    expect(buyItem(world, "ghost", "medkit_xl")).toEqual({ ok: false, error: "unknown_player" });
    startWave(world);
    expect(buyItem(world, "p0", "medkit_xl")).toEqual({ ok: false, error: "not_build" });
    expect(p.wallet).toBe(50);
  });

  it("the flashlight is sold with the dev switch (shopAll): bit set, no other effect", () => {
    const dev = loadDevBalance({ zombieDamageScale: null, shopAll: true });
    expect(dev.version).not.toBe(balance.version);
    expect(shopGear(dev).map((g) => g.id)).toContain("tactical_flashlight");
    const { world, p } = setup(120, dev);
    expect(buyGear(world, "p0", "tactical_flashlight").ok).toBe(true);
    expect(p.gear).toBe(16);
    expect(p.maxHp).toBe(100);
    expect(p.wallet).toBe(0);
  });
});

describe("review M1 (G6): only a standing player shops", () => {
  it("downed or out in a build phase → not_alive (before the item checks); nothing changes; gear and weapons alike", () => {
    for (const status of ["downed", "out"] as const) {
      const { world, p } = setup(1000);
      p.status = status;
      p.hp = 0;
      expect(buyGear(world, "p0", "body_armor_1")).toEqual({ ok: false, error: "not_alive" });
      expect(buyGear(world, "p0", "jetpack")).toEqual({ ok: false, error: "not_alive" });
      expect(buyItem(world, "p0", "medkit_xl")).toEqual({ ok: false, error: "not_alive" });
      expect(buyWeapon(world, "p0", "smg", null)).toEqual({ ok: false, error: "not_alive" });
      expect(upgradeWeapon(world, "p0", "pistol")).toEqual({ ok: false, error: "not_alive" });
      expect(p.loadout.slots[0].level).toBe(1);
      expect([p.hp, p.maxHp, p.gear, p.wallet, p.loadout.slots[1]]).toEqual([0, 100, 0, 1000, null]);
      p.status = "alive";
      expect(buyGear(world, "p0", "body_armor_1").ok).toBe(true);
    }
  });
});

describe("mutation survivor: owning a non-armor item refuses it again", () => {
  it("buy shoes twice → already_owned, charged once", () => {
    const { world, p } = setup(400);
    expect(buyGear(world, "p0", "running_shoes").ok).toBe(true);
    expect(buyGear(world, "p0", "running_shoes")).toEqual({ ok: false, error: "already_owned" });
    expect(p.wallet).toBe(250);
    expect(p.gear).toBe(4);
  });
});

describe("body armor (Story 5.11, AC 4)", () => {
  it("armor I: 100/100 → 125/125, wallet −150", () => {
    const { world, p } = setup(150);
    buyGear(world, "p0", A1);
    expect([p.hp, p.maxHp, p.wallet, p.gear]).toEqual([125, 125, 0, 1]);
  });

  it("G3: bought at 10 HP gives +25 (the bonus only)", () => {
    const { world, p } = setup(150);
    p.hp = 10;
    buyGear(world, "p0", A1);
    expect([p.hp, p.maxHp]).toEqual([35, 125]);
  });

  it("G2: II while owning I → max 150 (+50 total), HP +25, bit I cleared; full price 350 (D3)", () => {
    const { world, p } = setup(500);
    buyGear(world, "p0", A1);
    expect(buyGear(world, "p0", A2)).toEqual({ ok: true, value: { item: A2, price: 350 } });
    expect([p.hp, p.maxHp, p.wallet, p.gear]).toEqual([150, 150, 0, 2]);
  });

  it("G1: II owned → I is already_owned, wallet unchanged", () => {
    const { world, p } = setup(500);
    buyGear(world, "p0", A2);
    expect([p.hp, p.maxHp]).toEqual([150, 150]);
    expect(buyGear(world, "p0", A1)).toEqual({ ok: false, error: "already_owned" });
    expect(p.wallet).toBe(150);
    expect(p.gear).toBe(2);
  });

  it("heal caps use the new max: build heal, return HP, revive HP", () => {
    const { world, p } = setup(150);
    buyGear(world, "p0", A1);
    addPlayer(world, "p1", 30, 10);
    startWave(world);
    p.hp = 100;
    returnOutPlayers(world); // the build heal: +50 % of 125 = 62.5, capped at 125
    expect(p.hp).toBe(125);
    downPlayer(world, p);
    returnOutPlayers(world); // returns with 50 % of 125
    expect(p.hp).toBe(62.5);
    expect(p.maxHp).toBe(125);
  });
});

describe("persistence (Story 5.11, AC 2)", () => {
  it("gear and max HP stay through downed, out, return and build starts", () => {
    const { world, p } = setup(300);
    addPlayer(world, "p1", 30, 10);
    buyGear(world, "p0", A1);
    buyGear(world, "p0", "revive_kit");
    for (let w = 0; w < 3; w++) {
      startWave(world);
      downPlayer(world, p);
      p.status = "out";
      startBuild(world);
      expect(p.status).toBe("alive");
      expect(p.gear).toBe(1 | 8);
      expect(p.maxHp).toBe(125);
    }
  });
});
