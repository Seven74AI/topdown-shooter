import { describe, expect, it } from "vitest";
import { loadBalance } from "../config/balance";
import { BUILD_GRID_M, TICK_DT_S } from "../config/constants";
import { addBuildingAt, removeBuilding, type BuildingRotation } from "../buildings/buildings";
import { createWorld, step, type World } from "../core/world";
import { addPlayer } from "../player/player";
import { spawnZombie } from "./zombiePool";
import { DOWNTOWN_MAP } from "../map/downtown";
import { applyDecayStage } from "../decay/applyDecayStage";
import {
  FLOW_UNREACHED,
  FLOW_UNITS_PER_M,
  advanceFlowField,
  createFlowField,
  flowCellAt,
  flowFieldMaxAgeTicks,
  flowNextCell,
  flowRefreshTicks,
  flowSharedMaxAgeTicks,
  rasterizeBuildings,
  rebuildFlowFieldNow,
  snapshotPathing,
} from "./flowField";

const balance = loadBalance();
const NO_WAVES = { waves: () => {} };
const WOOD = "wood_barricade";
const BUILDING_UNITS = Math.round(balance.zombies.pathing.buildingCostM * FLOW_UNITS_PER_M);

let nextId = 1;
/** A barricade with its min corner at (x, y) metres (rot 0: 2 × 0.5 m, rot 1: 0.5 × 2 m). */
const wall = (world: World, x: number, y: number, rot: BuildingRotation = 0) =>
  addBuildingAt(world, { id: nextId++, type: WOOD, ownerId: "p0", gx: x / BUILD_GRID_M, gy: y / BUILD_GRID_M, rot, hp: 200 });

/** Four barricades closing a 2 × 2 m box [23, 25] × [15, 17] around (24, 16) (corners touch). */
function closedBox(world: World): void {
  wall(world, 23, 14.5); // top    [23, 25] × [14.5, 15]
  wall(world, 23, 17); // bottom   [23, 25] × [17, 17.5]
  wall(world, 22.5, 15, 1); // left  [22.5, 23] × [15, 17]
  wall(world, 25, 15, 1); // right   [25, 25.5] × [15, 17]
}

const cost = (world: World, x: number, y: number): number => world.pathing.chase.front[flowCellAt(world.pathing.nav, x, y)] as number;

