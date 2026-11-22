import type { World } from "../core/world";
import { setNavWalls } from "../zombies/flowField";
import { COVER_STOPS_SHOTS, type CoverObject, type DistrictMap, type MapBox } from "./districtMap";
import { currentDecayStage } from "./decayStage";

/**
 * Story 4.2: the World's active obstacles for the current decay stage, built from the frozen map.
 *
 * - `solids`: what bodies collide with and the flow field walls off — the map's collision boxes (in
 *   map order), then every active cover object (all four kinds, in map order) that is not an exact
 *   copy of a collision box (the bus is both `city_bus` and `bus_hull`).
 * - `shotBlockers`: what stops projectiles — the map's collision boxes, then active cover whose kind
 *   stops shots (`COVER_STOPS_SHOTS`: car, bus), deduplicated the same way.
 * - `cover`: the active cover objects (the client draws them; tests).
 *
 * A cover object is active when its `minStage` ≤ `currentDecayStage(world)`. The lists change only
 * through `applyCoverStage` (World creation, a stage change), never per tick. Story 4.5 drives it
 * at the build start; its mutations (moved/added cars) are to edit these copies, never the map.
 */
export interface ObstacleState {
  /** The decay stage the lists were built for. */
  stage: number;
  /** Bumped on every rebuild (the client's cover view redraws when it changes). */
  version: number;
  readonly solids: MapBox[];
  readonly shotBlockers: MapBox[];
  readonly cover: CoverObject[];
}

const sameRect = (a: MapBox, b: MapBox): boolean => a.minX === b.minX && a.minY === b.minY && a.maxX === b.maxX && a.maxY === b.maxY;

function duplicatesSolid(map: DistrictMap, c: CoverObject): boolean {
  for (let i = 0; i < map.solids.length; i++) if (sameRect(map.solids[i] as MapBox, c)) return true;
  return false;
}

/** Refills the lists in place for `stage` (no new arrays; called only on creation or a stage change). */
function fillObstacles(o: ObstacleState, map: DistrictMap, stage: number): void {
  o.solids.length = 0;
  o.shotBlockers.length = 0;
  o.cover.length = 0;
  for (let i = 0; i < map.solids.length; i++) {
    const s = map.solids[i] as MapBox;
    o.solids.push(s);
    o.shotBlockers.push(s);
  }
  for (let i = 0; i < map.cover.length; i++) {
    const c = map.cover[i] as CoverObject;
    if (c.minStage > stage) continue;
    o.cover.push(c);
    if (duplicatesSolid(map, c)) continue;
    o.solids.push(c);
    if (COVER_STOPS_SHOTS[c.kind]) o.shotBlockers.push(c);
  }
  o.stage = stage;
}

/** The obstacle lists of `map` at `stage` (`createWorld` passes the first stage). */
export function createObstacles(map: DistrictMap, stage: number): ObstacleState {
  const o: ObstacleState = { stage, version: 0, solids: [], shotBlockers: [], cover: [] };
  fillObstacles(o, map, stage);
  return o;
}

/**
 * Brings `world.obstacles` to `currentDecayStage(world)`: refills the lists, bumps the version,
 * rewrites the nav grid's walls and forces the flow field to re-rasterize. Returns false (and does
 * nothing) when the stage is unchanged. Bodies that a new box now overlaps leave through the normal
 * push-out on their next move; the build-start order (brief line 5) is Story 4.5's.
 */
export function applyCoverStage(world: World): boolean {
  const stage = currentDecayStage(world);
  const o = world.obstacles;
  if (stage === o.stage) return false;
  fillObstacles(o, world.map, stage);
  o.version++;
  setNavWalls(world.pathing.nav, o.solids);
  return true;
}
