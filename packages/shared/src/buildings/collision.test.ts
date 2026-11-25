import { describe, expect, it } from "vitest";
import { loadBalance } from "../config/balance";
import { BUILD_GRID_M, TICK_DT_S } from "../config/constants";
import type { SimEvent } from "../core/simEvents";
import { PREDICTION_SYSTEMS } from "../core/systems";
import { createWorld, setInput, step, type World } from "../core/world";
import { DOWNTOWN_MAP } from "../map/downtown";
import { applyDecayStage } from "../decay/applyDecayStage";
import { NEUTRAL_INPUT, type PlayerInput } from "../net/input";
import { findFreeSpotNear, spotBlocked } from "../player/freeSpot";
import { addPlayer } from "../player/player";
import { startBuild } from "../run/runStateMachine";
import { spawnZombie } from "../zombies/zombiePool";
import { addBuildingAt, type Building, type BuildingRotation } from "./buildings";
import { PUSH_ESCAPED, PUSH_MOVED, PUSH_NONE, PUSH_STUCK, circleOverlapsBox, pushEscapes, pushOutOfBuildings, pushed, segmentHitsBox } from "./collision";

/** Story 3.4 (FR53): barricades block players and zombies; projectiles pass over. One mechanic per test. */
const balance = loadBalance();
const R = balance.player.radiusM;
const RZ = balance.zombies.types.walker?.radiusM ?? 0;
const WOOD = "wood_barricade";
let nextId = 1;
/** A barricade with its min corner at (x, y) metres (on the 0.5 m lattice). rot 0: 2 × 0.5 m; rot 1: 0.5 × 2 m. */
const wall = (world: World, x: number, y: number, rot: BuildingRotation = 0): Building => {
  const b = addBuildingAt(world, { id: nextId++, type: WOOD, ownerId: "p0", gx: x / BUILD_GRID_M, gy: y / BUILD_GRID_M, rot, hp: 200 });
  if (!b) throw new Error("wall not added");
  return b;
};
const move = (seq: number, moveX: number, moveY: number): PlayerInput => ({ ...NEUTRAL_INPUT, seq, moveX, moveY, aimX: moveX, aimY: moveY });
/** No circle of radius r (minus float noise) overlaps any building. */
const clearOfAll = (world: World, x: number, y: number, r: number): boolean =>
  world.buildings.list.every((b) => !circleOverlapsBox(x, y, r - 1e-6, b.minX, b.minY, b.maxX, b.maxY));

function walker(x: number, y: number) {
  const world = createWorld({ balance, seed: 1, systems: { waves: () => {}, zombies: () => {} } });
  const p = addPlayer(world, "p0", x, y);
  startBuild(world);
  return { world, p };
}

