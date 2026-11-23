/**
 * Story 5.3 (AC 12, 16; brief line 14): the Shotgun and the Assault Rifle under `?lag=150&jitter=20`
 * (one-way 75 ± 10 ms), kiting Runners, 10 seeds per gun, through the 2.7/2.12 harness (`hitsSim.ts`:
 * the real RunController, Predictor, LocalFireClock, CosmeticProjectiles and aim assist on the mirror).
 *
 * F6: the shooter's cosmetic pellets fly where the server's do: both fans come from the shared
 * `pelletDirection` + `seqPelletRoll` on the shot's seq, so they agree when the centre aim agrees
 * (touch aim assist on the mirror vs the server's rewound view) and the event's seq is the input's.
 */
import { describe, expect, it } from "vitest";
import { simulate, type Result } from "./hitsSim";

const pct = (r: Result) => (r.apparentHits > 0 ? (100 * r.reversed) / r.apparentHits : 0);
const SEEDS = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10];

describe("netsim: Shotgun and Assault Rifle at 150 ms RTT ± 20 ms (Story 5.3)", () => {
  for (const weapon of ["shotgun", "assault_rifle"] as const) {
    it(`${weapon}: kiting Runners, 10 seeds: cosmetic pellets = server pellets, reversed hits < 5 %`, () => {
      let apparent = 0;
      let reversed = 0;
      let kills = 0;
      let fanShots = 0;
      let fanMismatches = 0;
      let worst = 0;
      for (const seed of SEEDS) {
        const r = simulate({ seconds: 20, oneWayMs: 75, jitterHalfMs: 10, seed, weapon, kite: true, zombieType: "runner" });
        apparent += r.apparentHits;
        reversed += r.reversed;
        kills += r.kills;
        fanShots += r.fanShots;
        fanMismatches += r.fanMismatches;
        worst = Math.max(worst, r.fanMaxDiffRad);
        expect(r.confirmed + r.reversed).toBeLessThanOrEqual(r.apparentHits);
      }
      const share = apparent > 0 ? (100 * reversed) / apparent : 0;
      console.info(
        `[netsim 5.3] ${weapon} kiting runners 75±10 ms × ${SEEDS.length}: apparent=${apparent} reversed=${reversed} (${share.toFixed(2)}%) kills=${kills}` +
          (weapon === "shotgun" ? ` fan shots=${fanShots} mismatched=${fanMismatches} worst=${worst.toExponential(2)} rad` : ""),
      );
      // liveness: the gun really fired, hit and killed
      expect(apparent).toBeGreaterThan(100);
      expect(kills).toBeGreaterThan(50);
      expect(share).toBeLessThan(5);
      if (weapon === "shotgun") {
        expect(fanShots).toBeGreaterThan(100);
        expect(fanMismatches).toBe(0);
      } else expect(fanShots).toBe(0);
    }, 120_000);
  }

  it("standing Shotgun into 20 Walkers at the same lag: reported (pct helper kept honest)", () => {
    const r = simulate({ seconds: 20, oneWayMs: 75, jitterHalfMs: 10, seed: 1, weapon: "shotgun", kite: false });
    console.info(`[netsim 5.3] shotgun standing walkers: apparent=${r.apparentHits} reversed=${r.reversed} (${pct(r).toFixed(2)}%) fan ${r.fanShots}/${r.fanMismatches}`);
    expect(r.kills).toBeGreaterThan(10);
    expect(r.fanMismatches).toBe(0);
  }, 60_000);
});
