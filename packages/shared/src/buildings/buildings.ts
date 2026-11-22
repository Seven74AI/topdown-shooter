import type { Balance } from "../config/balance";
import type { BuildingTypeStats } from "../config/balanceSchema";
import type { World } from "../core/world";
import { err, ok, type Result } from "../core/result";
import { spendMoney } from "../economy/economy";
import { maxZombieRadius } from "../zombies/zombieTypes";
import { circleOverlapsBox } from "./collision";
import { BUILD_GRID_M } from "../config/constants";

/**
 * Story 3.4: buildings (GDD › Buildings and Defenses; FR50, FR51, FR53).
 *
 * A building is an axis-aligned box anchored by its **min corner** on the 0.5 m build lattice
 * (`BUILD_GRID_M`; review H2): (gx, gy) are lattice indices, so the corner is (gx × 0.5, gy × 0.5) m.
 * Rotations 0 and 2 cover [x, x + W] × [y, y + D], rotations 1 and 3 cover [x, x + D] × [y, y + W]
 * (W = `widthM`, D = `depthM`, multiples of 0.5). Every edge lies on the lattice, so perpendicular
 * barricades join into L and T corners, any building can touch every map edge, and Story 3.5's 0.5 m
 * flow-field cells are covered whole (no half cells). The list is kept sorted by id (ids count up per World and are never reused), so the
 * server, solo and the client's prediction World iterate them in the same order (collision results
 * depend on it). `version` counts every add and remove: Story 3.5 rebuilds its flow field when it
 * changes.
 *
 * Placement is validated here (shared, so the client's preview uses the same rules) and applied
 * between ticks by the server's message handler or solo's host, like `setBuildReady`.
 */
export type BuildingRotation = 0 | 1 | 2 | 3;

export interface Building {
  readonly id: number;
  /** Key of `balance.buildings.types`. */
  readonly type: string;
  /** Player id of the builder ("p0"–"p3" online, "local" solo); Story 3.6 credits kills to it. */
  readonly ownerId: string;
  /** Min corner as 0.5 m lattice indices (x = gx × BUILD_GRID_M m). */
  readonly gx: number;
  readonly gy: number;
  readonly rot: BuildingRotation;
  /** Story 3.5 damages it; Story 3.7 repairs it to `maxHp`. */
  hp: number;
  readonly maxHp: number;
  /** The footprint in metres (cached at creation; buildings never move). */
  readonly minX: number;
  readonly minY: number;
  readonly maxX: number;
  readonly maxY: number;
}

export interface BuildingState {
  /** Every standing building, sorted by id. At most `maxPerPlayer × MAX_PLAYERS`. */
  readonly list: Building[];
  /** Next id to hand out (ids start at 1). */
  nextId: number;
  /** +1 on every add and remove (Story 3.5's flow-field dirty counter). */
  version: number;
}

export function createBuildingState(): BuildingState {
  return { list: [], nextId: 1, version: 0 };
}

/** Why a placement is refused. The client maps it to text (`placeRefusalText`). */
export type PlaceError = "unknown_player" | "not_build_phase" | "unknown_type" | "limit" | "money" | "blocked";

/** A footprint box in metres. */
export interface Box {
  minX: number;
  minY: number;
  maxX: number;
  maxY: number;
}

/** What a placement asks for (a message's fields, already shape-checked). */
export interface PlaceRequest {
  readonly type: string;
  readonly gx: number;
  readonly gy: number;
  readonly rot: number;
}

/** Building type ids in balance order (Story 3.3's shop lists them; the net event sends the index). */
const typeIdCache = new WeakMap<Balance, readonly string[]>();
export function buildingTypeIds(balance: Balance): readonly string[] {
  let ids = typeIdCache.get(balance);
  if (!ids) {
    ids = Object.freeze(Object.keys(balance.buildings.types));
    typeIdCache.set(balance, ids);
  }
  return ids;
}

export function buildingStats(balance: Balance, type: string): Readonly<BuildingTypeStats> | undefined {
  return Object.prototype.hasOwnProperty.call(balance.buildings.types, type) ? balance.buildings.types[type] : undefined;
}

