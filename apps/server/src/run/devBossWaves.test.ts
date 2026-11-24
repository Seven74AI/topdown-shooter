import { describe, expect, it } from "vitest";
import { parseDevBossWaves, pickDevBossWaves } from "./devBossWaves";

describe("Story 6.5 DEV_BOSS_WAVES", () => {
  it("parses wave lists; refuses junk; production ignores it", () => {
    expect(parseDevBossWaves("3")).toEqual([3]);
    expect(parseDevBossWaves(" 1, 4 ")).toEqual([1, 4]);
    expect(parseDevBossWaves("0")).toBeNull();
    expect(parseDevBossWaves("x")).toBeNull();
    expect(parseDevBossWaves("")).toBeNull();
    expect(pickDevBossWaves({ DEV_BOSS_WAVES: "3" })).toEqual({ waves: [3], ignored: null });
    expect(pickDevBossWaves({ DEV_BOSS_WAVES: "3", NODE_ENV: "production" })).toEqual({ waves: null, ignored: "production" });
    expect(pickDevBossWaves({ DEV_BOSS_WAVES: "a" })).toEqual({ waves: null, ignored: "invalid" });
    expect(pickDevBossWaves({})).toEqual({ waves: null, ignored: null });
  });
});
