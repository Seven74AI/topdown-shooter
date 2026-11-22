import { describe, expect, it } from "vitest";
import { DOWNTOWN_MAP } from "@topdown/shared";
import { simulate, type Result } from "./hitsSim";

/**
 * Story 4.2 (brief lines 6 and 11): my local shots agree with the server's near cover, at 150 ms
 * RTT ± 20 ms jitter. The survivor stands just south of the crashed bus on Downtown; 20 Walkers keep
 * coming from a 9–11 m ring (north of the bus too, so they come round it) and the client fires at
 * the nearest drawn zombie, often straight into the bus. The real server (`RunController`, rewind
 * on) and the real client parts (local fire clock, cosmetic projectiles on the mirror, aim assist).
 *
 * - Both sides really stop shots at the bus (liveness), the same number of them, and the client never draws a hit through it
 *   that the server doesn't confirm: reversed hits stay as rare as on the open street.
 * - Control: a client whose mirror has no cover (its cosmetic bullet flies through the bus) shows
 *   reversed hits: the agreement above is the cover rule's doing, not luck.
 */
const START = { x: 35, y: 18.5 }; // bus [30, 40] × [14.5, 17]
const rate = (r: Result) => r.reversed / Math.max(1, r.apparentHits);
const line = (name: string, r: Result) =>
  console.info(
    `[netsim] ${name}: shots=${r.shots} apparent=${r.apparentHits} confirmed=${r.confirmed} reversed=${r.reversed} (${(100 * rate(r)).toFixed(1)} %) serverHits=${r.serverHitsByMe} coverStops server=${r.serverCoverStops} client=${r.clientCoverStops} kills=${r.kills}`,
  );

describe("netsim: local shots vs the server near cover (Story 4.2)", () => {
  it("150 ± 20 ms beside the bus: both stop shots at the bus, reversed hits stay rare; control without client cover: reversed", () => {
    let apparent = 0;
    let reversed = 0;
    for (const seed of [421, 422, 423]) {
      const r = simulate({ seconds: 20, oneWayMs: 75, jitterHalfMs: 10, seed, weapon: "pistol", kite: false, map: DOWNTOWN_MAP, start: START });
      line(`bus pistol seed ${seed}`, r);
      expect(r.shots).toBeGreaterThan(20); // liveness
      expect(r.serverHitsByMe).toBeGreaterThan(5);
      expect(r.serverCoverStops).toBeGreaterThan(0);
      expect(r.clientCoverStops).toBe(r.serverCoverStops); // the same shots ended on the bus on both sides
      apparent += r.apparentHits;
      reversed += r.reversed;
    }
    // The Hunting Rifle (17 m, pierce 5) sees Walkers north of the bus: many more shots end on it.
    const rifle = simulate({ seconds: 20, oneWayMs: 75, jitterHalfMs: 10, seed: 424, weapon: "hunting_rifle", kite: false, map: DOWNTOWN_MAP, start: START });
    line("bus rifle seed 424", rifle);
    expect(rifle.serverCoverStops).toBeGreaterThan(3);
    expect(rifle.clientCoverStops).toBe(rifle.serverCoverStops);
    apparent += rifle.apparentHits;
    reversed += rifle.reversed;
    expect(reversed / apparent).toBeLessThan(0.03);
    const control = simulate({ seconds: 20, oneWayMs: 75, jitterHalfMs: 10, seed: 421, weapon: "pistol", kite: false, map: DOWNTOWN_MAP, clientMap: { ...DOWNTOWN_MAP, solids: [], cover: [] }, start: START });
    line("bus control (client mirror without cover)", control);
    expect(control.clientCoverStops).toBe(0);
    expect(rate(control)).toBeGreaterThan(0.05);
  }, 120_000);
});
