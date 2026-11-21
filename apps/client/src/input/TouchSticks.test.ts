import { describe, expect, it } from "vitest";
import { TouchSticks } from "./TouchSticks";

const W = 800;

describe("TouchSticks", () => {
  it("spawns the move stick where a left-half touch lands and clears it on lift", () => {
    const s = new TouchSticks(100, 0.1);
    s.pointerDown(1, 120, 300, W);
    expect(s.move).toMatchObject({ originX: 120, originY: 300 });
    s.pointerMove(1, 220, 300);
    expect(s.moveVector().x).toBeCloseTo(1, 9);
    s.pointerUp(1);
    expect(s.move).toBeNull();
    expect(s.moveVector().magnitude).toBe(0);
  });

  it("ignores right-half touches for the move stick", () => {
    const s = new TouchSticks(100, 0.1);
    s.pointerDown(2, 600, 300, W);
    expect(s.move).toBeNull();
  });

  it("keeps the move stick owned by its pointer when it slides into the right half", () => {
    const s = new TouchSticks(100, 0.1);
    s.pointerDown(1, 300, 300, W);
    s.pointerMove(1, 700, 300);
    s.pointerDown(2, 600, 100, W); // a second thumb on the right does not steal it
    s.pointerMove(2, 650, 100);
    expect(s.move?.pointerId).toBe(1);
    expect(s.moveVector().x).toBeCloseTo(1, 9);
  });

  it("ignores a second left-half touch while the stick is held", () => {
    const s = new TouchSticks(100, 0.1);
    s.pointerDown(1, 100, 300, W);
    s.pointerDown(3, 50, 50, W);
    expect(s.move?.pointerId).toBe(1);
    s.pointerUp(3);
    expect(s.move?.pointerId).toBe(1);
  });

  it("reset releases the stick and ignores later events from the old pointer", () => {
    const s = new TouchSticks(100, 0.1);
    s.pointerDown(1, 100, 300, W);
    s.reset();
    expect(s.move).toBeNull();
    s.pointerMove(1, 200, 300);
    s.pointerUp(1);
    expect(s.move).toBeNull();
    expect(s.moveVector().magnitude).toBe(0);
  });

  it("ignores move and up events with no active stick", () => {
    const s = new TouchSticks(100, 0.1);
    expect(() => {
      s.pointerMove(9, 10, 10);
      s.pointerUp(9);
    }).not.toThrow();
    expect(s.move).toBeNull();
  });
});
