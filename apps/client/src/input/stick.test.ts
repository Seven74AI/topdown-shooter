import { describe, expect, it } from "vitest";
import { stickDeflection, stickVector } from "./stick";

const R = 100;
const DZ = 0.1;

describe("stickVector", () => {
  it("is zero inside the dead zone", () => {
    expect(stickVector(0, 0, 9, 0, R, DZ)).toEqual({ x: 0, y: 0, magnitude: 0 });
    expect(stickVector(0, 0, 0, 0, R, DZ).magnitude).toBe(0);
  });

  it("starts at 0 at the dead-zone edge and reaches 1 at the rim", () => {
    expect(stickVector(0, 0, 10, 0, R, DZ).magnitude).toBeCloseTo(0, 9);
    expect(stickVector(0, 0, 100, 0, R, DZ).magnitude).toBeCloseTo(1, 9);
  });

  it("rescales linearly in between", () => {
    expect(stickVector(0, 0, 55, 0, R, DZ).magnitude).toBeCloseTo(0.5, 9);
  });

  it("clamps beyond the rim to 1", () => {
    const v = stickVector(0, 0, 0, 300, R, DZ);
    expect(v.magnitude).toBeCloseTo(1, 9);
    expect(v.y).toBeCloseTo(1, 9);
  });

  it("preserves direction", () => {
    const v = stickVector(10, 10, 10 + 60, 10 - 80, R, DZ);
    expect(v.x / v.magnitude).toBeCloseTo(0.6, 9);
    expect(v.y / v.magnitude).toBeCloseTo(-0.8, 9);
  });

  it("reports raw deflection without a dead zone", () => {
    expect(stickDeflection(0, 0, 25, 0, R)).toBeCloseTo(0.25, 9);
    expect(stickDeflection(0, 0, 250, 0, R)).toBe(1);
  });
});
