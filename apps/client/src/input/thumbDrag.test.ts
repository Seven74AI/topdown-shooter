import { describe, expect, it } from "vitest";
import { ThumbDrag, onChipRect } from "./thumbDrag";

/** Story 5.19 (AC 1, 2, D1; review M1, L3): the right-thumb drag tracker, used as the HUD uses it (`take` right after every `move`). */
describe("Story 5.19: ThumbDrag", () => {
  const out = { dx: 0, dy: 0, began: false };
  const START = 16; // 8 CSS px at dpr 2
  /** What the HUD does on a pointer move: move, then take at once. */
  const hudMove = (d: ThumbDrag, id: number, x: number, y: number) => {
    d.move(id, x, y, START);
    const any = d.take(out);
    return any ? { dx: out.dx, dy: out.dy, began: out.began } : null;
  };

  it("is not a drag until it travels more than the start distance; nothing moves before it", () => {
    const d = new ThumbDrag();
    d.down(3, 600, 200);
    expect(hudMove(d, 3, 610, 206)).toBeNull(); // 11.7 px
    expect(hudMove(d, 3, 616, 200)).toBeNull(); // exactly 16 px: still a tap
    expect(d.dragging).toBe(false);
    expect(hudMove(d, 3, 616.5, 200)).toEqual({ dx: 0, dy: 0, began: true }); // crosses: pins, no movement yet
    expect(d.dragging).toBe(true);
  });

  it("counts from the crossing (never a jump); each later move hands over its own delta once", () => {
    const d = new ThumbDrag();
    d.down(1, 600, 200);
    expect(hudMove(d, 1, 620, 200)).toEqual({ dx: 0, dy: 0, began: true });
    expect(hudMove(d, 1, 630, 195)).toEqual({ dx: 10, dy: -5, began: false });
    expect(hudMove(d, 1, 633, 190)).toEqual({ dx: 3, dy: -5, began: false });
    expect(hudMove(d, 1, 633, 190)).toBeNull(); // no movement: nothing to apply
  });

  it("ignores other pointers while one is held (one thumb drags), and a lift frees it", () => {
    const d = new ThumbDrag();
    d.down(1, 600, 200);
    d.down(2, 700, 250);
    expect(d.pointerId).toBe(1);
    expect(hudMove(d, 2, 800, 250)).toBeNull();
    expect(d.up(2)).toBe(false); // not the claimed one
    expect(d.pointerId).toBe(1);
    hudMove(d, 1, 640, 200);
    expect(d.up(1)).toBe(false); // a drag, not on the chip
    expect([d.pointerId, d.dragging]).toEqual([-1, false]);
    d.down(2, 700, 250);
    expect(d.pointerId).toBe(2);
  });

  it("review M1: on the chip, < 8 px → a chip tap on the lift; exactly 8 px → still a tap; > 8 px → a drag and no tap", () => {
    const d = new ThumbDrag();
    d.down(4, 600, 200, true);
    hudMove(d, 4, 606, 200);
    expect(d.up(4)).toBe(true);
    d.down(4, 600, 200, true);
    expect(hudMove(d, 4, 616, 200)).toBeNull();
    expect(d.up(4)).toBe(true);
    d.down(4, 600, 200, true);
    expect(hudMove(d, 4, 616.5, 200)).toEqual({ dx: 0, dy: 0, began: true }); // a normal drag: pins and nudges
    hudMove(d, 4, 650, 200);
    expect(d.up(4)).toBe(false);
    d.down(4, 600, 200, false); // off the chip: a lift without a drag is not a chip tap
    expect(d.up(4)).toBe(false);
  });

  it("reset forgets the pointer, any movement and a pending chip tap", () => {
    const d = new ThumbDrag();
    d.down(1, 600, 200, true);
    d.move(1, 640, 200, START);
    d.move(1, 660, 200, START);
    d.reset();
    expect([d.pointerId, d.dragging, d.onChip, d.take(out), d.up(1)]).toEqual([-1, false, false, false, false]);
  });

  it("onChipRect: the chip's rect with the tolerance; an empty rect never hits", () => {
    const r = { x: 100, y: 50, w: 160, h: 32 };
    expect([onChipRect(100, 50, r, 4), onChipRect(96, 46, r, 4), onChipRect(95, 60, r, 4), onChipRect(264, 86, r, 4), onChipRect(265, 60, r, 4)]).toEqual([true, true, false, true, false]);
    expect(onChipRect(0, 0, { x: 0, y: 0, w: 0, h: 0 }, 4)).toBe(false);
  });
});
