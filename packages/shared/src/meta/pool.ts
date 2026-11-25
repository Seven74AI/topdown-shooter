/**
 * Story 7.3 (AC 2, 3; designer D4, D5): what a player owns, from the starter pool (`progression.json`) and the unlock
 * ids saved on the server. Pure; shared by the server (7.4 reads the pool at run start) and the Progress hub.
 *
 * Unlocks change CHOICE, never power (brief 22): these helpers only say which items a player may see in the shop.
 */
import type { Balance } from "../config/balance";
import { MAX_UNLOCKS, UNLOCK_CATEGORIES, type Progression, type UnlockCategory } from "../config/progression";

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
