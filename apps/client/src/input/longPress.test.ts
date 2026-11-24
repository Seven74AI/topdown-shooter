import { describe, expect, it } from "vitest";
import { LongPress, longPressArmed, longPressRing, readyYields } from "./longPress";

/** Story 5.21 (AC 7, 11; D8, D9): long-press 450 ms within the 12 px slop; the ring from 150 ms; Ready yields to a building under it. */
describe("LongPress", () => {
  it("fires once after 450 ms held within the slop; heldMs feeds the ring; up / move away / reset cancel", () => {
    const l = new LongPress();
    l.down(1, 100, 100, 0, true);
    expect(l.update(449, 450)).toBe(false);
    expect(l.heldMs(300)).toBe(300);
    l.move(1, 108, 104, 12); // inside the slop
    expect(l.update(450, 450)).toBe(true);
    expect(l.update(500, 450)).toBe(false); // once
    expect(l.heldMs(500)).toBe(-1);
    expect([l.pressX, l.pressY]).toEqual([100, 100]);
    l.down(2, 50, 50, 1000, true);
    l.move(2, 70, 50, 12); // left the slop
    expect(l.update(1500, 450)).toBe(false);
    l.down(3, 50, 50, 2000, true);
    l.up(3);
    expect(l.update(2500, 450)).toBe(false);
    l.down(4, 50, 50, 3000, true);
    l.reset();
    expect([l.update(3500, 450), l.heldMs(3500)]).toEqual([false, -1]);
  });

  it("a press that started on a HUD button is not followed; another pointer's moves don't cancel it", () => {
    const l = new LongPress();
    l.down(1, 0, 0, 0, false);
    expect(l.update(1000, 450)).toBe(false);
    l.down(2, 0, 0, 0, true);
    l.move(9, 500, 500, 12);
    l.up(9);
    expect(l.update(450, 450)).toBe(true);
  });

  it("longPressRing: −1 before 150 ms, then 0 → 1 at 450 ms", () => {
    expect(longPressRing(-1, 150, 450)).toBe(-1);
    expect(longPressRing(149, 150, 450)).toBe(-1);
    expect(longPressRing(150, 150, 450)).toBe(0);
    expect(longPressRing(300, 150, 450)).toBeCloseTo(0.5, 9);
    expect(longPressRing(900, 150, 450)).toBe(1);
  });

  it("readyYields: only Ready, only when taps are on and a building is under the touch", () => {
    expect(readyYields("ready", true, true)).toBe(true);
    expect(readyYields("ready", false, true)).toBe(false);
    expect(readyYields("ready", true, false)).toBe(false);
    for (const id of ["tile0", "menu", "undo", "consumable", "swap", "confirm", null]) expect(readyYields(id, true, true)).toBe(false);
  });
});

describe("longPressArmed (review M1)", () => {
  it("a right-half touch or any mouse press arms it; a left-half touch (the move stick) never does", () => {
    expect(longPressArmed(true, 500, 800)).toBe(true);
    expect(longPressArmed(true, 400, 800)).toBe(true); // the centre line counts as the right half
    expect(longPressArmed(true, 399, 800)).toBe(false);
    expect(longPressArmed(true, 10, 800)).toBe(false);
    expect(longPressArmed(false, 10, 800)).toBe(true); // a mouse has no stick
  });
});
