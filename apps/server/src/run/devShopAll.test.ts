import { describe, expect, it } from "vitest";
import { pickDevShopAll } from "./devShopAll";

describe("DEV_SHOP_ALL (Story 5.10 review L3)", () => {
  it("dev: on only for exactly 1; production ignores it (and says so)", () => {
    expect(pickDevShopAll({ NODE_ENV: "development", DEV_SHOP_ALL: "1" })).toEqual({ shopAll: true, ignored: null });
    expect(pickDevShopAll({ DEV_SHOP_ALL: "1" })).toEqual({ shopAll: true, ignored: null });
    expect(pickDevShopAll({ NODE_ENV: "production", DEV_SHOP_ALL: "1" })).toEqual({ shopAll: false, ignored: "production" });
    expect(pickDevShopAll({ NODE_ENV: "development", DEV_SHOP_ALL: "0" })).toEqual({ shopAll: false, ignored: null });
    expect(pickDevShopAll({ NODE_ENV: "development" })).toEqual({ shopAll: false, ignored: null });
  });
});
