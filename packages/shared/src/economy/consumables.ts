import type { Balance } from "../config/balance";
import type { ConsumableItemStats } from "../config/balanceSchema";
import { err, ok, type Result } from "../core/result";
import { ticksFor } from "../core/time";
import type { World } from "../core/world";
import { spendMoney } from "./economy";
import type { ShopError } from "./shop";

/**
 * Story 5.12: consumables (FR8, FR49) — one quick-use slot per player, bought in a build phase.
 *
 * Slot rules (`buyConsumable`, tests in `consumables.test.ts`):
 * - empty slot → filled with the item's `pack`;
 * - same item → refilled to `pack` for the full price (D10); already full → `already_full`, nothing taken;
 * - another item → replaced by a full pack of the new one (the rest is lost; the shop warns first).
 *
 * The item travels as its index in `consumables.json › items` (uint8; 255 = empty). Every table is
 * cached per balance: nothing allocates per tick.
 */

export type ConsumableId = string;
export type ConsumableKind = ConsumableItemStats["kind"];

/** The slot index on the wire for "empty". */
export const CONSUMABLE_NONE = 255;

/** A throwable's lob numbers in 5.5's shape (`lobTarget`, `lobFlightTicks`, the landing ring). */
export interface ThrowStats {
  readonly minLobM: number;
  readonly lobRangeM: number;
  readonly lobSpeedMps: number;
  readonly minFlightS: number;
  /** The landing ring's radius: the blast or the fire zone. */
  readonly blastRadiusM: number;
  /** A molotov (a fire zone lands), else a hand grenade (a blast). */
  readonly fire: boolean;
}

/** One row of the shop's Consumables section (cached, frozen). */
export interface ShopConsumable {
  readonly id: ConsumableId;
  readonly name: string;
  readonly price: number;
  readonly pack: number;
  readonly kind: ConsumableKind;
}

interface ConsumableTable {
  readonly ids: readonly ConsumableId[];
  readonly indexOf: ReadonlyMap<ConsumableId, number>;
  readonly stats: readonly ConsumableItemStats[];
  /** Per index: the throw numbers (null for the medkit). */
  readonly throws: readonly (ThrowStats | null)[];
  /** Per index: the molotov zone's lifetime and pulse in ticks (0 for others). */
  readonly durationTicks: readonly number[];
  readonly pulseTicks: readonly number[];
  readonly shop: readonly ShopConsumable[];
  readonly all: readonly ShopConsumable[];
  readonly cooldownTicks: number;
}

const tables = new WeakMap<Balance, ConsumableTable>();

function table(balance: Balance): ConsumableTable {
  let t = tables.get(balance);
  if (!t) {
    const c = balance.consumables;
    const ids = Object.keys(c.items);
    const indexOf = new Map<ConsumableId, number>();
    const stats: ConsumableItemStats[] = [];
    const throws: (ThrowStats | null)[] = [];
    const durationTicks: number[] = [];
    const pulseTicks: number[] = [];
    const shop: ShopConsumable[] = [];
    const all: ShopConsumable[] = [];
    ids.forEach((id, i) => {
      const s = c.items[id] as ConsumableItemStats;
      indexOf.set(id, i);
      stats.push(s);
      throws.push(
        s.kind === "heal"
          ? null
          : Object.freeze({ minLobM: s.minThrowM ?? 0, lobRangeM: s.throwRangeM ?? 0, lobSpeedMps: s.throwSpeedMps ?? 1, minFlightS: s.minFlightS ?? 0, blastRadiusM: s.radiusM ?? 0, fire: s.kind === "molotov" }),
      );
      durationTicks.push(s.durationS === undefined ? 0 : ticksFor(s.durationS));
      pulseTicks.push(s.pulseS === undefined ? 0 : ticksFor(s.pulseS));
      const row = Object.freeze({ id, name: s.name, price: s.price, pack: s.pack, kind: s.kind });
      all.push(row);
      if (s.inShop) shop.push(row);
    });
    t = Object.freeze({
      ids: Object.freeze(ids),
      indexOf,
      stats,
      throws,
      durationTicks,
      pulseTicks,
      shop: Object.freeze(shop),
      all: Object.freeze(all),
      cooldownTicks: ticksFor(c.useCooldownS),
    });
    tables.set(balance, t);
  }
  return t;
}

