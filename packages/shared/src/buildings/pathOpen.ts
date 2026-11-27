import { BUILD_GRID_M } from "../config/constants";
import type { World } from "../core/world";
import type { MapBox } from "../map/districtMap";
import { teamSpawnPoint } from "../player/spawn";
import { bodyFitsInMap, circleOverlapsBox, segmentNearBox } from "./collision";
import type { Box, Building } from "./buildings";

/**
 * Story 12.1 (designer 2026-11-25: "A building cannot block a path entirely"): the no-sealed-pocket
 * rule. A wall placement (or move) is refused when, with the new box added, any walkable spot that
 * the main walkable region reached before is cut off from it.
 *
 * **The grid.** Vertices of the 0.5 m build lattice (`BUILD_GRID_M`: (i × 0.5, j × 0.5) m, map edges
 * included): (W / 0.5 + 1) × (H / 0.5 + 1) points (97 × 65 = 6,305 on Downtown). A vertex is **free**
 * when a player's body (`player.radiusM`) centred there fits: inside the map by its radius and
 * overlapping no box (`bodyFitsInMap`, `circleOverlapsBox`: the shared clearance helpers the escape's
 * flood uses too, Story 12.1 AC 13). Two 4-neighbours are **joined** when both are free and the body
 * slides from one to the other: no box comes closer than the radius to the 0.5 m segment between them
 * (`segmentNearBox`, exact for boxes). So a grid path is a path the body really takes, and a lattice
 * gap is open exactly when it is at least a body wide (1.0 m between barricades: open; 0.5 m: closed;
 * a 0.7 m gap between a building and a map solid: closed). Between a building and a map solid the grid
 * is conservative: a gap of 0.8–0.9 m (wide enough for a player) can read closed, never the reverse.
 *
 * **The rule.** The main region is the free vertices joined to the `evac_pad` (its nearest free vertex;
 * a map without one: the first team start). Before = map solids + every wall building (a move: without
 * the building moved); after = the same + the new box. Refused (`sealsPath`) iff some vertex of the main
 * region before is still free after but no longer joined to it (the vertices the new box itself makes
 * unfree don't count). Only that before-region counts, so a map nook the grid already reads as closed,
 * or the inside of a fort an old save holds (AC 10), never refuses a placement. Floor buildings
 * (`solid: false`) never block and are never checked (AC 5).
 *
 * Limit (documented, conservative): a pocket whose free spots hold no lattice vertex isn't tracked.
 * Pockets bounded by buildings and the map edge always hold one (both are on the lattice); only a
 * pocket bounded by map solids on both sides of an axis can miss it.
 *
 * **Cost (AC 9).** Two breadth-first floods over the grid plus the boxes' rasterization; buffers are
 * module scratch sized to the largest map seen (no allocation per call). The map-solid layer is cached
 * per (World, obstacles version), the before-flood per (that, `buildings.wallVersion`, moved id), and
 * the last answer per box too (the client's ghost asks every frame: a drag at one spot floods once).
 * Synchronous: one check at a time.
 */

/** Vertex bit: a body centred here fits. */
const FREE = 1;
/** Edge bit: the body slides to the east neighbour. */
const OPEN_E = 2;
/** Edge bit: the body slides to the south neighbour. */
const OPEN_S = 4;

