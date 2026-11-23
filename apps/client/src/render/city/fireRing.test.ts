import { describe, expect, it } from "vitest";
import { circleInFire, loadBalance, type FireRecord } from "@topdown/shared";
import {
  FIRE_EMBERS,
  RING_FLAMES_MAX,
  RING_FLAME_SPACING_M,
  damageTickPulse,
  emberSpot,
  fireRingRadiusM,
  fireRingWidthM,
  ringFlameCount,
  ringFlameMarksEdge,
  ringFlameSpot,
  strokeFireRings,
} from "./fireRing";

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

describe("Story 4.11 (F6): the circle of small flames sits exactly at the damage edge", () => {
  it("every ring flame is centred on the zone radius, evenly spaced all round", () => {
    const out = { x: 0, y: 0 };
    for (const r of [1, balance.decay.fire.radiusM, 3.5]) {
      const f = { ...fire, radiusM: r };
      const n = ringFlameCount(f);
      let sx = 0;
      let sy = 0;
      for (let i = 0; i < n; i++) {
        ringFlameSpot(f, i, n, out);
        expect(Math.hypot(out.x - f.x, out.y - f.y)).toBeCloseTo(fireRingRadiusM(f), 9);
        sx += out.x - f.x;
        sy += out.y - f.y;
      }
      // evenly spread: the flames' centroid is the fire's centre
      expect(Math.hypot(sx, sy) / n).toBeLessThan(1e-9);
    }
  });

  it("your body touches the flames = you burn: a body reaching a flame's centre is inside the zone (circleInFire), one just short is not", () => {
    const out = { x: 0, y: 0 };
    const n = ringFlameCount(fire);
    for (const r of [balance.player.radiusM, ...Object.values(balance.zombies.types).map((z) => z.radiusM)]) {
      for (let i = 0; i < n; i++) {
        ringFlameSpot(fire, i, n, out);
        const ux = (out.x - fire.x) / fire.radiusM;
        const uy = (out.y - fire.y) / fire.radiusM;
        // body centre outside, its edge 1 mm past the flame centre toward the car: burns
        expect(circleInFire([fire], out.x + ux * (r - 1e-3), out.y + uy * (r - 1e-3), r)).toBe(true);
        // its edge 1 mm short of the flame centre: safe
        expect(circleInFire([fire], out.x + ux * (r + 1e-3), out.y + uy * (r + 1e-3), r)).toBe(false);
      }
    }
  });

  it("flame count follows the circumference, capped (pool size per fire)", () => {
    expect(ringFlameCount(fire)).toBe(Math.round((2 * Math.PI * fire.radiusM) / RING_FLAME_SPACING_M));
    expect(ringFlameCount({ ...fire, radiusM: 50 })).toBe(RING_FLAMES_MAX);
    expect(ringFlameCount({ ...fire, radiusM: 0.1 })).toBe(6);
  });

  it("two overlapping zones: flames inside the other zone are hidden, the union's edge keeps its flames", () => {
    const a = fire;
    const b = { ...fire, x: fire.x + 3, index: 1 };
    const out = { x: 0, y: 0 };
    const n = ringFlameCount(a);
    let hidden = 0;
    for (let i = 0; i < n; i++) {
      ringFlameSpot(a, i, n, out);
      const inB = Math.hypot(out.x - b.x, out.y - b.y) < b.radiusM;
      expect(ringFlameMarksEdge([a, b], 0, out.x, out.y)).toBe(!inB);
      if (inB) hidden++;
    }
    expect(hidden).toBeGreaterThan(0);
    expect(hidden).toBeLessThan(n);
    // alone, every flame marks the edge
    ringFlameSpot(a, 0, n, out);
    expect(ringFlameMarksEdge([a], 0, out.x, out.y)).toBe(true);
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
