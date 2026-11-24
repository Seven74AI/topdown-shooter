import { FLOW_CELL_M } from "../config/constants";
import { bossBodyOn } from "../boss/bossState";
import { ticksFor } from "../core/time";
import type { World } from "../core/world";
import type { Building } from "../buildings/buildings";
import { segmentHitsBox } from "../buildings/collision";
import type { DistrictBounds, MapBox } from "../map/districtMap";
import { fillCollisionCells, mapCollisionCells } from "../map/collisionCells";
import type { PlayerState } from "../player/player";
import { ZOMBIE_TYPES, isRushState } from "./zombieTypes";

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
 * **Walls (Story 4.1).** The map's collision boxes (Story 4.2: `world.obstacles.solids`, i.e. plus
 * the active cover) are written into `wallAt` when the grid is created, and again only when the
 * decay stage changes the active cover (`setNavWalls`, from `applyCoverStage`). Unlike building cells they are never entered (no cost
 * makes them passable: nothing to break), a vertex touching one is not free, an edge narrower than a
 * body whose ends touch only walls and the map edge is closed (`closedE/S`), and a pinch between a
 * wall and a building carries the building's id (zombies break the building). Free cells next to a
 * wall cost `nearWallCostM` extra, like next to a building.
 *
 * Story 3.8: a second FlowField on the same NavGrid, `flank`, whose `fillPenalty` marks the cells in
 * front of every alive player (within ±`flank.coneHalfAngleDeg` of the aim, up to `coneRadiusM`;
 * the union of all cones); `penalty` is added to the entry cost of each cell. Runners (`flanks`
 * types) follow it. The two fields share the budget: while a flanker is alive, even ticks advance
 * the chase field and odd ticks the flank field (each ≤ 4P ticks old); otherwise the chase field
 * gets every tick (≤ 2P) and the flank field pauses (restarted fresh when flankers come back).
 *
 * **Story 5.7 (D1): the wide grid.** The clearance rule above holds for bodies ≤ 0.35 m. A Brute
 * (`wideBody`, 0.6 m) paths on a second NavGrid, `wide`, whose map boxes, buildings and fires are
 * grown by `pathing.wideInflateM` (0.25 m; the rasterizer's "any overlap" makes that one whole cell)
 * and whose outer cell ring is wall. A free cell's centre is then ≥ 0.75 m from every real box, and
 * so is every orthogonal step between two free cells: the wide grid has no pinches (a one-cell lane
 * is a 1.5 m gap, which a 1.2 m Brute fits); diagonals still need their vertex free. A grown
 * building cell keeps its building id (a Brute blocked by a barricade attacks it). Its field,
 * `wideChase`, is the chase field on that grid; it joins the round-robin only while a wide-body
 * zombie is alive (1–2 per wave), so the per-tick budget is unchanged: the active fields (chase,
 * then flank, then wide) take the ticks in turn, `tick % active`. Push-out and collision still use
 * the true radius against the true boxes (`collision.ts` is unchanged).
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
  /** Story 5.7: how much every box is grown on this grid (0: the normal grid; `wideInflateM`: the wide grid). */
  readonly inflateM: number;
  readonly cols: number;
  readonly rows: number;
  readonly cells: number;
  /** Building id per cell (0 = no building). */
  readonly buildingAt: Int32Array;
  /** Story 4.1: 1 = a map collision box covers the cell (static; never entered). */
  readonly wallAt: Uint8Array;
  /** Story 4.1: 1 = the edge east / south of the cell is narrower than a body between walls only (closed). */
  readonly closedE: Uint8Array;
  readonly closedS: Uint8Array;
  /** Cost units added when stepping into the cell. */
  readonly enterCost: Int32Array;
  /**
   * Story 4.8: cost units of the burning fires per cell (`setNavFires`, at a decay change only),
   * added into `enterCost` when rasterized: a cost, never a wall (brief line 4).
   */
  readonly fireCost: Int32Array;
  /** Per vertex ((cols + 1) × (rows + 1)): 1 = a body centred there clears every building and the map edge. */
  readonly vertexFree: Uint8Array;
  /** Building id of a pinch on the edge between cell c and c + 1 (east) / c + cols (south); 0 = open. */
  readonly pinchE: Int32Array;
  readonly pinchS: Int32Array;
  /** Cost units of a building cell or a pinch (from `buildingCostM`, cached when rasterized). */
  buildingCost: number;
  /** `world.buildings.wallVersion` last rasterized (-1: never; Story 5.9: walls only). */
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
  /**
   * Story 6.5 (DD2): a single-source field (the Behemoth's `bossChase`): seeded from this player only
   * (null: every standing player, the zombies' fields). Seeds within `seedRings` free cells round a
   * player standing in a grown wall cell.
   */
  seedOnly: string | null;
  seedRings: number;
  /**
   * Story 6.5 (review H1): the target can't be reached (it hides where the boss's body can't go): this
   * build seeds every boss-grid free cell by its WALKING distance from the target (a BFS over the
   * normal, uninflated nav grid, up to `boss.json › pathing.fallbackSeedM`), so the boss walks to the
   * reachable spot nearest it by the paths a survivor takes. Set and cleared per build by the boss
   * system (never latched for the fight).
   */
  seedFar: boolean;
  /** Review H1: the build in progress / the front were seeded in the fallback. */
  buildingFar: boolean;
  frontFar: boolean;
  /**
   * Story 6.8 (DD3): a lure field — seeded from the free cells within `seedBoxM` of this box (the
   * armed car) instead of from players (null: a player field).
   */
  seedBox: MapBox | null;
  seedBoxM: number;
}

