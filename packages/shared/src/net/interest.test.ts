import { describe, expect, it } from "vitest";
import { VIEW_HEIGHT_M, VIEW_WIDTH_M } from "../config/constants";
import { inRect, viewRect, type Rect } from "./interest";

const MAP = { widthM: 48, heightM: 32 };
const M = 4;
const rect = (): Rect => ({ minX: 0, minY: 0, maxX: 0, maxY: 0 });

describe("viewRect", () => {
  it("centres on a player in the middle, plus the margin", () => {
    const r = viewRect(MAP, 24, 16, M, rect());
    expect(r).toEqual({ minX: 24 - 12 - M, maxX: 24 + 12 + M, minY: 16 - 6.75 - M, maxY: 16 + 6.75 + M });
    expect(r.maxX - r.minX).toBe(VIEW_WIDTH_M + 2 * M);
    expect(r.maxY - r.minY).toBe(VIEW_HEIGHT_M + 2 * M);
  });

  it("clamps near each wall like the camera (sees farther the other way)", () => {
    expect(viewRect(MAP, 1, 16, M, rect()).minX).toBe(-M); // left
    expect(viewRect(MAP, 1, 16, M, rect()).maxX).toBe(24 + M);
    expect(viewRect(MAP, 47, 16, M, rect()).maxX).toBe(48 + M); // right
    expect(viewRect(MAP, 47, 16, M, rect()).minX).toBe(24 - M);
    expect(viewRect(MAP, 24, 1, M, rect()).minY).toBe(-M); // top
    expect(viewRect(MAP, 24, 1, M, rect()).maxY).toBe(13.5 + M);
    expect(viewRect(MAP, 24, 31, M, rect()).maxY).toBe(32 + M); // bottom
    expect(viewRect(MAP, 24, 31, M, rect()).minY).toBe(32 - 13.5 - M);
  });

  it("centres a map smaller than the view", () => {
    const r = viewRect({ widthM: 20, heightM: 10 }, 2, 9, M, rect());
    expect((r.minX + r.maxX) / 2).toBe(10);
    expect((r.minY + r.maxY) / 2).toBe(5);
    expect(r.maxX - r.minX).toBe(VIEW_WIDTH_M + 2 * M);
  });

  it("inRect includes the edges", () => {
    const r = viewRect(MAP, 24, 16, M, rect());
    expect(inRect(r, r.minX, r.maxY)).toBe(true);
    expect(inRect(r, r.minX - 0.01, 16)).toBe(false);
  });
});
