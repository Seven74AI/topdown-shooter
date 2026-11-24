import { describe, expect, it } from "vitest";
import { haptic } from "./haptic";

describe("Story 5.20: haptic", () => {
  it("vibrates for the given ms when the API exists; silent when missing or throwing", () => {
    const calls: number[] = [];
    haptic(12, { vibrate: (ms) => (calls.push(ms), true) });
    expect(calls).toEqual([12]);
    expect(() => haptic(12, {})).not.toThrow();
    expect(() => haptic(12, undefined)).not.toThrow();
    expect(() =>
      haptic(12, {
        vibrate: () => {
          throw new Error("blocked");
        },
      }),
    ).not.toThrow();
  });
});
