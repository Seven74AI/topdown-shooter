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
/**
 * Fix bloater-car-corner: stuck, and `from` itself overlapped a solid (an illegal spot), so the body
 * went to the nearest clear spot (`escapeInside` callers only; see `escape`).
 */
export const PUSH_ESCAPED = 3;
export type PushResult = typeof PUSH_NONE | typeof PUSH_MOVED | typeof PUSH_STUCK | typeof PUSH_ESCAPED;

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
 * is `from`: the circle doesn't move this tick (review H1). With `escapeInside`, a stuck body whose
 * `from` is itself not legal (it overlaps a solid) goes to the nearest clear spot instead
 * (PUSH_ESCAPED; fix bloater-car-corner). Writes `pushed` for every result.
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
  /**
   * Fix bloater-car-corner: when stuck and `from` itself overlaps a solid, go to the nearest clear spot
   * (PUSH_ESCAPED) instead of staying inside. Opt-in: the per-tick body moves (zombie pass 4, player
   * movement and knockback). Decay relocation keeps its own tested fallbacks (`findFreeSpotNear`,
   * `findBoxFreeSpot`), so its results are unchanged.
   */
  escapeInside = false,
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
  if (escapeInside && bestD <= 0 && overlapsObstacle(world, fromX, fromY, r - FROM_INSIDE_EPS_M, withBuildings) && escape(world, fromX, fromY, r, withBuildings)) {
    pushEscapes.count++;
    return PUSH_ESCAPED;
  }
  pushed.x = bestX;
  pushed.y = bestY;
  return bestD > 0 ? PUSH_MOVED : PUSH_STUCK;
}

/**
 * Fix bloater-car-corner (2026-11-25): staying at `from` is the fallback only because `from` is
 * normally outside every box. It isn't when something put the body in a solid: the dev spawn cheats
 * (no solid check). Before FX-B1, hit pushback was not swept either, so stacked co-op hits could also
 * do it. A centre at the join of two touching boxes is pushed by each box's nearest face into the
 * other; a body dropped into a gap narrower than itself overlaps both boxes. The passes never settle,
 * and staying at `from` would keep it inside for good.
 *
 * So when `from` overlaps a solid by more than `FROM_INSIDE_EPS_M`, the body goes to the nearest clear
 * spot (`escape`). The margin is far above Float32 rounding against a face, so a body legally held at a
 * slot mouth never triggers it. The way out never crosses a box `from`'s centre is not in: a body in a
 * slot leaves by a mouth, never through a wall (`escapeClearPath`). A thin wall the centre is already
 * in can be left on either side (the nearer).
 */
const FROM_INSIDE_EPS_M = 1e-3;
/**
 * `escape`: fine rings `ESCAPE_FINE_STEP_M` apart up to `ESCAPE_FINE_M` (a car junction's nearest exit is
 * 0.1–1 m away), then coarse rings `ESCAPE_COARSE_STEP_M` apart up to `ESCAPE_REACH_M` (deep in a big box
 * against the map edge, e.g. the 7 × 6 m gas kiosk in Downtown's corner). Ring k is at an exact
 * multiple of the step (an integer index, no running sum).
 */
const ESCAPE_FINE_STEP_M = 0.05;
const ESCAPE_FINE_RINGS = 20; // 1 m
const ESCAPE_COARSE_STEP_M = 0.25;
const ESCAPE_COARSE_RINGS = 44; // 1 m + 11 m = 12 m
const ESCAPE_FINE_M = ESCAPE_FINE_STEP_M * ESCAPE_FINE_RINGS;
const ESCAPE_REACH_M = ESCAPE_FINE_M + ESCAPE_COARSE_STEP_M * ESCAPE_COARSE_RINGS;
/**
 * Directions per ring: 16 · 2^k (16 … 256), the fewest that keep neighbouring candidates at most one ring
 * step apart along the ring (so "nearest" holds to about one step, at every radius). Each set is walked
 * by rotating (1, 0) with that set's exact cos/sin literals (only × and +: identical in every engine).
 */
const ESCAPE_DIR_COUNTS = [16, 32, 64, 128, 256] as const;
const ESCAPE_ROT_COS = [0.9238795325112867, 0.9807852804032304, 0.9951847266721969, 0.9987954562051724, 0.9996988186962042] as const;
const ESCAPE_ROT_SIN = [0.3826834323650898, 0.19509032201612825, 0.0980171403295606, 0.049067674327418015, 0.024541228522912288] as const;
/** 2π, for the ring circumference only (the direction count; never a position). */
const TWO_PI = 6.283185307179586;

