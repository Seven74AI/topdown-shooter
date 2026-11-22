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
});
