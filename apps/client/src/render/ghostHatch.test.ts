import { describe, expect, it } from "vitest";
import { crossHalf, hatchSegments } from "./ghostHatch";

/** Story 5.17 (AC 6): the blocked ghost's hatch and ✕. */
describe("ghostHatch", () => {
  const out = new Float64Array(400);
  it("45° segments, clipped to the box, 0.25 m apart", () => {
    const n = hatchSegments(1, 2, 3, 2.5, 0.25, out); // a 2 × 0.5 m barricade
    expect(n).toBe(9); // (2 + 0.5) / 0.25 − 1
    for (let i = 0; i < n; i++) {
      const [x0, y0, x1, y1] = [out[i * 4], out[i * 4 + 1], out[i * 4 + 2], out[i * 4 + 3]] as [number, number, number, number];
      for (const [x, y] of [[x0, y0], [x1, y1]] as [number, number][]) {
        expect(x).toBeGreaterThanOrEqual(1 - 1e-9);
        expect(x).toBeLessThanOrEqual(3 + 1e-9);
        expect(y).toBeGreaterThanOrEqual(2 - 1e-9);
        expect(y).toBeLessThanOrEqual(2.5 + 1e-9);
      }
      expect(Math.abs(x1 - x0)).toBeCloseTo(Math.abs(y1 - y0), 9); // 45°
      expect(x0 + y0).toBeCloseTo(x1 + y1, 9);
      expect(x0 + y0).toBeCloseTo(3 + 0.25 * (i + 1), 9); // evenly spaced
    }
  });
  it("a 0.5 m mine gets a line; the out buffer caps the count", () => {
    expect(hatchSegments(0, 0, 0.5, 0.5, 0.25, out)).toBe(3);
    expect(hatchSegments(0, 0, 10, 10, 0.25, new Float64Array(8))).toBe(2);
  });
  it("✕ is 0.4 m but stays inside a small box", () => {
    expect(crossHalf(2, 0.5, 0.4)).toBeCloseTo(0.2);
    expect(crossHalf(0.5, 0.5, 0.4)).toBeCloseTo(0.2);
    expect(crossHalf(0.3, 0.5, 0.4)).toBeCloseTo(0.12);
  });
});
