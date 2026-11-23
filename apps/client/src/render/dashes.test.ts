import { describe, expect, it } from "vitest";
import { dashedCircle } from "./dashes";

describe("dashedCircle (Story 5.17)", () => {
  it("dashes on the circle, ~dashM long, half the circumference drawn", () => {
    const segs: number[][] = [];
    const n = dashedCircle({ lineBetween: (a, b, c, d) => segs.push([a, b, c, d]) }, 3, 4, 2, 0.3);
    expect(n).toBe(segs.length);
    expect(n).toBeGreaterThan(15);
    let len = 0;
    for (const [x0, y0, x1, y1] of segs as [number, number, number, number][]) {
      expect(Math.hypot(x0 - 3, y0 - 4)).toBeCloseTo(2, 9);
      expect(Math.hypot(x1 - 3, y1 - 4)).toBeCloseTo(2, 9);
      len += Math.hypot(x1 - x0, y1 - y0);
    }
    expect(len / n).toBeGreaterThan(0.25);
    expect(len / n).toBeLessThan(0.35);
    expect(len).toBeGreaterThan(Math.PI * 2 * 0.95);
    expect(len).toBeLessThan(Math.PI * 2 * 1.01);
  });
});
