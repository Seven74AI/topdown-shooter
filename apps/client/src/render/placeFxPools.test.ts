import { describe, expect, it } from "vitest";
import { loadBalance } from "@topdown/shared";
import { DustPool, TabPool } from "./placeFxPools";
import { DROP_FROM_M, DUST_ALPHA, DUST_LIFE_S, DUST_PER_PUFF, TAB_LIFE_MS } from "./placeFeel";

const fx = loadBalance().controls.fx;

describe("Story 5.23: the dust pool (AC 2, 5; brief 12)", () => {
  it("a puff is 8 particles on the footprint's edge flying outward; gone after 0.4 s", () => {
    const d = new DustPool(fx.maxPlaceDust);
    expect(d.cap).toBe(64);
    d.puff(10, 10, 12, 10.5, 7);
    expect(d.live).toBe(DUST_PER_PUFF);
    for (let i = 0; i < DUST_PER_PUFF; i++) {
      const x = d.x[i] as number;
      const y = d.y[i] as number;
      const onEdge = Math.abs(x - 10) < 1e-4 || Math.abs(x - 12) < 1e-4 || Math.abs(y - 10) < 1e-4 || Math.abs(y - 10.5) < 1e-4;
      expect(onEdge).toBe(true);
      expect(d.alpha(i)).toBeCloseTo(DUST_ALPHA, 6);
    }
    const x0 = Array.from(d.x.slice(0, DUST_PER_PUFF));
    d.step(0.1);
    // outward: every particle moved away from the centre (11, 10.25)
    for (let i = 0; i < DUST_PER_PUFF; i++) {
      const before = Math.hypot((x0[i] as number) - 11, 0);
      expect(Math.hypot((d.x[i] as number) - 11, (d.y[i] as number) - 10.25)).toBeGreaterThan(Math.min(before, 0.25));
    }
    expect(d.step(DUST_LIFE_S)).toBe(0);
    expect(d.live).toBe(0);
  });

  it("capped: a 9th puff reuses the oldest (never more than the cap alive)", () => {
    const d = new DustPool(fx.maxPlaceDust);
    for (let k = 0; k < 9; k++) d.puff(k, 0, k + 1, 1, k);
    expect(d.live).toBe(64);
    expect(d.x[0]).toBeGreaterThanOrEqual(8); // slot 0 now belongs to the 9th puff (x in [8, 9])
    expect(d.step(0.01)).toBe(64);
  });
});

describe("Story 5.23: owner tabs and drops (AC 2, 4)", () => {
  it("a tab lasts 3 s from the placement (a stale one only for what is left); a stale one doesn't drop", () => {
    const t = new TabPool(fx.maxOwnerTabs);
    t.add(5, 1, 2, 0xff0000, 1000, 0, true);
    t.add(6, 3, 4, 0x00ff00, 1000, 2500, false); // 2.5 s old
    t.add(7, 3, 4, 0x00ff00, 1000, TAB_LIFE_MS, false); // too old: no tab
    expect(t.prune(1000)).toBe(2);
    expect(t.dropOf(5, 1000)).toBeCloseTo(DROP_FROM_M, 9);
    expect(t.dropOf(6, 1000)).toBe(0);
    expect(t.dropping(1000)).toBe(true);
    expect(t.dropping(1200)).toBe(false);
    expect(t.prune(1600)).toBe(1); // 6 gone after its last 0.5 s
    expect(t.prune(4000)).toBe(0);
    expect(t.indexOf(5)).toBe(-1);
  });

  it("capped: the 13th reuses the oldest; the same id refreshes in place; clear (a wave) hides all", () => {
    const t = new TabPool(fx.maxOwnerTabs);
    for (let i = 0; i < 13; i++) t.add(100 + i, 0, 0, 1, 0, 0, true);
    expect(t.indexOf(100)).toBe(-1);
    expect(t.indexOf(112)).toBe(0);
    t.add(112, 5, 5, 2, 50, 0, true);
    expect(t.prune(50)).toBe(12);
    expect(t.minX[0]).toBe(5);
    t.clear();
    expect(t.prune(60)).toBe(0);
  });

  it("a placement already older than 3 s (a woken tab) takes no slot: a full pool keeps every live tab", () => {
    const t = new TabPool(fx.maxOwnerTabs);
    for (let i = 0; i < t.cap; i++) t.add(200 + i, 0, 0, 1, 0, 0, true);
    t.add(999, 0, 0, 1, 0, TAB_LIFE_MS + 500, false);
    expect([t.indexOf(200), t.indexOf(999), t.prune(0)]).toEqual([0, -1, t.cap]);
  });
});

describe("Story 5.23 (review L3): a removed building drops its tab", () => {
  it("dropped once seen and gone; a tab whose building hasn't arrived yet (online) stays", () => {
    const t = new TabPool(fx.maxOwnerTabs);
    t.add(1, 0, 0, 1, 0, 0, true);
    t.add(2, 0, 0, 1, 0, 0, true);
    const world = new Set([1]);
    t.dropMissing((id) => world.has(id));
    expect([t.indexOf(1), t.indexOf(2) >= 0]).toEqual([0, true]); // 2 not seen yet: kept
    world.add(2);
    t.dropMissing((id) => world.has(id));
    world.delete(1); // sold / destroyed
    t.dropMissing((id) => world.has(id));
    expect([t.indexOf(1), t.indexOf(2) >= 0]).toEqual([-1, true]);
  });
});
