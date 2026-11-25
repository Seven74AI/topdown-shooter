import { ALL_UNLOCKED, NO_TRAINING, STARTER_ONLY } from "@topdown/shared";
import { describe, expect, it } from "vitest";
import { pickDevUnlocks, runPlayers, type RunPlayerInit } from "./runStart";

/** Stories 7.4/7.5 (review L4): the run-start mapping from the progress read to the controller's start data. */
const T = { maxHp: 2, damage: 3, startMoney: 4, reload: 1 };
const members = [
  { playerId: "p0", slot: 0 },
  { playerId: "p1", slot: 1 },
];
const inits: RunPlayerInit[] = [{ playerId: "p0", slot: 0, unlocks: 6, training: T, source: "progress" }];

describe("runPlayers (review L4)", () => {
  it("passes each read's mask and Training; a member without a read gets the starter pool and Training 0 (D3)", () => {
    expect(runPlayers(members, inits, null, null)).toEqual([
      { playerId: "p0", slot: 0, unlocks: 6, training: T },
      { playerId: "p1", slot: 1, unlocks: STARTER_ONLY, training: NO_TRAINING },
    ]);
  });

  it("DEV_STARTING_WALLET zeroes Training's start money only (decision 7.5 B6); DEV_UNLOCKS replaces every mask", () => {
    const r = runPlayers(members, inits, ALL_UNLOCKED, 2000);
    expect(r[0]).toEqual({ playerId: "p0", slot: 0, unlocks: ALL_UNLOCKED, training: { ...T, startMoney: 0 } });
    expect(r[1]?.unlocks).toBe(ALL_UNLOCKED);
  });

  it("pickDevUnlocks: all / starter / shopAll in dev; production ignores it; a bad value is reported", () => {
    expect(pickDevUnlocks({ DEV_UNLOCKS: "all" }, false).mask).toBe(ALL_UNLOCKED);
    expect(pickDevUnlocks({ DEV_UNLOCKS: "starter" }, false).mask).toBe(STARTER_ONLY);
    expect(pickDevUnlocks({}, true).mask).toBe(ALL_UNLOCKED);
    expect(pickDevUnlocks({}, false)).toEqual({ mask: null, ignored: null });
    expect(pickDevUnlocks({ NODE_ENV: "production", DEV_UNLOCKS: "all" }, false)).toEqual({ mask: null, ignored: "production" });
    expect(pickDevUnlocks({ DEV_UNLOCKS: "x" }, false)).toEqual({ mask: null, ignored: "bad_value" });
  });
});
