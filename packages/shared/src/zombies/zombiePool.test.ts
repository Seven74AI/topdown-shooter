import { describe, expect, it } from "vitest";
import { loadBalance } from "../config/balance";
import { TICK_DT_S, ZOMBIE_POOL_CAPACITY, ZOMBIE_SLOT_HOLD_TICKS } from "../config/constants";
import { createWorld, step } from "../core/world";
import type { SimEvent } from "../core/simEvents";
import { isZombieAlive, killZombie, spawnZombie } from "./zombiePool";
import { ZOMBIE_STATE } from "./zombieTypes";

const balance = loadBalance();
const newWorld = () => createWorld({ balance, seed: 1 });

describe("zombie pool", () => {
  it("spawns a Walker with stats from balance (FR20)", () => {
    const world = newWorld();
    const id = spawnZombie(world, "walker", 5, 6);
    const z = world.zombies;
    expect(id).toBe(0);
    expect(z.hp[id]).toBe(10);
    expect(z.x[id]).toBe(5);
    expect(z.state[id]).toBe(ZOMBIE_STATE.CHASE);
    expect(z.aliveCount).toBe(1);
    expect(isZombieAlive(z, id)).toBe(true);
  });

  it("frees the slot on kill and emits zombie.killed", () => {
    const world = newWorld();
    const seen: SimEvent[] = [];
    world.events.subscribe((e) => seen.push(e));
    const id = spawnZombie(world, "walker", 5, 6);
    killZombie(world, id, "local", "pistol");
    world.events.flush();
    expect(isZombieAlive(world.zombies, id)).toBe(false);
    expect(world.zombies.aliveCount).toBe(0);
    expect(seen).toEqual([{ type: "zombie.killed", zombieId: id, killerId: "local", x: 5, y: 6, weapon: "pistol" }]);
    killZombie(world, id, "local", "pistol"); // killing twice is a no-op
    expect(world.zombies.freedCount).toBe(1);
  });

  it("holds a freed slot for 1 s before reuse and bumps its generation", () => {
    const world = newWorld();
    const id = spawnZombie(world, "walker", 1, 1);
    killZombie(world, id, null, "pistol");
    expect(spawnZombie(world, "walker", 1, 1)).not.toBe(id); // still held: a never-used slot
    for (let i = 0; i < ZOMBIE_SLOT_HOLD_TICKS; i++) world.tick++;
    const reused = spawnZombie(world, "walker", 1, 1);
    expect(reused).toBe(id);
    expect(world.zombies.generation[id]).toBe(1);
  });

  it("reuses several freed slots oldest-first, each after its own hold", () => {
    const world = newWorld();
    const a = spawnZombie(world, "walker", 1, 1);
    const b = spawnZombie(world, "walker", 1, 1);
    killZombie(world, a, null, "pistol"); // freed at tick 0
    world.tick = 5;
    killZombie(world, b, null, "pistol"); // freed at tick 5
    world.tick = ZOMBIE_SLOT_HOLD_TICKS; // a is ready, b is not
    expect(spawnZombie(world, "walker", 1, 1)).toBe(a);
    expect(spawnZombie(world, "walker", 1, 1)).not.toBe(b);
    world.tick = 5 + ZOMBIE_SLOT_HOLD_TICKS;
    expect(spawnZombie(world, "walker", 1, 1)).toBe(b);
  });

  it("wraps the generation counter from 255 to 0", () => {
    const world = newWorld();
    const id = spawnZombie(world, "walker", 1, 1);
    world.zombies.generation[id] = 255;
    killZombie(world, id, null, "pistol");
    world.tick += ZOMBIE_SLOT_HOLD_TICKS;
    expect(spawnZombie(world, "walker", 1, 1)).toBe(id);
    expect(world.zombies.generation[id]).toBe(0);
  });

  it("returns -1 when every slot is alive or held", () => {
    const world = newWorld();
    for (let i = 0; i < ZOMBIE_POOL_CAPACITY; i++) expect(spawnZombie(world, "walker", 1, 1)).toBe(i);
    expect(spawnZombie(world, "walker", 1, 1)).toBe(-1);
    killZombie(world, 3, null, "pistol");
    expect(spawnZombie(world, "walker", 1, 1)).toBe(-1); // held
  });

  it("never allocates: 10,000 spawn/kill cycles keep the same arrays", () => {
    const world = newWorld();
    const before = world.zombies.x;
    for (let i = 0; i < 10_000; i++) {
      const id = spawnZombie(world, "walker", 2, 2);
      if (id >= 0) killZombie(world, id, null, "pistol");
      if (i % 8 === 0) step(world, TICK_DT_S);
    }
    expect(world.zombies.x).toBe(before);
    expect(world.zombies.x.length).toBe(ZOMBIE_POOL_CAPACITY);
  });

  it("keeps the alive list consistent under swap-remove", () => {
    const world = newWorld();
    const ids = [0, 1, 2, 3, 4].map(() => spawnZombie(world, "walker", 1, 1));
    killZombie(world, ids[1] as number, null, "pistol");
    killZombie(world, ids[4] as number, null, "pistol");
    const alive = Array.from(world.zombies.aliveIds.subarray(0, world.zombies.aliveCount)).sort();
    expect(alive).toEqual([0, 2, 3]);
    for (const id of alive) expect(world.zombies.aliveIds[world.zombies.alivePos[id] as number]).toBe(id);
  });
});
