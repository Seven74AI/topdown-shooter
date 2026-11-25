/** Story 2.7 harness tests; the simulation is in `hitsSim.ts`. Story 2.12: the server rewinds by default. */
import { describe, expect, it } from "vitest";
import { simulate, type Options, type Result } from "./hitsSim";

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
  const sum: Result = { localShotSeqs: [], serverShotSeqs: [], viewOffsets: [], drops: { overflow: 0, stale: 0, drained: 0, jumped: 0, resyncs: 0, rate: 0 }, apparentHits: 0, confirmed: 0, reversed: 0, serverHitsByMe: 0, kills: 0, shots: 0, serverCoverStops: 0, clientCoverStops: 0, fanShots: 0, fanMismatches: 0, fanMaxDiffRad: 0, stalls: { up: 0, down: 0 } };
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
      // The view offset at 150 ms RTT fits the 300 ms cap (one-way + queue wait + render delay).
      const offs = [...on.viewOffsets].sort((a, b) => a - b);
      expect(offs[Math.floor(offs.length * 0.95)]).toBeLessThan(6);
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
