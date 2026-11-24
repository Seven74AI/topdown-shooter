import { describe, expect, it } from "vitest";
import { applyStartWave, createWorld, loadBalance, parseStartWave, skipWave, step, TICK_DT_S } from "@topdown/shared";
import { pickDevStartWave } from "./devStartWave";
import { RunController } from "./RunController";

const balance = loadBalance();
const players = [{ playerId: "p0", slot: 0 }];

describe("Story 6.1 DEV_START_WAVE / ?startwave= (D4)", () => {
  it("parses an integer 1 … 99 (Story 6.12: 11+ = endless); anything else is null (wave 1)", () => {
    expect(parseStartWave("7", balance)).toBe(7);
    expect(parseStartWave(" 10 ", balance)).toBe(10);
    expect(parseStartWave("1", balance)).toBe(1);
    for (const bad of [undefined, null, "", "0", "100", "7.5", "-3", "seven", "1e1", "0010000"]) expect(parseStartWave(bad, balance), String(bad)).toBe(null);
  });

  it("NODE_ENV=production refuses it (the room's pick); dev uses it; invalid is ignored", () => {
    expect(pickDevStartWave({ NODE_ENV: "production", DEV_START_WAVE: "7" }, balance)).toEqual({ wave: null, ignored: "production" });
    expect(pickDevStartWave({ NODE_ENV: "development", DEV_START_WAVE: "7" }, balance)).toEqual({ wave: 7, ignored: null });
    expect(pickDevStartWave({ DEV_START_WAVE: "9" }, balance)).toEqual({ wave: 9, ignored: null });
    expect(pickDevStartWave({}, balance)).toEqual({ wave: null, ignored: null });
    expect(pickDevStartWave({ DEV_START_WAVE: "100" }, balance)).toEqual({ wave: null, ignored: "invalid" });
    expect(pickDevStartWave({ DEV_START_WAVE: "14" }, balance)).toEqual({ wave: 14, ignored: null }); // Story 6.12: endless
  });

  it("the first build leads into wave N with wave N's decay stage applied (all mutations up to it); the wave that follows is wave N", () => {
    const plain = new RunController({ balance, seed: 3, players });
    expect(plain.world.decay.stage).toBe(1);
    const dev = new RunController({ balance, seed: 3, players, startWave: 7 });
    const w = dev.world;
    expect(w.run.phase).toBe("build");
    expect(w.waves.number).toBe(6);
    expect(w.decay.stage).toBe(balance.decay.stageByWave[6]); // wave 7 = stage 4
    expect(w.decay.stage).toBe(4);
    expect(w.obstacles.solids.map((b) => b.name)).toContain("dumpster_alley_3"); // a stage-2 mutation is in too
    dev.setBuildReady("p0", true);
    for (let i = 0; i < 5 && w.run.phase !== "wave"; i++) dev.tick();
    expect(w.run.phase).toBe("wave");
    expect(w.waves.number).toBe(7);
    expect(w.waves.size).toBe(98); // 280 × 0.35 solo
  });

  it("start at 10 → clearing wave 10 opens the vote (Story 6.11; silence → Extract → Results)", () => {
    const dev = new RunController({ balance, seed: 4, players, startWave: 10 });
    const w = dev.world;
    dev.setBuildReady("p0", true);
    for (let i = 0; i < 5 && w.run.phase !== "wave"; i++) dev.tick();
    expect(w.waves.number).toBe(10);
    skipWave(w);
    expect(w.run.phase).toBe("vote");
    for (let i = 0; i < 301; i++) dev.tick();
    expect(w.run.phase).toBe("results");
    expect(w.run.ending).toBe("extracted");
  });

  it("applyStartWave refuses after the first build start, or a wave outside 1 … runWaves", () => {
    const world = createWorld({ balance, seed: 1 });
    expect(() => applyStartWave(world, 0)).toThrow(/not 1/);
    expect(() => applyStartWave(world, 100)).toThrow(/not 1/); // Story 6.12: 11+ starts endless (dev)
    applyStartWave(world, 3);
    expect(world.waves.number).toBe(2);
    const c = new RunController({ balance, seed: 3, players });
    step(c.world, TICK_DT_S);
    expect(() => applyStartWave(c.world, 5)).toThrow(/only before the first build/);
  });
});