const isRotation = (rot: number): rot is BuildingRotation => rot === 0 || rot === 1 || rot === 2 || rot === 3;

/** Footprint size along x at `rot` (metres). */
export function footprintW(stats: Readonly<BuildingTypeStats>, rot: number): number {
  return rot === 1 || rot === 3 ? stats.depthM : stats.widthM;
}

/** Footprint size along y at `rot` (metres). */
export function footprintH(stats: Readonly<BuildingTypeStats>, rot: number): number {
  return rot === 1 || rot === 3 ? stats.widthM : stats.depthM;
}

/** The footprint of `stats` with its min corner on lattice point (gx, gy) at `rot`, written into `out` (metres). */
export function footprint(stats: Readonly<BuildingTypeStats>, gx: number, gy: number, rot: number, out: Box): Box {
  out.minX = gx * BUILD_GRID_M;
  out.minY = gy * BUILD_GRID_M;
  out.maxX = out.minX + footprintW(stats, rot);
  out.maxY = out.minY + footprintH(stats, rot);
  return out;
}

/**
 * The lattice corner that centres `stats` at `rot` on the point (x, y) metres, rounded to the
 * nearest lattice point (the placement preview under a finger; rotating keeps the same point, so
 * the box turns around it). Writes `out.gx/gy` (not clamped).
 */
export function cornerForCentre(stats: Readonly<BuildingTypeStats>, rot: number, x: number, y: number, out: { gx: number; gy: number }): void {
  out.gx = Math.round((x - footprintW(stats, rot) / 2) / BUILD_GRID_M);
  out.gy = Math.round((y - footprintH(stats, rot) / 2) / BUILD_GRID_M);
}

/** Buildings owned by `ownerId`. */
export function ownedCount(world: Readonly<World>, ownerId: string): number {
  const list = world.buildings.list;
  let n = 0;
  for (let i = 0; i < list.length; i++) if ((list[i] as Building).ownerId === ownerId) n++;
  return n;
}

export function buildingById(world: Readonly<World>, id: number): Building | undefined {
  const list = world.buildings.list;
  for (let i = 0; i < list.length; i++) if ((list[i] as Building).id === id) return list[i];
  return undefined;
}

/** Scratch box for the checks (no allocation per call). */
const scratch: Box = { minX: 0, minY: 0, maxX: 0, maxY: 0 };

/**
 * The box is off the map, within `buildings.spawnClearM` of a spawn point (review L5: spawns can't
 * be boxed in), overlaps another building (touching edges are fine: barricades form walls and
 * corners), a placed player (out players are off the map) or an alive zombie.
 */
export function footprintBlocked(world: Readonly<World>, box: Readonly<Box>): boolean {
  const { widthM, heightM, spawnPoints } = world.map;
  if (box.minX < 0 || box.minY < 0 || box.maxX > widthM || box.maxY > heightM) return true;
  const clear = world.balance.buildings.spawnClearM;
  for (let i = 0; i < spawnPoints.length; i++) {
    const sp = spawnPoints[i] as { x: number; y: number };
    if (circleOverlapsBox(sp.x, sp.y, clear, box.minX, box.minY, box.maxX, box.maxY)) return true;
  }
  const list = world.buildings.list;
  for (let i = 0; i < list.length; i++) {
    const b = list[i] as Building;
    if (box.minX < b.maxX && box.maxX > b.minX && box.minY < b.maxY && box.maxY > b.minY) return true;
  }
  for (const p of world.players.values()) {
    if (p.status === "out") continue;
    if (circleOverlapsBox(p.x, p.y, p.radiusM, box.minX, box.minY, box.maxX, box.maxY)) return true;
  }
  const z = world.zombies;
  if (z.aliveCount > 0) {
    const rz = maxZombieRadius(world.balance);
    for (let i = 0; i < z.aliveCount; i++) {
      const id = z.aliveIds[i] as number;
      if (circleOverlapsBox(z.x[id] as number, z.y[id] as number, rz, box.minX, box.minY, box.maxX, box.maxY)) return true;
    }
  }
  return false;
}

