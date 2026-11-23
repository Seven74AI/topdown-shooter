import { describe, expect, it } from "vitest";
import { fuseProgress, swellPulse, swellStage, swellTint } from "./bloaterLook";

describe("Story 5.8 swell telegraph (AC 8b)", () => {
  it("the fuse fills over swellS and the frames step 1 → 2 → 3", () => {
    expect(fuseProgress(0, 1)).toBe(0);
    expect(fuseProgress(0.5, 1)).toBe(0.5);
    expect(fuseProgress(2, 1)).toBe(1);
    expect([0, 0.2, 0.34, 0.5, 0.67, 0.9, 1].map(swellStage)).toEqual([1, 1, 2, 2, 3, 3, 3]);
  });

  it("the pulse stays in 0–1 and grows stronger as the fuse burns; the tint is white at 0", () => {
    let early = 0;
    let late = 0;
    for (let t = 0; t < 1; t += 0.01) {
      const k = swellPulse(t, t);
      expect(k).toBeGreaterThanOrEqual(0);
      expect(k).toBeLessThanOrEqual(1);
      if (t < 0.3) early = Math.max(early, k);
      if (t > 0.7) late = Math.max(late, k);
    }
    expect(late).toBeGreaterThan(early);
    expect(swellTint(0)).toBe(0xffffff);
    expect(swellTint(1)).toBe(0xc8f070);
  });
});
