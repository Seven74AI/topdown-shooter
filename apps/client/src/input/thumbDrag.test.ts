import { describe, expect, it } from "vitest";
import { ThumbDrag } from "./thumbDrag";

/** Story 5.19 (AC 1, 2, D1): the right-thumb drag tracker. */
describe("Story 5.19: ThumbDrag", () => {
  const out = { dx: 0, dy: 0 };
  const START = 16; // 8 CSS px at dpr 2

  it("is not a drag until it travels more than the start distance; nothing moves before it", () => {
    const d = new ThumbDrag();
    d.down(3, 600, 200);
    d.move(3, 610, 206, START); // 11.7 px
    expect(d.dragging).toBe(false);
    expect(d.take(out)).toBe(false);
    expect(out).toEqual({ dx: 0, dy: 0 });
    d.move(3, 616, 200, START); // exactly 16 px: still a tap
    expect(d.dragging).toBe(false);
    d.move(3, 616.5, 200, START);
    expect(d.dragging).toBe(true);
  });

  it("counts from the crossing (never a jump), then every move piles up until taken", () => {
    const d = new ThumbDrag();
    d.down(1, 600, 200);
    d.move(1, 620, 200, START); // crosses: the drag starts here, 0 movement yet
    expect(d.take(out)).toBe(true); // the start edge pins even with no movement
    expect(out).toEqual({ dx: 0, dy: 0 });
    d.move(1, 630, 195, START);
    d.move(1, 633, 190, START);
    expect(d.take(out)).toBe(true);
    expect(out).toEqual({ dx: 13, dy: -10 });
    expect(d.take(out)).toBe(false); // taken once
    expect(out).toEqual({ dx: 0, dy: 0 });
  });

  it("ignores other pointers while one is held (one thumb drags), and a lift frees it", () => {
    const d = new ThumbDrag();
    d.down(1, 600, 200);
    d.down(2, 700, 250);
    expect(d.pointerId).toBe(1);
    d.move(2, 800, 250, START);
    expect([d.dragging, d.take(out)]).toEqual([false, false]);
    d.up(2); // not the claimed one
    expect(d.pointerId).toBe(1);
    d.move(1, 640, 200, START);
    d.move(1, 650, 200, START);
    d.up(1);
    expect([d.pointerId, d.dragging]).toEqual([-1, false]);
    expect(d.take(out)).toBe(true); // the movement before the lift is still applied
    expect(out.dx).toBe(10);
    d.down(2, 700, 250);
    expect(d.pointerId).toBe(2);
  });

  it("reset forgets the pointer and any movement not taken", () => {
    const d = new ThumbDrag();
    d.down(1, 600, 200);
    d.move(1, 640, 200, START);
    d.move(1, 660, 200, START);
    d.reset();
    expect([d.pointerId, d.dragging, d.take(out)]).toEqual([-1, false, false]);
  });
});
