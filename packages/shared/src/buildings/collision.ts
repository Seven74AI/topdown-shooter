import type { World } from "../core/world";
import type { MapBox } from "../map/districtMap";
import type { Building } from "./buildings";

/**
 * Story 3.4: circles (players, zombies) against building boxes (FR53: neither passes a barricade).
 * `movePlayers` runs this on the server and in the client's prediction, so it uses only + − × ÷,
 * sqrt, min and max (the Story 2.6 rule: identical results in every JavaScript engine), visits the
 * buildings in id order, and allocates nothing.
 *
 * Story 4.1: the map's static collision boxes (the Tiled `collision` layer) are obstacles exactly
 * like buildings: every test here visits them first (in map order), then the buildings. They are
 * never attacked (zombies hit buildings only) and never removed.
 *
 * Story 4.2: the list is `world.obstacles.solids` (`map/obstacles.ts`): the map boxes, then the
 * cover active at the current decay stage (car, bus, barrier, sandbags all block bodies, FR56).
 *
 * Story 5.9 (F1 "floor is floor"): only WALL buildings (`Building.solid`) count here; spike traps
 * and mines never block a body or a zombie's line of sight.
 */

/** Any obstacle box (a building or a map solid). */
type BoxView = Pick<MapBox, "minX" | "minY" | "maxX" | "maxY">;

/** Story 4.1: the World has any obstacle (map solids, active cover or buildings): movement must run the push-out. Story 5.9: walls only (floor buildings never block). */
export function hasObstacles(world: Readonly<World>): boolean {
  if (world.obstacles.solids.length > 0) return true;
  const list = world.buildings.list;
  for (let i = 0; i < list.length; i++) if ((list[i] as Building).solid) return true;
  return false;
}

/** Below this centre-to-box distance the circle counts as inside the box (pushed out along the shortest axis). */
const INSIDE_EPS_M = 1e-9;

/** The circle (x, y, r) overlaps the box (strictly: touching is not an overlap). */
export function circleOverlapsBox(x: number, y: number, r: number, minX: number, minY: number, maxX: number, maxY: number): boolean {
  const cx = Math.min(maxX, Math.max(minX, x));
  const cy = Math.min(maxY, Math.max(minY, y));
  const dx = x - cx;
  const dy = y - cy;
  return dx * dx + dy * dy < r * r;
}

/** The circle overlaps any map solid (Story 4.1) or building (`spotBlocked`, free-spot search). */
export function circleHitsBuilding(world: Readonly<World>, x: number, y: number, r: number): boolean {
  const solids = world.obstacles.solids;
  for (let i = 0; i < solids.length; i++) {
    const b = solids[i] as MapBox;
    if (circleOverlapsBox(x, y, r, b.minX, b.minY, b.maxX, b.maxY)) return true;
  }
  const list = world.buildings.list;
  for (let i = 0; i < list.length; i++) {
    const b = list[i] as Building;
    if (b.solid && circleOverlapsBox(x, y, r, b.minX, b.minY, b.maxX, b.maxY)) return true; // Story 5.9: walls only
  }
  return false;
}

/** `pushOutOfBuildings` result, reused by every caller (synchronous, so one record is enough). */
export const pushed = { x: 0, y: 0 };

/** `pushOutOfBuildings` outcomes. */
export const PUSH_NONE = 0;
export const PUSH_MOVED = 1;
/** No free spot was found near the target (a slot narrower than the body): stay at `from`. */
export const PUSH_STUCK = 2;
export type PushResult = typeof PUSH_NONE | typeof PUSH_MOVED | typeof PUSH_STUCK;

/** Passes over every building (and the map edge) before giving up (review H1: 2–4, bounded). */
const MAX_PASSES = 4;
/** Overlap left after the passes that still counts as "stuck" (float noise below it is fine). */
const STUCK_EPS_M = 1e-6;

