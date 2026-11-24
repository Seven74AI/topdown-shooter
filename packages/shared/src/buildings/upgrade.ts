import type { World } from "../core/world";
import { err, ok, type Result } from "../core/result";
import { spendMoney } from "../economy/economy";
import { buildingById, buildingStats, setBuildingType, type Building } from "./buildings";

/**
 * Story 5.9: barricade upgrades (FR52; designer DD1 A: wood 200 HP → reinforced B8 350 HP (+50) →
 * metal 600 HP (+70)). The pattern of `repair.ts`: shared checks (the client panel runs them on its
 * mirror World), applied between ticks by the server's message handler or solo's host.
 *
 * F9 "upgrades are honest": only the owner (DD10; anyone may still repair, 3.7), only in a build
 * phase, the step price is charged once (a repeated request finds the new tier: its own next step,
 * or `not_upgradable` at the top), the building keeps its id, footprint and place and gets the new
 * tier's full HP (DD2). The tier's `price` is the total paid (40 / 90 / 160), so 3.7's repair and
 * 4.5's decay refund are fair with no extra code.
 */

/** Why an upgrade is refused. The client maps it to text (`upgradeRefusalText`). */
export type UpgradeError = "unknown_player" | "not_alive" | "not_build_phase" | "gone" | "not_owner" | "not_upgradable" | "money";

/** Every `UpgradeError`, for parsing what the server sent. */
export const UPGRADE_ERRORS: readonly UpgradeError[] = Object.freeze(["unknown_player", "not_alive", "not_build_phase", "gone", "not_owner", "not_upgradable", "money"]);

/** The next tier of `type` and the step's price, or null at the top of the ladder / for an unknown type. */
export function upgradeStep(world: Readonly<World>, type: string): { readonly type: string; readonly price: number } | null {
  return buildingStats(world.balance, type)?.upgradesTo ?? null;
}

/**
 * The whole upgrade check, in this order: unknown player → (Story 5.20) not standing → not a build phase → the building is gone
 * → not the owner → no next tier → money. null = the server would accept it.
 */
export function upgradeError(world: Readonly<World>, playerId: string, buildingId: number): UpgradeError | null {
  const p = world.players.get(playerId);
  if (!p) return "unknown_player";
  if (p.status !== "alive") return "not_alive"; // Story 5.20 (5.11 R2)
  if (world.run.phase !== "build") return "not_build_phase";
  const b = buildingById(world, buildingId);
  if (!b) return "gone";
  if (b.ownerId !== playerId) return "not_owner";
  const step = upgradeStep(world, b.type);
  if (!step || !buildingStats(world.balance, step.type)) return "not_upgradable";
  if (p.wallet < step.price) return "money";
  return null;
}

/** What a successful upgrade did. */
export interface Upgraded {
  readonly building: Building;
  readonly cost: number;
  readonly fromType: string;
}

/**
 * Story 5.9: `playerId` upgrades their building `buildingId` one tier, pays the step price
 * (`spendMoney`), the building gets the new type and its full HP (`setBuildingType`: `version` +1,
 * `wallVersion` untouched) and `building.upgraded` is emitted. On an error nothing changes.
 */
export function upgradeBuilding(world: World, playerId: string, buildingId: number): Result<Upgraded, UpgradeError> {
  const e = upgradeError(world, playerId, buildingId);
  if (e) return err(e);
  const b = buildingById(world, buildingId) as Building;
  const step = upgradeStep(world, b.type) as { type: string; price: number };
  const fromType = b.type;
  const paid = spendMoney(world, playerId, step.price);
  if (!paid.ok) return err("money"); // unreachable: the wallet was checked
  if (!setBuildingType(world, b, step.type)) return err("not_upgradable"); // unreachable: the balance cross-check
  b.paid += step.price; // Story 5.20 (F2): the step is part of what a sell refunds
  b.paidThisBuild += step.price;
  world.events.emit({ type: "building.upgraded", buildingId: b.id, playerId, cost: step.price, toType: b.type, x: (b.minX + b.maxX) / 2, y: (b.minY + b.maxY) / 2 });
  return ok({ building: b, cost: step.price, fromType });
}
