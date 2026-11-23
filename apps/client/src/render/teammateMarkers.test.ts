import { describe, expect, it } from "vitest";
import { TEAMMATE_DOWNED, TEAMMATE_OUT, createHudModel, type HudModel } from "../scenes/hudModel";
import { createTeammateMarkers, teammateMarkers } from "./teammateMarkers";

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
