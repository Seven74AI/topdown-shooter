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

type Line = Omit<Options, "seed" | "oneWayMs" | "jitterHalfMs" | "weapon">;

const sum = (name: string, o: Line, seeds: readonly number[] = SEEDS): Sum => sumRuns(name, o, seeds.map((seed) => simulate({ ...LINE, ...o, seed })));

/** `sum` over runs already simulated (one per seed, in seed order). */
const sumRuns = (name: string, o: Line, runs: Result[]): Sum => {
  const n = (f: (r: Result) => number): number => runs.reduce((a, r) => a + f(r), 0);
  const s: Sum = {
    runs,
    freezesPer30s: n((r) => r.smooth.freezes) / ((runs.length * (o.seconds - 2)) / 30),
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
  it("F4: a clean 150 ms ± 10 ms line feels as today: delay 100–150 ms, no freeze, reversed ≤ 0.5 % (float-input control; 8.11 B3: quantised ≤ control + 1 shot), nothing skipped", () => {
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
      // Story 8.11 (decision 8.11 B3): with the phone's 1/127-step input the Runners row reads 2/218 (0.92 %) on these
      // 3 seeds against 1/220 with the float input: one shot of seed noise (30 seeds: 18/2124 = 0.85 % quantised vs
      // 23/2117 = 1.09 % float). Bound: ≤ 0.5 % with the float input (unchanged), and the paired control + 1 shot.
      const float = sum(`clean ${name} (8.11 float input, control)`, { seconds: 30, ...o, quantizeInput: false });
      expect(float.reversedPct).toBeLessThanOrEqual(0.5);
      const reversed = (x: Sum) => x.runs.reduce((a, r) => a + r.reversed, 0);
      expect(reversed(s)).toBeLessThanOrEqual(reversed(float) + 1);
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

  it("F1 (8.9 B9): every 1 % × 200 ms row stays at ≤ 1.2 freezes per 30 s (before 6–6.9)", () => {
    for (const [name, o] of [
      ["150 Walkers standing", { walkers: 150, kite: false }],
      ["150 Walkers kiting", { walkers: 150, kite: true }],
      ["20 Runners kiting", { zombieType: "runner", kite: true }],
    ] as const) {
      const s = sum(`lossy 1 % ${name} (B9)`, { seconds: 60, ...o, loss: LOSSY });
      expectMonotonicAndBounded(s);
      expect(s.freezesPer30s).toBeLessThanOrEqual(1.21); // "1.2" rounded: 7 freezes in 3 × 58 s = 1.207; measured 1.21 / 0.9 / 0.9 (same seeds)
      for (const r of s.runs) expect(r.smooth.delayP50).toBeGreaterThan(200); // liveness: the stalls were measured
    }
  }, 120_000);

  it("F2 (audit F5): a lasting +150 ms latency step on the lossy line never moves anything backwards", () => {
    const s = sum("lossy 1 % + 150 ms step at 20 s", { seconds: 40, zombieType: "runner", kite: true, loss: LOSSY, latencyStep: { atMs: 20_000, addMs: 150 } });
    expectMonotonicAndBounded(s);
  }, 60_000);

  describe("beat the rule 3: a modified client that never slows only keeps its own backlog (the server's 2 s drain skips it)", () => {
    // Story 8.10 (brief R5): since the harness draws the horde through the real stream, the seeded stalls land
    // elsewhere and the starved on/off ratio over seeds 1–3 alone reads 1.85 (seeds 4–6: 1.40, 7–9: 1.19, the
    // far rule on: 1.69); over seeds 1–9 it is 1.42. Nine seeds keep the 8.9 B7 bound about the rule, not the draw.
    // E8-A8 (no test over 30 s; was 32 s in CI): one test per simulated run, then the same assertions over all 18.
    const SEEDS_9 = [1, 2, 3, 4, 5, 6, 7, 8, 9] as const;
    const LINES = {
      on: { seconds: 60, walkers: 150, kite: false, loss: LOSSY },
      off: { seconds: 60, walkers: 150, kite: false, loss: LOSSY, pacing: false },
    } satisfies Record<string, Line>;
    const runs = { on: new Map<number, Result>(), off: new Map<number, Result>() };
    // The old order: all nine ON runs, then all nine OFF runs (each run is simulated alone, but keep the order anyway).
    it.each([...SEEDS_9.map((seed) => ["on", seed] as const), ...SEEDS_9.map((seed) => ["off", seed] as const)])("pacing %s, seed %i", (k, seed) => {
      runs[k].set(seed, simulate({ ...LINE, ...LINES[k], seed }));
    }, 60_000);

    it("the 9 seeds together: the drain only skips the modified client's backlog", () => {
      expect(runs.on.size + runs.off.size, "every run above ran").toBe(2 * SEEDS_9.length);
      const on = sumRuns("lossy 1 % pacing ON, 150 Walkers standing", LINES.on, SEEDS_9.map((seed) => runs.on.get(seed) as Result));
      const off = sumRuns("lossy 1 % pacing OFF (modified client)", LINES.off, SEEDS_9.map((seed) => runs.off.get(seed) as Result));
      expect(off.drained).toBeGreaterThan(20); // the safety net did the draining
      expect(on.drained).toBeLessThan(off.drained);
      expect(on.neverFiredPct).toBeLessThanOrEqual(off.neverFiredPct);
      // Starved ticks: the backlog no longer sits 2 s as cover for the next stall (Story 2.4's trade-off): recorded,
      // bounded so a regression shows (measured +41–61 %, AC "± 10 %" not met, accepted as 8.9 B7: docs/network-pass-decisions.md).
      expect(on.starved).toBeLessThanOrEqual(off.starved * 1.7);
      expect(on.starved).toBeLessThanOrEqual(300); // re-review RR2: an absolute pin over seeds 1–9 (measured 277)
    });
  });

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