describe("circle vs box", () => {
  it("overlap is strict (touching is not an overlap)", () => {
    expect(circleOverlapsBox(0, 1.4, 0.4, -1, 0, 1, 1)).toBe(true);
    expect(circleOverlapsBox(0, 1.4000001, 0.4, -1, 0, 1, 1)).toBe(false);
    expect(circleOverlapsBox(1.3, 1.3, 0.4, -1, 0, 1, 1)).toBe(false); // corner: 0.42 m away
  });

  it("pushes out along the closest point; a centre inside leaves on the side it came from", () => {
    const world = createWorld({ balance, seed: 1 });
    wall(world, 9, 9.5); // [9, 11] × [9.5, 10]
    expect(pushOutOfBuildings(world, 10, 10.2, 0.4, 10, 10.6)).toBe(PUSH_MOVED);
    expect(pushed.x).toBe(10);
    expect(pushed.y).toBeCloseTo(10.4, 12);
    // Centre inside, nearer the bottom face, but it came from above (review M1): out of the top.
    expect(pushOutOfBuildings(world, 10, 9.9, 0.4, 10, 9)).toBe(PUSH_MOVED);
    expect(pushed).toEqual({ x: 10, y: 9.1 });
    expect(pushOutOfBuildings(world, 10, 12, 0.4, 10, 12)).toBe(PUSH_NONE);
    expect(pushed).toEqual({ x: 10, y: 12 });
  });

  it("a slot narrower than the body is STUCK: the circle stays where it came from", () => {
    const world = createWorld({ balance, seed: 1 });
    wall(world, 19, 10, 1); // [19, 19.5] × [10, 12]
    wall(world, 20, 10, 1); // [20, 20.5] × [10, 12]: a 0.5 m slot at x ∈ [19.5, 20]
    const e0 = pushEscapes.count;
    expect(pushOutOfBuildings(world, 19.75, 11, 0.4, 19.75, 12.5)).toBe(PUSH_STUCK);
    expect(pushed).toEqual({ x: 19.75, y: 12.5 });
    // Fix bloater-car-corner: with the escape on, a legal start spot keeps the old rule too.
    expect(pushOutOfBuildings(world, 19.75, 11, 0.4, 19.75, 12.5, true, true)).toBe(PUSH_STUCK);
    expect(pushed).toEqual({ x: 19.75, y: 12.5 });
    expect(pushEscapes.count).toBe(e0);
  });

  it("fix bloater-car-corner: a start spot dropped into a slot narrower than the body leaves by a mouth, along the slot, never through a wall", () => {
    const world = createWorld({ balance, seed: 1 });
    wall(world, 19, 10, 1); // [19, 19.5] × [10, 12]
    wall(world, 20, 10, 1); // [20, 20.5] × [10, 12]: a 0.5 m slot at x ∈ [19.5, 20]
    const e0 = pushEscapes.count;
    let tried = 0;
    for (let fy = 10.05; fy < 12; fy += 0.1) {
      for (let fx = 19.55; fx < 20; fx += 0.1) {
        tried++;
        expect(circleOverlapsBox(fx, fy, 0.4, 19, 10, 19.5, 12) || circleOverlapsBox(fx, fy, 0.4, 20, 10, 20.5, 12)).toBe(true);
        // Without the escape: stuck where it is (the old rule; decay relocation and every other caller).
        expect(pushOutOfBuildings(world, fx, fy, 0.4, fx, fy)).toBe(PUSH_STUCK);
        expect(pushOutOfBuildings(world, fx, fy, 0.4, fx, fy, true, true), `(${fx.toFixed(2)}, ${fy.toFixed(2)})`).toBe(PUSH_ESCAPED);
        const at = `(${fx.toFixed(2)}, ${fy.toFixed(2)}) -> (${pushed.x.toFixed(3)}, ${pushed.y.toFixed(3)})`;
        expect(clearOfAll(world, pushed.x, pushed.y, 0.4), at).toBe(true);
        // Its centre's way out crosses neither wall: along the slot and out of a mouth (then it may go on diagonally).
        expect(segmentHitsBox(fx, fy, pushed.x - fx, pushed.y - fy, 19, 10, 19.5, 12), `${at}: through the west wall`).toBe(false);
        expect(segmentHitsBox(fx, fy, pushed.x - fx, pushed.y - fy, 20, 10, 20.5, 12), `${at}: through the east wall`).toBe(false);
        expect(pushed.y < 10 || pushed.y > 12, `${at}: out of a mouth`).toBe(true);
        // The nearer mouth, where it is clearly nearer (past 1 m the rings are 0.25 m apart, so near the middle either may come first).
        if (Math.abs(fy - 11) > 0.4) expect(pushed.y < 10, `${at}: the nearer mouth`).toBe(fy < 11);
      }
    }
    expect(tried).toBe(100);
    expect(pushEscapes.count).toBe(e0 + 100);
  });

  it("fix bloater-car-corner: a centre placed inside the join of two touching car-sized boxes (its start spot inside too) leaves to the nearest clear spot", () => {
    // Two 2 m thick boxes in a T (the Downtown curb cars in the road). Thinner walls (0.5 m barricades) never trap a body:
    // the bounce needs the horizontal box's nearest face to be the join, i.e. a box thicker than the body.
    const solids = [
      { name: "h_car", minX: 14, minY: 14.5, maxX: 18.5, maxY: 16.5 },
      { name: "v_car", minX: 15.5, minY: 16.5, maxX: 17.5, maxY: 21 },
    ];
    const world = createWorld({ balance, seed: 1, map: { ...DOWNTOWN_MAP, solids, cover: [] }, systems: { waves: () => {} } });
    expect(world.obstacles.solids.map((s) => s.name)).toEqual(["h_car", "v_car"]);
    // In the horizontal box near its bottom face: pushed out of it into the vertical one, and back.
    const e0 = pushEscapes.count;
    expect(pushOutOfBuildings(world, 15.55, 15.55, 0.4, 15.55, 15.55)).toBe(PUSH_STUCK); // the old rule: stays inside
    expect(pushOutOfBuildings(world, 15.55, 15.55, 0.4, 15.55, 15.55, true, true)).toBe(PUSH_ESCAPED);
    expect(pushEscapes.count).toBe(e0 + 1); // it took the escape
    expect(solids.every((s) => !circleOverlapsBox(pushed.x, pushed.y, 0.4 - 1e-6, s.minX, s.minY, s.maxX, s.maxY))).toBe(true);
    // The nearest clear spot is 1.45 m up (over the top face, y 14.1); past 1 m the rings are 0.25 m apart.
    expect(Math.hypot(pushed.x - 15.55, pushed.y - 15.55)).toBeLessThanOrEqual(1.45 + 0.25 + 1e-9);
    // The same target from a legal start spot (beside the join): the ordinary push-out takes it out, no escape.
    expect(pushOutOfBuildings(world, 15.55, 15.55, 0.4, 15, 17.3, true, true)).toBe(PUSH_MOVED);
    expect(pushEscapes.count).toBe(e0 + 1);
    expect(solids.every((s) => !circleOverlapsBox(pushed.x, pushed.y, 0.4 - 1e-6, s.minX, s.minY, s.maxX, s.maxY))).toBe(true);
  });

  it("fix bloater-car-corner: a centre deep in a box against the map edge (pushed off the map and clamped back) leaves too", () => {
    const world = createWorld({ balance, seed: 1, map: DOWNTOWN_MAP, systems: { waves: () => {} } });
    const kiosk = world.obstacles.solids.find((s) => s.name === "gas_kiosk");
    expect(kiosk && kiosk.maxX === world.map.widthM && kiosk.minY === 0).toBe(true); // the 7 × 6 m box in the map's corner
    expect(pushOutOfBuildings(world, 47.01, 2.5, 0.6, 47.01, 2.5)).toBe(PUSH_STUCK); // the old rule
    expect(pushOutOfBuildings(world, 47.01, 2.5, 0.6, 47.01, 2.5, true, true)).toBe(PUSH_ESCAPED);
    expect(pushed.y).toBeGreaterThanOrEqual(6 + 0.6 - 1e-9); // out of its bottom face, the only one on the map
    expect(world.obstacles.solids.every((s) => !circleOverlapsBox(pushed.x, pushed.y, 0.6 - 1e-6, s.minX, s.minY, s.maxX, s.maxY))).toBe(true);
  });
});

