import type { World } from "../core/world";
import { err, ok, type Result } from "../core/result";
import { refundMoney } from "../economy/economy";
import { buildingById, removeBuilding, type Building } from "./buildings";

/**
 * Story 5.20 (BX-6): take back and sell. One shared rule (server, solo, and the client's panel on
 * its mirror World), applied between ticks by the server's message handler or solo's host, like
 * `upgradeBuilding`.
 *
 * Fairness (ux-spec §8): F1 the server decides; F2 no money loop — `refund = paidThisBuild +
 * floor(sellShare × (paid − paidThisBuild))`: what I paid for it in this build phase comes back
 * whole ("take back"), what I paid earlier comes back at 50 % rounded down ("sell"), repairs never
 * (they never add to `paid`); with `sellShare` = `repairShare` selling and rebuilding costs exactly
 * a repair; F3 owner only; F4 build phase only; F9 standing only (`not_alive`). Mines and traps are
 * just removed (F6: a mine never goes off in a build phase); a bear trap that holds a zombie lets
 * it go (`removeBuilding`).
 */

/** Why a sell is refused, in check order. The client maps it to text (`sellRefusalText`). */
export type SellError = "unknown_player" | "not_alive" | "not_build_phase" | "gone" | "not_owner";

/** Every `SellError`, for parsing what the server sent. */
export const SELL_ERRORS: readonly SellError[] = Object.freeze(["unknown_player", "not_alive", "not_build_phase", "gone", "not_owner"]);

/** F2: what selling gives back for `paid` in total, `paidThisBuild` of it in this build phase. */
export function sellRefundFor(sellShare: number, paid: number, paidThisBuild: number): number {
  const now = Math.max(0, Math.min(paid, paidThisBuild));
  return now + Math.floor(sellShare * (paid - now));
}

/**
 * F2: what selling `b` now gives back (server / solo truth). Review M1: a building that has done its
 * job this build phase (`usedThisBuild`: a med station healed someone) sells at the normal share even
 * if it was bought this phase — no free healing by taking it back before Ready.
 */
export function sellRefund(world: Readonly<World>, b: Readonly<Building>): number {
  return sellRefundFor(world.balance.buildings.sellShare, b.paid, b.usedThisBuild ? 0 : b.paidThisBuild);
}

/**
 * The whole sell check, in this order: unknown player → not standing (downed or out) → not a build
 * phase → the building is gone → not the owner. null = the server would accept it.
 */
export function sellError(world: Readonly<World>, playerId: string, buildingId: number): SellError | null {
  const p = world.players.get(playerId);
  if (!p) return "unknown_player";
  if (p.status !== "alive") return "not_alive";
  if (world.run.phase !== "build") return "not_build_phase";
  const b = buildingById(world, buildingId);
  if (!b) return "gone";
  if (b.ownerId !== playerId) return "not_owner";
  return null;
}

/** What a successful sell did. */
export interface Sold {
  readonly buildingId: number;
  readonly type: string;
  readonly refund: number;
}

/**
 * `playerId` sells their building `buildingId`: the refund (`sellRefund`) goes back through
 * `refundMoney` (`money.earned`, reason `refund`, not counted in `earned`), the building is removed
 * (`version` +1, `wallVersion` +1 for a wall) and `building.sold` is emitted (FX: footprint centre).
 * On an error nothing changes; a repeat finds it `gone`, so it can never refund twice.
 */
export function sellBuilding(world: World, playerId: string, buildingId: number): Result<Sold, SellError> {
  const e = sellError(world, playerId, buildingId);
  if (e) return err(e);
  const b = buildingById(world, buildingId) as Building;
  const refund = sellRefund(world, b);
  const x = (b.minX + b.maxX) / 2;
  const y = (b.minY + b.maxY) / 2;
  removeBuilding(world, b.id);
  refundMoney(world, playerId, refund);
  world.events.emit({ type: "building.sold", buildingId: b.id, buildingType: b.type, ownerId: playerId, rot: b.rot, refund, x, y });
  return ok({ buildingId: b.id, type: b.type, refund });
}
