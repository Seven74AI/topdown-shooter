import { describe, expect, it } from "vitest";
import { loadBalance } from "../config/balance";
import { TICK_DT_S } from "../config/constants";
import type { SimEvent } from "../core/simEvents";
import { PREDICTION_SYSTEMS } from "../core/systems";
import { createWorld, setInput, step, type World } from "../core/world";
import { NEUTRAL_INPUT, type PlayerInput } from "../net/input";
import { findFreeSpotNear, spotBlocked } from "../player/freeSpot";
import { addPlayer } from "../player/player";
import { startBuild } from "../run/runStateMachine";
import { spawnZombie } from "../zombies/zombiePool";
import { addBuildingAt, type BuildingRotation } from "./buildings";
import { circleOverlapsBox, pushOutOfBuildings, pushed } from "./collision";

/** Story 3.4 (FR53): barricades block players and zombies; projectiles pass over. One mechanic per test. */
const balance = loadBalance();
const R = balance.player.radiusM;
const WOOD = "wood_barricade";
let nextId = 1;
const wall = (world: World, gx: number, gy: number, rot: BuildingRotation = 0) =>
  addBuildingAt(world, { id: nextId++, type: WOOD, ownerId: "p0", gx, gy, rot, hp: 200 });
const move = (seq: number, moveX: number, moveY: number): PlayerInput => ({ ...NEUTRAL_INPUT, seq, moveX, moveY, aimX: moveX, aimY: moveY });

describe("circle vs box", () => {
  it("overlap is strict (touching is not an overlap)", () => {
    expect(circleOverlapsBox(0, 1.4, 0.4, -1, 0, 1, 1)).toBe(true);
    expect(circleOverlapsBox(0, 1.4, 0.4, -1, 0, 1, 1.0000001)).toBe(true);
    expect(circleOverlapsBox(0, 1.4000001, 0.4, -1, 0, 1, 1)).toBe(false);
    expect(circleOverlapsBox(1.3, 1.3, 0.4, -1, 0, 1, 1)).toBe(false); // corner: 0.42 m away
  });

  it("pushes out along the closest point, or across the nearest face from inside", () => {
    const world = createWorld({ balance, seed: 1 });
    wall(world, 10, 10); // [9, 11] × [9.75, 10.25]
    expect(pushOutOfBuildings(world, 10, 10.5, 0.4)).toBe(true);
    expect(pushed.x).toBe(10);
    expect(pushed.y).toBeCloseTo(10.65, 12);
    expect(pushOutOfBuildings(world, 10.2, 9.9, 0.4)).toBe(true); // inside: top face is nearest
    expect(pushed).toEqual({ x: 10.2, y: 9.35 });
    expect(pushOutOfBuildings(world, 10, 12, 0.4)).toBe(false);
  });
});

