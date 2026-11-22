import { describe, expect, it } from "vitest";
import { PULSE_PERIOD_MS, pulseAlpha, pulseScale } from "./pulse";

describe("pulse (Story 2.9)", () => {
  it("pulseScale stays between 1 and 1.25, pulseAlpha between 0.6 and 1", () => {
    for (let t = 0; t < 3 * PULSE_PERIOD_MS; t += 7) {
      expect(pulseScale(t)).toBeGreaterThanOrEqual(1);
      expect(pulseScale(t)).toBeLessThanOrEqual(1.25);
      expect(pulseAlpha(t)).toBeGreaterThanOrEqual(0.6);
      expect(pulseAlpha(t)).toBeLessThanOrEqual(1);
    }
  });

  it("peaks at a quarter period and bottoms at three quarters, alpha in phase with scale", () => {
    expect(pulseScale(PULSE_PERIOD_MS / 4)).toBeCloseTo(1.25, 6);
    expect(pulseAlpha(PULSE_PERIOD_MS / 4)).toBeCloseTo(1, 6);
    expect(pulseScale((3 * PULSE_PERIOD_MS) / 4)).toBeCloseTo(1, 6);
    expect(pulseAlpha((3 * PULSE_PERIOD_MS) / 4)).toBeCloseTo(0.6, 6);
    expect(pulseScale(0)).toBeCloseTo(1.125, 6);
    expect(pulseScale(PULSE_PERIOD_MS)).toBeCloseTo(pulseScale(0), 6);
  });
});
