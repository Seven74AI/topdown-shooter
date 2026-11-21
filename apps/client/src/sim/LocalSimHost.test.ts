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

  it("passes the local input to the world each step", () => {
    const host = new LocalSimHost({ balance, seed: 1 });
    host.setLocalInput({ seq: 7, moveX: 1, moveY: 0, aimX: 0, aimY: 0, fire: false, swap: false, consumable: false, isMouse: false });
    host.update(0.05);
    expect(host.world.inputs.get("local")?.seq).toBe(7);
  });
});
