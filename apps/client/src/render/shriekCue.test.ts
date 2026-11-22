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

  it("rate-limited: Runners entering within the quiet time stay quiet (no stacked shrieks)", () => {
    const c = new ShriekCues(8);
    expect(c.check(1, 0, 20, 10, VIEW, 1)).toBe(0);
    expect(c.check(2, 0, 20, 10, VIEW, 1 + SHRIEK_MIN_INTERVAL_S / 2)).toBeNaN();
    expect(c.check(2, 0, 20, 10, VIEW, 5)).toBeNaN(); // it was marked: never shrieks late
    expect(c.check(3, 0, 20, 10, VIEW, 1 + SHRIEK_MIN_INTERVAL_S)).toBe(0);
  });
});
