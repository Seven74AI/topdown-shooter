import { describe, expect, it } from "vitest";
import type { LightSource } from "@topdown/shared";
import { pickDrawnLights } from "./floodlightLook";
import { staticKey } from "./city/stageFilter";

/** Story 5.10 (AC 11, B13): at most 8 floodlight pools drawn, nearest the camera centre, culled to the view + margin. */
const L = (x: number, y: number, id: number, kind: LightSource["kind"] = "floodlight"): LightSource => ({ kind, x, y, radiusM: 4, blackoutRadiusM: 6, buildingId: id });
const out = new Int32Array(8);
const d2 = new Float64Array(8);
const VIEW = [0, 0, 20, 10] as const; // centre (10, 5)

describe("pickDrawnLights", () => {
  it("caps at 8 (24 stacked floodlights: 8 drawn), nearest first", () => {
    const lights: LightSource[] = [];
    for (let i = 0; i < 24; i++) lights.push(L(10 + (i % 6), 5, i + 1));
    const n = pickDrawnLights(lights, ...VIEW, 2, 8, out, d2);
    expect(n).toBe(8);
    const xs = Array.from(out.subarray(0, n), (i) => (lights[i] as LightSource).x - 10);
    expect(xs).toEqual([0, 0, 0, 0, 1, 1, 1, 1]);
    for (let i = 1; i < n; i++) expect(d2[i]).toBeGreaterThanOrEqual(d2[i - 1] as number);
  });

  it("culls outside the view + margin; fires are never picked", () => {
    const lights = [L(-1.9, 5, 1), L(-2.1, 5, 2), L(21.9, 5, 3), L(10, 12.5, 4), L(10, -2.5, 5), L(10, 5, 0, "fire")];
    const n = pickDrawnLights(lights, ...VIEW, 2, 8, out, d2);
    expect(Array.from(out.subarray(0, n), (i) => (lights[i] as LightSource).buildingId).sort()).toEqual([1, 3]);
  });

  it("ties are stable by building id, whatever the list order; a smaller cap keeps the nearest", () => {
    const lights = [L(12, 5, 9), L(8, 5, 3), L(10, 7, 5), L(10, 3, 1), L(10, 5, 7)];
    const n = pickDrawnLights(lights, ...VIEW, 2, 3, out, d2);
    expect(Array.from(out.subarray(0, n), (i) => (lights[i] as LightSource).buildingId)).toEqual([7, 1, 3]);
    const rev = [...lights].reverse();
    const m = pickDrawnLights(rev, ...VIEW, 2, 3, out, d2);
    expect(Array.from(out.subarray(0, m), (i) => (rev[i] as LightSource).buildingId)).toEqual([7, 1, 3]);
  });

  it("merge (D4 fallback): a lamp within mergeM of a drawn one shares its pool; 24 stacked lamps → 1 pool (B13)", () => {
    const stacked: LightSource[] = [];
    for (let i = 0; i < 24; i++) stacked.push(L(10 + (i % 3) * 0.5, 5, i + 1));
    expect(pickDrawnLights(stacked, ...VIEW, 2, 8, out, d2, 4)).toBe(1);
    // A ring of 8 lamps 3 m round the centre (the stress layout's spacing): pairs merge at 4 m.
    const ring: LightSource[] = [];
    for (let k = 0; k < 8; k++) ring.push(L(10 + Math.cos((k / 8) * Math.PI * 2) * 3, 5 + Math.sin((k / 8) * Math.PI * 2) * 3, k + 1));
    const n = pickDrawnLights(ring, ...VIEW, 2, 8, out, d2, 4);
    expect(n).toBeGreaterThan(1);
    expect(n).toBeLessThan(8);
    for (let a = 0; a < n; a++) for (let b = a + 1; b < n; b++) {
      const p = ring[out[a] as number] as LightSource;
      const q = ring[out[b] as number] as LightSource;
      expect(Math.hypot(p.x - q.x, p.y - q.y)).toBeGreaterThanOrEqual(4); // drawn pools are never within mergeM
    }
    expect(pickDrawnLights(ring, ...VIEW, 2, 8, out, d2, 0)).toBe(8); // no merge: all 8
  });

  it("the shipped controls: 4 pools at most, merge at the light radius", async () => {
    const { loadBalance } = await import("@topdown/shared");
    const fx = loadBalance().controls.fx;
    expect([fx.maxFloodLights, fx.floodLightMergeM, fx.floodLightViewMarginM]).toEqual([4, 4, 2]);
  });

  it("none in view → 0", () => {
    expect(pickDrawnLights([L(100, 100, 1)], ...VIEW, 2, 8, out, d2)).toBe(0);
    expect(pickDrawnLights([], ...VIEW, 2, 8, out, d2)).toBe(0);
  });
});

describe("Story 5.10 review L5: no re-bake of the city when a floodlight or med station is placed or destroyed", () => {
  it("CityView's bake key (stage, obstacles.version, fire count) stays the same through placements, healing and a destroy", async () => {
    const { DOWNTOWN_MAP, TICK_DT_S, addPlayer, createWorld, damageBuilding, loadDevBalance, placeBuilding, startBuild, step } = await import("@topdown/shared");
    const world = createWorld({ balance: loadDevBalance({ zombieDamageScale: null, shopAll: true }), seed: 3, map: DOWNTOWN_MAP, systems: { waves: () => {} } });
    addPlayer(world, "p0", 24, 16);
    startBuild(world);
    const key = () => staticKey(world.obstacles.stage, world.obstacles.version, world.decay.fires.length);
    const k0 = key();
    const p = world.players.get("p0");
    if (p) p.wallet = 5000;
    expect(placeBuilding(world, "p0", { type: "floodlight", gx: 54, gy: 32, rot: 0 }).ok).toBe(true);
    expect(placeBuilding(world, "p0", { type: "med_station", gx: 42, gy: 32, rot: 0 }).ok).toBe(true);
    for (let i = 0; i < 20; i++) step(world, TICK_DT_S);
    expect(world.buildings.list).toHaveLength(2); // liveness: both stood
    expect(world.lights.list).toHaveLength(1);
    expect(key()).toBe(k0);
    damageBuilding(world, world.buildings.list[0] as never, 1e6);
    step(world, TICK_DT_S);
    expect(world.lights.list).toHaveLength(0);
    expect(key()).toBe(k0);
  });
});
