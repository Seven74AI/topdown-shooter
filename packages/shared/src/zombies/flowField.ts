import { FLOW_CELL_M } from "../config/constants";
import type { World } from "../core/world";
import type { Building } from "../buildings/buildings";
import type { DistrictBounds } from "../map/placeholderMap";
import type { PlayerState } from "../player/player";

/**
 * Story 3.5: flow-field pathfinding (architecture › Zombie Pathfinding; FR26, FR53).
 *
 * **NavGrid** — the map on a 0.5 m grid (48 × 32 m → 96 × 64 = 6,144 cells). Every cell a building's
 * box overlaps (conservatively: any overlap) holds that building's id and a high entry cost
 * (`pathing.buildingCostM`); free cells next to a building cost `nearWallCostM` extra. Rasterized
 * again as soon as `world.buildings.version` changes, so the attack rule and the next-cell choice
 * always see the current buildings.
 *
 * **FlowField** — per cell, the path cost to the nearest alive player: a multi-source Dijkstra from
 * the players' cells, 8-connected (orthogonal step 2, diagonal 3 cost units; 1 unit = a quarter of
 * a cell), no corner cutting past building cells. Buildings are expensive, not walls, so a closed
 * ring still has a field and it leads to the cheapest wall to break.
 *
 * **Cadence** (Epic 2 retro R1: players move every tick): the rebuild never stops. It is built into
 * a back buffer, at most `pathing.rebuildCellsPerTick` cells settled per tick; when it completes it
 * swaps in (at most one completion per tick) and the next rebuild starts on the next tick with the
 * players' cells of that tick. A refresh takes P = ceil(cells / budget) ticks and the front buffer
 * is at most 2P ticks old (`flowFieldMaxAgeTicks`). A building change reaches the field with the
 * next rebuild that starts after it (≤ 2P ticks); the in-progress rebuild reads the new costs.
 *
 * Allocation-free per tick (typed arrays sized once from the map, an indexed binary heap keyed by
 * (cost, cell) so equal costs pop in a fixed order: deterministic). Runs only where zombies run
 * (server, solo): the client's prediction never does.
 *
 * Story 3.8 adds a second FlowField on the same NavGrid whose `fillPenalty` marks cells in front of
 * players (flanking); `penalty` is added to the entry cost of each cell.
 */

/** "No player reachable" (also: no alive player when the field was seeded). */
export const FLOW_UNREACHED = 0x3fffffff;
/** Cost units per metre (a step to an orthogonal neighbour is 2 units = one 0.5 m cell). */
export const FLOW_UNITS_PER_M = 2 / FLOW_CELL_M;
const STEP_ORTHO = 2;
const STEP_DIAG = 3;
/** heapPos markers. */
const NOT_QUEUED = -1;
const SETTLED = -2;

/** Neighbour offsets in a fixed order: E, W, S, N, SE, SW, NE, NW. */
const NDX = [1, -1, 0, 0, 1, -1, 1, -1] as const;
const NDY = [0, 0, 1, -1, 1, 1, -1, -1] as const;

export interface NavGrid {
  readonly cellM: number;
  readonly cols: number;
  readonly rows: number;
  readonly cells: number;
  /** Building id per cell (0 = no building). */
  readonly buildingAt: Int32Array;
  /** Cost units added when stepping into the cell. */
  readonly enterCost: Int32Array;
  /** `world.buildings.version` last rasterized (-1: never). */
  version: number;
}

export interface FlowField {
  /** The field zombies read: cost to the nearest alive player per cell. */
  front: Int32Array;
  /** The field being built. Swapped with `front` when a rebuild completes. */
  back: Int32Array;
  /** Extra entry cost per cell for this field (Story 3.8's flank field); zeros for the chase field. */
  readonly penalty: Uint16Array;
  /** Fills `penalty` when a rebuild starts (null: none). Must not allocate. */
  readonly fillPenalty: ((field: FlowField, world: Readonly<World>) => void) | null;
  /** Indexed binary min-heap of cells, keyed by (back[cell], cell). */
  readonly heap: Int32Array;
  /** Position of each cell in `heap`, NOT_QUEUED or SETTLED. */
  readonly heapPos: Int32Array;
  heapSize: number;
  /** A rebuild is in progress. */
  building: boolean;
  /** Tick whose player cells seeded the rebuild in progress. */
  buildSourceTick: number;
  /** Tick whose player cells seeded `front` (-1: no field yet). */
  sourceTick: number;
  /** Completed rebuilds (tests, benchmark). */
  rebuilds: number;
}

