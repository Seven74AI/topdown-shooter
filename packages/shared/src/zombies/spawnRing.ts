import type { World } from "../core/world";
import { spawnZombie } from "./zombiePool";
import type { ZombieTypeId } from "./zombieTypes";

/** Fraction of the even angular spacing used as random jitter, so a ring doesn't look mechanical. */
const ANGLE_JITTER = 0.4;

/**
 * Spawns `count` zombies evenly around (cx, cy) at `radiusM`, clamped inside the map (a ring larger
 * than the map lands on its edges). Uses the World RNG for jitter. Returns how many spawned.
 * Used by the temporary Epic 1 spawner and by dev cheats (Story 1.11).
 */
export function spawnRing(world: World, type: ZombieTypeId, count: number, cx: number, cy: number, radiusM: number): number {
  const r = world.balance.zombies.types[type]?.radiusM ?? 0.5;
  const { widthM, heightM } = world.map;
  const step = (Math.PI * 2) / Math.max(1, count);
  let spawned = 0;
  for (let i = 0; i < count; i++) {
    const a = i * step + world.rng.range(-ANGLE_JITTER, ANGLE_JITTER) * step;
    const x = Math.min(widthM - r, Math.max(r, cx + Math.cos(a) * radiusM));
    const y = Math.min(heightM - r, Math.max(r, cy + Math.sin(a) * radiusM));
    if (spawnZombie(world, type, x, y) >= 0) spawned++;
  }
  return spawned;
}
