import { describe, expect, it } from "vitest";
import { reviveZoneStyle } from "./reviveZone";

describe("revive zone (Story 4.9)", () => {
  it("is brighter while a revive runs than while nobody is in reach, at every point of the pulse", () => {
    const idle = reviveZoneStyle(false, 0, { fillAlpha: 0, lineAlpha: 0, lineWidthM: 0 });
    for (let t = 0; t < 800; t += 50) {
      const on = reviveZoneStyle(true, t, { fillAlpha: 0, lineAlpha: 0, lineWidthM: 0 });
      expect(on.lineAlpha).toBeGreaterThan(idle.lineAlpha);
      expect(on.fillAlpha).toBeGreaterThan(idle.fillAlpha);
      expect(on.lineWidthM).toBeGreaterThan(idle.lineWidthM);
    }
  });
  it("pulses while reviving and stays still while idle", () => {
    const at = (r: boolean, t: number): number => reviveZoneStyle(r, t, { fillAlpha: 0, lineAlpha: 0, lineWidthM: 0 }).lineAlpha;
    expect(at(true, 0)).not.toBeCloseTo(at(true, 200), 2);
    expect(at(false, 0)).toBe(at(false, 400));
    expect(at(false, 0)).toBeGreaterThan(0.2); // still visible on the dark street
  });
});