/** One box's push on (px, py) into `pushed`; returns whether it moved. `fromX/fromY` picks the face when the centre is inside. */
function pushBox(b: BoxView, px: number, py: number, r: number, fromX: number, fromY: number): boolean {
  const cx = Math.min(b.maxX, Math.max(b.minX, px));
  const cy = Math.min(b.maxY, Math.max(b.minY, py));
  const dx = px - cx;
  const dy = py - cy;
  const d2 = dx * dx + dy * dy;
  if (d2 >= r * r) return false;
  if (d2 > INSIDE_EPS_M * INSIDE_EPS_M) {
    const d = Math.sqrt(d2);
    pushed.x = cx + (dx / d) * r;
    pushed.y = cy + (dy / d) * r;
    return true;
  }
  // Centre inside the box (review M1: a zombie shoved deep by a player): out across the face on the
  // side the circle came from, i.e. the face `from` lies beyond by the most; with `from` inside
  // too, the nearest face (ties: left, right, top, bottom).
  pushed.x = px;
  pushed.y = py;
  const outL = b.minX - fromX;
  const outR = fromX - b.maxX;
  const outT = b.minY - fromY;
  const outB = fromY - b.maxY;
  const out = Math.max(outL, outR, outT, outB);
  if (out > 0) {
    if (out === outL) pushed.x = b.minX - r;
    else if (out === outR) pushed.x = b.maxX + r;
    else if (out === outT) pushed.y = b.minY - r;
    else pushed.y = b.maxY + r;
    return true;
  }
  const left = px - b.minX;
  const right = b.maxX - px;
  const top = py - b.minY;
  const bottom = b.maxY - py;
  const m = Math.min(left, right, top, bottom);
  if (m === left) pushed.x = b.minX - r;
  else if (m === right) pushed.x = b.maxX + r;
  else if (m === top) pushed.y = b.minY - r;
  else pushed.y = b.maxY + r;
  return true;
}

/**
 * Moves the circle (x, y, r) out of every building, keeping it inside the map: passes over all
 * buildings in id order, then the map clamp, until a pass moves nothing (at most MAX_PASSES). Each
 * push goes the shortest way out (away from the box's closest point, so a circle pressing on a face
 * slides along it); a centre that ended inside a box leaves on the side of `from` (where the circle
 * was before this move, outside every box). If the passes don't settle (a slot narrower than the
 * body, between two buildings or a building and the map edge) the result is PUSH_STUCK and `pushed`
 * is `from`: the circle doesn't move this tick (review H1). Writes `pushed` for every result.
 */
export function pushOutOfBuildings(
  world: Readonly<World>,
  x: number,
  y: number,
  r: number,
  fromX: number,
  fromY: number,
  /** Story 6.5: false = map solids and the edge only (player buildings are not solid to the Behemoth). */
  withBuildings = true,
): PushResult {
  const full = settle(world, x, y, r, fromX, fromY, withBuildings);
  if (full !== PUSH_STUCK) return full;
  // Not settled (3.4 re-review: a diagonal press into a pocket stopped ~13 cm short): try the move
  // along one axis at a time and keep the one that gets further from the start; only if neither
  // settles does the body stay where it was.
  let bestX = fromX;
  let bestY = fromY;
  let bestD = -1;
  if (settle(world, x, fromY, r, fromX, fromY, withBuildings) !== PUSH_STUCK) {
    bestX = pushed.x;
    bestY = pushed.y;
    bestD = (bestX - fromX) * (bestX - fromX) + (bestY - fromY) * (bestY - fromY);
  }
  if (settle(world, fromX, y, r, fromX, fromY, withBuildings) !== PUSH_STUCK) {
    const d = (pushed.x - fromX) * (pushed.x - fromX) + (pushed.y - fromY) * (pushed.y - fromY);
    if (d > bestD) {
      bestX = pushed.x;
      bestY = pushed.y;
      bestD = d;
    }
  }
  if (bestD <= 0 && overlapsObstacle(world, fromX, fromY, r - FROM_INSIDE_EPS_M, withBuildings) && escape(world, fromX, fromY, r, withBuildings)) {
    pushEscapes.count++;
    return PUSH_MOVED;
  }
  pushed.x = bestX;
  pushed.y = bestY;
  return bestD > 0 ? PUSH_MOVED : PUSH_STUCK;
}

/**
 * Fix bloater-car-corner (2026-11-25): staying at `from` is the fallback only because `from` is
 * normally outside every box. A centre placed inside one (the dev spawn cheats place bodies with no
 * solid check) at the join of two touching boxes is pushed by each box's nearest face into the other.
 * The passes never settle, and staying at `from` would keep it inside for good (the same for a body
 * dropped into a gap narrower than itself between two boxes: centre outside both, overlapping both). When
 * `from` overlaps a solid by more than this, the body goes to the nearest clear spot instead (`escape`).
 * The margin is far above Float32 rounding against a face, so a legal `from` (every normal placement and
 * every push-out result) never triggers it: a body held at a slot mouth stays put and never jumps a wall.
 * It is not a line-of-movement search: it only runs on a body already in an illegal spot, and a body
 * with no clear spot within `ESCAPE_REACH_M` repeats the full search each tick (none on Downtown).
 */
