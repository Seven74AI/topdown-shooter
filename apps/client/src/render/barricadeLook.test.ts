import { describe, expect, it } from "vitest";
import { buildingStats, footprint, loadBalance, type Box } from "@topdown/shared";
import { BARRICADE_DAMAGE_DARKEN, BARRICADE_NIGHT_DARKEN, DEFAULT_BARRICADE_SPRITES, barricadePoolSize, barricadeTint, barricadeTransform, framePointToWorld } from "./barricadeLook";
import { darken } from "./buildingLook";

const balance = loadBalance();
const stats = buildingStats(balance, "wood_barricade");

describe("Story 4.11: the wood barricade art turns with its placement", () => {
  it("at every rot the turned frame covers exactly the footprint (long side along the long side)", () => {
    if (!stats) throw new Error("no wood_barricade");
    const box: Box = { minX: 0, minY: 0, maxX: 0, maxY: 0 };
    const t = { x: 0, y: 0, angle: 0, w: 0, h: 0 };
    const p = { x: 0, y: 0 };
    for (const rot of [0, 1, 2, 3]) {
      footprint(stats, 10, 7, rot, box);
      barricadeTransform({ ...box, rot }, t);
      expect(t.w).toBeCloseTo(stats.widthM, 9); // stakes along the frame's x = the footprint's long side
      expect(t.h).toBeCloseTo(stats.depthM, 9);
      let minX = Infinity;
      let minY = Infinity;
      let maxX = -Infinity;
      let maxY = -Infinity;
      for (const [lx, ly] of [
        [-t.w / 2, -t.h / 2],
        [t.w / 2, -t.h / 2],
        [t.w / 2, t.h / 2],
        [-t.w / 2, t.h / 2],
      ] as const) {
        framePointToWorld(t, lx, ly, p);
        minX = Math.min(minX, p.x);
        minY = Math.min(minY, p.y);
        maxX = Math.max(maxX, p.x);
        maxY = Math.max(maxY, p.y);
      }
      expect([minX, minY, maxX, maxY].map((v) => +v.toFixed(9))).toEqual([box.minX, box.minY, box.maxX, box.maxY]);
    }
  });

  it("the struts (the frame's −y side) point north, east, south, west for rot 0–3", () => {
    if (!stats) throw new Error("no wood_barricade");
    const box: Box = { minX: 0, minY: 0, maxX: 0, maxY: 0 };
    const t = { x: 0, y: 0, angle: 0, w: 0, h: 0 };
    const p = { x: 0, y: 0 };
    const want = [
      [0, -1],
      [1, 0],
      [0, 1],
      [-1, 0],
    ];
    for (const rot of [0, 1, 2, 3]) {
      footprint(stats, 4, 4, rot, box);
      barricadeTransform({ ...box, rot }, t);
      framePointToWorld(t, 0, -1, p);
      expect([+(p.x - t.x).toFixed(9), +(p.y - t.y).toFixed(9)]).toEqual(want[rot]);
    }
  });

  it("tint: night-darkened when whole, darker with damage, never lighter (the 3.5 damaged look kept)", () => {
    expect(barricadeTint(1)).toBe(darken(0xffffff, BARRICADE_NIGHT_DARKEN));
    expect(barricadeTint(0)).toBe(darken(darken(0xffffff, BARRICADE_NIGHT_DARKEN), BARRICADE_DAMAGE_DARKEN));
    let last = 256;
    for (const f of [1, 0.75, 0.5, 0.25, 0]) {
      const g = (barricadeTint(f) >> 8) & 0xff;
      expect(g).toBeLessThan(last);
      last = g;
    }
    expect(barricadeTint(2)).toBe(barricadeTint(1));
  });
});

describe("Story 4.11 review fix L1: the barricade pool is sized from balance", () => {
  it("holds every player's allowance for any legal maxPerPlayer (7 → 28, the schema's 64 → 256) and the default without a balance", () => {
    expect(barricadePoolSize(balance.buildings.maxPerPlayer, 4)).toBe(balance.buildings.maxPerPlayer * 4);
    expect(barricadePoolSize(7, 4)).toBe(28);
    expect(barricadePoolSize(64, 4)).toBe(256);
    expect(barricadePoolSize(undefined, 4)).toBe(DEFAULT_BARRICADE_SPRITES);
  });
});
