import { FLOW_CELL_M } from "../config/constants";
import type { World } from "../core/world";
import type { Building } from "../buildings/buildings";
import type { DistrictBounds } from "../map/placeholderMap";
import type { PlayerState } from "../player/player";
import { ZOMBIE_TYPES } from "./zombieTypes";

/**
 * Story 3.5: flow-field pathfinding (architecture › Zombie Pathfinding; FR26, FR53).
 *
 * **NavGrid** — the map on a 0.5 m grid (48 × 32 m → 96 × 64 = 6,144 cells). Every cell a building's
 * box overlaps (conservatively: any overlap) holds that building's id and a high entry cost
 * (`pathing.buildingCostM`); free cells next to a building cost `nearWallCostM` extra. Rasterized
 * again as soon as `world.buildings.version` changes, so the attack rule and the next-cell choice
 * always see the current buildings.
 *
 * **Clearance (3.5 review H1).** A zombie's body (radius ≤ one cell) does not fit through a one-cell
 * gap. A grid *vertex* (cell corner) is free when its four cells are free and it is not on the map
 * edge: a body centred there clears every box by ≥ 0.5 m. A move between two free orthogonal cells
 * crosses their shared edge; when neither end of that edge is a free vertex the gap is narrower than
 * a body (a 0.5 m slot between two buildings or a building and the map edge, or two offset corners
 * 0.5 m apart): the move is a **pinch**, costs `buildingCostM` like a building cell, and carries the
 * id of a building at the pinch (the zombie that takes it attacks that building). A diagonal move
 * needs its shared vertex free.
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
 * Story 3.8: a second FlowField on the same NavGrid, `flank`, whose `fillPenalty` marks the cells in
 * front of every alive player (within ±`flank.coneHalfAngleDeg` of the aim, up to `coneRadiusM`;
 * the union of all cones); `penalty` is added to the entry cost of each cell. Runners (`flanks`
 * types) follow it. The two fields share the budget: while a flanker is alive, even ticks advance
 * the chase field and odd ticks the flank field (each ≤ 4P ticks old); otherwise the chase field
 * gets every tick (≤ 2P) and the flank field pauses (restarted fresh when flankers come back).
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
  /** Per vertex ((cols + 1) × (rows + 1)): 1 = a body centred there clears every building and the map edge. */
  readonly vertexFree: Uint8Array;
  /** Building id of a pinch on the edge between cell c and c + 1 (east) / c + cols (south); 0 = open. */
  readonly pinchE: Int32Array;
  readonly pinchS: Int32Array;
  /** Cost units of a building cell or a pinch (from `buildingCostM`, cached when rasterized). */
  buildingCost: number;
  /** `world.buildings.version` last rasterized (-1: never). */
  version: number;
}

