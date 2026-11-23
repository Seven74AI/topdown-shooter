import { describe, expect, it } from "vitest";
import { BUILD_GRID_M, TICK_DT_S, addBuildingAt, addPlayer, bearTrapCounters, buildingStats, createWorld, loadBalance, resetBearTrapCounters, spawnZombie, startBuild, startWave, step } from "@topdown/shared";
import { drawBearTrap } from "./buildingArt";
import { ATLAS_BUILDINGS, BUILDINGS_PX_PER_M, FRAME_BEAR_TRAP_CLOSED, FRAME_BEAR_TRAP_OPEN, buildingFrame, buildingsAtlasSpecs } from "./buildingsAtlas";
import { RecordCanvas, asContext, type PaintOp } from "./recordCanvas";
import { bearTrapPlateRadius, buildingShadowHeightM, TRAP_SHADOW_M, rearmFraction } from "../mineLook";
import { isFrameName } from "./atlasLayout";
import { rangeRings } from "../rangeRings";

/** Story 5.14: the bear trap B-T1 drawn in game code, open and closed; the plate ring and re-arm ring helpers. */
const balance = loadBalance();
const EPS = 0.02;
const paint = (closed: boolean): PaintOp[] => {
  const rec = new RecordCanvas();
  drawBearTrap(asContext(rec), 1, 1, closed);
  return rec.painted();
};
/** The jaws' steel: everything painted within the hinge span |x| ≤ 0.3 apart from the plate and hinges. */
const jawSpanY = (ops: PaintOp[]): number => {
  const steel = ops.filter((o) => o.x0 >= -0.3 && o.x1 <= 0.3 && (o.y1 - o.y0) > 0.21); // taller than the 0.2 m plate
  return steel.length === 0 ? 0 : Math.max(...steel.map((o) => o.y1)) - Math.min(...steel.map((o) => o.y0));
};

describe("Story 5.14 bear trap art (B-T1)", () => {
  it("both looks paint inside the 1 × 1 m footprint", () => {
    for (const closed of [false, true]) {
      const p = paint(closed);
      expect(p.length).toBeGreaterThan(20);
      for (const o of p) expect(o.x0 >= -0.5 - EPS && o.y0 >= -0.5 - EPS && o.x1 <= 0.5 + EPS && o.y1 <= 0.5 + EPS, JSON.stringify(o)).toBe(true);
    }
  });

  it("open reads as a ring of jaws (~0.54 m across, 14 teeth); closed as one bar across the middle (AC 18)", () => {
    const open = paint(false);
    const closed = paint(true);
    expect(jawSpanY(open)).toBeGreaterThan(0.5); // the two half-rings lying flat
    expect(jawSpanY(closed)).toBe(0); // nothing tall: the jaws stood up into a bar
    const bar = closed.filter((o) => o.kind === "fill" && o.x1 - o.x0 > 0.5 && o.y1 - o.y0 < 0.1);
    expect(bar.length).toBeGreaterThanOrEqual(1);
    const teeth = open.filter((o) => o.kind === "fill" && o.x1 - o.x0 < 0.09 && o.y1 - o.y0 < 0.09 && o.x1 - o.x0 > 0.02 && Math.hypot((o.x0 + o.x1) / 2, (o.y0 + o.y1) / 2) > 0.15 && Math.hypot((o.x0 + o.x1) / 2, (o.y0 + o.y1) / 2) < 0.235); // inside the ring, short of the hinges at 0.25
    expect(teeth.length).toBe(14);
  });

  it("atlas: two frames, category_name_variant, 1 m = 96 px; the closed frame only for a holding/sprung trap; the build bar gets the open one", () => {
    expect([FRAME_BEAR_TRAP_OPEN, FRAME_BEAR_TRAP_CLOSED]).toEqual(["building_beartrap_open", "building_beartrap_closed"]);
    const specs = buildingsAtlasSpecs();
    for (const f of [FRAME_BEAR_TRAP_OPEN, FRAME_BEAR_TRAP_CLOSED]) {
      const s = specs.find((x) => x.name === f);
      expect(s && isFrameName(s.name)).toBe(true);
      expect([s?.w, s?.h]).toEqual([BUILDINGS_PX_PER_M, BUILDINGS_PX_PER_M]);
    }
    expect(buildingFrame("bear_trap")).toEqual({ texture: ATLAS_BUILDINGS, frame: FRAME_BEAR_TRAP_OPEN });
    expect(buildingFrame("bear_trap", 0)?.frame).toBe(FRAME_BEAR_TRAP_OPEN);
    expect(buildingFrame("bear_trap", 1)?.frame).toBe(FRAME_BEAR_TRAP_CLOSED);
    expect(buildingFrame("bear_trap", 2)?.frame).toBe(FRAME_BEAR_TRAP_CLOSED);
    expect(buildingFrame("spike_trap", 2)?.frame).toBe(buildingFrame("spike_trap")?.frame); // other types ignore it
    expect(buildingShadowHeightM(buildingStats(balance, "bear_trap"), 1.6)).toBe(0); // round jaws: no box shadow (a dark square in the first screenshots)
    expect(buildingShadowHeightM(buildingStats(balance, "spike_trap"), 1.6)).toBe(TRAP_SHADOW_M);
  });
});

describe("Story 5.14 F2: the plate ring is the sim's radius", () => {
  it("the drawn radius is the balance radius; a Walker centre just inside the drawn ring is caught, just outside isn't", () => {
    const r = bearTrapPlateRadius(buildingStats(balance, "bear_trap"));
    expect(r).toBe(balance.buildings.types.bear_trap?.bearTrap?.plateRadiusM);
    expect(bearTrapPlateRadius(buildingStats(balance, "mine"))).toBeNull();
    expect(rangeRings(buildingStats(balance, "bear_trap"))).toEqual([{ key: "bearTrap.plateRadiusM", radiusM: r }]); // 5.17's placement ghost shows the same ring
    const caught = (d: number): boolean => {
      const noop = (): void => {};
      const world = createWorld({ balance, seed: 1, systems: { waves: noop, zombies: noop } });
      addPlayer(world, "p0", 40, 28);
      startBuild(world);
      startWave(world);
      addBuildingAt(world, { id: 1, type: "bear_trap", ownerId: "p0", gx: 10 / BUILD_GRID_M, gy: 10 / BUILD_GRID_M, rot: 0, hp: 100 });
      world.zombies.hp[spawnZombie(world, "walker", 10.5 + d, 10.5)] = 1e6;
      resetBearTrapCounters();
      step(world, TICK_DT_S);
      return bearTrapCounters.catches === 1;
    };
    expect(caught((r ?? 0) - 0.01)).toBe(true);
    expect(caught((r ?? 0) + 0.01)).toBe(false);
  });

  it("the local re-arm ring fills over rearmS and then waits for the state", () => {
    expect(rearmFraction(0, 1)).toBe(0);
    expect(rearmFraction(500, 1)).toBeCloseTo(0.5, 9);
    expect(rearmFraction(1000, 1)).toBe(1);
    expect(rearmFraction(5000, 1)).toBe(1);
    expect(rearmFraction(500, 0)).toBe(0);
  });
});