/**
 * Per zombie slot. `anchorX/anchorY/ticks/stuck/gen` held the 3.5 review's "no progress" record,
 * whose trigger was dropped in the re-review (crowds looked stuck and broke walkable walls); they
 * stay zero. The flank fields are 3.8's time limit.
 */
export interface ZombieProgress {
  readonly anchorX: Float32Array;
  readonly anchorY: Float32Array;
  readonly ticks: Uint16Array;
  readonly stuck: Uint8Array;
  /** Pool generation the record belongs to (a reused slot starts over). */
  readonly gen: Uint8Array;
  /**
   * 3.8 review H1: per flanker, ticks spent not closing in (up to `flank.maxFlankS`, then it goes
   * straight in until it bites), its distance to its target last tick, and the generation they belong to.
   */
  readonly flankTicks: Uint16Array;
  readonly flankLastD: Float32Array;
  readonly flankGen: Int16Array;
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
  /** Story 5.7 (D1): the wide grid (boxes grown by `pathing.wideInflateM`) and its chase field (wide-body types). */
  readonly wide: NavGrid;
  readonly wideChase: FlowField;
  /** Story 5.7: a wide-body zombie was alive this tick (its field takes a share of the ticks). */
  wideActive: boolean;
  /** Story 5.7: fields that shared the ticks this tick (1–4; the max-age rule scales with it). */
  activeFields: number;
  /** Story 6.5 (DD2): the boss grid (boxes grown by `boss.json › pathing.inflateM`) and its single-target field. */
  readonly boss: NavGrid;
  readonly bossChase: FlowField;
  /** Story 6.5: the boss's body was on the map this tick (its field took a share of the ticks). */
  bossActive: boolean;
  /** Story 6.5 (review H1): scratch for the fallback's walking-distance BFS (normal-grid cells). */
  readonly farDist: Int32Array;
  readonly farQueue: Int32Array;
  /**
   * Story 6.8 (DD3): the car alarm's lure fields — one on the nav grid, one on the wide grid (wide
   * bodies) — seeded round the armed car, built once while it is armed (they join the round-robin
   * until both are done: `lureBuild` 1 = the nav one, 2 = the wide one, 3 = ready, 0 = idle; the car
   * never moves, so they are never rebuilt mid-alarm).
   */
  readonly lure: FlowField;
  readonly lureWide: FlowField;
  lureBuild: number;
}

export function createNavGrid(map: DistrictBounds & { readonly solids?: readonly MapBox[] }, inflateM = 0): NavGrid {
  const cols = Math.max(1, Math.ceil(map.widthM / FLOW_CELL_M));
  const rows = Math.max(1, Math.ceil(map.heightM / FLOW_CELL_M));
  const cells = cols * rows;
  return {
    cellM: FLOW_CELL_M,
    inflateM,
    cols,
    rows,
    cells,
    buildingAt: new Int32Array(cells),
    wallAt: mapCollisionCells(map, FLOW_CELL_M, inflateM),
    closedE: new Uint8Array(cells),
    closedS: new Uint8Array(cells),
    enterCost: new Int32Array(cells),
    fireCost: new Int32Array(cells),
    vertexFree: new Uint8Array((cols + 1) * (rows + 1)),
    pinchE: new Int32Array(cells),
    pinchS: new Int32Array(cells),
    buildingCost: 0,
    version: -1,
  };
}

/**
 * Story 4.2: rewrites the wall cells from `boxes` (the World's obstacle list after a decay stage
 * change) and forces the next pathing tick to re-rasterize (vertices, pinches, near-wall costs).
 * Allocates nothing. Never per tick.
 */
export function setNavWalls(nav: NavGrid, boxes: readonly MapBox[]): void {
  fillCollisionCells(nav.wallAt, nav.cols, nav.rows, nav.cellM, boxes, nav.inflateM); // Story 5.7: grown on the wide grid
  nav.version = -1;
}

/**
 * Story 4.8: writes the fire cost (`costUnits` per cell) of every free cell whose centre lies within
 * a fire's radius + `growM` (the largest pathing zombie: a body there would touch the fire) and
 * forces the next pathing pass to re-rasterize. Called by `applyDecayStage` only (World creation, a
 * build start, the dev cheat): the fields that use it are rebuilt at the build start. Allocates nothing.
 */
