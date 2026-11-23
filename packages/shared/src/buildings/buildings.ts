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
  /** Key of `balance.buildings.types`. Story 5.9: changes only through `setBuildingType` (an upgrade, same footprint). */
  type: string;
  /** Player id of the builder ("p0"–"p3" online, "local" solo); Story 3.6 credits kills to it. */
  readonly ownerId: string;
  /** Min corner as 0.5 m lattice indices (x = gx × BUILD_GRID_M m). */
  readonly gx: number;
  readonly gy: number;
  readonly rot: BuildingRotation;
  /** Story 3.5 damages it; Story 3.7 repairs it to `maxHp`. */
  hp: number;
  /** Story 5.9: follows `type` (`setBuildingType`). */
  maxHp: number;
  /**
   * Story 5.9: a wall (true: blocks bodies and the flow field, zombies attack it) or floor (false:
   * spike traps, mines; never blocks anything). Cached from the type at `addBuildingAt`; an upgrade
   * keeps it (same footprint, same kind).
   */
  readonly solid: boolean;
  /** The footprint in metres (cached at creation; buildings never move). */
  readonly minX: number;
  readonly minY: number;
  readonly maxX: number;
  readonly maxY: number;
  /**
   * Story 3.6 (turrets; 0 / (1, 0) on other types): the fire cooldown in seconds (the shared rule in
   * `combat/cooldown.ts`) and the unit aim of the last shot. The server's World writes the aim on
   * every shot; the client mirror writes it from `turret.fired` (never synced per tick).
   */
  fireCooldownS: number;
  /** Story 4.8 review L4: ticks spent inside a fire since its last fire hit (the burn clock). */
  fireTicks: number;
  aimX: number;
  aimY: number;
}

export interface BuildingState {
  /** Every standing building, sorted by id. At most `maxPerPlayer × MAX_PLAYERS`. */
  readonly list: Building[];
  /** Next id to hand out (ids start at 1). */
  nextId: number;
  /** +1 on every add, remove and (Story 5.9) type change: renderers and the schema sync follow it. */
  version: number;
  /**
   * Story 5.9: +1 only when a WALL (`solid`) is added or removed: the flow field's dirty counter.
   * Floor buildings (traps, mines) and upgrades (same footprint) never change what blocks, so a mine
   * exploding mid-wave never re-rasterizes the nav grid.
   */
  wallVersion: number;
}

