import { describe, expect, it } from "vitest";
import { PROTECT_BLINK_MIN_ALPHA, protectBlinkAlpha } from "./protectBlink";

describe("Story 8.1 spawn-protection blink (D3)", () => {
  it("is 1 without protection, and swings between the min alpha and 1 while protected (1 ms sweep)", () => {
    expect(protectBlinkAlpha(0, 123)).toBe(1);
    let min = 1;
    let max = 0;
    for (let t = 0; t <= 2000; t++) {
      const a = protectBlinkAlpha(40, t);
      min = Math.min(min, a);
      max = Math.max(max, a);
    }
    expect(min).toBeCloseTo(PROTECT_BLINK_MIN_ALPHA, 3);
    expect(max).toBeCloseTo(1, 6);
  });
});
