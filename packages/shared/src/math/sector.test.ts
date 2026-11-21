import { describe, expect, it } from "vitest";
import { circleOverlapsSector } from "./sector";
import { DEG_TO_RAD } from "./vec";

// Machete-like sector from the origin facing +x: reach 1.8 m, 110° arc (±55°).
const REACH = 1.8;
const HALF = 55 * DEG_TO_RAD;
const COS = Math.cos(HALF);
const SIN = Math.sin(HALF);
const R = 0.35;

/** Does a circle of radius r centered at `deg` and `dist` from the origin overlap the sector? */
const at = (deg: number, dist: number, r = R, dirDeg = 0) =>
  circleOverlapsSector(
    Math.cos(deg * DEG_TO_RAD) * dist,
    Math.sin(deg * DEG_TO_RAD) * dist,
    r,
    0,
    0,
    Math.cos(dirDeg * DEG_TO_RAD),
    Math.sin(dirDeg * DEG_TO_RAD),
    REACH,
    COS,
    SIN,
  );

describe("circleOverlapsSector", () => {
  it("measures reach to the circle's edge (±0.01 m)", () => {
    expect(at(0, REACH + R - 0.01)).toBe(true);
    expect(at(0, REACH + R + 0.01)).toBe(false);
  });

  it("hits a circle centered just outside the half-angle (56°)", () => {
    expect(at(56, 1.5)).toBe(true);
  });

  it("hits a circle centered at 60° whose body crosses the 55° edge", () => {
    // Distance from the 55° edge: 1.2 · sin 5° ≈ 0.105 m < 0.35 m.
    expect(at(60, 1.2)).toBe(true);
    expect(at(-60, 1.2)).toBe(true); // both edges
  });

  it("misses a circle clearly outside the arc", () => {
    // Distance from the 55° edge: 1.2 · sin 25° ≈ 0.507 m > 0.35 m.
    expect(at(80, 1.2)).toBe(false);
    expect(at(-80, 1.2)).toBe(false);
  });

  it("misses a circle behind the origin", () => {
    expect(at(180, 1.0)).toBe(false);
    expect(at(120, 0.8)).toBe(false);
  });

  it("hits a circle that contains the origin, whatever its direction", () => {
    expect(at(180, 0.2)).toBe(true);
  });

  it("near an edge, reach still counts to the circle's edge", () => {
    // Centered on the 55° edge, just beyond the end of the edge segment.
    expect(at(55, REACH + R - 0.01)).toBe(true);
    expect(at(55, REACH + R + 0.01)).toBe(false);
    // Outside the angle and past the end of the edge segment: the corner is out of reach.
    expect(at(62, REACH + R - 0.01)).toBe(false);
  });

  it("follows the sector's direction", () => {
    expect(at(90, 1.2, R, 90)).toBe(true);
    expect(at(0, 1.2, R, 180)).toBe(false);
  });
});
