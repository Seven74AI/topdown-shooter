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
    expect(c.offsetMs).toBe(10_030); // the zero-jitter packet
    // Right when tick 40 leaves the server, the estimate is 40 minus the 30 ms base delay.
    expect(c.estimateTick(10_000 + 40 * 50)).toBeCloseTo(40 - 30 / 50, 9);
  });

  it("forgets samples older than 2 s", () => {
    const c = new ServerClock();
    c.sample(1000, 0); // offset 1000 (an unusually fast packet)
    c.sample(1100, 0); // offset 1100
    expect(c.offsetMs).toBe(1000);
    c.sample(1000 + CLOCK_WINDOW_MS + 1, 40); // offset 1001; the 1000 sample is now too old
    c.sample(1000 + CLOCK_WINDOW_MS + 60, 41); // offset 1010
    expect(c.offsetMs).toBe(1001);
    c.sample(1000 + 2 * CLOCK_WINDOW_MS + 100, 80); // everything before is out of the window
    expect(c.offsetMs).toBe(5100 - 4000);
  });
});
