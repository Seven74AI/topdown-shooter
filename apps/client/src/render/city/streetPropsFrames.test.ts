import { describe, expect, it } from "vitest";
import { POLICE_DRUM, POLICE_DRUM_LAMP_DY_M, POLICE_DRUM_R_M, POLICE_FRONT_W_M, POLICE_SIDE_LEN_M, POLICE_UNIT_M, policeLineLayout, policeOccluderX, type PolicePiece } from "./streetPropsFrames";
import { wallOccluderX } from "./buildingsFrames";
import { blinkerSpots, policePieces } from "./drawCity";
import { downtownScene } from "./testScene";
import type { AtlasCanvas } from "./spriteAtlas";

const unitsOf = (p: PolicePiece): number => Number(/^prop_policefront_(\d)/.exec(p.frame)?.[1] ?? 0);

describe("Story 9.14 (AC 4): a sawhorse police line laid with the standing pictures", () => {
  it("police_line_lot (9.5 m east–west): front pieces from end to end, overlapping at the joins, never past the box; drums at both ends", () => {
    const box = { name: "police_line_lot", minX: 10.5, minY: 22, maxX: 20, maxY: 22.5 };
    const ps = policeLineLayout(box);
    const pieces = ps.filter((p) => !p.drum);
    const drums = ps.filter((p) => p.drum);
    expect(pieces.length).toBe(5);
    const units = pieces.reduce((s, p) => s + unitsOf(p), 0);
    expect(units).toBe(15); // ceil(9.5 / (2/3))
    // each piece's sawhorses run from (x − 1) for units × 2/3 m
    const first = pieces[0] as PolicePiece;
    const last = pieces[pieces.length - 1] as PolicePiece;
    expect(first.x - POLICE_FRONT_W_M / 2).toBeCloseTo(box.minX, 9);
    expect(last.x - POLICE_FRONT_W_M / 2 + unitsOf(last) * POLICE_UNIT_M).toBeCloseTo(box.maxX, 9);
    for (let i = 1; i < pieces.length; i++) {
      const prev = pieces[i - 1] as PolicePiece;
      const gap = (pieces[i] as PolicePiece).x - 1 - (prev.x - 1 + unitsOf(prev) * POLICE_UNIT_M);
      expect(gap).toBeLessThanOrEqual(1e-9); // no gap
      expect(gap).toBeGreaterThan(-0.2); // a small overlap
    }
    for (const p of pieces) expect(p.y).toBe(22.25);
    expect(drums.map((d) => [d.frame, d.x, d.y])).toEqual([
      [POLICE_DRUM, 10.5 + POLICE_DRUM_R_M, 22.25],
      [POLICE_DRUM, 20 - POLICE_DRUM_R_M, 22.25],
    ]);
  });

  it("police_line_gas (10 m north–south): five side pieces exactly end to end; drums at both ends; sorted by their y", () => {
    const box = { name: "police_line_gas", minX: 28, minY: 0, maxX: 28.5, maxY: 10 };
    const ps = policeLineLayout(box);
    const pieces = ps.filter((p) => !p.drum);
    expect(pieces.map((p) => p.y)).toEqual([1, 3, 5, 7, 9]);
    expect(pieces.every((p) => /^prop_policeside_[ab]$/.test(p.frame) && p.x === 28.25 && p.sortY === p.y)).toBe(true);
    expect((pieces[0] as PolicePiece).y - POLICE_SIDE_LEN_M / 2).toBe(0);
    expect((pieces[4] as PolicePiece).y + POLICE_SIDE_LEN_M / 2).toBe(10);
    // review M2: the north drum moves down so its lamp stays on the map (the line starts at the map's top edge)
    const drums = ps.filter((p) => p.drum);
    expect((drums[0] as PolicePiece).y + POLICE_DRUM_LAMP_DY_M).toBeGreaterThanOrEqual(0);
    expect((drums[0] as PolicePiece).y).toBeLessThan(box.minY + 1);
    expect((drums[1] as PolicePiece).y).toBe(10 - POLICE_DRUM_R_M);
  });

  it("review M2: on a north–south line each drum sorts over the side piece it stands on (and its blinker over the drum)", () => {
    const box = { name: "police_line_gas", minX: 28, minY: 0, maxX: 28.5, maxY: 10 };
    const ps = policeLineLayout(box);
    const pieces = ps.filter((p) => !p.drum);
    const [north, south] = ps.filter((p) => p.drum) as [PolicePiece, PolicePiece];
    expect(north.sortY).toBe((pieces[0] as PolicePiece).sortY); // over the first piece (y = 1), not under it
    expect(north.sortY).toBeLessThan((pieces[1] as PolicePiece).sortY);
    expect(south.sortY).toBeGreaterThanOrEqual((pieces[4] as PolicePiece).sortY); // nearer the camera than the last piece already
    // order: per line, so another line's pieces don't shift these
    expect(ps.map((p) => p.order)).toEqual([0, 1, 2, 3, 4, 5, 6]);
  });

  it("review L3: a line short enough for one piece never overhangs its box", () => {
    for (const L of [0.7, 1, 1.4, 1.9, 2]) {
      const ps = policeLineLayout({ name: "short", minX: 5, minY: 0, maxX: 5 + L, maxY: 0.5 }).filter((p) => !p.drum);
      expect(ps.length).toBe(1);
      const p = ps[0] as PolicePiece;
      const west = p.x - POLICE_FRONT_W_M / 2;
      expect(west).toBeGreaterThanOrEqual(5 - 1e-9);
      expect(west + unitsOf(p) * POLICE_UNIT_M).toBeLessThanOrEqual(5 + L + 1e-9);
    }
    // shorter than one sawhorse: only its drums (re-review nit)
    expect(policeLineLayout({ name: "tiny", minX: 0, minY: 0, maxX: 0.6, maxY: 0.5 }).every((p) => p.drum)).toBe(true);
    // a north–south line shorter than a side piece: only its drums
    const s = policeLineLayout({ name: "short", minX: 0, minY: 4, maxX: 0.5, maxY: 5.5 });
    expect(s.every((p) => p.drum)).toBe(true);
    expect(s.length).toBe(2);
  });

  it("review L5: the variants follow the line's name", () => {
    const at = { minX: 0, minY: 0, maxX: 10, maxY: 0.5 };
    const frames = (name: string): string[] => policeLineLayout({ name, ...at }).filter((p) => !p.drum).map((p) => p.frame);
    const names = ["police_line_lot", "police_line_gas", "a", "b", "c"].map(frames).map((f) => f.join());
    expect(new Set(names).size).toBeGreaterThan(1);
    expect(frames("police_line_lot")).toEqual(frames("police_line_lot"));
  });

  it("a line whose length isn't a whole number of pieces: a shorter last front piece; overlapping side pieces", () => {
    const f = policeLineLayout({ name: "x", minX: 0, minY: 0, maxX: 5, maxY: 0.5 }).filter((p) => !p.drum);
    expect(f.map(unitsOf)).toEqual([3, 3, 2]); // 8 sawhorses for 5 m
    const s = policeLineLayout({ name: "y", minX: 0, minY: 0, maxX: 0.5, maxY: 5 }).filter((p) => !p.drum);
    expect(s.map((p) => p.y)).toEqual([1, 2.5, 4]);
  });

  it("is the same for the same line (variants fixed by the name), and reuses `out`", () => {
    const box = { name: "police_line_lot", minX: 10.5, minY: 22, maxX: 20, maxY: 22.5 };
    const out: PolicePiece[] = [];
    expect(policeLineLayout(box, out)).toBe(out);
    expect(policeLineLayout(box).map((p) => p.frame)).toEqual(out.map((p) => p.frame));
  });
});

