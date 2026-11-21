import { describe, expect, it } from "vitest";
import { loadBalance } from "../config/balance";
import type { SimEvent } from "../core/simEvents";
import { createWorld } from "../core/world";
import { spawnZombie } from "../zombies/zombiePool";
import { applyZombieDamage } from "./damage";

describe("applyZombieDamage", () => {
  it("emits zombie.hit, pushes back, and kills at 0 HP once", () => {
    const world = createWorld({ balance: loadBalance(), seed: 1 });
    const events: SimEvent[] = [];
    world.events.subscribe((e) => events.push(e));
    const id = spawnZombie(world, "walker", 10, 10);
    expect(applyZombieDamage(world, id, 4, 1, 0, 0.5, "p", "pistol")).toBe(false);
    expect(world.zombies.hp[id]).toBe(6);
    expect(world.zombies.x[id]).toBeCloseTo(10.5, 5);
    expect(applyZombieDamage(world, id, 6, 0, 1, 0.5, "p", "pistol")).toBe(true);
    expect(applyZombieDamage(world, id, 6, 0, 1, 0.5, "p", "pistol")).toBe(false); // already dead
    world.events.flush();
    expect(events.map((e) => e.type)).toEqual(["zombie.hit", "zombie.hit", "zombie.killed"]);
  });

  it("clamps pushback to the map", () => {
    const world = createWorld({ balance: loadBalance(), seed: 1 });
    const id = spawnZombie(world, "walker", 0.4, 10);
    applyZombieDamage(world, id, 1, -1, 0, 5, null, "pistol");
    expect(world.zombies.x[id]).toBeCloseTo(0.35, 5);
  });
});
