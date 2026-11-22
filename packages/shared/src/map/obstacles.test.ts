import { describe, expect, it } from "vitest";
import { loadBalance } from "../config/balance";
import { FLOW_CELL_M, MUZZLE_OFFSET_M } from "../config/constants";
import { createWorld } from "../core/world";
import { snapshotWorld } from "../core/worldSnapshot";
import { circleOverlapsBox } from "../buildings/collision";
import { teamSpawnPoint } from "../player/spawn";
import { jitteredSpawn } from "../waves/waveDirector";
import { maxZombieRadius } from "../zombies/zombieTypes";
import { flowCellAt } from "../zombies/flowField";
import { DOWNTOWN_MAP } from "./downtown";
import { MAP_STAGE_COUNT, type MapBox } from "./districtMap";
import { createObstacles } from "./obstacles";
import { applyDecayStage } from "../decay/applyDecayStage";
import { FIRST_DECAY_STAGE, currentDecayStage } from "./decayStage";

/** Story 4.2: the World's active obstacle lists per decay stage, on the real Downtown data. */
const balance = loadBalance();
const map = DOWNTOWN_MAP;
const names = (l: readonly MapBox[]) => l.map((b) => b.name);
const SOLID_NAMES = map.solids.map((s) => s.name);
const CARS = ["parked_car_1", "parked_car_2", "parked_car_3", "street_car_west", "street_car_east"];

describe("obstacle lists (Story 4.2)", () => {
  it("stage 1: bodies hit the map boxes + the 5 cars (the bus once); shots stop at the same; barrier and sandbags inactive", () => {
    const o = createObstacles(map, 1);
    expect(names(o.solids)).toEqual([...SOLID_NAMES, ...CARS]);
    expect(names(o.shotBlockers)).toEqual([...SOLID_NAMES, ...CARS]);
    expect(names(o.cover)).toEqual(["bus_hull", ...CARS]); // drawn / tested; the bus collides as city_bus
  });

  it("stage 2 adds the police barrier and stage 3 the sandbags to the bodies' list only (bullets fly over them)", () => {
    // Story 4.5: with no variant chosen (mask 0) stage 2 also removes parked_car_3 and adds the
    // dumpster wall (it stops shots); the chosen abandoned car is tested in decay/decay.test.ts.
    const STAGE2_CARS = CARS.filter((c) => c !== "parked_car_3");
    const WALLS = [...SOLID_NAMES, "dumpster_alley_3"];
    const s2 = createObstacles(map, 2);
    expect(names(s2.solids)).toEqual([...WALLS, ...STAGE2_CARS, "police_barrier_north"]);
    expect(names(s2.shotBlockers)).toEqual([...WALLS, ...STAGE2_CARS]);
    const s3 = createObstacles(map, 3);
    expect(names(s3.solids)).toEqual([...WALLS, ...STAGE2_CARS, "police_barrier_north", "sandbags_south"]);
    expect(names(s3.shotBlockers)).toEqual([...WALLS, ...STAGE2_CARS]);
  });

  it("the stage accessor: 1 at the start; applyDecayStage moves it once (no-op when unchanged), and back", () => {
    const world = createWorld({ balance, seed: 1, map });
    expect(currentDecayStage(world)).toBe(FIRST_DECAY_STAGE);
    expect(world.obstacles.stage).toBe(1);
    expect(applyDecayStage(world, 1, world.decay.variants)).toBe(false);
    const nav = world.pathing.nav;
    const sand = map.cover.find((c) => c.name === "sandbags_south") as MapBox;
    const cell = flowCellAt(nav, (sand.minX + sand.maxX) / 2, (sand.minY + sand.maxY) / 2);
    expect(nav.wallAt[cell]).toBe(0);
    expect(applyDecayStage(world, 3, world.decay.variants)).toBe(true);
    expect(world.obstacles).toMatchObject({ stage: 3, version: 1 });
    expect(nav.wallAt[cell]).toBe(1); // the nav grid walls follow the stage
    expect(nav.version).toBe(-1); // re-rasterized on the next pathing tick
    expect(currentDecayStage(world)).toBe(3);
    const snap = snapshotWorld(world).obstacles;
    expect(snap).toMatchObject({ stage: 3, version: 1 });
    expect(snap.solids).toEqual(names(world.obstacles.solids));
    expect(snap.solids).toContain("dumpster_alley_3");
    expect(applyDecayStage(world, 1, world.decay.variants)).toBe(true);
    expect(nav.wallAt[cell]).toBe(0);
  });

  it("the nav grid walls off the active cars from the start (every World, incl. the client's mirror lists)", () => {
    const world = createWorld({ balance, seed: 1, map });
    const nav = world.pathing.nav;
    for (const name of CARS) {
      const c = map.cover.find((k) => k.name === name) as MapBox;
      for (let y = c.minY + FLOW_CELL_M / 2; y < c.maxY; y += FLOW_CELL_M) {
        for (let x = c.minX + FLOW_CELL_M / 2; x < c.maxX; x += FLOW_CELL_M) expect(nav.wallAt[flowCellAt(nav, x, y)], name).toBe(1);
      }
    }
  });

  it("decision D4: every shot blocker is at least a body's muzzle reach thick (a shot can't start beyond a box)", () => {
    const reach = balance.player.radiusM + MUZZLE_OFFSET_M; // the muzzle pokes ≤ reach − radius into a box
    for (let stage = 1; stage <= MAP_STAGE_COUNT; stage++) {
      for (const b of createObstacles(map, stage).shotBlockers) {
        expect(Math.min(b.maxX - b.minX, b.maxY - b.minY), b.name).toBeGreaterThanOrEqual(reach);
      }
    }
  });

  it("at every stage the team start and every spawn (± jitter, grown by the largest zombie) are clear of active cover", () => {
    const jitter = balance.waves.spawnJitterM;
    const rz = maxZombieRadius(balance);
    // Story 4.5: every combination of the variation candidates (any run can pick any of them).
    for (let stage = 1; stage <= MAP_STAGE_COUNT; stage++)
    for (let mask = 0; mask < 1 << map.decayVariants.length; mask++) {
      const world = createWorld({ balance, seed: 1, map });
      applyDecayStage(world, stage, mask);
      const at = { x: 0, y: 0 };
      for (let slot = 0; slot < 4; slot++) {
        teamSpawnPoint(world, slot, at);
        for (const c of world.obstacles.solids) expect(circleOverlapsBox(at.x, at.y, balance.player.radiusM, c.minX, c.minY, c.maxX, c.maxY), `stage ${stage} slot ${slot} in ${c.name}`).toBe(false);
      }
      // Story 4.3: along each spawn's own jitter axis (the wave director's `jitteredSpawn`: windows
      // along their building, manholes along their street), against collision and active cover.
      const lo = { x: 0, y: 0 };
      const hi = { x: 0, y: 0 };
      for (const sp of map.spawnPoints) {
        jitteredSpawn(world, sp, -jitter, rz, lo);
        jitteredSpawn(world, sp, jitter, rz, hi);
        const minX = Math.min(lo.x, hi.x) - rz;
        const maxX = Math.max(lo.x, hi.x) + rz;
        const minY = Math.min(lo.y, hi.y) - rz;
        const maxY = Math.max(lo.y, hi.y) + rz;
        for (const c of world.obstacles.solids) {
          expect(minX < c.maxX && maxX > c.minX && minY < c.maxY && maxY > c.minY, `stage ${stage} mask ${mask}: ${sp.name} vs ${c.name}`).toBe(false);
        }
      }
    }
  });
});
