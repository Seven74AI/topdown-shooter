import { describe, expect, it } from "vitest";
import { TEAMMATE_DOWNED, TEAMMATE_OUT, createHudModel, type HudModel } from "../scenes/hudModel";
import { MATE_ARROW_CSS_PX, MATE_ARROW_OUTLINE_CSS_PX, MATE_DOWNED_SCALE, createTeammateMarkers, teammateArrowRect, teammateMarkers } from "./teammateMarkers";
import { PULSE_SCALE_AMP } from "./pulse";

/** 800 × 400 px screen showing world x 10–50, y 0–20 (20 px per metre). */
const W = 800;
const H = 400;
const MARGIN = 40;

function model(...mates: [x: number, y: number, slot: number, flags?: number][]): HudModel {
  const m = createHudModel();
  m.camX = 10;
  m.camY = 0;
  m.camZoom = 20;
  mates.forEach(([x, y, slot, flags = 0], i) => {
    m.teammates[i * 2] = x;
    m.teammates[i * 2 + 1] = y;
    m.teammateSlot[i] = slot;
    m.teammateFlags[i] = flags;
  });
  m.teammateCount = mates.length;
  return m;
}

describe("teammateMarkers (Story 2.9)", () => {
  const out = createTeammateMarkers();

  it("an on-screen teammate gets no arrow, with its screen position for the name", () => {
    expect(teammateMarkers(model([20, 10, 1]), W, H, MARGIN, out)).toBe(1);
    expect(out[0]).toMatchObject({ visible: false, slot: 1, downed: false, sx: 200, sy: 200 });
  });

  it("a teammate to the right gets an arrow on the right edge pointing at 0 rad", () => {
    expect(teammateMarkers(model([90, 10, 2]), W, H, MARGIN, out)).toBe(1);
    const m = out[0];
    expect(m?.visible).toBe(true);
    expect(m?.x).toBeCloseTo(W - MARGIN, 6);
    expect(m?.y).toBeCloseTo(H / 2, 6);
    expect(m?.angle).toBeCloseTo(0, 6);
  });

  it("carries the downed flag through", () => {
    teammateMarkers(model([90, 10, 1, TEAMMATE_DOWNED]), W, H, MARGIN, out);
    expect(out[0]).toMatchObject({ visible: true, downed: true, slot: 1 });
  });

  it("skips an out teammate", () => {
    expect(teammateMarkers(model([90, 10, 1, TEAMMATE_OUT | TEAMMATE_DOWNED], [20, 10, 2]), W, H, MARGIN, out)).toBe(1);
    expect(out[0]?.slot).toBe(2);
  });

  it("3 teammates give 3 markers in slot order", () => {
    expect(teammateMarkers(model([20, 10, 3], [-50, 10, 0], [30, 90, 1]), W, H, MARGIN, out)).toBe(3);
    expect(out.slice(0, 3).map((m) => m.slot)).toEqual([0, 1, 3]);
    expect(out[0]).toMatchObject({ visible: true });
    expect(out[0]?.angle).toBeCloseTo(Math.PI, 6); // left
    expect(out[1]?.angle).toBeCloseTo(Math.PI / 2, 6); // below
    expect(out[2]?.visible).toBe(false);
  });

  it("no teammates (solo) gives no markers", () => {
    expect(teammateMarkers(model(), W, H, MARGIN, out)).toBe(0);
  });

  it("an off-screen downed teammate's marker carries their countdown seconds; a standing one 0", () => {
    const m = model([90, 10, 1, TEAMMATE_DOWNED], [-30, 10, 2]);
    m.teammateSecs[0] = 14;
    m.teammateSecs[1] = 9; // stale value on a standing teammate: ignored
    expect(teammateMarkers(m, W, H, MARGIN, out)).toBe(2);
    expect(out[0]).toMatchObject({ visible: true, slot: 1, downed: true, secs: 14 });
    expect(out[1]).toMatchObject({ visible: true, slot: 2, downed: false, secs: 0 });
  });
});

describe("teammateArrowRect (Story 10.2 B4, D6)", () => {
  it("holds HudScene's turned triangle and its stroke at every bearing (0.5° steps), downed at the pulse's peak too, at k = 1 and 2", () => {
    const m = createTeammateMarkers()[0]!;
    const out = { x: 0, y: 0, w: 0, h: 0 };
    for (const k of [1, 2]) {
      for (const downed of [false, true]) {
        m.downed = downed;
        m.x = 300;
        m.y = 200;
        const scale = (downed ? MATE_DOWNED_SCALE * (1 + PULSE_SCALE_AMP) : 1) * k;
        const a = MATE_ARROW_CSS_PX * scale;
        const stroke = (MATE_ARROW_OUTLINE_CSS_PX / 2) * scale; // half the stroke lies outside the edge
        for (let deg = 0; deg < 360; deg += 0.5) {
          m.angle = (deg * Math.PI) / 180;
          teammateArrowRect(m, k, out);
          const c = Math.cos(m.angle);
          const s = Math.sin(m.angle);
          for (const [px, py] of [[a, 0], [-0.6 * a, 0.7 * a], [-0.6 * a, -0.7 * a]] as const) {
            const x = m.x + px * c - py * s;
            const y = m.y + px * s + py * c;
            expect(x - stroke).toBeGreaterThanOrEqual(out.x);
            expect(x + stroke).toBeLessThanOrEqual(out.x + out.w);
            expect(y - stroke).toBeGreaterThanOrEqual(out.y);
            expect(y + stroke).toBeLessThanOrEqual(out.y + out.h);
          }
          expect(out.w).toBeLessThanOrEqual(2 * a + 6 * scale); // not a blanket square
        }
      }
    }
  });
});
