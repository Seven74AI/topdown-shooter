import { describe, expect, it } from "vitest";
import { loadBalance } from "../config/balance";
import { createWorld, type World } from "../core/world";
import { addPlayer, type PlayerState } from "../player/player";
import { startBuild, startWave } from "../run/runStateMachine";
import { downPlayer } from "../player/downed";
import { CONSUMABLE_NONE, buyConsumable, consumableAt, consumableIds, consumableIndex, shopConsumables, throwStatsOf } from "./consumables";
import { buyItem } from "./shop";

const balance = loadBalance();
const NO_WAVES = { waves: () => {} };

function setup(wallet: number): { world: World; p: PlayerState } {
  const world = createWorld({ balance, seed: 7, systems: NO_WAVES });
  addPlayer(world, "p0", 10, 10);
  startBuild(world);
  const p = world.players.get("p0") as PlayerState;
  p.wallet = wallet;
  return { world, p };
}

describe("consumable table (Story 5.12)", () => {
  it("index order is consumables.json key order; 255 = empty; the shop lists all three", () => {
    expect(consumableIds(balance)).toEqual(["medkit", "grenades", "molotovs"]);
    expect(consumableIndex(balance, "molotovs")).toBe(2);
    expect(consumableIndex(balance, null)).toBe(CONSUMABLE_NONE);
    expect(consumableIndex(balance, "bazooka")).toBe(CONSUMABLE_NONE);
    expect(consumableAt(balance, 1)).toBe("grenades");
    expect(consumableAt(balance, CONSUMABLE_NONE)).toBeNull();
    expect(shopConsumables(balance).map((c) => [c.id, c.price, c.pack])).toEqual([
      ["medkit", 60, 1],
      ["grenades", 80, 3],
      ["molotovs", 100, 2],
    ]);
    expect(throwStatsOf(balance, "medkit")).toBeNull();
    expect(throwStatsOf(balance, "grenades")).toMatchObject({ minLobM: 2, lobRangeM: 8, blastRadiusM: 2.5 });
  });
});

describe("buyConsumable (Story 5.12, AC 2)", () => {
  it("empty → fills to the pack; money taken", () => {
    const { world, p } = setup(500);
    const r = buyConsumable(world, "p0", "grenades");
    expect(r).toEqual({ ok: true, value: { item: "grenades", price: 80, replaced: null } });
    expect([p.consumable, p.consumableCount, p.wallet]).toEqual(["grenades", 3, 420]);
  });

  it("same item → refills to the pack for the full price (D10); full → already_full, nothing taken", () => {
    const { world, p } = setup(500);
    buyConsumable(world, "p0", "grenades");
    p.consumableCount = 2;
    expect(buyConsumable(world, "p0", "grenades").ok).toBe(true);
    expect([p.consumableCount, p.wallet]).toEqual([3, 340]);
    expect(buyConsumable(world, "p0", "grenades")).toEqual({ ok: false, error: "already_full" });
    expect([p.consumable, p.consumableCount, p.wallet]).toEqual(["grenades", 3, 340]);
  });

  it("another item → replaces (the rest is lost) and says what it replaced", () => {
    const { world, p } = setup(500);
    buyConsumable(world, "p0", "grenades");
    const r = buyItem(world, "p0", "medkit"); // through the 5.11 dispatcher
    expect(r).toEqual({ ok: true, value: { item: "medkit", price: 60, replaced: "grenades" } });
    expect([p.consumable, p.consumableCount, p.wallet]).toEqual(["medkit", 1, 360]);
  });

  it("refusals in order leave wallet and slot unchanged: not_build → unknown_player → not_alive → not_for_sale → already_full → insufficient_funds", () => {
    const { world, p } = setup(70);
    buyConsumable(world, "p0", "medkit");
    const before = (): unknown[] => [p.consumable, p.consumableCount, p.wallet];
    const snap = before();
    expect(buyConsumable(world, "ghost", "medkit")).toEqual({ ok: false, error: "unknown_player" });
    expect(buyConsumable(world, "p0", "bazooka")).toEqual({ ok: false, error: "not_for_sale" });
    expect(buyConsumable(world, "p0", "medkit")).toEqual({ ok: false, error: "already_full" });
    expect(buyConsumable(world, "p0", "molotovs")).toEqual({ ok: false, error: "insufficient_funds" });
    expect(before()).toEqual(snap);
    downPlayer(world, p);
    expect(buyItem(world, "p0", "grenades")).toEqual({ ok: false, error: "not_alive" });
    expect(before()).toEqual(snap);
    startWave(world);
    expect(buyItem(world, "p0", "grenades")).toEqual({ ok: false, error: "not_build" });
    expect(before()).toEqual(snap);
  });
});
