import type { Balance } from "../config/balance";
import { err, ok, type Result } from "../core/result";
import type { World } from "../core/world";
import { createSlot, type Loadout, type WeaponSlot } from "../combat/loadout";
import { upgradePrice, type WeaponId } from "../combat/weapons";
import { spendMoney, type SpendError } from "./economy";
import { buyConsumable, isConsumable } from "./consumables";
import { inPool, unlockIndexOf } from "../meta/pool";

/**
 * The shop's shared helpers. Story 5.13 replaced Story 3.3's fixed weapon list with the card shop
 * (`economy/shopCards.ts`: weapon and gear cards); what stays here is always available: weapon
 * upgrades (Story 5.1) and consumables (`buyItem`, Story 5.12), plus `shopBuildings` (the build bar,
 * Story 5.16) and the name helpers. Every refusal is a `Result` error and leaves the World untouched.
 */

export interface ShopBuilding {
  readonly id: string;
  readonly name: string;
  readonly price: number;
}

/** Story 5.11 review M1: `not_alive` = a downed or out player (fire still hurts in a build phase) can't buy. */
/** Story 5.12: `already_full` = a consumable slot already full of that item (no money taken). */
/**
 * Story 5.13 (card shop): `stale_offer` = the buy/reroll names another build or rev than the stored
 * offer; `not_in_offer` = that card doesn't hold that item (sold, wrong item, bad index);
 * `no_new_cards` = a reroll could show nothing new (the pool is spent).
 */
export type ShopError =
  | "not_build"
  | "unknown_player"
  | "not_alive"
  | "not_for_sale"
  | "already_owned"
  | "already_full"
  | "slot_required"
  | "stale_offer"
  | "not_in_offer"
  | "no_new_cards"
  | "not_unlocked" // Story 7.4 (K5): a consumable not in my pool
  | SpendError;

const buildingCache = new WeakMap<Balance, readonly ShopBuilding[]>();

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
 * Story 5.9: except upgrade-only tiers (`forSale: false`). Story 5.10: and types not offered yet
 * (`inShop: false`, the floodlight until 6.3; the dev switch builds a balance with every `inShop` true).
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
        if ((t as { inShop?: unknown }).inShop === false) continue; // Story 5.10: not offered yet (dev: `loadDevBalance({ shopAll })`)
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

/** The weapon is in one of the loadout's slots. */
export function owns(loadout: Loadout, weapon: WeaponId): boolean {
  return loadout.slots[0].weapon === weapon || loadout.slots[1]?.weapon === weapon;
}

/**
 * Story 5.1: why `upgradeWeapon` refused (checked in this order). Named apart from the buildings'
 * `UpgradeError` (Story 5.9).
 */
export type WeaponUpgradeError = "not_build" | "unknown_player" | "not_alive" | "not_owned" | "max_level" | SpendError;

/** What one weapon upgrade did. */
export interface WeaponUpgraded {
  readonly slot: 0 | 1;
  /** The new level (2–maxLevel). */
  readonly level: number;
  readonly price: number;
}

/**
 * Story 5.1 (F1–F4): upgrades the `weapon` in one of `playerId`'s slots by one level, paid from
 * their own wallet at `upgradePrice`. Checks, in order: a build phase, a known player, standing
 * (Story 5.11 review: `not_alive` while downed or out), the weapon is in one of the player's slots, below `upgrades.maxLevel`, then `spendMoney`. On success only
 * that slot's `level` rises (ammo, reload, cooldown and the active slot stay) and
 * `weapon.upgraded` is emitted. On an error nothing changes. Draws no random number.
 */
