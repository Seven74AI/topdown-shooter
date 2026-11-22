import { describe, expect, it } from "vitest";
import { loadBalance } from "../config/balance";
import { BUILD_GRID_M, TICK_DT_S } from "../config/constants";
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
  /** A barricade with its min corner at (x, y) metres. */
  const wall = (x: number, y: number, rot: BuildingRotation = 0) =>
    addBuildingAt(world, { id: nextId++, type: WOOD, ownerId: "p0", gx: x / BUILD_GRID_M, gy: y / BUILD_GRID_M, rot, hp: HP }) as Building;
  return { world, events, wall };
}

/** Four barricades closing a 2 × 2 m box [23, 25] × [15, 17] around (24, 16) (corners touch). */
function closedBox(wall: (x: number, y: number, rot?: BuildingRotation) => Building): Building[] {
  return [wall(23, 14.5), wall(23, 17), wall(22.5, 15, 1), wall(25, 15, 1)];
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
    const walls = [wall(19, 10.5), wall(21, 10.5), wall(23, 10.5)]; // [19, 25] × [10.5, 11]
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
    expect(zx > 23 && zx < 25 && zy > 15 && zy < 17).toBe(false);
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
      wall(10, 9, 1);
      for (let i = 0; i < 20; i++) spawnZombie(world, "walker", 2 + i * 2, i % 2 === 0 ? 30 : 2);
      for (let t = 0; t < 900; t++) step(world, TICK_DT_S);
      return snapshotWorld(world);
    };
    const a = run();
    expect(a.buildings.list.length).toBeLessThan(5); // something broke
    expect(run()).toEqual(a);
  });
});

/** Some zombie is within `d` of (x, y). */
function anyZombieNear(world: World, x: number, y: number, d: number): boolean {
  const z = world.zombies;
  for (let i = 0; i < z.aliveCount; i++) {
    const id = z.aliveIds[i] as number;
    if (Math.hypot((z.x[id] as number) - x, (z.y[id] as number) - y) < d) return true;
  }
  return false;
}
const damageOf = (world: World) => world.buildings.list.reduce((s, b) => s + (HP - b.hp), 0);

describe("Story 3.5 review H1: gaps narrower than a body never jam zombies", () => {
  it("P1: a closed box whose only opening is a 0.5 m slot: the zombies break in", () => {
    const { world, events, wall } = setup(11);
    world.debug.godMode = true;
    addPlayer(world, "p0", 24, 16.5);
    // [22, 26] × [14, 19] ring; the bottom wall has a 0.5 m slot at x [24, 24.5].
    for (const [x, y, r] of [[22, 14, 0], [24, 14, 0], [22, 14.5, 1], [22, 16.5, 1], [25.5, 14.5, 1], [25.5, 16.5, 1], [22, 18.5, 0], [24.5, 18.5, 0]] as const) wall(x, y, r);
    for (let i = 0; i < 6; i++) spawnZombie(world, "walker", 20 + i * 1.5, 24);
    let inAt = -1;
    for (let t = 0; t < 1800 && inAt < 0; t++) {
      step(world, TICK_DT_S);
      if (anyZombieNear(world, 24, 16.5, 0.8)) inAt = t;
    }
    expect(events.some((e) => e.type === "building.destroyed")).toBe(true);
    expect(inAt).toBeGreaterThan(0);
  });

  it("P2: a long wall with a 0.5 m slot in the middle and open ends: the zombie gets to the player (no freeze)", () => {
    const { world, wall } = setup(12);
    addPlayer(world, "p0", 24, 8);
    for (const x of [18, 20, 22, 24.5, 26.5, 28.5]) wall(x, 10.5); // slot [24, 24.5]
    spawnZombie(world, "walker", 24.2, 14);
    let reached = -1;
    for (let t = 0; t < 1200 && reached < 0; t++) {
      step(world, TICK_DT_S);
      if (anyZombieNear(world, 24, 8, 0.8)) reached = t;
    }
    expect(reached).toBeGreaterThan(0);
  });

  it("P4: a pen whose only opening is 0.5 m against the map edge: the zombies break in", () => {
    const { world, events, wall } = setup(13);
    world.debug.godMode = true;
    addPlayer(world, "p0", 1.5, 1.2);
    wall(0.5, 3); // [0.5, 2.5] × [3, 3.5]: 0.5 m from the left edge
    wall(2.5, 3);
    wall(4.5, 0, 1);
    wall(4.5, 2, 1); // [4.5, 5] × [0, 4]
    for (let i = 0; i < 4; i++) spawnZombie(world, "walker", 1 + i, 8);
    let inAt = -1;
    for (let t = 0; t < 1800 && inAt < 0; t++) {
      step(world, TICK_DT_S);
      if (anyZombieNear(world, 1.5, 1.2, 0.8)) inAt = t;
    }
    expect(events.some((e) => e.type === "building.destroyed")).toBe(true);
    expect(inAt).toBeGreaterThan(0);
  });

  it("pinch: a ring whose only opening is two offset corners 0.5 m apart: the zombies break in", () => {
    const { world, events, wall } = setup(14);
    world.debug.godMode = true;
    addPlayer(world, "p0", 24, 16.5);
    for (const [x, y, r] of [[22, 14, 0], [24, 14, 0], [22, 14.5, 1], [22, 16.5, 1], [25.5, 14.5, 1], [25.5, 16.5, 1]] as const) wall(x, y, r);
    wall(22.5, 18.5); // [22.5, 24.5] × [18.5, 19]
    wall(25, 19); // [25, 27] × [19, 19.5]: its corner (25, 19) is 0.5 m from (24.5, 19)
    for (let i = 0; i < 6; i++) spawnZombie(world, "walker", 20 + i * 1.5, 25);
    let inAt = -1;
    for (let t = 0; t < 1800 && inAt < 0; t++) {
      step(world, TICK_DT_S);
      if (anyZombieNear(world, 24, 16.5, 0.8)) inAt = t;
    }
    expect(events.some((e) => e.type === "building.destroyed")).toBe(true);
    expect(inAt).toBeGreaterThan(0);
  });

  it("safety net: a jam the grid does not see (pinches wiped) still ends in building attacks", () => {
    const { world, events, wall } = setup(15);
    world.debug.godMode = true;
    addPlayer(world, "p0", 24, 16.5);
    for (const [x, y, r] of [[22, 14, 0], [24, 14, 0], [22, 14.5, 1], [22, 16.5, 1], [25.5, 14.5, 1], [25.5, 16.5, 1], [22, 18.5, 0], [24.5, 18.5, 0]] as const) wall(x, y, r);
    step(world, TICK_DT_S); // rasterize once, then hide the slot's pinch from the field (the version stays)
    world.pathing.nav.pinchE.fill(0);
    world.pathing.nav.pinchS.fill(0);
    for (let i = 0; i < 4; i++) spawnZombie(world, "walker", 21 + i * 1.5, 24);
    for (let t = 0; t < 900; t++) step(world, TICK_DT_S);
    expect(damageOf(world) > 0 || events.some((e) => e.type === "building.destroyed")).toBe(true);
  });
});