let cap = 0;
/** Map solids + map edge only (cached per World and obstacle version). */
let base = new Uint8Array(0);
/** + wall buildings (the before-state; cached). */
let walls = new Uint8Array(0);
/** + the new box (the after-state; per check). */
let work = new Uint8Array(0);
/** The before-flood's main region (1) — kept for the cached key. */
let before = new Uint8Array(0);
/** The after-flood (1 = joined). */
let after = new Uint8Array(0);
/** Vertex indices in the before-flood's visiting order (nearest the pad first). */
let order = new Int32Array(0);
let orderLen = 0;
let queue = new Int32Array(0);
/** Story 12.1 H1 (designer A): the main region before a decay stage's mutations (`captureStageRegion`). */
let stageBefore = new Uint8Array(0);
/** H1: the map-only layer's region (no walls) after the mutations. */
let mapOnly = new Uint8Array(0);
/** H1 (re-review round 1): a trial flood's region (a candidate wall lifted). */
let trial = new Uint8Array(0);
/** Re-review round 2: the 0-1 search's buffers (each vertex enters a level queue at most twice). */
let bfsDist = new Int32Array(0);
let bfsPrev = new Int32Array(0);
let bfsDone = new Uint8Array(0);
let bfsCur = new Int32Array(0);
let bfsNext = new Int32Array(0);
let stageCols = 0;
/** The map-only region's key (it changes only with the map's obstacles). */
let mapOnlyObstacles = -1;
let mapOnlyWorld: WeakRef<Readonly<World>> | null = null;
let stageRows = 0;
let cols = 0;
let rows = 0;

let baseWorld: WeakRef<Readonly<World>> | null = null;
let baseObstacles = -1;
let baseR = -1;
let beforeWalls = -1;
let beforeExcept = -1;

/** The last answer (AC 9: the ghost asks every frame). */
const last = { valid: false, minX: 0, minY: 0, maxX: 0, maxY: 0, sealed: false };

/**
 * Story 12.1 (AC 7, CN-2): the pocket the last refused check would close, for the ghost's highlight:
 * the smaller side of the cut (the cut-off vertices, or the pad's side when that is smaller: a ring
 * round the pad highlights its inside), `count` vertices (indices into a `cols` × `rows` vertex grid, `cellM` apart), valid until the next
 * check. Empty after an accepted one.
 */
export const sealedPocket = { count: 0, cells: new Int32Array(0), cols: 0, rows: 0, cellM: BUILD_GRID_M };

function ensure(n: number): void {
  if (n <= cap) return;
  cap = n;
  base = new Uint8Array(n);
  walls = new Uint8Array(n);
  work = new Uint8Array(n);
  before = new Uint8Array(n);
  after = new Uint8Array(n);
  order = new Int32Array(n);
  queue = new Int32Array(n);
  sealedPocket.cells = new Int32Array(n);
  const kept = stageBefore;
  stageBefore = new Uint8Array(n);
  stageBefore.set(kept.subarray(0, Math.min(kept.length, n)));
  mapOnly = new Uint8Array(n);
  trial = new Uint8Array(n);
  bfsDist = new Int32Array(n);
  bfsPrev = new Int32Array(n);
  bfsDone = new Uint8Array(n);
  bfsCur = new Int32Array(2 * n);
  bfsNext = new Int32Array(2 * n);
}

/** Clears the bits of every vertex / edge the box comes within `r` of (strictly, like every clearance test). */
function rasterize(layer: Uint8Array, b: Readonly<MapBox | Box>, r: number): void {
  const c = BUILD_GRID_M;
  const i0 = Math.max(0, Math.ceil((b.minX - r) / c) - 1);
  const i1 = Math.min(cols - 1, Math.floor((b.maxX + r) / c) + 1);
  const j0 = Math.max(0, Math.ceil((b.minY - r) / c) - 1);
  const j1 = Math.min(rows - 1, Math.floor((b.maxY + r) / c) + 1);
  for (let j = j0; j <= j1; j++) {
    const y = j * c;
    for (let i = i0; i <= i1; i++) {
      const x = i * c;
      const v = j * cols + i;
      let bits = layer[v] as number;
      if (bits === 0) continue;
      if ((bits & FREE) !== 0 && circleOverlapsBox(x, y, r, b.minX, b.minY, b.maxX, b.maxY)) bits &= ~FREE;
      if ((bits & OPEN_E) !== 0 && segmentNearBox(x, y, x + c, y, r, b)) bits &= ~OPEN_E;
      if ((bits & OPEN_S) !== 0 && segmentNearBox(x, y, x, y + c, r, b)) bits &= ~OPEN_S;
      layer[v] = bits;
    }
  }
}