export function setNavFires(nav: NavGrid, fires: readonly { readonly x: number; readonly y: number; readonly radiusM: number }[], costUnits: number, growM: number): void {
  const { cols, rows, cellM, fireCost } = nav;
  fireCost.fill(0);
  for (let i = 0; i < fires.length; i++) {
    const f = fires[i] as { x: number; y: number; radiusM: number };
    const r = f.radiusM + growM;
    const r2 = r * r;
    const x0 = Math.max(0, Math.floor((f.x - r) / cellM));
    const x1 = Math.min(cols - 1, Math.floor((f.x + r) / cellM));
    const y0 = Math.max(0, Math.floor((f.y - r) / cellM));
    const y1 = Math.min(rows - 1, Math.floor((f.y + r) / cellM));
    for (let cy = y0; cy <= y1; cy++) {
      for (let cx = x0; cx <= x1; cx++) {
        const dx = (cx + 0.5) * cellM - f.x;
        const dy = (cy + 0.5) * cellM - f.y;
        if (dx * dx + dy * dy < r2) fireCost[cy * cols + cx] = costUnits; // zones don't stack
      }
    }
  }
  nav.version = -1;
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
    seedOnly: null,
    seedRings: 0,
    seedFar: false,
    buildingFar: false,
    frontFar: false,
    seedBox: null, // Story 6.8
    seedBoxM: 0,
  };
}

function createProgress(capacity: number): ZombieProgress {
  return {
    anchorX: new Float32Array(capacity),
    anchorY: new Float32Array(capacity),
    ticks: new Uint16Array(capacity),
    stuck: new Uint8Array(capacity),
    gen: new Uint8Array(capacity),
    flankTicks: new Uint16Array(capacity),
    flankLastD: new Float32Array(capacity),
    flankGen: new Int16Array(capacity).fill(-1),
  };
}

/** Bounds of the placeholder state of Worlds that never run pathing (3.5 review L5): one cell. */
const NO_PATHING_MAP: DistrictBounds = { widthM: FLOW_CELL_M, heightM: FLOW_CELL_M };

/**
 * `map`'s pathing state for `zombieCapacity` zombie slots. `enabled: false` (the client's mirror and
 * prediction Worlds, which never run the buildings or zombie systems) gives a one-cell placeholder
 * instead of ~150 KB of grids (3.5 review L5).
 */
export function createPathingState(map: DistrictBounds & { readonly solids?: readonly MapBox[] }, zombieCapacity: number, enabled = true, wideInflateM = 0.25, bossInflateM = 1.65): PathingState {
  const nav = createNavGrid(enabled ? map : NO_PATHING_MAP);
  const wide = enabled ? createNavGrid(map, wideInflateM) : createNavGrid(NO_PATHING_MAP); // Story 5.7
  const boss = enabled ? createNavGrid(map, bossInflateM) : createNavGrid(NO_PATHING_MAP); // Story 6.5
  return {
    nav,
    chase: createFlowField(nav),
    flank: createFlowField(nav, fillFlankPenalty),
    flankActive: false,
    progress: createProgress(enabled ? zombieCapacity : 1),
    wide,
    wideChase: createFlowField(wide),
    wideActive: false,
    activeFields: 1,
    boss,
    bossChase: createFlowField(boss),
    bossActive: false,
    farDist: new Int32Array(nav.cells),
    farQueue: new Int32Array(nav.cells),
    lure: createFlowField(nav), // Story 6.8
    lureWide: createFlowField(wide),
    lureBuild: 0,
  };
}

/**
 * Story 6.8 (DD3): starts building the two lure fields round `box` (the armed car). They take a turn
 * in the round-robin (`updatePathing`) until both are done. No allocation.
 */
export function requestLureFields(world: World, box: MapBox): void {
  const p = world.pathing;
  if (p.nav.cells <= 1) return; // a World without pathing (client mirror, prediction)
  const m = world.balance.events.carAlarm.lureSeedM;
  for (const f of [p.lure, p.lureWide] as const) {
    f.seedBox = box;
    f.seedBoxM = m;
    f.building = false;
    f.sourceTick = -1;
  }
  p.lureBuild = 1;
}

/** Story 6.8: the alarm is over: the lure fields go idle (no per-tick cost). */
export function dropLureFields(world: World): void {
  const p = world.pathing;
  p.lureBuild = 0;
  for (const f of [p.lure, p.lureWide] as const) {
    f.seedBox = null;
    f.building = false;
    f.sourceTick = -1;
  }
}

/** Story 6.8: seeds every free cell within `f.seedBoxM` (+ the grid's inflation) of `f.seedBox` at cost 0. */
function seedFromBox(f: FlowField, nav: NavGrid): void {
  const b = f.seedBox as MapBox;
  const reach = f.seedBoxM + nav.inflateM;
  const { cols, rows, cellM, wallAt } = nav;
  const x0 = Math.max(0, Math.floor((b.minX - reach) / cellM));
  const x1 = Math.min(cols - 1, Math.floor((b.maxX + reach) / cellM));
  const y0 = Math.max(0, Math.floor((b.minY - reach) / cellM));
  const y1 = Math.min(rows - 1, Math.floor((b.maxY + reach) / cellM));
  for (let cy = y0; cy <= y1; cy++) {
    for (let cx = x0; cx <= x1; cx++) {
      const c = cy * cols + cx;
      if (wallAt[c] !== 0) continue;
      const px = (cx + 0.5) * cellM;
      const py = (cy + 0.5) * cellM;
      const dx = Math.max(b.minX - px, 0, px - b.maxX);
      const dy = Math.max(b.minY - py, 0, py - b.maxY);
      if (dx * dx + dy * dy > reach * reach) continue;
      f.back[c] = 0;
      push(f, c);
    }
  }
}

