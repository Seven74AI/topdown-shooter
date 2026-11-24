import { describe, expect, it } from "vitest";
import { drawGlow, drawLightmap } from "./drawCity";
import { DOWNTOWN_DRESSING, powerOff } from "./dressing";
import { NIGHT_BY_STAGE, luma, nightAt } from "./palette";
import { ProbeContext } from "./probeCanvas";
import { lookKey, staticKey } from "./stageFilter";
import { downtownScene } from "./testScene";
import { RUINS_MATS } from "./ruinsArt";

/** Stories 6.2 / 6.4: the bake's Ruins and Collapse inputs (pure: the probe canvas, no DOM). */
const lamp = DOWNTOWN_DRESSING.lamps[0] as readonly [number, number];
const probeAt = (pts: [number, number][]) => new ProbeContext(pts);

describe("Story 6.2 D8: shop glow 30 % and neon × 0.3 at stage 4", () => {
  it("NIGHT_BY_STAGE[3] (Ruins): spillK 0.3, neonK 0.3; stages 1–3 neon full", () => {
    expect(nightAt(4).spillK).toBe(0.3);
    expect(nightAt(4).neonK).toBe(0.3);
    for (const s of [1, 2, 3]) expect(nightAt(s).neonK).toBe(1);
    expect(NIGHT_BY_STAGE).toHaveLength(5);
  });

  it("a neon sign glows 0.3 × at stage 4 in the glow layer", () => {
    const [nx, ny] = DOWNTOWN_DRESSING.neon[0] as readonly [number, number, number, number, string, number];
    const glowAt = (stage: number) => {
      const c = probeAt([[nx, ny]]);
      drawGlow(c as unknown as CanvasRenderingContext2D, downtownScene(stage));
      return luma(c.colorAt(0));
    };
    expect(glowAt(4)).toBeLessThan(glowAt(3) * 0.6);
    expect(glowAt(4)).toBeGreaterThan(0);
  });
});

describe("Story 6.4 F1: the power dies at stage 5 (lamps, shops, neon, canopy, headlights off; fires stay lit)", () => {
  it("powerOff drops every powered light from the dressing (cached), keeps the rest", () => {
    const off = powerOff(DOWNTOWN_DRESSING);
    expect(off.lamps).toEqual([]);
    expect(off.neon).toEqual([]);
    expect(off.spill).toEqual([]);
    expect([off.canopy, off.runningCar, off.flickerLamp]).toEqual(["", "", -1]);
    expect(Object.values(off.shopLight).every(([, a]) => a === 0)).toBe(true);
    expect(off.cars).toBe(DOWNTOWN_DRESSING.cars);
    expect(powerOff(DOWNTOWN_DRESSING)).toBe(off);
  });

  it("the lightmap under a streetlight is darker with the power out; a burning car still lights its ring", () => {
    const cs = downtownScene(5, 0b01001111);
    const fire = cs.fires[0];
    if (!fire) throw new Error("a fire at stage 5");
    const pts: [number, number][] = [
      [lamp[0], lamp[1]],
      [fire.x * 32, fire.y * 32],
    ];
    const on = probeAt(pts);
    const off = probeAt(pts);
    drawLightmap(on as unknown as CanvasRenderingContext2D, cs);
    drawLightmap(off as unknown as CanvasRenderingContext2D, { ...cs, powerOut: true });
    expect(luma(off.colorAt(0))).toBeLessThan(luma(on.colorAt(0)) * 0.7);
    expect(luma(off.colorAt(1))).toBeCloseTo(luma(on.colorAt(1)), 0); // the fire is not dressing
  });
});

describe("Stories 6.2 / 6.4: the bake key follows the look (wave 11 → RU4 and each endless style step rebake once)", () => {
  it("staticKey differs by material and style; lookKey is stable", () => {
    const base = staticKey(4, 7, 2, lookKey(0, -1));
    expect(staticKey(4, 7, 2, lookKey(3, -1))).not.toBe(base);
    expect(staticKey(5, 7, 2, lookKey(0, 1))).not.toBe(staticKey(5, 7, 2, lookKey(0, 2)));
    expect(staticKey(4, 7, 2, lookKey(0, -1))).toBe(base);
    const keys = new Set<number>();
    for (let m = 0; m < 4; m++) for (let s = -1; s < 4; s++) keys.add(lookKey(m, s));
    expect(keys.size).toBe(20);
  });

  it("the four materials exist (RU1–RU4) and stay in the street's greys and browns (colour rule: no red, no amber)", () => {
    expect(RUINS_MATS).toHaveLength(4);
    for (const m of RUINS_MATS) {
      for (const c of m.cols) {
        const n = parseInt(c.slice(1), 16);
        const [r, g, b] = [(n >> 16) & 255, (n >> 8) & 255, n & 255];
        expect(r - b, c).toBeLessThanOrEqual(100); // the designer's brick (RU2) is red-brown, never a saturated red
        expect(Math.max(r, g, b), c).toBeLessThan(200);
      }
    }
  });
});
