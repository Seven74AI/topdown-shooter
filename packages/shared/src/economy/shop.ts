import type { Balance } from "../config/balance";
import { err, ok, type Result } from "../core/result";
import type { World } from "../core/world";
import { createSlot, type Loadout, type WeaponSlot } from "../combat/loadout";
import { upgradePrice, type WeaponId } from "../combat/weapons";
import { spendMoney, type SpendError } from "./economy";
import { buyGear, gearBit } from "./gear";

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
 * generically: any entry with a numeric `price` is listed, named by its string `name` if it has one;
 * Story 5.9: except upgrade-only tiers (`forSale: false`).
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
        if ((t as { forSale?: unknown }).forSale === false) continue; // Story 5.9: upgrade-only tiers
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
 * Story 5.1: the new slot starts at level I (a replaced weapon's upgrades are lost; buying it again
 * later starts at I too).
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
 * Bot hook (Epic 2 retro A10; used by the 3.3 shop sim; Story 3.10 bots use `bots/botShop.ts`): the first weapon of `list` the shop
 * sells, that the loadout doesn't hold and that `wallet` affords, or null.
 */
export function botShopPick(balance: Balance, wallet: number, loadout: Loadout, list: readonly string[]): WeaponId | null {
  for (const id of list) {
    const price = shopPrice(balance, id);
    if (price !== null && price <= wallet && !owns(loadout, id)) return id;
  }
  return null;
}

/**
 * Story 5.1: why `upgradeWeapon` refused (checked in this order). Named apart from the buildings'
 * `UpgradeError` (Story 5.9).
 */
export type WeaponUpgradeError = "not_build" | "unknown_player" | "not_owned" | "max_level" | SpendError;

/** What one weapon upgrade did. */
export interface WeaponUpgraded {
  readonly slot: 0 | 1;
  /** The new level (2–maxLevel). */
  readonly level: number;
  readonly price: number;
}

/**
 * Story 5.1 (F1–F4): upgrades the `weapon` in one of `playerId`'s slots by one level, paid from
 * their own wallet at `upgradePrice`. Checks, in order: a build phase, a known player, the weapon
 * is in one of the player's slots, below `upgrades.maxLevel`, then `spendMoney`. On success only
 * that slot's `level` rises (ammo, reload, cooldown and the active slot stay) and
 * `weapon.upgraded` is emitted. On an error nothing changes. Draws no random number.
 */
export function upgradeWeapon(world: World, playerId: string, weapon: WeaponId): Result<WeaponUpgraded, WeaponUpgradeError> {
  if (world.run.phase !== "build") return err("not_build");
  const p = world.players.get(playerId);
  if (!p) return err("unknown_player");
  const lo = p.loadout;
  const slot: 0 | 1 | null = lo.slots[0].weapon === weapon ? 0 : lo.slots[1]?.weapon === weapon ? 1 : null;
  if (slot === null) return err("not_owned");
  const s = lo.slots[slot] as WeaponSlot;
  if (s.level >= world.balance.shop.upgrades.maxLevel) return err("max_level");
  const price = upgradePrice(world.balance, weapon);
  const paid = spendMoney(world, playerId, price);
  if (!paid.ok) return paid;
  s.level++;
  world.events.emit({ type: "weapon.upgraded", playerId, weapon, slot, level: s.level });
  return ok({ slot, level: s.level, price });
}

/** One row of the shop's Upgrades section (Story 5.1). */
export interface ShopUpgradeRow {
  weapon: WeaponId;
  name: string;
  slot: 0 | 1;
  level: number;
  /** The price of the next level, or null at the max level. */
  nextPrice: number | null;
}

/**
 * Story 5.1: the shop's upgrade rows for a loadout, slot 0 first (one per weapon held). Allocates
 * (UI and bots, once per change; never per tick). Independent of the fixed weapon list (5.13).
 */
export function shopUpgrades(balance: Balance, loadout: Loadout): ShopUpgradeRow[] {
  const rows: ShopUpgradeRow[] = [];
  for (const slot of [0, 1] as const) {
    const s = loadout.slots[slot];
    if (!s) continue;
    const max = s.level >= balance.shop.upgrades.maxLevel;
    rows.push({ weapon: s.weapon, name: weaponName(balance, s.weapon), slot, level: s.level, nextPrice: max ? null : upgradePrice(balance, s.weapon) });
  }
  return rows;
}

const upgradeTableCache = new WeakMap<Balance, Readonly<Record<string, number>>>();

/** Story 5.1: every weapon's upgrade price per level, by id (cached per balance; the shop UI). */
export function upgradePriceTable(balance: Balance): Readonly<Record<string, number>> {
  let t = upgradeTableCache.get(balance);
  if (!t) {
    const out: Record<string, number> = {};
    for (const id of Object.keys(balance.weapons)) out[id] = upgradePrice(balance, id);
    t = Object.freeze(out);
    upgradeTableCache.set(balance, t);
  }
  return t;
}

const ROMAN = ["", "I", "II", "III", "IV", "V", "VI", "VII", "VIII", "IX", "X", "XI", "XII", "XIII", "XIV", "XV"] as const;

/** Story 5.1: 1 → "I" … 15 → "XV" (the HUD and shop marks); anything else → "". */
export function romanLevel(level: number): string {
  return ROMAN[level] ?? "";
}

/** Story 5.11: what one `shop.buy_item` purchase did (gear now; Story 5.12 adds consumables). */
export interface BoughtItem {
  readonly item: string;
  readonly price: number;
}

/**
 * Story 5.11: the one dispatcher of `shop.buy_item` (server for the message, solo on the local
 * World, bots): a gear id → `buyGear`. Story 5.12 adds its branch here (a consumable id →
 * `buyConsumable`). Anything else is `not_for_sale` — after the build-phase and player checks, so
 * the refusal order matches `buyGear`'s.
 */
export function buyItem(world: World, playerId: string, item: string): Result<BoughtItem, ShopError> {
  if (gearBit(world.balance, item) !== 0) return buyGear(world, playerId, item);
  // Story 5.12: if (isConsumable(world.balance, item)) return buyConsumable(world, playerId, item);
  if (world.run.phase !== "build") return err("not_build");
  if (!world.players.has(playerId)) return err("unknown_player");
  return err("not_for_sale");
}
