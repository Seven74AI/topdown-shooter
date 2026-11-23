import { describe, expect, it } from "vitest";
import { buildingStats, loadBalance } from "@topdown/shared";
import { B6_PLANKS, B6_ROW_Y0, B6_ROW_Y1, drawObjectInFrame, drawSandbags, drawWoodBarricade } from "./objectArt";
import { ATLAS_BUILDINGS, FRAME_WOOD, buildingFrame, buildingsAtlasSpecs, BUILDINGS_PX_PER_M } from "./buildingsAtlas";
import { RecordCanvas, asContext, type PaintOp } from "./recordCanvas";

const balance = loadBalance();
const EPS = 0.012; // ~1 frame px of stroke spill at 96 px/m

function inside(o: PaintOp, x0: number, y0: number, x1: number, y1: number): boolean {
  return o.x0 >= x0 - EPS && o.y0 >= y0 - EPS && o.x1 <= x1 + EPS && o.y1 <= y1 + EPS;
}

describe("Story 4.12: B6 wood barricade drawn in game code (round-4 port)", () => {
  const stats = buildingStats(balance, "wood_barricade");
  const w = stats?.widthM ?? 2;
  const dd = stats?.depthM ?? 0.5;
  const rec = new RecordCanvas();
  drawWoodBarricade(asContext(rec), w, dd);
  const painted = rec.painted();

  it("draws inside its 2 × 0.5 m footprint, with no shadow baked into the art (the game casts it)", () => {
    expect(painted.length).toBeGreaterThan(B6_PLANKS * 4);
    for (const o of painted) expect(inside(o, -w / 2, -dd / 2, w / 2, dd / 2), JSON.stringify(o)).toBe(true);
    expect(rec.ops.filter((o) => o.shadow)).toHaveLength(0);
  });

  it("strictly top down: the sharpened plank tops (four lit faces each) sit in the front row band, the struts reach the back (−y)", () => {
    const faces = painted.filter((o) => o.kind === "fill" && o.y0 >= B6_ROW_Y0 - EPS && o.y1 <= B6_ROW_Y1 + EPS && o.x1 - o.x0 < 0.15);
    expect(faces.length).toBeGreaterThanOrEqual(B6_PLANKS * 4);
    const back = Math.min(...painted.map((o) => o.y0));
    expect(back).toBeLessThan(-0.2); // the struts' feet
    // each strut runs from its foot up to the plank row (it props the planks, not floating behind them)
    const struts = painted.filter((o) => o.kind === "fill" && o.y0 < -0.18 && o.y1 > B6_ROW_Y0 - 0.03);
    expect(struts.length).toBeGreaterThanOrEqual(4);
    const front = Math.max(...painted.map((o) => o.y1));
    expect(front).toBeLessThanOrEqual(B6_ROW_Y1 + 0.02); // nothing in front of the planks
  });

  it("the whole ladder B6 → B8 → M1c is code in one atlas (the loaded objects atlas is gone)", () => {
    expect(buildingFrame("wood_barricade")).toEqual({ texture: ATLAS_BUILDINGS, frame: FRAME_WOOD });
    for (const t of ["reinforced_barricade", "metal_barricade"]) expect(buildingFrame(t)?.texture).toBe(ATLAS_BUILDINGS);
    const spec = buildingsAtlasSpecs().find((s) => s.name === FRAME_WOOD);
    expect(spec).toEqual({ name: FRAME_WOOD, w: Math.round(w * BUILDINGS_PX_PER_M), h: Math.round(dd * BUILDINGS_PX_PER_M) });
  });

  it("drawObjectInFrame clips to its frame and scales metres to px", () => {
    const r = new RecordCanvas();
    drawObjectInFrame(asContext(r), 10, 20, 192, 48, 96, (c) => drawWoodBarricade(c, 2, 0.5));
    for (const o of r.painted()) {
      expect(o.x0).toBeGreaterThanOrEqual(10 - 2);
      expect(o.x1).toBeLessThanOrEqual(10 + 192 + 2);
    }
  });
});

describe("Story 4.12: S2 sandbags drawn in game code (round-4 port)", () => {
  const rec = new RecordCanvas();
  drawSandbags(asContext(rec), 3, 1);
  const painted = rec.painted();

  it("olive-drab bags in three brick-offset rows plus a top layer, inside the 3 × 1 m cover box", () => {
    // the tied ends of the end bags may jut ~2.5 cm past the short sides (the frame clips them, as the mockup's)
    for (const o of painted) expect(inside(o, -1.53, -0.5, 1.53, 0.5), JSON.stringify(o)).toBe(true);
    const bagFills = painted.filter((o) => o.kind === "fill" && /^#(5|6|7)[0-9a-f]{5}$/.test(o.style) && o.x1 - o.x0 > 0.2);
    expect(bagFills.length).toBeGreaterThanOrEqual(3 * 6 + 4);
    // brick offset: row 0 and row 1 bag centres differ by half a bag
    const centres = (y: number): number[] =>
      bagFills
        .filter((o) => Math.abs((o.y0 + o.y1) / 2 - y) < 0.05)
        .map((o) => (o.x0 + o.x1) / 2)
        .sort((a, b) => a - b);
    const r0 = centres(-0.3);
    const r1 = centres(0.3 - 0.3); // the middle row
    expect(r0.length).toBeGreaterThan(4);
    expect(r1.length).toBeGreaterThan(4);
    const ref = r0[0] as number;
    for (const c of r1.filter((x) => Math.abs(x) < 1.2)) {
      const m = (((c - ref) % 0.5) + 0.5) % 0.5;
      expect(Math.abs(m - 0.25), `bag at ${c}`).toBeLessThan(0.03); // half a bag off the row below
    }
  });

  it("LOW: no ground shadow baked in; the only soft shade is the top layer's, on the bags under it", () => {
    const shaded = rec.ops.filter((o) => o.shadow);
    expect(shaded).toHaveLength(1);
    const s = (shaded[0] as PaintOp).shadow as { x0: number; y0: number; x1: number; y1: number };
    expect(s.x0).toBeGreaterThan(-1.5);
    expect(s.x1).toBeLessThan(1.5);
    expect(s.y0).toBeGreaterThan(-0.5);
    expect(s.y1).toBeLessThan(0.5);
  });
});
