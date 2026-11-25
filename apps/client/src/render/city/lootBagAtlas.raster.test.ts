/**
 * Story 7.12 (AC 6, 7-UI-6): the loot bag atlas, painted with a real Canvas 2D in node (`@napi-rs/canvas`,
 * tests only): every look is drawn and carries the shared pick-up signal (a white rim round it), LB6 is
 * visibly smaller than the 6.9 supply crate (1 m) and has no green, the ring is a ring, the atlas is
 * within 2048². Also writes nothing: pixels only.
 */
import { createCanvas } from "@napi-rs/canvas";
import { describe, expect, it } from "vitest";
import { LOOT_ATLAS_H, LOOT_ATLAS_W, LOOT_PX_PER_M, LOOT_RING_FRAME, lootAtlasFrames, paintLootAtlas } from "./lootBagAtlas";

const make = (w: number, h: number): HTMLCanvasElement => createCanvas(Math.max(1, w), Math.max(1, h)) as unknown as HTMLCanvasElement;
const atlas = make(LOOT_ATLAS_W, LOOT_ATLAS_H);
const g = atlas.getContext("2d") as CanvasRenderingContext2D;
paintLootAtlas(g, 0.8, make);
const px = g.getImageData(0, 0, LOOT_ATLAS_W, LOOT_ATLAS_H).data;
const at = (x: number, y: number) => {
  const i = (y * LOOT_ATLAS_W + x) * 4;
  return [px[i] ?? 0, px[i + 1] ?? 0, px[i + 2] ?? 0, px[i + 3] ?? 0] as const;
};

describe("Story 7.12: the loot bag atlas (raster)", () => {
  const frames = lootAtlasFrames();
  it("fits a 2048² atlas; frames don't overlap", () => {
    expect(LOOT_ATLAS_W).toBeLessThanOrEqual(2048);
    expect(LOOT_ATLAS_H).toBeLessThanOrEqual(2048);
    for (const a of frames) {
      expect(a.x + a.w).toBeLessThanOrEqual(LOOT_ATLAS_W);
      expect(a.y + a.h).toBeLessThanOrEqual(LOOT_ATLAS_H);
      for (const b of frames) if (a !== b) expect(a.x < b.x + b.w && b.x < a.x + a.w && a.y < b.y + b.h && b.y < a.y + a.h).toBe(false);
    }
  });

  it("each of the five looks is drawn, with a white rim light round it (the shared pick-up signal)", () => {
    for (const f of frames.slice(0, 5)) {
      let solid = 0;
      let rim = 0;
      for (let y = f.y; y < f.y + f.h; y++)
        for (let x = f.x; x < f.x + f.w; x++) {
          const [r, gg, b, a] = at(x, y);
          if (a > 240) solid++;
          else if (a > 40 && r > 200 && gg > 200 && b > 200) rim++; // semi-transparent white: the rim halo
        }
      expect(solid, f.name).toBeGreaterThan(2000);
      expect(rim, f.name).toBeGreaterThan(300);
    }
  });

  it("LB6 (the field case) is visibly smaller than the 1 m supply crate and has no green", () => {
    const f = frames[2] as (typeof frames)[number];
    let minX = Infinity;
    let maxX = -Infinity;
    let minY = Infinity;
    let maxY = -Infinity;
    let green = 0;
    for (let y = f.y; y < f.y + f.h; y++)
      for (let x = f.x; x < f.x + f.w; x++) {
        const [r, gg, b, a] = at(x, y);
        if (a < 250) continue;
        minX = Math.min(minX, x);
        maxX = Math.max(maxX, x);
        minY = Math.min(minY, y);
        maxY = Math.max(maxY, y);
        if (gg > r + 25 && gg > b + 25) green++;
      }
    expect((maxX - minX) / LOOT_PX_PER_M).toBeLessThan(0.75);
    expect((maxY - minY) / LOOT_PX_PER_M).toBeLessThan(0.75);
    expect(green).toBe(0);
  });

  it("the ground ring is a soft white ring (clear middle, bright band)", () => {
    const f = frames.find((x) => x.name === LOOT_RING_FRAME) as (typeof frames)[number];
    const cx = f.x + f.w / 2;
    const cy = f.y + f.h / 2;
    expect(at(cx, cy)[3]).toBeLessThan(20);
    const r = Math.round((f.w / 2 - 6) * 0.95);
    const [rr, gg, bb, a] = at(cx + r, cy);
    expect(a).toBeGreaterThan(180);
    expect(Math.min(rr, gg, bb)).toBeGreaterThan(240);
  });
});