const FROM_INSIDE_EPS_M = 1e-3;
/**
 * `escape`: fine rings (`ESCAPE_FINE_STEP_M` apart up to `ESCAPE_FINE_M`: the nearest exit of a car
 * junction is 0.1–1 m away), then coarse ones (`ESCAPE_COARSE_STEP_M` apart up to `ESCAPE_REACH_M`:
 * deep in a big box against the map edge, e.g. the 7 × 6 m gas kiosk in Downtown's corner).
 */
const ESCAPE_FINE_STEP_M = 0.05;
const ESCAPE_FINE_M = 1;
const ESCAPE_COARSE_STEP_M = 0.25;
const ESCAPE_REACH_M = 12;
/** 16 directions 22.5° apart, as exact literals (no trig at run time: identical in every engine), tried in this order. */
const C1 = 0.9238795325112867; // cos 22.5°
const S1 = 0.3826834323650898; // sin 22.5°
const H = Math.SQRT1_2;
const ESCAPE_COS = [1, C1, H, S1, 0, -S1, -H, -C1, -1, -C1, -H, -S1, 0, S1, H, C1] as const;
const ESCAPE_SIN = [0, S1, H, C1, 1, C1, H, S1, 0, -S1, -H, -C1, -1, -C1, -H, -S1] as const;
const ESCAPE_DIRS = ESCAPE_COS.length;

/** Diagnostic: how many push-outs took the `escape` (tests; not simulation state, never snapshotted). */
export const pushEscapes = { count: 0 };

/** The circle overlaps a map solid or (with `withBuildings`) a wall building. */
function overlapsObstacle(world: Readonly<World>, x: number, y: number, r: number, withBuildings: boolean): boolean {
  const solids = world.obstacles.solids;
  for (let i = 0; i < solids.length; i++) {
    const b = solids[i] as MapBox;
    if (circleOverlapsBox(x, y, r, b.minX, b.minY, b.maxX, b.maxY)) return true;
  }
  if (!withBuildings) return false;
  const list = world.buildings.list;
  for (let i = 0; i < list.length; i++) {
    const b = list[i] as Building;
    if (b.solid && circleOverlapsBox(x, y, r, b.minX, b.minY, b.maxX, b.maxY)) return true;
  }
  return false;
}

/** The nearest clear spot round (x, y) inside the map (fine rings, then coarse ones), into `pushed`; false if none within `ESCAPE_REACH_M`. */
function escape(world: Readonly<World>, x: number, y: number, r: number, withBuildings: boolean): boolean {
  let d = ESCAPE_FINE_STEP_M;
  while (d <= ESCAPE_REACH_M) {
    if (escapeRing(world, x, y, r, d, withBuildings)) return true;
    d += d < ESCAPE_FINE_M ? ESCAPE_FINE_STEP_M : ESCAPE_COARSE_STEP_M;
  }
  return false;
}

/** The first clear spot (in `ESCAPE_COS/SIN` order) on the ring of radius `d` round (x, y), into `pushed`. */
function escapeRing(world: Readonly<World>, x: number, y: number, r: number, d: number, withBuildings: boolean): boolean {
  const { widthM, heightM } = world.map;
  for (let i = 0; i < ESCAPE_DIRS; i++) {
    const px = x + (ESCAPE_COS[i] as number) * d;
    const py = y + (ESCAPE_SIN[i] as number) * d;
    if (px < r || px > widthM - r || py < r || py > heightM - r) continue;
    if (overlapsObstacle(world, px, py, r, withBuildings)) continue;
    pushed.x = px;
    pushed.y = py;
    return true;
  }
  return false;
}

const NO_BUILDINGS: readonly Building[] = [];

