import { describe, expect, it } from "vitest";
import { NO_SYSTEMS, createWorld, loadBalance, spawnZombie, zombieNetId } from "@topdown/shared";
import { CosmeticProjectiles } from "./cosmeticProjectiles";

const balance = loadBalance();
const FRAME = 1 / 60;

function setup() {
  const world = createWorld({ balance, seed: 0, systems: NO_SYSTEMS });
  const seen: number[] = [];
  const c = new CosmeticProjectiles(world, "p0", (id) => seen.push(id));
  return { world, c, seen };
}

const fly = (c: CosmeticProjectiles, frames: number) => {
  for (let i = 0; i < frames; i++) c.update(FRAME);
};

describe("CosmeticProjectiles (Story 2.7)", () => {
  it("a Pistol shot stops at the first mirror zombie and reports it once", () => {
    const { world, c, seen } = setup();
    const a = spawnZombie(world, "walker", 14, 16);
    spawnZombie(world, "walker", 16, 16);
    c.spawn("p0", "pistol", 10, 16, 1, 0);
    fly(c, 30);
    expect(world.projectiles.aliveCount).toBe(0);
    expect(seen).toEqual([zombieNetId(a, world.zombies.generation[a] as number)]);
  });

  it("a Hunting Rifle shot passes through 5 zombies and stops at the 5th", () => {
    const { world, c, seen } = setup();
    for (let i = 0; i < 6; i++) spawnZombie(world, "walker", 12 + i, 16);
    c.spawn("p0", "hunting_rifle", 10, 16, 1, 0);
    fly(c, 60);
    expect(seen).toHaveLength(5);
    expect(world.projectiles.aliveCount).toBe(0);
    expect(world.projectiles.x[0]).toBeLessThan(17);
  });

  it("is freed at its range and draws without lerp (prevX = x)", () => {
    const { world, c } = setup();
    const id = c.spawn("p0", "pistol", 10, 16, 1, 0);
    c.update(FRAME);
    expect(world.projectiles.prevX[id]).toBe(world.projectiles.x[id]);
    expect(world.projectiles.x[id]).toBeCloseTo(11, 5); // 60 m/s × 1/60 s
    fly(c, 20);
    expect(world.projectiles.aliveCount).toBe(0);
    expect(world.projectiles.x[id]).toBeCloseTo(10 + (balance.weapons.pistol?.rangeM ?? 0), 4);
  });

  it("never changes a mirror zombie's HP or position, and others' shots report nothing", () => {
    const { world, c, seen } = setup();
    const z = spawnZombie(world, "walker", 14, 16);
    const hp = world.zombies.hp[z];
    c.spawn("p1", "smg", 10, 16, 1, 0);
    c.spawn("p0", "pistol", 10, 16, 1, 0);
    fly(c, 30);
    expect(world.zombies.hp[z]).toBe(hp);
    expect([world.zombies.x[z], world.zombies.y[z]]).toEqual([14, 16]);
    expect(world.zombies.aliveCount).toBe(1);
    expect(seen).toHaveLength(1); // only mine
  });

  it("does not spawn melee weapons and clear() frees everything", () => {
    const { world, c } = setup();
    expect(c.spawn("p0", "machete", 10, 16, 1, 0)).toBe(-1);
    c.spawn("p0", "pistol", 10, 16, 1, 0);
    c.spawn("p0", "pistol", 10, 17, 1, 0);
    c.clear();
    expect(world.projectiles.aliveCount).toBe(0);
  });
});
