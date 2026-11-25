import { describe, expect, it } from "vitest";
import { buildingStats, footprint, loadBalance } from "@topdown/shared";
import { ATLAS_BUILDINGS, BUILDINGS_PX_PER_M, FRONT_H_M, FRONT_W_M, SIDE_H_M, SIDE_W_M, STANDING_VARIANTS, buildingsAtlasSpecs, isStanding, standingFrame, wallFrame, wallVariant } from "./buildingsAtlas";
import { FRONT_BASE_Y, SIDE_C } from "./barricadeArt";
import { STAND_DEPTH, STAND_DEPTH_SPAN, standDepth } from "../barricadeLook";
import { MAX_ATLAS_PX, isFrameName, packAtlas } from "./atlasLayout";

const balance = loadBalance();
const WALLS = ["wood_barricade", "reinforced_barricade", "metal_barricade"] as const;

describe("photoreal group 3: standing barricades (one picture per rotation, variants, depth)", () => {
  it("only the three barricades stand; every trap and prop stays a turned top-down frame", () => {
    for (const t of WALLS) expect(isStanding(t)).toBe(true);
    for (const t of ["spike_trap", "mine", "bear_trap", "floodlight", "med_station", "auto_turret"]) {
      expect(isStanding(t)).toBe(false);
      expect(standingFrame(t, 0, 0)).toBeNull();
    }
  });

  it("the rotation picks the face: rot 0 outside, rot 2 inside, rot 1 / 3 the side with the braces east / west", () => {
    expect(standingFrame("wood_barricade", 0, 0)?.frame).toBe(wallFrame("wood", "out", 0));
    expect(standingFrame("wood_barricade", 2, 0)?.frame).toBe(wallFrame("wood", "in", 0));
    expect(standingFrame("reinforced_barricade", 1, 1)?.frame).toBe(wallFrame("rf", "sidee", 1));
    expect(standingFrame("metal_barricade", 3, 1)?.frame).toBe(wallFrame("mt", "sidew", 1));
    expect(standingFrame("metal_barricade", 7, 9)?.frame).toBe(wallFrame("mt", "sidew", STANDING_VARIANTS - 1)); // clamped
  });

  it("each picture's origin is its footprint centre, and the picture rises above the footprint, never below it", () => {
    for (const t of WALLS) {
      const stats = buildingStats(balance, t);
      if (!stats) throw new Error(t);
      for (const rot of [0, 1, 2, 3]) {
        const st = standingFrame(t, rot, 0);
        if (!st) throw new Error(t);
        const fp = footprint(stats, 0, 0, rot, { minX: 0, minY: 0, maxX: 0, maxY: 0 });
        const fw = fp.maxX - fp.minX;
        const fh = fp.maxY - fp.minY;
        expect(st.texture).toBe(ATLAS_BUILDINGS);
        expect(st.wM, `${t} rot ${rot}: as wide as the footprint (or its props' room)`).toBeGreaterThanOrEqual(fw - 1e-9);
        // below the origin: at most the footprint's near half plus the foot clutter's 0.1 m
        expect(st.hM * (1 - st.originY), `${t} rot ${rot}: nothing far below the footprint`).toBeLessThanOrEqual(fh / 2 + 0.1 + 1e-9);
        expect(st.hM * st.originY, `${t} rot ${rot}: the face rises above it`).toBeGreaterThan(fh / 2);
      }
    }
    expect(FRONT_BASE_Y).toBeGreaterThan(0);
    expect(SIDE_C).toBeGreaterThan(0);
  });

  it("every picture is in the atlas at its size; the atlas still fits 2048²", () => {
    const specs = buildingsAtlasSpecs();
    for (const st of ["wood", "rf", "mt"] as const) {
      for (let v = 0; v < STANDING_VARIANTS; v++) {
        for (const [view, w, h] of [["out", FRONT_W_M, FRONT_H_M], ["in", FRONT_W_M, FRONT_H_M], ["sidee", SIDE_W_M, SIDE_H_M], ["sidew", SIDE_W_M, SIDE_H_M]] as const) {
          const name = wallFrame(st, view, v);
          expect(isFrameName(name)).toBe(true);
          expect(specs.find((s) => s.name === name)).toEqual({ name, w: Math.round(w * BUILDINGS_PX_PER_M), h: Math.round(h * BUILDINGS_PX_PER_M) });
        }
      }
    }
    const layout = packAtlas(specs);
    expect(layout.width).toBeLessThanOrEqual(MAX_ATLAS_PX);
    expect(layout.height).toBeLessThanOrEqual(MAX_ATLAS_PX);
  });

  it("the variant is fixed by the spot (the same on every client) and both variants occur along a line", () => {
    expect(wallVariant(12.5, 30)).toBe(wallVariant(12.5, 30));
    const seen = new Set<number>();
    for (let x = 0; x < 40; x += 2) {
      const v = wallVariant(x, 7.5);
      expect(v).toBeGreaterThanOrEqual(0);
      expect(v).toBeLessThan(STANDING_VARIANTS);
      seen.add(v);
    }
    expect(seen.size).toBe(STANDING_VARIANTS);
  });

  it("depth: above the bodies (10), below the heal plus (11); nearer the camera draws over farther", () => {
    expect(standDepth(0)).toBe(STAND_DEPTH);
    expect(standDepth(5)).toBeLessThan(standDepth(6));
    expect(standDepth(1e6)).toBeCloseTo(STAND_DEPTH + STAND_DEPTH_SPAN);
    expect(standDepth(-5)).toBe(STAND_DEPTH);
    expect(STAND_DEPTH).toBeGreaterThan(10.3);
    expect(STAND_DEPTH + STAND_DEPTH_SPAN).toBeLessThan(11);
  });
});
