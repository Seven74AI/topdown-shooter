import type { MeleeStats } from "../config/balanceSchema";
import { queryRadius } from "../core/spatialGrid";
import type { World } from "../core/world";
import { circleOverlapsSector } from "../math/sector";
import { DEG_TO_RAD } from "../math/vec";
import type { PlayerState } from "../player/player";
import { isZombieAlive, zombieTypeOf } from "../zombies/zombiePool";
import { maxZombieRadius } from "../zombies/zombieTypes";
import { applyZombieDamage } from "./damage";
import { zombieCandidates as candidates } from "./scratch";
import type { WeaponId } from "./weapons";
import type { ZombieView } from "./rewind";

const MIN_DIST = 1e-6;

/**
 * One instant melee swing (FR14, Story 1.9) from the player's center along the unit aim (dirX, dirY):
 * emits `melee.swung`, then damages every live zombie whose body overlaps the arc
 * (`stats.rangeM` to the zombie's edge, `stats.arcDeg` wide) through `applyZombieDamage`, so the
 * flash, pushback and kill events are the ones guns use. Each zombie is pushed straight away from
 * the player. No aim assist, ignores cover. Requires the zombie grid to be current. Returns hits.
 * Story 2.12: with a `view`, the arc is tested against those (rewound) positions; the damage and
 * the pushback (away from the player, along the rewound direction) go to the present zombie.
 */
export function swingMelee(
  world: World,
  p: PlayerState,
  weapon: WeaponId,
  stats: MeleeStats,
  dirX: number,
  dirY: number,
  view: ZombieView | null = null,
): number {
  const ox = p.x;
  const oy = p.y;
  const reach = stats.rangeM;
  const half = (stats.arcDeg / 2) * DEG_TO_RAD;
  const cosH = Math.cos(half);
  const sinH = Math.sin(half);
  world.events.emit({ type: "melee.swung", playerId: p.id, weapon, x: ox, y: oy, dirX, dirY, arcDeg: stats.arcDeg, rangeM: reach });

  const z = world.zombies;
  const xs = view ? view.x : z.x;
  const ys = view ? view.y : z.y;
  const count = queryRadius(view ? view.grid : world.zombieGrid, xs, ys, ox, oy, reach + maxZombieRadius(world.balance), candidates);
  let hits = 0;
  for (let k = 0; k < count; k++) {
    const id = candidates[k] as number;
    // The grid was built at the start of combat: skip zombies killed earlier this tick.
    if (!isZombieAlive(z, id)) continue;
    const r = world.balance.zombies.types[zombieTypeOf(z, id)]?.radiusM ?? 0;
    const cx = xs[id] as number;
    const cy = ys[id] as number;
    if (!circleOverlapsSector(cx, cy, r, ox, oy, dirX, dirY, reach, cosH, sinH)) continue;
    const vx = cx - ox;
    const vy = cy - oy;
    const d = Math.sqrt(vx * vx + vy * vy);
    const px = d > MIN_DIST ? vx / d : dirX;
    const py = d > MIN_DIST ? vy / d : dirY;
    applyZombieDamage(world, id, stats.damage, px, py, stats.hitPushbackM, p.id, weapon);
    hits++;
  }
  return hits;
}
