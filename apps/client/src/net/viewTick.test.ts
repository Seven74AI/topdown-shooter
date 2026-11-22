import { describe, expect, it } from "vitest";
import { viewTickOf } from "./viewTick";

describe("viewTickOf (Story 2.12)", () => {
  it("gives the render tick in integer hundredths and gives -1 before the first snapshot", () => {
    expect(viewTickOf(1234.5678)).toBe(123457);
    expect(viewTickOf(Number.NaN)).toBe(-1);
    expect(viewTickOf(-3)).toBe(-1);
    expect(viewTickOf(0)).toBe(0);
  });
});
