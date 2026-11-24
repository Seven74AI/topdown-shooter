import { describe, expect, it } from "vitest";
import { WHEEL_MIN_GAP_MS, WheelRotate } from "./wheelRotate";

describe("Story 5.23: wheel → rotation steps (AC 10, D18; B4)", () => {
  it("one notch = one step; down clockwise, up counter-clockwise", () => {
    const w = new WheelRotate();
    expect(w.wheel(100, 0, 0)).toBe(1);
    expect(w.wheel(-100, 0, 1000)).toBe(-1);
    expect(w.wheel(3, 1, 2000)).toBe(1); // Firefox: one notch = 3 lines
  });
  it("tiny trackpad deltas add up; a direction change starts over", () => {
    const w = new WheelRotate();
    for (let i = 0; i < 9; i++) expect(w.wheel(11, 0, i)).toBe(0);
    expect(w.wheel(11, 0, 10)).toBe(1);
    expect(w.wheel(60, 0, 500)).toBe(0);
    expect(w.wheel(-60, 0, 510)).toBe(0); // reversed: the 60 is dropped
    expect(w.wheel(-60, 0, 520)).toBe(-1);
  });
  it("a fast spin turns at most once per 150 ms (the step's remainder is dropped)", () => {
    const w = new WheelRotate();
    let steps = 0;
    for (let t = 0; t < 300; t += 10) steps += Math.abs(w.wheel(400, 0, t));
    expect(steps).toBe(Math.ceil(300 / WHEEL_MIN_GAP_MS));
  });
  it("reset drops a partial notch; zero / NaN deltas do nothing", () => {
    const w = new WheelRotate();
    w.wheel(90, 0, 0);
    w.reset();
    expect(w.wheel(20, 0, 10)).toBe(0);
    expect(w.wheel(0, 0, 20)).toBe(0);
    expect(w.wheel(Number.NaN, 0, 30)).toBe(0);
  });
});
