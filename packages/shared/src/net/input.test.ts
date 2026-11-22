import { describe, expect, it } from "vitest";
import { NEUTRAL_INPUT, playerInputSchema } from "./input";

describe("PlayerInput.viewTick (Story 2.12)", () => {
  it("accepts -1 (none) and fractional ticks; refuses NaN, ∞, below -1, absent", () => {
    for (const viewTick of [-1, 0, 1234.56, 2 ** 31]) expect(playerInputSchema.safeParse({ ...NEUTRAL_INPUT, viewTick }).success, `${viewTick}`).toBe(true);
    for (const viewTick of [Number.NaN, Number.POSITIVE_INFINITY, -2, 2 ** 31 + 1, "5"]) {
      expect(playerInputSchema.safeParse({ ...NEUTRAL_INPUT, viewTick }).success, `${String(viewTick)}`).toBe(false);
    }
    const without: Partial<typeof NEUTRAL_INPUT> = { ...NEUTRAL_INPUT };
    delete without.viewTick;
    expect(playerInputSchema.safeParse(without).success).toBe(false);
    expect(NEUTRAL_INPUT.viewTick).toBe(-1);
  });
});
