import { describe, expect, it } from "vitest";
import { BURST_DROP, BURST_DROPS, BURST_PUFFS, BURST_SCRAPS, BURST_SPLAT, BloaterFx } from "./bloaterFx";

const fx = () => new BloaterFx(24, 240, 2.5, 4);
const burstOf = (x: number, y: number, ageS?: number) => ({ type: "bloater.burst" as const, x, y, chain: false, ...(ageS !== undefined ? { ageS } : {}) });

describe("Story 5.8 BloaterFx (AC 8d: pooled clouds at the exact radius, gasS long)", () => {
  it("a burst makes one cloud at the event's point that lives exactly gasS and fades over its last second", () => {
    const f = fx();
    expect(f.handle(burstOf(10, 12), 100)).toBe(true);
    expect(f.cloudCount).toBe(1);
    expect(f.particleCount).toBe(BURST_DROPS + BURST_SCRAPS + BURST_PUFFS);
    expect(f.cloudAlpha(0, 100.5)).toBe(1);
    expect(f.cloudAlpha(0, 103.5)).toBeCloseTo(0.5, 9);
    expect(f.inCloud(10 + 2.5 + 0.4 - 0.01, 12, 0.4, 101)).toBe(true);
    expect(f.inCloud(10 + 2.5 + 0.4 + 0.01, 12, 0.4, 101)).toBe(false);
    for (let t = 100; t < 104.2; t += 1 / 60) f.update(t);
    expect(f.cloudCount).toBe(0);
    expect(f.particleCount).toBe(0); // the cloud's particles end with it
  });

  it("drops fly, land and stay as splats; nothing allocates past the caps (a chain of 40 bursts)", () => {
    const f = fx();
    f.handle(burstOf(10, 10), 0);
    for (let t = 0; t < 1.5; t += 1 / 60) f.update(t);
    let splats = 0;
    let drops = 0;
    for (let i = 0; i < f.maxParticles; i++) {
      if (f.on[i] !== 1) continue;
      if (f.kind[i] === BURST_SPLAT) splats++;
      if (f.kind[i] === BURST_DROP) drops++;
    }
    expect(splats).toBe(BURST_DROPS);
    expect(drops).toBe(0);
    for (let k = 0; k < 40; k++) f.handle(burstOf(5 + k, 5), 2 + k * 0.05);
    expect(f.cloudCount).toBe(24); // the oldest clouds were replaced
    expect(f.particleCount).toBeLessThanOrEqual(240);
  });

  it("a build start clears everything; a woken tab's burst older than gasS draws nothing, a younger one starts back-dated", () => {
    const f = fx();
    f.handle(burstOf(1, 1), 0);
    f.handle({ type: "build.started", wave: 2 }, 0.1);
    expect(f.cloudCount).toBe(0);
    expect(f.particleCount).toBe(0);
    expect(f.handle(burstOf(1, 1, 4.2), 10)).toBe(false);
    expect(f.cloudCount).toBe(0);
    f.handle(burstOf(1, 1, 3.5), 10);
    expect(f.cloudAlpha(0, 10)).toBeCloseTo(0.5, 9);
  });
});
