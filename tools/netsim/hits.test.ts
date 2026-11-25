/** Story 2.7 harness tests; the simulation is in `hitsSim.ts`. Story 2.12: the server rewinds by default. */
import { describe, expect, it } from "vitest";
import { HORDE_FAR_RULE_RADIUS_M } from "@topdown/shared";
import { REWIND_CAP_TICKS } from "../../apps/server/src/run/RunController";
import { emptySmooth, simulate, type Options, type Result } from "./hitsSim";

const pct = (r: Result) => (r.apparentHits > 0 ? (100 * r.reversed) / r.apparentHits : 0);
const report = (name: string, r: Result): void => {
  console.info(
    `[netsim hits] ${name}: shots=${r.shots} apparent=${r.apparentHits} confirmed=${r.confirmed} reversed=${r.reversed} ` +
      `(${pct(r).toFixed(1)}%) serverHitsByMe=${r.serverHitsByMe} kills=${r.kills}`,
  );
};

describe("netsim: server-confirmed hits (Story 2.7 AC 4, NFR5 early read)", () => {
  it("150 ms RTT, 20 ms jitter, 20 Walkers walking at a standing player, Pistol: reversed below 5 %", () => {
    for (const seed of [1, 2, 3]) {
      const r = simulate({ seconds: 30, oneWayMs: 75, jitterHalfMs: 10, seed, weapon: "pistol", kite: false });
      report(`standing pistol 75±10 ms seed ${seed}`, r);
      expect(r.apparentHits).toBeGreaterThan(30);
      expect(r.confirmed + r.reversed).toBeLessThanOrEqual(r.apparentHits);
      expect(pct(r)).toBeLessThan(5);
    }
  });

  it("the same for the Hunting Rifle (pierce 5) and the SMG (8° spread, rolled apart on each side)", () => {
    for (const weapon of ["hunting_rifle", "smg"] as const) {
      const r = simulate({ seconds: 30, oneWayMs: 75, jitterHalfMs: 10, seed: 1, weapon, kite: false });
      report(`standing ${weapon} 75±10 ms`, r);
      expect(r.apparentHits).toBeGreaterThan(20);
      expect(pct(r)).toBeLessThan(5);
    }
  });

  it("kiting (walking a circle at full speed) with 150 and 300 ms RTT: reported for Story 2.10", () => {
    for (const [oneWayMs, jitterHalfMs] of [
      [75, 10],
      [150, 20],
    ] as const) {
      const r = simulate({ seconds: 30, oneWayMs, jitterHalfMs, seed: 1, weapon: "pistol", kite: true });
      report(`kiting pistol ${oneWayMs}±${jitterHalfMs} ms`, r);
      expect(r.apparentHits).toBeGreaterThan(30);
      expect(pct(r)).toBeLessThan(15); // no rewind in v1: a moving shooter sees the horde ~RTT/2 + delay late
    }
  });

  it("Story 2.10: a 150-Walker crowd at 150 ms RTT (pierce-1 bullets may hit a different crowd member on each side): reported", () => {
    for (const kite of [false, true]) {
      const r = simulate({ seconds: 30, oneWayMs: 75, jitterHalfMs: 10, seed: 1, weapon: "pistol", kite, walkers: 150 });
      report(`${kite ? "kiting" : "standing"} pistol 75±10 ms, 150 Walkers`, r);
      expect(r.apparentHits).toBeGreaterThan(30);
      expect(r.confirmed + r.reversed).toBeLessThanOrEqual(r.apparentHits);
    }
  });

  it("Story 3.8: 20 Runners (4 m/s, flanking) at 150 ms RTT, standing and kiting: reported (architecture: rewind if > 1 in 20 reversed)", () => {
    for (const kite of [false, true]) {
      const r = simulate({ seconds: 30, oneWayMs: 75, jitterHalfMs: 10, seed: 1, weapon: "pistol", kite, zombieType: "runner" });
      report(`${kite ? "kiting" : "standing"} pistol 75±10 ms, 20 Runners`, r);
      expect(r.apparentHits).toBeGreaterThan(30);
      expect(r.confirmed + r.reversed).toBeLessThanOrEqual(r.apparentHits);
    }
  });

  it("stall → burst → drain (review MED-2): the server fires only on seqs the client's clock shot on", () => {
    for (const weapon of ["smg", "pistol"] as const) {
      const stall = { fromMs: 5000, toMs: 5400 };
      const r = simulate({ seconds: 20, oneWayMs: 75, jitterHalfMs: 10, seed: 8, weapon, kite: false, stall });
      const local = new Set(r.localShotSeqs);
      const server = new Set(r.serverShotSeqs);
      const serverOnly = r.serverShotSeqs.filter((s) => !local.has(s));
      const localOnly = r.localShotSeqs.filter((s) => !server.has(s) && s <= Math.max(...r.serverShotSeqs));
      console.info(
        `[netsim hits] stall 400 ms ${weapon}: local ${r.localShotSeqs.length} server ${r.serverShotSeqs.length} shots; ` +
          `server-only ${serverOnly.length}, local-only ${localOnly.length} (${localOnly.join(",")}); drops ${JSON.stringify(r.drops)}; ` +
          `reversed ${r.reversed}/${r.apparentHits}`,
      );
      expect(r.drops.overflow + r.drops.drained).toBeGreaterThan(0); // the stall really skipped inputs
      expect(server.size).toBe(r.serverShotSeqs.length); // at most one shot per seq
      expect(serverOnly).toEqual([]);
      // Local-only shots are exactly on skipped seqs (the server never applies them), never later.
      expect(localOnly.length).toBeLessThanOrEqual(r.drops.overflow + r.drops.drained);
      const lastSkipSeq = Math.ceil((stall.toMs + 3000) / 50);
      expect(localOnly.filter((s) => s > lastSkipSeq)).toEqual([]);
    }
  });
});