export function upgradeWeapon(world: World, playerId: string, weapon: WeaponId): Result<WeaponUpgraded, WeaponUpgradeError> {
  if (world.run.phase !== "build") return err("not_build");
  const p = world.players.get(playerId);
  if (!p) return err("unknown_player");
  if (p.status !== "alive") return err("not_alive"); // Story 5.11 review: one rule, no shopping while down
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
 * (UI and bots, once per change; never per tick). Independent of the card shop (5.13).
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

/** Story 5.11: what one `shop.buy_item` purchase did (gear; Story 5.12 consumables). */
export interface BoughtItem {
  readonly item: string;
  readonly price: number;
  /** Story 5.12: a consumable that replaced another (its id; null / absent otherwise). */
  readonly replaced?: string | null;
}

/**
 * Story 5.11: the one dispatcher of `shop.buy_item` (server for the message, solo on the local
 * World, bots): Story 5.12: a consumable id → `buyConsumable`; Story 5.13: gear is a card now
 * (`buyCard`), so a gear id is `not_for_sale` here. Anything else is `not_for_sale` — after the build-phase and player checks, so
 * the refusal order matches `buyGear`'s.
 */
export function buyItem(world: World, playerId: string, item: string): Result<BoughtItem, ShopError> {
  // Story 5.13: gear is sold only as cards (`buyCard`); `shop.buy_item` keeps the consumables.
  if (isConsumable(world.balance, item)) return buyConsumable(world, playerId, item);
  if (world.run.phase !== "build") return err("not_build");
  const p = world.players.get(playerId);
  if (!p) return err("unknown_player");
  if (p.status !== "alive") return err("not_alive");
  return err("not_for_sale");
}

/** Story 6.9 (G7): why a player can't take the crate's weapon (`crateRefusal`). */
export type CrateRefusal = "already_have" | null;

/** Story 6.9 (G7, D10): `already_have` when the loadout holds `weapon` at `level` or higher. */
export function crateRefusal(loadout: Loadout, weapon: WeaponId, level: number): CrateRefusal {
  for (const s of loadout.slots) if (s && s.weapon === weapon && s.level >= level) return "already_have";
  return null;
}

/** Story 6.9: what taking the crate does to a loadout (`crateOutcome`; the HUD's G7 prompt reads it). */
export interface CrateOutcome {
  /** The slot the weapon goes into, or −1 when it can't be taken (`already_have`). */
  slot: -1 | 0 | 1;
  /** "empty" (second slot free), "upgrade" (carried below `level`), "replace" (both full: the active slot). */
  how: "empty" | "upgrade" | "replace" | "refused";
}

/** Story 6.9 (D8–D10): where the crate's weapon would go. Pure; fills `out`. */
export function crateOutcome(loadout: Loadout, weapon: WeaponId, level: number, out: CrateOutcome): CrateOutcome {
  if (crateRefusal(loadout, weapon, level) !== null) {
    out.slot = -1;
    out.how = "refused";
  } else if (loadout.slots[0].weapon === weapon) {
    out.slot = 0;
    out.how = "upgrade";
  } else if (loadout.slots[1]?.weapon === weapon) {
    out.slot = 1;
    out.how = "upgrade";
  } else if (loadout.slots[1] === null) {
    out.slot = 1;
    out.how = "empty";
  } else {
    out.slot = loadout.active;
    out.how = "replace";
  }
  return out;
}

const crateOut: CrateOutcome = { slot: -1, how: "refused" };

/**
 * Story 6.9 (DD4, D8–D10): gives the crate's `weapon` at `level` to `playerId` — not a purchase (no
 * wallet, no build-phase check). An empty second slot takes it (the active slot stays: D9); the
 * same weapon carried below `level` becomes `level` with a full magazine (D10); both slots full →
 * the ACTIVE slot is replaced by a fresh slot at `level` (its upgrades are lost; reload and swap
 * cancelled: D8). Refused (−1) when already carried at `level` or higher (G7). Emits
 * `weapon.crate_taken`. Returns the slot, or −1.
 */
export function giveCrateWeapon(world: World, playerId: string, weapon: WeaponId, level: number): -1 | 0 | 1 {
  const p = world.players.get(playerId);
  if (!p) return -1;
  const lo = p.loadout;
  const o = crateOutcome(lo, weapon, level, crateOut);
  if (o.slot < 0) return -1;
  const slot = o.slot as 0 | 1;
  const fresh = createSlot(world.balance, weapon);
  fresh.level = level;
  if (o.how === "upgrade") {
    const s = lo.slots[slot] as WeaponSlot;
    s.level = level;
    s.ammo = fresh.ammo;
    s.reloadTicks = 0;
  } else {
    lo.slots[slot] = fresh;
    if (o.how === "replace") lo.swapTicks = 0;
  }
  world.events.emit({ type: "weapon.crate_taken", playerId, weapon, slot, level });
  // Story 7.4 (K7, AC 9): given whatever the mask; a weapon outside the taker's pool is remembered for Results.
  if (!inPool(p.unlocks, weapon)) p.lockedUsed = unlockIndexOf(weapon);
  return slot;
}
