import { describe, expect, it } from "vitest";
import { createWorld, loadBalance, setForcedBlackout } from "@topdown/shared";
import { rainAlphaFor } from "./rainLook";

describe("Story 6.3 rain in a blackout (D7)", () => {
  it("the rain is dimmed to 35 % (decay.json › blackout.rainK) in a blackout, full otherwise", () => {
    const w = createWorld({ balance: loadBalance(), seed: 1, systems: { waves: () => {} } });
    expect(w.balance.decay.blackout.rainK).toBe(0.35);
    expect(rainAlphaFor(w, 0.28)).toBe(0.28);
    setForcedBlackout(w, 5);
    expect(rainAlphaFor(w, 0.28)).toBeCloseTo(0.28 * 0.35, 12);
  });
});