export interface PathingState {
  readonly nav: NavGrid;
  /** The field every zombie type follows (Story 3.8 adds `flank`). */
  readonly chase: FlowField;
}

export function createNavGrid(map: DistrictBounds): NavGrid {
  const cols = Math.max(1, Math.ceil(map.widthM / FLOW_CELL_M));
  const rows = Math.max(1, Math.ceil(map.heightM / FLOW_CELL_M));
  const cells = cols * rows;
  return { cellM: FLOW_CELL_M, cols, rows, cells, buildingAt: new Int32Array(cells), enterCost: new Int32Array(cells), version: -1 };
}

export function createFlowField(nav: NavGrid, fillPenalty: FlowField["fillPenalty"] = null): FlowField {
  const n = nav.cells;
  return {
    front: new Int32Array(n).fill(FLOW_UNREACHED),
    back: new Int32Array(n).fill(FLOW_UNREACHED),
    penalty: new Uint16Array(n),
    fillPenalty,
    heap: new Int32Array(n),
    heapPos: new Int32Array(n).fill(NOT_QUEUED),
    heapSize: 0,
    building: false,
    buildSourceTick: -1,
    sourceTick: -1,
    rebuilds: 0,
  };
}

export function createPathingState(map: DistrictBounds): PathingState {
  const nav = createNavGrid(map);
  return { nav, chase: createFlowField(nav) };
}

/** The cell index of a point (clamped to the grid). */
export function flowCellAt(nav: NavGrid, x: number, y: number): number {
  const cx = Math.min(nav.cols - 1, Math.max(0, Math.floor(x / nav.cellM)));
  const cy = Math.min(nav.rows - 1, Math.max(0, Math.floor(y / nav.cellM)));
  return cy * nav.cols + cx;
}

export const flowCellCenterX = (nav: NavGrid, cell: number): number => ((cell % nav.cols) + 0.5) * nav.cellM;
export const flowCellCenterY = (nav: NavGrid, cell: number): number => (Math.floor(cell / nav.cols) + 0.5) * nav.cellM;

/** Ticks per full refresh: P = ceil(cells / rebuildCellsPerTick). */
export function flowRefreshTicks(world: Readonly<World>): number {
  return Math.ceil(world.pathing.nav.cells / world.balance.zombies.pathing.rebuildCellsPerTick);
}

/** The oldest the front field may be (in ticks, measured between steps): 2P. */
export function flowFieldMaxAgeTicks(world: Readonly<World>): number {
  return 2 * flowRefreshTicks(world);
}

/** Writes the buildings into the grid (only when `buildings.version` changed). */
export function rasterizeBuildings(nav: NavGrid, world: Readonly<World>): void {
  nav.buildingAt.fill(0);
  nav.enterCost.fill(0);
  const pathing = world.balance.zombies.pathing;
  const buildingCost = Math.max(1, Math.round(pathing.buildingCostM * FLOW_UNITS_PER_M));
  const nearWall = Math.round(pathing.nearWallCostM * FLOW_UNITS_PER_M);
  const { cols, rows, cellM, buildingAt, enterCost } = nav;
  const list = world.buildings.list;
  for (let i = 0; i < list.length; i++) {
    const b = list[i] as Building;
    const x0 = Math.max(0, Math.floor(b.minX / cellM));
    const x1 = Math.min(cols - 1, Math.ceil(b.maxX / cellM) - 1);
    const y0 = Math.max(0, Math.floor(b.minY / cellM));
    const y1 = Math.min(rows - 1, Math.ceil(b.maxY / cellM) - 1);
    for (let cy = y0; cy <= y1; cy++) {
      for (let cx = x0; cx <= x1; cx++) {
        buildingAt[cy * cols + cx] = b.id;
        enterCost[cy * cols + cx] = buildingCost;
      }
    }
  }
  if (nearWall > 0) {
    for (let i = 0; i < list.length; i++) {
      const b = list[i] as Building;
      const x0 = Math.max(0, Math.floor(b.minX / cellM) - 1);
      const x1 = Math.min(cols - 1, Math.ceil(b.maxX / cellM));
      const y0 = Math.max(0, Math.floor(b.minY / cellM) - 1);
      const y1 = Math.min(rows - 1, Math.ceil(b.maxY / cellM));
      for (let cy = y0; cy <= y1; cy++) {
        for (let cx = x0; cx <= x1; cx++) {
          const c = cy * cols + cx;
          if (buildingAt[c] === 0 && (enterCost[c] as number) < nearWall) enterCost[c] = nearWall;
        }
      }
    }
  }
  nav.version = world.buildings.version;
}

