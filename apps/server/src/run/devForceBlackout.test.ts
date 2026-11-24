import { describe, expect, it } from "vitest";
import { loadBalance, startWave } from "@topdown/shared";
import { parseDevForceBlackout, pickDevForceBlackout } from "./devForceBlackout";
import { RunController } from "./RunController";

const balance = loadBalance();

describe("Story 6.3 DEV_FORCE_BLACKOUT", () => {
  it("parses 1–100; anything else is null", () => {
    expect(parseDevForceBlackout("5")).toBe(5);
    expect(parseDevForceBlackout(" 20 ")).toBe(20);
    for (const bad of [undefined, "", "0", "101", "-5", "5.5", "a", "1000"]) expect(parseDevForceBlackout(bad), String(bad)).toBe(null);
  });

  it("production ignores it (logged reason); dev uses it; invalid is ignored", () => {
    expect(pickDevForceBlackout({ NODE_ENV: "production", DEV_FORCE_BLACKOUT: "5" })).toEqual({ pct: null, ignored: "production" });
    expect(pickDevForceBlackout({ NODE_ENV: "development", DEV_FORCE_BLACKOUT: "5" })).toEqual({ pct: 5, ignored: null });
    expect(pickDevForceBlackout({ DEV_FORCE_BLACKOUT: "10" })).toEqual({ pct: 10, ignored: null });
    expect(pickDevForceBlackout({})).toEqual({ pct: null, ignored: null });
    expect(pickDevForceBlackout({ DEV_FORCE_BLACKOUT: "x" })).toEqual({ pct: null, ignored: "invalid" });
  });

  it("a RunController with it is dark from the first build phase and through the wave", () => {
    const players = [{ playerId: "p0", slot: 0 }];
    const plain = new RunController({ balance, seed: 3, players, pauseWaves: true });
    expect(plain.world.lights.blackoutPct).toBe(0);
    const dev = new RunController({ balance, seed: 3, players, pauseWaves: true, forceBlackoutPct: 5 });
    expect(dev.world.lights.blackoutPct).toBe(5);
    startWave(dev.world);
    expect(dev.world.lights.blackoutPct).toBe(5);
  });
});
