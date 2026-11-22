import type { World } from "../core/world";
import { maxZombieRadius } from "../zombies/zombieTypes";
import type { PlayerState } from "./player";

/**
 * Free-spot search for placing a player (Epic 2 retro A12; Story 3.1's build-start return). One
 * occupancy check, `spotBlocked`, decides what a circle may not overlap: the map edge, other players
 * (out players are off the map) and alive zombies. **Story 3.4 adds buildings to `spotBlocked`**,
 * so every placement that uses it (this return, later joins) avoids them too.
 */

/** Candidate directions, tried in this order on each ring (fixed: deterministic). */
const DIRS: readonly (readonly [number, number])[] = [
  [1, 0],
  [-1, 0],
  [0, 1],
  [0, -1],
  [Math.SQRT1_2, Math.SQRT1_2],
  [-Math.SQRT1_2, Math.SQRT1_2],
  [Math.SQRT1_2, -Math.SQRT1_2],
  [-Math.SQRT1_2, -Math.SQRT1_2],
];

/** The circle (x, y, r) overlaps the map edge, another placed player or an alive zombie. */
export function spotBlocked(world: Readonly<World>, x: number, y: number, r: number, self: PlayerState | null): boolean {
  const { widthM, heightM } = world.map;
  if (x < r || x > widthM - r || y < r || y > heightM - r) return true;
  for (const p of world.players.values()) {
    if (p === self || p.status === "out") continue;
    const d = r + p.radiusM;
    const dx = p.x - x;
    const dy = p.y - y;
    if (dx * dx + dy * dy < d * d) return true;
  }
  const z = world.zombies;
  const zd = r + maxZombieRadius(world.balance);
  for (let i = 0; i < z.aliveCount; i++) {
    const id = z.aliveIds[i] as number;
    const dx = (z.x[id] as number) - x;
    const dy = (z.y[id] as number) - y;
    if (dx * dx + dy * dy < zd * zd) return true;
  }
  // Story 3.4: buildings here.
  return false;
}

/**
 * The first free spot for `self` around (cx, cy): rings at `spawnOffsetM × 1 … returnSearchRings`,
 * 8 directions each (+x first). Writes it to `out` and returns true, or returns false when every
 * candidate is blocked (the caller falls back). Runs only at a build start: no per-tick cost.
 */
export function findFreeSpotNear(
  world: Readonly<World>,
  cx: number,
  cy: number,
  self: PlayerState,
  out: { x: number; y: number },
): boolean {
  const stats = world.balance.player;
  for (let ring = 1; ring <= stats.returnSearchRings; ring++) {
    const dist = stats.spawnOffsetM * ring;
    for (let i = 0; i < DIRS.length; i++) {
      const [dx, dy] = DIRS[i] as readonly [number, number];
      const x = cx + dx * dist;
      const y = cy + dy * dist;
      if (spotBlocked(world, x, y, self.radiusM, self)) continue;
      out.x = x;
      out.y = y;
      return true;
    }
  }
  return false;
}
