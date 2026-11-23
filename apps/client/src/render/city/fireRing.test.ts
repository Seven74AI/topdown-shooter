import { describe, expect, it } from "vitest";
import { circleInFire, loadBalance, type FireRecord } from "@topdown/shared";
import {
  FIRE_EMBERS,
  RING_FLAMES_MAX,
  RING_FLAME_CORE_FRAC,
  RING_FLAME_SPACING_M,
  damageTickPulse,
  emberSpot,
  fireRingRadiusM,
  fireRingWidthM,
  ringFlameCentreRadiusM,
  ringFlameCount,
  ringFlameMaxCoreM,
  ringFlameSizeM,
  ringFlameMarksEdge,
  ringFlameSpot,
  strokeFireRings,
} from "./fireRing";

import objectsJson from "../../../public/assets/atlases/objects.json";

const balance = loadBalance();
const objectsMeta = (objectsJson as unknown as { meta: { coreFrac: number } }).meta;
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

describe("Story 4.11 (F6): the circle of small flames ends exactly at the damage edge", () => {
  const out = { x: 0, y: 0 };
  const coreAt = (flick: number, pulse: number) => RING_FLAME_CORE_FRAC * ringFlameSizeM(flick, pulse);

  it("review fix: every flame's visible core, at its largest (full flicker + damage-tick swell), ends within 2 cm of R, never past it", () => {
    for (const r of [1, balance.decay.fire.radiusM, 3.5]) {
      const f = { ...fire, radiusM: r };
      const n = ringFlameCount(f);
      let sx = 0;
      let sy = 0;
      for (let i = 0; i < n; i++) {
        ringFlameSpot(f, i, n, out);
        const d = Math.hypot(out.x - f.x, out.y - f.y);
        let maxOuter = 0;
        for (const flick of [0, 0.5, 1]) for (const pulse of [0, 0.5, 1]) maxOuter = Math.max(maxOuter, d + coreAt(flick, pulse));
        expect(maxOuter).toBeLessThanOrEqual(fireRingRadiusM(f) + 0.02);
        expect(maxOuter).toBeGreaterThanOrEqual(fireRingRadiusM(f) - 0.02); // it still marks the edge
        sx += out.x - f.x;
        sy += out.y - f.y;
      }
      expect(Math.hypot(sx, sy) / n).toBeLessThan(1e-9); // evenly spread round the car
    }
  });

  it("review fix: the flames still close the ring (gap between neighbouring cores ≤ 0.8 m at their smallest)", () => {
    for (const r of [1, balance.decay.fire.radiusM, 3.5]) {
      const f = { ...fire, radiusM: r };
      const n = ringFlameCount(f);
      const chord = 2 * ringFlameCentreRadiusM(f) * Math.sin(Math.PI / n);
      expect(chord - 2 * coreAt(0, 0)).toBeLessThanOrEqual(0.8);
    }
  });

  it("the core fraction covers the art: the build script's measured coreFrac (objects.json) ≤ RING_FLAME_CORE_FRAC", () => {
    expect(objectsMeta.coreFrac).toBeGreaterThan(0);
    expect(objectsMeta.coreFrac).toBeLessThanOrEqual(RING_FLAME_CORE_FRAC);
  });

  it("your body touches the flames = you burn: a body reaching a flame's outer core edge is inside the zone (circleInFire), one just short is not", () => {
    const n = ringFlameCount(fire);
    const core = ringFlameMaxCoreM();
    for (const r of [balance.player.radiusM, ...Object.values(balance.zombies.types).map((z) => z.radiusM)]) {
      for (let i = 0; i < n; i++) {
        ringFlameSpot(fire, i, n, out);
        const d = Math.hypot(out.x - fire.x, out.y - fire.y);
        const ux = (out.x - fire.x) / d;
        const uy = (out.y - fire.y) / d;
        const ex = out.x + ux * core; // the flame's outer visible edge
        const ey = out.y + uy * core;
        expect(circleInFire([fire], ex + ux * (r - 1e-3), ey + uy * (r - 1e-3), r)).toBe(true);
        expect(circleInFire([fire], ex + ux * (r + 0.02 + 1e-3), ey + uy * (r + 0.02 + 1e-3), r)).toBe(false);
      }
    }
  });

  it("flame count follows the circumference, capped (pool size per fire)", () => {
    expect(ringFlameCount(fire)).toBe(Math.round((2 * Math.PI * ringFlameCentreRadiusM(fire)) / RING_FLAME_SPACING_M));
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
