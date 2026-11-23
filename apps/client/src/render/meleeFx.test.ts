import { describe, expect, it } from "vitest";
import { addBuildingAt, createWorld, loadBalance, spawnZombie } from "@topdown/shared";
import { ChainsawCutFx, SPARK_BLOOD, SPARK_STEEL, SawClock, SparkPool, countInArc } from "./meleeFx";
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

/** A fake rev sink (audio running or not) and a fake document (hidden or not). */
function fakes(audioRunning = true) {
  const log: string[] = [];
  let playing = false;
  const sink = {
    running: audioRunning,
    start() {
      if (!this.running) {
        log.push("start-refused");
        return false;
      }
      playing = true;
      log.push("start");
      return true;
    },
    stop() {
      if (playing) log.push("stop");
      playing = false;
    },
  };
  const listeners: (() => void)[] = [];
  const doc = {
    hidden: false,
    addEventListener: (_t: string, f: () => void) => listeners.push(f),
    removeEventListener: (_t: string, f: () => void) => listeners.splice(listeners.indexOf(f), 1),
    fire() {
      for (const f of [...listeners]) f();
    },
  };
  return { log, sink, doc, listeners, isPlaying: () => playing };
}

describe("SawClock: the running frame and the rev loop (Story 5.2 AC 3)", () => {
  it("the rev starts with the first cut, keeps running while cuts arrive ≤ 150 ms apart, stops after", () => {
    const f = fakes();
    const s = new SawClock(FX.chainsawRevHoldMs, f.sink, f.doc as unknown as Document);
    const steps: string[] = [];
    for (let t = 0; t <= 1000; t += 16) {
      if (t < 500 && t % 100 < 16) s.swung("p0", t); // 10 cuts/s for 0.5 s
      const n = f.log.length;
      s.revUpdate("p0", t);
      if (f.log.length > n) steps.push(`${f.log[f.log.length - 1]}@${t}`);
    }
    expect(steps).toHaveLength(2);
    expect(steps[0]).toBe("start@0");
    const stopAt = Number((steps[1] as string).split("@")[1]);
    expect(steps[1]).toMatch(/^stop@/);
    expect(stopAt).toBeGreaterThan(400 + FX.chainsawRevHoldMs - 16);
    expect(stopAt).toBeLessThanOrEqual(400 + FX.chainsawRevHoldMs + 16);
  });

  it("other players' saws show the running frame but never start my rev", () => {
    const f = fakes();
    const s = new SawClock(FX.chainsawRevHoldMs, f.sink, null);
    s.swung("p1", 100);
    expect(s.running("p1", 150)).toBe(true);
    expect(s.running("p1", 100 + FX.chainsawRevHoldMs + 1)).toBe(false);
    s.revUpdate("p0", 150);
    expect(f.log).toEqual([]);
  });

  it("review M2: hiding the tab stops the loop at once (no frame runs while hidden); it restarts on the next cut once visible", () => {
    const f = fakes();
    const s = new SawClock(FX.chainsawRevHoldMs, f.sink, f.doc as unknown as Document);
    s.swung("p0", 0);
    s.revUpdate("p0", 0);
    expect(f.isPlaying()).toBe(true);
    f.doc.hidden = true;
    f.doc.fire(); // visibilitychange → hidden, before any further frame
    expect(f.isPlaying()).toBe(false);
    expect(s.revving).toBe(false);
    s.swung("p0", 50); // a backlog swing drained while still hidden: no rev
    s.revUpdate("p0", 50);
    expect(f.isPlaying()).toBe(false);
    f.doc.hidden = false;
    f.doc.fire();
    s.swung("p0", 2000);
    s.revUpdate("p0", 2000);
    expect(f.isPlaying()).toBe(true);
  });

  it("review M2: scene shutdown stops the loop and drops the listener", () => {
    const f = fakes();
    const s = new SawClock(FX.chainsawRevHoldMs, f.sink, f.doc as unknown as Document);
    expect(f.listeners).toHaveLength(1);
    s.swung("p0", 0);
    s.revUpdate("p0", 0);
    s.dispose();
    expect(f.isPlaying()).toBe(false);
    expect(f.listeners).toHaveLength(0);
  });

  it("review L3: audio not running yet → not marked playing; it starts on a later frame once audio runs (no release needed)", () => {
    const f = fakes(false);
    const s = new SawClock(FX.chainsawRevHoldMs, f.sink, null);
    s.swung("p0", 0);
    s.revUpdate("p0", 0);
    expect(s.revving).toBe(false);
    f.sink.running = true; // the first touch unlocked the audio, the trigger still held
    s.swung("p0", 100);
    s.revUpdate("p0", 116);
    expect(s.revving).toBe(true);
    expect(f.isPlaying()).toBe(true);
  });
});

