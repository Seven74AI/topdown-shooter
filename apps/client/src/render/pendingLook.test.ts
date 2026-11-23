import { describe, expect, it } from "vitest";
import { FADE_MS, PendingPlacements, SHAKE_M, SHAKE_MS } from "../scenes/pendingPlacements";
import { newPendingLook, pendingLook } from "./pendingLook";
import { dashedRect } from "./dashes";

/** Story 5.18 (AC 5, 7): the pending box's look over time, and its dashed outline. */
function entry() {
  const p = new PendingPlacements();
  p.add({ type: "wood_barricade", gx: 10, gy: 10, rot: 0 }, 40, { minX: 5, minY: 5, maxX: 7, maxY: 5.5 }, 0, "build", 1);
  const e = p.entries.find((x) => x.live);
  if (!e) throw new Error("entry");
  return { p, e };
}

describe("Story 5.18: pendingLook", () => {
  it("waiting: white, full alpha, the spinner turning once per second", () => {
    const { e } = entry();
    const l = pendingLook(e, 250, newPendingLook());
    expect([l.visible, l.red, l.dx, l.alpha]).toEqual([true, false, 0, 1]);
    expect(l.spin).toBeCloseTo(Math.PI / 2, 9);
    expect(pendingLook(e, 1250, newPendingLook()).spin).toBeCloseTo(Math.PI / 2, 9);
  });

  it("refused: red, 3 shakes of 150 ms within ±0.1 m, then a 300 ms fade, then hidden", () => {
    const { p, e } = entry();
    p.pump(0, () => {});
    p.refuse("blocked", 1000);
    const out = newPendingLook();
    let maxDx = 0;
    for (let t = 0; t < 3 * SHAKE_MS; t += 5) {
      const l = pendingLook(e, 1000 + t, out);
      expect([l.visible, l.red, l.alpha, Number.isNaN(l.spin)]).toEqual([true, true, 1, true]);
      maxDx = Math.max(maxDx, Math.abs(l.dx));
    }
    expect(maxDx).toBeGreaterThan(0.09);
    expect(maxDx).toBeLessThanOrEqual(SHAKE_M + 1e-12);
    expect(pendingLook(e, 1000 + 3 * SHAKE_MS + FADE_MS / 2, out).alpha).toBeCloseTo(0.5, 9);
    expect(pendingLook(e, 1000 + 3 * SHAKE_MS + FADE_MS, out).visible).toBe(false);
  });

  it("a timed-out ghost after its look, and a free slot, are hidden", () => {
    const { p, e } = entry();
    const free = p.entries.find((x) => !x.live);
    if (!free) throw new Error("free");
    expect(pendingLook(free, 0, newPendingLook()).visible).toBe(false);
    p.pump(0, () => {});
    p.refuse("blocked", 0);
    expect(pendingLook(e, 10_000, newPendingLook()).visible).toBe(false);
  });

  it("dashedRect: an odd number of slots per edge so each corner is a dash; every dash on the outline", () => {
    const segs: number[][] = [];
    const n = dashedRect({ lineBetween: (a, b, c, d) => segs.push([a, b, c, d]) }, 2, 0.5, 0.25);
    expect(n).toBe(segs.length);
    // 2 m edges: 9 slots of 0.22 m → 5 dashes; 0.5 m edges: 3 slots → 2 dashes
    expect(n).toBe(5 + 2 + 5 + 2);
    for (const [x0, y0, x1, y1] of segs) {
      for (const [x, y] of [[x0, y0], [x1, y1]] as const) {
        const onX = Math.abs(Math.abs(x as number) - 1) < 1e-9 && Math.abs(y as number) <= 0.25 + 1e-9;
        const onY = Math.abs(Math.abs(y as number) - 0.25) < 1e-9 && Math.abs(x as number) <= 1 + 1e-9;
        expect(onX || onY).toBe(true);
      }
    }
    expect(segs[0]?.slice(0, 2)).toEqual([-1, -0.25]); // starts at a corner
  });
});