export interface FlowField {
  /** The field zombies read: cost to the nearest alive player per cell. */
  front: Int32Array;
  /** The field being built. Swapped with `front` when a rebuild completes. */
  back: Int32Array;
  /**
   * Extra entry cost per cell for the rebuild in progress (Story 3.8's flank field; zeros for the
   * chase field). Swapped with `frontPenalty` together with `front`/`back`.
   */
  penalty: Uint16Array;
  /** The penalty `front` was built with (the next-cell choice reads it). */
  frontPenalty: Uint16Array;
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

/**
 * Per zombie slot (3.5 review H1 safety net): while a zombie follows the field, every
 * `pathing.stuckTicks` ticks its position is compared with the last check; less than
 * `pathing.stuckMoveM` sets `stuck` (it then hits a building it touches).
 */
export interface ZombieProgress {
  readonly anchorX: Float32Array;
  readonly anchorY: Float32Array;
  readonly ticks: Uint16Array;
  readonly stuck: Uint8Array;
  /** Pool generation the record belongs to (a reused slot starts over). */
  readonly gen: Uint8Array;
}

export interface PathingState {
  readonly nav: NavGrid;
  /** The field every zombie type follows (except flankers in the open, Story 3.8). */
  readonly chase: FlowField;
  readonly progress: ZombieProgress;
  /** Story 3.8: the chase field plus a penalty on the cells in front of players (Runners). */
  readonly flank: FlowField;
  /** Story 3.8: a flanking zombie was alive this tick, so the two fields alternate ticks. */
  flankActive: boolean;
}

export function createNavGrid(map: DistrictBounds): NavGrid {
  const cols = Math.max(1, Math.ceil(map.widthM / FLOW_CELL_M));
  const rows = Math.max(1, Math.ceil(map.heightM / FLOW_CELL_M));
  const cells = cols * rows;
  return {
    cellM: FLOW_CELL_M,
    cols,
    rows,
    cells,
    buildingAt: new Int32Array(cells),
    enterCost: new Int32Array(cells),
    vertexFree: new Uint8Array((cols + 1) * (rows + 1)),
    pinchE: new Int32Array(cells),
    pinchS: new Int32Array(cells),
    buildingCost: 0,
    version: -1,
  };
}

export function createFlowField(nav: NavGrid, fillPenalty: FlowField["fillPenalty"] = null): FlowField {
  const n = nav.cells;
  return {
    front: new Int32Array(n).fill(FLOW_UNREACHED),
    back: new Int32Array(n).fill(FLOW_UNREACHED),
    penalty: new Uint16Array(n),
    frontPenalty: new Uint16Array(n),
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

function createProgress(capacity: number): ZombieProgress {
  return {
    anchorX: new Float32Array(capacity),
    anchorY: new Float32Array(capacity),
    ticks: new Uint16Array(capacity),
    stuck: new Uint8Array(capacity),
    gen: new Uint8Array(capacity),
  };
}

/** Bounds of the placeholder state of Worlds that never run pathing (3.5 review L5): one cell. */
const NO_PATHING_MAP: DistrictBounds = { widthM: FLOW_CELL_M, heightM: FLOW_CELL_M };

/**
 * `map`'s pathing state for `zombieCapacity` zombie slots. `enabled: false` (the client's mirror and
 * prediction Worlds, which never run the buildings or zombie systems) gives a one-cell placeholder
 * instead of ~150 KB of grids (3.5 review L5).
 */
export function createPathingState(map: DistrictBounds, zombieCapacity: number, enabled = true): PathingState {
  const nav = createNavGrid(enabled ? map : NO_PATHING_MAP);
  return {
    nav,
    chase: createFlowField(nav),
    flank: createFlowField(nav, fillFlankPenalty),
    flankActive: false,
    progress: createProgress(enabled ? zombieCapacity : 1),
  };
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

/** The oldest the chase field may be while it has every tick (no flanker alive), in ticks: 2P. */
export function flowFieldMaxAgeTicks(world: Readonly<World>): number {
  return 2 * flowRefreshTicks(world);
}

/**
 * Story 3.8: the oldest either field may be while the two share the ticks (a flanker is alive): 4P.
 * Flankers never follow a flank field older than this.
 */
export function flowSharedMaxAgeTicks(world: Readonly<World>): number {
  return 4 * flowRefreshTicks(world);
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
  // Clearance: free vertices, then pinches on edges between two free cells.
  const vcols = cols + 1;
  const vf = nav.vertexFree;
  for (let vy = 0; vy <= rows; vy++) {
    for (let vx = 0; vx <= cols; vx++) {
      let free = vx > 0 && vy > 0 && vx < cols && vy < rows ? 1 : 0;
      if (free === 1) {
        const c = (vy - 1) * cols + (vx - 1);
        if (buildingAt[c] !== 0 || buildingAt[c + 1] !== 0 || buildingAt[c + cols] !== 0 || buildingAt[c + cols + 1] !== 0) free = 0;
      }
      vf[vy * vcols + vx] = free;
    }
  }
  nav.pinchE.fill(0);
  nav.pinchS.fill(0);
  for (let cy = 0; cy < rows; cy++) {
    for (let cx = 0; cx < cols; cx++) {
      const c = cy * cols + cx;
      if (buildingAt[c] !== 0) continue;
      // East edge: x = cx + 1, from vertex (cx + 1, cy) to (cx + 1, cy + 1).
      if (cx + 1 < cols && buildingAt[c + 1] === 0 && vf[cy * vcols + cx + 1] === 0 && vf[(cy + 1) * vcols + cx + 1] === 0) {
        nav.pinchE[c] = Math.min(vertexBuilding(nav, cx + 1, cy), vertexBuilding(nav, cx + 1, cy + 1));
      }
      // South edge: y = cy + 1, from vertex (cx, cy + 1) to (cx + 1, cy + 1).
      if (cy + 1 < rows && buildingAt[c + cols] === 0 && vf[(cy + 1) * vcols + cx] === 0 && vf[(cy + 1) * vcols + cx + 1] === 0) {
        nav.pinchS[c] = Math.min(vertexBuilding(nav, cx, cy + 1), vertexBuilding(nav, cx + 1, cy + 1));
      }
    }
  }
  // A pinch made by the map edge alone (no building at either end) stays open: nothing to break.
  for (let c = 0; c < nav.cells; c++) {
    if (nav.pinchE[c] === NO_BUILDING) nav.pinchE[c] = 0;
    if (nav.pinchS[c] === NO_BUILDING) nav.pinchS[c] = 0;
  }
  nav.buildingCost = buildingCost;
  nav.version = world.buildings.version;
}

/** "No building here" for the min() in `vertexBuilding`. */
const NO_BUILDING = 0x7fffffff;

/** The smallest building id among the (up to four) cells around vertex (vx, vy); NO_BUILDING if none. */
function vertexBuilding(nav: NavGrid, vx: number, vy: number): number {
  let best = NO_BUILDING;
  for (let dy = -1; dy <= 0; dy++) {
    for (let dx = -1; dx <= 0; dx++) {
      const cx = vx + dx;
      const cy = vy + dy;
      if (cx < 0 || cy < 0 || cx >= nav.cols || cy >= nav.rows) continue;
      const id = nav.buildingAt[cy * nav.cols + cx] as number;
      if (id !== 0 && id < best) best = id;
    }
  }
  return best;
}

/** The pinch building id on the edge between orthogonal neighbours a and b (0: open or not a pinch). */
export function flowEdgePinch(nav: NavGrid, a: number, b: number): number {
  if (b === a + 1) return nav.pinchE[a] as number;
  if (b === a - 1) return nav.pinchE[b] as number;
  if (b === a + nav.cols) return nav.pinchS[a] as number;
  if (b === a - nav.cols) return nav.pinchS[b] as number;
  return 0;
}

/**
 * The building a zombie must break to step from cell `from` to its neighbour `to`: the building on
 * `to`, or the one at a pinch between them; 0 when the step is open.
 */
export function flowStepBuilding(nav: NavGrid, from: number, to: number): number {
  const id = nav.buildingAt[to] as number;
  return id !== 0 ? id : flowEdgePinch(nav, from, to);
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
  const { cols, rows, buildingAt, enterCost, vertexFree } = nav;
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
      // No corner cutting: the vertex between c and n must be free (its four cells free, clearance ≥ 0.5 m).
      if (vertexFree[(cy + (dy > 0 ? 1 : 0)) * (cols + 1) + cx + (dx > 0 ? 1 : 0)] === 0) continue;
      step = STEP_DIAG;
    } else if (buildingAt[n] === 0 && buildingAt[c] === 0 && flowEdgePinch(nav, c, n) !== 0) {
      step += nav.buildingCost; // a gap narrower than a body: as costly as breaking a building
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
    const tp = f.frontPenalty;
    f.frontPenalty = f.penalty;
    f.penalty = tp;
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

// ---- Story 3.8: the flank field --------------------------------------------------------------

/** `fillFlankPenalty` pass in progress (module-level callback: no closure per rebuild). */
const cone = { field: null as FlowField | null, nav: null as NavGrid | null, cos2: 0, r2: 0, rCells: 0, units: 0, back: 0 };
const markCone = (p: PlayerState): void => {
  if (p.status !== "alive") return; // downed / out players don't aim
  const f = cone.field as FlowField;
  const { cols, rows, cellM } = cone.nav as NavGrid;
  const pen = f.penalty;
  const pcx = Math.floor(p.x / cellM);
  const pcy = Math.floor(p.y / cellM);
  const x0 = Math.max(0, pcx - cone.rCells);
  const x1 = Math.min(cols - 1, pcx + cone.rCells);
  const y0 = Math.max(0, pcy - cone.rCells);
  const y1 = Math.min(rows - 1, pcy + cone.rCells);
  const fx = p.facingX;
  const fy = p.facingY;
  const ax = p.x - fx * cone.back; // the apex, a little behind the player
  const ay = p.y - fy * cone.back;
  const units = cone.units;
  for (let cy = y0; cy <= y1; cy++) {
    const ccy = (cy + 0.5) * cellM;
    for (let cx = x0; cx <= x1; cx++) {
      if (cx === pcx && cy === pcy) continue; // the player's own cell (the field's source)
      const ccx = (cx + 0.5) * cellM;
      const px = ccx - p.x;
      const py = ccy - p.y;
      if (px * px + py * py > cone.r2) continue; // beyond the radius (measured from the player)
      if (!inCone(ccx - ax, ccy - ay, fx, fy, cone.cos2)) continue;
      const c = cy * cols + cx;
      if ((pen[c] as number) < units) pen[c] = units; // union of the cones: max, not sum
    }
  }
};

/** (dx, dy) from the apex lies within the half-angle whose squared cosine is cos2 of the unit (fx, fy). */
function inCone(dx: number, dy: number, fx: number, fy: number, cos2: number): boolean {
  const dot = dx * fx + dy * fy;
  return dot > 0 && dot * dot >= cos2 * (dx * dx + dy * dy);
}

/**
 * Story 3.8: is (x, y) inside player p's front cone (any distance)? The same shape as the penalty
 * (apex `coneApexBackM` behind p), with p's aim of this tick: the steering rule's fresh check.
 */
export function inFlankCone(world: Readonly<World>, p: PlayerState, x: number, y: number): boolean {
  const fl = world.balance.zombies.flank;
  const c = Math.cos((fl.coneHalfAngleDeg * Math.PI) / 180);
  return inCone(x - (p.x - p.facingX * fl.coneApexBackM), y - (p.y - p.facingY * fl.coneApexBackM), p.facingX, p.facingY, c * c);
}

/**
 * The flank field's `fillPenalty`: zero the layer, then mark the front cone of every alive player
 * with that player's aim at this tick (the rebuild's sources are the same tick). Allocation-free.
 */
export function fillFlankPenalty(field: FlowField, world: Readonly<World>): void {
  field.penalty.fill(0);
  const fl = world.balance.zombies.flank;
  const nav = world.pathing.nav;
  const units = Math.min(0xffff, Math.round(fl.penaltyM * FLOW_UNITS_PER_M));
  if (units <= 0) return;
  const c = Math.cos((fl.coneHalfAngleDeg * Math.PI) / 180);
  cone.field = field;
  cone.nav = nav;
  cone.cos2 = c * c;
  cone.r2 = fl.coneRadiusM * fl.coneRadiusM;
  cone.rCells = Math.ceil(fl.coneRadiusM / nav.cellM);
  cone.units = units;
  cone.back = fl.coneApexBackM;
  world.players.forEach(markCone); // Map insertion order: the same on every run
  cone.field = null;
  cone.nav = null;
}

/** Per Balance: which `ZOMBIE_TYPES` indices flank (bit mask). */
const flankMaskCache = new WeakMap<object, number>();
function flankTypeMask(world: Readonly<World>): number {
  const types = world.balance.zombies.types;
  let m = flankMaskCache.get(types);
  if (m === undefined) {
    m = 0;
    for (let i = 0; i < ZOMBIE_TYPES.length; i++) if (types[ZOMBIE_TYPES[i] as string]?.flanks) m |= 1 << i;
    flankMaskCache.set(types, m);
  }
  return m;
}

/** Story 3.8: is a zombie of a flanking type alive? */
function flankerAlive(world: Readonly<World>): boolean {
  const mask = flankTypeMask(world);
  if (mask === 0) return false;
  const pool = world.zombies;
  for (let i = 0; i < pool.aliveCount; i++) {
    if ((mask >> (pool.type[pool.aliveIds[i] as number] as number)) & 1) return true;
  }
  return false;
}

/**
 * The `buildings` system slot's pathing part: keeps the grid current and advances the fields. With
 * no flanker alive the chase field gets the whole budget every tick (Story 3.5); with one, even
 * ticks advance the chase field and odd ticks the flank field (same cost per tick, each field ≤ 4P
 * ticks old). The flank rebuild restarts with fresh aims when flankers come back.
 */
export function updatePathing(world: World): void {
  const pathing = world.pathing;
  const { nav, chase, flank } = pathing;
  if (nav.version !== world.buildings.version) rasterizeBuildings(nav, world);
  const budget = world.balance.zombies.pathing.rebuildCellsPerTick;
  if (!flankerAlive(world)) {
    pathing.flankActive = false;
    advanceFlowField(chase, nav, world, budget);
    return;
  }
  if (!pathing.flankActive) {
    pathing.flankActive = true;
    flank.building = false; // drop a rebuild seeded before the pause: the next one starts now
  }
  if ((world.tick & 1) === 0) advanceFlowField(chase, nav, world, budget);
  else advanceFlowField(flank, nav, world, budget);
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
  const { cols, rows, buildingAt, enterCost, vertexFree } = nav;
  const pen = f.frontPenalty;
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
      if (vertexFree[(cy + (dy > 0 ? 1 : 0)) * (cols + 1) + cx + (dx > 0 ? 1 : 0)] === 0) continue;
      step = STEP_DIAG;
    } else if (buildingAt[n] === 0 && buildingAt[cell] === 0 && flowEdgePinch(nav, cell, n) !== 0) {
      step += nav.buildingCost;
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

/** FNV-1a over small unsigned typed arrays. */
function hashBytes(a: Uint8Array | Uint16Array): number {
  let h = 0x811c9dc5;
  for (let i = 0; i < a.length; i++) {
    h ^= a[i] as number;
    h = Math.imul(h, 0x01000193);
  }
  return h >>> 0;
}

/** Plain-data digest of the pathing state for `snapshotWorld` (determinism tests, Story 8.4). */
function snapshotField(f: FlowField) {
  return {
    building: f.building,
    buildSourceTick: f.buildSourceTick,
    sourceTick: f.sourceTick,
    rebuilds: f.rebuilds,
    heapSize: f.heapSize,
    frontHash: hashInts(f.front),
    backHash: hashInts(f.back),
  };
}

/** FNV-1a over a Uint16Array (the penalty layer). */
function hashU16(a: Uint16Array): number {
  let h = 0x811c9dc5;
  for (let i = 0; i < a.length; i++) {
    h ^= a[i] as number;
    h = Math.imul(h, 0x01000193);
  }
  return h >>> 0;
}

/** Plain-data digest of the pathing state for `snapshotWorld` (determinism tests, Story 8.4). */
export function snapshotPathing(p: PathingState) {
  const pr = p.progress;
  return {
    navVersion: p.nav.version,
    navHash: hashInts(p.nav.buildingAt) ^ hashInts(p.nav.enterCost) ^ hashInts(p.nav.pinchE) ^ hashInts(p.nav.pinchS),
    progressHash: hashInts(new Int32Array(pr.anchorX.buffer)) ^ hashInts(new Int32Array(pr.anchorY.buffer)) ^ hashBytes(pr.ticks) ^ hashBytes(pr.stuck) ^ hashBytes(pr.gen),
    chase: snapshotField(p.chase),
    // Story 3.8
    flankActive: p.flankActive,
    flank: { ...snapshotField(p.flank), penaltyHash: hashU16(p.flank.penalty), frontPenaltyHash: hashU16(p.flank.frontPenalty) },
  };
}