describe("flow field: nav grid", () => {
  it("is 96 × 64 cells of 0.5 m on the 48 × 32 m map", () => {
    const w = createWorld({ balance, seed: 1, systems: NO_WAVES });
    expect(w.pathing.nav.cols).toBe(96);
    expect(w.pathing.nav.rows).toBe(64);
    expect(w.pathing.nav.cells).toBe(6144);
  });

  it("rasterizes a box conservatively (every overlapped cell, even off the lattice) and marks the cells around it near-wall", () => {
    const w = createWorld({ balance, seed: 1, systems: NO_WAVES });
    const b = wall(w, 19, 10.75); // [19, 21] × [10.75, 11.25]: off the 0.5 m lattice on purpose (half cells)
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
    wall(w, 19, 10.5);
    wall(w, 21, 10.5);
    wall(w, 23, 10.5); // [19, 25] × [10.5, 11]
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
    const bottom = w.buildings.list.find((b) => b.minY === 17);
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

describe("flow field: review fixes", () => {
  it("L1: a building changing every tick never starves the rebuild (no restart: age ≤ 2P)", () => {
    const w = createWorld({ balance, seed: 1, systems: NO_WAVES });
    addPlayer(w, "a", 24, 16);
    const P = flowRefreshTicks(w);
    for (let t = 0; t < 120; t++) {
      if (t % 2 === 0) wall(w, 2, 2);
      else {
        const b = w.buildings.list.find((x) => x.minX === 2 && x.minY === 2);
        if (b) removeBuilding(w, b.id);
      }
      step(w, TICK_DT_S);
      if (t >= 2 * P) expect(w.tick - w.pathing.chase.sourceTick).toBeLessThanOrEqual(2 * P);
    }
    expect(w.pathing.chase.rebuilds).toBeGreaterThan(30);
  });

  it("H1: a 0.5 m slot is a pinch (building cost, carries a building id); a 1 m gap is open", () => {
    const w = createWorld({ balance, seed: 1, systems: NO_WAVES });
    const a = wall(w, 10, 10); // [10, 12] × [10, 10.5]
    wall(w, 12.5, 10); // slot x [12, 12.5]
    wall(w, 15.5, 10); // 1 m gap x [14.5, 15.5]
    rasterizeBuildings(w.pathing.nav, w);
    const nav = w.pathing.nav;
    const slot = flowCellAt(nav, 12.25, 10.25);
    expect(nav.buildingAt[slot]).toBe(0);
    expect(nav.pinchS[slot - nav.cols]).toBe(a?.id); // stepping down into the slot
    const gapL = flowCellAt(nav, 14.75, 10.25);
    expect(nav.pinchS[gapL - nav.cols]).toBe(0);
    expect(nav.pinchE[gapL]).toBe(0);
  });

  it("L5: Worlds that never run the buildings system get a one-cell placeholder", () => {
    const w = createWorld({ balance, seed: 1, systems: { buildings: () => {} } });
    expect(w.pathing.nav.cells).toBe(1);
  });
});

describe("Story 5.7 (D1): the wide grid and the wide chase field", () => {
  /** A full-width line of barricades at y [16, 16.5] with one gap [gx, gx + gap] (a 1 × 1 m turret plugs the odd metre). */
  function lineWithGap(w: World, gx: number, gap: number): void {
    for (let x = 0; x + 2 <= gx; x += 2) wall(w, x, 16);
    for (let x = gx + gap; x + 2 <= 48; x += 2) wall(w, x, 16);
  }

  it("the wide grid closes a 1.0 m gap the chase grid keeps open, and keeps a 1.5 m gap open (a 1.2 m Brute fits)", () => {
    for (const [gap, wideOpen] of [
      [1.0, false],
      [1.5, true],
      [2.0, true],
    ] as const) {
      const w = createWorld({ balance, seed: 1, systems: NO_WAVES });
      lineWithGap(w, 24, gap);
      addPlayer(w, "a", 24.5, 8);
      const { nav, chase, wide, wideChase } = w.pathing;
      rebuildFlowFieldNow(chase, nav, w);
      rebuildFlowFieldNow(wideChase, wide, w);
      // Walk the field down from below the line: does it go through the gap without a building?
      const through = (f: typeof chase, g: typeof nav): boolean => {
        let c = flowCellAt(g, 24 + gap / 2, 24);
        for (let k = 0; k < 400; k++) {
          const n = flowNextCell(f, g, c);
          if (n < 0) return f.front[c] === 0;
          if (g.buildingAt[n] !== 0) return false;
          c = n;
        }
        return false;
      };
      if (gap <= 1.5) expect(through(chase, nav), `chase ${gap}`).toBe(true); // a 0.35 m body fits a 1 m gap
      expect(through(wideChase, wide), `wide ${gap}`).toBe(wideOpen);
      expect(wide.inflateM).toBe(balance.zombies.pathing.wideInflateM);
    }
  });

  it("grows map boxes, buildings and the map edge by a whole cell; building ids stay on the grown cells", () => {
    const w = createWorld({ balance, seed: 1, systems: NO_WAVES });
    const b = wall(w, 20, 10); // [20, 22] × [10, 10.5]
    const { nav, wide } = w.pathing;
    rasterizeBuildings(nav, w);
    rasterizeBuildings(wide, w);
    expect(wide.buildingAt[flowCellAt(wide, 19.75, 10.25)]).toBe(b?.id);
    expect(nav.buildingAt[flowCellAt(nav, 19.75, 10.25)]).toBe(0);
    expect(wide.buildingAt[flowCellAt(wide, 21, 9.75)]).toBe(b?.id);
    expect(wide.buildingAt[flowCellAt(wide, 21, 10.75)]).toBe(b?.id);
    expect(wide.buildingAt[flowCellAt(wide, 21, 11.25)]).toBe(0);
    expect(wide.wallAt[flowCellAt(wide, 0.25, 16)]).toBe(1); // the edge ring
    expect(nav.wallAt[flowCellAt(nav, 0.25, 16)]).toBe(0);
    expect(wide.wallAt[flowCellAt(wide, 0.75, 16)]).toBe(0);
  });

  it("the wide field idles without a Brute (the chase field keeps every tick), shares the ticks while one lives", () => {
    const w = createWorld({ balance, seed: 1, systems: NO_WAVES });
    addPlayer(w, "a", 24, 16).hp = 1e9;
    for (let i = 0; i < 5; i++) spawnZombie(w, "walker", 5 + i, 5);
    const P = flowRefreshTicks(w);
    run(w, 60);
    expect(w.pathing.wideChase.rebuilds).toBe(0);
    expect(w.pathing.wideActive).toBe(false);
    const chase0 = w.pathing.chase.rebuilds;
    expect(chase0).toBeGreaterThanOrEqual(Math.floor(60 / P) - 1);
    const id = spawnZombie(w, "brute", 40, 28);
    w.zombies.hp[id] = 1e9;
    const chase1 = w.pathing.chase.rebuilds;
    run(w, 60);
    expect(w.pathing.wideActive).toBe(true);
    expect(w.pathing.activeFields).toBe(2);
    expect(w.pathing.wideChase.rebuilds).toBeGreaterThanOrEqual(Math.floor(60 / (2 * P)) - 1);
    expect(w.pathing.chase.rebuilds - chase1).toBeGreaterThanOrEqual(Math.floor(60 / (2 * P)) - 1);
    expect(w.tick - w.pathing.wideChase.sourceTick).toBeLessThanOrEqual(4 * P);
    // Runners too: three fields, each ≤ 6P old; the flank rule's max age follows.
    spawnZombie(w, "runner", 2, 30);
    run(w, 90);
    expect(w.pathing.activeFields).toBe(3);
    expect(flowSharedMaxAgeTicks(w)).toBe(6 * P);
    for (const f of [w.pathing.chase, w.pathing.flank, w.pathing.wideChase]) expect(w.tick - f.sourceTick).toBeLessThanOrEqual(6 * P);
  });

  it("walls are rewritten only at decay changes (build starts) on both grids; buildings only re-rasterize", () => {
    const w = createWorld({ balance, seed: 1, map: DOWNTOWN_MAP, systems: NO_WAVES });
    addPlayer(w, "a", 24, 14.5).hp = 1e9;
    spawnZombie(w, "brute", 40, 28);
    const walls = Array.from(w.pathing.nav.wallAt);
    const wideWalls = Array.from(w.pathing.wide.wallAt);
    expect(wideWalls.filter((v) => v === 1).length).toBeGreaterThan(walls.filter((v) => v === 1).length); // grown
    for (let t = 0; t < 100; t++) {
      if (t === 20) wall(w, 22, 20);
      if (t === 60) removeBuilding(w, w.buildings.list[0]?.id ?? 0);
      step(w, TICK_DT_S);
    }
    expect(Array.from(w.pathing.nav.wallAt)).toEqual(walls);
    expect(Array.from(w.pathing.wide.wallAt)).toEqual(wideWalls);
    applyDecayStage(w, 2, w.decay.variants);
    expect(Array.from(w.pathing.nav.wallAt)).not.toEqual(walls);
    expect(Array.from(w.pathing.wide.wallAt)).not.toEqual(wideWalls);
  });

  it("snapshotPathing covers the wide grid and field", () => {
    const w = createWorld({ balance, seed: 1, systems: NO_WAVES });
    addPlayer(w, "a", 24, 16);
    spawnZombie(w, "brute", 40, 28);
    const s0 = JSON.stringify(snapshotPathing(w.pathing));
    run(w, 10);
    const s1 = snapshotPathing(w.pathing);
    expect(JSON.stringify(s1)).not.toBe(s0);
    expect(s1.wideChase.rebuilds).toBeGreaterThan(0);
  });
});

function run(w: World, n: number): void {
  for (let i = 0; i < n; i++) step(w, TICK_DT_S);
}
