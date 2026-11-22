import { describe, expect, it } from "vitest";
import { loadBalance } from "../config/balance";
import { TICK_DT_S } from "../config/constants";
import { addBuildingAt, removeBuilding, type BuildingRotation } from "../buildings/buildings";
import { createWorld, step, type World } from "../core/world";
import { addPlayer } from "../player/player";
import {
  FLOW_UNREACHED,
  FLOW_UNITS_PER_M,
  advanceFlowField,
  createFlowField,
  flowCellAt,
  flowFieldMaxAgeTicks,
  flowNextCell,
  flowRefreshTicks,
  rasterizeBuildings,
  rebuildFlowFieldNow,
  snapshotPathing,
} from "./flowField";

const balance = loadBalance();
const NO_WAVES = { waves: () => {} };
const WOOD = "wood_barricade";
const BUILDING_UNITS = Math.round(balance.zombies.pathing.buildingCostM * FLOW_UNITS_PER_M);

let nextId = 1;
const wall = (world: World, gx: number, gy: number, rot: BuildingRotation = 0) =>
  addBuildingAt(world, { id: nextId++, type: WOOD, ownerId: "p0", gx, gy, rot, hp: 200 });

/** Four barricades closing a 2 × 1.5 m box around (24, 16): the corner gaps are 0.5 m (a zombie is 0.7 m). */
function closedBox(world: World): void {
  wall(world, 24, 15); // top    x [23, 25], y [14.75, 15.25]
  wall(world, 24, 17); // bottom x [23, 25], y [16.75, 17.25]
  wall(world, 22, 16); // left   x [21, 23], y [15.75, 16.25]
  wall(world, 26, 16); // right  x [25, 27], y [15.75, 16.25]
}

const cost = (world: World, x: number, y: number): number => world.pathing.chase.front[flowCellAt(world.pathing.nav, x, y)] as number;

describe("flow field: nav grid", () => {
  it("is 96 × 64 cells of 0.5 m on the 48 × 32 m map", () => {
    const w = createWorld({ balance, seed: 1, systems: NO_WAVES });
    expect(w.pathing.nav.cols).toBe(96);
    expect(w.pathing.nav.rows).toBe(64);
    expect(w.pathing.nav.cells).toBe(6144);
  });

  it("rasterizes a barricade conservatively (every overlapped cell) and marks the cells around it near-wall", () => {
    const w = createWorld({ balance, seed: 1, systems: NO_WAVES });
    const b = wall(w, 20, 11); // x [19, 21], y [10.75, 11.25]
    rasterizeBuildings(w.pathing.nav, w);
    const nav = w.pathing.nav;
    const at = (x: number, y: number) => nav.buildingAt[flowCellAt(nav, x, y)];
    expect(at(19.1, 10.6)).toBe(b?.id); // the half-covered cell above the box counts
    expect(at(20.9, 11.4)).toBe(b?.id); // ... and below
    expect(at(18.9, 11)).toBe(0); // x edges are exact
    expect(at(21.1, 11)).toBe(0);
    expect(at(20, 10.4)).toBe(0);
    expect(nav.enterCost[flowCellAt(nav, 20, 10.4)]).toBe(Math.round(balance.zombies.pathing.nearWallCostM * FLOW_UNITS_PER_M));
    expect(nav.enterCost[flowCellAt(nav, 20, 11)]).toBe(BUILDING_UNITS);
    expect(nav.version).toBe(w.buildings.version);
  });
});

