import { describe, expect, it } from "vitest";
import { pickDevLoot } from "./devLoot";

describe("Story 7.12 DEV_LOOT", () => {
  it("parses <wave>:<frac>; refuses junk; production ignores it", () => {
    expect(pickDevLoot({ DEV_LOOT: "3:0.1" })).toEqual({ plan: [3, 0.1], ignored: null });
    expect(pickDevLoot({ DEV_LOOT: "3:0.1", NODE_ENV: "production" })).toEqual({ plan: null, ignored: "production" });
    expect(pickDevLoot({ DEV_LOOT: "3" })).toEqual({ plan: null, ignored: "invalid" });
    expect(pickDevLoot({})).toEqual({ plan: null, ignored: null });
  });
});
