import { describe, expect, it } from "vitest";
import { loadBalance } from "../config/balance";
import { TICK_DT_S } from "../config/constants";
import type { SimEvent } from "../core/simEvents";
import { createWorld, step, type World } from "../core/world";
import { snapshotWorld } from "../core/worldSnapshot";
import { addPlayer } from "../player/player";
import { spawnRing } from "./spawnRing";
import { spawnZombie } from "./zombiePool";

const balance = loadBalance();
const run = (world: World, ticks: number) => {
  for (let i = 0; i < ticks; i++) step(world, TICK_DT_S);
};

describe("Walker AI", () => {
  it("walks straight at the player at 1.2 m/s", () => {
    const world = createWorld({ balance, seed: 1 });
    addPlayer(world, "local", 30, 10);
    const id = spawnZombie(world, "walker", 10, 10);
    run(world, 20);
    expect(world.zombies.x[id]).toBeCloseTo(11.2, 4);
    expect(world.zombies.y[id]).toBeCloseTo(10, 4);
  });

  it("targets the nearer of two players", () => {
    const world = createWorld({ balance, seed: 1 });
    addPlayer(world, "a", 5, 10);
    addPlayer(world, "b", 20, 10);
    const id = spawnZombie(world, "walker", 14, 10);
    run(world, 10);
    expect(world.zombies.x[id]).toBeGreaterThan(14); // toward b (6 m) not a (9 m)
  });

  it("ignores dead players", () => {
    const world = createWorld({ balance, seed: 1 });
    const a = addPlayer(world, "a", 13, 10);
    addPlayer(world, "b", 30, 10);
    a.status = "dead";
    const id = spawnZombie(world, "walker", 12, 10);
    run(world, 10);
    expect(world.zombies.x[id]).toBeGreaterThan(12);
  });

  it("spreads 50 Walkers spawned on one point into a crowd", () => {
    const world = createWorld({ balance, seed: 1 });
    for (let i = 0; i < 50; i++) spawnZombie(world, "walker", 24, 16);
    run(world, 60); // no player: only separation acts
    const z = world.zombies;
    const ids = Array.from(z.aliveIds.subarray(0, z.aliveCount));
    let minD = Infinity;
    let sumNearest = 0;
    for (const i of ids) {
      let nearest = Infinity;
      for (const j of ids) {
        if (i === j) continue;
        nearest = Math.min(nearest, Math.hypot((z.x[i] as number) - (z.x[j] as number), (z.y[i] as number) - (z.y[j] as number)));
      }
      minD = Math.min(minD, nearest);
      sumNearest += nearest;
    }
    const combinedRadii = 0.7;
    expect(minD).toBeGreaterThan(0.5 * combinedRadii);
    expect(sumNearest / ids.length).toBeGreaterThan(0.6);
  });

  it("wraps the crowd around the player instead of overlapping them", () => {
    const world = createWorld({ balance, seed: 1 });
    const p = addPlayer(world, "local", 24, 16);
    p.hp = 1e9; // survive the test
    spawnRing(world, "walker", 30, 24, 16, 6);
    run(world, 200);
    const z = world.zombies;
    for (let i = 0; i < z.aliveCount; i++) {
      const id = z.aliveIds[i] as number;
      const d = Math.hypot((z.x[id] as number) - p.x, (z.y[id] as number) - p.y);
      expect(d).toBeGreaterThanOrEqual(0.75 - 1e-3); // 0.35 + 0.4
    }
  });

  it("is deterministic for a fixed seed", () => {
    const make = () => {
      const world = createWorld({ balance, seed: 9 });
      addPlayer(world, "local", 24, 16).hp = 1e9;
      spawnRing(world, "walker", 40, 24, 16, 30);
      run(world, 300);
      return snapshotWorld(world);
    };
    expect(make()).toEqual(make());
  });
});

describe("contact damage (FR9)", () => {
  function contactWorld(walkers: number) {
    const world = createWorld({ balance, seed: 1 });
    const p = addPlayer(world, "local", 24, 16);
    const events: SimEvent[] = [];
    world.events.subscribe((e) => events.push(e));
    for (let i = 0; i < walkers; i++) spawnZombie(world, "walker", 24 + (i === 0 ? 0.74 : -0.74), 16);
    return { world, p, events };
  }

  it("hits on contact, then exactly once per second", () => {
    const { world, p, events } = contactWorld(1);
    step(world, TICK_DT_S);
    expect(p.hp).toBe(90);
    run(world, 19);
    expect(p.hp).toBe(90);
    step(world, TICK_DT_S);
    expect(p.hp).toBe(80);
    expect(events.filter((e) => e.type === "player.damaged")).toHaveLength(2);
  });

  it("two Walkers deal two hits per second", () => {
    const { world, p } = contactWorld(2);
    run(world, 20);
    expect(p.hp).toBe(80);
  });

  it("has no regeneration", () => {
    const world = createWorld({ balance, seed: 1 });
    const p = addPlayer(world, "local", 24, 16);
    p.hp = 40;
    run(world, 1200);
    expect(p.hp).toBe(40);
  });

  it("kills the player at 0 HP and stops targeting them", () => {
    const { world, p, events } = contactWorld(1);
    p.hp = 15;
    run(world, 21);
    expect(p.hp).toBe(0);
    expect(p.status).toBe("dead");
    expect(events.filter((e) => e.type === "player.died")).toEqual([{ type: "player.died", playerId: "local" }]);
    const hitsAfter = events.filter((e) => e.type === "player.damaged").length;
    run(world, 40);
    expect(events.filter((e) => e.type === "player.damaged").length).toBe(hitsAfter);
  });
});
