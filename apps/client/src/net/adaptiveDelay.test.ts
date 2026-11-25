import { describe, expect, it } from "vitest";
import { createRng } from "@topdown/shared";
import { AdaptiveDelay } from "./adaptiveDelay";
import {
  DELAY_FALL_AFTER_MS,
  DELAY_MARGIN_MS,
  PLAYBACK_RATE_MAX,
  PLAYBACK_RATE_MIN,
  RENDER_DELAY_MAX_MS,
  RENDER_DELAY_MIN_MS,
} from "./netConfig";
import { ServerClock } from "./serverClock";

const FRAME_MS = 1000 / 60;
const EPS = 1e-9;

/**
 * A fake line (Story 8.9): server tick t leaves at `t × 50` (client clock), arrives `lateMs(t)`
 * later, in order (TCP: a stalled packet holds the ones behind it). 60 Hz frames run the real
 * ServerClock + AdaptiveDelay as NetSimHost does. Returns per-frame observations.
 */
function run(
  seconds: number,
  lateMs: (tick: number) => number,
  onFrame?: (o: { nowMs: number; renderTick: number; estimate: number; rate: number; newest: number; d: AdaptiveDelay }) => void,
  d = new AdaptiveDelay(),
  clock = new ServerClock(),
): { d: AdaptiveDelay; clock: ServerClock } {
  let tick = 0;
  let nextDue = lateMs(1) + 50;
  let newest = -1;
  for (let nowMs = 0; nowMs < seconds * 1000; nowMs += FRAME_MS) {
    while (nextDue <= nowMs) {
      tick++;
      clock.sample(nextDue, tick);
      d.sample(nextDue, tick, clock.rawOffsetMs);
      newest = tick;
      nextDue = Math.max(nextDue, (tick + 1) * 50 + lateMs(tick + 1));
    }
    if (!clock.ready) continue;
    const estimate = clock.estimateTick(nowMs);
    const renderTick = d.advance(nowMs, estimate, newest);
    onFrame?.({ nowMs, renderTick, estimate, rate: d.rate, newest, d });
  }
  return { d, clock };
}