/** The map-solid layer for this World (rebuilt when the World, its obstacles or the body radius change). */
function buildBase(world: Readonly<World>, r: number): void {
  const { widthM, heightM } = world.map;
  mapOnlyObstacles = -1; // review round 2 LOW-2: the map-only region follows the radius and the World too
  cols = Math.floor(widthM / BUILD_GRID_M + 1e-9) + 1;
  rows = Math.floor(heightM / BUILD_GRID_M + 1e-9) + 1;
  ensure(cols * rows);
  for (let j = 0; j < rows; j++) {
    for (let i = 0; i < cols; i++) {
      const x = i * BUILD_GRID_M;
      const y = j * BUILD_GRID_M;
      let bits = bodyFitsInMap(x, y, r, widthM, heightM) ? FREE : 0;
      if (bits !== 0) {
        // An edge needs both ends in the map for the body; then the whole segment is (axis-aligned).
        if (i + 1 < cols && bodyFitsInMap(x + BUILD_GRID_M, y, r, widthM, heightM)) bits |= OPEN_E;
        if (j + 1 < rows && bodyFitsInMap(x, y + BUILD_GRID_M, r, widthM, heightM)) bits |= OPEN_S;
      }
      base[j * cols + i] = bits;
    }
  }
  const solids = world.obstacles.solids;
  for (let k = 0; k < solids.length; k++) rasterize(base, solids[k] as MapBox, r);
  if (baseWorld?.deref() !== world) baseWorld = new WeakRef(world); // only when the World changes (never per tick)
  baseObstacles = world.obstacles.version;
  baseR = r;
  beforeWalls = -1;
}

/** Joined to `v` toward neighbour `n` (a 4-neighbour) in `layer`. */
function joined(layer: Uint8Array, v: number, n: number): boolean {
  if (((layer[n] as number) & FREE) === 0) return false;
  if (n === v + 1) return ((layer[v] as number) & OPEN_E) !== 0;
  if (n === v - 1) return ((layer[n] as number) & OPEN_E) !== 0;
  if (n === v + cols) return ((layer[v] as number) & OPEN_S) !== 0;
  return ((layer[n] as number) & OPEN_S) !== 0;
}

/** Breadth-first flood of `layer` from `seed` into `mark` (1 = joined); with `record`, the visiting order goes to `order`. Returns the count. */
function flood(layer: Uint8Array, seed: number, mark: Uint8Array, record: boolean): number {
  const n = cols * rows;
  mark.fill(0, 0, n);
  if (seed < 0 || ((layer[seed] as number) & FREE) === 0) {
    if (record) orderLen = 0;
    return 0;
  }
  let qh = 0;
  let qt = 0;
  mark[seed] = 1;
  queue[qt++] = seed;
  while (qh < qt) {
    const v = queue[qh++] as number;
    const i = v % cols;
    if (i + 1 < cols && mark[v + 1] === 0 && joined(layer, v, v + 1)) {
      mark[v + 1] = 1;
      queue[qt++] = v + 1;
    }
    if (i > 0 && mark[v - 1] === 0 && joined(layer, v, v - 1)) {
      mark[v - 1] = 1;
      queue[qt++] = v - 1;
    }
    if (v + cols < n && mark[v + cols] === 0 && joined(layer, v, v + cols)) {
      mark[v + cols] = 1;
      queue[qt++] = v + cols;
    }
    if (v - cols >= 0 && mark[v - cols] === 0 && joined(layer, v, v - cols)) {
      mark[v - cols] = 1;
      queue[qt++] = v - cols;
    }
  }
  if (record) {
    order.set(queue.subarray(0, qt));
    orderLen = qt;
  }
  return qt;
}

const anchorPt = { x: 0, y: 0 };

/** The main region's anchor: the `evac_pad` (Story 6.10's map spot), else the first team start. */
function anchorPoint(world: Readonly<World>): { x: number; y: number } {
  const spots = world.map.eventSpots;
  for (let k = 0; k < spots.length; k++) {
    const s = spots[k];
    if (s && s.kind === "evac_pad") {
      anchorPt.x = s.x;
      anchorPt.y = s.y;
      return anchorPt;
    }
  }
  teamSpawnPoint(world as World, 0, anchorPt);
  return anchorPt;
}

