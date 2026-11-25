import { describe, expect, it } from "vitest";
import { INPUT_QUEUE_TARGET } from "@topdown/shared";
import { INPUT_SLOW_AFTER_PATCHES, INPUT_SLOW_STEP_RATE } from "./netConfig";
import { StepPacing } from "./stepPacing";

describe("StepPacing (Story 8.9, D5)", () => {
  it("slows to 0.9× after 3 patches in a row over the target, back to 1× at the target", () => {
    const p = new StepPacing();
    expect(INPUT_QUEUE_TARGET).toBe(2);
    expect(INPUT_SLOW_AFTER_PATCHES).toBe(3);
    p.onPatch(4);
    p.onPatch(4);
    expect(p.frame()).toBe(1);
    p.onPatch(4);
    expect(p.frame()).toBe(INPUT_SLOW_STEP_RATE);
    p.onPatch(3);
    expect(p.rate).toBe(INPUT_SLOW_STEP_RATE);
    p.onPatch(2);
    expect(p.frame()).toBe(1);
    expect(p.queued).toBe(2);
  });

  it("a dip to the target restarts the count; never faster than 1×", () => {
    const p = new StepPacing();
    for (const q of [5, 5, 2, 5, 5]) p.onPatch(q);
    expect(p.rate).toBe(1);
    for (const q of [0, 0, 0, 1, 2]) {
      p.onPatch(q);
      expect(p.rate).toBe(1);
    }
    p.reset();
    expect(p.rate).toBe(1);
  });
});
