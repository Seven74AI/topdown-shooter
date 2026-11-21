import { queryRadius } from "../core/spatialGrid";
import type { World } from "../core/world";
import { DEG_TO_RAD } from "../math/vec";
import { ZOMBIE_POOL_CAPACITY } from "../config/constants";
import { isZombieAlive, zombieTypeOf } from "../zombies/zombiePool";
import { maxZombieRadius } from "../zombies/zombieTypes";

const candidates = new Int32Array(ZOMBIE_POOL_CAPACITY);
const MIN_DIST_SQ = 1e-6;

/**
 * Touch aim assist (FR4): if a zombie within the weapon's range (to its edge) lies within
 * `balance.controls.aimAssistDeg` of the aim direction, the shot turns toward the nearest such
 * zombie (by distance). The target is inside the cone, so turning straight at it is "at most 8°".
 * Writes the unit direction into `out` and returns the target zombie id, or -1 (direction unchanged).
 * Pure over the World: Story 2.7 runs it on the server with server positions.
 * Requires the zombie grid to be current (the combat system rebuilds it first).
 */
export function assistAim(
  world: World,
  ox: number,
  oy: number,
  dirX: number,
  dirY: number,
  rangeM: number,
  out: { x: number; y: number },
): number {
  out.x = dirX;
  out.y = dirY;
  const deg = world.balance.controls.aimAssistDeg;
  if (deg <= 0) return -1;
  const cosLimit = Math.cos(deg * DEG_TO_RAD);
  const z = world.zombies;
  const count = queryRadius(world.zombieGrid, z.x, z.y, ox, oy, rangeM + maxZombieRadius(world.balance), candidates);
  let best = -1;
  let bestD2 = Infinity;
  let bestVx = 0;
  let bestVy = 0;
  for (let k = 0; k < count; k++) {
    const id = candidates[k] as number;
    if (!isZombieAlive(z, id)) continue;
    const r = world.balance.zombies.types[zombieTypeOf(z, id)]?.radiusM ?? 0;
    const vx = (z.x[id] as number) - ox;
    const vy = (z.y[id] as number) - oy;
    const d2 = vx * vx + vy * vy;
    const reach = rangeM + r;
    if (d2 > reach * reach || d2 < MIN_DIST_SQ) continue;
    const d = Math.sqrt(d2);
    if ((vx * dirX + vy * dirY) / d < cosLimit) continue;
    if (d2 < bestD2) {
      best = id;
      bestD2 = d2;
      bestVx = vx / d;
      bestVy = vy / d;
    }
  }
  if (best >= 0) {
    out.x = bestVx;
    out.y = bestVy;
  }
  return best;
}