// ---- indexed binary heap over `field.back` -------------------------------------------------

function less(d: Int32Array, a: number, b: number): boolean {
  const da = d[a] as number;
  const db = d[b] as number;
  return da < db || (da === db && a < b);
}

function siftUp(f: FlowField, pos: number): void {
  const { heap, heapPos, back } = f;
  const c = heap[pos] as number;
  while (pos > 0) {
    const parent = (pos - 1) >> 1;
    const p = heap[parent] as number;
    if (!less(back, c, p)) break;
    heap[pos] = p;
    heapPos[p] = pos;
    pos = parent;
  }
  heap[pos] = c;
  heapPos[c] = pos;
}

function siftDown(f: FlowField, pos: number): void {
  const { heap, heapPos, back } = f;
  const n = f.heapSize;
  const c = heap[pos] as number;
  for (;;) {
    const l = pos * 2 + 1;
    if (l >= n) break;
    const r = l + 1;
    let m = l;
    if (r < n && less(back, heap[r] as number, heap[l] as number)) m = r;
    const mc = heap[m] as number;
    if (!less(back, mc, c)) break;
    heap[pos] = mc;
    heapPos[mc] = pos;
    pos = m;
  }
  heap[pos] = c;
  heapPos[c] = pos;
}

function push(f: FlowField, cell: number): void {
  f.heap[f.heapSize] = cell;
  f.heapPos[cell] = f.heapSize;
  f.heapSize++;
  siftUp(f, f.heapSize - 1);
}

function pop(f: FlowField): number {
  const top = f.heap[0] as number;
  f.heapSize--;
  if (f.heapSize > 0) {
    f.heap[0] = f.heap[f.heapSize] as number;
    f.heapPos[f.heap[0] as number] = 0;
    siftDown(f, 0);
  }
  f.heapPos[top] = SETTLED;
  return top;
}

// ---- rebuild ---------------------------------------------------------------------------------

/** Seeding pass in progress (module-level callback: no closure per rebuild). */
const seed: { field: FlowField | null; nav: NavGrid | null } = { field: null, nav: null };
const seedPlayer = (p: PlayerState): void => {
  if (p.status !== "alive") return;
  const f = seed.field as FlowField;
  const c = flowCellAt(seed.nav as NavGrid, p.x, p.y);
  if (f.back[c] === 0) return; // two players in one cell
  f.back[c] = 0;
  push(f, c);
};

function startRebuild(f: FlowField, nav: NavGrid, world: Readonly<World>): void {
  f.back.fill(FLOW_UNREACHED);
  f.heapPos.fill(NOT_QUEUED);
  f.heapSize = 0;
  if (f.fillPenalty) f.fillPenalty(f, world);
  seed.field = f;
  seed.nav = nav;
  world.players.forEach(seedPlayer); // Map insertion order: the same on every run
  seed.field = null;
  seed.nav = null;
  f.buildSourceTick = world.tick;
  f.building = true;
}

/** Settles one cell and relaxes its neighbours. */
function settleOne(f: FlowField, nav: NavGrid): void {
  const c = pop(f);
  const { cols, rows, buildingAt, enterCost } = nav;
  const back = f.back;
  const pen = f.penalty;
  // A zombie in a neighbour n walks n → c and pays the step plus entering c.
  const base = (back[c] as number) + (enterCost[c] as number) + (pen[c] as number);
  const cx = c % cols;
  const cy = (c - cx) / cols;
  for (let k = 0; k < 8; k++) {
    const dx = NDX[k] as number;
    const dy = NDY[k] as number;
    const nx = cx + dx;
    const ny = cy + dy;
    if (nx < 0 || ny < 0 || nx >= cols || ny >= rows) continue;
    const n = ny * cols + nx;
    if (f.heapPos[n] === SETTLED) continue;
    let step = STEP_ORTHO;
    if (dx !== 0 && dy !== 0) {
      // No corner cutting: both orthogonal cells between c and n must be free of buildings.
      if (buildingAt[cy * cols + nx] !== 0 || buildingAt[ny * cols + cx] !== 0) continue;
      step = STEP_DIAG;
    }
    const nd = base + step;
    if (nd >= (back[n] as number)) continue;
    back[n] = nd;
    const pos = f.heapPos[n] as number;
    if (pos === NOT_QUEUED) push(f, n);
    else siftUp(f, pos);
  }
}