/**
 * The whole placement check, in this order: unknown player → not a build phase → unknown type or a
 * bad grid point/rotation → the owner's cap → money → the spot. null = the server would accept it.
 * The client's preview runs the same check on its mirror World (the server's answer may still differ:
 * others' positions there are interpolated).
 */
export function placementError(world: Readonly<World>, ownerId: string, req: PlaceRequest): PlaceError | null {
  const p = world.players.get(ownerId);
  if (!p) return "unknown_player";
  if (world.run.phase !== "build") return "not_build_phase";
  const stats = buildingStats(world.balance, req.type);
  if (!stats || !isRotation(req.rot)) return "unknown_type";
  if (!Number.isInteger(req.gx) || !Number.isInteger(req.gy)) return "blocked";
  if (ownedCount(world, ownerId) >= world.balance.buildings.maxPerPlayer) return "limit";
  if (p.wallet < stats.price) return "money";
  if (footprintBlocked(world, footprint(stats, req.gx, req.gy, req.rot, scratch))) return "blocked";
  return null;
}

/** What `addBuildingAt` needs (the client mirror passes the schema's values). */
export interface BuildingSpec {
  readonly id: number;
  readonly type: string;
  readonly ownerId: string;
  readonly gx: number;
  readonly gy: number;
  readonly rot: BuildingRotation;
  readonly hp: number;
}

/**
 * Adds a building with no checks (placement validates first; the client mirror copies the server's).
 * Kept sorted by id; `nextId` stays above every id. Returns null for an unknown type or a taken id.
 */
export function addBuildingAt(world: World, spec: BuildingSpec): Building | null {
  const stats = buildingStats(world.balance, spec.type);
  if (!stats || buildingById(world, spec.id)) return null;
  const box = footprint(stats, spec.gx, spec.gy, spec.rot, scratch);
  const b: Building = {
    id: spec.id,
    type: spec.type,
    ownerId: spec.ownerId,
    gx: spec.gx,
    gy: spec.gy,
    rot: spec.rot,
    hp: spec.hp,
    maxHp: stats.hp,
    minX: box.minX,
    minY: box.minY,
    maxX: box.maxX,
    maxY: box.maxY,
  };
  const s = world.buildings;
  let i = s.list.length;
  while (i > 0 && (s.list[i - 1] as Building).id > b.id) i--;
  s.list.splice(i, 0, b);
  if (b.id >= s.nextId) s.nextId = b.id + 1;
  s.version++;
  return b;
}

/** Removes a building (Story 3.5's destruction; the client mirror). Returns whether it existed. */
export function removeBuilding(world: World, id: number): boolean {
  const list = world.buildings.list;
  for (let i = 0; i < list.length; i++) {
    if ((list[i] as Building).id !== id) continue;
    list.splice(i, 1);
    world.buildings.version++;
    return true;
  }
  return false;
}

/**
 * Story 3.4: places a building for `ownerId` (server-validated; solo calls it too): checks
 * (`placementError`), charges the price (`spendMoney`), adds the building at full HP and emits
 * `building.placed` (delivered with the next tick's events). On an error nothing changes.
 */
export function placeBuilding(world: World, ownerId: string, req: PlaceRequest): Result<Building, PlaceError> {
  const e = placementError(world, ownerId, req);
  if (e) return err(e);
  const stats = buildingStats(world.balance, req.type) as Readonly<BuildingTypeStats>;
  const paid = spendMoney(world, ownerId, stats.price);
  if (!paid.ok) return err("money"); // unreachable: the wallet was checked
  const b = addBuildingAt(world, {
    id: world.buildings.nextId,
    type: req.type,
    ownerId,
    gx: req.gx,
    gy: req.gy,
    rot: req.rot as BuildingRotation,
    hp: stats.hp,
  }) as Building;
  world.events.emit({ type: "building.placed", buildingId: b.id, buildingType: b.type, ownerId, gx: b.gx, gy: b.gy, rot: b.rot });
  return ok(b);
}