describe("players vs barricades (shared movePlayers)", () => {
  it("stops at the face when walking straight into it", () => {
    const { world, p } = walker(20, 16);
    wall(world, 19, 12.5); // y ∈ [12.5, 13]
    for (let i = 1; i <= 60; i++) {
      setInput(world, "p0", move(i, 0, -1));
      step(world, TICK_DT_S);
      expect(p.y).toBeGreaterThanOrEqual(13 + R - 1e-9);
    }
    expect(p.y).toBeCloseTo(13 + R, 9);
    expect(p.x).toBe(20);
  });

  it("slides along the face and round the end when walking at an angle", () => {
    const { world, p } = walker(20, 16);
    wall(world, 19, 12.5);
    for (let i = 1; i <= 80; i++) {
      setInput(world, "p0", move(i, 0.5, -1));
      step(world, TICK_DT_S);
      expect(clearOfAll(world, p.x, p.y, R)).toBe(true);
    }
    expect(p.y).toBeLessThan(12); // got round the end
  });

  it("H1: can't walk through a 0.5 m slot between two parallel barricades (wiggling too)", () => {
    const { world, p } = walker(19.75, 14);
    wall(world, 19, 10, 1);
    wall(world, 20, 10, 1);
    for (let i = 1; i <= 120; i++) {
      setInput(world, "p0", move(i, i % 10 < 5 ? 0.15 : -0.15, -1));
      step(world, TICK_DT_S);
      expect(clearOfAll(world, p.x, p.y, R)).toBe(true);
      expect(p.y).toBeGreaterThan(12);
    }
  });

  it("H1: can't squeeze between a barricade and the map edge through a 0.5 m gap", () => {
    const { world, p } = walker(0.4, 14);
    wall(world, 0.5, 10, 1); // [0.5, 1] × [10, 12]: 0.5 m from the left edge
    for (let i = 1; i <= 100; i++) {
      setInput(world, "p0", move(i, -0.3, -1));
      step(world, TICK_DT_S);
      expect(clearOfAll(world, p.x, p.y, R)).toBe(true);
      expect(p.x).toBeGreaterThanOrEqual(R - 1e-9);
      expect(p.y).toBeGreaterThan(12);
    }
  });

  it("H2: a ring of four barricades is a closed region (from inside, walking every way)", () => {
    const { world, p } = walker(20.25, 13.25);
    wall(world, 19, 12, 0); // top    [19, 21] × [12, 12.5]
    wall(world, 21, 12, 1); // right  [21, 21.5] × [12, 14]
    wall(world, 19.5, 14, 0); // bottom [19.5, 21.5] × [14, 14.5]
    wall(world, 19, 12.5, 1); // left   [19, 19.5] × [12.5, 14.5]  → inside [19.5, 21] × [12.5, 14]
    for (let i = 1; i <= 400; i++) {
      const a = i / 7;
      setInput(world, "p0", move(i, Math.cos(a), Math.sin(a * 1.3)));
      step(world, TICK_DT_S);
      expect(p.x).toBeGreaterThan(19.5 + R - 1e-6);
      expect(p.x).toBeLessThan(21 - R + 1e-6);
      expect(p.y).toBeGreaterThan(12.5 + R - 1e-6);
      expect(p.y).toBeLessThan(14 - R + 1e-6);
    }
  });

  it("the prediction World (input + movePlayers only) with the same buildings ends exactly where the server does", () => {
    const server = createWorld({ balance, seed: 3, systems: { waves: () => {}, zombies: () => {} } });
    const predicted = createWorld({ balance, seed: 0, systems: PREDICTION_SYSTEMS });
    for (const w of [server, predicted]) {
      addPlayer(w, "p0", 20, 16);
      nextId = 1;
      wall(w, 19, 12.5);
      wall(w, 21, 12.5, 1); // an L corner
      wall(w, 16, 13, 1);
      wall(w, 16.5, 13, 1); // a slot
    }
    startBuild(server);
    for (let i = 1; i <= 300; i++) {
      const a = i / 13;
      for (const w of [server, predicted]) {
        setInput(w, "p0", move(i, Math.cos(a), Math.sin(a) - 0.5));
        step(w, TICK_DT_S);
      }
      expect(predicted.players.get("p0")?.x).toBe(server.players.get("p0")?.x);
      expect(predicted.players.get("p0")?.y).toBe(server.players.get("p0")?.y);
    }
  });
});