/**
 * One tick of the field: rasterize on a building change, start a rebuild if none is running, settle
 * up to `budget` cells, and swap the result in when the queue runs dry (at most once per call).
 */
export function advanceFlowField(f: FlowField, nav: NavGrid, world: Readonly<World>, budget: number): void {
  if (!f.building) startRebuild(f, nav, world);
  let left = budget;
  while (left > 0 && f.heapSize > 0) {
    settleOne(f, nav);
    left--;
  }
  if (f.heapSize === 0) {
    const t = f.front;
    f.front = f.back;
    f.back = t;
    f.sourceTick = f.buildSourceTick;
    f.building = false;
    f.rebuilds++;
  }
}

/** The whole field at once (Story 8.4 after a restore; benchmarks). */
export function rebuildFlowFieldNow(f: FlowField, nav: NavGrid, world: Readonly<World>): void {
  if (nav.version !== world.buildings.version) rasterizeBuildings(nav, world);
  f.building = false;
  advanceFlowField(f, nav, world, nav.cells + 1);
}

/** The `buildings` system slot's pathing part: keeps the grid current and advances the chase field. */
export function updatePathing(world: World): void {
  const { nav, chase } = world.pathing;
  if (nav.version !== world.buildings.version) rasterizeBuildings(nav, world);
  advanceFlowField(chase, nav, world, world.balance.zombies.pathing.rebuildCellsPerTick);
}

/**
 * The best neighbour of `cell` in the front field: the lowest step + entry cost + neighbour cost
 * among neighbours closer to a player (ties: the fixed neighbour order). -1 when the cell has no
 * field (none yet, no player) or is a local minimum (a player's cell).
 */
export function flowNextCell(f: FlowField, nav: NavGrid, cell: number): number {
  const front = f.front;
  const here = front[cell] as number;
  if (here >= FLOW_UNREACHED) return -1;
  const { cols, rows, buildingAt, enterCost } = nav;
  const pen = f.penalty;
  const cx = cell % cols;
  const cy = (cell - cx) / cols;
  let best = -1;
  let bestCost = FLOW_UNREACHED;
  for (let k = 0; k < 8; k++) {
    const dx = NDX[k] as number;
    const dy = NDY[k] as number;
    const nx = cx + dx;
    const ny = cy + dy;
    if (nx < 0 || ny < 0 || nx >= cols || ny >= rows) continue;
    const n = ny * cols + nx;
    const fn = front[n] as number;
    if (fn >= here) continue;
    let step = STEP_ORTHO;
    if (dx !== 0 && dy !== 0) {
      if (buildingAt[cy * cols + nx] !== 0 || buildingAt[ny * cols + cx] !== 0) continue;
      step = STEP_DIAG;
    }
    const cost = fn + step + (enterCost[n] as number) + (pen[n] as number);
    if (cost < bestCost) {
      bestCost = cost;
      best = n;
    }
  }
  return best;
}

/** FNV-1a over an Int32Array (snapshot digest; not per tick). */
function hashInts(a: Int32Array): number {
  let h = 0x811c9dc5;
  for (let i = 0; i < a.length; i++) {
    h ^= a[i] as number;
    h = Math.imul(h, 0x01000193);
  }
  return h >>> 0;
}

/** Plain-data digest of the pathing state for `snapshotWorld` (determinism tests, Story 8.4). */
export function snapshotPathing(p: PathingState) {
  const f = p.chase;
  return {
    navVersion: p.nav.version,
    navHash: hashInts(p.nav.buildingAt) ^ hashInts(p.nav.enterCost),
    chase: {
      building: f.building,
      buildSourceTick: f.buildSourceTick,
      sourceTick: f.sourceTick,
      rebuilds: f.rebuilds,
      heapSize: f.heapSize,
      frontHash: hashInts(f.front),
      backHash: hashInts(f.back),
    },
  };
}