/** Sums several seeded runs (each one reported). */
const runSeeds = (name: string, o: Omit<Options, "seed">, seeds: readonly number[]): Result => {
  const sum: Result = { localShotSeqs: [], serverShotSeqs: [], viewOffsets: [], drops: { overflow: 0, stale: 0, drained: 0, jumped: 0, resyncs: 0, rate: 0 }, apparentHits: 0, confirmed: 0, reversed: 0, serverHitsByMe: 0, kills: 0, shots: 0, serverCoverStops: 0, clientCoverStops: 0, fanShots: 0, fanMismatches: 0, fanMaxDiffRad: 0, stalls: { up: 0, down: 0 }, smooth: emptySmooth(), horde: { bytes: 0, frames: 0, keyframes: 0, decodeErrors: 0, decoded: 0 } };
  for (const seed of seeds) {
    const r = simulate({ ...o, seed });
    report(`${name} seed ${seed}`, r);
    sum.apparentHits += r.apparentHits;
    sum.confirmed += r.confirmed;
    sum.reversed += r.reversed;
    sum.serverHitsByMe += r.serverHitsByMe;
    sum.kills += r.kills;
    sum.shots += r.shots;
    sum.viewOffsets.push(...r.viewOffsets);
    sum.serverShotSeqs.push(...r.serverShotSeqs);
    sum.localShotSeqs.push(...r.localShotSeqs);
    sum.stalls.up += r.stalls.up;
    sum.stalls.down += r.stalls.down;
    sum.horde.bytes += r.horde.bytes;
    sum.horde.frames += r.horde.frames;
    sum.horde.keyframes += r.horde.keyframes;
    sum.horde.decodeErrors += r.horde.decodeErrors;
    sum.horde.decoded += r.horde.decoded;
  }
  const offs = [...sum.viewOffsets].sort((a, b) => a - b);
  const q = (p: number) => (offs[Math.floor(offs.length * p)] ?? 0).toFixed(2);
  report(`${name} ALL (view offset p5/p50/p95 ${q(0.05)}/${q(0.5)}/${q(0.95)} ticks)`, sum);
  return sum;
};

const SEEDS = [1, 2, 3, 4, 5] as const;
const KITE_150 = { seconds: 30, oneWayMs: 75, jitterHalfMs: 10, kite: true } as const;
const KITE_300 = { seconds: 30, oneWayMs: 150, jitterHalfMs: 20, kite: true } as const;