describe("zombies vs barricades", () => {
  const zworld = () => {
    const world = createWorld({ balance, seed: 1, systems: { waves: () => {} } });
    world.debug.godMode = true;
    return world;
  };

  it("a Walker chasing a player behind a wall never crosses it", () => {
    const world = zworld();
    addPlayer(world, "p0", 20, 16);
    wall(world, 17, 18.5);
    wall(world, 19, 18.5);
    wall(world, 21, 18.5); // [17, 23] × [18.5, 19]
    const id = spawnZombie(world, "walker", 20, 23);
    for (let i = 0; i < 200; i++) {
      step(world, TICK_DT_S);
      expect(clearOfAll(world, world.zombies.x[id] as number, world.zombies.y[id] as number, RZ - 1e-6)).toBe(true);
    }
    // Story 3.5: it no longer presses on the wall's middle, it walks round its end (flowField tests).
    expect(world.zombies.y[id]).toBeLessThan(18.5);
  });

  it("H1: zombies don't pass a slot narrower than their body", () => {
    const world = zworld();
    addPlayer(world, "p0", 19.75, 15);
    wall(world, 19, 10, 1);
    wall(world, 20, 10, 1);
    const ids = [spawnZombie(world, "walker", 19.75, 7), spawnZombie(world, "walker", 19.6, 6.2), spawnZombie(world, "walker", 19.9, 5.4)];
    for (let i = 0; i < 300; i++) {
      step(world, TICK_DT_S);
      for (const id of ids) {
        const x = world.zombies.x[id] as number;
        const y = world.zombies.y[id] as number;
        expect(clearOfAll(world, x, y, RZ)).toBe(true); // so never inside the slot (it is narrower than 2 × RZ)
        expect(x > 19.5 && x < 20 && y > 10 && y < 12).toBe(false);
      }
    }
  });

  it("H2: an L corner and a T joint leave no gap: a zombie on one side never reaches the other", () => {
    const world = zworld();
    addPlayer(world, "p0", 22.5, 13.5); // inside the corner pocket
    wall(world, 20, 12, 0); // [20, 22] × [12, 12.5]
    wall(world, 22, 12, 0); // [22, 24] × [12, 12.5]   (a wall)
    wall(world, 21.5, 12.5, 1); // [21.5, 22] × [12.5, 14.5]: T joint under the wall
    wall(world, 24, 12, 1); // [24, 24.5] × [12, 14]: L corner at the wall's right end
    // Zombies above the wall and left of the stem.
    const ids = [spawnZombie(world, "walker", 22.5, 10), spawnZombie(world, "walker", 24.4, 10.5), spawnZombie(world, "walker", 20.8, 13.5)];
    const was = new Map<number, { x: number; y: number }>();
    for (const id of ids) was.set(id, { x: world.zombies.x[id] as number, y: world.zombies.y[id] as number });
    for (let i = 0; i < 400; i++) {
      step(world, TICK_DT_S);
      for (const id of ids) {
        const x = world.zombies.x[id] as number;
        const y = world.zombies.y[id] as number;
        expect(clearOfAll(world, x, y, RZ)).toBe(true);
        const inPocket = x > 22 && x < 24 && y > 12.5 && y < 14;
        const prev = was.get(id) as { x: number; y: number };
        const wasIn = prev.x > 22 && prev.x < 24 && prev.y > 12.5 && prev.y < 14;
        // Story 3.5: zombies now path round into the pocket, but only through its open bottom (y ≥ 13.5), never a corner.
        if (inPocket && !wasIn) expect(prev.y).toBeGreaterThan(13.5);
        was.set(id, { x, y });
      }
    }
  });

  it("M1: a player shoving a zombie into a barricade never pushes it through", () => {
    const world = zworld();
    const p = addPlayer(world, "p0", 20, 10.5);
    wall(world, 19, 12.5); // [19, 21] × [12.5, 13]
    const id = spawnZombie(world, "walker", 20, 12.5 - RZ);
    for (let i = 1; i <= 60; i++) {
      setInput(world, "p0", move(i, 0, 1)); // walk down onto the zombie, up to the wall
      step(world, TICK_DT_S);
      expect(world.zombies.y[id]).toBeLessThan(12.5);
    }
    expect(p.y).toBeLessThanOrEqual(12.5 - R + 1e-9);
  });

  it("a crowd pressing on a barricade stays out of it", () => {
    const world = zworld();
    addPlayer(world, "p0", 24, 12);
    for (let x = 14; x <= 32; x += 2) wall(world, x, 15.5); // [14, 34] × [15.5, 16]
    for (let i = 0; i < 40; i++) spawnZombie(world, "walker", 18 + (i % 10) * 1.2, 19 + Math.floor(i / 10));
    for (let t = 0; t < 300; t++) step(world, TICK_DT_S);
    const z = world.zombies;
    for (let i = 0; i < z.aliveCount; i++) {
      const id = z.aliveIds[i] as number;
      expect(clearOfAll(world, z.x[id] as number, z.y[id] as number, RZ)).toBe(true);
    }
  });
});

