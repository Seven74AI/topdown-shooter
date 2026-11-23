import { describe, expect, it } from "vitest";
import { circleInFire, loadBalance, type FireRecord } from "@topdown/shared";
import { FIRE_RING_GLOW_ALPHA, FIRE_RING_GLOW_PULSE, FIRE_RING_GLOW_PX, damageTickPulse, fireRingGlowAlpha, fireRingRadiusM, fireRingWidthM, strokeFireRingGlows, strokeFireRings } from "./fireRing";

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

  it("the line is ~2 px at any zoom", () => {
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

describe("Story 4.12 (fire-lab panel D): the ring's soft glow band", () => {
  it("lies just inside the ring: its outer side on R at any zoom, never past it", () => {
    for (const zoom of [40, 70, 105]) {
      const calls: number[] = [];
      strokeFireRingGlows({ strokeCircle: (_x: number, _y: number, r: number) => calls.push(r) }, [fire], 4, zoom);
      expect(calls).toHaveLength(1);
      expect((calls[0] as number) + FIRE_RING_GLOW_PX / 2 / zoom).toBeCloseTo(fireRingRadiusM(fire), 9);
    }
  });

  it("pulses with the damage tick (pulseS)", () => {
    const p = balance.decay.fire.pulseS;
    expect(fireRingGlowAlpha(damageTickPulse(0, p))).toBeCloseTo(FIRE_RING_GLOW_ALPHA + FIRE_RING_GLOW_PULSE, 9);
    expect(fireRingGlowAlpha(damageTickPulse(p * 0.95, p))).toBeLessThan(FIRE_RING_GLOW_ALPHA + 0.01);
  });

  it("the pulse kicks at each damage tick (pulseS) and fades within it", () => {
    const p = balance.decay.fire.pulseS;
    expect(damageTickPulse(0, p)).toBeCloseTo(1, 9);
    expect(damageTickPulse(p, p)).toBeCloseTo(1, 6);
    expect(damageTickPulse(p * 0.9, p)).toBeLessThan(0.05);
    expect(damageTickPulse(p * 3.25, p)).toBeCloseTo(damageTickPulse(p * 0.25, p), 9);
    expect(damageTickPulse(1, 0)).toBe(0);
  });
});