describe("netsim: rewound hit testing (Story 2.12, NFR5 < 1 in 20 reversed)", () => {
  it("kiting 20 Runners at 150 ms RTT: the rewind brings reversed hits under 5 % (control: rewind off is ≥ 5 pp worse)", () => {
    for (const weapon of ["pistol", "hunting_rifle", "smg"] as const) {
      const on = runSeeds(`2.12 rewind ON kiting ${weapon} 150 ms, 20 Runners`, { ...KITE_150, weapon, zombieType: "runner" }, SEEDS);
      const off = runSeeds(`2.12 rewind OFF (control) kiting ${weapon} 150 ms, 20 Runners`, { ...KITE_150, weapon, zombieType: "runner", rewind: false }, SEEDS);
      expect(on.apparentHits).toBeGreaterThan(150);
      expect(pct(on)).toBeLessThan(5);
      // The harness does see the problem the rewind fixes (review M3: a margin, not an absolute control level).
      expect(pct(off) - pct(on)).toBeGreaterThan(5);
      // The view offset at 150 ms RTT fits the 600 ms cap (one-way + queue wait + render delay; Story 8.8: was < 6 for 300 ms).
      const offs = [...on.viewOffsets].sort((a, b) => a - b);
      expect(offs[Math.floor(offs.length * 0.95)]).toBeLessThan(10);
    }
  }, 120_000);

  it("kiting Walkers (20 and the 150 crowd) at 150 ms RTT with the rewind: under 5 %", () => {
    for (const walkers of [20, 150]) {
      const on = runSeeds(`2.12 rewind ON kiting pistol 150 ms, ${walkers} Walkers`, { ...KITE_150, weapon: "pistol", walkers }, SEEDS);
      runSeeds(`2.12 rewind OFF (control) kiting pistol 150 ms, ${walkers} Walkers`, { ...KITE_150, weapon: "pistol", walkers, rewind: false }, SEEDS);
      expect(on.apparentHits).toBeGreaterThan(150);
      expect(pct(on)).toBeLessThan(5);
    }
  }, 120_000);

  it("300 ms RTT (view offset past the 300 ms cap: the rest is the 2.7 advance): reported, better than without the rewind", () => {
    for (const zombieType of ["runner", "walker"] as const) {
      const on = runSeeds(`2.12 rewind ON kiting pistol 300 ms, 20 ${zombieType}s`, { ...KITE_300, weapon: "pistol", zombieType }, SEEDS);
      const off = runSeeds(`2.12 rewind OFF (control) kiting pistol 300 ms, 20 ${zombieType}s`, { ...KITE_300, weapon: "pistol", zombieType, rewind: false }, SEEDS);
      expect(on.apparentHits).toBeGreaterThan(150);
      expect(pct(on)).toBeLessThanOrEqual(pct(off));
      expect(pct(on)).toBeLessThan(25);
    }
  }, 120_000);
});

/**
 * Story 8.8 (AC 5, F1, F5; network pass brief 13, 14, 6): the lossy line. 150 ms ± 10 ms, Pistol,
 * seeds 1–3 × 60 s (the audit's rows, docs/perf/network-audit-2026-11.md §3.5). Before (300 ms
 * window, master da82847 / c57c1cc): Runners 7.6 % (1 %) and 11.9 % (2 %), Walkers 2.3 % / 3.5 %;
 * clean 0.2 %. Liveness: stalls really injected in both directions, enough apparent hits.
 */