/**
 * Diagnostic: push-outs that took the `escape`. Process-global (every World in this process adds to it),
 * read by tests as a before/after delta. Not simulation state, never snapshotted.
 */
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

/** The boxes within reach of one escape (prefiltered once per escape; solids, then wall buildings), and whether `from`'s centre is inside each. */
/**
 * The boxes within reach of one escape (prefiltered once per escape: solids, then wall buildings), and
 * whether `from`'s centre is inside each. Review N2: the arrays grow (doubling, only when an escape
 * meets more boxes than ever before), so no box is ever dropped.
 */
let nearCap = 64;
let nearMinX = new Float64Array(nearCap);
let nearMinY = new Float64Array(nearCap);
let nearMaxX = new Float64Array(nearCap);
let nearMaxY = new Float64Array(nearCap);
let nearHolds = new Uint8Array(nearCap);
let nearCount = 0;

function growNear(): void {
  const cap = nearCap * 2;
  const grow = (a: Float64Array): Float64Array<ArrayBuffer> => {
    const b = new Float64Array(cap);
    b.set(a);
    return b;
  };
  nearMinX = grow(nearMinX);
  nearMinY = grow(nearMinY);
  nearMaxX = grow(nearMaxX);
  nearMaxY = grow(nearMaxY);
  const h = new Uint8Array(cap);
  h.set(nearHolds);
  nearHolds = h;
  nearCap = cap;
}

function addNear(x: number, y: number, reach: number, b: BoxView): void {
  const cx = Math.min(b.maxX, Math.max(b.minX, x));
  const cy = Math.min(b.maxY, Math.max(b.minY, y));
  if ((x - cx) * (x - cx) + (y - cy) * (y - cy) > reach * reach) return;
  if (nearCount >= nearCap) growNear();
  const k = nearCount++;
  nearMinX[k] = b.minX;
  nearMinY[k] = b.minY;
  nearMaxX[k] = b.maxX;
  nearMaxY[k] = b.maxY;
  nearHolds[k] = x > b.minX && x < b.maxX && y > b.minY && y < b.maxY ? 1 : 0;
}

/**
 * Dead ends (no clear spot within reach) remembered per World and obstacle versions, so a body that
 * can't escape doesn't repeat the full search every tick (the same inputs always fail the same way, so
 * skipping changes no result). A small ring of (x, y, r, withBuildings) keys; cleared when the World,
 * its obstacles or its buildings change. Review N1: the World is held weakly (a disposed World is not
 * kept alive by this cache).
 */
const DEAD_ENDS = 64;
const deadX = new Float64Array(DEAD_ENDS);
const deadY = new Float64Array(DEAD_ENDS);
const deadR = new Float64Array(DEAD_ENDS);
const deadB = new Uint8Array(DEAD_ENDS);
let deadCount = 0;
let deadNext = 0;
let deadWorld: WeakRef<Readonly<World>> | null = null;
let deadObstacles = -1;
let deadBuildings = -1;

function deadEndKnown(world: Readonly<World>, x: number, y: number, r: number, withBuildings: boolean): boolean {
  if (deadWorld?.deref() !== world || deadObstacles !== world.obstacles.version || deadBuildings !== world.buildings.version) {
    if (deadWorld?.deref() !== world) deadWorld = new WeakRef(world); // only when the World changes (rare: never per tick)
    deadObstacles = world.obstacles.version;
    deadBuildings = world.buildings.version;
    deadCount = 0;
    deadNext = 0;
    return false;
  }
  const wb = withBuildings ? 1 : 0;
  for (let i = 0; i < deadCount; i++) if (deadX[i] === x && deadY[i] === y && deadR[i] === r && deadB[i] === wb) return true;
  return false;
}

function rememberDeadEnd(x: number, y: number, r: number, withBuildings: boolean): void {
  const i = deadNext;
  deadX[i] = x;
  deadY[i] = y;
  deadR[i] = r;
  deadB[i] = withBuildings ? 1 : 0;
  deadNext = (deadNext + 1) % DEAD_ENDS;
  if (deadCount < DEAD_ENDS) deadCount++;
}

