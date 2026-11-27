import { describe, expect, it } from "vitest";
import { DOWNTOWN_MAP, loadBalance } from "@topdown/shared";
import { DESCEND_S, EXTRACT_FLY_S, FLY_OUT_PAST_EDGE_M, LIFT_S, evacPadOf, flyOutDxM, heliPose, type HeliPose } from "./heliPose";

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

  it("Story 12.2: the fly-out lasts evac.flyOutS and ends past the map's east edge; the descent matches evac.descendS", () => {
    const b = loadBalance();
    expect(DESCEND_S).toBe(b.waves.evac.descendS); // the sim boards nobody before the drawn landing
    const pad = evacPadOf(DOWNTOWN_MAP);
    const dx = flyOutDxM(DOWNTOWN_MAP, pad.x);
    expect(pad.x + dx).toBe(DOWNTOWN_MAP.widthM + FLY_OUT_PAST_EDGE_M);
    const p = pose();
    const fly = b.waves.evac.flyOutS;
    expect(heliPose(10 + fly / 2, 0, 10, true, p, fly, dx).phase).toBe("extracting");
    expect(p.dx).toBeCloseTo(dx / 2, 5); // smoothstep at half time
    expect(heliPose(10 + fly - 0.01, 0, 10, true, p, fly, dx).phase).toBe("extracting");
    expect(p.dx).toBeGreaterThan(dx * 0.99);
    expect(heliPose(10 + fly, 0, 10, true, p, fly, dx).phase).toBe("gone");
    // a phone that wakes mid-fly-out: left at the server's lift-off time, it lands in the right moment
    expect(heliPose(100, 0, 100 - fly / 2, true, p, fly, dx).dx).toBeCloseTo(dx / 2, 5);
  });

  it("a late wake (opened long ago) sees it landed, no replayed descent", () => {
    expect(heliPose(100, 0, -1, false, pose()).phase).toBe("landed");
  });
});

describe("evacPadOf", () => {
  it("the map's evac_pad event spot (6.8's events layer: Downtown (24, 15.9)), else the map centre", () => {
    expect(evacPadOf(DOWNTOWN_MAP)).toEqual({ x: 24, y: 15.9 });
    expect(evacPadOf({ ...DOWNTOWN_MAP, eventSpots: [{ name: "pad_b", kind: "evac_pad", x: 20, y: 12, minStage: 1 }] } as unknown as typeof DOWNTOWN_MAP)).toEqual({ x: 20, y: 12 });
    expect(evacPadOf({ ...DOWNTOWN_MAP, eventSpots: [] })).toEqual({ x: 24, y: 16 });
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