describe("Chainsaw cut feedback (review M1: no zombie.hit, so the cut flashes and sounds itself)", () => {
  const world = () => {
    const w = createWorld({ balance, seed: 1 });
    const inside = [spawnZombie(w, "walker", 11.2, 10), spawnZombie(w, "walker", 11.0, 10.4)];
    const outside = [spawnZombie(w, "walker", 9, 10), spawnZombie(w, "walker", 13, 10)];
    return { w, inside, outside };
  };
  const rig = () => {
    const flashed: number[] = [];
    let sounds = 0;
    const fx = new ChainsawCutFx(256, (id) => flashed.push(id), () => sounds++);
    return { fx, flashed, sounds: () => sounds };
  };

  it("a server cut (hits > 0) flashes exactly the drawn zombies in the arc and sounds once", () => {
    const { w, inside } = world();
    const r = rig();
    expect(r.fx.cut(w, 2, 10, 10, 1, 0, 60, 1.5)).toBe(2);
    expect(r.flashed.sort()).toEqual([...inside].sort());
    expect(r.sounds()).toBe(1);
  });

  it("a server tick that cut nobody (hits 0): no flash, no sound (even if a drawn zombie lags inside)", () => {
    const { w } = world();
    const r = rig();
    expect(r.fx.cut(w, 0, 10, 10, 1, 0, 60, 1.5)).toBe(0);
    expect(r.flashed).toEqual([]);
    expect(r.sounds()).toBe(0);
  });

  it("my own local swing online (no hit count): the drawn zombies in the arc decide, flash and sound", () => {
    const { w, inside } = world();
    const r = rig();
    expect(r.fx.cut(w, undefined, 10, 10, 1, 0, 60, 1.5)).toBe(2);
    expect(r.flashed.sort()).toEqual([...inside].sort());
    expect(r.sounds()).toBe(1);
    const r2 = rig();
    expect(r2.fx.cut(w, undefined, 10, 10, 0, 1, 60, 1.5)).toBe(0); // aimed at nobody
    expect(r2.sounds()).toBe(0);
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

describe("cosmetic cut feedback agrees with the wall rule (Story 5.2 F7)", () => {
  it("a zombie behind a wood barricade is neither counted nor flashed; one beside it is", () => {
    const w = createWorld({ balance, seed: 1 });
    addBuildingAt(w, { id: 1, type: "wood_barricade", ownerId: "p0", gx: 21, gy: 18, rot: 1, hp: 200 }); // x 10.5–11, y 9–11
    const behind = spawnZombie(w, "walker", 11.2, 10);
    const beside = spawnZombie(w, "walker", 10.6, 11.6);
    expect(countInArc(w, 10, 10, 1, 0.8, 90, 1.5)).toBe(1);
    const flashed: number[] = [];
    new ChainsawCutFx(64, (id) => flashed.push(id), () => {}).cut(w, 1, 10, 10, 1, 0.8, 90, 1.5);
    expect(flashed).toEqual([beside]);
    expect(flashed).not.toContain(behind);
  });
});

