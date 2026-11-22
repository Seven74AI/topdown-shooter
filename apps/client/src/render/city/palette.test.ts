import { describe, expect, it } from "vitest";
import { drawGlow, drawLightmap, type CityScene } from "./drawCity";
import { DOWNTOWN_DRESSING, MAP_PX_PER_M } from "./dressing";
import { GROUND, LAMP_GLOW_R_PX, NIGHT_BY_STAGE, ROOFS, ROOF_DEFAULT, ROOF_MARGIN, hexRgb, lit, luma, nightAt, shadowLenPx, type Rgb } from "./palette";
import { ProbeContext } from "./probeCanvas";
import { blockNames, drawnWalls } from "./stageFilter";
import { downtownScene } from "./testScene";

const P = MAP_PX_PER_M;
/** Every decay variant on (both abandoned cars, both car fires): the most light near sidewalks. */
const ALL_VARIANTS = 0xff; // every candidate on at once (Story 4.7: 6 moved cars, bits 0–5; both fires, bits 6–7): the strictest light case
const sceneAt = (stage: number): CityScene => downtownScene(stage, ALL_VARIANTS);

/** Roof sample points (inside the parapet) and sidewalk points (away from the lamp bulbs). */
function probes(cs: CityScene): { roofs: { at: [number, number]; color: string }[]; walks: [number, number][] } {
  const roofs: { at: [number, number]; color: string }[] = [];
  const blocks = blockNames(cs.map);
  for (const b of drawnWalls(cs.walls, cs.cover)) {
    if (DOWNTOWN_DRESSING.pumps.includes(b.name) || DOWNTOWN_DRESSING.walls.includes(b.name) || blocks.has(b.name)) continue;
    const x0 = b.minX * P + 8;
    const y0 = b.minY * P + 8;
    const w = (b.maxX - b.minX) * P - 16;
    const h = (b.maxY - b.minY) * P - 16;
    for (let i = 0; i <= 4; i++) for (let j = 0; j <= 4; j++) roofs.push({ at: [x0 + (w * i) / 4, y0 + (h * j) / 4], color: ROOFS[b.name] ?? ROOF_DEFAULT });
  }
  const walks: [number, number][] = [];
  for (const s of cs.map.stages[0] ?? []) {
    if (s.kind !== "sidewalk") continue;
    for (let x = s.minX * P + 2; x < s.maxX * P; x += 8) {
      for (let y = s.minY * P + 2; y < s.maxY * P; y += 8) {
        if (DOWNTOWN_DRESSING.lamps.some(([lx, ly]) => Math.hypot(x - lx, y - ly) < LAMP_GLOW_R_PX + 4)) continue; // the bulb itself
        walks.push([x, y]);
      }
    }
  }
  return { roofs, walks };
}

/** Shown colours at the probes, through the REAL lightmap (multiplied) and glow (added) of a stage. */
function shown(cs: CityScene): { roof: number; walk: number } {
  const { roofs, walks } = probes(cs);
  const pts = [...roofs.map((r) => r.at), ...walks];
  const light = new ProbeContext(pts);
  const glow = new ProbeContext(pts);
  drawLightmap(light as unknown as CanvasRenderingContext2D, cs);
  drawGlow(glow as unknown as CanvasRenderingContext2D, cs);
  const wet = (c: Rgb): Rgb => [c[0] * 0.9 + 4, c[1] * 0.9 + 6, c[2] * 0.9 + 9]; // the wet layer's 10 % blue tint
  let roof = Infinity;
  roofs.forEach((r, i) => (roof = Math.min(roof, luma(lit(hexRgb(r.color), light.colorAt(i), glow.colorAt(i))))));
  let walk = -Infinity;
  walks.forEach((_, k) => {
    const i = roofs.length + k;
    walk = Math.max(walk, luma(lit(wet(hexRgb(GROUND.sidewalk)), light.colorAt(i), glow.colorAt(i))));
  });
  return { roof, walk };
}

describe("Dead City light: solid vs walkable never confuses (weakness #1), at every stage of the night", () => {
  for (let stage = 1; stage <= NIGHT_BY_STAGE.length; stage++) {
    it(`stage ${stage} (${nightAt(stage).name}): the darkest roof point beats the brightest lit sidewalk point by ${ROOF_MARGIN}`, () => {
      const { roof, walk } = shown(sceneAt(stage));
      expect(walk).toBeGreaterThan(20); // the probe really saw lamp light
      expect(roof).toBeGreaterThanOrEqual(walk + ROOF_MARGIN);
    });
  }
  it("the night darkens stage by stage (dusk → deep night): unlit asphalt gets darker", () => {
    const asphalt = (stage: number): number => {
      const c = new ProbeContext([[848, 280]]); // mid-road, far from lamps (Story 4.7: east of the north street's moved car)
      drawLightmap(c as unknown as CanvasRenderingContext2D, sceneAt(stage));
      return luma(lit(hexRgb(GROUND.asphalt), c.colorAt(0)));
    };
    for (let s = 2; s <= NIGHT_BY_STAGE.length; s++) expect(asphalt(s)).toBeLessThan(asphalt(s - 1));
  });
  it("rain: drizzle at stages 1–2, full from stage 3", () => {
    expect(nightAt(1).rain).toBeLessThan(1);
    expect(nightAt(2).rain).toBeLessThan(1);
    for (let s = 3; s <= 5; s++) expect(nightAt(s).rain).toBe(1);
    expect(nightAt(0)).toBe(nightAt(1));
    expect(nightAt(9)).toBe(nightAt(5));
  });
});

describe("palette helpers", () => {
  it("lit() multiplies, adds glow and clamps", () => {
    expect(lit([100, 100, 100], [255, 255, 255])).toEqual([100, 100, 100]);
    expect(lit([100, 100, 100], [128, 128, 128])[0]).toBeCloseTo(50.2, 1);
    expect(lit([200, 0, 0], [255, 255, 255], [100, 10, 0])).toEqual([255, 10, 0]);
  });
  it("shadow length grows with height and is capped", () => {
    expect(shadowLenPx(0.6)).toBeLessThan(shadowLenPx(1.5));
    expect(shadowLenPx(3.2)).toBeLessThan(shadowLenPx(9));
    expect(shadowLenPx(100)).toBe(shadowLenPx(50));
  });
});