/**
 * Review M1 (fix escape-narrow-openings): the way out must be one the BODY can take, not only its centre.
 * - Clearance: every point of the straight path keeps at least the clearance the body had at `from`
 *   (r minus its overlap there; 0 for a centre inside a box). So a body that merely overlaps a wall never
 *   squeezes through an opening narrower than itself (a 0.5 m murder hole into a fort), nor along a seam.
 * - Seams: two touching boxes count as one wall on the centre line too (boxes grown by `SEAM_EPS_M`; the
 *   slab test alone lets a centre slide along the shared face).
 * - Open side first: when the start is equally near a sealed pocket (a fort's inside) and the open map,
 *   a spot whose free area (for this body, on a `FLOOD_CELL_M` grid within `FLOOD_HALF_M`) reaches the
 *   edge of that area wins; only when no such spot exists within reach does an enclosed one do.
 */
const SEAM_EPS_M = 1e-9;
const PATH_STEP_M = 0.025;
const FLOOD_CELL_M = 0.1;
const FLOOD_HALF_M = 4;
const FLOOD_N = Math.round((2 * FLOOD_HALF_M) / FLOOD_CELL_M); // 80 × 80 cells
/** 0 = not computed / blocked, 1 = free, 2 = free and connected to the area's edge (open). */
const flood = new Uint8Array(FLOOD_N * FLOOD_N);
const floodQueue = new Int32Array(FLOOD_N * FLOOD_N);
let floodReady = false;
let floodX0 = 0;
let floodY0 = 0;

/** Distance from (px, py) to the nearest box within reach (0 inside one). */
function nearestBoxDistance(px: number, py: number): number {
  let best = Infinity;
  for (let k = 0; k < nearCount; k++) {
    const cx = Math.min(nearMaxX[k] as number, Math.max(nearMinX[k] as number, px));
    const cy = Math.min(nearMaxY[k] as number, Math.max(nearMinY[k] as number, py));
    const d2 = (px - cx) * (px - cx) + (py - cy) * (py - cy);
    if (d2 < best) best = d2;
  }
  return best === Infinity ? Infinity : Math.sqrt(best);
}

/** The free area for a body of radius r round (x, y), and which of it is open (reaches the area's edge). */
function buildFlood(world: Readonly<World>, x: number, y: number, r: number): void {
  const { widthM, heightM } = world.map;
  floodX0 = x - FLOOD_HALF_M;
  floodY0 = y - FLOOD_HALF_M;
  for (let j = 0; j < FLOOD_N; j++) {
    for (let i = 0; i < FLOOD_N; i++) {
      const px = floodX0 + (i + 0.5) * FLOOD_CELL_M;
      const py = floodY0 + (j + 0.5) * FLOOD_CELL_M;
      const inMap = px >= r && px <= widthM - r && py >= r && py <= heightM - r;
      flood[j * FLOOD_N + i] = inMap && escapeSpotClear(px, py, r) ? 1 : 0;
    }
  }
  let qt = 0;
  for (let j = 0; j < FLOOD_N; j++) {
    for (let i = 0; i < FLOOD_N; i++) {
      if (i !== 0 && j !== 0 && i !== FLOOD_N - 1 && j !== FLOOD_N - 1) continue;
      const c = j * FLOOD_N + i;
      if (flood[c] !== 1) continue;
      flood[c] = 2;
      floodQueue[qt++] = c;
    }
  }
  let qh = 0;
  while (qh < qt) {
    const c = floodQueue[qh++] as number;
    const i = c % FLOOD_N;
    const j = (c - i) / FLOOD_N;
    for (let k = 0; k < 4; k++) {
      const ni = i + (k === 0 ? 1 : k === 1 ? -1 : 0);
      const nj = j + (k === 2 ? 1 : k === 3 ? -1 : 0);
      if (ni < 0 || nj < 0 || ni >= FLOOD_N || nj >= FLOOD_N) continue;
      const n = nj * FLOOD_N + ni;
      if (flood[n] !== 1) continue;
      flood[n] = 2;
      floodQueue[qt++] = n;
    }
  }
  floodReady = true;
}

/** The spot (px, py) lies in the open part of the free area (any of the 3 × 3 cells round it; outside the area counts as open). */
function floodOpen(px: number, py: number): boolean {
  const ci = Math.floor((px - floodX0) / FLOOD_CELL_M);
  const cj = Math.floor((py - floodY0) / FLOOD_CELL_M);
  if (ci < 1 || cj < 1 || ci > FLOOD_N - 2 || cj > FLOOD_N - 2) return true;
  for (let dj = -1; dj <= 1; dj++) for (let di = -1; di <= 1; di++) if (flood[(cj + dj) * FLOOD_N + ci + di] === 2) return true;
  return false;
}

