import { describe, expect, it } from "vitest";
import {
  MAX_PIERCE,
  createProjectilePool,
  freeProjectile,
  projectileHasHit,
  recordProjectileHit,
  spawnProjectile,
  type ProjectileSpawn,
} from "./projectilePool";

const shot = (x = 0): ProjectileSpawn => ({ x, y: 0, dirX: 1, dirY: 0, speedMps: 60, rangeM: 9, damage: 5, pierce: 1, weaponIndex: 0, owner: "p", advanceM: 0 });

describe("projectile pool", () => {
  it("spawns into consecutive slots and fails when full", () => {
    const pool = createProjectilePool(3);
    expect([spawnProjectile(pool, shot()), spawnProjectile(pool, shot()), spawnProjectile(pool, shot())]).toEqual([0, 1, 2]);
    expect(spawnProjectile(pool, shot())).toBe(-1);
  });

  it("frees with swap-remove and reuses the slot, resetting its hit list", () => {
    const pool = createProjectilePool(4);
    const a = spawnProjectile(pool, shot());
    const b = spawnProjectile(pool, shot());
    recordProjectileHit(pool, a, 7);
    freeProjectile(pool, a);
    expect(pool.aliveCount).toBe(1);
    expect(pool.aliveIds[0]).toBe(b);
    expect(pool.owner[a]).toBeNull();
    const c = spawnProjectile(pool, shot());
    expect(c).toBe(a);
    expect(projectileHasHit(pool, c, 7)).toBe(false);
    freeProjectile(pool, a);
    freeProjectile(pool, a); // double free is a no-op
    expect(pool.aliveCount).toBe(1);
  });

  it("records up to MAX_PIERCE hits and clamps pierce", () => {
    const pool = createProjectilePool(2);
    const id = spawnProjectile(pool, { ...shot(), pierce: 99 });
    expect(pool.pierceLeft[id]).toBe(MAX_PIERCE);
    for (let z = 0; z < MAX_PIERCE + 2; z++) recordProjectileHit(pool, id, z);
    expect(pool.hitCount[id]).toBe(MAX_PIERCE);
    expect(projectileHasHit(pool, id, 4)).toBe(true);
    expect(projectileHasHit(pool, id, 6)).toBe(false);
  });
});