export function createBuildingState(): BuildingState {
  return { list: [], nextId: 1, version: 0, wallVersion: 0 };
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
 * The box is off the map, within `buildings.spawnClearM` of a spawn point of any decay stage (review
 * L5: spawns can't be boxed in; Story 4.3 review M: not even the ones that open later), overlaps a map collision box (Story 4.1) or another building (touching edges are fine: barricades form walls and
 * corners), a placed player (out players are off the map) or an alive zombie.
 */
export function footprintBlocked(world: Readonly<World>, box: Readonly<Box>): boolean {
  const { widthM, heightM, spawnPoints } = world.map;
  if (box.minX < 0 || box.minY < 0 || box.maxX > widthM || box.maxY > heightM) return true;
  const clear = world.balance.buildings.spawnClearM;
  // Story 4.3 review M: every spawn point of every decay stage (brief line 7's "active at the coming
  // stage" is a subset), so a barricade can never seal a spawn that opens later.
  for (let i = 0; i < spawnPoints.length; i++) {
    const sp = spawnPoints[i] as { x: number; y: number };
    if (circleOverlapsBox(sp.x, sp.y, clear, box.minX, box.minY, box.maxX, box.maxY)) return true;
  }
  const solids = world.obstacles.solids; // Story 4.1/4.2: map collision boxes + active cover (touching is fine, like buildings)
  for (let i = 0; i < solids.length; i++) {
    const b = solids[i] as Box;
    if (box.minX < b.maxX && box.maxX > b.minX && box.minY < b.maxY && box.maxY > b.minY) return true;
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
 * Story 5.17: why a footprint is blocked (the first cause, in this order) — `blockReason`'s answer.
 * `off_map` (index −1) → `spawn` (index into `world.map.spawnPoints`) → `solid` (index into
 * `world.obstacles.solids`: a map box or active cover) → `building` (`id`: the building's id) → `me`
 * (`playerId` = the owner) → `teammate` (`playerId`) → `zombie` (`id`: the zombie's slot id).
 */
export type BlockCause = "off_map" | "spawn" | "solid" | "building" | "me" | "teammate" | "zombie";

export interface BlockReason {
  cause: BlockCause;
  /** Spawn point / solid index; −1 for the other causes. */
  index: number;
  /** Building id / zombie slot id; 0 for the other causes. */
  id: number;
  /** Player id for `me` / `teammate`; "" otherwise. */
  playerId: string;
}

export function createBlockReason(): BlockReason {
  return { cause: "off_map", index: -1, id: 0, playerId: "" };
}

const reasonScratch: BlockReason = createBlockReason();

function setReason(out: BlockReason, cause: BlockCause, index: number, id: number, playerId: string): BlockReason {
  out.cause = cause;
  out.index = index;
  out.id = id;
  out.playerId = playerId;
  return out;
}

/**
 * Story 5.17 (BX-3): the **client's** explanation of `footprintBlocked` — the same tests, in the
 * order the reason line explains them, with what caused it (so the culprit can be outlined).
 * `blockReason(w, o, box) !== null ⇔ footprintBlocked(w, box)` for every World and box (fuzz-tested
 * in `blockReason.test.ts`); `footprintBlocked` stays the server's check. `exceptId` (a building id;
 * 0 = none) leaves one building out (Story 5.24's move: the building being moved never blocks itself).
 * Returns `out` filled (default: one module scratch object, valid until the next call) or null when
 * the spot is clear. No allocation.
 */
export function blockReason(world: Readonly<World>, ownerId: string, box: Readonly<Box>, exceptId = 0, out: BlockReason = reasonScratch): BlockReason | null {
  const { widthM, heightM, spawnPoints } = world.map;
  if (box.minX < 0 || box.minY < 0 || box.maxX > widthM || box.maxY > heightM) return setReason(out, "off_map", -1, 0, "");
  const clear = world.balance.buildings.spawnClearM;
  for (let i = 0; i < spawnPoints.length; i++) {
    const sp = spawnPoints[i] as { x: number; y: number };
    if (circleOverlapsBox(sp.x, sp.y, clear, box.minX, box.minY, box.maxX, box.maxY)) return setReason(out, "spawn", i, 0, "");
  }
  const solids = world.obstacles.solids;
  for (let i = 0; i < solids.length; i++) {
    const b = solids[i] as Box;
    if (box.minX < b.maxX && box.maxX > b.minX && box.minY < b.maxY && box.maxY > b.minY) return setReason(out, "solid", i, 0, "");
  }
  const list = world.buildings.list;
  for (let i = 0; i < list.length; i++) {
    const b = list[i] as Building;
    if (b.id === exceptId && exceptId !== 0) continue;
    if (box.minX < b.maxX && box.maxX > b.minX && box.minY < b.maxY && box.maxY > b.minY) return setReason(out, "building", -1, b.id, "");
  }
  const me = world.players.get(ownerId);
  if (me && me.status !== "out" && circleOverlapsBox(me.x, me.y, me.radiusM, box.minX, box.minY, box.maxX, box.maxY)) return setReason(out, "me", -1, 0, ownerId);
  for (const p of world.players.values()) {
    if (p.status === "out" || p === me) continue;
    if (circleOverlapsBox(p.x, p.y, p.radiusM, box.minX, box.minY, box.maxX, box.maxY)) return setReason(out, "teammate", -1, 0, p.id);
  }
  const z = world.zombies;
  if (z.aliveCount > 0) {
    const rz = maxZombieRadius(world.balance);
    for (let i = 0; i < z.aliveCount; i++) {
      const id = z.aliveIds[i] as number;
      if (circleOverlapsBox(z.x[id] as number, z.y[id] as number, rz, box.minX, box.minY, box.maxX, box.maxY)) return setReason(out, "zombie", -1, id, "");
    }
  }
  return null;
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
  if (!stats || !stats.forSale || !isRotation(req.rot)) return "unknown_type"; // Story 5.9: upgrade-only tiers are never placed
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
    solid: stats.solid,
    minX: box.minX,
    minY: box.minY,
    maxX: box.maxX,
    maxY: box.maxY,
    fireCooldownS: 0,
    fireTicks: 0,
    aimX: 1,
    aimY: 0,
  };
  const s = world.buildings;
  let i = s.list.length;
  while (i > 0 && (s.list[i - 1] as Building).id > b.id) i--;
  s.list.splice(i, 0, b);
  if (b.id >= s.nextId) s.nextId = b.id + 1;
  s.version++;
  if (b.solid) s.wallVersion++; // Story 5.9: floor never dirties the flow field
  return b;
}

/** Removes a building (Story 3.5's destruction; the client mirror). Returns whether it existed. */
export function removeBuilding(world: World, id: number): boolean {
  const list = world.buildings.list;
  for (let i = 0; i < list.length; i++) {
    const b = list[i] as Building;
    if (b.id !== id) continue;
    list.splice(i, 1);
    world.buildings.version++;
    if (b.solid) world.buildings.wallVersion++; // Story 5.9
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

/**
 * Story 3.5: `amount` damage to a building (a zombie hit; Story 3.6's turrets are hit the same way).
 * HP lives only in `building.hp`, always a whole number (Story 3.7 repairs it to `maxHp`; the
 * schema sends it on change).
 * At 0 HP the building is removed (`removeBuilding`: version++, so the flow field and every copy
 * follow) and `building.destroyed` is emitted. Returns true when it was destroyed.
 */
export function damageBuilding(world: World, b: Building, amount: number): boolean {
  if (amount <= 0 || b.hp <= 0) return false;
  // Whole HP only (Story 3.7's repair check is `hp < maxHp` on the server and the client shows the
  // integer): a fractional hit (a dev damage scale) rounds, and never to 0.
  b.hp = Math.max(0, b.hp - Math.max(1, Math.round(amount)));
  if (b.hp > 0) return false;
  if (!removeBuilding(world, b.id)) return false;
  world.events.emit({ type: "building.destroyed", buildingId: b.id, buildingType: b.type, ownerId: b.ownerId, gx: b.gx, gy: b.gy, rot: b.rot });
  return true;
}

/**
 * Story 5.9 (D1): turns `b` into `type` in place (an upgrade): same id, footprint and owner; the new
 * type's full HP (DD2). `version` +1 (the schema sync and renderers follow it); `wallVersion` is
 * untouched (same footprint: nothing that blocks changed). Returns false for an unknown type or a
 * different footprint / kind (never happens through `upgradeBuilding`: the balance cross-check).
 */
export function setBuildingType(world: World, b: Building, type: string, hp?: number): boolean {
  const stats = buildingStats(world.balance, type);
  if (!stats || stats.solid !== b.solid) return false;
  const box = footprint(stats, b.gx, b.gy, b.rot, scratch);
  if (box.maxX !== b.maxX || box.maxY !== b.maxY) return false;
  b.type = type;
  b.maxHp = stats.hp;
  b.hp = hp ?? stats.hp;
  world.buildings.version++;
  return true;
}
