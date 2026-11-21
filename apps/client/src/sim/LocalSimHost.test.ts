import { describe, expect, it } from "vitest";
import { loadBalance } from "@topdown/shared";
import { LocalSimHost, MAX_CATCHUP_STEPS } from "./LocalSimHost";

const balance = loadBalance();
const FRAME_60HZ = 1 / 60;

describe("LocalSimHost", () => {
  it("steps exactly 20 times in 1 s of 60 Hz frames", () => {
    const host = new LocalSimHost({ balance, seed: 1 });
    for (let i = 0; i < 60; i++) host.update(FRAME_60HZ);
    // Float accumulation can leave the 20th step a hair short; allow one extra tiny frame.
    host.update(1e-9);
    expect(host.world.tick).toBe(20);
  });

  it("caps catch-up after a long frame and drops the rest", () => {
    const host = new LocalSimHost({ balance, seed: 1 });
    host.update(2);
    expect(host.world.tick).toBe(MAX_CATCHUP_STEPS);
    expect(host.alpha).toBeGreaterThanOrEqual(0);
    expect(host.alpha).toBeLessThan(1);
    host.update(FRAME_60HZ);
    expect(host.world.tick).toBeLessThanOrEqual(MAX_CATCHUP_STEPS + 1);
  });

  it("times each step of the last update (stats for the perf overlay)", () => {
    const host = new LocalSimHost({ balance, seed: 1 });
    host.update(0.12); // 2 steps, 0.02 s left over
    expect(host.stats.lastUpdateSteps).toBe(2);
    expect(Number.isFinite(host.stats.stepMs[0] as number) && (host.stats.stepMs[0] as number) >= 0).toBe(true);
    expect(Number.isFinite(host.stats.stepMs[1] as number) && (host.stats.stepMs[1] as number) >= 0).toBe(true);
    host.update(0.01);
    expect(host.stats.lastUpdateSteps).toBe(0);
    host.update(0);
    expect(host.stats.lastUpdateSteps).toBe(0);
    expect(host.stats.totalSteps).toBe(2);
  });

  it("keeps alpha in [0, 1) across uneven frames", () => {
    const host = new LocalSimHost({ balance, seed: 1 });
    for (const dt of [0.001, 0.033, 0.017, 0.049, 0.051, 0.1, 0.0167]) {
      host.update(dt);
      expect(host.alpha).toBeGreaterThanOrEqual(0);
      expect(host.alpha).toBeLessThan(1);
    }
  });

  it("ignores zero, negative and NaN frame times", () => {
    const host = new LocalSimHost({ balance, seed: 1 });
    host.update(0);
    host.update(-1);
    host.update(Number.NaN);
    expect(host.world.tick).toBe(0);
    expect(host.alpha).toBe(0);
  });

  it("hands out events from all steps of a frame once, in order", () => {
    const host = new LocalSimHost({ balance, seed: 1 });
    // Emit one event per tick from outside a system: it is delivered at the next step's flush.
    const emitNext = () => host.world.events.emit({ type: "test.ping", n: host.world.tick });
    emitNext();
    host.update(0.05);
    emitNext();
    host.update(0.05);
    const first = host.drainEvents().map((e) => (e.type === "test.ping" ? e.n : -1));
    expect(first).toEqual([0, 1]);
    expect(host.drainEvents()).toEqual([]);
  });

  it("delivers a swap tapped between two steps to exactly one step", () => {
    const host = new LocalSimHost({ balance, seed: 1 });
    let swapTicks = 0;
    const neutral = { seq: 0, moveX: 0, moveY: 0, aimX: 0, aimY: 0, fire: false, swap: false, consumable: false, isMouse: false };
    host.setLocalInput({ ...neutral, swap: true }); // tap on one frame…
    host.update(FRAME_60HZ);
    host.setLocalInput(neutral); // …released on the next, before any step ran
    let lastTick = host.world.tick;
    if (host.world.inputs.get("local")?.swap) swapTicks++;
    for (let i = 0; i < 12; i++) {
      host.update(FRAME_60HZ);
      if (host.world.tick !== lastTick) {
        lastTick = host.world.tick;
        if (host.world.inputs.get("local")?.swap) swapTicks++;
      }
    }
    expect(host.world.tick).toBeGreaterThanOrEqual(3);
    expect(swapTicks).toBe(1);
  });

  it("does not repeat a swap across catch-up steps after a long frame", () => {
    const host = new LocalSimHost({ balance, seed: 1 });
    let swaps = 0;
    host.world.events.subscribe(() => {});
    host.setLocalInput({ seq: 0, moveX: 0, moveY: 0, aimX: 0, aimY: 0, fire: false, swap: true, consumable: false, isMouse: false });
    // Count swaps seen per step by stepping one frame at a time after the long frame.
    host.update(0.05);
    if (host.world.inputs.get("local")?.swap) swaps++;
    host.update(0.25); // 5 catch-up steps with the same held input
    if (host.world.inputs.get("local")?.swap) swaps++;
    expect(swaps).toBe(1);
  });

  it("passes the local input to the world each step", () => {
    const host = new LocalSimHost({ balance, seed: 1 });
    host.setLocalInput({ seq: 7, moveX: 1, moveY: 0, aimX: 0, aimY: 0, fire: false, swap: false, consumable: false, isMouse: false });
    host.update(0.05);
    expect(host.world.inputs.get("local")?.moveX).toBe(1);
    expect(host.world.inputs.get("local")?.seq).toBe(1); // the host stamps one seq per step
  });
});
