import { describe, expect, it } from "vitest";
import { MAX_ATLAS_PX, frameName, isFrameName, layoutIsValid, packAtlas, tileRects, variantLetter } from "./atlasLayout";
import { BRUTE_WINDUP_FRAMES, characterSpecs, downtownSpecs, fxSpecs, ZOMBIE_FRAMES, SURVIVOR_FRAME } from "./spriteAtlas";
import { ZOMBIE_TYPES } from "@topdown/shared";

describe("atlas frame names (category_name_variant)", () => {
  it("accepts snake-case names with three or more parts", () => {
    for (const n of ["zombie_walker_a", "vehicle_car_c", "fx_blood_splat_02", "ui_btn_ready"]) expect(isFrameName(n)).toBe(true);
  });
  it("rejects anything else", () => {
    for (const n of ["zombie_walker", "Zombie_walker_a", "zombie-walker-a", "zombie__a", "_zombie_walker_a", "zombie_walker_a_", "zombie walker a"]) expect(isFrameName(n)).toBe(false);
  });
  it("frameName builds and validates; variants are letters", () => {
    expect(frameName("prop", "pump", variantLetter(0))).toBe("prop_pump_a");
    expect(variantLetter(3)).toBe("d");
    expect(() => frameName("bad_cat", "x", "a")).toThrow();
    expect(() => frameName("prop", "Pump", "a")).toThrow();
  });
});

describe("placeholder atlases follow the final layout", () => {
  const sets = { characters: characterSpecs(), downtown: downtownSpecs(), fx: fxSpecs() };
  for (const [name, specs] of Object.entries(sets)) {
    it(`${name}: every frame is category_name_variant, packed without overlap, ≤ ${MAX_ATLAS_PX}²`, () => {
      expect(specs.length).toBeGreaterThan(0);
      for (const s of specs) expect(isFrameName(s.name), s.name).toBe(true);
      const l = packAtlas(specs);
      expect(l.frames).toHaveLength(specs.length);
      expect(l.width).toBeLessThanOrEqual(MAX_ATLAS_PX);
      expect(l.height).toBeLessThanOrEqual(MAX_ATLAS_PX);
      expect(layoutIsValid(l)).toBe(true);
    });
  }
  it("Story 5.7: the Brute has its five looks (BR1–BR5) and a windup frame for each, in a frame its 1.5 r art fits", () => {
    const specs = sets.characters;
    expect(ZOMBIE_FRAMES.brute).toEqual(["zombie_brute_a", "zombie_brute_b", "zombie_brute_c", "zombie_brute_d", "zombie_brute_e"]);
    expect(BRUTE_WINDUP_FRAMES).toHaveLength(5);
    for (const f of [...ZOMBIE_FRAMES.brute, ...BRUTE_WINDUP_FRAMES]) expect(specs.find((s) => s.name === f)?.w, f).toBe(102);
  });
  it("every zombie type has its own frames (distinct silhouettes), plus the survivor", () => {
    const names = sets.characters.map((s) => s.name);
    for (const t of ZOMBIE_TYPES) {
      expect(ZOMBIE_FRAMES[t].length).toBeGreaterThan(0);
      for (const f of ZOMBIE_FRAMES[t]) expect(f.startsWith(`zombie_${t}_`)).toBe(true);
      for (const f of ZOMBIE_FRAMES[t]) expect(names).toContain(f);
    }
    expect(names).toContain(SURVIVOR_FRAME);
  });
});

describe("packAtlas", () => {
  it("wraps rows and keeps frames apart", () => {
    const specs = Array.from({ length: 40 }, (_, i) => ({ name: `fx_test_${i}`, w: 100 + (i % 7) * 13, h: 60 + (i % 5) * 9 }));
    const l = packAtlas(specs, 1024);
    expect(l.width).toBeLessThanOrEqual(1024);
    expect(l.height).toBeGreaterThan(l.frames[0]?.h ?? 0); // more than one row
    expect(layoutIsValid(l)).toBe(true);
  });
  it("refuses duplicates, bad names and oversize atlases", () => {
    expect(() => packAtlas([{ name: "fx_a_a", w: 4, h: 4 }, { name: "fx_a_a", w: 4, h: 4 }])).toThrow(/duplicate/);
    expect(() => packAtlas([{ name: "fx_a", w: 4, h: 4 }])).toThrow(/name/);
    expect(() => packAtlas([{ name: "fx_big_a", w: 3000, h: 4 }])).toThrow();
    expect(() => packAtlas(Array.from({ length: 9 }, (_, i) => ({ name: `fx_big_${i}`, w: 1000, h: 1000 })))).toThrow(/larger/);
  });
  it("layoutIsValid catches an overlap", () => {
    expect(layoutIsValid({ width: 64, height: 64, frames: [ { name: "fx_a_a", x: 2, y: 2, w: 20, h: 20 }, { name: "fx_b_a", x: 10, y: 10, w: 20, h: 20 } ] })).toBe(false);
  });
});

describe("tileRects (static city bake)", () => {
  it("covers the image exactly with tiles ≤ 2048", () => {
    for (const [w, h] of [[3072, 2048], [1536, 1024], [2544, 1696], [5000, 300]] as const) {
      const tiles = tileRects(w, h);
      let area = 0;
      for (const t of tiles) {
        expect(t.w).toBeLessThanOrEqual(MAX_ATLAS_PX);
        expect(t.h).toBeLessThanOrEqual(MAX_ATLAS_PX);
        area += t.w * t.h;
      }
      expect(area).toBe(w * h);
    }
    expect(tileRects(3072, 2048)).toHaveLength(2);
  });
});
