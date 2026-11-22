import { describe, expect, it } from "vitest";
import { TAP_MAX_MS, TapDetector } from "./tapDetector";

const SLOP = 24;

describe("TapDetector (Story 3.7)", () => {
  it("a short, still press is a tap, reported at its down point", () => {
    const t = new TapDetector();
    t.down(1, 100, 200, 1000, true);
    t.move(1, 105, 203, SLOP);
    expect(t.up(1, 106, 204, 1000 + TAP_MAX_MS, SLOP)).toBe(true);
    expect([t.tapX, t.tapY]).toEqual([100, 200]);
    expect(t.up(1, 106, 204, 1000 + TAP_MAX_MS, SLOP)).toBe(false); // once per press
  });

  it("a long press, a drag (a stick being used) or a lift outside the slop is not a tap", () => {
    const t = new TapDetector();
    t.down(1, 100, 200, 0, true);
    expect(t.up(1, 100, 200, TAP_MAX_MS + 1, SLOP)).toBe(false);
    t.down(2, 100, 200, 0, true);
    t.move(2, 130, 200, SLOP);
    t.move(2, 100, 200, SLOP); // back again: still a drag
    expect(t.up(2, 100, 200, 50, SLOP)).toBe(false);
    t.down(3, 100, 200, 0, true);
    expect(t.up(3, 100, 230, 50, SLOP)).toBe(false);
  });

  it("a press on a HUD button is never a tap; another pointer's lift is ignored; a second finger takes over", () => {
    const t = new TapDetector();
    t.down(1, 100, 200, 0, false);
    expect(t.up(1, 100, 200, 10, SLOP)).toBe(false);
    t.down(1, 100, 200, 0, true);
    expect(t.up(2, 100, 200, 10, SLOP)).toBe(false);
    t.down(2, 400, 200, 5, true); // the aim thumb comes down: it is followed now
    expect(t.up(1, 100, 200, 10, SLOP)).toBe(false);
    expect(t.up(2, 400, 200, 20, SLOP)).toBe(true);
  });

  it("reset forgets the press", () => {
    const t = new TapDetector();
    t.down(1, 100, 200, 0, true);
    t.reset();
    expect(t.up(1, 100, 200, 10, SLOP)).toBe(false);
  });
});
