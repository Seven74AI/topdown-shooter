import { describe, expect, it } from "vitest";
import { TICK_DT_S } from "@topdown/shared";
import { slamFrameIndex, telegraphProgress, TELEGRAPH_FADE_S, type TelegraphLook } from "./bossTelegraph";

const out: TelegraphLook = { progress: 0, visible: false, alpha: 0 };

describe("Story 6.5 F3: the fill tells you when", () => {
  it("draws from the server's start tick: a late message shows a ring already partly filled", () => {
    // The telegraph started at tick 100 (hit 124); the event arrived 150 ms (3 ticks) late.
    expect(telegraphProgress(103, 100, 124, out).progress).toBeCloseTo(3 / 24, 9);
    expect(out.visible).toBe(true);
    expect(telegraphProgress(100, 100, 124, out).progress).toBe(0);
  });

  it("the fill always reaches the edge on the hit tick, not later or earlier", () => {
    expect(telegraphProgress(123.99, 100, 124, out).progress).toBeLessThan(1);
    expect(telegraphProgress(124, 100, 124, out).progress).toBe(1);
    expect(out.alpha).toBe(1);
    for (let t = 100; t <= 124; t += 0.25) expect(telegraphProgress(t, 100, 124, out).progress).toBeCloseTo((t - 100) / 24, 9);
  });

  it("fades 0.3 s after the hit; a woken tab or late scene past it draws nothing", () => {
    const fade = TELEGRAPH_FADE_S / TICK_DT_S;
    telegraphProgress(124 + fade / 2, 100, 124, out);
    expect(out.visible).toBe(true);
    expect(out.alpha).toBeCloseTo(0.5, 9);
    expect(telegraphProgress(124 + fade + 0.01, 100, 124, out).visible).toBe(false);
    expect(telegraphProgress(5000, 100, 124, out).visible).toBe(false);
  });

  it("never from the arrival time: the same server tick gives the same fill whatever the arrival", () => {
    const a = telegraphProgress(110, 100, 124, { progress: 0, visible: false, alpha: 0 }).progress;
    const b = telegraphProgress(110, 100, 124, { progress: 0, visible: false, alpha: 0 }).progress;
    expect(a).toBe(b);
  });

  it("an empty or future telegraph draws nothing", () => {
    expect(telegraphProgress(100, 100, 100, out).visible).toBe(false);
    expect(telegraphProgress(90, 100, 124, out).visible).toBe(false);
  });

  it("the slam pose: arms rise over three frames with the fill", () => {
    expect([0, 0.2, 0.4, 0.7, 1].map(slamFrameIndex)).toEqual([0, 0, 1, 2, 2]);
  });
});