/** Search rings round the anchor for a free vertex (12 m: the pad sits in open street on every map). */
const ANCHOR_RINGS = 24;

/** The free vertex of `layer` nearest the anchor (ring by ring, a fixed order), or −1. */
function anchorVertex(world: Readonly<World>, layer: Uint8Array): number {
  const a = anchorPoint(world);
  const ci = Math.min(cols - 1, Math.max(0, Math.round(a.x / BUILD_GRID_M)));
  const cj = Math.min(rows - 1, Math.max(0, Math.round(a.y / BUILD_GRID_M)));
  for (let ring = 0; ring <= ANCHOR_RINGS; ring++) {
    for (let dj = -ring; dj <= ring; dj++) {
      for (let di = -ring; di <= ring; di++) {
        if (Math.max(Math.abs(di), Math.abs(dj)) !== ring) continue;
        const i = ci + di;
        const j = cj + dj;
        if (i < 0 || j < 0 || i >= cols || j >= rows) continue;
        const v = j * cols + i;
        if (((layer[v] as number) & FREE) !== 0) return v;
      }
    }
  }
  return -1;
}

/** The walls layer = base + every wall building except `exceptId` (the before-state), and its main region. */
function buildBefore(world: Readonly<World>, r: number, exceptId: number): void {
  walls.set(base.subarray(0, cols * rows));
  const list = world.buildings.list;
  for (let k = 0; k < list.length; k++) {
    const b = list[k] as Building;
    if (!b.solid || (exceptId !== 0 && b.id === exceptId)) continue;
    rasterize(walls, b, r);
  }
  flood(walls, anchorVertex(world, walls), before, true);
  beforeWalls = world.buildings.wallVersion;
  beforeExcept = exceptId;
  last.valid = false;
}

/**
 * Story 12.1 (AC 2, 3): with a wall on `box` (and building `exceptId`, if not 0, lifted from its old
 * spot: a move), some spot of the main walkable region is cut off from it. Fills `sealedPocket`.
 * Callers check only wall types (AC 5) and only after `footprintBlocked` said the spot is free.
 */
export function sealsPath(world: Readonly<World>, box: Readonly<Box>, exceptId = 0): boolean {
  const r = world.balance.player.radiusM;
  const fresh = baseWorld?.deref() !== world || baseObstacles !== world.obstacles.version || baseR !== r;
  if (fresh) buildBase(world, r);
  const beforeFresh = fresh || beforeWalls !== world.buildings.wallVersion || beforeExcept !== exceptId;
  if (!beforeFresh && last.valid && last.minX === box.minX && last.minY === box.minY && last.maxX === box.maxX && last.maxY === box.maxY) return last.sealed;
  if (beforeFresh) buildBefore(world, r, exceptId);
  work.set(walls.subarray(0, cols * rows));
  rasterize(work, box, r);
  // Seed the after-flood from the main region's vertex nearest the pad that is still free.
  let seed = -1;
  for (let k = 0; k < orderLen; k++) {
    const v = order[k] as number;
    if (((work[v] as number) & FREE) !== 0) {
      seed = v;
      break;
    }
  }
  flood(work, seed, after, false);
  let count = 0;
  let kept = 0;
  const cells = sealedPocket.cells;
  for (let k = 0; k < orderLen; k++) {
    const v = order[k] as number;
    if (((work[v] as number) & FREE) === 0) continue;
    if (after[v] === 0) cells[count++] = v;
    else kept++;
  }
  const sealed = count > 0;
  // The highlight (CN-2) is the smaller side: a ring round the pad cuts the rest of the map off from the
  // pad, but the pocket a player sees is the ring's inside (the part still joined to the pad).
  if (sealed && kept < count) {
    count = 0;
    for (let k = 0; k < orderLen; k++) {
      const v = order[k] as number;
      if (after[v] === 1 && ((work[v] as number) & FREE) !== 0) cells[count++] = v;
    }
  }
  sealedPocket.count = count;
  sealedPocket.cols = cols;
  sealedPocket.rows = rows;
  last.valid = true;
  last.minX = box.minX;
  last.minY = box.minY;
  last.maxX = box.maxX;
  last.maxY = box.maxY;
  last.sealed = sealed;
  return sealed;
}

