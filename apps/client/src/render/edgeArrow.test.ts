import { describe, expect, it } from "vitest";
import { edgeArrow } from "./edgeArrow";

describe("edgeArrow", () => {
  const out = { x: 0, y: 0, angle: 0 };
  it("returns false for on-screen targets", () => {
    expect(edgeArrow(100, 100, 800, 400, 20, out)).toBe(false);
  });
  it("clamps an off-screen target onto the inset edge along the line from the center", () => {
    expect(edgeArrow(1600, 200, 800, 400, 20, out)).toBe(true);
    expect(out.x).toBeCloseTo(780, 6);
    expect(out.y).toBeCloseTo(200, 6);
    expect(out.angle).toBeCloseTo(0, 6);
    expect(edgeArrow(400, -1000, 800, 400, 20, out)).toBe(true);
    expect(out.y).toBeCloseTo(20, 6);
  });
  it("handles corners (hits the nearer edge first)", () => {
    expect(edgeArrow(-400, -400, 800, 400, 20, out)).toBe(true);
    expect(out.y).toBeCloseTo(20, 6);
    expect(out.x).toBeGreaterThan(20);
  });
});
