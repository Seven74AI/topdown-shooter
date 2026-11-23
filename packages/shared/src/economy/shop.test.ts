import { describe, expect, it } from "vitest";
import { BalanceError, bundledBalanceFiles, loadBalance, type Balance } from "../config/balance";
import { createWorld, type World } from "../core/world";
import { setLoadout } from "../combat/loadout";
import { addPlayer, type PlayerState } from "../player/player";
import { startBuild, startWave } from "../run/runStateMachine";
import { botShopPick, buyWeapon, shopBuildings, shopPrice, shopWeapons, titleCase, weaponName } from "./shop";

const balance = loadBalance();
const NO_WAVES = { waves: () => {} };

/** One player in a build phase with `wallet` money and the given loadout. */
function setup(wallet: number, weapons: readonly [string, string | null] = ["pistol", null]): { world: World; p: PlayerState } {
  const world = createWorld({ balance, seed: 7, systems: NO_WAVES });
  addPlayer(world, "p0", 10, 10);
  startBuild(world);
  const p = world.players.get("p0") as PlayerState;
  p.wallet = wallet;
  setLoadout(balance, p.loadout, weapons);
  return { world, p };
}

const ids = (p: PlayerState) => [p.loadout.slots[0].weapon, p.loadout.slots[1]?.weapon ?? null];

describe("shop list (Story 3.3)", () => {
  it("lists Pistol 0, Machete 150, SMG 200, Hunting Rifle 350, Shotgun 250, Assault Rifle 450 from balance, in shop order", () => {
    expect(shopWeapons(balance).map((w) => [w.id, w.price])).toEqual([
      ["pistol", 0],
      ["machete", 150],
      ["smg", 200],
      ["hunting_rifle", 350],
      ["shotgun", 250],
      ["assault_rifle", 450],
    ]);
    expect(shopWeapons(balance).map((w) => w.name)).toEqual(["Pistol", "Machete", "SMG", "Hunting Rifle", "Shotgun", "Assault Rifle"]);
    expect(weaponName(balance, "smg")).toBe("SMG");
    expect(weaponName(balance, "big_gun")).toBe("Big Gun");
    expect(shopPrice(balance, "smg")).toBe(200);
    expect(shopPrice(balance, "rocket")).toBeNull();
  });

  it("prices follow weapons.json (no second copy)", () => {
    const files = bundledBalanceFiles();
    (files.weapons as Record<string, { price: number }>).smg!.price = 222;
    expect(shopPrice(loadBalance(files), "smg")).toBe(222);
  });

  it("loadBalance refuses a shop id that is not a weapon", () => {
    const files = bundledBalanceFiles();
    (files.shop as { weapons: string[] }).weapons.push("rocket");
    expect(() => loadBalance(files)).toThrow(BalanceError);
    expect(() => loadBalance(files)).toThrow(/shop\.json: weapons\.\d+: unknown weapon rocket/);
  });

  it("buildings: the bundled buildings.json lists the Wood barricade (3.4) and the Auto-turret (3.6)", () => {
    expect(shopBuildings(balance)).toEqual([
      { id: "wood_barricade", name: "Wood barricade", price: 40 },
      { id: "auto_turret", name: "Auto-turret", price: 250 },
    ]);
  });

  it("buildings: every type with a price, named by `name` or the Title-Cased id (3.4 contract)", () => {
    const fake = (block: unknown) => ({ ...balance, buildings: block }) as unknown as Balance;
    expect(shopBuildings(fake({ wood_barricade: { price: 40, hp: 100 }, gridM: 1 }))).toEqual([{ id: "wood_barricade", name: "Wood Barricade", price: 40 }]);
    expect(shopBuildings(fake({ types: { auto_turret: { price: 250, name: "Turret" } } }))).toEqual([{ id: "auto_turret", name: "Turret", price: 250 }]);
  });

  it("titleCase", () => {
    expect(titleCase("hunting_rifle")).toBe("Hunting Rifle");
    expect(titleCase("smg")).toBe("Smg");
  });
});