/** The consumable ids in index order (`consumables.json` key order; the wire index). */
export function consumableIds(balance: Balance): readonly ConsumableId[] {
  return table(balance).ids;
}

/** The wire index of a consumable id (CONSUMABLE_NONE for null or an unknown id). */
export function consumableIndex(balance: Balance, id: string | null): number {
  return id === null ? CONSUMABLE_NONE : (table(balance).indexOf.get(id) ?? CONSUMABLE_NONE);
}

/** The id at a wire index (null for CONSUMABLE_NONE or out of range). */
export function consumableAt(balance: Balance, index: number): ConsumableId | null {
  return table(balance).ids[index] ?? null;
}

export function isConsumable(balance: Balance, id: string): boolean {
  return table(balance).indexOf.has(id);
}

/** The item's stats (undefined for an unknown id). */
export function consumableStats(balance: Balance, id: string | null): ConsumableItemStats | undefined {
  if (id === null) return undefined;
  const i = table(balance).indexOf.get(id);
  return i === undefined ? undefined : table(balance).stats[i];
}

/** A throwable's lob numbers (null for the medkit, an unknown id or null). */
export function throwStatsOf(balance: Balance, id: string | null): ThrowStats | null {
  if (id === null) return null;
  const i = table(balance).indexOf.get(id);
  return i === undefined ? null : (table(balance).throws[i] ?? null);
}

/** By wire index (the landing hook). */
export function throwStatsAt(balance: Balance, index: number): ThrowStats | null {
  return table(balance).throws[index] ?? null;
}

export function consumableStatsAt(balance: Balance, index: number): ConsumableItemStats | undefined {
  return table(balance).stats[index];
}

/** A molotov's zone lifetime / pulse in ticks (0 for other items). */
export function molotovTicksAt(balance: Balance, index: number): { readonly durationTicks: number; readonly pulseTicks: number } {
  const t = table(balance);
  scratchTicks.durationTicks = t.durationTicks[index] ?? 0;
  scratchTicks.pulseTicks = t.pulseTicks[index] ?? 0;
  return scratchTicks;
}
const scratchTicks = { durationTicks: 0, pulseTicks: 0 };

/** `ticksFor(useCooldownS)` (D1). */
export function consumableCooldownTicks(balance: Balance): number {
  return table(balance).cooldownTicks;
}

/** The consumables the shop lists (`inShop`), in index order. */
export function shopConsumables(balance: Balance): readonly ShopConsumable[] {
  return table(balance).shop;
}

/** Every consumable (HUD icons, `?shopall`), in index order. */
export function allConsumables(balance: Balance): readonly ShopConsumable[] {
  return table(balance).all;
}

/** What a consumable purchase did. */
export interface BoughtConsumable {
  readonly item: ConsumableId;
  readonly price: number;
  /** The item the slot held before (null: empty; another id: replaced, its rest lost). */
  readonly replaced: ConsumableId | null;
}

/**
 * Buys consumable `item` for `playerId`. Checks, in order: a build phase, a known player, standing
 * (`not_alive`), a known item in the shop (`not_for_sale`), not already a full slot of it
 * (`already_full`), then `spendMoney`. On success the slot holds `item` × `pack` (fill, refill or
 * replace). On an error nothing changes.
 */
export function buyConsumable(world: World, playerId: string, item: string): Result<BoughtConsumable, ShopError> {
  if (world.run.phase !== "build") return err("not_build");
  const p = world.players.get(playerId);
  if (!p) return err("unknown_player");
  if (p.status !== "alive") return err("not_alive");
  const s = consumableStats(world.balance, item);
  if (!s || !s.inShop) return err("not_for_sale");
  if (p.consumable === item && p.consumableCount >= s.pack) return err("already_full");
  const paid = spendMoney(world, playerId, s.price);
  if (!paid.ok) return paid;
  const replaced = p.consumable;
  p.consumable = item;
  p.consumableCount = s.pack;
  return ok({ item, price: s.price, replaced: replaced === item ? null : replaced });
}