describe("barricades stop bullets, everyone's (designer 2026-11-23, replacing FR53's pass-over)", () => {
  const shootDown = (world: World) => {
    const events: SimEvent[] = [];
    world.events.subscribe((e) => events.push(e));
    for (let i = 1; i <= 10; i++) {
      setInput(world, "p0", { ...NEUTRAL_INPUT, seq: i, aimX: 0, aimY: 1, fire: true });
      step(world, TICK_DT_S);
    }
    return events;
  };

  it("my own shot across my own barricade stops on it: the zombie behind is never hit, and the shot did fire", () => {
    const world = createWorld({ balance, seed: 1, systems: { waves: () => {}, zombies: () => {} } });
    const p = addPlayer(world, "p0", 20, 16);
    p.hp = 1e9;
    wall(world, 19, 17.5); // owned by p0
    const id = spawnZombie(world, "walker", 20, 21);
    const events = shootDown(world);
    expect(events.some((e) => e.type === "weapon.fired")).toBe(true);
    expect(events.some((e) => e.type === "zombie.hit" && e.zombieId === id)).toBe(false);
  });

  it("an upgraded (metal) barricade stops it too; a turret doesn't", () => {
    for (const type of ["metal_barricade", "auto_turret"] as const) {
      const world = createWorld({ balance, seed: 1, systems: { waves: () => {}, zombies: () => {} } });
      const p = addPlayer(world, "p0", 20, 16);
      p.hp = 1e9;
      expect(addBuildingAt(world, { id: nextId++, type, ownerId: "p1", gx: 19.5 / BUILD_GRID_M, gy: 17.5 / BUILD_GRID_M, rot: 0, hp: 300 })).not.toBeNull();
      const id = spawnZombie(world, "walker", 20, 21);
      const hit = shootDown(world).some((e) => e.type === "zombie.hit" && e.zombieId === id);
      expect(hit, type).toBe(type === "auto_turret");
    }
  });

  it("with no barricade the same shot hits (liveness)", () => {
    const world = createWorld({ balance, seed: 1, systems: { waves: () => {}, zombies: () => {} } });
    const p = addPlayer(world, "p0", 20, 16);
    p.hp = 1e9;
    const id = spawnZombie(world, "walker", 20, 21);
    expect(shootDown(world).some((e) => e.type === "zombie.hit" && e.zombieId === id)).toBe(true);
  });
});

describe("free spots (spotBlocked) avoid buildings", () => {
  it("a spot on a barricade is blocked; the free-spot search skips it", () => {
    const world = createWorld({ balance, seed: 1 });
    const mate = addPlayer(world, "p1", 20, 16);
    const me = addPlayer(world, "p0", 5, 5);
    expect(spotBlocked(world, 21.5, 16, R, me)).toBe(false);
    wall(world, 21, 15, 1); // [21, 21.5] × [15, 17]: the +x ring point at 21.5 overlaps
    expect(spotBlocked(world, 21.5, 16, R, me)).toBe(true);
    const out = { x: 0, y: 0 };
    expect(findFreeSpotNear(world, mate.x, mate.y, me, out)).toBe(true);
    expect(out).toEqual({ x: 18.5, y: 16 }); // the next direction (−x)
  });

  it("a diagonal press into the pocket between a box corner and the map edge reaches its resting spot (3.4 re-review)", () => {
    const world = createWorld({ balance, seed: 1, systems: { waves: () => {}, zombies: () => {} } });
    const p = addPlayer(world, "p0", 13.0, 0.9);
    wall(world, 10, 0.5); // x 10–12, y 0.5–1: a pocket 0.5 m high under it, too low for a 0.8 m body
    for (let seq = 1; seq <= 60; seq++) {
      setInput(world, "p0", move(seq, -Math.SQRT1_2, -Math.SQRT1_2));
      step(world, TICK_DT_S);
    }
    // Resting spot: on the edge (y = r), touching the box's corner (12, 0.5): x = 12 + sqrt(r² − (0.5 − r)²).
    expect(p.y).toBeCloseTo(R, 6);
    expect(p.x).toBeCloseTo(12 + Math.sqrt(R * R - (0.5 - R) ** 2), 1);
    expect(clearOfAll(world, p.x, p.y, R)).toBe(true);
  });
});

/**
 * Review M1 (fix escape-narrow-openings): the escape's way out must be one the body can take. Three
 * probes rebuilt from the review: a body wedged outside a sealed fort's 0.5 m murder hole, bodies dropped
 * into the hole, and a body next to a seam between two touching boxes.
 */
