import { describe, expect, it } from "vitest";
import { viewTickOf } from "./viewTick";

describe("viewTickOf (Story 2.12)", () => {
  it("rounds the render tick to 0.01 and gives -1 before the first snapshot", () => {
    expect(viewTickOf(1234.5678)).toBe(1234.57);
    expect(viewTickOf(Number.NaN)).toBe(-1);
    expect(viewTickOf(-3)).toBe(-1);
    expect(viewTickOf(0)).toBe(0);
  });
});
