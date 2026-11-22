import { describe, expect, it } from "vitest";
import { loadBalance } from "@topdown/shared";
import { MAX_DEV_DECAY_WAVES, parseDevDecayStages, pickDevDecayStages } from "./devDecayStages";
import { RunController } from "./RunController";

const balance = loadBalance();

describe("Story 4.5 DEV_DECAY_STAGES", () => {
  it("parses a non-decreasing list of stages 1–5; anything else is null (the real table)", () => {
    expect(parseDevDecayStages("2,3")).toEqual([2, 3]);
    expect(parseDevDecayStages(" 1, 1 ,2 ")).toEqual([1, 1, 2]);
    for (const bad of [undefined, "", "0", "6", "3,2", "2;3", "a", "2,,3", Array(MAX_DEV_DECAY_WAVES + 1).fill("1").join(",")]) {
      expect(parseDevDecayStages(bad), String(bad)).toBe(null);
    }
  });

  it("a RunController with the table enters its first stage at the run's first build start (before wave 1)", () => {
    const players = [{ playerId: "p0", slot: 0 }];
    const plain = new RunController({ balance, seed: 3, players, pauseWaves: true });
    expect(plain.world.decay.stage).toBe(1);
    const dev = new RunController({ balance, seed: 3, players, pauseWaves: true, decayStageByWave: parseDevDecayStages("2,3") });
    expect(dev.world.decay.stage).toBe(2);
    expect(dev.world.obstacles.solids.map((b) => b.name)).toContain("dumpster_alley_3");
  });

  it("review L4: NODE_ENV=production ignores DEV_DECAY_STAGES (the room's pick); dev uses it; invalid is ignored too", () => {
    expect(pickDevDecayStages({ NODE_ENV: "production", DEV_DECAY_STAGES: "2,3" })).toEqual({ stages: null, ignored: "production" });
    expect(pickDevDecayStages({ NODE_ENV: "development", DEV_DECAY_STAGES: "2,3" })).toEqual({ stages: [2, 3], ignored: null });
    expect(pickDevDecayStages({ DEV_DECAY_STAGES: "2,3" })).toEqual({ stages: [2, 3], ignored: null });
    expect(pickDevDecayStages({ NODE_ENV: "production" })).toEqual({ stages: null, ignored: null });
    expect(pickDevDecayStages({ DEV_DECAY_STAGES: "3,1" })).toEqual({ stages: null, ignored: "invalid" });
  });
});