describe("the escape never squeezes a body through an opening narrower than itself (review M1)", () => {
  const RZ_W = balance.zombies.types.walker?.radiusM ?? 0.35;
  /** A barricade fort: inside [19.5, 24] × [9, 12]; the north wall [19.5, 21.5] + [22, 24] at y [8.5, 9] leaves a 0.5 m hole at x [21.5, 22]. */
  const fortWorld = (): World => {
    const world = createWorld({ balance, seed: 1, systems: { waves: () => {} } });
    for (const [x, y, rot] of [
      [19.5, 8.5, 0], [22, 8.5, 0], [19, 8.5, 1], [19, 10.5, 1], [24, 8.5, 1], [24, 10.5, 1], [19.5, 12, 0], [21.5, 12, 0],
    ] as const) addBuildingAt(world, { id: nextId++, type: WOOD, ownerId: "p0", gx: x / BUILD_GRID_M, gy: y / BUILD_GRID_M, rot: rot as BuildingRotation, hp: 200 });
    return world;
  };
  const inFort = (x: number, y: number): boolean => x > 19.5 && x < 24 && y > 9 && y < 12;

  it("(a) wedged outside the hole (in a 0.5 m gap between the fort and a barricade north of it): it never ends inside the fort", () => {
    const world = fortWorld();
    addBuildingAt(world, { id: nextId++, type: WOOD, ownerId: "p0", gx: 20.5 / BUILD_GRID_M, gy: 7.5 / BUILD_GRID_M, rot: 0, hp: 200 }); // [20.5, 22.5] × [7.5, 8]
    let escapes = 0;
    const bad: string[] = [];
    for (let x = 20.55; x < 22.5; x += 0.05) {
      const e0 = pushEscapes.count;
      pushOutOfBuildings(world, x, 8.25, RZ_W, x, 8.25, true, true);
      escapes += pushEscapes.count - e0;
      if (inFort(pushed.x, pushed.y) && bad.length < 5) bad.push(`(${x.toFixed(2)}, 8.25) -> (${pushed.x.toFixed(2)}, ${pushed.y.toFixed(2)})`);
    }
    expect(escapes, "liveness: the gap really wedged them").toBeGreaterThan(10);
    expect(bad).toEqual([]);
  });

  it("(b) dropped into the hole: it leaves by the open side, never into the sealed fort", () => {
    const world = fortWorld();
    const bad: string[] = [];
    let tried = 0;
    for (let x = 21.55; x < 22; x += 0.05) {
      for (let y = 8.55; y < 9; y += 0.05) {
        tried++;
        expect(pushOutOfBuildings(world, x, y, RZ_W, x, y, true, true), `(${x.toFixed(2)}, ${y.toFixed(2)})`).toBe(PUSH_ESCAPED);
        expect(clearOfAll(world, pushed.x, pushed.y, RZ_W)).toBe(true);
        if ((inFort(pushed.x, pushed.y) || pushed.y > 9) && bad.length < 5) bad.push(`(${x.toFixed(2)}, ${y.toFixed(2)}) -> (${pushed.x.toFixed(2)}, ${pushed.y.toFixed(2)})`);
      }
    }
    expect(tried).toBe(81);
    expect(bad).toEqual([]);
  });

  it("(c) next to a seam between two touching boxes: it never slides through the seam (the far side is nearer than the gap's ends)", () => {
    // A [10, 12] × [8, 12] and B [10, 12] × [12, 16] touch along y = 12; D [8, 9.7] × [8, 16] leaves a 0.3 m gap west of them.
    const solids = [
      { name: "a", minX: 10, minY: 8, maxX: 12, maxY: 12 },
      { name: "b", minX: 10, minY: 12, maxX: 12, maxY: 16 },
      { name: "d", minX: 8, minY: 8, maxX: 9.7, maxY: 16 },
    ];
    const world = createWorld({ balance, seed: 1, map: { ...DOWNTOWN_MAP, solids, cover: [] }, systems: { waves: () => {} } });
    for (let y = 11.8; y <= 12.2 + 1e-9; y += 0.1) {
      expect(pushOutOfBuildings(world, 9.85, y, RZ_W, 9.85, y, true, true)).toBe(PUSH_ESCAPED);
      const at = `(9.85, ${y.toFixed(2)}) -> (${pushed.x.toFixed(2)}, ${pushed.y.toFixed(2)})`;
      expect(solids.every((s) => !circleOverlapsBox(pushed.x, pushed.y, RZ_W - 1e-6, s.minX, s.minY, s.maxX, s.maxY)), at).toBe(true);
      expect(pushed.x, `${at}: through the seam`).toBeLessThan(10); // out of the gap's north or south end
    }
  });

  it("(d) a centre inside a box whose only near way out is a seam between two touching boxes: the seam is a wall (boxes grown by 1e-9)", () => {
    // E [6, 12] × [11, 13] holds the centre; F above and G below touch it; A [12, 14] × [10, 12] and B [12, 14] × [12, 14]
    // touch E's east face and each other along y = 12. Only the west end (x ≤ 5.65) is a real way out.
    const solids = [
      { name: "e", minX: 6, minY: 11, maxX: 12, maxY: 13 },
      { name: "f", minX: 6, minY: 9, maxX: 12, maxY: 11 },
      { name: "g", minX: 6, minY: 13, maxX: 12, maxY: 15 },
      { name: "a", minX: 12, minY: 10, maxX: 14, maxY: 12 },
      { name: "b", minX: 12, minY: 12, maxX: 14, maxY: 14 },
    ];
    const world = createWorld({ balance, seed: 1, map: { ...DOWNTOWN_MAP, solids, cover: [] }, systems: { waves: () => {} } });
    expect(pushOutOfBuildings(world, 11.9, 12, RZ_W, 11.9, 12, true, true)).toBe(PUSH_ESCAPED);
    const at = `(11.9, 12) -> (${pushed.x.toFixed(2)}, ${pushed.y.toFixed(2)})`;
    expect(solids.every((s) => !circleOverlapsBox(pushed.x, pushed.y, RZ_W - 1e-6, s.minX, s.minY, s.maxX, s.maxY)), at).toBe(true);
    expect(pushed.x, `${at}: along the seam`).toBeLessThan(6);
  });

  it("(e) / review L-D: wedged where every way out is a squeeze (two boxes over a 0.5 m gap, open ground both sides): never frozen, it squeezes out within a second", () => {
    // Wall [10, 12] + [12.5, 14.5] × [10, 10.5] with a 0.5 m gap at x [12, 12.5]; K [11, 13.5] × [9, 9.425] north of it leaves
    // 0.575 m, less than a Walker (0.7 m). Pressed in between over the gap, the body overlaps K and the gap's corners by ~1 cm,
    // and every way out is narrower than it. Round 1 left it there for good (a cached dead end); now the last-resort pass
    // squeezes it out to open ground.
    const solids = [
      { name: "w1", minX: 10, minY: 10, maxX: 12, maxY: 10.5 },
      { name: "w2", minX: 12.5, minY: 10, maxX: 14.5, maxY: 10.5 },
      { name: "k", minX: 11, minY: 9, maxX: 13.5, maxY: 9.425 },
    ];
    for (const [px, py] of [[12.25, 4], [12.25, 16], [4, 9.7], [20, 9.7]] as const) {
      const world = createWorld({ balance, seed: 1, map: { ...DOWNTOWN_MAP, solids, cover: [] }, systems: { waves: () => {} } });
      world.debug.godMode = true;
      addPlayer(world, "p0", px, py);
      const ids: number[] = [];
      for (let x = 12.15; x <= 12.35 + 1e-9; x += 0.1) {
        expect(solids.some((s) => circleOverlapsBox(x, 9.765, RZ_W, s.minX, s.minY, s.maxX, s.maxY)), "liveness: the start overlaps").toBe(true);
        ids.push(spawnZombie(world, "walker", x, 9.765));
      }
      const x0 = ids.map((id) => world.zombies.x[id] as number);
      const y0 = ids.map((id) => world.zombies.y[id] as number);
      for (let t = 0; t < 20; t++) step(world, TICK_DT_S);
      for (let k = 0; k < ids.length; k++) {
        const id = ids[k] as number;
        const moved = Math.hypot((world.zombies.x[id] as number) - (x0[k] as number), (world.zombies.y[id] as number) - (y0[k] as number));
        expect(moved, `player (${px}, ${py}): Walker ${k} frozen`).toBeGreaterThan(0.25);
        expect(solids.every((s) => !circleOverlapsBox(world.zombies.x[id] as number, world.zombies.y[id] as number, RZ_W - 1e-5, s.minX, s.minY, s.maxX, s.maxY))).toBe(true);
      }
    }
  });

  it("(e′) the clearance rule: a 0.68 m slot (a body overlaps both sides by 1 cm) with a far exit up the slot and a near one through a 0.5 m gap: the slot wins", () => {
    // KL [10, 11.66] and KR [12.34, 14] × [8, 12]: a slot 0.68 m wide, open to the north (y < 8). South of it, a wall
    // [10, 11.75] + [12.25, 14] × [12.5, 13] with a 0.5 m gap, open ground beyond. From (12, 11.7) the gap is the nearer
    // way out (~1.7 m) but only 0.25 m clear; up the slot (~3.8 m) it keeps the body's own 0.34 m.
    const solids = [
      { name: "kl", minX: 10, minY: 8, maxX: 11.66, maxY: 12 },
      { name: "kr", minX: 12.34, minY: 8, maxX: 14, maxY: 12 },
      { name: "w1", minX: 10, minY: 12.5, maxX: 11.75, maxY: 13 },
      { name: "w2", minX: 12.25, minY: 12.5, maxX: 14, maxY: 13 },
    ];
    const world = createWorld({ balance, seed: 1, map: { ...DOWNTOWN_MAP, solids, cover: [] }, systems: { waves: () => {} } });
    for (const y of [11.5, 11.6, 11.7]) {
      expect(pushOutOfBuildings(world, 12, y, RZ_W, 12, y, true, true)).toBe(PUSH_ESCAPED);
      const at = `(12, ${y}) -> (${pushed.x.toFixed(2)}, ${pushed.y.toFixed(2)})`;
      expect(solids.every((s) => !circleOverlapsBox(pushed.x, pushed.y, RZ_W - 1e-6, s.minX, s.minY, s.maxX, s.maxY)), at).toBe(true);
      expect(pushed.y, `${at}: through the 0.5 m gap instead of up the slot`).toBeLessThan(8);
    }
  });

  it("review M-A: forts 6 and 10 m deep (a 0.5 m murder hole, a 0.3 m outer gap; and a car against the wall over the hole): nobody ends inside", () => {
    for (const depth of [6, 10]) {
      for (const car of [false, true]) {
        const top = 9 + depth;
        const solids = [
          { name: "n1", minX: 19.5, minY: 8.5, maxX: 21.5, maxY: 9 },
          { name: "n2", minX: 22, minY: 8.5, maxX: 24, maxY: 9 }, // the hole: x [21.5, 22]
          { name: "w", minX: 19, minY: 8.5, maxX: 19.5, maxY: top + 0.5 },
          { name: "e", minX: 24, minY: 8.5, maxX: 24.5, maxY: top + 0.5 },
          { name: "s", minX: 19.5, minY: top, maxX: 24, maxY: top + 0.5 },
          car ? { name: "car", minX: 20.5, minY: 6.5, maxX: 23, maxY: 8.5 } : { name: "bar", minX: 20.5, minY: 7.9, maxX: 22.5, maxY: 8.2 }, // the 0.3 m outer gap
        ];
        const world = createWorld({ balance, seed: 1, map: { ...DOWNTOWN_MAP, solids, cover: [] }, systems: { waves: () => {} } });
        const bad: string[] = [];
        let tried = 0;
        // Outside the hole: in the 0.3 m gap, or (car) centres in the car's bottom metre over the hole.
        for (let x = 20.6; x < 22.45; x += 0.05) {
          for (const y of car ? [7.6, 7.9, 8.2, 8.4] : [8.35]) {
            tried++;
            pushOutOfBuildings(world, x, y, RZ_W, x, y, true, true);
            const inside = pushed.x > 19.5 && pushed.x < 24 && pushed.y > 9 && pushed.y < top;
            if (inside && bad.length < 5) bad.push(`depth ${depth}${car ? " car" : ""}: (${x.toFixed(2)}, ${y}) -> (${pushed.x.toFixed(2)}, ${pushed.y.toFixed(2)})`);
          }
        }
        expect(tried).toBeGreaterThan(30);
        expect(bad).toEqual([]);
      }
    }
  });

  it("review M-B: Downtown stage 4, a Brute wedged between parking_wall and parked_car_1 escapes the short way (within 1 m of PR #12's 0.55 m spot)", () => {
    const world = createWorld({ balance, seed: 1, map: DOWNTOWN_MAP, systems: { waves: () => {} } });
    applyDecayStage(world, 4, world.decay.variants);
    const rb = balance.zombies.types.brute?.radiusM ?? 0.6;
    expect(pushOutOfBuildings(world, 11.04, 30.45, rb, 11.04, 30.45, true, true)).toBe(PUSH_ESCAPED);
    // PR #12 (no per-step clearance) put it at (11.147, 30.989); round 1 of this fix sent it 6.75 m north to (11.04, 23.70).
    expect(Math.hypot(pushed.x - 11.147, pushed.y - 30.989)).toBeLessThan(1);
    expect(world.obstacles.solids.every((s) => !circleOverlapsBox(pushed.x, pushed.y, rb - 1e-6, s.minX, s.minY, s.maxX, s.maxY))).toBe(true);
  });

  it("review L-C: a centre on a box face (inside it by the seam margin) is not a dead end", () => {
    const solids = [
      { name: "a", minX: 4, minY: 13, maxX: 8.5, maxY: 15 },
      { name: "b", minX: 2.5, minY: 16, maxX: 7, maxY: 18 },
    ];
    const world = createWorld({ balance, seed: 1, map: { ...DOWNTOWN_MAP, solids, cover: [] }, systems: { waves: () => {} } });
    const rb = balance.zombies.types.brute?.radiusM ?? 0.6;
    expect(pushOutOfBuildings(world, 4.3, 15, rb, 4.3, 15, true, true)).toBe(PUSH_ESCAPED);
    expect(solids.every((s) => !circleOverlapsBox(pushed.x, pushed.y, rb - 1e-6, s.minX, s.minY, s.maxX, s.maxY))).toBe(true);
  });

  it("review N2: an escape with more boxes in reach than its arrays held (64) grows them and still checks every box", () => {
    // The car T (a centre in its join must escape) plus 96 small posts in a field west of it, all within reach.
    // The posts come first in map order, so an escape that dropped boxes past its first 64 would miss the cars.
    const solids: { name: string; minX: number; minY: number; maxX: number; maxY: number }[] = [];
    for (let i = 0; i < 6; i++) for (let j = 0; j < 16; j++) solids.push({ name: `p${i}_${j}`, minX: 4 + i, minY: 8 + j, maxX: 4.2 + i, maxY: 8.2 + j });
    solids.push({ name: "h_car", minX: 14, minY: 14.5, maxX: 18.5, maxY: 16.5 }, { name: "v_car", minX: 15.5, minY: 16.5, maxX: 17.5, maxY: 21 });
    const world = createWorld({ balance, seed: 1, map: { ...DOWNTOWN_MAP, solids, cover: [] }, systems: { waves: () => {} } });
    const within = solids.filter((s) => Math.hypot(Math.max(s.minX - 15.55, 0, 15.55 - s.maxX), Math.max(s.minY - 15.55, 0, 15.55 - s.maxY)) <= 12.4).length;
    expect(within, "liveness: more boxes in reach than the arrays start with").toBeGreaterThan(64);
    expect(pushOutOfBuildings(world, 15.55, 15.55, 0.4, 15.55, 15.55, true, true)).toBe(PUSH_ESCAPED);
    expect(solids.every((s) => !circleOverlapsBox(pushed.x, pushed.y, 0.4 - 1e-6, s.minX, s.minY, s.maxX, s.maxY))).toBe(true);
  });
});
