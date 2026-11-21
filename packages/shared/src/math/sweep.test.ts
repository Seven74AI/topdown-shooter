import { describe, expect, it } from "vitest";
import { segmentCircleT } from "./sweep";

describe("segmentCircleT", () => {
  it("finds the entry point of a segment crossing the circle", () => {
    expect(segmentCircleT(0, 0, 10, 0, 5, 0, 1)).toBeCloseTo(0.4, 9);
  });
  it("misses a circle beside the segment", () => {
    expect(segmentCircleT(0, 0, 10, 0, 5, 1.01, 1)).toBe(-1);
  });
  it("grazes a circle at exactly its radius", () => {
    expect(segmentCircleT(0, 0, 10, 0, 5, 1, 1)).toBeCloseTo(0.5, 6);
  });
  it("returns 0 when the segment starts inside", () => {
    expect(segmentCircleT(5, 0, 10, 0, 5, 0, 1)).toBe(0);
  });
  it("ignores a circle behind the start or past the end", () => {
    expect(segmentCircleT(0, 0, 10, 0, -3, 0, 1)).toBe(-1);
    expect(segmentCircleT(0, 0, 10, 0, 13, 0, 1)).toBe(-1);
  });
  it("handles a zero-length segment", () => {
    expect(segmentCircleT(0, 0, 0, 0, 5, 0, 1)).toBe(-1);
  });
});
