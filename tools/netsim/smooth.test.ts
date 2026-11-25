/**
 * Story 8.9 harness tests (AC 6, brief 13/14/17): smooth through hiccups, on the clean and the lossy
 * line, through the real client clock / delay / step pacing and the real server RunController.
 * Before/after numbers: `npx tsx tools/netsim/smoothRun.ts` (docs/perf/network-pass-2026-11.md § 8.9).
 */
import { describe, expect, it } from "vitest";
import { simulate, type Options, type Result } from "./hitsSim";

const LINE = { oneWayMs: 75, jitterHalfMs: 10, weapon: "pistol" } as const;
const LOSSY = { pct: 1, stallMs: 200 } as const;
const SEEDS = [1, 2, 3] as const;

interface Sum {
  runs: Result[];
  freezesPer30s: number;
  neverFiredPct: number;
  reversedPct: number;
  starved: number;
  drained: number;
}

const sum = (name: string, o: Omit<Options, "seed" | "oneWayMs" | "jitterHalfMs" | "weapon">): Sum => {
  const runs = SEEDS.map((seed) => simulate({ ...LINE, ...o, seed }));
  const n = (f: (r: Result) => number): number => runs.reduce((a, r) => a + f(r), 0);
  const s: Sum = {
    runs,
    freezesPer30s: n((r) => r.smooth.freezes) / ((SEEDS.length * (o.seconds - 2)) / 30),
    neverFiredPct: (100 * n((r) => r.smooth.neverFired)) / Math.max(1, n((r) => r.smooth.localShots)),
    reversedPct: (100 * n((r) => r.reversed)) / Math.max(1, n((r) => r.apparentHits)),
    starved: n((r) => r.smooth.starvedTicks),
    drained: n((r) => r.drops.drained),
  };
  console.info(
    `[netsim smooth] ${name}: freezes/30s ${s.freezesPer30s.toFixed(2)} · delay p50 ${runs.map((r) => Math.round(r.smooth.delayP50)).join("/")} p95 ${runs.map((r) => Math.round(r.smooth.delayP95)).join("/")} · ` +
      `never fired ${s.neverFiredPct.toFixed(2)} % · reversed ${s.reversedPct.toFixed(2)} % · starved ${s.starved} · drained ${s.drained} · rate ${Math.min(...runs.map((r) => r.smooth.rateMin)).toFixed(3)}–${Math.max(...runs.map((r) => r.smooth.rateMax)).toFixed(3)}`,
  );
  return s;
};

/** F2, F3: nothing went backwards and the picture never played outside 0.9–1.1×. */
const expectMonotonicAndBounded = (s: Sum): void => {
  for (const r of s.runs) {
    expect(r.smooth.renderBackSteps).toBe(0);
    expect(r.smooth.estimateBackSteps).toBe(0);
    expect(r.smooth.rateMin).toBeGreaterThanOrEqual(0.9 - 1e-6);
    expect(r.smooth.rateMax).toBeLessThanOrEqual(1.1 + 1e-6);
    expect(r.smooth.frames).toBeGreaterThan(1000); // liveness: frames really ran
  }
};

