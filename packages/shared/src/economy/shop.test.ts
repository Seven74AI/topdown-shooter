import { describe, expect, it } from "vitest";
import { loadBalance, type Balance } from "../config/balance";
import { createWorld, setInput, step, type World } from "../core/world";
import { setLoadout } from "../combat/loadout";
import { TICK_DT_S } from "../config/constants";
import { changeDecayStage } from "../decay/decaySystem";
import { NEUTRAL_INPUT } from "../net/input";
import { downPlayer } from "../player/downed";
import { addPlayer, type PlayerState } from "../player/player";
import { startBuild, startWave } from "../run/runStateMachine";
import { shopBuildings, shopUpgrades, titleCase, upgradeWeapon, weaponName } from "./shop";
import { buyForced } from "./shopCards.testkit";

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

describe("shop lists (Story 3.3 buildings; weapons are cards since 5.13)", () => {
  it("buildings: the bundled buildings.json lists the Wood barricade (3.4), the Auto-turret (3.6), the spike trap and the mine (5.9)", () => {
    expect(shopBuildings(balance)).toEqual([
      { id: "wood_barricade", name: "Wood barricade", price: 40 },
      { id: "auto_turret", name: "Auto-turret", price: 250 },
      { id: "spike_trap", name: "Spike trap", price: 80 },
      { id: "mine", name: "Mine", price: 60 },
      { id: "med_station", name: "Med station", price: 400 },
      { id: "bear_trap", name: "Bear trap", price: 50 }, // Story 5.14
    ]);
  });

  it("Story 5.10: the floodlight is not listed (inShop: false); listed with the ONE dev shop-all balance (5.10 + 5.11), which unhides gear too; upgrade-only tiers never", async () => {
    expect(shopBuildings(balance).map((b) => b.id)).not.toContain("floodlight");
    const { loadDevBalance, shopGear, allGear } = await import("../index");
    const devBal = loadDevBalance({ zombieDamageScale: null, shopAll: true });
    const all = shopBuildings(devBal);
    expect(all.find((b) => b.id === "floodlight")).toEqual({ id: "floodlight", name: "Floodlight", price: 100 });
    expect(all.map((b) => b.id)).not.toContain("metal_barricade");
    expect(shopBuildings(devBal)).toBe(all); // cached per balance
    expect(shopGear(devBal).length).toBe(allGear(devBal).length); // the same switch lists every gear item
    expect(shopGear(balance).length).toBeLessThan(allGear(balance).length); // (the flashlight is hidden without it)
  });

  it("Story 5.9: upgrade-only types are not in the shop; spike_trap 80 and mine 60 are", () => {
    const ids = shopBuildings(balance).map((b) => b.id);
    expect(ids).not.toContain("reinforced_barricade");
    expect(ids).not.toContain("metal_barricade");
    expect(balance.buildings.types.metal_barricade?.forSale).toBe(false);
    const fake = { ...balance, buildings: { types: { a: { price: 1 }, b: { price: 2, forSale: false } } } } as unknown as Balance;
    expect(shopBuildings(fake).map((b) => b.id)).toEqual(["a"]);
  });

  it("buildings: every type with a price, named by `name` or the Title-Cased id (3.4 contract)", () => {
    const fake = (block: unknown) => ({ ...balance, buildings: block }) as unknown as Balance;
    expect(shopBuildings(fake({ wood_barricade: { price: 40, hp: 100 }, gridM: 1 }))).toEqual([{ id: "wood_barricade", name: "Wood Barricade", price: 40 }]);
    expect(shopBuildings(fake({ types: { auto_turret: { price: 250, name: "Turret" } } }))).toEqual([{ id: "auto_turret", name: "Turret", price: 250 }]);
  });

  it("weaponName", () => {
    expect(weaponName(balance, "smg")).toBe("SMG");
    expect(weaponName(balance, "big_gun")).toBe("Big Gun");
  });

  it("titleCase", () => {
    expect(titleCase("hunting_rifle")).toBe("Hunting Rifle");
    expect(titleCase("smg")).toBe("Smg");
  });
});

