import type { Balance } from "../config/balance";
import type { World } from "../core/world";
import { err, ok, type Result } from "../core/result";
import { spendMoney } from "../economy/economy";
import { buildingById, buildingStats, type Building } from "./buildings";

/**
 * Story 3.7: repairs (GDD › Buildings and Defenses: "can be repaired in a build phase for 50% of
 * their price"; FR51). A repair is always a full repair and always costs
 * `ceil(price × buildings.repairShare)`, whatever the damage. Anyone in the run may repair any
 * standing building (a teammate's too) and pays from their own wallet. Applied between ticks by the
 * server's message handler or solo's host, like `placeBuilding`.
 */

/** Why a repair is refused. The client maps it to text (`repairRefusalText`). */
export type RepairError = "unknown_player" | "not_build_phase" | "gone" | "full_hp" | "money";

/** Every `RepairError`, for parsing what the server sent. */
export const REPAIR_ERRORS: readonly RepairError[] = Object.freeze(["unknown_player", "not_build_phase", "gone", "full_hp", "money"]);

/** What a full repair of `type` costs (0 for an unknown type). */
export function repairCost(balance: Balance, type: string): number {
  const stats = buildingStats(balance, type);
  return stats ? Math.ceil(stats.price * balance.buildings.repairShare) : 0;
}

/** The building is damaged (3.5 may leave fractional HP). */
export const isDamaged = (b: Readonly<Building>): boolean => b.hp < b.maxHp;

/**
 * The whole repair check, in this order: unknown player → not a build phase → the building is gone
 * → it is at full HP → money. null = the server would accept it. The client's panel runs the same
 * check on its mirror World (synced HP is rounded up there, so the server may still say yes).
 */
export function repairError(world: Readonly<World>, playerId: string, buildingId: number): RepairError | null {
  const p = world.players.get(playerId);
  if (!p) return "unknown_player";
  if (world.run.phase !== "build") return "not_build_phase";
  const b = buildingById(world, buildingId);
  if (!b) return "gone";
  if (!isDamaged(b)) return "full_hp";
  if (p.wallet < repairCost(world.balance, b.type)) return "money";
  return null;
}

/** What a successful repair did. */
export interface Repaired {
  readonly building: Building;
  readonly cost: number;
}

/**
 * Story 3.7: `playerId` repairs building `buildingId` to full HP and pays `repairCost` (`spendMoney`),
 * then `building.repaired` is emitted (delivered with the next tick's events). On an error nothing
 * changes. A repeat of the same request is refused as `full_hp`, so it can never charge twice.
 */
export function repairBuilding(world: World, playerId: string, buildingId: number): Result<Repaired, RepairError> {
  const e = repairError(world, playerId, buildingId);
  if (e) return err(e);
  const b = buildingById(world, buildingId) as Building;
  const cost = repairCost(world.balance, b.type);
  const paid = spendMoney(world, playerId, cost);
  if (!paid.ok) return err("money"); // unreachable: the wallet was checked
  b.hp = b.maxHp;
  // The footprint's centre from its box (not gx/gy: the grid anchoring may change, 3.4 review).
  world.events.emit({ type: "building.repaired", buildingId: b.id, playerId, cost, x: (b.minX + b.maxX) / 2, y: (b.minY + b.maxY) / 2 });
  return ok({ building: b, cost });
}

/**
 * The building under the world point (x, y), its footprint grown by `tolM` on each side (a thin
 * barricade under a finger); the nearest centre wins where grown footprints overlap. null = none.
 */
export function buildingAtPoint(world: Readonly<World>, x: number, y: number, tolM: number): Building | null {
  const list = world.buildings.list;
  let best: Building | null = null;
  let bestD = Infinity;
  for (let i = 0; i < list.length; i++) {
    const b = list[i] as Building;
    if (x < b.minX - tolM || x > b.maxX + tolM || y < b.minY - tolM || y > b.maxY + tolM) continue;
    const dx = x - (b.minX + b.maxX) / 2;
    const dy = y - (b.minY + b.maxY) / 2;
    const d = dx * dx + dy * dy;
    if (d < bestD) {
      bestD = d;
      best = b;
    }
  }
  return best;
}