/**
 * Tests (AC 13's escape agreement): whether lattice vertex (i, j) is in the main region of the World as
 * it stands (no new box). Rebuilds the map layer only if stale, but redoes the before-flood on EVERY
 * call (tests only: never per frame).
 */
export function inMainRegion(world: Readonly<World>, i: number, j: number): boolean {
  const r = world.balance.player.radiusM;
  if (baseWorld?.deref() !== world || baseObstacles !== world.obstacles.version || baseR !== r) buildBase(world, r);
  buildBefore(world, r, 0);
  if (i < 0 || j < 0 || i >= cols || j >= rows) return false;
  return before[j * cols + i] === 1;
}

/**
 * Story 12.1 H1 (designer 2026-11-26: A, "re-check paths after each decay stage"). The decay system
 * calls this just before a build start's mutations: the main region as it stands then (map + walls) is
 * kept until `stageCutWall`. Build starts only (never per tick); no allocation.
 */
export function captureStageRegion(world: Readonly<World>): void {
  const r = world.balance.player.radiusM;
  if (baseWorld?.deref() !== world || baseObstacles !== world.obstacles.version || baseR !== r) buildBase(world, r);
  buildBefore(world, r, 0);
  stageBefore.set(before.subarray(0, cols * rows));
  stageCols = cols;
  stageRows = rows;
}

/**
 * Story 12.1 H1 (designer A; re-review round 1 H1-a / H1-b): after a decay stage's mutations (and the
 * overlap / 0.8 m clearing), the stage finished a seal when a vertex that was in the main region before
 * the stage (`captureStageRegion`), is still free and joined to the map's region in the map-only layer
 * (no walls), is no longer in the main region. Those vertices seed a flood of the walls layer: the
 * POCKET, which also takes in ground the stage just freed next to them (H1-a: a removed car). The wall to
 * clear borders BOTH the pocket and the current main region (within `player.radiusM + BUILD_GRID_M` of a
 * vertex of each: only such a wall can close a lattice step between them; H1-b: a turret inside the pocket
 * or a barricade far from it never qualifies): of those, highest id first, the first whose removal alone
 * joins the pocket back (a trial flood). Re-review round 2: if none does (a wall two pieces thick, two
 * walls apart), the highest-id wall on the cheapest way back (`cheapestPathWall`). Null when nothing is cut,
 * or (`stageSealUnresolved` > 0) when nothing can be found. The decay system
 * clears it and asks again, so the order is fixed on every copy that runs it. Per pass: the walls layer
 * and one flood of it (main region, then the pocket from its seeds: disjoint), a scan of each wall's
 * neighbourhood, and a trial flood per candidate tried (usually one). Build starts only.
 */
