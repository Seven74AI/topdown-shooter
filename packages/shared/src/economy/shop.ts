import type { Balance } from "../config/balance";
import { err, ok, type Result } from "../core/result";
import type { World } from "../core/world";
import { createSlot, type Loadout } from "../combat/loadout";
import type { WeaponId } from "../combat/weapons";
import { spendMoney, type SpendError } from "./economy";

/**
 * Story 3.3: the fixed-list shop (Epic 5 replaces it with the roguelike card shop).
 *
 * - Weapons: the ids in `shop.json › weapons`, in that order, at their `weapons.json › price`.
 *   Bought with `buyWeapon`, which the server runs for a `shop.buy` message (solo: the local World).
 * - Buildings (Story 3.4): every type of `balance.buildings` if that block exists, with its `price`
 *   and display name. The shop never buys a building: tapping one starts placement (3.4), which
 *   charges on a valid placement.
 *
 * Only `buyWeapon` changes anything, and only in a build phase; every refusal is a `Result` error
 * and leaves the World untouched.
 */

export interface ShopWeapon {
  readonly id: WeaponId;
  /** Display name (`weapons.json › name`, else the id in Title Case). */
  readonly name: string;
  readonly price: number;
}

export interface ShopBuilding {
  readonly id: string;
  readonly name: string;
  readonly price: number;
}

export type ShopError = "not_build" | "unknown_player" | "not_for_sale" | "already_owned" | "slot_required" | SpendError;

/** Where a bought weapon went. */
export interface Bought {
  readonly slot: 0 | 1;
}

const weaponCache = new WeakMap<Balance, readonly ShopWeapon[]>();
const buildingCache = new WeakMap<Balance, readonly ShopBuilding[]>();

/** The weapons the shop offers, in shop order (cached per balance). */
export function shopWeapons(balance: Balance): readonly ShopWeapon[] {
  let list = weaponCache.get(balance);
  if (!list) {
    const out: ShopWeapon[] = [];
    for (const id of balance.shop.weapons) {
      const stats = balance.weapons[id];
      if (stats) out.push(Object.freeze({ id, name: stats.name ?? titleCase(id), price: stats.price })); // loadBalance refused unknown ids
    }
    list = Object.freeze(out);
    weaponCache.set(balance, list);
  }
  return list;
}

/** "hunting_rifle" → "Hunting Rifle". */
export function titleCase(id: string): string {
  return id
    .split("_")
    .filter((w) => w.length > 0)
    .map((w) => (w[0] as string).toUpperCase() + w.slice(1))
    .join(" ");
}

/**
 * The building types the shop lists (Story 3.4 adds `balance.buildings`; until then: none). Read
 * generically: any entry with a numeric `price` is listed, named by its string `name` if it has one.
 */
export function shopBuildings(balance: Balance): readonly ShopBuilding[] {
  let list = buildingCache.get(balance);
  if (!list) {
    const out: ShopBuilding[] = [];
    const block = (balance as unknown as { buildings?: unknown }).buildings;
    const types = block && typeof block === "object" && "types" in block ? (block as { types: unknown }).types : block;
    if (types && typeof types === "object") {
      for (const [id, t] of Object.entries(types as Record<string, unknown>)) {
        const price = (t as { price?: unknown } | null)?.price;
        if (typeof price !== "number") continue;
        const name = (t as { name?: unknown }).name;
        out.push(Object.freeze({ id, price, name: typeof name === "string" && name.length > 0 ? name : titleCase(id) }));
      }
    }
    list = Object.freeze(out);
    buildingCache.set(balance, list);
  }
  return list;
}

/** A weapon's display name (shop texts). */
export function weaponName(balance: Balance, weapon: WeaponId): string {
  return balance.weapons[weapon]?.name ?? titleCase(weapon);
}

/** The shop's price of a weapon, or null if the shop doesn't sell it. */
export function shopPrice(balance: Balance, weapon: WeaponId): number | null {
  const list = shopWeapons(balance);
  for (let i = 0; i < list.length; i++) if ((list[i] as ShopWeapon).id === weapon) return (list[i] as ShopWeapon).price;
  return null;
}

/** The weapon is in one of the loadout's slots. */
export function owns(loadout: Loadout, weapon: WeaponId): boolean {
  return loadout.slots[0].weapon === weapon || loadout.slots[1]?.weapon === weapon;
}

/**
 * Buys `weapon` for `playerId` (Story 3.3). Checks, in order: a build phase, a known player, sold by
 * the shop, not already in a slot, a slot (the empty second slot first; with both full `slot` must
 * say which one is replaced), then the wallet (`spendMoney`). On success the weapon is in that slot
 * with a full magazine; the replaced weapon is lost and the active slot index is unchanged.
 * On an error nothing changes.
 */
export function buyWeapon(world: World, playerId: string, weapon: WeaponId, slot: 0 | 1 | null): Result<Bought, ShopError> {
  if (world.run.phase !== "build") return err("not_build");
  const p = world.players.get(playerId);
  if (!p) return err("unknown_player");
  const price = shopPrice(world.balance, weapon);
  if (price === null) return err("not_for_sale");
  const lo = p.loadout;
  if (owns(lo, weapon)) return err("already_owned");
  const target: 0 | 1 | null = lo.slots[1] === null ? 1 : slot;
  if (target === null) return err("slot_required");
  const paid = spendMoney(world, playerId, price);
  if (!paid.ok) return paid;
  lo.slots[target] = createSlot(world.balance, weapon);
  return ok({ slot: target });
}

/**
 * Bot hook (Epic 2 retro A10; Story 3.10 wires and tunes it): the first weapon of `list` the shop
 * sells, that the loadout doesn't hold and that `wallet` affords, or null.
 */
export function botShopPick(balance: Balance, wallet: number, loadout: Loadout, list: readonly string[]): WeaponId | null {
  for (const id of list) {
    const price = shopPrice(balance, id);
    if (price !== null && price <= wallet && !owns(loadout, id)) return id;
  }
  return null;
}
