import type { World } from "../core/world";
import { maxZombieRadius } from "../zombies/zombieTypes";
import type { PlayerState } from "./player";
import { circleHitsBuilding } from "../buildings/collision";
import { circleInFire } from "../decay/decayState";

/**
 * Free-spot search for placing a player (Epic 2 retro A12; Story 3.1's build-start return). One
 * occupancy check, `spotBlocked`, decides what a circle may not overlap: the map edge, other players
 * (out players are off the map), alive zombies and (Story 3.4) buildings, so every placement that
 * uses it (this return, later joins) avoids them too. Story 4.8 re-review H1: and every burning fire
 * zone (`world.decay.fires`, the damage's own "body touches the ring = burns" rule, `circleInFire`),
 * unless the caller asks for a fire-blind last resort (`avoidFire` false).
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

/**
 * The circle (x, y, r) overlaps the map edge, another placed player, an alive zombie, a building or
 * (Story 4.8 re-review H1, unless `avoidFire` is false) a burning fire zone.
 */
export function spotBlocked(world: Readonly<World>, x: number, y: number, r: number, self: PlayerState | null, avoidFire = true): boolean {
  const { widthM, heightM } = world.map;
  if (x < r || x > widthM - r || y < r || y > heightM - r) return true;
  return bodiesAt(world, x, y, r, self) || circleHitsBuilding(world, x, y, r) || (avoidFire && circleInFire(world.decay.fires, x, y, r));
}

/** Story 4.8 re-review H1: `boxBlocked`, or (when `avoidFire`) the circle is in a burning fire zone. */
export function boxOrFireBlocked(world: Readonly<World>, x: number, y: number, r: number, avoidFire = true): boolean {
  return boxBlocked(world, x, y, r) || (avoidFire && circleInFire(world.decay.fires, x, y, r));
}

/** Story 4.1 review L4: the circle overlaps the map edge, a map box or a building (bodies ignored). */
export function boxBlocked(world: Readonly<World>, x: number, y: number, r: number): boolean {
  const { widthM, heightM } = world.map;
  if (x < r || x > widthM - r || y < r || y > heightM - r) return true;
  return circleHitsBuilding(world, x, y, r);
}

/** Another placed player or an alive zombie overlaps the circle. */
function bodiesAt(world: Readonly<World>, x: number, y: number, r: number, self: PlayerState | null): boolean {
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
  rings = world.balance.player.returnSearchRings,
  /** Story 4.1 review L4: true = only the map edge, map boxes and buildings count (players and zombies ignored). */
  boxesOnly = false,
  /** Story 4.8 re-review H1: burning fire zones count too (false only for a fire-blind last resort). */
  avoidFire = true,
): boolean {
  const stats = world.balance.player;
  for (let ring = 1; ring <= rings; ring++) {
    const dist = stats.spawnOffsetM * ring;
    for (let i = 0; i < DIRS.length; i++) {
      const [dx, dy] = DIRS[i] as readonly [number, number];
      const x = cx + dx * dist;
      const y = cy + dy * dist;
      if (boxesOnly ? boxOrFireBlocked(world, x, y, self.radiusM, avoidFire) : spotBlocked(world, x, y, self.radiusM, self, avoidFire)) continue;
      out.x = x;
      out.y = y;
      return true;
    }
  }
  return false;
}

/**
 * Story 4.5: the first spot round (cx, cy) where a circle of radius `r` is clear of the map edge,
 * map boxes and buildings (bodies ignored): rings at `spawnOffsetM × 1 … rings`, 8 directions each,
 * the same order as `findFreeSpotNear`. For a zombie a decay stage put inside a new box. Build
 * starts only: no per-tick cost.
 */
export function findBoxFreeSpot(world: Readonly<World>, cx: number, cy: number, r: number, rings: number, out: { x: number; y: number }): boolean {
  const step = world.balance.player.spawnOffsetM;
  for (let ring = 1; ring <= rings; ring++) {
    const dist = step * ring;
    for (let i = 0; i < DIRS.length; i++) {
      const [dx, dy] = DIRS[i] as readonly [number, number];
      const x = cx + dx * dist;
      const y = cy + dy * dist;
      if (boxBlocked(world, x, y, r)) continue;
      out.x = x;
      out.y = y;
      return true;
    }
  }
  return false;
}
