import type { World } from "../core/world";
import { spawnZombie } from "./zombiePool";
import { announceSpawn } from "./brute";
import type { ZombieTypeId } from "./zombieTypes";

/** Fraction of the even angular spacing used as random jitter, so a ring doesn't look mechanical. */
const ANGLE_JITTER = 0.4;

/**
 * Spawns `count` zombies evenly around (cx, cy) at `radiusM`, clamped inside the map (a ring larger
 * than the map lands on its edges). Uses the `spawns` stream for jitter (Story 4.4). Returns how many spawned.
 * Used by the temporary Epic 1 spawner and by dev cheats (Story 1.11).
 */
export function spawnRing(world: World, type: ZombieTypeId, count: number, cx: number, cy: number, radiusM: number): number {
  const r = world.balance.zombies.types[type]?.radiusM ?? 0.5;
  const { widthM, heightM } = world.map;
  const step = (Math.PI * 2) / Math.max(1, count);
  let spawned = 0;
  for (let i = 0; i < count; i++) {
    const a = i * step + world.streams.spawns.range(-ANGLE_JITTER, ANGLE_JITTER) * step;
    const x = Math.min(widthM - r, Math.max(r, cx + Math.cos(a) * radiusM));
    const y = Math.min(heightM - r, Math.max(r, cy + Math.sin(a) * radiusM));
    const id = spawnZombie(world, type, x, y);
    if (id >= 0) {
      spawned++;
      announceSpawn(world, id); // Story 5.7: a dev-cheat Brute roars too (and the run's first gets the banner)
    }
  }
  return spawned;
}

/** A view rectangle in meters (top-left x, y; width, height). */
export interface ViewRect {
  x: number;
  y: number;
  w: number;
  h: number;
}

/** `spawnInView`: spawned zombies keep at least this far from the survivor (they still close in at once). */
export const SPAWN_CLEAR_M = 2.5;
const SPAWN_TRIES = 8;

/**
 * Spawns `count` zombies at seeded random points inside `view` (the World's `spawns` stream, so a run is repeatable),
 * kept `clearM` away from (avoidX, avoidY) and inside the map. Returns how many spawned. Story 1.11 (`?stress`, the
 * "Spawn in view" cheat); Story 10.12: moved here from the client so the server runs the online cheat too.
 */
export function spawnInView(world: World, type: ZombieTypeId, count: number, view: ViewRect, avoidX: number, avoidY: number, clearM = SPAWN_CLEAR_M): number {
  const r = world.balance.zombies.types[type]?.radiusM ?? 0.35;
  const x0 = Math.max(r, view.x + r);
  const x1 = Math.min(world.map.widthM - r, view.x + view.w - r);
  const y0 = Math.max(r, view.y + r);
  const y1 = Math.min(world.map.heightM - r, view.y + view.h - r);
  let spawned = 0;
  for (let i = 0; i < count; i++) {
    let x = x0;
    let y = y0;
    for (let t = 0; t < SPAWN_TRIES; t++) {
      x = world.streams.spawns.range(x0, x1);
      y = world.streams.spawns.range(y0, y1);
      const dx = x - avoidX;
      const dy = y - avoidY;
      if (dx * dx + dy * dy >= clearM * clearM) break;
    }
    const id = spawnZombie(world, type, x, y);
    if (id < 0) break; // pool full
    announceSpawn(world, id); // Story 5.7: a dev-cheat Brute roars (the run's first gets the banner)
    spawned++;
  }
  return spawned;
}
