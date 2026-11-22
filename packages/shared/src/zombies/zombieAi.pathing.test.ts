import { describe, expect, it } from "vitest";
import { loadBalance } from "../config/balance";
import { TICK_DT_S } from "../config/constants";
import { addBuildingAt, type Building, type BuildingRotation } from "../buildings/buildings";
import { circleOverlapsBox } from "../buildings/collision";
import type { SimEvent } from "../core/simEvents";
import { ticksFor } from "../core/time";
import { createWorld, step, type World } from "../core/world";
import { snapshotWorld } from "../core/worldSnapshot";
import { addPlayer } from "../player/player";
import { flowFieldMaxAgeTicks } from "./flowField";
import { spawnZombie } from "./zombiePool";

/** Story 3.5: zombies path around buildings and break them. One mechanic per test: no wave director. */
const NO_WAVES = { waves: () => {} };
const balance = loadBalance();
const WOOD = "wood_barricade";
const walker = balance.zombies.types.walker as { radiusM: number; damage: number; attackIntervalS: number };
const HP = balance.buildings.types[WOOD]?.hp ?? 0;

function setup(seed: number) {
  const world = createWorld({ balance, seed, systems: NO_WAVES });
  const events: SimEvent[] = [];
  world.events.subscribe((e) => events.push(e));
  let nextId = 1;
  const wall = (gx: number, gy: number, rot: BuildingRotation = 0) =>
    addBuildingAt(world, { id: nextId++, type: WOOD, ownerId: "p0", gx, gy, rot, hp: HP }) as Building;
  return { world, events, wall };
}

/** Four barricades closing a 2 × 1.5 m box around (24, 16): the corner gaps are 0.5 m (a zombie is 0.7 m). */
function closedBox(wall: (gx: number, gy: number) => Building): Building[] {
  return [wall(24, 15), wall(24, 17), wall(22, 16), wall(26, 16)];
}

function zombieInAnyBuilding(world: World): boolean {
  const z = world.zombies;
  for (let i = 0; i < z.aliveCount; i++) {
    const id = z.aliveIds[i] as number;
    for (const b of world.buildings.list) {
      if (circleOverlapsBox(z.x[id] as number, z.y[id] as number, walker.radiusM - 0.06, b.minX, b.minY, b.maxX, b.maxY)) return true;
    }
  }
  return false;
}

/** Some zombie is in contact with a player standing at (x, y). */
function zombieTouches(world: World, x: number, y: number): boolean {
  const z = world.zombies;
  const contact = walker.radiusM + balance.player.radiusM + 0.03;
  for (let i = 0; i < z.aliveCount; i++) {
    const id = z.aliveIds[i] as number;
    if (Math.hypot((z.x[id] as number) - x, (z.y[id] as number) - y) <= contact) return true;
  }
  return false;
}

