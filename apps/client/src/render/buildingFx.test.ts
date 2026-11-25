import { describe, expect, it } from "vitest";
import { GLINT_DUTY, glintAlpha, glowLevel, type GlowKind } from "./buildingFx";

const sample = (kind: GlowKind, seed = 0): number[] => Array.from({ length: 2400 }, (_, i) => glowLevel(kind, i / 200, seed));

describe("photoreal group 3: the relit buildings' glow and glints (buildingFx)", () => {
  it("none never glows; every kind stays within 0–1", () => {
    expect(sample("none").every((v) => v === 0)).toBe(true);
    for (const k of ["flicker", "heartbeat", "blink", "strobe"] as const) for (const v of sample(k)) {
      expect(v).toBeGreaterThanOrEqual(0);
      expect(v).toBeLessThanOrEqual(1.0001);
    }
  });

  it("the floodlight hums near full and dips now and then", () => {
    const v = sample("flicker", 3);
    expect(v.filter((x) => x > 0.8).length / v.length).toBeGreaterThan(0.5);
    expect(Math.min(...v)).toBeLessThan(0.5);
  });

  it("the mine's LED flashes about 12 % of the time; the med cross beats twice per 1.1 s", () => {
    const b = sample("blink");
    const on = b.filter((x) => x === 1).length / b.length;
    expect(on).toBeGreaterThan(0.09);
    expect(on).toBeLessThan(0.15);
    const h = Array.from({ length: 1100 }, (_, i) => glowLevel("heartbeat", i / 1000, 0));
    let peaks = 0;
    for (let i = 1; i < h.length - 1; i++) if (h[i]! > 0.6 && h[i]! >= h[i - 1]! && h[i]! > h[i + 1]!) peaks++;
    expect(peaks).toBe(2);
  });

  it("seeds keep neighbouring lamps out of step", () => {
    expect(sample("blink", 0)).not.toEqual(sample("blink", 1));
  });

  it("a glint lights for its duty share of the cycle, and spots take turns", () => {
    const a = Array.from({ length: 1000 }, (_, i) => glintAlpha(i / 550, 0, 0));
    const lit = a.filter((x) => x > 0).length / a.length;
    expect(lit).toBeGreaterThan(GLINT_DUTY - 0.03);
    expect(lit).toBeLessThan(GLINT_DUTY + 0.03);
    const t = 0.05;
    expect(glintAlpha(t, 0, 0) > 0 && glintAlpha(t, 1, 0) > 0).toBe(false);
  });
});