describe("Story 8.8: lossy line (1 % / 2 % × 200 ms head-of-line stalls)", () => {
  const LINE = { seconds: 60, oneWayMs: 75, jitterHalfMs: 10, weapon: "pistol", kite: true } as const;
  const SEEDS_88 = [1, 2, 3] as const;
  const overCapPct = (r: Result) => (r.viewOffsets.length ? (100 * r.viewOffsets.filter((v) => v > REWIND_CAP_TICKS).length) / r.viewOffsets.length : 0);
  const cases = [
    { name: "20 Runners kiting", o: { zombieType: "runner" } },
    { name: "150 Walkers kiting", o: { walkers: 150 } },
  ] as const;
  for (const c of cases) {
    it(`${c.name}: clean line ≤ 1.2 % reversed and ≤ the float-input control + 1 shot (control ≤ 1 %; clean lines don't pay; Story 8.10 B2, 8.11 B3), no stalls`, () => {
      const r = runSeeds(`8.8 clean ${c.name}`, { ...LINE, ...c.o }, SEEDS_88);
      expect(r.apparentHits).toBeGreaterThan(300);
      expect(r.stalls).toEqual({ up: 0, down: 0 });
      // Story 8.10 (brief 20, decision 8.10 B2): the harness now draws the horde through the real stream and
      // HordeBuffer, which keeps a killed zombie drawn until the render tick reaches its kill (Story 2.5):
      // 20 Runners kiting 1/446 → 4/439 (0.9 %) with or without 8.10's 10 Hz far rule (comparison below).
      // B7: the game runs every zombie at 20 Hz; the far rule (8 m, D1) is run explicitly here.
      // Story 8.11 (decision 8.11 B3): the harness sends the phone's 1/127-step input now; on these 3 seeds the
      // Runners row reads 5/436 (1.1 %) against 4/439 with the float input: one shot of seed noise (30 seeds:
      // 35/4266 = 0.82 % quantised vs 41/4268 = 0.96 % float). The bound is the paired control + 1 shot, and ≤ 1.2 %.
      const float = runSeeds(`8.11 float input (control) clean ${c.name}`, { ...LINE, ...c.o, quantizeInput: false }, SEEDS_88);
      expect(r.reversed).toBeLessThanOrEqual(float.reversed + 1);
      expect(pct(r)).toBeLessThanOrEqual(1.2);
      expect(pct(float)).toBeLessThanOrEqual(1);
      const farRule = runSeeds(`8.10 far rule on (8 m) clean ${c.name}`, { ...LINE, ...c.o, hordeNearM: HORDE_FAR_RULE_RADIUS_M }, SEEDS_88);
      expect(farRule.reversed).toBeLessThanOrEqual(r.reversed + 1); // the far rule costs no reversed hits
      expect(r.horde.bytes).toBeGreaterThan(farRule.horde.bytes); // review RL1: the two runs really differ (liveness)
      expect(r.horde.decodeErrors).toBe(0);
      expect(r.horde.keyframes).toBeGreaterThanOrEqual(170); // ≈ 1/s over 3 × 60 s (liveness of the real stream)
      expect(overCapPct(r)).toBe(0);
      expect(r.viewOffsets.filter((v) => v > 6)).toEqual([]); // review R1: the control for the lossy rows' "> 6 ticks" share
    });
    for (const lossPct of [1, 2]) {
      it(`${c.name}: ${lossPct} % × 200 ms stalls < 5 % reversed (the 600 ms window, Story 8.9 T10)`, () => {
        const r = runSeeds(`8.8 loss ${lossPct}% ${c.name}`, { ...LINE, ...c.o, loss: { pct: lossPct, stallMs: 200 } }, SEEDS_88);
        console.info(`[netsim hits] 8.8 loss ${lossPct}% ${c.name}: stalls up ${r.stalls.up} down ${r.stalls.down}, shots over the ${REWIND_CAP_TICKS}-tick cap ${overCapPct(r).toFixed(1)} %`);
        expect(r.stalls.up).toBeGreaterThan(10 * lossPct); // liveness: the line really stalled, both ways
        expect(r.stalls.down).toBeGreaterThan(10 * lossPct);
        // Story 8.9: with the 250 ms lossy-line delay fewer cosmetic bullets cross a drawn Runner (~290 vs ~410): liveness only.
        expect(r.apparentHits).toBeGreaterThan(250);
        expect(pct(r)).toBeLessThan(5);
        // Before: 38–73 % of these shots asked for more than the 300 ms cap; with 500 ms almost none did, until Story 8.9's
        // 250 ms delay (view offset p95 11.4–11.7 ticks: 18–29 % over 10); with 600 ms (Story 8.9 T10, 8.8 D1's fallback):
        expect(overCapPct(r)).toBeLessThan(5);
        // Review R1: the stalls really hurt the shots (not only counted): many ask for a view older than
        // 6 ticks (300 ms), which never happens on the clean line (0 %).
        const oldPct = (100 * r.viewOffsets.filter((v) => v > 6).length) / r.viewOffsets.length;
        console.info(`[netsim hits] 8.8 loss ${lossPct}% ${c.name}: shots asking > 6 ticks back ${oldPct.toFixed(1)} %`);
        expect(oldPct).toBeGreaterThan(20);
        expect(REWIND_CAP_TICKS).toBe(12); // Story 8.9 T10 (B8): 600 ms
      });
    }
  }
});
