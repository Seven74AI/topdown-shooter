import { describe, expect, it } from "vitest";
import { bundledBalanceFiles, loadBalance, type RawBalanceFiles } from "../config/balance";
import { loadDevBalance } from "../config/devBalance";
import { createWorld, type World } from "../core/world";
import { addPlayer, type PlayerState } from "../player/player";
import { startBuild, startWave } from "../run/runStateMachine";
import { downPlayer, returnOutPlayers } from "../player/downed";
import { allGear, armorBonus, buyGear, effectiveMaxHp, gearBit, gearIds, ownsGear, reviveTicksFor, shopGear, speedBonusPct } from "./gear";
import { buyItem, upgradeWeapon } from "./shop";
import { buyCard } from "./shopCards";

const balance = loadBalance();
const NO_WAVES = { waves: () => {} };

/** Story 6.3: the bundled balance with the floodlight and the tactical flashlight hidden again (`inShop: false`): the not_for_sale path and the dev switch keep their tests. */
function hiddenFiles(): RawBalanceFiles {
  const raw = bundledBalanceFiles();
  ((raw.buildings as { types: Record<string, { inShop?: boolean }> }).types.floodlight as { inShop?: boolean }).inShop = false;
  ((raw.gear as { items: Record<string, { inShop?: boolean }> }).items.tactical_flashlight as { inShop?: boolean }).inShop = false;
  return raw;
}

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
  it("bit order is gear.json key order; the shop lists all 5 items (Story 6.3 D8: the flashlight from wave 1, 120)", () => {
    expect(gearIds(balance)).toEqual([A1, A2, "running_shoes", "revive_kit", "tactical_flashlight"]);
    expect([A1, A2, "running_shoes", "revive_kit", "tactical_flashlight"].map((id) => gearBit(balance, id))).toEqual([1, 2, 4, 8, 16]);
    expect(gearBit(balance, "jetpack")).toBe(0);
    expect(shopGear(balance).map((g) => [g.id, g.price])).toEqual([
      [A1, 150],
      [A2, 300],
      ["running_shoes", 150],
      ["revive_kit", 150],
      ["tactical_flashlight", 120],
    ]);
    expect(allGear(balance)).toHaveLength(5);
    expect(shopGear(loadBalance(hiddenFiles())).map((g) => g.id)).not.toContain("tactical_flashlight");
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
    const h = setup(100, loadBalance(hiddenFiles())); // Story 6.3: an inShop: false item (test balance)
    expect(buyGear(h.world, "p0", "tactical_flashlight")).toEqual({ ok: false, error: "not_for_sale" }); // G5
    expect(buyGear(s.world, "p0", A1)).toEqual({ ok: false, error: "insufficient_funds" });
    expect(s.p.wallet).toBe(100);
    expect(s.p.gear).toBe(0);
    s.p.wallet = 150;
    expect(buyGear(s.world, "p0", A1)).toEqual({ ok: true, value: { item: A1, price: 150 } });
    expect(buyGear(s.world, "p0", A1)).toEqual({ ok: false, error: "already_owned" }); // G1, before the money check
    expect(s.p.wallet).toBe(0);
    expect(p.gear).toBe(0);
  });

  it("Story 5.13: buyItem no longer sells gear (gear is a card); refuses others in the same order", () => {
    const { world, p } = setup(200);
    expect(buyItem(world, "p0", "running_shoes")).toEqual({ ok: false, error: "not_for_sale" });
    expect(ownsGear(balance, p, "running_shoes")).toBe(false);
    expect(buyGear(world, "p0", "running_shoes")).toEqual({ ok: true, value: { item: "running_shoes", price: 150 } });
    expect(buyItem(world, "p0", "medkit_xl")).toEqual({ ok: false, error: "not_for_sale" });
    expect(buyItem(world, "ghost", "medkit_xl")).toEqual({ ok: false, error: "unknown_player" });
    startWave(world);
    expect(buyItem(world, "p0", "medkit_xl")).toEqual({ ok: false, error: "not_build" });
    expect(p.wallet).toBe(50);
  });

  it("Story 6.3: the bundled flashlight is sold in the first build phase: bit set, no other effect (D9: nothing before a blackout)", () => {
    const { world, p } = setup(120);
    expect(buyGear(world, "p0", "tactical_flashlight")).toEqual({ ok: true, value: { item: "tactical_flashlight", price: 120 } });
    expect(p.gear).toBe(16);
    expect([p.maxHp, p.wallet]).toEqual([100, 0]);
  });

  it("a hidden (inShop: false, test balance) flashlight is sold with the dev switch (shopAll): bit set, no other effect", () => {
    const hidden = loadBalance(hiddenFiles());
    const dev = loadDevBalance({ zombieDamageScale: null, shopAll: true }, hiddenFiles());
    expect(dev.version).not.toBe(hidden.version);
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
      expect(buyCard(world, "p0", 0, 0, 0, "smg", null)).toEqual({ ok: false, error: "not_alive" });
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

  it("G2: II while owning I → max 150 (+50 total), HP +25, bit I cleared; full price 300 (D3; balance pass B9)", () => {
    const { world, p } = setup(500);
    buyGear(world, "p0", A1);
    expect(buyGear(world, "p0", A2)).toEqual({ ok: true, value: { item: A2, price: 300 } });
    expect([p.hp, p.maxHp, p.wallet, p.gear]).toEqual([150, 150, 50, 2]);
  });

  it("G1: II owned → I is already_owned, wallet unchanged", () => {
    const { world, p } = setup(500);
    buyGear(world, "p0", A2);
    expect([p.hp, p.maxHp]).toEqual([150, 150]);
    expect(buyGear(world, "p0", A1)).toEqual({ ok: false, error: "already_owned" });
    expect(p.wallet).toBe(200);
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
