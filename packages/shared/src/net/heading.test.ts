import { describe, expect, it } from "vitest";
import { headingToRad, lerpHeading, quantizeHeading } from "./heading";

describe("quantizeHeading", () => {
  it("is 0 for +x and increases toward +y", () => {
    expect(quantizeHeading(1, 0)).toBe(0);
    expect(quantizeHeading(0, 1)).toBe(64);
    expect(quantizeHeading(-1, 0)).toBe(128);
    expect(quantizeHeading(0, -1)).toBe(192);
    expect(quantizeHeading(1, -1e-9)).toBe(0); // just below +x wraps to 0, not 256
    expect(quantizeHeading(0, 0)).toBe(0);
  });

  it("round-trips within half a step (0.7°)", () => {
    for (let deg = 0; deg < 360; deg += 7) {
      const a = (deg * Math.PI) / 180;
      const h = quantizeHeading(Math.cos(a), Math.sin(a));
      expect(h).toBeGreaterThanOrEqual(0);
      expect(h).toBeLessThanOrEqual(255);
      const back = headingToRad(h);
      const diff = Math.abs(Math.atan2(Math.sin(back - a), Math.cos(back - a)));
      expect(diff).toBeLessThanOrEqual(Math.PI / 256 + 1e-12);
    }
  });

  it("headingToRad and lerpHeading take the short way round", () => {
    expect(headingToRad(64)).toBeCloseTo(Math.PI / 2, 12);
    expect(headingToRad(256 + 64)).toBeCloseTo(Math.PI / 2, 12);
    expect(lerpHeading(250, 6, 0.5)).toBeCloseTo(0, 12);
    expect(lerpHeading(10, 20, 0.5)).toBe(15);
    expect(lerpHeading(6, 250, 0.25)).toBeCloseTo(3, 12);
  });
});
