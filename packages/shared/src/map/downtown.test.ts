import { describe, expect, it } from "vitest";
import { loadBalance } from "../config/balance";
import { FLOW_CELL_M } from "../config/constants";
import { createWorld } from "../core/world";
import { addPlayer } from "../player/player";
import { teamSpawnPoint } from "../player/spawn";
import { circleHitsBuilding } from "../buildings/collision";
import { buildingStats, footprint, footprintBlocked, placementError, type Box } from "../buildings/buildings";
import { startBuild } from "../run/runStateMachine";
import { returnOutPlayers } from "../player/downed";
import { spawnZombie } from "../zombies/zombiePool";
import { maxZombieRadius } from "../zombies/zombieTypes";
import { FLOW_UNREACHED, flowCellAt, rebuildFlowFieldNow } from "../zombies/flowField";
import { mapCollisionCells } from "./collisionCells";
import { DOWNTOWN_MAP } from "./downtown";

/** Story 4.1 AC 6: the Downtown data as the sim loads it (`downtown.tmj` → `DOWNTOWN_MAP`). */
const balance = loadBalance();
const map = DOWNTOWN_MAP;
const cols = map.widthM / FLOW_CELL_M;
const cells = mapCollisionCells(map, FLOW_CELL_M);
const cellAt = (x: number, y: number): number => cells[Math.floor(y / FLOW_CELL_M) * cols + Math.floor(x / FLOW_CELL_M)] as number;
const names = (list: readonly { name: string }[]) => list.map((o) => o.name).sort();

