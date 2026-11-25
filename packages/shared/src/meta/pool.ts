/**
 * Story 7.3 (AC 2, 3; designer D4, D5): what a player owns, from the starter pool (`progression.json`) and the unlock
 * ids saved on the server. Pure; shared by the server (7.4 reads the pool at run start) and the Progress hub.
 *
 * Unlocks change CHOICE, never power (brief 22): these helpers only say which items a player may see in the shop.
 */
import type { Balance } from "../config/balance";
import { MAX_UNLOCKS, PROGRESSION, UNLOCK_CATEGORIES, type Progression, type UnlockCategory } from "../config/progression";

type Prog = Pick<Readonly<Progression>, "starterPool" | "unlocks">;

/** The items a player owns: the starter pool plus every item of each known unlock id (unknown ids are ignored). */
export function poolOf(progression: Prog, unlockIds: readonly string[]): Set<string> {
  const pool = new Set<string>(progression.starterPool);
  const owned = new Set(unlockIds);
  for (const u of progression.unlocks) {
    if (!owned.has(u.id)) continue;
    for (const item of u.items) pool.add(item);
  }
  return pool;
}

/**
 * The unlocks as a 32-bit mask (bit i = the i-th unlock in file order) for 7.4's run-start options; unknown ids are
 * ignored. The schema caps the list at `MAX_UNLOCKS` (32), so every bit fits; `>>> 0` keeps it unsigned.
 */
export function unlockMask(progression: Prog, unlockIds: readonly string[]): number {
  const owned = new Set(unlockIds);
  let mask = 0;
  progression.unlocks.forEach((u, i) => {
    if (i < MAX_UNLOCKS && owned.has(u.id)) mask |= 1 << i;
  });
  return mask >>> 0;
}

/** Which hub category each balance item is in: weapons, gear, building types, consumables. */
export function itemCategories(balance: Pick<Balance, "weapons" | "gear" | "buildings" | "consumables">): Map<string, UnlockCategory> {
  const m = new Map<string, UnlockCategory>();
  for (const id of Object.keys(balance.weapons)) m.set(id, "weapon");
  for (const id of Object.keys(balance.buildings.types)) m.set(id, "building");
  for (const id of Object.keys(balance.gear.items)) m.set(id, "gear");
  for (const id of Object.keys(balance.consumables.items)) m.set(id, "consumable");
  return m;
}

/** Owned items per category (starter pool included, decision 7.3 D1). */
export function ownedPerCategory(pool: ReadonlySet<string>, categories: ReadonlyMap<string, UnlockCategory>): Record<UnlockCategory, number> {
  const n: Record<UnlockCategory, number> = { weapon: 0, building: 0, gear: 0, consumable: 0 };
  for (const item of pool) {
    const c = categories.get(item);
    if (c !== undefined) n[c] += 1;
  }
  return n;
}

/**
 * "Good next pick" (D5, decision 7.3 D1): among the categories with something still locked, the one where I own the
 * fewest items (starter pool included); ties go to the category whose cheapest locked unlock is cheapest, then to
 * list order. The pick is that category's cheapest locked unlock (list order on a price tie). Null when everything is
 * bought. A new player gets the Spike trap (100).
 */
export function goodNextPick(progression: Prog, unlockIds: readonly string[], categories: ReadonlyMap<string, UnlockCategory>): string | null {
  const owned = new Set(unlockIds);
  const counts = ownedPerCategory(poolOf(progression, unlockIds), categories);
  let best: { id: string; price: number; index: number; owned: number } | null = null;
  for (const cat of UNLOCK_CATEGORIES) {
    let cheapest: { id: string; price: number; index: number } | null = null;
    progression.unlocks.forEach((u, index) => {
      if (u.category !== cat || owned.has(u.id)) return;
      if (cheapest === null || u.price < cheapest.price) cheapest = { id: u.id, price: u.price, index };
    });
    if (cheapest === null) continue;
    const c: { id: string; price: number; index: number } = cheapest;
    const cand = { ...c, owned: counts[cat] };
    if (
      best === null ||
      cand.owned < best.owned ||
      (cand.owned === best.owned && (cand.price < best.price || (cand.price === best.price && cand.index < best.index)))
    ) {
      best = cand;
    }
  }
  return best?.id ?? null;
}

// ---------------------------------------------------------------------------------------------------------------
// Story 7.4: the unlock mask in a run (`PlayerState.unlocks`, bit i = `progression.json › unlocks[i]`)
// ---------------------------------------------------------------------------------------------------------------

/** Story 7.4 (AC 1): every bit set: tests, bots and sims default to it (bots keep buying their shopping list). */
export const ALL_UNLOCKED = 0xffffffff >>> 0;
/** Story 7.4: the starter pool only (a new player, a failed read at Start: decision 7.4 D3). */
export const STARTER_ONLY = 0;

const needCache = new WeakMap<object, ReadonlyMap<string, number>>();

/**
 * Story 7.4 (AC 3): the unlock bit an item needs (0 = starter item, or an item no unlock lists: always available).
 * Cached per progression object; read at build start, on a buy and on a placement only.
 */
export function itemNeedBits(progression: Prog = PROGRESSION): ReadonlyMap<string, number> {
  let m = needCache.get(progression);
  if (!m) {
    const built = new Map<string, number>();
    progression.unlocks.forEach((u, i) => {
      if (i >= MAX_UNLOCKS) return;
      for (const item of u.items) built.set(item, ((built.get(item) ?? 0) | (1 << i)) >>> 0);
    });
    for (const item of progression.starterPool) built.set(item, 0);
    m = built;
    needCache.set(progression, m);
  }
  return m;
}

/** Story 7.4: `item` is in the pool of a player with `mask` (allocation-free once cached). */
export function inPool(mask: number, item: string, progression: Prog = PROGRESSION): boolean {
  const need = itemNeedBits(progression).get(item) ?? 0;
  return need === 0 || (mask & need) !== 0;
}

/** Story 7.4 (AC 9): the index of the unlock that holds `item` (255 = a starter item or none): `PlayerState.lockedUsed`. */
export function unlockIndexOf(item: string, progression: Prog = PROGRESSION): number {
  const i = progression.unlocks.findIndex((u) => u.items.includes(item));
  return i < 0 ? NO_UNLOCK : i;
}

/** Story 7.4: "no unlock" in a u8 (`PlayerState.lockedUsed`). */
export const NO_UNLOCK = 255;

/**
 * Story 7.4 (K5): the items of `list` (the build bar's buildings, the always-available consumables) in the pool of a
 * player with `mask`, in list order. Unlocked buildings and consumables are never borrowed. Allocates (UI, on change).
 */
export function inPoolOnly<T extends { readonly id: string }>(list: readonly T[], mask: number, progression: Prog = PROGRESSION): T[] {
  return list.filter((x) => inPool(mask, x.id, progression));
}
