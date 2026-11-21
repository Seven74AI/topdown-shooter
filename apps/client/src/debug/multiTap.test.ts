import { describe, expect, it } from "vitest";
import { MultiTapDetector } from "./multiTap";

describe("MultiTapDetector (three-finger tap)", () => {
  it("fires when three touches start within 300 ms", () => {
    const d = new MultiTapDetector();
    expect(d.touchStart(1000, 1)).toBe(false);
    expect(d.touchStart(1100, 2)).toBe(false);
    expect(d.touchStart(1290, 3)).toBe(true);
  });

  it("does not fire when the touches are spread over more than 300 ms", () => {
    const d = new MultiTapDetector();
    d.touchStart(0, 1);
    d.touchStart(200, 2);
    expect(d.touchStart(301, 3)).toBe(false);
  });

  it("does not fire for two sticks plus a later tap after a finger lifted", () => {
    const d = new MultiTapDetector();
    d.touchStart(0, 1);
    d.touchStart(50, 2);
    expect(d.touchStart(100, 2)).toBe(false); // only two fingers down
  });

  it("fires once per tap (a fourth finger does not toggle back)", () => {
    const d = new MultiTapDetector();
    d.touchStart(0, 1);
    d.touchStart(10, 2);
    expect(d.touchStart(20, 3)).toBe(true);
    expect(d.touchStart(30, 4)).toBe(false);
    d.touchStart(1000, 1);
    d.touchStart(1010, 2);
    expect(d.touchStart(1020, 3)).toBe(true);
  });
});