describe("buyWeapon (Story 3.3)", () => {
  it("fills the empty second slot and charges the price", () => {
    const { world, p } = setup(250);
    const r = buyWeapon(world, "p0", "smg", null);
    expect(r).toEqual({ ok: true, value: { slot: 1 } });
    expect(ids(p)).toEqual(["pistol", "smg"]);
    expect(p.wallet).toBe(50);
    expect(p.loadout.slots[1]?.ammo).toBe(40); // a full magazine
  });

  it("an empty second slot is filled even when a slot is asked for", () => {
    const { world, p } = setup(250);
    expect(buyWeapon(world, "p0", "machete", 0)).toEqual({ ok: true, value: { slot: 1 } });
    expect(ids(p)).toEqual(["pistol", "machete"]);
  });

  it("not enough money: insufficient_funds and nothing changes", () => {
    const { world, p } = setup(100);
    expect(buyWeapon(world, "p0", "smg", null)).toEqual({ ok: false, error: "insufficient_funds" });
    expect(ids(p)).toEqual(["pistol", null]);
    expect(p.wallet).toBe(100);
  });

  it("exactly enough money is enough", () => {
    const { world, p } = setup(150);
    expect(buyWeapon(world, "p0", "machete", null).ok).toBe(true);
    expect(p.wallet).toBe(0);
  });

  it("both slots full: a slot is required; the replaced weapon is lost", () => {
    const { world, p } = setup(1000, ["pistol", "machete"]);
    expect(buyWeapon(world, "p0", "smg", null)).toEqual({ ok: false, error: "slot_required" });
    expect(p.wallet).toBe(1000);
    expect(buyWeapon(world, "p0", "smg", 1)).toEqual({ ok: true, value: { slot: 1 } });
    expect(ids(p)).toEqual(["pistol", "smg"]);
    expect(buyWeapon(world, "p0", "hunting_rifle", 0)).toEqual({ ok: true, value: { slot: 0 } });
    expect(ids(p)).toEqual(["hunting_rifle", "smg"]);
    expect(p.wallet).toBe(1000 - 200 - 350);
  });

  it("replacing the weapon in my hands puts the new one in my hands (active index kept)", () => {
    const { world, p } = setup(1000, ["pistol", "machete"]);
    p.loadout.active = 1;
    buyWeapon(world, "p0", "smg", 1);
    expect(p.loadout.active).toBe(1);
    expect(p.loadout.slots[1]?.weapon).toBe("smg");
  });

  it("already owned: refused, free Pistol included", () => {
    const { world, p } = setup(1000, ["pistol", "machete"]);
    expect(buyWeapon(world, "p0", "machete", 0)).toEqual({ ok: false, error: "already_owned" });
    expect(buyWeapon(world, "p0", "pistol", 1)).toEqual({ ok: false, error: "already_owned" });
    expect(p.wallet).toBe(1000);
  });

  it("a replaced Pistol can be taken back for free", () => {
    const { world, p } = setup(200, ["smg", "machete"]);
    expect(buyWeapon(world, "p0", "pistol", 0)).toEqual({ ok: true, value: { slot: 0 } });
    expect(ids(p)).toEqual(["pistol", "machete"]);
    expect(p.wallet).toBe(200);
  });

  it("not for sale and unknown player", () => {
    const { world } = setup(1000);
    expect(buyWeapon(world, "p0", "rocket", null)).toEqual({ ok: false, error: "not_for_sale" });
    expect(buyWeapon(world, "p9", "smg", null)).toEqual({ ok: false, error: "unknown_player" });
  });

  it("only in a build phase (checked first)", () => {
    const { world, p } = setup(1000);
    startWave(world);
    expect(buyWeapon(world, "p0", "smg", null)).toEqual({ ok: false, error: "not_build" });
    expect(ids(p)).toEqual(["pistol", null]);
    expect(p.wallet).toBe(1000);
    const lobby = createWorld({ balance, seed: 1, systems: NO_WAVES });
    addPlayer(lobby, "p0", 1, 1);
    expect(buyWeapon(lobby, "p0", "smg", null)).toEqual({ ok: false, error: "not_build" });
  });

  it("earned is never reduced by buying", () => {
    const { world, p } = setup(500);
    p.earned = 400;
    buyWeapon(world, "p0", "smg", null);
    expect(p.earned).toBe(400);
  });
});

describe("botShopPick (A10 hook)", () => {
  it("the first affordable weapon of the list that is not owned", () => {
    const { p } = setup(0, ["pistol", "smg"]);
    const list = ["smg", "hunting_rifle", "machete"];
    expect(botShopPick(balance, 100, p.loadout, list)).toBeNull();
    expect(botShopPick(balance, 150, p.loadout, list)).toBe("machete");
    expect(botShopPick(balance, 400, p.loadout, list)).toBe("hunting_rifle");
    expect(botShopPick(balance, 400, p.loadout, ["rocket"])).toBeNull();
  });
});