describe("Downtown map data (Story 4.1)", () => {
  it("is 48 × 32 m, named downtown, with a content version", () => {
    expect(map.name).toBe("downtown");
    expect([map.widthM, map.heightM]).toEqual([48, 32]);
    expect(map.version).toMatch(/^[0-9a-f]{8}$/);
    expect(Object.isFrozen(map) && Object.isFrozen(map.solids[0])).toBe(true);
  });

  it("collision cells: exactly the boxes' area on the 0.5 m grid, and the named landmarks are solid where expected", () => {
    const area = map.solids.reduce((a, b) => a + (b.maxX - b.minX) * (b.maxY - b.minY), 0);
    expect(area).toBe(445);
    expect(cells.reduce((a, c) => a + c, 0)).toBe(area / (FLOW_CELL_M * FLOW_CELL_M)); // no overlaps, no half cells
    expect(cells.length).toBe(96 * 64);
    expect(cellAt(35, 15.5)).toBe(1); // the bus, mid-map
    expect(cellAt(4, 5)).toBe(1); // nw_corner_shop
    expect(cellAt(33.5, 4)).toBe(1); // a gas pump
    expect(cellAt(10.2, 28)).toBe(1); // the parking lot's wall
    expect(cellAt(24, 16)).toBe(0); // the intersection
    for (const [x, y] of [
      [9.5, 5],
      [8.5, 27],
      [39.5, 27],
    ]) {
      // The 3 alleys: 3 m wide, free in the middle, buildings on both sides.
      expect(cellAt(x as number, y as number)).toBe(0);
      expect(cellAt((x as number) - 1.75, y as number)).toBe(1);
      expect(cellAt((x as number) + 1.75, y as number)).toBe(1);
    }
  });

  it("named objects: landmarks, cover kinds, spawns, hazards and the five stage groups", () => {
    expect(names(map.solids)).toEqual(
      ["city_bus", "gas_kiosk", "gas_pump_a", "gas_pump_b", "nw_apartments", "nw_corner_shop", "parking_wall", "se_offices", "se_warehouse", "sw_diner"].sort(),
    );
    const bus = map.solids.find((s) => s.name === "city_bus");
    expect(bus).toMatchObject({ minX: 30, minY: 14.5, maxX: 40, maxY: 17 });
    expect(map.cover.find((c) => c.name === "bus_hull")).toMatchObject({ kind: "bus", minX: 30, minY: 14.5, maxX: 40, maxY: 17, minStage: 1 });
    expect(map.cover.filter((c) => c.kind === "car").map((c) => c.name)).toEqual(["parked_car_1", "parked_car_2", "parked_car_3", "street_car_west", "street_car_east"]);
    expect(map.cover.find((c) => c.kind === "barrier")?.minStage).toBe(2);
    expect(names(map.spawnPoints)).toEqual(
      ["alley_1_mouth", "alley_2_mouth", "alley_3_mouth", "gas_station_north", "parking_lot_south", "street_east", "street_north", "street_south", "street_west"].sort(),
    );
    expect(map.spawnPoints.every((s) => s.minStage === 1)).toBe(true);
    expect(map.hazards.map((h) => [h.name, h.kind, h.minStage])).toEqual([
      ["gas_leak_zone", "gas_leak", 2],
      ["fire_parked_car_2", "fire", 3],
      ["fire_street_car_west", "fire", 3],
    ]);
    expect(map.stages).toHaveLength(5);
    expect(map.stages[0]?.some((p) => p.kind === "crosswalk")).toBe(true);
    expect(map.stages[0]?.find((p) => p.name === "parking_lot")?.layer).toBe("stage1_ground");
    expect(map.stages[3]).toEqual([]);
    expect(map.stages[4]).toEqual([]);
  });

  it("the team start and every spawn with its edge jitter are clear of collision", () => {
    const world = createWorld({ balance, seed: 1, map });
    const at = { x: 0, y: 0 };
    for (let slot = 0; slot < 4; slot++) {
      teamSpawnPoint(world, slot, at);
      expect(circleHitsBuilding(world, at.x, at.y, balance.player.radiusM)).toBe(false);
    }
    // Review L5: the whole area a spawned zombie can cover: the jitter segment along the edge (the
    // wave director's axis), grown by the largest zombie radius on every side, overlaps no box.
    const j = balance.waves.spawnJitterM;
    const rz = maxZombieRadius(balance);
    for (const sp of map.spawnPoints) {
      const horizontal = sp.y < 1 || sp.y > map.heightM - 1;
      const minX = sp.x - (horizontal ? j : 0) - rz;
      const maxX = sp.x + (horizontal ? j : 0) + rz;
      const minY = sp.y - (horizontal ? 0 : j) - rz;
      const maxY = sp.y + (horizontal ? 0 : j) + rz;
      const hit = map.solids.find((s) => minX < s.maxX && maxX > s.minX && minY < s.maxY && maxY > s.minY);
      expect(hit?.name, sp.name).toBeUndefined();
    }
  });

  it("no free area is cut off and no gap is narrower than a body: a field from the centre reaches every free cell", () => {
    const world = createWorld({ balance, seed: 1, map });
    addPlayer(world, "p0", 24, 16);
    const { nav, chase } = world.pathing;
    rebuildFlowFieldNow(chase, nav, world);
    expect(nav.closedE.every((c) => c === 0) && nav.closedS.every((c) => c === 0)).toBe(true);
    let free = 0;
    let unreached = 0;
    for (let c = 0; c < nav.cells; c++) {
      if (nav.wallAt[c] === 1) continue;
      free++;
      if ((chase.front[c] as number) >= FLOW_UNREACHED) unreached++;
    }
    expect(free).toBe(96 * 64 - 1780);
    expect(unreached).toBe(0);
    for (const sp of map.spawnPoints) expect(chase.front[flowCellAt(nav, sp.x, sp.y)], sp.name).toBeLessThan(FLOW_UNREACHED);
  });

  it("review M2: placement refuses a building on a map box (any overlap) and accepts one flush against it", () => {
    const world = createWorld({ balance, seed: 1, map });
    const open = createWorld({ balance, seed: 1, map: { ...map, solids: [] } }); // same spawns, no boxes
    const stats = buildingStats(balance, "wood_barricade");
    if (!stats) throw new Error("no barricade");
    const box: Box = { minX: 0, minY: 0, maxX: 0, maxY: 0 };
    let refused = 0;
    for (const s of map.solids) {
      // Inside the box, and straddling each face by one lattice step.
      for (const [gx, gy] of [
        [s.minX * 2, s.minY * 2],
        [s.maxX * 2 - 1, s.minY * 2],
        [s.minX * 2 - 3, s.maxY * 2 - 1],
      ] as const) {
        footprint(stats, gx, gy, 0, box);
        if (footprintBlocked(open, box)) continue; // off the map or at a spawn anyway: says nothing about boxes
        expect(footprintBlocked(world, box), `${s.name} (${gx}, ${gy})`).toBe(true);
        refused++;
      }
    }
    expect(refused).toBeGreaterThan(map.solids.length); // the check really ran
    // Flush against the bus's south face: allowed (touching is not overlapping), through the full rule too.
    footprint(stats, 60, 34, 0, box); // [30, 32] × [17, 17.5]
    expect(footprintBlocked(world, box)).toBe(false);
    addPlayer(world, "p0", 24, 16).wallet = 1000;
    startBuild(world);
    expect(placementError(world, "p0", { type: "wood_barricade", gx: 60, gy: 34, rot: 0 })).toBeNull();
    expect(placementError(world, "p0", { type: "wood_barricade", gx: 60, gy: 33, rot: 0 })).toBe("blocked"); // 0.5 m into the bus
  });

  it("review L4: a returning player whose 24 near spots are all taken is never put inside a map box", () => {
    const world = createWorld({ balance, seed: 1, map, systems: { waves: () => {} } });
    // The teammate stands just west of the bus (face x = 30): the old fallback (+1.5 m in x) is inside it.
    const mate = addPlayer(world, "p0", 29, 15.5);
    const me = addPlayer(world, "p1", 24, 16);
    me.status = "out";
    const R = balance.player.radiusM;
    let blockers = 0;
    for (let ring = 1; ring <= balance.player.returnSearchRings; ring++) {
      const d = balance.player.spawnOffsetM * ring;
      for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1], [Math.SQRT1_2, Math.SQRT1_2], [-Math.SQRT1_2, Math.SQRT1_2], [Math.SQRT1_2, -Math.SQRT1_2], [-Math.SQRT1_2, -Math.SQRT1_2]] as const) {
        const x = mate.x + dx * d;
        const y = mate.y + dy * d;
        if (circleHitsBuilding(world, x, y, R) || x < R || y < R) continue; // already blocked by the bus
        spawnZombie(world, "walker", x, y);
        blockers++;
      }
    }
    expect(blockers).toBeGreaterThan(10);
    returnOutPlayers(world);
    expect(me.status).toBe("alive");
    expect(circleHitsBuilding(world, me.x, me.y, R), `returned at (${me.x}, ${me.y})`).toBe(false);
    expect(me.x >= R && me.x <= map.widthM - R && me.y >= R && me.y <= map.heightM - R).toBe(true);
  });
});