describe("flow field: costs", () => {
  it("open street: 2 units per orthogonal cell, 3 per diagonal, from the nearest player", () => {
    const w = createWorld({ balance, seed: 1, systems: NO_WAVES });
    addPlayer(w, "a", 10.25, 10.25);
    addPlayer(w, "b", 40.25, 10.25);
    rebuildFlowFieldNow(w.pathing.chase, w.pathing.nav, w);
    expect(cost(w, 10.25, 10.25)).toBe(0);
    expect(cost(w, 15.25, 10.25)).toBe(20); // 10 cells east
    expect(cost(w, 12.25, 12.25)).toBe(12); // 4 diagonal steps
    expect(cost(w, 36.25, 10.25)).toBe(16); // nearer to b
  });

  it("downed players are no source; with nobody standing the field is empty and gives no direction", () => {
    const w = createWorld({ balance, seed: 1, systems: NO_WAVES });
    const a = addPlayer(w, "a", 10, 10);
    a.status = "downed";
    rebuildFlowFieldNow(w.pathing.chase, w.pathing.nav, w);
    expect(cost(w, 20, 20)).toBe(FLOW_UNREACHED);
    expect(flowNextCell(w.pathing.chase, w.pathing.nav, flowCellAt(w.pathing.nav, 20, 20))).toBe(-1);
  });

  it("a wall with open ends: the cost behind it is the walk round its end, far below breaking through", () => {
    const w = createWorld({ balance, seed: 1, systems: NO_WAVES });
    addPlayer(w, "a", 22, 8);
    wall(w, 20, 11);
    wall(w, 22, 11);
    wall(w, 24, 11); // x [19, 25]
    rebuildFlowFieldNow(w.pathing.chase, w.pathing.nav, w);
    const behind = cost(w, 22, 14);
    expect(behind).toBeLessThan(BUILDING_UNITS); // a detour, not a breach
    expect(behind).toBeGreaterThan(cost(w, 22, 8) + 6 * 2 * 2); // longer than the straight 6 m
    // Following the field from behind the wall never enters a building cell and arrives.
    const nav = w.pathing.nav;
    let c = flowCellAt(nav, 22, 14);
    for (let k = 0; k < 200 && w.pathing.chase.front[c] !== 0; k++) {
      c = flowNextCell(w.pathing.chase, nav, c);
      expect(c).toBeGreaterThanOrEqual(0);
      expect(nav.buildingAt[c]).toBe(0);
    }
    expect(w.pathing.chase.front[c]).toBe(0);
  });

  it("a closed box: outside cells are reachable only through a building (the field leads to a wall)", () => {
    const w = createWorld({ balance, seed: 1, systems: NO_WAVES });
    addPlayer(w, "a", 24, 16);
    closedBox(w);
    rebuildFlowFieldNow(w.pathing.chase, w.pathing.nav, w);
    expect(cost(w, 24, 16)).toBe(0);
    expect(cost(w, 24, 20)).toBeGreaterThanOrEqual(BUILDING_UNITS);
    expect(cost(w, 24, 20)).toBeLessThan(FLOW_UNREACHED);
    // Walking down the field from outside hits a building cell before the player's cell.
    const nav = w.pathing.nav;
    let c = flowCellAt(nav, 24, 20);
    let hitBuilding = 0;
    for (let k = 0; k < 50 && hitBuilding === 0; k++) {
      c = flowNextCell(w.pathing.chase, nav, c);
      hitBuilding = nav.buildingAt[c] as number;
    }
    expect(hitBuilding).toBeGreaterThan(0);
  });
});

