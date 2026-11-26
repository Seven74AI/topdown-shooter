import { describe, expect, it } from "vitest";
import { syncHeliToRun, type HeliLike } from "./heliSync";
import type { HeliPhase } from "./heliPose";

/** Story 12.2: the helicopter against the run (review L4: a later endless extraction after a Stay). */
function fake(phase: HeliPhase, hasLeft: boolean) {
  const calls: string[] = [];
  const h: HeliLike & { phase: HeliPhase; hasLeft: boolean } = {
    phase,
    hasLeft,
    opened: () => {
      calls.push("opened");
      h.phase = "landed";
    },
    left: (_n, extract, flyS) => {
      calls.push(`left:${extract}:${flyS}`);
      h.hasLeft = true;
    },
    reset: () => {
      calls.push("reset");
      h.phase = "gone";
      h.hasLeft = false;
    },
  };
  return { h, calls };
}

describe("syncHeliToRun", () => {
  it("review L4: a Stay lift-off flown off at wave 10 is cleared at the build, so a phone waking into the wave-15 extraction sees the fly-out", () => {
    const { h, calls } = fake("gone", true);
    syncHeliToRun(h, "build", false, -1, 100, 50, 8);
    expect(calls).toEqual(["reset"]);
    syncHeliToRun(h, "extract", true, 900, 960, 80, 8); // woke mid-fly-out (3 s after the lift-off)
    expect(calls).toEqual(["reset", "opened", "left:true:8"]);
  });

  it("a Stay lift-off still in the air plays out through the build start (no reset while lifting)", () => {
    const { h, calls } = fake("lifting", true);
    syncHeliToRun(h, "build", false, -1, 100, 50, 8);
    expect(calls).toEqual([]);
  });

  it("extract: waits on the pad until the lift-off tick, then leaves once", () => {
    const { h, calls } = fake("landed", false);
    syncHeliToRun(h, "extract", true, -1, 300, 10, 8);
    expect(calls).toEqual([]);
    syncHeliToRun(h, "extract", true, 310, 310, 10.5, 8);
    syncHeliToRun(h, "extract", true, 310, 320, 11, 8);
    expect(calls).toEqual(["left:true:8"]);
  });
});
