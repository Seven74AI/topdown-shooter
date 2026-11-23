import { describe, expect, it } from "vitest";
import { dashedCircle, zombieAlive } from "./dashes";

describe("dashedCircle (Story 5.17)", () => {
  it("dashes on the circle, ~dashM long, half the circumference drawn", () => {
    const segs: number[][] = [];
    const n = dashedCircle({ lineBetween: (a, b, c, d) => segs.push([a, b, c, d]) }, 3, 4, 2, 0.3);
    expect(n).toBe(segs.length);
    expect(n).toBeGreaterThan(15);
    let len = 0;
    for (const [x0, y0, x1, y1] of segs as [number, number, number, number][]) {
      expect(Math.hypot(x0 - 3, y0 - 4)).toBeCloseTo(2, 9);
      expect(Math.hypot(x1 - 3, y1 - 4)).toBeCloseTo(2, 9);
      len += Math.hypot(x1 - x0, y1 - y0);
    }
    expect(len / n).toBeGreaterThan(0.25);
    expect(len / n).toBeLessThan(0.35);
    expect(len).toBeGreaterThan(Math.PI * 2 * 0.95);
    expect(len).toBeLessThan(Math.PI * 2 * 1.01);
  });
  it("a small circle still gets at least 8 dashes", () => {
    let n = 0;
    expect(dashedCircle({ lineBetween: () => n++ }, 0, 0, 0.1, 0.3)).toBe(4); // 8 slots, every other one drawn
    expect(n).toBe(4);
  });
  it("review L4: zombieAlive follows the alive list (a dead or reused slot is not the culprit)", () => {
    const ids = Int32Array.from([5, 2, 9]);
    const pos = new Int32Array(10).fill(-1);
    pos[5] = 0;
    pos[2] = 1;
    pos[9] = 2;
    expect([zombieAlive(ids, pos, 3, 5), zombieAlive(ids, pos, 3, 9), zombieAlive(ids, pos, 2, 9), zombieAlive(ids, pos, 3, 4)]).toEqual([true, true, false, false]);
    pos[7] = 1; // stale position pointing at another zombie
    expect(zombieAlive(ids, pos, 3, 7)).toBe(false);
  });
});