describe("Story 9.14: silhouettes behind the police pictures are cropped to their solid part", () => {
  it("wallOccluderX covers the police frames", () => {
    expect(wallOccluderX("prop_policefront_3a")).toEqual([0, 1]);
    expect(wallOccluderX("prop_policefront_2b")?.[1]).toBeCloseTo(2 / 3, 9);
    expect(wallOccluderX("prop_policefront_1a")?.[1]).toBeCloseTo(1 / 3, 9);
    const side = wallOccluderX("prop_policeside_a") as readonly [number, number];
    expect(side[0]).toBeGreaterThan(0.2);
    expect(side[1]).toBeLessThan(0.8);
    expect(wallOccluderX(POLICE_DRUM)).toEqual(policeOccluderX(POLICE_DRUM));
    expect(wallOccluderX("vehicle_car_a")).toBeNull();
    expect(wallOccluderX("building_wall_woodout0")).toEqual([0, 1]);
  });
});

describe("Story 9.14: the city's police lines", () => {
  const photo = (stage: number) => ({ ...downtownScene(stage), atlas: { canvas: null, frames: new Map([[POLICE_DRUM, {}]]) } as unknown as AtlasCanvas });

  it("stage 2: both sawhorse lines stand (not the concrete barrier); none at stage 1; none with the code atlas", () => {
    const ps = policePieces(photo(2));
    expect(ps.filter((p) => p.drum).length).toBe(4);
    expect(ps.filter((p) => !p.drum).length).toBe(10);
    expect(policePieces(photo(1))).toEqual([]);
    expect(policePieces(downtownScene(2))).toEqual([]);
  });

  it("the standing lines' blinkers sit on their drums' lamps, above them; the concrete barrier keeps its flat lamps", () => {
    const sp = blinkerSpots(photo(2));
    expect(sp.barrier.length).toBe(6);
    expect(sp.barrierStand.filter((y) => y >= 0).length).toBe(4);
    expect(sp.barrierStand.filter((y) => y < 0).length).toBe(2);
    const flat = blinkerSpots(downtownScene(2));
    expect(flat.barrierStand.every((y) => y < 0)).toBe(true);
    expect(flat.barrier.length).toBe(6);
  });
});
