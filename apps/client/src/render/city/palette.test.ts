import { describe, expect, it } from "vitest";
import { GROUND, ROOFS, ROOF_DEFAULT, ROOF_MARGIN, brightestSidewalk, hexRgb, lit, luma, roofMarginOk, roofShown, shadowLenPx } from "./palette";

describe("Dead City palette: solid vs walkable never confuses (designer's weakness #1)", () => {
  it("every roof, as shown, beats the brightest lit sidewalk by the margin", () => {
    const side = luma(brightestSidewalk());
    for (const hex of [...Object.values(ROOFS), ROOF_DEFAULT]) {
      expect(luma(roofShown(hex)), hex).toBeGreaterThanOrEqual(side + ROOF_MARGIN);
      expect(roofMarginOk(hex)).toBe(true);
    }
  });
  it("the check bites: the study's darker roofs fail it", () => {
    expect(roofMarginOk("#5b544b")).toBe(false);
    expect(roofMarginOk("#51535a")).toBe(false);
  });
  it("the brightest sidewalk is brighter than the bare sidewalk (lamps and spill count)", () => {
    expect(luma(brightestSidewalk())).toBeGreaterThan(luma(hexRgb(GROUND.sidewalk)));
  });
  it("lit() multiplies, adds glow and clamps", () => {
    expect(lit([100, 100, 100], [255, 255, 255])).toEqual([100, 100, 100]);
    expect(lit([100, 100, 100], [128, 128, 128])[0]).toBeCloseTo(50.2, 1);
    expect(lit([200, 0, 0], [255, 255, 255], [100, 10, 0])).toEqual([255, 10, 0]);
  });
  it("shadow length grows with height and is capped", () => {
    expect(shadowLenPx(0.6)).toBeLessThan(shadowLenPx(1.5));
    expect(shadowLenPx(3.2)).toBeLessThan(shadowLenPx(9));
    expect(shadowLenPx(100)).toBe(shadowLenPx(50));
  });
});
