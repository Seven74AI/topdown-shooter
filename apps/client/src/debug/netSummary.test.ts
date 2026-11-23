import { afterEach, describe, expect, it } from "vitest";
import { NetWaveSummary, formatNetReport, percentile95, type NetMeterLike, type NetSummaryEnv } from "./netSummary";
import { perf, type NetOverlaySource } from "./perfStats";

const env: NetSummaryEnv = { userAgent: "UA-test", viewport: "915×412", dpr: 2, throttle: "?lag=150&jitter=20", connection: "4g" };

function source() {
  return {
    netStats: { rttMs: 0, delayMs: 100, jitterMs: 10, corrections: 0, snaps: 0, apparentHits: 0, confirmed: 0, reversed: 0 },
    hordeStats: { framesReceived: 0 },
    scenario: "net150",
    isHost: true,
    runSeed: 7,
  } satisfies NetOverlaySource;
}

const meter = (): NetMeterLike & { marks: number[] } => {
  const marks: number[] = [];
  return {
    marks,
    markWave: (t) => void marks.push(t),
    avgDownKBps: () => 20.84,
    peakDownKBps: () => 26.1,
    avgUpKBps: () => 2.3,
  };
};

afterEach(() => perf.reset());

describe("percentile95", () => {
  it("is the nearest-rank 95th percentile", () => {
    const v = new Float64Array(100);
    for (let i = 0; i < 100; i++) v[i] = 100 - i; // 100 … 1, unsorted
    expect(percentile95(v, 100)).toBe(95);
    expect(percentile95(v, 0)).toBe(0);
    expect(percentile95(Float64Array.of(42), 1)).toBe(42);
  });
});

describe("NetWaveSummary (Story 2.10)", () => {
  it("measures one wave: FPS, bandwidth, ping avg/p95 and the counters' growth", () => {
    const s = new NetWaveSummary(() => env);
    const src = source();
    const m = meter();
    src.netStats.apparentHits = 10; // before the wave: not counted
    src.netStats.reversed = 1;
    s.start(1000, 4, src, m);
    expect(m.marks).toEqual([1000]);
    expect(perf.summary).not.toBeNull();
    for (let t = 1000; t <= 61_000; t += 16) {
      perf.recordFrame(t, 16, 4, 3);
      src.netStats.rttMs = t < 31_000 ? 100 : 200;
      s.frame(t, src);
    }
    src.netStats.apparentHits = 210;
    src.netStats.confirmed = 195;
    src.netStats.reversed = 5;
    src.netStats.snaps = 1;
    let shown = "";
    s.subscribe((r) => (shown = r));
    const r = s.end(61_000, 4, src, m, true);
    expect(r).not.toBeNull();
    expect(r?.durationS).toBe(60);
    expect(r?.avgFps).toBeCloseTo(62.5, 0);
    expect(r?.avgPingMs).toBeGreaterThan(140);
    expect(r?.avgPingMs).toBeLessThan(160);
    expect(r?.p95PingMs).toBe(200);
    expect(r?.apparentHits).toBe(200);
    expect(r?.reversed).toBe(4);
    expect(r?.reversedPct).toBeCloseTo(2);
    expect(r?.snaps).toBe(1);
    expect(perf.summary).toBeNull();
    expect(shown).toContain("Network results: wave 4 (TEST SCENARIO net150), 60.0 s");
    expect(shown).toContain("down avg 20.8 KB/s · peak 26.1 KB/s · up avg 2.3 KB/s");
    expect(shown).toContain("hits 200 · reversed 4 (2.0%)");
    s.dismiss();
    expect(shown).toBe("");
  });

  it("publishes nothing when the overlay is off, and ignores a wave it did not start", () => {
    const s = new NetWaveSummary(() => env);
    const src = source();
    let calls = 0;
    s.subscribe(() => calls++);
    expect(s.end(1000, 3, src, meter(), true)).toBeNull();
    s.start(0, 3, src, meter());
    expect(s.end(1000, 3, src, meter(), false)).not.toBeNull();
    expect(calls).toBe(0);
    expect(s.report).toBe("");
  });

  it("formats a table row for docs/perf/epic-2-network.md", () => {
    const text = formatNetReport(
      {
        wave: 4,
        scenario: "",
        durationS: 61,
        avgFps: 59.8,
        minFps: 41.2,
        worstSecondFps: 55,
        avgDownKBps: 20.8,
        peakDownKBps: 26.1,
        avgUpKBps: 2.3,
        avgPingMs: 142,
        p95PingMs: 180,
        apparentHits: 212,
        confirmed: 205,
        reversed: 4,
        reversedPct: 1.9,
        snaps: 0,
        corrections: 3,
      },
      { ...env, renderer: "renderer WebGL · context lost 2 · restored 2" },
    );
    expect(text.split("\n")).toContain("renderer WebGL · context lost 2 · restored 2"); // Story 4.13
    expect(text).toContain("| (device) | UA-test | (4G / Wi-Fi + ?lag=150&jitter=20) | 20.8 / 26.1 | 2.3 | 142 / 180 | 4 / 212 (1.9%) | 59.8 / 41.2 | 0 |");
    expect(text).not.toContain("TEST SCENARIO");
  });
});