describe("netsim: smooth through hiccups (Story 8.9)", () => {
  it("F4: a clean 150 ms ± 10 ms line feels as today: delay 100–150 ms, no freeze, reversed ≤ 0.5 %, nothing skipped", () => {
    for (const [name, o] of [
      ["150 Walkers standing", { walkers: 150, kite: false }],
      ["20 Runners kiting", { zombieType: "runner", kite: true }],
    ] as const) {
      const s = sum(`clean ${name}`, { seconds: 30, ...o });
      expectMonotonicAndBounded(s);
      for (const r of s.runs) {
        expect(r.smooth.delayP50).toBeGreaterThanOrEqual(100);
        expect(r.smooth.delayP95).toBeLessThanOrEqual(150);
        expect(r.smooth.freezes).toBe(0);
        expect(r.smooth.slowFrames).toBe(0); // clean lines don't pay: my steps never slowed
        expect(r.apparentHits).toBeGreaterThan(50); // liveness
      }
      expect(s.reversedPct).toBeLessThanOrEqual(0.5);
      expect(s.neverFiredPct).toBe(0);
    }
  }, 60_000);

  it("F1, F6: on the lossy line (1 % × 200 ms both ways) the picture rarely freezes and no predicted shot is lost", () => {
    const s = sum("lossy 1 % 20 Runners kiting", { seconds: 60, zombieType: "runner", kite: true, loss: LOSSY });
    expectMonotonicAndBounded(s);
    // Before (master c57c1cc, same seeds): 6.7 freezes per 30 s, 1.7 % never fired. AC ≤ 1 per 30 s (this row: 0.86 at review)
    // and 0.9–1.2 across the cases (a stall after > 5 s of calm still finds the delay eased below 230 ms, F4 keeps clean lines at 100).
    expect(s.freezesPer30s).toBeLessThanOrEqual(1); // review L1: the AC number (F1, AC 6)
    expect(s.neverFiredPct).toBeLessThan(1);
    for (const r of s.runs) {
      expect(r.smooth.delayP50).toBeGreaterThan(200); // liveness: the stalls really were measured as lateness
      expect(r.smooth.delayP95).toBeLessThanOrEqual(275); // 250 + the stall stretch (STALL_STRETCH_MAX_MS)
      expect(r.smooth.slowFrames).toBeGreaterThan(0); // the backlog really was paced down
    }
    expect(s.drained).toBeLessThanOrEqual(3); // the server's skip rule is only a safety net now
  }, 60_000);

  it("F2 (audit F5): a lasting +150 ms latency step on the lossy line never moves anything backwards", () => {
    const s = sum("lossy 1 % + 150 ms step at 20 s", { seconds: 40, zombieType: "runner", kite: true, loss: LOSSY, latencyStep: { atMs: 20_000, addMs: 150 } });
    expectMonotonicAndBounded(s);
  }, 60_000);

  it("beat the rule 3: a modified client that never slows only keeps its own backlog (the server's 2 s drain skips it)", () => {
    const on = sum("lossy 1 % pacing ON, 150 Walkers standing", { seconds: 60, walkers: 150, kite: false, loss: LOSSY });
    const off = sum("lossy 1 % pacing OFF (modified client)", { seconds: 60, walkers: 150, kite: false, loss: LOSSY, pacing: false });
    expect(off.drained).toBeGreaterThan(20); // the safety net did the draining
    expect(on.drained).toBeLessThan(off.drained);
    expect(on.neverFiredPct).toBeLessThanOrEqual(off.neverFiredPct);
    // Starved ticks: the backlog no longer sits 2 s as cover for the next stall (Story 2.4's trade-off): recorded,
    // bounded so a regression shows (measured +41–61 %, AC "± 10 %" not met, accepted as 8.9 B7: docs/network-pass-decisions.md).
    expect(on.starved).toBeLessThanOrEqual(off.starved * 1.7);
  }, 60_000);

  it("beat the rule 4: a client that slows to 0.5× on purpose only starves its own survivor: no speed-up, no extra shots", () => {
    const s = sum("lossy 1 % stepRate 0.5 (modified client)", { seconds: 30, walkers: 150, kite: false, loss: LOSSY, stepRate: 0.5 });
    for (const r of s.runs) {
      expect(r.smooth.starvedTicks).toBeGreaterThan(200); // half the ticks find no input
      const local = new Set(r.localShotSeqs);
      expect(r.serverShotSeqs.every((q) => local.has(q))).toBe(true); // the server fires only shots the client predicted
      expect(r.serverShotSeqs.length).toBeLessThanOrEqual(r.localShotSeqs.length);
      expect(r.drops.overflow + r.drops.drained).toBe(0);
    }
  }, 60_000);
});
