import { describe, expect, it } from "vitest";
import { createRng, createRngFromState } from "./rng";

const draw = (n: number, seed: number): number[] => {
  const rng = createRng(seed);
  return Array.from({ length: n }, () => rng.next());
};

describe("rng", () => {
  it("repeats the same sequence for the same seed", () => {
    expect(draw(1000, 7)).toEqual(draw(1000, 7));
  });

  it("gives different sequences for different seeds", () => {
    expect(draw(20, 1)).not.toEqual(draw(20, 2));
  });

  it("returns values in [0, 1)", () => {
    for (const v of draw(10_000, 99)) {
      expect(v).toBeGreaterThanOrEqual(0);
      expect(v).toBeLessThan(1);
    }
  });

  it("continues the identical sequence after a state round-trip", () => {
    const a = createRng(123);
    for (let i = 0; i < 50; i++) a.next();
    const b = createRngFromState(a.getState());
    for (let i = 0; i < 100; i++) expect(b.next()).toBe(a.next());
  });

  it("keeps int() in bounds and reaches both ends", () => {
    const rng = createRng(5);
    let sawMin = false;
    let sawMax = false;
    for (let i = 0; i < 10_000; i++) {
      const v = rng.int(-2, 3);
      expect(Number.isInteger(v)).toBe(true);
      expect(v).toBeGreaterThanOrEqual(-2);
      expect(v).toBeLessThanOrEqual(3);
      if (v === -2) sawMin = true;
      if (v === 3) sawMax = true;
    }
    expect(sawMin && sawMax).toBe(true);
  });

  it("refuses invalid int() bounds (programmer error)", () => {
    const rng = createRng(5);
    expect(() => rng.int(5, 3)).toThrow();
    expect(() => rng.int(0.5, 3)).toThrow();
    expect(rng.int(4, 4)).toBe(4);
  });

  it("keeps range() in [min, max)", () => {
    const rng = createRng(6);
    for (let i = 0; i < 1000; i++) {
      const v = rng.range(-4, 4);
      expect(v).toBeGreaterThanOrEqual(-4);
      expect(v).toBeLessThan(4);
    }
  });

  it("picks from an array and refuses an empty one", () => {
    const rng = createRng(8);
    const items = ["a", "b", "c"] as const;
    for (let i = 0; i < 100; i++) expect(items).toContain(rng.pick(items));
    expect(() => rng.pick([])).toThrow();
  });

  it("matches the frozen golden vector (catches accidental algorithm changes)", () => {
    expect(draw(5, 12345)).toEqual(GOLDEN_12345);
  });
});

// First 5 next() values for seed 12345 (sfc32 seeded by splitmix32, 12 warm-up draws).
const GOLDEN_12345: number[] = [0.32587812445126474, 0.019479799084365368, 0.27737857401371, 0.2809333000332117, 0.6093230419792235];