/** The nearest clear spot round (x, y) inside the map (fine rings, then coarse ones), into `pushed`; false if none within `ESCAPE_REACH_M`. */
function escape(world: Readonly<World>, x: number, y: number, r: number, withBuildings: boolean): boolean {
  if (deadEndKnown(world, x, y, r, withBuildings)) return false;
  // Only boxes within reach + r can touch a candidate or the path to it.
  const reach = ESCAPE_REACH_M + r;
  nearCount = 0;
  const solids = world.obstacles.solids;
  for (let i = 0; i < solids.length; i++) addNear(x, y, reach, solids[i] as MapBox);
  if (withBuildings) {
    const list = world.buildings.list;
    for (let i = 0; i < list.length; i++) if ((list[i] as Building).solid) addNear(x, y, reach, list[i] as Building);
  }
  floodReady = false;
  const clearance = Math.min(r, nearestBoxDistance(x, y)); // r minus its overlap at `from` (0 for a centre in a box)
  for (let pass = 0; pass < 2; pass++) {
    const openOnly = pass === 0;
    for (let k = 1; k <= ESCAPE_FINE_RINGS; k++) if (escapeRing(world, x, y, r, clearance, openOnly, k * ESCAPE_FINE_STEP_M, ESCAPE_FINE_STEP_M)) return true;
    for (let k = 1; k <= ESCAPE_COARSE_RINGS; k++) if (escapeRing(world, x, y, r, clearance, openOnly, ESCAPE_FINE_M + k * ESCAPE_COARSE_STEP_M, ESCAPE_COARSE_STEP_M)) return true;
  }
  rememberDeadEnd(x, y, r, withBuildings);
  return false;
}

/** The first clear spot, walking the ring of radius `d` round (x, y) from +x anticlockwise, into `pushed`. */
function escapeRing(world: Readonly<World>, x: number, y: number, r: number, clearance: number, openOnly: boolean, d: number, step: number): boolean {
  const { widthM, heightM } = world.map;
  let set = 0;
  while (set < ESCAPE_DIR_COUNTS.length - 1 && (TWO_PI * d) / (ESCAPE_DIR_COUNTS[set] as number) > step) set++;
  const n = ESCAPE_DIR_COUNTS[set] as number;
  const rc = ESCAPE_ROT_COS[set] as number;
  const rs = ESCAPE_ROT_SIN[set] as number;
  let ux = 1;
  let uy = 0;
  for (let i = 0; i < n; i++) {
    const px = x + ux * d;
    const py = y + uy * d;
    const nx = ux * rc - uy * rs;
    uy = ux * rs + uy * rc;
    ux = nx;
    if (px < r || px > widthM - r || py < r || py > heightM - r) continue;
    if (!escapeSpotClear(px, py, r) || !escapeClearPath(x, y, px, py, clearance)) continue;
    if (openOnly) {
      if (!floodReady) buildFlood(world, x, y, r);
      if (!floodOpen(px, py)) continue;
    }
    pushed.x = px;
    pushed.y = py;
    return true;
  }
  return false;
}

/** No box within reach overlaps the circle (px, py, r). */
function escapeSpotClear(px: number, py: number, r: number): boolean {
  for (let k = 0; k < nearCount; k++) if (circleOverlapsBox(px, py, r, nearMinX[k] as number, nearMinY[k] as number, nearMaxX[k] as number, nearMaxY[k] as number)) return false;
  return true;
}

/**
 * The way out from (x, y) to (px, py): its centre crosses no box except those `from`'s centre is already
 * in (boxes grown by `SEAM_EPS_M`, so a shared face is a wall), and every point keeps `clearance` from
 * every box (review M1).
 */
function escapeClearPath(x: number, y: number, px: number, py: number, clearance: number): boolean {
  const dx = px - x;
  const dy = py - y;
  for (let k = 0; k < nearCount; k++) {
    if (nearHolds[k] === 1) continue;
    const e = SEAM_EPS_M;
    if (segmentHitsBox(x, y, dx, dy, (nearMinX[k] as number) - e, (nearMinY[k] as number) - e, (nearMaxX[k] as number) + e, (nearMaxY[k] as number) + e)) return false;
  }
  if (clearance <= 0) return true;
  const len = Math.sqrt(dx * dx + dy * dy);
  const steps = Math.ceil(len / PATH_STEP_M);
  const need = clearance - 1e-9;
  for (let s = 1; s < steps; s++) {
    const t = s / steps;
    if (nearestBoxDistance(x + dx * t, y + dy * t) < need) return false;
  }
  return true;
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
