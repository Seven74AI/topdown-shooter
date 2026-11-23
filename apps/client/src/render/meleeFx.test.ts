import { describe, expect, it } from "vitest";
import { createWorld, loadBalance, spawnZombie } from "@topdown/shared";
import { SPARK_BLOOD, SPARK_STEEL, SawClock, SparkPool, countInArc } from "./meleeFx";
import { swingLookFor, swingSfxFor } from "./weaponLook";

const balance = loadBalance();
const FX = balance.controls.fx;

describe("Chainsaw sparks (Story 5.2, brief line 12)", () => {
  it("a fixed pool of fx.maxChainsawSparks: never more alive, the oldest reused, no growth", () => {
    const pool = new SparkPool(FX.maxChainsawSparks, FX.chainsawSparkMs);
    const arrays = [pool.x, pool.y, pool.vx, pool.vy, pool.lifeMs, pool.kind];
    // 4 Chainsaws × 10 ticks/s cutting: far more sparks than the cap per spark life
    for (let t = 0; t < 40; t++) pool.spawn(10, 10, 1, 0, FX.chainsawSparksPerHit, t % 2 ? SPARK_BLOOD : SPARK_STEEL);
    const live = pool.update(1);
    expect(live).toBe(FX.maxChainsawSparks);
    expect([pool.x, pool.y, pool.vx, pool.vy, pool.lifeMs, pool.kind]).toEqual(arrays); // the same arrays: nothing reallocated
    expect(pool.x.length).toBe(FX.maxChainsawSparks);
  });

  it("sparks fly off the blade and die within their life", () => {
    const pool = new SparkPool(FX.maxChainsawSparks, FX.chainsawSparkMs);
    pool.spawn(10, 10, 1, 0, 4, SPARK_STEEL);
    expect(pool.update(16)).toBe(4);
    let moved = 0;
    for (let k = 0; k < pool.cap; k++) if ((pool.lifeMs[k] as number) > 0) moved += Math.hypot((pool.x[k] as number) - 10, (pool.y[k] as number) - 10);
    expect(moved).toBeGreaterThan(0);
    let live = 4;
    for (let t = 0; t < 30 && live > 0; t++) live = pool.update(16);
    expect(live).toBe(0);
  });
});

describe("SawClock: the running frame and the rev loop (Story 5.2 AC 3)", () => {
  it("the rev starts with the first cut, keeps running while cuts arrive ≤ 150 ms apart, stops after", () => {
    const s = new SawClock(FX.chainsawRevHoldMs);
    const steps: string[] = [];
    for (let t = 0; t <= 1000; t += 16) {
      if (t < 500 && t % 100 < 16) s.swung("p0", t); // 10 cuts/s for 0.5 s
      const r = s.revStep("p0", t);
      if (r !== "none") steps.push(`${r}@${t}`);
    }
    expect(steps).toHaveLength(2);
    expect(steps[0]).toBe("start@0");
    const stopAt = Number((steps[1] as string).split("@")[1]);
    expect(stopAt).toBeGreaterThan(400 + FX.chainsawRevHoldMs - 16);
    expect(stopAt).toBeLessThanOrEqual(400 + FX.chainsawRevHoldMs + 16);
  });

  it("other players' saws show the running frame but never start my rev", () => {
    const s = new SawClock(FX.chainsawRevHoldMs);
    s.swung("p1", 100);
    expect(s.running("p1", 150)).toBe(true);
    expect(s.running("p1", 100 + FX.chainsawRevHoldMs + 1)).toBe(false);
    expect(s.revStep("p0", 150)).toBe("none");
  });
});

describe("melee looks (Story 5.2)", () => {
  it("axe heavy, chainsaw saw, machete light; the chainsaw has no per-swing sound (its rev loop instead)", () => {
    expect(swingLookFor("fire_axe")).toBe("heavy");
    expect(swingLookFor("chainsaw")).toBe("saw");
    expect(swingLookFor("machete")).toBe("light");
    expect(swingSfxFor("fire_axe")).toBe("weapon_axe_swing");
    expect(swingSfxFor("chainsaw")).toBeNull();
    expect(swingSfxFor("machete")).toBe("weapon_machete_swing");
  });

  it("countInArc counts exactly the bodies touching the drawn 60° / 1.5 m sector (F1)", () => {
    const w = createWorld({ balance, seed: 1 });
    spawnZombie(w, "walker", 11.2, 10); // inside
    spawnZombie(w, "walker", 10 + 1.5 + 0.34, 10); // edge just inside the range
    spawnZombie(w, "walker", 10 + 1.5 + 0.36, 10); // just outside
    spawnZombie(w, "walker", 9, 10); // behind
    expect(countInArc(w, 10, 10, 1, 0, 60, 1.5)).toBe(2);
  });
});

describe("SawClock on slow frames", () => {
  it("a 400 ms frame (all its swings stamped at once) keeps the saw running until the next frame", () => {
    const s = new SawClock(FX.chainsawRevHoldMs);
    s.swung("p0", 1000);
    s.frameMs = 16;
    expect(s.running("p0", 1400)).toBe(false);
    s.frameMs = 400;
    expect(s.running("p0", 1400)).toBe(true);
  });
});