describe("Story 3.5 review L1: attack rule details", () => {
  it("a zombie whose next cell is a building hits it only once it touches it", () => {
    const { world, wall } = setup(16);
    addPlayer(world, "p0", 24, 16);
    const box = closedBox(wall); // bottom wall [23, 25] × [17, 17.5]
    for (let t = 0; t < 8; t++) step(world, TICK_DT_S); // the field is ready
    spawnZombie(world, "walker", 24, 17.5 + walker.radiusM + 0.14); // in the cell below the wall, not touching
    step(world, TICK_DT_S);
    expect((box[1] as Building).hp).toBe(HP); // 1.2 m/s × 50 ms = 6 cm: still 8 cm away
    for (let t = 0; t < 40; t++) step(world, TICK_DT_S);
    expect((box[1] as Building).hp).toBeLessThan(HP);
  });

  it("the target is cleared every tick: a zombie that stops following the field (nobody standing) stops hitting", () => {
    const { world, wall } = setup(17);
    const p = addPlayer(world, "p0", 24, 14);
    for (let x = 14; x < 34; x += 2) wall(x, 16); // [14, 34] × [16, 16.5]: breaking (12 m) beats the 20 m walk round
    spawnZombie(world, "walker", 24, 19);
    const hp = () => world.buildings.list.reduce((s, b) => s + b.hp, 0);
    const full = hp();
    let hpAtSwitch = -1;
    for (let t = 0; t < 300; t++) {
      if (hpAtSwitch < 0 && hp() < full) {
        p.status = "downed"; // zombies ignore downed players: no target, no field, so no building either
        hpAtSwitch = hp();
      }
      step(world, TICK_DT_S);
    }
    expect(hpAtSwitch).toBeGreaterThan(0);
    expect(hp()).toBe(hpAtSwitch);
  });
});

describe("Story 3.5 review H1 with Story 3.8's flank field: Runners don't jam in 0.5 m gaps either", () => {
  it("Runners in front of a closed box whose only opening is a 0.5 m slot break in", () => {
    const { world, events, wall } = setup(21);
    world.debug.godMode = true;
    addPlayer(world, "p0", 24, 16.5);
    for (const [x, y, r] of [[22, 14, 0], [24, 14, 0], [22, 14.5, 1], [22, 16.5, 1], [25.5, 14.5, 1], [25.5, 16.5, 1], [22, 18.5, 0], [24.5, 18.5, 0]] as const) wall(x, y, r);
    for (let i = 0; i < 6; i++) spawnZombie(world, "runner", 20 + i * 1.5, 24);
    let inAt = -1;
    for (let t = 0; t < 1800 && inAt < 0; t++) {
      step(world, TICK_DT_S);
      if (anyZombieNear(world, 24, 16.5, 0.8)) inAt = t;
    }
    expect(events.some((e) => e.type === "building.destroyed")).toBe(true);
    expect(inAt).toBeGreaterThan(0);
  });

  it("a Runner behind a long wall with a 0.5 m slot gets to the player (no freeze)", () => {
    const { world, wall } = setup(22);
    addPlayer(world, "p0", 24, 8);
    for (const x of [18, 20, 22, 24.5, 26.5, 28.5]) wall(x, 10.5);
    spawnZombie(world, "runner", 24.2, 14);
    let reached = -1;
    for (let t = 0; t < 1200 && reached < 0; t++) {
      step(world, TICK_DT_S);
      if (anyZombieNear(world, 24, 8, 0.8)) reached = t;
    }
    expect(reached).toBeGreaterThan(0);
  });
});
