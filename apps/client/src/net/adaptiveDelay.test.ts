import { describe, expect, it } from "vitest";
import { createRng } from "@topdown/shared";
import { AdaptiveDelay } from "./adaptiveDelay";
import { RENDER_DELAY_MAX_MS, RENDER_DELAY_MIN_MS, RENDER_DELAY_SLEW_MS_PER_S } from "./netConfig";

/** Feeds `seconds` of 20 Hz snapshots whose arrival is offset by uniform(−j, j) ms, three 60 Hz frames per snapshot. */
function feed(d: AdaptiveDelay, seconds: number, jitterHalfMs: number, seed = 1, startTick = 0): number {
  const rng = createRng(seed);
  let tick = startTick;
  for (let i = 0; i < seconds * 20; i++) {
    tick++;
    d.snapshot(1000 + tick * 50 + rng.range(-jitterHalfMs, jitterHalfMs), tick);
    for (let f = 0; f < 3; f++) d.frame(1 / 60);
  }
  return tick;
}

describe("AdaptiveDelay", () => {
  it("stays at 100 ms without jitter", () => {
    const d = new AdaptiveDelay();
    feed(d, 10, 0);
    expect(d.jitterMs).toBe(0);
    expect(d.delayMs).toBe(RENDER_DELAY_MIN_MS);
    expect(d.renderTick(100)).toBe(98);
  });

  it("20 ms of jitter gives about 140 ms (target 100 + 2 × jitter)", () => {
    const d = new AdaptiveDelay();
    d.jitterMs = 20;
    expect(d.targetMs).toBe(140);
    d.jitterMs = 200;
    expect(d.targetMs).toBe(RENDER_DELAY_MAX_MS);
  });

  it("measured jitter raises the delay, slewed at most 20 ms per second", () => {
    const d = new AdaptiveDelay();
    let prev = d.delayMs;
    const rng = createRng(3);
    for (let tick = 1; tick <= 400; tick++) {
      d.snapshot(tick * 50 + rng.range(-25, 25), tick);
      for (let f = 0; f < 3; f++) {
        d.frame(1 / 60);
        expect(Math.abs(d.delayMs - prev)).toBeLessThanOrEqual((RENDER_DELAY_SLEW_MS_PER_S / 60) * (1 + 1e-9));
        prev = d.delayMs;
      }
    }
    expect(d.jitterMs).toBeGreaterThan(10);
    expect(d.delayMs).toBeGreaterThan(120);
    expect(d.delayMs).toBeLessThanOrEqual(RENDER_DELAY_MAX_MS);
  });

  it("comes back down when the jitter goes away", () => {
    const d = new AdaptiveDelay();
    const t = feed(d, 20, 40);
    expect(d.delayMs).toBeGreaterThan(130);
    feed(d, 30, 0, 1, t);
    expect(d.delayMs).toBeLessThan(105);
  });

  it("a hidden tab's long gap counts as at most 100 ms of jitter", () => {
    const d = new AdaptiveDelay();
    d.snapshot(1000, 1);
    d.snapshot(6000, 2);
    expect(d.jitterMs).toBeLessThanOrEqual(10 + 1e-9);
  });

  it("skipped ticks in a patch are not jitter", () => {
    const d = new AdaptiveDelay();
    d.snapshot(1000, 10);
    d.snapshot(1100, 12);
    d.snapshot(1100, 12); // repeated tick: ignored
    expect(d.jitterMs).toBe(0);
  });
});