/** Story 6.5: ticks between the starts of two boss field rebuilds (`boss.json › pathing.rebuildEveryS`: 10). */
function bossRebuildTicks(world: Readonly<World>): number {
  return ticksFor(world.balance.boss.pathing.rebuildEveryS);
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
 * Flankers never follow a flank field older than this. Story 5.7: with three fields sharing the
 * ticks (flankers and a Brute alive) each refreshes every 3P ticks: 6P.
 */
export function flowSharedMaxAgeTicks(world: Readonly<World>): number {
  return 2 * Math.max(2, world.pathing.activeFields) * flowRefreshTicks(world);
}

/** Writes the wall buildings into the grid (only when `buildings.wallVersion` changed; Story 5.9: floor buildings never). */
export function rasterizeBuildings(nav: NavGrid, world: Readonly<World>): void {
  nav.buildingAt.fill(0);
  nav.enterCost.fill(0);
  const pathing = world.balance.zombies.pathing;
  const buildingCost = Math.max(1, Math.round(pathing.buildingCostM * FLOW_UNITS_PER_M));
  const nearWall = Math.round(pathing.nearWallCostM * FLOW_UNITS_PER_M);
  const { cols, rows, cellM, buildingAt, enterCost, wallAt } = nav;
  const g = nav.inflateM; // Story 5.7 (D1): grown on the wide grid (the id stays on the grown cells)
  const list = world.buildings.list;
  for (let i = 0; i < list.length; i++) {
    const b = list[i] as Building;
    if (!b.solid) continue; // Story 5.9: floor is never in the nav grid (F1)
    const x0 = Math.max(0, Math.floor((b.minX - g) / cellM));
    const x1 = Math.min(cols - 1, Math.ceil((b.maxX + g) / cellM) - 1);
    const y0 = Math.max(0, Math.floor((b.minY - g) / cellM));
    const y1 = Math.min(rows - 1, Math.ceil((b.maxY + g) / cellM) - 1);
    for (let cy = y0; cy <= y1; cy++) {
      for (let cx = x0; cx <= x1; cx++) {
        buildingAt[cy * cols + cx] = b.id;
        enterCost[cy * cols + cx] = buildingCost;
      }
    }
  }
  if (nearWall > 0) {
    // Story 4.1: next to a map wall (static cells; the walls themselves are never entered).
    for (let cy = 0; cy < rows; cy++) {
      for (let cx = 0; cx < cols; cx++) {
        if (wallAt[cy * cols + cx] === 0) continue;
        for (let ny = Math.max(0, cy - 1); ny <= Math.min(rows - 1, cy + 1); ny++) {
          for (let nx = Math.max(0, cx - 1); nx <= Math.min(cols - 1, cx + 1); nx++) {
            const c = ny * cols + nx;
            if (wallAt[c] === 0 && buildingAt[c] === 0 && (enterCost[c] as number) < nearWall) enterCost[c] = nearWall;
          }
        }
      }
    }
    for (let i = 0; i < list.length; i++) {
      const b = list[i] as Building;
      if (!b.solid) continue; // Story 5.9
      const x0 = Math.max(0, Math.floor((b.minX - g) / cellM) - 1);
      const x1 = Math.min(cols - 1, Math.ceil((b.maxX + g) / cellM));
      const y0 = Math.max(0, Math.floor((b.minY - g) / cellM) - 1);
      const y1 = Math.min(rows - 1, Math.ceil((b.maxY + g) / cellM));
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
        else if (wallAt[c] !== 0 || wallAt[c + 1] !== 0 || wallAt[c + cols] !== 0 || wallAt[c + cols + 1] !== 0) free = 0; // Story 4.1
      }
      vf[vy * vcols + vx] = free;
    }
  }
  nav.pinchE.fill(0);
  nav.pinchS.fill(0);
  nav.closedE.fill(0);
  nav.closedS.fill(0);
  // Story 5.7 (D1): on the wide grid every box is grown by a whole cell, so the centre of every free
  // cell is ≥ 0.75 m from every real box and every orthogonal step between two free cells keeps
  // ≥ 0.75 m (> the 0.6 m body): no edge between free cells is narrower than the body (no pinches).
  // A one-cell lane between grown boxes is a 1.5 m gap: a Brute fits (alley 3 past the dumpster).
  for (let cy = 0; cy < rows && nav.inflateM === 0; cy++) {
    for (let cx = 0; cx < cols; cx++) {
      const c = cy * cols + cx;
      if (buildingAt[c] !== 0 || wallAt[c] !== 0) continue;
      // East edge: x = cx + 1, from vertex (cx + 1, cy) to (cx + 1, cy + 1).
      if (cx + 1 < cols && buildingAt[c + 1] === 0 && wallAt[c + 1] === 0 && vf[cy * vcols + cx + 1] === 0 && vf[(cy + 1) * vcols + cx + 1] === 0) {
        nav.pinchE[c] = Math.min(vertexBuilding(nav, cx + 1, cy), vertexBuilding(nav, cx + 1, cy + 1));
        // Story 4.1: no building at either end but a wall → too narrow, and nothing to break: closed.
        if (nav.pinchE[c] === NO_BUILDING && (vertexWall(nav, cx + 1, cy) || vertexWall(nav, cx + 1, cy + 1))) nav.closedE[c] = 1;
      }
      // South edge: y = cy + 1, from vertex (cx, cy + 1) to (cx + 1, cy + 1).
      if (cy + 1 < rows && buildingAt[c + cols] === 0 && wallAt[c + cols] === 0 && vf[(cy + 1) * vcols + cx] === 0 && vf[(cy + 1) * vcols + cx + 1] === 0) {
        nav.pinchS[c] = Math.min(vertexBuilding(nav, cx, cy + 1), vertexBuilding(nav, cx + 1, cy + 1));
        if (nav.pinchS[c] === NO_BUILDING && (vertexWall(nav, cx, cy + 1) || vertexWall(nav, cx + 1, cy + 1))) nav.closedS[c] = 1;
      }
    }
  }
  // A pinch made by the map edge alone (no building or wall at either end) stays open: nothing to break.
  for (let c = 0; c < nav.cells; c++) {
    if (nav.pinchE[c] === NO_BUILDING) nav.pinchE[c] = 0;
    if (nav.pinchS[c] === NO_BUILDING) nav.pinchS[c] = 0;
  }
  // Story 4.8: the fire cost on top (never on walls: they are never entered).
  const fireCost = nav.fireCost;
  for (let c = 0; c < nav.cells; c++) if (fireCost[c] !== 0 && wallAt[c] === 0) enterCost[c] = (enterCost[c] as number) + (fireCost[c] as number);
  nav.buildingCost = buildingCost;
  nav.version = world.buildings.wallVersion; // Story 5.9: walls only
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

/** Story 4.1: a map wall covers one of the (up to four) cells around vertex (vx, vy). */
function vertexWall(nav: NavGrid, vx: number, vy: number): boolean {
  for (let dy = -1; dy <= 0; dy++) {
    for (let dx = -1; dx <= 0; dx++) {
      const cx = vx + dx;
      const cy = vy + dy;
      if (cx < 0 || cy < 0 || cx >= nav.cols || cy >= nav.rows) continue;
      if (nav.wallAt[cy * nav.cols + cx] !== 0) return true;
    }
  }
  return false;
}

/** Story 4.1: the edge between orthogonal neighbours a and b is closed (too narrow between walls). */
export function flowEdgeClosed(nav: NavGrid, a: number, b: number): boolean {
  if (b === a + 1) return nav.closedE[a] === 1;
  if (b === a - 1) return nav.closedE[b] === 1;
  if (b === a + nav.cols) return nav.closedS[a] === 1;
  if (b === a - nav.cols) return nav.closedS[b] === 1;
  return false;
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
const seed: { field: FlowField | null; nav: NavGrid | null; world: Readonly<World> | null } = { field: null, nav: null, world: null };
const seedPlayer = (p: Readonly<{ status: string; x: number; y: number }>): void => {
  if (p.status !== "alive") return;
  const f = seed.field as FlowField;
  const nav = seed.nav as NavGrid;
  const c = flowCellAt(nav, p.x, p.y);
  if (f.seedFar) {
    seedByWalkingDistance(f, nav, p.x, p.y, seed.world as Readonly<World>); // Story 6.5 (review H1)
    return;
  }
  if (nav.inflateM > 0 && nav.wallAt[c] !== 0) {
    seedAround(f, nav, c, p.x, p.y, seed.world as Readonly<World>);
    return;
  }
  if (f.back[c] === 0) return; // two players in one cell
  f.back[c] = 0;
  push(f, c);
};

/**
 * Story 5.7: on the wide grid a player pressed against a box (or in a corner) stands in a grown
 * wall cell, which is never entered: the field starts from the nearest free cells instead (the
 * first ring of cells round it that has one, and the ring after it; cost two units per ring), so a
 * Brute still comes as close as its body allows and breaks the barricades round such a player. A
 * player in a slot narrower than a Brute (the 1 m between the bus and a car) is seeded from the
 * slot's mouths (up to `pathing.wideSeedRings` cells away): the Brute waits there, and its swing
 * reaches `gapReachM` into the slot (review M1, `wideGapRing`).
 */

/**
 * Story 5.7 review M1: how far (in rings of cells) the nearest free wide-grid cell is from a player
 * at (x, y): 0 when the player's own cell is free, 1 for a player pressed against a box (a Brute can
 * reach its body), ≥ 2 for a player in a slot narrower than a Brute (the field is seeded from the
 * slot's mouths: the long "gap" reach applies), -1 when none is within `wideSeedRings`. Never across
 * a map solid (the seeding rule). No allocation.
 */
export function wideGapRing(world: Readonly<World>, x: number, y: number): number {
  const nav = world.pathing.wide;
  if (nav.cells <= 1) return 0;
  const { cols, rows, wallAt, cellM } = nav;
  const c = flowCellAt(nav, x, y);
  if (wallAt[c] === 0) return 0;
  const cx = c % cols;
  const cy = (c - cx) / cols;
  const rings = world.balance.zombies.pathing.wideSeedRings;
  for (let ring = 1; ring <= rings; ring++) {
    for (let ny = Math.max(0, cy - ring); ny <= Math.min(rows - 1, cy + ring); ny++) {
      for (let nx = Math.max(0, cx - ring); nx <= Math.min(cols - 1, cx + ring); nx++) {
        if (Math.max(Math.abs(nx - cx), Math.abs(ny - cy)) !== ring) continue;
        if (wallAt[ny * cols + nx] !== 0) continue;
        if (lineCrossesSolid(world, x, y, (nx + 0.5) * cellM, (ny + 0.5) * cellM)) continue;
        return ring;
      }
    }
  }
  return -1;
}

/** The segment crosses the interior of a map solid (active cover included). */
function lineCrossesSolid(world: Readonly<World>, x0: number, y0: number, x1: number, y1: number): boolean {
  const solids = world.obstacles.solids;
  for (let i = 0; i < solids.length; i++) {
    const b = solids[i] as MapBox;
    if (segmentHitsBox(x0, y0, x1 - x0, y1 - y0, b.minX, b.minY, b.maxX, b.maxY)) return true;
  }
  return false;
}
function seedAround(f: FlowField, nav: NavGrid, c: number, px: number, py: number, world: Readonly<World>): void {
  const { cols, rows, wallAt } = nav;
  const cx = c % cols;
  const cy = (c - cx) / cols;
  let found = 0;
  const rings = f.seedRings > 0 ? f.seedRings : world.balance.zombies.pathing.wideSeedRings; // Story 6.5: the boss field's own
  for (let ring = 1; ring <= rings && (found === 0 || ring <= found + 1); ring++) {
    for (let ny = Math.max(0, cy - ring); ny <= Math.min(rows - 1, cy + ring); ny++) {
      for (let nx = Math.max(0, cx - ring); nx <= Math.min(cols - 1, cx + ring); nx++) {
        if (Math.max(Math.abs(nx - cx), Math.abs(ny - cy)) !== ring) continue;
        const n = ny * cols + nx;
        if (wallAt[n] !== 0) continue;
        // Never across a map box (the other side of the parking wall is not "near" the player).
        if (lineCrossesSolid(world, px, py, (nx + 0.5) * nav.cellM, (ny + 0.5) * nav.cellM)) continue;
        if (found === 0) found = ring;
        const cost = STEP_ORTHO * ring;
        if ((f.back[n] as number) <= cost) continue;
        const queued = f.heapPos[n] !== NOT_QUEUED;
        f.back[n] = cost;
        if (queued) siftUp(f, f.heapPos[n] as number);
        else push(f, n);
      }
    }
  }
}

/**
 * Story 6.5 (review H1): the boss's fallback seeding. A BFS from the target over the normal nav grid
 * (map walls only: buildings don't stop it, the boss pushes through them) gives each cell its walking
 * distance; every cell free on the boss grid within `pathing.fallbackSeedM` is seeded with that cost.
 * The field then leads the boss to the reachable cell with the least (walking distance + its path).
 * Allocation-free (the scratch lives on `world.pathing`).
 */
function seedByWalkingDistance(f: FlowField, bossNav: NavGrid, px: number, py: number, world: Readonly<World>): void {
  const nav = world.pathing.nav;
  if (nav.cells !== bossNav.cells || nav.cells <= 1) return;
  const cap = Math.round(world.balance.boss.pathing.fallbackSeedM / nav.cellM);
  // Review L-c: nothing free for its body within the cap (a target walled in deep): seed uncapped.
  if (walkingSeedPass(f, bossNav, nav, px, py, world, cap) === 0) walkingSeedPass(f, bossNav, nav, px, py, world, nav.cells);
}

/** One BFS pass of `seedByWalkingDistance` up to `cap` cells of walking; returns the cells seeded. */
function walkingSeedPass(f: FlowField, bossNav: NavGrid, nav: NavGrid, px: number, py: number, world: Readonly<World>, cap: number): number {
  const { cols, rows, wallAt } = nav;
  const dist = world.pathing.farDist;
  const q = world.pathing.farQueue;
  dist.fill(-1);
  const start = flowCellAt(nav, px, py);
  let head = 0;
  let tail = 0;
  let seeded = 0;
  q[tail++] = start;
  dist[start] = 0;
  while (head < tail) {
    const c = q[head++] as number;
    const d = dist[c] as number;
    if (bossNav.wallAt[c] === 0 && (f.back[c] as number) > STEP_ORTHO * d) {
      const queued = f.heapPos[c] !== NOT_QUEUED;
      f.back[c] = STEP_ORTHO * d;
      if (queued) siftUp(f, f.heapPos[c] as number);
      else push(f, c);
      seeded++;
    }
    if (d >= cap) continue;
    const cx = c % cols;
    const cy = (c - cx) / cols;
    for (let k = 0; k < 4; k++) {
      const nx = cx + (NDX[k] as number);
      const ny = cy + (NDY[k] as number);
      if (nx < 0 || ny < 0 || nx >= cols || ny >= rows) continue;
      const n = ny * cols + nx;
      if (dist[n] !== -1 || wallAt[n] !== 0 || flowEdgeClosed(nav, c, n)) continue;
      dist[n] = d + 1;
      q[tail++] = n;
    }
  }
  return seeded;
}

function startRebuild(f: FlowField, nav: NavGrid, world: Readonly<World>): void {
  f.back.fill(FLOW_UNREACHED);
  f.heapPos.fill(NOT_QUEUED);
  f.heapSize = 0;
  if (f.fillPenalty) f.fillPenalty(f, world);
  seed.field = f;
  seed.nav = nav;
  seed.world = world;
  if (f.seedBox !== null) seedFromBox(f, nav); // Story 6.8: a lure field
  else if (f.seedOnly !== null) {
    const p = world.players.get(f.seedOnly); // Story 6.5: the boss's target only
    if (p) seedPlayer(p);
  } else {
    world.players.forEach(seedPlayer); // Map insertion order: the same on every run
    // Story 6.10 (S3): a living survivor seeds the field like a player (last: no change without one).
    if (world.special.survivor.status === "alive") seedPlayer(world.special.survivor);
  }
  seed.field = null;
  seed.nav = null;
  seed.world = null;
  f.buildSourceTick = world.tick;
  f.buildingFar = f.seedFar;
  f.building = true;
}

/** Settles one cell and relaxes its neighbours. */
function settleOne(f: FlowField, nav: NavGrid): void {
  const c = pop(f);
  const { cols, rows, buildingAt, enterCost, vertexFree, wallAt } = nav;
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
    if (f.heapPos[n] === SETTLED || wallAt[n] !== 0) continue; // Story 4.1: walls are never entered
    let step = STEP_ORTHO;
    if (dx !== 0 && dy !== 0) {
      // No corner cutting: the vertex between c and n must be free (its four cells free, clearance ≥ 0.5 m).
      if (vertexFree[(cy + (dy > 0 ? 1 : 0)) * (cols + 1) + cx + (dx > 0 ? 1 : 0)] === 0) continue;
      step = STEP_DIAG;
    } else if (flowEdgeClosed(nav, c, n)) {
      continue; // Story 4.1: narrower than a body between walls
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
    f.frontFar = f.buildingFar;
    f.building = false;
    f.rebuilds++;
  }
}

/** The whole field at once (Story 8.4 after a restore; benchmarks). */
export function rebuildFlowFieldNow(f: FlowField, nav: NavGrid, world: Readonly<World>): void {
  if (nav.version !== world.buildings.wallVersion) rasterizeBuildings(nav, world);
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

/** Story 5.7: per Balance, which `ZOMBIE_TYPES` indices have a wide body (bit mask). */
const wideMaskCache = new WeakMap<object, number>();
function wideTypeMask(world: Readonly<World>): number {
  const types = world.balance.zombies.types;
  let m = wideMaskCache.get(types);
  if (m === undefined) {
    m = 0;
    for (let i = 0; i < ZOMBIE_TYPES.length; i++) if (types[ZOMBIE_TYPES[i] as string]?.wideBody) m |= 1 << i;
    wideMaskCache.set(types, m);
  }
  return m;
}

/** Story 5.7: is a zombie with a wide body alive (rushing or not: a rushing Brute still follows its field when blocked)? */
export function wideBodyAlive(world: Readonly<World>): boolean {
  const mask = wideTypeMask(world);
  if (mask === 0) return false;
  const pool = world.zombies;
  for (let i = 0; i < pool.aliveCount; i++) if ((mask >> (pool.type[pool.aliveIds[i] as number] as number)) & 1) return true;
  return false;
}

/** Story 5.7: the zombie type index has a wide body (the AI's grid/field choice). */
export function isWideType(world: Readonly<World>, typeIndex: number): boolean {
  return ((wideTypeMask(world) >> typeIndex) & 1) === 1;
}

/** Story 3.8: is a zombie of a flanking type alive? */
function flankerAlive(world: Readonly<World>): boolean {
  const mask = flankTypeMask(world);
  if (mask === 0) return false;
  const pool = world.zombies;
  for (let i = 0; i < pool.aliveCount; i++) {
    const id = pool.aliveIds[i] as number;
    // 3.8 review L4: a rushing flanker (FR30) goes straight in: it needs no flank field.
    if ((mask >> (pool.type[id] as number)) & 1 && !isRushState(pool.state[id] as number)) return true;
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
  const { nav, chase, flank, wide, wideChase } = pathing;
  if (nav.version !== world.buildings.wallVersion) rasterizeBuildings(nav, world);
  const budget = world.balance.zombies.pathing.rebuildCellsPerTick;
  const flankOn = flankerAlive(world);
  const wideOn = wideBodyAlive(world); // Story 5.7
  if (wideOn && wide.version !== world.buildings.wallVersion) rasterizeBuildings(wide, world);
  // Story 6.5 (DD2): the boss field joins the round-robin only while its body is on the map.
  const bossOn = bossBodyOn(world.boss) && world.boss.targetId !== null;
  const bossNav = pathing.boss;
  if (bossOn && bossNav.version !== world.buildings.wallVersion) rasterizeBuildings(bossNav, world);
  if (bossOn && !pathing.bossActive) pathing.bossChase.building = false;
  pathing.bossActive = bossOn;
  if (flankOn && !pathing.flankActive) flank.building = false; // drop a rebuild seeded before the pause: the next one starts now
  if (wideOn && !pathing.wideActive) wideChase.building = false; // Story 5.7: the same for the wide field
  pathing.flankActive = flankOn;
  pathing.wideActive = wideOn;
  // The active fields take the ticks in turn (chase, flank, wide): one field's budget per tick.
  // Chase + flank alone: even ticks chase, odd ticks flank (Story 3.8, unchanged).
  // Story 6.8 (DD3): the car alarm's lure fields take a turn (before the boss's) until both are built.
  const lureOn = pathing.lureBuild === 1 || pathing.lureBuild === 2;
  const count = 1 + (flankOn ? 1 : 0) + (wideOn ? 1 : 0) + (lureOn ? 1 : 0) + (bossOn ? 1 : 0);
  pathing.activeFields = count;
  // The turn order: chase, flank, wide, lure, boss (each only while on; unchanged without the lure).
  let slot = count === 1 ? 0 : world.tick % count;
  if (slot === 0) {
    advanceFlowField(chase, nav, world, budget);
    return;
  }
  slot--;
  if (flankOn && slot-- === 0) {
    advanceFlowField(flank, nav, world, budget);
    return;
  }
  if (wideOn && slot-- === 0) {
    advanceFlowField(wideChase, wide, world, budget);
    return;
  }
  if (lureOn && slot === 0) {
    advanceLure(world, budget);
    return;
  }
  if (bossOn) {
    // Story 6.5 (DD2): last in the turn; a finished field starts again from scratch once `rebuildEveryS` has passed.
    const f = pathing.bossChase;
    if (f.building || world.tick - f.buildSourceTick >= bossRebuildTicks(world)) advanceFlowField(f, bossNav, world, budget);
  }
}

/** Story 6.8: one turn of the lure build — the nav field first, then the wide one (each from scratch once). */
function advanceLure(world: World, budget: number): void {
  const p = world.pathing;
  const wideStep = p.lureBuild === 2;
  const f = wideStep ? p.lureWide : p.lure;
  const nav = wideStep ? p.wide : p.nav;
  if (nav.version !== world.buildings.wallVersion) rasterizeBuildings(nav, world);
  advanceFlowField(f, nav, world, budget);
  if (!f.building) p.lureBuild = wideStep ? 3 : 2;
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
    } else if (flowEdgeClosed(nav, cell, n)) {
      continue; // Story 4.1
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

/**
 * Story 5.7: a wide body may stand in a grown wall cell of the wide grid (next to a box corner, or
 * pushed against a face): such a cell has no field. The reached cell within `rings` cells with the
 * lowest field cost (ties: scan order), or -1. Allocation-free.
 */
export function flowNearestReachedCell(f: FlowField, nav: NavGrid, cell: number, rings: number): number {
  const front = f.front;
  if ((front[cell] as number) < FLOW_UNREACHED) return cell;
  const { cols, rows } = nav;
  const cx = cell % cols;
  const cy = (cell - cx) / cols;
  for (let r = 1; r <= rings; r++) {
    let best = -1;
    let bestCost = FLOW_UNREACHED;
    for (let ny = Math.max(0, cy - r); ny <= Math.min(rows - 1, cy + r); ny++) {
      for (let nx = Math.max(0, cx - r); nx <= Math.min(cols - 1, cx + r); nx++) {
        const n = ny * cols + nx;
        const v = front[n] as number;
        if (v < bestCost) {
          bestCost = v;
          best = n;
        }
      }
    }
    if (best >= 0) return best;
  }
  return -1;
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
    navHash: hashInts(p.nav.buildingAt) ^ hashInts(p.nav.enterCost) ^ hashInts(p.nav.pinchE) ^ hashInts(p.nav.pinchS) ^ hashBytes(p.nav.closedE) ^ hashBytes(p.nav.closedS),
    progressHash: hashInts(new Int32Array(pr.anchorX.buffer)) ^ hashInts(new Int32Array(pr.anchorY.buffer)) ^ hashBytes(pr.ticks) ^ hashBytes(pr.stuck) ^ hashBytes(pr.gen),
    // 3.8 review H1: the flank timers
    flankHash: hashInts(new Int32Array(pr.flankLastD.buffer)) ^ hashInts(Int32Array.from(pr.flankTicks)) ^ hashInts(Int32Array.from(pr.flankGen)),
    chase: snapshotField(p.chase),
    // Story 3.8
    flankActive: p.flankActive,
    flank: { ...snapshotField(p.flank), penaltyHash: hashU16(p.flank.penalty), frontPenaltyHash: hashU16(p.flank.frontPenalty) },
    // Story 5.7: the wide grid and its field
    wideActive: p.wideActive,
    activeFields: p.activeFields,
    wideNavVersion: p.wide.version,
    wideNavHash: hashInts(p.wide.buildingAt) ^ hashInts(p.wide.enterCost) ^ hashInts(p.wide.pinchE) ^ hashInts(p.wide.pinchS) ^ hashBytes(p.wide.closedE) ^ hashBytes(p.wide.closedS) ^ hashBytes(p.wide.wallAt),
    wideChase: snapshotField(p.wideChase),
    // Story 6.5: the boss grid and its field
    bossActive: p.bossActive,
    bossNavVersion: p.boss.version,
    bossNavHash: hashInts(p.boss.buildingAt) ^ hashInts(p.boss.enterCost) ^ hashBytes(p.boss.wallAt),
    bossChase: { ...snapshotField(p.bossChase), seedOnly: p.bossChase.seedOnly, seedFar: p.bossChase.seedFar, buildingFar: p.bossChase.buildingFar, frontFar: p.bossChase.frontFar },
    // Story 6.8: the lure fields
    lureBuild: p.lureBuild,
    lure: { ...snapshotField(p.lure), seedBox: p.lure.seedBox?.name ?? null },
    lureWide: snapshotField(p.lureWide),
  };
}
