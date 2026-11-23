import { describe, expect, it } from "vitest";
import { buildingStats, loadBalance } from "@topdown/shared";
import { MED_PANEL_X_M, MED_PANEL_Y_M, drawFloodlightFL1, drawFloodlightFL5, drawMedStation } from "./propArt";
import { ATLAS_BUILDINGS, BUILDINGS_PX_PER_M, FRAME_FLOODLIGHT, FRAME_FLOODLIGHT_B, FRAME_MED_STATION, buildingFrame, buildingsAtlasSpecs } from "./buildingsAtlas";
import { RecordCanvas, asContext, type PaintOp } from "./recordCanvas";
import { MAX_ATLAS_PX, isFrameName, packAtlas } from "./atlasLayout";
import { buildingShadowHeightM } from "../mineLook";

/** Story 5.10: the floodlight (FL1 base, FL5 skin) and the med station (MS10) drawn in game code. */
const balance = loadBalance();
const EPS = 0.02;
const inside = (o: PaintOp, h: number): boolean => o.x0 >= -h - EPS && o.y0 >= -h - EPS && o.x1 <= h + EPS && o.y1 <= h + EPS;

describe("Story 5.10 prop art", () => {
  for (const [name, draw] of [
    ["FL1 tripod work light", drawFloodlightFL1],
    ["FL5 stadium lamp", drawFloodlightFL5],
    ["med station MS10", drawMedStation],
  ] as const) {
    it(`${name}: paints inside its 1 × 1 m footprint (FL5: the lens glow spills, clipped by the frame)`, () => {
      const rec = new RecordCanvas();
      draw(asContext(rec));
      const painted = rec.painted();
      expect(painted.length).toBeGreaterThan(10);
      const h = draw === drawFloodlightFL1 ? 0.5 : draw === drawFloodlightFL5 ? 0.6 : 0.75; // FL5 / MS10: their lens / LED glow spills past the edge (the frame clips it)
      for (const o of painted) expect(inside(o, h), JSON.stringify(o)).toBe(true);
    });
  }

  it("FL1 reads as a lamp: the bright glass strip and its glow sit on the front edge (+y), the tripod's legs reach the footprint", () => {
    const rec = new RecordCanvas();
    drawFloodlightFL1(asContext(rec));
    const p = rec.painted();
    const glass = p.filter((o) => o.kind === "fill" && o.style === "#fff3d6");
    expect(glass).toHaveLength(1);
    expect((glass[0] as PaintOp).y0).toBeGreaterThan(0); // the front half
    expect(Math.max(...p.map((o) => o.x1))).toBeGreaterThan(0.4);
    expect(Math.min(...p.map((o) => o.y0))).toBeLessThan(-0.35);
  });

  it("MS10 reads as medical: the bright green LED cross sits on the panel the game's glow uses; the crate fills the footprint", () => {
    const rec = new RecordCanvas();
    drawMedStation(asContext(rec));
    const p = rec.painted();
    const led = p.filter((o) => o.kind === "fill" && o.style === "#5dff8a");
    expect(led).toHaveLength(1);
    const l = led[0] as PaintOp;
    expect((l.x0 + l.x1) / 2).toBeCloseTo(MED_PANEL_X_M, 6);
    expect((l.y0 + l.y1) / 2).toBeCloseTo(MED_PANEL_Y_M, 6);
    const crate = p.filter((o) => o.kind === "fill" && o.style === "#3b4652");
    expect(crate.length).toBeGreaterThan(0);
    expect((crate[0] as PaintOp).x1 - (crate[0] as PaintOp).x0).toBeCloseTo(0.96, 6);
  });

  it("atlas: prop_floodlight_a (FL1), prop_floodlight_b (FL5), prop_medstation_a, 1 × 1 m at the atlas px/m; the types map to them; ≤ 2048²", () => {
    expect([FRAME_FLOODLIGHT, FRAME_FLOODLIGHT_B, FRAME_MED_STATION]).toEqual(["prop_floodlight_a", "prop_floodlight_b", "prop_medstation_a"]);
    const specs = buildingsAtlasSpecs();
    for (const f of [FRAME_FLOODLIGHT, FRAME_FLOODLIGHT_B, FRAME_MED_STATION]) {
      const s = specs.find((x) => x.name === f);
      expect(s && isFrameName(s.name)).toBe(true);
      expect([s?.w, s?.h]).toEqual([BUILDINGS_PX_PER_M, BUILDINGS_PX_PER_M]);
    }
    expect(buildingFrame("floodlight")).toEqual({ texture: ATLAS_BUILDINGS, frame: FRAME_FLOODLIGHT });
    expect(buildingFrame("med_station")).toEqual({ texture: ATLAS_BUILDINGS, frame: FRAME_MED_STATION });
    const layout = packAtlas(specs);
    expect(Math.max(layout.width, layout.height)).toBeLessThanOrEqual(MAX_ATLAS_PX);
  });

  it("shadows: the floodlight casts no box shadow (its art has the tripod's own), the med station a low crate's, walls stay tall", () => {
    expect(buildingShadowHeightM(buildingStats(balance, "floodlight"), 1.6)).toBe(0);
    const med = buildingShadowHeightM(buildingStats(balance, "med_station"), 1.6);
    expect(med).toBeGreaterThan(0);
    expect(med).toBeLessThan(1.6);
    expect(buildingShadowHeightM(buildingStats(balance, "wood_barricade"), 1.6)).toBe(1.6);
  });
});