describe("AdaptiveDelay (Story 8.9: delay from lateness, a render clock that stretches)", () => {
  it("a clean line (± 10 ms) stays at 100 ms and plays at 1×", () => {
    const rng = createRng(1);
    let freezes = 0;
    let minRate = Infinity;
    let maxRate = 0;
    const { d } = run(20, () => 10 + rng.range(-10, 10), (o) => {
      if (o.nowMs > 2000) {
        minRate = Math.min(minRate, o.rate);
        maxRate = Math.max(maxRate, o.rate);
      }
      if (o.renderTick > o.newest) freezes++;
    });
    expect(d.targetMs).toBe(RENDER_DELAY_MIN_MS);
    expect(Math.abs(d.delayMs - RENDER_DELAY_MIN_MS)).toBeLessThan(5);
    expect(freezes).toBe(0);
    console.info(`[adaptiveDelay] clean line rate ${minRate.toFixed(3)}–${maxRate.toFixed(3)}`);
    expect(minRate).toBeGreaterThanOrEqual(0.97);
    expect(maxRate).toBeLessThanOrEqual(1.03);
  });

  it("a 300 ms stall: the delay target rises at once, the clock plays at 0.9× until it is reached, then 1×", () => {
    const rates: number[] = [];
    const { d } = run(7, (t) => (t >= 60 && t <= 65 ? Math.max(0, 300 - (t - 60) * 50) : 0), (o) => {
      if (o.nowMs > 3000) rates.push(o.rate);
    });
    expect(rates.some((r) => r === PLAYBACK_RATE_MIN)).toBe(true); // slowed
    expect(rates.every((r) => r >= PLAYBACK_RATE_MIN - EPS && r <= PLAYBACK_RATE_MAX + EPS)).toBe(true);
    expect(rates.at(-1)).toBeCloseTo(1, 3); // settled
    expect(d.targetMs).toBe(RENDER_DELAY_MAX_MS); // 300 + one tick, capped at 250
    expect(d.delayMs).toBeCloseTo(RENDER_DELAY_MAX_MS, 0);
  });

  it("falls only after 5 s without a late sample, at ≤ 1.1×", () => {
    let at = Number.NaN;
    let lastTarget = 0;
    let fellAt = Number.NaN;
    const rates: number[] = [];
    run(14, (t) => (t === 40 ? 200 : 0), (o) => {
      if (Number.isNaN(at) && o.d.targetMs > RENDER_DELAY_MIN_MS) at = o.nowMs;
      if (Number.isNaN(fellAt) && lastTarget > RENDER_DELAY_MIN_MS && o.d.targetMs < lastTarget) fellAt = o.nowMs;
      lastTarget = o.d.targetMs;
      rates.push(o.rate);
    });
    expect(at).toBeGreaterThan(2000);
    expect(fellAt - at).toBeGreaterThanOrEqual(DELAY_FALL_AFTER_MS - 2 * FRAME_MS);
    expect(Math.max(...rates)).toBeLessThanOrEqual(PLAYBACK_RATE_MAX + EPS);
    expect(lastTarget).toBeLessThan(RENDER_DELAY_MAX_MS - 25); // it really eased down, ~5 ms/s (mutation: never fell)
  });

  it("the target covers the p95 lateness plus one tick (a 10 s histogram)", () => {
    const { d } = run(12, (t) => (t % 10 === 0 ? 60 : 0)); // 10 % of samples 60 ms late
    expect(d.lateP95Ms).toBeGreaterThanOrEqual(60);
    expect(d.lateP95Ms).toBeLessThanOrEqual(65);
    expect(d.targetMs).toBeCloseTo(d.lateP95Ms + DELAY_MARGIN_MS, 6);
  });

  it("on the lossy line (200 ms stalls) the delay sits near 250 ms and the picture rarely runs past the newest frame", () => {
    const rng = createRng(4);
    let stall = 0;
    let stalls = 0;
    let freezes = 0;
    let frozen = false;
    run(60, () => {
      if (rng.range(0, 100) < 1) {
        stall = 200;
        stalls++;
      }
      const l = stall + 10 + rng.range(-10, 10);
      stall = 0;
      return l;
    }, (o) => {
      const f = o.renderTick > o.newest;
      if (f && !frozen && o.nowMs > 5000) freezes++;
      frozen = f;
    });
    // ~12 stalls in 55 s; before Story 8.9 every one froze. The rest: stalls after > 5 s of calm.
    expect(stalls).toBeGreaterThan(5); // liveness
    expect(freezes).toBeLessThanOrEqual(3);
  });

  it("property: the render tick never decreases and the rate stays in [0.9, 1.1] (stalls, bursts, latency steps, a hidden tab)", () => {
    for (const seed of [1, 2, 3]) {
      const rng = createRng(seed);
      let base = 30;
      let stall = 0;
      let prev = -Infinity;
      let prevEstimate = -Infinity;
      let frames = 0;
      let slept = false;
      const d = new AdaptiveDelay();
      const clock = new ServerClock();
      let tick = 0;
      let nextDue = 50 + base;
      for (let nowMs = 0; frames < 10_000; nowMs += FRAME_MS) {
        // A hidden tab: the frame clock pauses 5 s once (packets keep arriving, read late).
        if (!slept && frames === 5000) {
          nowMs += 5000;
          slept = true;
        }
        while (nextDue <= nowMs) {
          tick++;
          clock.sample(nextDue, tick);
          d.sample(nextDue, tick, clock.rawOffsetMs);
          if (rng.range(0, 100) < 3) stall = rng.range(0, 600);
          if (rng.range(0, 1000) < 2) base = Math.max(0, base + rng.range(-200, 200)); // a lasting latency step (cell handover)
          nextDue = Math.max(nextDue, (tick + 1) * 50 + base + stall + rng.range(-10, 10));
          stall = 0;
        }
        if (!clock.ready) continue;
        const estimate = clock.estimateTick(nowMs);
        const rt = d.advance(nowMs, estimate, tick);
        frames++;
        expect(estimate).toBeGreaterThanOrEqual(prevEstimate);
        expect(rt).toBeGreaterThanOrEqual(prev);
        expect(d.rate).toBeGreaterThanOrEqual(PLAYBACK_RATE_MIN - EPS);
        expect(d.rate).toBeLessThanOrEqual(PLAYBACK_RATE_MAX + EPS);
        expect(d.targetMs).toBeGreaterThanOrEqual(RENDER_DELAY_MIN_MS);
        expect(d.targetMs).toBeLessThanOrEqual(RENDER_DELAY_MAX_MS);
        // Outside a wake, one frame advances at most 1.1 × the frame (no fast-forward, no teleport).
        if (prev > -Infinity && nowMs - FRAME_MS > 0 && rt - prev > 0 && !(slept && frames === 5001)) {
          expect(rt - prev).toBeLessThanOrEqual((FRAME_MS / 50) * PLAYBACK_RATE_MAX + EPS);
        }
        prev = rt;
        prevEstimate = estimate;
      }
      expect(tick).toBeGreaterThan(400); // the line really delivered
    }
  });

  it("R3 fine sweep: 1 ms frames (state kept), a 300 ms stall then a +200 ms lasting step: monotonic, ≤ 1.1× per frame, rate in [0.9, 1.1]", () => {
    const d = new AdaptiveDelay();
    const clock = new ServerClock();
    let tick = 0;
    let nextDue = 80;
    let prev = -Infinity;
    let maxStep = 0;
    for (let nowMs = 0; nowMs < 20_000; nowMs += 1) {
      while (nextDue <= nowMs) {
        tick++;
        clock.sample(nextDue, tick);
        d.sample(nextDue, tick, clock.rawOffsetMs);
        const t = tick + 1;
        const late = (t === 100 ? 300 : 0) + (t * 50 >= 10_000 ? 200 : 0);
        nextDue = Math.max(nextDue, t * 50 + 30 + late);
      }
      if (!clock.ready) continue;
      const rt = d.advance(nowMs, clock.estimateTick(nowMs), tick);
      if (prev > -Infinity) maxStep = Math.max(maxStep, rt - prev);
      expect(rt).toBeGreaterThanOrEqual(prev);
      expect(d.rate).toBeGreaterThanOrEqual(0.9 - EPS);
      expect(d.rate).toBeLessThanOrEqual(1.1 + EPS);
      prev = rt;
    }
    expect(maxStep).toBeLessThanOrEqual((1 / 50) * 1.1 + EPS); // 1 ms of frame → at most 1.1 ms of render time
    expect(d.targetMs).toBe(RENDER_DELAY_MAX_MS); // the step's late frames were measured
  });

  it("after a hidden tab the render clock re-anchors once (forward), it does not play seconds at 1.1×", () => {
    const d = new AdaptiveDelay();
    d.advance(0, 10);
    expect(d.renderTick).toBe(10 - RENDER_DELAY_MIN_MS / 50);
    d.advance(FRAME_MS, 10 + FRAME_MS / 50);
    const before = d.renderTick;
    d.advance(5000, 100); // the tab slept 5 s
    expect(d.renderTick).toBe(100 - RENDER_DELAY_MIN_MS / 50);
    expect(d.renderTick).toBeGreaterThan(before);
    expect(d.delayMs).toBeCloseTo(RENDER_DELAY_MIN_MS, 9);
  });

  it("a woken tab never moves the render clock backwards (the estimate fell behind it)", () => {
    const d = new AdaptiveDelay();
    d.advance(0, 100);
    const rt = d.renderTick;
    d.advance(5000, 90);
    expect(d.renderTick).toBe(rt);
  });

  it("lateness samples that waited out a paused frame clock are skipped", () => {
    const d = new AdaptiveDelay();
    d.advance(0, 0);
    d.sample(10, 0, 0);
    d.sample(5000, 1, 0); // read 5 s late because the frame clock was paused
    expect(d.samples).toBe(1);
    expect(d.targetMs).toBe(RENDER_DELAY_MIN_MS);
  });

  it("no sample, no estimate: NaN, nothing moves", () => {
    const d = new AdaptiveDelay();
    expect(Number.isNaN(d.advance(0, Number.NaN))).toBe(true);
    d.sample(0, 0, Number.NaN);
    expect(d.samples).toBe(0);
  });
});
