import { describe, expect, it } from "vitest";
import { FRAME_RING, PerfStats, PerfSummary, bottleneckOf, countInView, createPerfSnapshot } from "./perfStats";

describe("PerfStats rolling window", () => {
  it("averages FPS over the last second and reports the slowest frame as the 1-s minimum", () => {
    const s = new PerfStats();
    let t = 0;
    for (let i = 0; i < 120; i++) s.recordFrame((t += 16), 16, 4, 2);
    s.recordFrame((t += 40), 40, 5, 2); // one 25-FPS hitch
    const snap = s.snapshot(t, createPerfSnapshot());
    expect(snap.fps).toBeGreaterThan(55);
    expect(snap.fps).toBeLessThan(62);
    expect(snap.minFps).toBeCloseTo(25, 5);
    expect(snap.renderAvgMs).toBeGreaterThan(4);
  });

  it("forgets frames older than the window", () => {
    const s = new PerfStats();
    s.recordFrame(100, 100, 1, 1); // a 10-FPS frame long ago
    let t = 2000;
    for (let i = 0; i < 60; i++) s.recordFrame((t += 16.5), 16.5, 1, 1);
    expect(s.snapshot(t, createPerfSnapshot()).minFps).toBeCloseTo(1000 / 16.5, 3);
  });

  it("wraps its ring buffer without losing the newest frames", () => {
    const s = new PerfStats();
    let t = 0;
    for (let i = 0; i < FRAME_RING * 3; i++) s.recordFrame((t += 2), 2, 0, 0);
    // 1 s at 500 FPS is more frames than the ring holds: the window is the ring.
    expect(s.snapshot(t, createPerfSnapshot()).fps).toBeCloseTo(500, 5);
  });

  it("averages and maxes simulation steps in the window", () => {
    const s = new PerfStats();
    s.recordTick(0, 9); // outside the window at t = 1500
    s.recordTick(1000, 1);
    s.recordTick(1050, 3);
    s.recordTick(1100, 2);
    const snap = s.snapshot(1500, createPerfSnapshot());
    expect(snap.tickAvgMs).toBeCloseTo(2, 5);
    expect(snap.tickMaxMs).toBeCloseTo(3, 5);
  });

  it("feeds an active whole-run summary", () => {
    const s = new PerfStats();
    s.summary = new PerfSummary();
    s.recordFrame(16, 16, 3, 1);
    s.recordTick(16, 2);
    expect(s.summary.result().frames).toBe(1);
    expect(s.summary.result().tickAvgMs).toBe(2);
  });
});

describe("PerfSummary", () => {
  it("computes avg, min, % under 30 FPS, worst second and the target verdict", () => {
    const sum = new PerfSummary();
    let t = 0;
    for (let i = 0; i < 600; i++) sum.addFrame((t += 1000 / 60), 1000 / 60, 5, 2); // 10 s at 60
    for (let i = 0; i < 6; i++) sum.addFrame((t += 50), 50, 5, 2); // 0.3 s at 20 FPS
    sum.addTick(1);
    sum.addTick(3);
    const r = sum.result();
    expect(r.frames).toBe(606);
    expect(r.minFps).toBeCloseTo(20, 5);
    expect(r.pctUnder30).toBeCloseTo((6 / 606) * 100, 5);
    expect(r.worstSecondFps).toBeGreaterThanOrEqual(59); // float frame times straddle second boundaries
    expect(r.tickAvgMs).toBe(2);
    expect(r.tickMaxMs).toBe(3);
    expect(r.renderAvgMs).toBe(5);
    expect(r.durationS).toBeCloseTo(10.3, 3);
    expect(r.targetMet).toBe(false); // dipped below 30
    expect(r.bottleneck).toBe("rendering/GPU");
  });

  it("meets the target at a steady 60 FPS", () => {
    const sum = new PerfSummary();
    let t = 0;
    for (let i = 0; i < 300; i++) sum.addFrame((t += 16.7), 16.7, 3, 1);
    expect(sum.result().targetMet).toBe(true);
    expect(sum.result().pctUnder30).toBe(0);
  });

  it("finds a slow second", () => {
    const sum = new PerfSummary();
    let t = 0;
    for (let i = 0; i < 120; i++) sum.addFrame((t += 1000 / 60), 1000 / 60, 0, 0);
    for (let i = 0; i < 40; i++) sum.addFrame((t += 25), 25, 0, 0); // one second at 40 FPS
    for (let i = 0; i < 61; i++) sum.addFrame((t += 1000 / 60), 1000 / 60, 0, 0);
    expect(sum.result().worstSecondFps).toBeLessThanOrEqual(41);
    expect(sum.result().worstSecondFps).toBeGreaterThanOrEqual(39);
  });
});

describe("bottleneckOf", () => {
  it("labels an average step above 8 ms as the simulation", () => {
    expect(bottleneckOf(8.5)).toBe("simulation");
    expect(bottleneckOf(8)).toBe("rendering/GPU");
    expect(bottleneckOf(12, true)).toBe("none"); // target met: nothing to blame
  });
});

describe("countInView", () => {
  it("counts alive zombies inside the rectangle, edges included", () => {
    const xs = new Float32Array([0, 5, 10, 15, 20]);
    const ys = new Float32Array([0, 5, 5, 5, 5]);
    const alive = new Int32Array([1, 2, 3, 4, 0]);
    expect(countInView(xs, ys, alive, 4, 5, 0, 10, 10)).toBe(3); // ids 1, 2, 3 (x 5..15)
    expect(countInView(xs, ys, alive, 5, -1, -1, 2, 2)).toBe(1); // id 0
  });
});

describe("PerfSummary target rule", () => {
  it("counts a long visible freeze (e.g. a 1.2 s GC pause) against the target", () => {
    const sum = new PerfSummary();
    let t = 0;
    for (let i = 0; i < 180; i++) sum.addFrame((t += 16.67), 16.67, 1, 1);
    sum.addFrame((t += 1200), 1200, 1, 1);
    for (let i = 0; i < 180; i++) sum.addFrame((t += 16.67), 16.67, 1, 1);
    const r = sum.result();
    expect(r.minFps).toBeLessThan(1);
    expect(r.worstSecondFps).toBeLessThan(30);
    expect(r.targetMet).toBe(false);
    expect(r.bottleneck).not.toBe("none");
  });
});