/** One push-out attempt for the target (x, y): passes until stable, or PUSH_STUCK (then `pushed` = from). */
function settle(world: Readonly<World>, x: number, y: number, r: number, fromX: number, fromY: number, withBuildings: boolean): PushResult {
  const list = withBuildings ? world.buildings.list : NO_BUILDINGS;
  const solids = world.obstacles.solids;
  const { widthM, heightM } = world.map;
  let px = x;
  let py = y;
  let moved = false;
  for (let pass = 0; pass < MAX_PASSES; pass++) {
    let any = false;
    for (let i = 0; i < solids.length; i++) {
      if (!pushBox(solids[i] as MapBox, px, py, r, fromX, fromY)) continue;
      px = pushed.x;
      py = pushed.y;
      any = true;
    }
    for (let i = 0; i < list.length; i++) {
      const b = list[i] as Building;
      if (!b.solid || !pushBox(b, px, py, r, fromX, fromY)) continue; // Story 5.9: floor never pushes
      px = pushed.x;
      py = pushed.y;
      any = true;
    }
    const cx = Math.min(widthM - r, Math.max(r, px));
    const cy = Math.min(heightM - r, Math.max(r, py));
    if (cx !== px || cy !== py) {
      px = cx;
      py = cy;
      any = true;
    }
    if (!any) {
      pushed.x = px;
      pushed.y = py;
      return moved ? PUSH_MOVED : PUSH_NONE;
    }
    moved = true;
  }
  // Did the last pass leave it clear (within float noise)?
  const rr = r - STUCK_EPS_M;
  for (let i = 0; i < solids.length; i++) {
    const b = solids[i] as MapBox;
    if (circleOverlapsBox(px, py, rr, b.minX, b.minY, b.maxX, b.maxY)) {
      pushed.x = fromX;
      pushed.y = fromY;
      return PUSH_STUCK;
    }
  }
  for (let i = 0; i < list.length; i++) {
    const b = list[i] as Building;
    if (b.solid && circleOverlapsBox(px, py, rr, b.minX, b.minY, b.maxX, b.maxY)) {
      pushed.x = fromX;
      pushed.y = fromY;
      return PUSH_STUCK;
    }
  }
  pushed.x = px;
  pushed.y = py;
  return PUSH_MOVED;
}

/** The segment p0 + t·(dx, dy), t ∈ [0, 1], passes through the box's interior (slab test; touching is not a hit). */
export function segmentHitsBox(x0: number, y0: number, dx: number, dy: number, minX: number, minY: number, maxX: number, maxY: number): boolean {
  let t0 = 0;
  let t1 = 1;
  if (dx === 0) {
    if (x0 <= minX || x0 >= maxX) return false;
  } else {
    let a = (minX - x0) / dx;
    let b = (maxX - x0) / dx;
    if (a > b) {
      const s = a;
      a = b;
      b = s;
    }
    t0 = Math.max(t0, a);
    t1 = Math.min(t1, b);
    if (t0 >= t1) return false;
  }
  if (dy === 0) return y0 > minY && y0 < maxY;
  let a = (minY - y0) / dy;
  let b = (maxY - y0) / dy;
  if (a > b) {
    const s = a;
    a = b;
    b = s;
  }
  t0 = Math.max(t0, a);
  t1 = Math.min(t1, b);
  return t0 < t1;
}

/**
 * Story 3.5: a circle of radius r moving in a straight line from (x0, y0) to (x1, y1) would hit a
 * building or (Story 4.1) a map solid (each box grown by r on every side: conservative at the
 * corners). Zombies walk straight when this is false and follow the flow field otherwise.
 */
export function segmentHitsBuildings(world: Readonly<World>, x0: number, y0: number, x1: number, y1: number, r: number): boolean {
  const list = world.buildings.list;
  const solids = world.obstacles.solids;
  const dx = x1 - x0;
  const dy = y1 - y0;
  for (let i = 0; i < solids.length; i++) {
    const b = solids[i] as MapBox;
    if (segmentHitsBox(x0, y0, dx, dy, b.minX - r, b.minY - r, b.maxX + r, b.maxY + r)) return true;
  }
  for (let i = 0; i < list.length; i++) {
    const b = list[i] as Building;
    if (b.solid && segmentHitsBox(x0, y0, dx, dy, b.minX - r, b.minY - r, b.maxX + r, b.maxY + r)) return true; // Story 5.9: walls only
  }
  return false;
}

/** Distance from (x, y) to the box (0 inside). */
export function distanceToBox(x: number, y: number, minX: number, minY: number, maxX: number, maxY: number): number {
  const dx = x - Math.min(maxX, Math.max(minX, x));
  const dy = y - Math.min(maxY, Math.max(minY, y));
  return Math.sqrt(dx * dx + dy * dy);
}