describe("players vs barricades (shared movePlayers)", () => {
  function walker(x: number, y: number) {
    const world = createWorld({ balance, seed: 1, systems: { waves: () => {}, zombies: () => {} } });
    const p = addPlayer(world, "p0", x, y);
    startBuild(world);
    return { world, p };
  }

  it("stops at the face when walking straight into it", () => {
    const { world, p } = walker(20, 16);
    const b = wall(world, 20, 13); // y ∈ [12.75, 13.25]
    for (let i = 1; i <= 60; i++) {
      setInput(world, "p0", move(i, 0, -1));
      step(world, TICK_DT_S);
      expect(p.y).toBeGreaterThanOrEqual((b?.maxY ?? 0) + R - 1e-9);
    }
    expect(p.y).toBeCloseTo(13.25 + R, 9);
    expect(p.x).toBe(20);
  });

  it("slides along the face and round the end when walking at an angle", () => {
    const { world, p } = walker(20, 16);
    wall(world, 20, 13);
    for (let i = 1; i <= 80; i++) {
      setInput(world, "p0", move(i, 0.5, -1));
      step(world, TICK_DT_S);
      expect(circleOverlapsBox(p.x, p.y, R - 1e-9, 19, 12.75, 21, 13.25)).toBe(false); // never inside, also round the corner
    }
    expect(p.y).toBeLessThan(12); // got round the end
  });

  it("can't get through a wall of touching barricades, nor between two at a corner", () => {
    const { world, p } = walker(20, 16);
    wall(world, 18, 13);
    wall(world, 20, 13);
    wall(world, 22, 13);
    for (let i = 1; i <= 100; i++) {
      setInput(world, "p0", move(i, i % 20 < 10 ? 0.3 : -0.3, -1));
      step(world, TICK_DT_S);
      expect(p.y).toBeGreaterThan(13.25 + R - 0.01);
    }
  });

  it("the prediction World (input + movePlayers only) with the same buildings ends exactly where the server does", () => {
    const server = createWorld({ balance, seed: 3, systems: { waves: () => {}, zombies: () => {} } });
    const predicted = createWorld({ balance, seed: 0, systems: PREDICTION_SYSTEMS });
    for (const w of [server, predicted]) {
      addPlayer(w, "p0", 20, 16);
      nextId = 1;
      wall(w, 20, 13);
      wall(w, 22, 14, 1);
      wall(w, 17, 14, 1);
    }
    startBuild(server);
    for (let i = 1; i <= 200; i++) {
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
  it("a Walker chasing a player behind a barricade never crosses it", () => {
    const world = createWorld({ balance, seed: 1, systems: { waves: () => {} } });
    addPlayer(world, "p0", 20, 16);
    wall(world, 18, 19);
    wall(world, 20, 19);
    wall(world, 22, 19); // [17, 23] × [18.75, 19.25]
    const id = spawnZombie(world, "walker", 20, 23);
    const rz = balance.zombies.types.walker?.radiusM ?? 0;
    for (let i = 0; i < 200; i++) {
      step(world, TICK_DT_S);
      expect(world.zombies.y[id]).toBeGreaterThanOrEqual(19.25 + rz - 1e-6);
    }
    expect(world.zombies.y[id]).toBeCloseTo(19.25 + rz, 6); // pressed against it
  });

  it("a crowd pressing on a barricade stays out of it", () => {
    const world = createWorld({ balance, seed: 2, systems: { waves: () => {} } });
    addPlayer(world, "p0", 24, 12);
    for (let gx = 15; gx <= 33; gx += 2) wall(world, gx, 16); // [14, 34] × [15.75, 16.25]
    for (let i = 0; i < 40; i++) spawnZombie(world, "walker", 18 + (i % 10) * 1.2, 19 + Math.floor(i / 10));
    const rz = balance.zombies.types.walker?.radiusM ?? 0;
    for (let t = 0; t < 300; t++) step(world, TICK_DT_S);
    const z = world.zombies;
    for (let i = 0; i < z.aliveCount; i++) {
      const id = z.aliveIds[i] as number;
      const x = z.x[id] as number;
      const y = z.y[id] as number;
      // never inside the wall; at most a sliver of overlap from the crowd push this tick
      expect(circleOverlapsBox(x, y, rz - 0.05, 14, 15.75, 34, 16.25)).toBe(false);
    }
  });
});

describe("projectiles pass over barricades (FR53)", () => {
  it("a shot fired across a barricade hits the zombie behind it", () => {
    const world = createWorld({ balance, seed: 1, systems: { waves: () => {}, zombies: () => {} } });
    const p = addPlayer(world, "p0", 20, 16);
    p.hp = 1e9;
    wall(world, 20, 18);
    const id = spawnZombie(world, "walker", 20, 21);
    const events: SimEvent[] = [];
    world.events.subscribe((e) => events.push(e));
    for (let i = 1; i <= 10; i++) {
      setInput(world, "p0", { ...NEUTRAL_INPUT, seq: i, aimX: 0, aimY: 1, fire: true });
      step(world, TICK_DT_S);
    }
    expect(events.some((e) => e.type === "zombie.hit" && e.zombieId === id)).toBe(true);
  });
});

describe("free spots (spotBlocked) avoid buildings", () => {
  it("a spot on a barricade is blocked; the free-spot search skips it", () => {
    const world = createWorld({ balance, seed: 1 });
    const mate = addPlayer(world, "p1", 20, 16);
    const me = addPlayer(world, "p0", 5, 5);
    expect(spotBlocked(world, 21.5, 16, R, me)).toBe(false);
    wall(world, 21, 16, 1); // [20.75, 21.25] × [15, 17]: the +x ring point at 21.5 overlaps
    expect(spotBlocked(world, 21.5, 16, R, me)).toBe(true);
    const out = { x: 0, y: 0 };
    expect(findFreeSpotNear(world, mate.x, mate.y, me, out)).toBe(true);
    expect(out).toEqual({ x: 18.5, y: 16 }); // the next direction (−x)
  });
});