describe("weapon upgrades (Story 5.1 AC 3, 7; F1–F4)", () => {
  const lv = (p: PlayerState) => [p.loadout.slots[0].level, p.loadout.slots[1]?.level ?? null];

  it("upgradeWeapon refusals in order (phase → player → owned → max → wallet); nothing changes on a refusal", () => {
    const { world, p } = setup(1000, ["smg", "pistol"]);
    const snap = () => JSON.stringify({ w: p.wallet, s: p.loadout.slots, a: p.loadout.active });
    const before = snap();
    startWave(world);
    expect(upgradeWeapon(world, "p0", "smg")).toEqual({ ok: false, error: "not_build" });
    startBuild(world);
    expect(upgradeWeapon(world, "ghost", "smg")).toEqual({ ok: false, error: "unknown_player" });
    expect(upgradeWeapon(world, "p0", "machete")).toEqual({ ok: false, error: "not_owned" });
    expect(upgradeWeapon(world, "p0", "rocket")).toEqual({ ok: false, error: "not_owned" });
    expect(upgradeWeapon(world, "p0", "SMG")).toEqual({ ok: false, error: "not_owned" });
    p.loadout.slots[0].level = 4;
    expect(upgradeWeapon(world, "p0", "smg")).toEqual({ ok: false, error: "max_level" });
    p.loadout.slots[0].level = 1;
    p.wallet = 119;
    expect(upgradeWeapon(world, "p0", "smg")).toEqual({ ok: false, error: "insufficient_funds" });
    p.wallet = 1000;
    expect(snap()).toBe(before);
    // A teammate can't upgrade or pay for my weapon: their call upgrades only their own slots.
    addPlayer(world, "p1", 12, 10);
    expect(upgradeWeapon(world, "p1", "smg")).toEqual({ ok: false, error: "not_owned" });
    expect(snap()).toBe(before);
  });

  it("upgrade charges exactly the shown price, once per call; emits weapon.upgraded; only the level changes", () => {
    const { world, p } = setup(500, ["pistol", "smg"]);
    const events: { type: string }[] = [];
    world.events.subscribe((e) => events.push(e));
    p.loadout.active = 1;
    const smg = p.loadout.slots[1] as { ammo: number; reloadTicks: number; cooldownS: number };
    smg.ammo = 7;
    smg.reloadTicks = 5;
    smg.cooldownS = 0.03;
    const row = shopUpgrades(balance, p.loadout).find((r) => r.weapon === "smg");
    expect(row).toEqual({ weapon: "smg", name: "SMG", slot: 1, level: 1, nextPrice: 120 });
    expect(upgradeWeapon(world, "p0", "smg")).toEqual({ ok: true, value: { slot: 1, level: 2, price: 120 } });
    expect(p.wallet).toBe(380);
    expect(smg).toMatchObject({ ammo: 7, reloadTicks: 5, cooldownS: 0.03 });
    expect(p.loadout.active).toBe(1);
    expect(lv(p)).toEqual([1, 2]);
    world.events.flush(); // delivered with the next step (end of tick)
    expect(events.filter((e) => e.type === "weapon.upgraded")).toEqual([{ type: "weapon.upgraded", playerId: "p0", weapon: "smg", slot: 1, level: 2 }]);
    // The Pistol (free) upgrades at 60.
    expect(upgradeWeapon(world, "p0", "pistol").ok).toBe(true);
    expect(p.wallet).toBe(320);
  });

  it("max level refused at IV; the row reads Max (nextPrice null)", () => {
    const { world, p } = setup(10_000, ["machete", null]);
    for (const l of [2, 3, 4]) expect(upgradeWeapon(world, "p0", "machete")).toMatchObject({ ok: true, value: { level: l, price: 90 } });
    expect(p.wallet).toBe(10_000 - 270);
    expect(upgradeWeapon(world, "p0", "machete")).toEqual({ ok: false, error: "max_level" });
    expect(p.wallet).toBe(10_000 - 270);
    expect(shopUpgrades(balance, p.loadout)).toEqual([{ weapon: "machete", name: "Machete", slot: 0, level: 4, nextPrice: null }]);
  });

  it("replace loses levels; buying it again later starts at I", () => {
    const { world, p } = setup(10_000, ["pistol", "smg"]);
    upgradeWeapon(world, "p0", "smg");
    upgradeWeapon(world, "p0", "smg");
    expect(lv(p)).toEqual([1, 3]);
    expect(buyForced(world, "p0", "machete", 1).ok).toBe(true);
    expect(lv(p)).toEqual([1, 1]);
    expect(buyForced(world, "p0", "smg", 1).ok).toBe(true);
    expect(ids(p)).toEqual(["pistol", "smg"]);
    expect(lv(p)).toEqual([1, 1]);
  });

  it("swap keeps both levels", () => {
    const world = createWorld({ balance, seed: 7, systems: NO_WAVES });
    const p = addPlayer(world, "p0", 10, 10);
    startBuild(world);
    p.wallet = 10_000;
    setLoadout(balance, p.loadout, ["pistol", "smg"]);
    upgradeWeapon(world, "p0", "pistol");
    for (let i = 0; i < 3; i++) upgradeWeapon(world, "p0", "smg");
    expect(lv(p)).toEqual([2, 4]);
    for (let round = 0; round < 2; round++) {
      setInput(world, "p0", { ...NEUTRAL_INPUT, seq: 1 + round * 20, swap: true });
      step(world, TICK_DT_S);
      for (let t = 0; t < 10; t++) {
        setInput(world, "p0", { ...NEUTRAL_INPUT, seq: 2 + t + round * 20 });
        step(world, TICK_DT_S);
      }
      expect(p.loadout.active).toBe(round === 0 ? 1 : 0); // liveness: the swap really happened
      expect(lv(p)).toEqual([2, 4]);
    }
  });

  it("levels survive downed → out → return and a decay stage change", () => {
    const world = createWorld({ balance, seed: 7, systems: NO_WAVES });
    addPlayer(world, "p0", 10, 10);
    const p1 = addPlayer(world, "p1", 14, 10);
    startBuild(world);
    p1.wallet = 10_000;
    setLoadout(balance, p1.loadout, ["smg", "machete"]);
    upgradeWeapon(world, "p1", "smg");
    upgradeWeapon(world, "p1", "machete");
    upgradeWeapon(world, "p1", "machete");
    expect(lv(p1)).toEqual([2, 3]);
    startWave(world);
    downPlayer(world, p1);
    expect(p1.status).toBe("downed");
    for (let t = 0; t < 2000 && p1.status !== "out"; t++) step(world, TICK_DT_S);
    expect(p1.status).toBe("out");
    expect(lv(p1)).toEqual([2, 3]);
    startBuild(world);
    expect(p1.status).toBe("alive"); // returned at the build start
    expect(lv(p1)).toEqual([2, 3]);
    expect(changeDecayStage(world, 3)).toBe(true);
    expect(lv(p1)).toEqual([2, 3]);
  });
});
