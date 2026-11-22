/** Story 2.7 harness tests; the simulation is in `hitsSim.ts`. */
import { describe, expect, it } from "vitest";
import { simulate, type Result } from "./hitsSim";

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
