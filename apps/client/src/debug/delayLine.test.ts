import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { delayLine } from "./perfStats";

describe("Story 8.9 (AC 7): the overlay's delay line", () => {
  it("reads delay, target, late p95, rate, freezes and my queued inputs", () => {
    const n = { rttMs: 150, delayMs: 139.6, targetMs: 160.2, lateP95Ms: 60, rate: 1, freezes: 0, queued: 2, corrections: 0, snaps: 0, apparentHits: 0, confirmed: 0, reversed: 0 };
    expect(delayLine(n)).toBe("delay 140 ms (target 160) · late p95 60 · rate 1.00× · freezes 0 · queue 2");
    expect(delayLine({ ...n, rate: 0.9, freezes: 3, queued: 5 })).toContain("rate 0.90× · freezes 3 · queue 5");
  });

  it("wiring: the ?debug=1 overlay prints it", () => {
    const src = readFileSync(new URL("./PerfOverlay.ts", import.meta.url), "utf8");
    expect(src).toMatch(/lines\.push\(delayLine\(n\)\)/);
  });
});
