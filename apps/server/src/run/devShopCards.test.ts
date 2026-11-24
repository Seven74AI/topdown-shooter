import { describe, expect, it } from "vitest";
import { loadBalance } from "@topdown/shared";
import { parseDevShopCards, pickDevShopCards } from "./devShopCards";

const balance = loadBalance();

describe("DEV_SHOP_CARDS (Story 5.13 AC 10; B8)", () => {
  it("dev: forces card items; production ignores it", () => {
    expect(pickDevShopCards({ DEV_SHOP_CARDS: "flamethrower,revive_kit" }, balance)).toEqual({ cards: ["flamethrower", "revive_kit"], ignored: null });
    expect(pickDevShopCards({ NODE_ENV: "production", DEV_SHOP_CARDS: "flamethrower" }, balance)).toEqual({ cards: null, ignored: "production" });
    expect(pickDevShopCards({}, balance)).toEqual({ cards: null, ignored: null });
  });

  it("invalid lists are ignored: the Pistol, unknown ids, repeats, more than 6", () => {
    for (const raw of ["pistol", "rocket", "smg,smg", "smg,shotgun,machete,fire_axe,chainsaw,gas_torch,flamethrower", " , "]) expect(parseDevShopCards(raw, balance), raw).toBeNull();
    expect(pickDevShopCards({ DEV_SHOP_CARDS: "rocket" }, balance)).toEqual({ cards: null, ignored: "invalid" });
  });
});
