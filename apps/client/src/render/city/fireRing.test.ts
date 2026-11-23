import { describe, expect, it } from "vitest";
import { circleInFire, loadBalance, type FireRecord } from "@topdown/shared";
import { FIRE_EMBERS, emberSpot, fireRingRadiusM, fireRingWidthM, strokeFireRings } from "./fireRing";

const balance = loadBalance();
const fire: FireRecord = { name: "f", target: "car", x: 10, y: 8, radiusM: balance.decay.fire.radiusM, stage: 3, index: 0 };

describe("Story 4.8 review M3: the fire ring is the damage edge", () => {
  it("your body touches the ring = you burn (the sim's own test), for players and every zombie size", () => {
    const radii = [balance.player.radiusM, ...Object.values(balance.zombies.types).map((z) => z.radiusM)];
    const ring = fireRingRadiusM(fire);
    for (const r of radii) {
      for (const a of [0, 1, 2.5, 4]) {
        for (const [d, burns] of [
          [ring + r - 1e-3, true],
          [ring + r + 1e-3, false],
        ] as const) {
          const x = fire.x + Math.cos(a) * d;
          const y = fire.y + Math.sin(a) * d;
          const touchesRing = Math.hypot(x - fire.x, y - fire.y) - r < ring; // the body's nearest edge is inside the ring
          expect(circleInFire([fire], x, y, r), `r ${r} d ${d}`).toBe(burns);
          expect(touchesRing).toBe(burns);
        }
      }
    }
  });

  it("embers sit on the ring; the line is ~2 px at any zoom", () => {
    const out = { x: 0, y: 0 };
    for (let i = 0; i < FIRE_EMBERS; i++) {
      emberSpot(fire, i, FIRE_EMBERS, 3.7, out);
      expect(Math.hypot(out.x - fire.x, out.y - fire.y)).toBeCloseTo(fire.radiusM, 9);
    }
    expect(fireRingWidthM(40) * 40).toBeCloseTo(2, 9);
    expect(fireRingWidthM(70) * 70).toBeCloseTo(2, 9);
  });

  it("re-review L3: CityView's ring stroke is drawn at exactly the zone radius (the damage edge), one per zone up to the light cap", () => {
    const calls: [number, number, number][] = [];
    const g = { strokeCircle: (x: number, y: number, r: number) => calls.push([x, y, r]) };
    const other: FireRecord = { ...fire, x: 30, y: 4, radiusM: 1.5, index: 1 };
    strokeFireRings(g, [fire, other], 4);
    expect(calls).toEqual([
      [fire.x, fire.y, fire.radiusM],
      [other.x, other.y, other.radiusM],
    ]);
    calls.length = 0;
    strokeFireRings(g, [fire, other], 1);
    expect(calls).toHaveLength(1);
  });
});
