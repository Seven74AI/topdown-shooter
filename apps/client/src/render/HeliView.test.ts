import { describe, expect, it } from "vitest";
import { DOWNTOWN_MAP, loadBalance } from "@topdown/shared";
import { DESCEND_S, EXTRACT_FLY_S, LIFT_S, evacPadOf, heliPose, type HeliPose } from "./heliPose";

/** Story 6.11 (AC 9): the helicopter's pose, pure; the pad from the map. */
const pose = (): HeliPose => ({ phase: "gone", dx: 0, dy: 0, scale: 1, alpha: 0 });

describe("heliPose", () => {
  it("gone → descending over 2 s → landed → lifting (Stay) / extracting (Extract) → gone", () => {
    const p = pose();
    expect(heliPose(0, -1, -1, false, p).phase).toBe("gone");
    expect(heliPose(1, 0, -1, false, p).phase).toBe("descending");
    expect(p.scale).toBeGreaterThan(1);
    expect(heliPose(DESCEND_S + 0.01, 0, -1, false, p)).toMatchObject({ phase: "landed", dx: 0, dy: 0, scale: 1, alpha: 1 });
    expect(heliPose(10.5, 0, 10, false, p).phase).toBe("lifting");
    expect(heliPose(10 + LIFT_S, 0, 10, false, p).phase).toBe("gone");
    expect(heliPose(11, 0, 10, true, p).phase).toBe("extracting");
    expect(p.dx).toBeGreaterThan(0); // east
    expect(p.dy).toBeLessThan(0); // north
    expect(heliPose(10 + EXTRACT_FLY_S, 0, 10, true, p).phase).toBe("gone");
  });

  it("a late wake (opened long ago) sees it landed, no replayed descent", () => {
    expect(heliPose(100, 0, -1, false, pose()).phase).toBe("landed");
  });
});

describe("evacPadOf", () => {
  it("the map's evac_pad event spot (6.8's layer) when present, else the map centre (Downtown (24, 16))", () => {
    expect(evacPadOf(DOWNTOWN_MAP)).toEqual(
      (DOWNTOWN_MAP as unknown as { eventSpots?: { name: string; x: number; y: number }[] }).eventSpots?.find((s) => s.name === "evac_pad") ?? { x: 24, y: 16 },
    );
    expect(evacPadOf({ ...DOWNTOWN_MAP, eventSpots: [{ name: "evac_pad", x: 20, y: 12 }] } as unknown as typeof DOWNTOWN_MAP)).toEqual({ x: 20, y: 12 });
  });
});

describe("the pad on Downtown (random-city CCP: the pad is map data)", () => {
  it("the pad (and its 3 m ring) is inside the map and its centre clear of every map box (solids and cover)", () => {
    const m = DOWNTOWN_MAP;
    const r = loadBalance().waves.evac.padRadiusM;
    const at = evacPadOf(m);
    expect(at.x - r).toBeGreaterThanOrEqual(0);
    expect(at.y - r).toBeGreaterThanOrEqual(0);
    expect(at.x + r).toBeLessThanOrEqual(m.widthM);
    expect(at.y + r).toBeLessThanOrEqual(m.heightM);
    const inside = (b: { minX: number; minY: number; maxX: number; maxY: number }) => at.x > b.minX && at.x < b.maxX && at.y > b.minY && at.y < b.maxY;
    expect(m.solids.filter(inside).map((b) => b.name)).toEqual([]);
    expect(m.cover.filter(inside).map((b) => b.name)).toEqual([]);
  });
});