describe("zombies follow the flow field (Story 3.5)", () => {
  it("route around a wall to the player without touching its HP", () => {
    const { world, events, wall } = setup(1);
    addPlayer(world, "p0", 22, 8);
    const walls = [wall(20, 11), wall(22, 11), wall(24, 11)]; // x [19, 25], y [10.75, 11.25]
    const id = spawnZombie(world, "walker", 22, 14);
    let reachedAt = -1;
    for (let t = 0; t < 600 && reachedAt < 0; t++) {
      step(world, TICK_DT_S);
      expect(zombieInAnyBuilding(world)).toBe(false);
      if (events.some((e) => e.type === "player.damaged")) reachedAt = t;
    }
    expect(reachedAt).toBeGreaterThan(0);
    // The round trip: ~4 m to the end, ~4 m back up; at 1.2 m/s well under 20 s.
    expect(reachedAt).toBeLessThan(400);
    for (const b of walls) expect(b.hp).toBe(HP);
    expect(world.buildings.list).toHaveLength(3);
    expect(Math.hypot((world.zombies.x[id] as number) - 22, (world.zombies.y[id] as number) - 8)).toBeLessThan(1);
  });

  it("without buildings they still walk straight (Epic 1 behaviour unchanged)", () => {
    const { world } = setup(1);
    addPlayer(world, "p0", 30, 10);
    const id = spawnZombie(world, "walker", 10, 10);
    for (let t = 0; t < 20; t++) step(world, TICK_DT_S);
    expect(world.zombies.x[id]).toBeCloseTo(11.2, 4);
    expect(world.zombies.y[id]).toBeCloseTo(10, 4);
  });

  it("a fully closed box: zombies attack a building at their normal damage and rate", () => {
    const { world, events, wall } = setup(2);
    addPlayer(world, "p0", 24, 16);
    const box = closedBox(wall);
    const id = spawnZombie(world, "walker", 24, 21);
    const hits: number[] = [];
    let lastHp = box.reduce((s, b) => s + b.hp, 0);
    for (let t = 0; t < 400; t++) {
      step(world, TICK_DT_S);
      expect(zombieInAnyBuilding(world)).toBe(false);
      const hp = box.reduce((s, b) => s + b.hp, 0);
      if (hp < lastHp) {
        expect(lastHp - hp).toBe(walker.damage);
        hits.push(world.tick);
      }
      lastHp = hp;
    }
    expect(events.some((e) => e.type === "player.damaged")).toBe(false); // the box holds
    expect(hits.length).toBeGreaterThanOrEqual(10);
    for (let i = 1; i < hits.length; i++) expect((hits[i] as number) - (hits[i - 1] as number)).toBe(ticksFor(walker.attackIntervalS));
    // It hit the bottom wall (the cheapest way in) from outside.
    expect((box[1] as Building).hp).toBeLessThan(HP);
    const zx = world.zombies.x[id] as number;
    const zy = world.zombies.y[id] as number;
    expect(zx > 23 && zx < 25 && zy > 15.25 && zy < 16.75).toBe(false);
  });

  it("a closed box breaks: 0 HP removes the building, emits building.destroyed, the field opens and the zombies get in", () => {
    const { world, events, wall } = setup(3);
    world.debug.godMode = true;
    addPlayer(world, "p0", 24, 16);
    closedBox(wall);
    for (let i = 0; i < 6; i++) spawnZombie(world, "walker", 21 + i * 1.2, 22);
    let destroyedAt = -1;
    let reachedAt = -1;
    for (let t = 0; t < 1200 && reachedAt < 0; t++) {
      step(world, TICK_DT_S);
      expect(zombieInAnyBuilding(world)).toBe(false);
      if (destroyedAt < 0 && events.some((e) => e.type === "building.destroyed")) destroyedAt = world.tick;
      if (destroyedAt >= 0 && world.tick - destroyedAt === flowFieldMaxAgeTicks(world)) {
        // Rebuild after destruction: the field in use was seeded after the building went.
        expect(world.pathing.chase.sourceTick).toBeGreaterThanOrEqual(destroyedAt);
      }
      if (destroyedAt >= 0 && zombieTouches(world, 24, 16)) reachedAt = world.tick; // god mode: no damage events
    }
    expect(destroyedAt).toBeGreaterThan(0);
    expect(reachedAt).toBeGreaterThan(destroyedAt);
    const destroyed = events.filter((e) => e.type === "building.destroyed");
    expect(destroyed).toHaveLength(1); // one breach is enough
    expect(destroyed[0]).toMatchObject({ type: "building.destroyed", buildingType: WOOD, ownerId: "p0" });
    expect(world.buildings.list).toHaveLength(3);
    expect(world.pathing.nav.version).toBe(world.buildings.version);
  });

  it("a player in contact is hit first; the wall waits", () => {
    const { world, events, wall } = setup(4);
    addPlayer(world, "p0", 24, 18.2); // outside the box, right under its bottom wall
    const box = closedBox(wall);
    spawnZombie(world, "walker", 24, 21);
    for (let t = 0; t < 150; t++) step(world, TICK_DT_S);
    expect(events.filter((e) => e.type === "player.damaged").length).toBeGreaterThan(3);
    for (const b of box) expect(b.hp).toBe(HP);
  });

  it("is deterministic with buildings, attacks and a breach", () => {
    const run = () => {
      const { world, wall } = setup(9);
      world.debug.godMode = true;
      addPlayer(world, "p0", 24, 16);
      addPlayer(world, "p1", 6, 6);
      closedBox(wall);
      wall(10, 10, 1);
      for (let i = 0; i < 20; i++) spawnZombie(world, "walker", 2 + i * 2, i % 2 === 0 ? 30 : 2);
      for (let t = 0; t < 900; t++) step(world, TICK_DT_S);
      return snapshotWorld(world);
    };
    const a = run();
    expect(a.buildings.list.length).toBeLessThan(5); // something broke
    expect(run()).toEqual(a);
  });
});