export function stageCutWall(world: Readonly<World>): Building | null {
  stageUnresolved = 0; // HIGH-1 re-review LOW-A: before every early return (process-global: never a stale count)
  const r = world.balance.player.radiusM;
  if (baseWorld?.deref() !== world || baseObstacles !== world.obstacles.version || baseR !== r) buildBase(world, r);
  if (cols !== stageCols || rows !== stageRows) return null; // no capture for this map
  if (mapOnlyObstacles !== baseObstacles || mapOnlyWorld !== baseWorld) {
    flood(base, anchorVertex(world, base), mapOnly, false); // the map's own region: walls never change it
    mapOnlyObstacles = baseObstacles;
    mapOnlyWorld = baseWorld;
  }
  buildBefore(world, r, 0);
  const n = cols * rows;
  // The pocket: seeds (old main region, still free, map-joined, cut off now), flooded through the walls layer.
  const pocket = after;
  pocket.fill(0, 0, n);
  let qt = 0;
  for (let v = 0; v < n; v++) {
    if (stageBefore[v] !== 1 || before[v] === 1 || mapOnly[v] !== 1 || ((walls[v] as number) & FREE) === 0) continue;
    pocket[v] = 1;
    queue[qt++] = v;
  }
  if (qt === 0) return null;
  let qh = 0;
  while (qh < qt) {
    const v = queue[qh++] as number;
    const i = v % cols;
    if (i + 1 < cols && pocket[v + 1] === 0 && before[v + 1] === 0 && joined(walls, v, v + 1)) {
      pocket[v + 1] = 1;
      queue[qt++] = v + 1;
    }
    if (i > 0 && pocket[v - 1] === 0 && before[v - 1] === 0 && joined(walls, v, v - 1)) {
      pocket[v - 1] = 1;
      queue[qt++] = v - 1;
    }
    if (v + cols < n && pocket[v + cols] === 0 && before[v + cols] === 0 && joined(walls, v, v + cols)) {
      pocket[v + cols] = 1;
      queue[qt++] = v + cols;
    }
    if (v - cols >= 0 && pocket[v - cols] === 0 && before[v - cols] === 0 && joined(walls, v, v - cols)) {
      pocket[v - cols] = 1;
      queue[qt++] = v - cols;
    }
  }
  // Fast path: among the walls bordering both the pocket and the main region (highest id first), the first
  // whose removal alone joins the pocket back (a trial flood without it: a corner piece hidden behind its
  // neighbours opens nothing).
  const reach = r + BUILD_GRID_M;
  const list = world.buildings.list;
  for (let k = list.length - 1; k >= 0; k--) {
    const b = list[k] as Building; // the list is sorted by id: candidates come highest first
    if (!b.solid || !bordersMark(b, pocket, 1, reach) || !bordersMark(b, before, 1, reach)) continue;
    if (rejoinsWithout(world, b, r, pocket)) return b;
  }
  // Re-review round 2 HIGH-1: no single wall reopens it (a wall two or more pieces thick, or two walls
  // apart): the cheapest way back through the walls.
  const b = stageCutTestHooks.noWall ? null : cheapestPathWall(world, r, pocket);
  if (b === null) stageUnresolved = qt;
  return b;
}

/**
 * Re-review round 2 HIGH-1: a 0-1 breadth-first search on the map-only layer from the pocket to the
 * current main region. A lattice step the walls layer also allows costs 0; one only walls block costs 1.
 * Returns the highest-id wall that blocks a step of the cheapest way found (each costly step's vertex or
 * segment comes within `player.radiusM` of it), or null. The cost counts blocked lattice STEPS, not buildings,
 * so the way found is the shortest crossing through walls, not always the fewest walls (HIGH-1 re-review: a
 * thick layout can lose 4 where 2 would do; MEDIUM-1 waits on the designer). Clearing it and asking again
 * reopens the pocket. Buffers are module scratch (`ensure`); no allocation per call.
 */
