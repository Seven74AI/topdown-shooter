import { describe, expect, it } from "vitest";
import { SHRIEK_MIN_INTERVAL_S, ShriekCues } from "./shriekCue";

/** A 20 × 10 m view at (10, 5)…(30, 15); centre x = 20. */
const VIEW = { x: 10, y: 5, width: 20, height: 10 };

describe("ShriekCues (Story 3.8, FR84)", () => {
  it("cues a Runner once, when it first enters the view, panned by its screen x", () => {
    const c = new ShriekCues(8);
    expect(c.check(1, 0, 5, 10, VIEW, 0)).toBeNaN(); // still outside (left of the view)
    expect(c.check(1, 0, 10.5, 10, VIEW, 0.1)).toBeCloseTo(-0.95, 5); // in, at the left edge
    expect(c.check(1, 0, 20, 10, VIEW, 2)).toBeNaN(); // already cued
    expect(c.check(1, 0, 40, 10, VIEW, 3)).toBeNaN(); // left …
    expect(c.check(1, 0, 25, 10, VIEW, 4)).toBeNaN(); // … and came back: the same zombie stays quiet
  });

  it("a new zombie in the slot (new generation) can shriek again", () => {
    const c = new ShriekCues(8);
    expect(c.check(2, 0, 20, 10, VIEW, 0)).toBe(0);
    expect(c.check(2, 1, 30, 10, VIEW, 1)).toBe(1);
  });

  it("rate-limited per screen side: Runners entering within the quiet time cue once it is over (review L7)", () => {
    const c = new ShriekCues(8);
    expect(c.check(1, 0, 25, 10, VIEW, 1)).toBeCloseTo(0.5, 5); // right
    expect(c.check(2, 0, 26, 10, VIEW, 1 + SHRIEK_MIN_INTERVAL_S / 2)).toBeNaN(); // right, in the window: not yet
    expect(c.check(2, 0, 26, 10, VIEW, 1 + SHRIEK_MIN_INTERVAL_S)).toBeCloseTo(0.6, 5); // later: it cues
    expect(c.check(2, 0, 26, 10, VIEW, 5)).toBeNaN(); // once
  });

  it("ten from the right don't silence one from the left", () => {
    const c = new ShriekCues(16);
    let cued = 0;
    for (let i = 0; i < 10; i++) if (!Number.isNaN(c.check(i, 0, 28, 10, VIEW, 1 + i * 0.01))) cued++;
    expect(cued).toBe(1);
    expect(c.check(12, 0, 12, 10, VIEW, 1.05)).toBeCloseTo(-0.8, 5); // left side has its own window
  });
});
