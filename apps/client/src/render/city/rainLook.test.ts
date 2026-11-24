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

  it("re-review: the factors come from decay.json (rainK, hazardAboveDarkPct), not literals", async () => {
    const { bundledBalanceFiles } = await import("@topdown/shared");
    const { hazardGhostFor } = await import("./rainLook");
    const raw = bundledBalanceFiles() as unknown as { decay: { blackout: Record<string, number> } };
    raw.decay.blackout.rainK = 0.5;
    raw.decay.blackout.hazardAboveDarkPct = 25;
    const w = createWorld({ balance: loadBalance(raw as never), seed: 1, systems: { waves: () => {} } });
    expect(hazardGhostFor(w)).toBe(0);
    setForcedBlackout(w, 10);
    expect(rainAlphaFor(w, 0.2)).toBeCloseTo(0.1, 12);
    expect(hazardGhostFor(w)).toBeCloseTo(0.25, 12);
  });
});
