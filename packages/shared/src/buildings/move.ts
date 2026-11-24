import type { World } from "../core/world";
import { err, ok, type Result } from "../core/result";
import { buildingById, buildingStats, footprint, footprintBlocked, relocateBuilding, type Box, type Building, type BuildingRotation } from "./buildings";

/**
 * Story 5.22 (BX-8, merged into 5.21): move a building. One shared rule (server, solo, and the
 * client's hand on its mirror World), applied between ticks by the server's message handler or
 * solo's host, like `sellBuilding`.
 *
 * Fairness (ux-spec §8): F1 the server decides; F3 owner only; F4 build phase only; F5 a move
 * changes the spot and nothing else (HP, wear, tier, owner and kill credit, money bookkeeping, burn
 * clock, trap jaws: `relocateBuilding`); F6 the new spot follows the placement rules
 * (`footprintBlocked`) with the building itself ignored; F8 free, the cap unchanged; F9 standing
 * only. Atomic: a refused move changes nothing.
 */

/** Why a move is refused, in check order. The client maps it to text (`moveRefusalText`). */
export type MoveError = "unknown_player" | "not_alive" | "not_build_phase" | "gone" | "not_owner" | "blocked";

/** Every `MoveError`, for parsing what the server sent. */
export const MOVE_ERRORS: readonly MoveError[] = Object.freeze(["unknown_player", "not_alive", "not_build_phase", "gone", "not_owner", "blocked"]);

/** What a move asks for (a message's fields, already shape-checked). */
export interface MoveRequest {
  readonly id: number;
  readonly gx: number;
  readonly gy: number;
  readonly rot: number;
}

const isRotation = (rot: number): rot is BuildingRotation => rot === 0 || rot === 1 || rot === 2 || rot === 3;

/** Scratch box (no allocation per call). */
const scratch: Box = { minX: 0, minY: 0, maxX: 0, maxY: 0 };

/**
 * The whole move check, in this order: unknown player → not standing (downed or out) → not a build
 * phase → the building is gone → not the owner → the new spot (a bad rotation or corner, or
 * `footprintBlocked` with the building itself ignored). null = the server would accept it.
 */
export function moveError(world: Readonly<World>, playerId: string, req: MoveRequest): MoveError | null {
  const p = world.players.get(playerId);
  if (!p) return "unknown_player";
  if (p.status !== "alive") return "not_alive";
  if (world.run.phase !== "build") return "not_build_phase";
  const b = buildingById(world, req.id);
  if (!b) return "gone";
  if (b.ownerId !== playerId) return "not_owner";
  const stats = buildingStats(world.balance, b.type);
  if (!stats || !isRotation(req.rot) || !Number.isInteger(req.gx) || !Number.isInteger(req.gy)) return "blocked";
  if (footprintBlocked(world, footprint(stats, req.gx, req.gy, req.rot, scratch), b.id)) return "blocked";
  return null;
}

/**
 * `playerId` moves their building `req.id` to (gx, gy, rot): checks (`moveError`), then
 * `relocateBuilding` (version +1, wallVersion +1 for a wall) and `building.moved`. The spot it already
 * has is accepted and changes nothing (no version bump, no event). On an error nothing changes.
 */
export function moveBuilding(world: World, playerId: string, req: MoveRequest): Result<Building, MoveError> {
  const e = moveError(world, playerId, req);
  if (e) return err(e);
  const b = buildingById(world, req.id) as Building;
  if (relocateBuilding(world, b, req.gx, req.gy, req.rot as BuildingRotation)) {
    world.events.emit({ type: "building.moved", buildingId: b.id, buildingType: b.type, ownerId: b.ownerId, gx: b.gx, gy: b.gy, rot: b.rot });
  }
  return ok(b);
}
