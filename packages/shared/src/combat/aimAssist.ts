import { queryRadius } from "../core/spatialGrid";
import type { World } from "../core/world";
import { DEG_TO_RAD } from "../math/vec";
import { segmentCircleT } from "../math/sweep";
import { zombieCandidates as candidates } from "./scratch";
import { isZombieAlive, zombieTypeOf } from "../zombies/zombiePool";
import { maxZombieRadius } from "../zombies/zombieTypes";
import type { ZombieView } from "./rewind";
import { bulletBlockT, bulletLineClear } from "./cover";
import { bossBodyOn } from "../boss/bossState";

const MIN_DIST_SQ = 1e-6;

/**
 * Touch aim assist (FR4): if a zombie within the weapon's range (to its edge) lies within
 * `balance.controls.aimAssistDeg` of the aim direction, the shot turns toward the nearest such
 * zombie (by distance). The target is inside the cone, so turning straight at it is "at most 8°".
 * Assist only helps a shot that would miss: if the raw aim already hits a zombie in range, the aim
 * is kept (it never pulls a shot off the zombie in your face toward one farther away).
 * (ox, oy) is the muzzle, where the projectile starts, so range matches the real shot.
 * Writes the unit direction into `out` and returns the target zombie id, or -1 (direction unchanged).
 * Pure over the World: Story 2.7 runs it on the server with server positions.
 * Requires the zombie grid to be current (the combat system rebuilds it first).
 * Story 2.12: `view` (rewound positions and their grid) replaces the live positions when given.
 * Story 4.2: a zombie behind a shot blocker (car, bus, map box) is neither a target nor a raw hit.
 */
export function assistAim(
  world: World,
  ox: number,
  oy: number,
  dirX: number,
  dirY: number,
  rangeM: number,
  out: { x: number; y: number },
  view: ZombieView | null = null,
): number {
  out.x = dirX;
  out.y = dirY;
  const deg = world.balance.controls.aimAssistDeg;
  if (deg <= 0) return -1;
  const cosLimit = Math.cos(deg * DEG_TO_RAD);
  const z = world.zombies;
  const xs = view ? view.x : z.x;
  const ys = view ? view.y : z.y;
  const count = queryRadius(view ? view.grid : world.zombieGrid, xs, ys, ox, oy, rangeM + maxZombieRadius(world.balance), candidates);
  const ex = ox + dirX * rangeM;
  const ey = oy + dirY * rangeM;
  // Story 4.2: the raw aim "already hits" only a zombie before the first car / bus / map box on it.
  const blockT = bulletBlockT(world, ox, oy, ex, ey);
  let best = -1;
  let bestD2 = Infinity;
  let bestVx = 0;
  let bestVy = 0;
  // Story 6.5 (AC 11): the Behemoth's circle under the same rule (the raw aim on it is kept; else it
  // is a candidate like a zombie). Picking it returns -1 with `out` turned toward it (it has no zombie id).
  let bossBest = false;
  const boss = world.boss;
  if (bossBodyOn(boss)) {
    const br = world.balance.boss.radiusM;
    const rawT = segmentCircleT(ox, oy, ex, ey, boss.x, boss.y, br);
    if (rawT >= 0 && (blockT < 0 || rawT <= blockT)) return -1;
    const vx = boss.x - ox;
    const vy = boss.y - oy;
    const d2 = vx * vx + vy * vy;
    const reach = rangeM + br;
    if (d2 <= reach * reach && d2 >= MIN_DIST_SQ) {
      const d = Math.sqrt(d2);
      if ((vx * dirX + vy * dirY) / d >= cosLimit && bulletLineClear(world, ox, oy, boss.x, boss.y)) {
        bossBest = true;
        bestD2 = d2;
        bestVx = vx / d;
        bestVy = vy / d;
      }
    }
  }
  for (let k = 0; k < count; k++) {
    const id = candidates[k] as number;
    if (!isZombieAlive(z, id)) continue;
    const r = world.balance.zombies.types[zombieTypeOf(z, id)]?.radiusM ?? 0;
    const zx = xs[id] as number;
    const zy = ys[id] as number;
    const rawT = segmentCircleT(ox, oy, ex, ey, zx, zy, r);
    if (rawT >= 0 && (blockT < 0 || rawT <= blockT)) {
      return -1; // the raw aim already hits a zombie: keep it
    }
    const vx = zx - ox;
    const vy = zy - oy;
    const d2 = vx * vx + vy * vy;
    const reach = rangeM + r;
    if (d2 > reach * reach || d2 < MIN_DIST_SQ) continue;
    const d = Math.sqrt(d2);
    if ((vx * dirX + vy * dirY) / d < cosLimit) continue;
    if (d2 < bestD2) {
      if (!bulletLineClear(world, ox, oy, zx, zy)) continue; // Story 4.2: never bend a shot into cover
      best = id;
      bossBest = false;
      bestD2 = d2;
      bestVx = vx / d;
      bestVy = vy / d;
    }
  }
  if (best >= 0 || bossBest) {
    out.x = bestVx;
    out.y = bestVy;
  }
  return best;
}