function cheapestPathWall(world: Readonly<World>, r: number, pocket: Uint8Array): Building | null {
  const n = cols * rows;
  bfsDist.fill(0x3fffffff, 0, n);
  bfsDone.fill(0, 0, n);
  let curLen = 0;
  for (let v = 0; v < n; v++) {
    if (pocket[v] !== 1) continue; // every pocket vertex starts at cost 0 (the trial floods reused `queue`)
    bfsDist[v] = 0;
    bfsPrev[v] = -1;
    bfsCur[curLen++] = v;
  }
  let target = -1;
  let level = 0;
  while (curLen > 0 && target < 0) {
    let nextLen = 0;
    for (let k = 0; k < curLen && target < 0; k++) {
      const v = bfsCur[k] as number;
      if (bfsDone[v] === 1 || (bfsDist[v] as number) !== level) continue;
      bfsDone[v] = 1;
      if (before[v] === 1) {
        target = v;
        break;
      }
      const i = v % cols;
      for (let d = 0; d < 4; d++) {
        const u = d === 0 ? (i + 1 < cols ? v + 1 : -1) : d === 1 ? (i > 0 ? v - 1 : -1) : d === 2 ? (v + cols < n ? v + cols : -1) : v - cols;
        if (u < 0 || bfsDone[u] === 1 || !joined(base, v, u)) continue;
        const cost = joined(walls, v, u) ? 0 : 1;
        const nd = level + cost;
        if (nd >= (bfsDist[u] as number)) continue;
        bfsDist[u] = nd;
        bfsPrev[u] = v;
        if (cost === 0) bfsCur[curLen++] = u;
        else bfsNext[nextLen++] = u;
      }
    }
    if (target >= 0) break;
    const t = bfsCur;
    bfsCur = bfsNext;
    bfsNext = t;
    curLen = nextLen;
    level++;
  }
  if (target < 0) return null;
  // The highest-id wall that blocks a costly step of the way.
  const list = world.buildings.list;
  let best: Building | null = null;
  for (let v = target; bfsPrev[v] !== -1 && v >= 0; v = bfsPrev[v] as number) {
    const u = bfsPrev[v] as number;
    if (joined(walls, u, v)) continue;
    const x0 = (Math.min(u, v) % cols) * BUILD_GRID_M;
    const y0 = Math.floor(Math.min(u, v) / cols) * BUILD_GRID_M;
    const x1 = (Math.max(u, v) % cols) * BUILD_GRID_M;
    const y1 = Math.floor(Math.max(u, v) / cols) * BUILD_GRID_M;
    for (let k = list.length - 1; k >= 0; k--) {
      const b = list[k] as Building;
      if (!b.solid || (best !== null && b.id <= best.id)) continue;
      if (segmentNearBox(Math.min(x0, x1), Math.min(y0, y1), Math.max(x0, x1), Math.max(y0, y1), r, b)) best = b;
    }
  }
  return best;
}

/** Tests only (HIGH-1 re-review LOW-A/B): `noWall` makes the cheapest-path search find nothing, to force an unresolved cut. */
export const stageCutTestHooks = { noWall: false };

/** Re-review round 2: the seed count of the last `stageCutWall` that found a cut it could not resolve (0 = none). */
let stageUnresolved = 0;
export function stageSealUnresolved(): number {
  return stageUnresolved;
}

/** The main region of the walls layer without wall `w` reaches a vertex of the pocket (one flood, into `trial`). */
function rejoinsWithout(world: Readonly<World>, w: Building, r: number, pocket: Uint8Array): boolean {
  const n = cols * rows;
  work.set(base.subarray(0, n));
  const list = world.buildings.list;
  for (let k = 0; k < list.length; k++) {
    const b = list[k] as Building;
    if (b.solid && b !== w) rasterize(work, b, r);
  }
  flood(work, anchorVertex(world, work), trial, false);
  for (let v = 0; v < n; v++) if (pocket[v] === 1 && trial[v] === 1) return true;
  return false;
}

/** Some vertex marked `value` in `mark` lies closer than `reach` to the box (strictly). */
function bordersMark(b: Readonly<Box>, mark: Uint8Array, value: number, reach: number): boolean {
  const c = BUILD_GRID_M;
  const i0 = Math.max(0, Math.ceil((b.minX - reach) / c));
  const i1 = Math.min(cols - 1, Math.floor((b.maxX + reach) / c));
  const j0 = Math.max(0, Math.ceil((b.minY - reach) / c));
  const j1 = Math.min(rows - 1, Math.floor((b.maxY + reach) / c));
  for (let j = j0; j <= j1; j++) {
    const y = j * c;
    for (let i = i0; i <= i1; i++) {
      if (mark[j * cols + i] !== value) continue;
      const x = i * c;
      const dx = Math.max(0, b.minX - x, x - b.maxX);
      const dy = Math.max(0, b.minY - y, y - b.maxY);
      if (dx * dx + dy * dy < reach * reach) return true;
    }
  }
  return false;
}

