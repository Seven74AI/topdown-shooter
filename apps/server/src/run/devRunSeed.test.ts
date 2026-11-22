import { describe, expect, it } from "vitest";
import { pickDevRunSeed } from "./devRunSeed";

describe("pickDevRunSeed (Story 4.4: online set run seed, dev only)", () => {
  it("uses the host's seed only with DEV_ALLOW_RUN_SEED=1 outside production", () => {
    expect(pickDevRunSeed(4242, { DEV_ALLOW_RUN_SEED: "1" })).toEqual({ seed: 4242, ignored: null });
    expect(pickDevRunSeed(0, { DEV_ALLOW_RUN_SEED: "1", NODE_ENV: "development" })).toEqual({ seed: 0, ignored: null });
  });

  it("production ignores it even with the switch on", () => {
    expect(pickDevRunSeed(4242, { DEV_ALLOW_RUN_SEED: "1", NODE_ENV: "production" })).toEqual({ seed: null, ignored: "production" });
  });

  it("without the switch the seed is ignored (random seed), and nothing asked → nothing to report", () => {
    expect(pickDevRunSeed(4242, {})).toEqual({ seed: null, ignored: "switch_off" });
    expect(pickDevRunSeed(4242, { DEV_ALLOW_RUN_SEED: "true" })).toEqual({ seed: null, ignored: "switch_off" });
    expect(pickDevRunSeed(undefined, { DEV_ALLOW_RUN_SEED: "1" })).toEqual({ seed: null, ignored: null });
    expect(pickDevRunSeed(-1, { DEV_ALLOW_RUN_SEED: "1" })).toEqual({ seed: null, ignored: null });
  });
});
