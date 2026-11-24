import { describe, expect, it } from "vitest";
import { TICK_RATE_HZ, loadBalance } from "@topdown/shared";
import { lampOutAt, lampWindows } from "./lampFlicker";

const cfg = loadBalance().decay.ruins;

describe("Story 6.2 F6: the Ruins lamp flicker (keyed to seed, lamp and tick)", () => {
  it("over 10 minutes of ticks: every drop-out lasts 0.15–0.6 s and consecutive ones start 4–10 s apart, for every lamp", () => {
    // Designer D7: 0.15–0.6 s every 4–10 s (the shipped values; a change is a design change).
    expect([cfg.lampOutMinS, cfg.lampOutMaxS, cfg.lampGapMinS, cfg.lampGapMaxS]).toEqual([0.15, 0.6, 4, 10]);
    const ticks = 10 * 60 * TICK_RATE_HZ;
    for (let lamp = 0; lamp < 11; lamp++) {
      const runs: [number, number][] = [];
      let start = -1;
      for (let t = 0; t <= ticks; t++) {
        const out = lampOutAt(1234, lamp, t, cfg);
        if (out && start < 0) start = t;
        if (!out && start >= 0) {
          if (start > 0) runs.push([start, t - start]); // a window cut by tick 0 is not whole
          start = -1;
        }
      }
      expect(runs.length, `lamp ${lamp}`).toBeGreaterThan(55); // ≈ 600 s / 7 s
      for (const [, len] of runs) {
        expect(len / TICK_RATE_HZ).toBeGreaterThanOrEqual(cfg.lampOutMinS);
        expect(len / TICK_RATE_HZ).toBeLessThanOrEqual(cfg.lampOutMaxS);
      }
      for (let i = 1; i < runs.length; i++) {
        const gap = ((runs[i] as [number, number])[0] - (runs[i - 1] as [number, number])[0]) / TICK_RATE_HZ;
        expect(gap, `lamp ${lamp} run ${i}`).toBeGreaterThanOrEqual(cfg.lampGapMinS);
        expect(gap, `lamp ${lamp} run ${i}`).toBeLessThanOrEqual(cfg.lampGapMaxS);
      }
    }
  });

  it("same seed → the same pattern on every phone; another seed or another lamp differs", () => {
    const pattern = (seed: number, lamp: number) => Array.from({ length: 2000 }, (_, t) => (lampOutAt(seed, lamp, t, cfg) ? 1 : 0)).join("");
    expect(pattern(7, 3)).toBe(pattern(7, 3));
    expect(pattern(7, 3)).not.toBe(pattern(8, 3));
    expect(pattern(7, 3)).not.toBe(pattern(7, 4));
    // A late joiner asking for a tick far into the run gets the same answer (no state).
    expect(lampOutAt(7, 3, 123456, cfg)).toBe(lampOutAt(7, 3, 123456, cfg));
    expect(lampWindows(7, 3, 0, 3, cfg)).toHaveLength(4);
  });
});
