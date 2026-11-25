import { describe, expect, it } from "vitest";
import { CLOCK_WINDOW_MS, ServerClock } from "./serverClock";

describe("ServerClock", () => {
  it("is not ready before a sample", () => {
    const c = new ServerClock();
    expect(c.ready).toBe(false);
    expect(Number.isNaN(c.estimateTick(1000))).toBe(true);
  });

  it("uses the least-delayed arrival in the window with jittered packets", () => {
    const c = new ServerClock();
    // Server tick t is sent at t × 50 ms (server clock) = 10_000 + t × 50 on the client clock;
    // packets take 30 ms plus 0–60 ms of jitter.
    const jitter = [40, 5, 60, 0, 22, 35, 59, 12, 3, 47];
    for (let t = 0; t < 40; t++) c.sample(10_000 + t * 50 + 30 + (jitter[t % jitter.length] as number), t);
    expect(c.rawOffsetMs).toBe(10_030); // the zero-jitter packet
    // Right when tick 40 leaves the server, the estimate is 40 minus the 30 ms base delay.
    expect(c.estimateTick(10_000 + 40 * 50)).toBeCloseTo(40 - 30 / 50, 9);
  });

  it("forgets samples older than 2 s", () => {
    const c = new ServerClock();
    c.sample(1000, 0); // offset 1000 (an unusually fast packet)
    c.sample(1100, 0); // offset 1100
    expect(c.rawOffsetMs).toBe(1000);
    c.sample(1000 + CLOCK_WINDOW_MS + 1, 40); // offset 1001; the 1000 sample is now too old
    c.sample(1000 + CLOCK_WINDOW_MS + 60, 41); // offset 1010
    expect(c.rawOffsetMs).toBe(1001);
    c.sample(1000 + 2 * CLOCK_WINDOW_MS + 100, 80); // everything before is out of the window
    expect(c.rawOffsetMs).toBe(5100 - 4000);
  });

  it("Story 8.9: the first estimate snaps to the measurement (no slew from NaN)", () => {
    const c = new ServerClock();
    c.sample(10_000 + 40 * 50 + 30, 40);
    expect(c.estimateTick(10_000 + 40 * 50 + 30)).toBeCloseTo(40, 9);
  });

  /** 20 Hz samples with a one-way delay `latency(tick)`; frames at 60 Hz call `estimateTick`. */
  function drive(c: ServerClock, fromMs: number, toMs: number, latency: (tick: number) => number, onFrame: (now: number, est: number) => void): void {
    let tick = Math.ceil(fromMs / 50);
    for (let now = fromMs; now < toMs; now += 1000 / 60) {
      while (tick * 50 + latency(tick) <= now) {
        c.sample(tick * 50 + latency(tick), tick);
        tick++;
      }
      if (c.ready) onFrame(now, c.estimateTick(now));
    }
  }

  it("Story 8.9 (F2, audit F5): a lasting +150 ms latency rise never moves the estimate back; it converges within ~2 s at ≥ 0.9×", () => {
    const c = new ServerClock();
    let prev = -Infinity;
    let minRate = Infinity;
    let lastNow = Number.NaN;
    let convergedAt = Number.NaN;
    drive(c, 0, 12_000, (t) => (t * 50 < 4000 ? 30 : 180), (now, est) => {
      expect(est).toBeGreaterThanOrEqual(prev);
      if (!Number.isNaN(lastNow) && now > 1000) minRate = Math.min(minRate, ((est - prev) * 50) / (now - lastNow));
      if (now > 6000 && Number.isNaN(convergedAt) && Math.abs(est - c.rawTick(now)) < 0.05) convergedAt = now;
      prev = est;
      lastNow = now;
    });
    expect(minRate).toBeGreaterThanOrEqual(0.9 - 1e-9);
    expect(minRate).toBeLessThan(0.95); // it really slowed
    // The old minimum leaves the 2 s window at ~6 s; 150 ms at 10 % of real time takes 1.5 s more.
    expect(convergedAt).toBeLessThan(6000 + 2000);
  });

  it("Story 8.9: a latency fall converges at ≤ 1.1×", () => {
    const c = new ServerClock();
    let prev = Number.NaN;
    let lastNow = Number.NaN;
    let maxRate = 0;
    drive(c, 0, 8000, (t) => (t * 50 < 3000 ? 180 : 30), (now, est) => {
      if (!Number.isNaN(prev)) maxRate = Math.max(maxRate, ((est - prev) * 50) / (now - lastNow));
      prev = est;
      lastNow = now;
    });
    expect(maxRate).toBeLessThanOrEqual(1.1 + 1e-9);
    expect(maxRate).toBeGreaterThan(1.05);
    expect(Math.abs(prev - c.rawTick(lastNow))).toBeLessThan(0.05);
  });

  it("Story 8.9: after a hidden-tab gap the estimate snaps forward, never back", () => {
    const c = new ServerClock();
    c.sample(1000, 0);
    const a = c.estimateTick(1000);
    c.sample(7000, 120); // 6 s later, same latency
    const b = c.estimateTick(7000);
    expect(b).toBeCloseTo(120, 9);
    expect(b).toBeGreaterThan(a);
    // A later sample says latency fell 100 ms: the raw clock jumps ahead by 2 ticks; within 1 s it is slewed, not snapped.
    c.sample(7010, 122.2);
    const e = c.estimateTick(7010);
    expect(e).toBeLessThan(c.rawTick(7010));
    expect(e).toBeGreaterThanOrEqual(b);
  });
});