/**
 * Story 12.1 review L3 (map checks, Epic 11's generated maps): free vertices of the World as it stands
 * that are NOT in the main region (a nook the grid reads as closed, or a sealed pocket). A map should
 * load with 0: otherwise part of it is unreachable from the pad for a player before anyone builds.
 */
export function verticesOutsideMainRegion(world: Readonly<World>): number {
  const r = world.balance.player.radiusM;
  if (baseWorld?.deref() !== world || baseObstacles !== world.obstacles.version || baseR !== r) buildBase(world, r);
  buildBefore(world, r, 0);
  let n = 0;
  for (let v = 0; v < cols * rows; v++) if (((walls[v] as number) & FREE) !== 0 && before[v] === 0) n++;
  return n;
}

/** Tests and `tools/sims/pathOpenBench.ts`: drop every cache (the AC 8 fuzz's cold server answer; the bench's fully cold path). */
export function resetPathOpenCache(): void {
  baseWorld = null;
  baseObstacles = -1;
  beforeWalls = -1;
  last.valid = false;
}

/** Story 12.2: the lattice `walkDistanceFrom` filled (vertex (i, j) = index j × cols + i, at (i, j) × `cellM`). */
export const walkLattice = { cols: 0, rows: 0, cellM: BUILD_GRID_M };

/**
 * Story 12.2 (AC 5): the extraction walk's field. Lattice steps from the free vertex nearest (x, y) (the `evac_pad`) to
 * every vertex a player's body reaches over the World as it stands (map solids + wall buildings: the same joins the
 * 12.1 rule guarantees), into `out` (grown here if short: once per run); −1 = not joined. Fills `walkLattice`. Once at
 * the extract's start (buildings never change in that phase), never per tick. Returns `out` (or its replacement).
 */
export function walkDistanceFrom(world: Readonly<World>, x: number, y: number, out: Int32Array): Int32Array {
  const r = world.balance.player.radiusM;
  if (baseWorld?.deref() !== world || baseObstacles !== world.obstacles.version || baseR !== r) buildBase(world, r);
  buildBefore(world, r, 0);
  const n = cols * rows;
  walkLattice.cols = cols;
  walkLattice.rows = rows;
  const dist = out.length >= n ? out : new Int32Array(n);
  dist.fill(-1, 0, n);
  const ci = Math.min(cols - 1, Math.max(0, Math.round(x / BUILD_GRID_M)));
  const cj = Math.min(rows - 1, Math.max(0, Math.round(y / BUILD_GRID_M)));
  let seed = -1;
  for (let ring = 0; ring <= ANCHOR_RINGS && seed < 0; ring++) {
    for (let dj = -ring; dj <= ring && seed < 0; dj++) {
      for (let di = -ring; di <= ring; di++) {
        if (Math.max(Math.abs(di), Math.abs(dj)) !== ring) continue;
        const i = ci + di;
        const j = cj + dj;
        if (i < 0 || j < 0 || i >= cols || j >= rows) continue;
        if (((walls[j * cols + i] as number) & FREE) !== 0) {
          seed = j * cols + i;
          break;
        }
      }
    }
  }
  if (seed < 0) return dist;
  let qh = 0;
  let qt = 0;
  dist[seed] = 0;
  queue[qt++] = seed;
  while (qh < qt) {
    const v = queue[qh++] as number;
    const d = (dist[v] as number) + 1;
    const i = v % cols;
    if (i + 1 < cols && dist[v + 1] === -1 && joined(walls, v, v + 1)) {
      dist[v + 1] = d;
      queue[qt++] = v + 1;
    }
    if (i > 0 && dist[v - 1] === -1 && joined(walls, v, v - 1)) {
      dist[v - 1] = d;
      queue[qt++] = v - 1;
    }
    if (v + cols < n && dist[v + cols] === -1 && joined(walls, v, v + cols)) {
      dist[v + cols] = d;
      queue[qt++] = v + cols;
    }
    if (v - cols >= 0 && dist[v - cols] === -1 && joined(walls, v, v - cols)) {
      dist[v - cols] = d;
      queue[qt++] = v - cols;
    }
  }
  return dist;
}