describe("flow field: cadence (Epic 2 retro R1, brief line 10)", () => {
  const P = flowRefreshTicks(createWorld({ balance, seed: 1, systems: NO_WAVES }));

  it("a full refresh takes P = ceil(6144 / rebuildCellsPerTick) ticks, at most one completion per tick", () => {
    expect(P).toBe(Math.ceil(6144 / balance.zombies.pathing.rebuildCellsPerTick));
    expect(P).toBeLessThanOrEqual(5); // ≤ 250 ms
    const w = createWorld({ balance, seed: 1, systems: NO_WAVES });
    addPlayer(w, "a", 24, 16);
    const f = w.pathing.chase;
    for (let t = 0; t < P - 1; t++) step(w, TICK_DT_S);
    expect(f.rebuilds).toBe(0);
    step(w, TICK_DT_S);
    expect(f.rebuilds).toBe(1);
    expect(f.sourceTick).toBe(0);
    let last = f.rebuilds;
    for (let t = 0; t < 100; t++) {
      step(w, TICK_DT_S);
      expect(f.rebuilds - last).toBeLessThanOrEqual(1);
      last = f.rebuilds;
    }
    expect(f.rebuilds).toBeGreaterThanOrEqual(Math.floor((100 + P) / P) - 1);
  });

  it("STALE TEST: the field is never older than 2P ticks and follows a player who keeps moving", () => {
    const w = createWorld({ balance, seed: 1, systems: NO_WAVES });
    const a = addPlayer(w, "a", 5, 16);
    const f = w.pathing.chase;
    const maxAge = flowFieldMaxAgeTicks(w);
    expect(maxAge).toBe(2 * P);
    for (let t = 0; t < 400; t++) {
      // The player crosses the map and back (a position set directly: one mechanic per test).
      a.x = 5 + 38 * Math.abs(Math.sin(t / 60));
      step(w, TICK_DT_S);
      if (t < P) continue;
      expect(w.tick - f.sourceTick).toBeLessThanOrEqual(maxAge);
      expect(f.sourceTick).toBeGreaterThanOrEqual(0);
      // The field's zero is where the player stood at its source tick, never further back than 2P ticks.
      const srcX = 5 + 38 * Math.abs(Math.sin(f.sourceTick / 60));
      expect(cost(w, srcX, 16)).toBe(0);
    }
  });

  it("a building placed or destroyed is in the field within 2P ticks (rebuild after destruction)", () => {
    const w = createWorld({ balance, seed: 1, systems: NO_WAVES });
    addPlayer(w, "a", 24, 16);
    closedBox(w);
    const run = (n: number) => {
      for (let t = 0; t < n; t++) step(w, TICK_DT_S);
    };
    run(2 * P);
    expect(cost(w, 24, 19)).toBeGreaterThanOrEqual(BUILDING_UNITS);
    const bottom = w.buildings.list.find((b) => b.gy === 17);
    expect(bottom && removeBuilding(w, bottom.id)).toBe(true);
    run(2 * P);
    expect(cost(w, 24, 19)).toBeLessThan(BUILDING_UNITS); // the breach is open in the field
    expect(w.pathing.nav.version).toBe(w.buildings.version);
  });

  it("is deterministic: two identical worlds give identical pathing state", () => {
    const make = () => {
      nextId = 1; // building ids are part of the grid
      const w = createWorld({ balance, seed: 7, systems: NO_WAVES });
      const a = addPlayer(w, "a", 10, 10);
      addPlayer(w, "b", 30, 20);
      closedBox(w);
      for (let t = 0; t < 77; t++) {
        a.x = 10 + t * 0.1;
        step(w, TICK_DT_S);
      }
      return snapshotPathing(w.pathing);
    };
    expect(make()).toEqual(make());
  });

  it("a second field on the same grid can add a penalty layer (Story 3.8's flank field)", () => {
    const w = createWorld({ balance, seed: 1, systems: NO_WAVES });
    addPlayer(w, "a", 10.25, 10.25);
    const flank = createFlowField(w.pathing.nav, (f) => {
      f.penalty.fill(0);
      for (let cx = 21; cx < 40; cx++) f.penalty[20 * w.pathing.nav.cols + cx] = 100; // a costly row east of the player
    });
    rasterizeBuildings(w.pathing.nav, w);
    advanceFlowField(flank, w.pathing.nav, w, 1e6);
    rebuildFlowFieldNow(w.pathing.chase, w.pathing.nav, w);
    const c = flowCellAt(w.pathing.nav, 15.25, 10.25);
    expect(w.pathing.chase.front[c]).toBe(20);
    expect(flank.front[c]).toBeGreaterThan(20); // routed off the penalized row
    expect(flank.front[c]).toBeLessThan(100);
  });
});
