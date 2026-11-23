import type { Balance } from "../config/balance";
import type { World } from "../core/world";
import { buildingStats, cornerForCentre, ownedCount, placeBuilding } from "../buildings/buildings";
import { buyWeapon, shopPrice, upgradeWeapon } from "../economy/shop";
import { upgradePrice } from "../combat/weapons";
import { armorTier, gearBit, shopGear } from "../economy/gear";
import { buyItem } from "../economy/shop";
import { setBuildReady } from "../run/runStateMachine";
import type { BuildCommand } from "../replay/inputLog";

/**
 * Story 3.10: the bots' build-phase shopping (the Story 2.10 `bots.json › shoppingList` hook), shared
 * by headless runs (`botBuildPhase`) and `tools/bots` over the wire (the pure helpers). Deterministic;
 * runs once per build phase, so the small objects it uses are not a per-tick cost.
 *
 * The list is walked in order:
 * - a weapon the bot holds → next entry; affordable → buy it (the empty second slot first, else it
 *   replaces the slot **not** in hands) and swap to it; too dear → **stop** (the bot saves up for it);
 * - a building type: its k-th entry in the list means "own k of that type"; owned enough → next;
 *   affordable → place it on the first candidate spot the rules accept (`botPlaceCandidate`); no spot
 *   (or the 6-building cap) → next; too dear → stop;
 * - Story 5.1: `upgrade:<weapon>`: its k-th entry in the list means "hold that weapon at level ≥ k + 1";
 *   not held, or already that high (or at the max level) → next; affordable → upgrade it; too dear → stop;
 * - Story 5.11: a gear id (`gear.json`, in the shop): owned (or an armor tier ≤ the owned one) → next;
 *   affordable → buy it (`buyItem`, the `shop.buy_item` rules); too dear → stop;
 * - an id the shop doesn't sell → next.
 */

/** Story 5.1: the shopping-list prefix of a weapon upgrade (`upgrade:smg`). */
export const UPGRADE_ENTRY_PREFIX = "upgrade:";

/** The weapon of an `upgrade:<weapon>` entry, or null for any other entry. */
export function upgradeEntryWeapon(entry: string): string | null {
  return entry.startsWith(UPGRADE_ENTRY_PREFIX) ? entry.slice(UPGRADE_ENTRY_PREFIX.length) : null;
}

/** What the shopping rules need to know about the bot (from a World or from net state). */
export interface BotShopSelf {
  wallet: number;
  weapon0: string;
  /** "" = empty second slot. */
  weapon1: string;
  active: number;
  /** Story 5.1: the slots' upgrade levels (absent = I). */
  level0?: number;
  level1?: number;
  /** Story 5.11: the owned-gear mask (absent = none). */
  gear?: number;
}

/** Story 5.11: the shop price of gear `id` if the shop sells it (listed: `inShop`), else null. */
export function botGearPrice(balance: Balance, id: string): number | null {
  for (const g of shopGear(balance)) if (g.id === id) return g.price;
  return null;
}

/** Story 5.11: the bot already has gear `id` (or a higher armor tier covers it). */
export function botOwnsGear(balance: Balance, gear: number, id: string): boolean {
  const bit = gearBit(balance, id);
  if (bit === 0) return false;
  if ((gear & bit) !== 0) return true;
  const tier = balance.gear.items[id]?.armorTier ?? 0;
  return tier > 0 && armorTier(balance, gear) >= tier;
}

/**
 * Index of the next list entry to buy, or -1 (nothing more this build phase). `owned(type)` counts
 * the bot's buildings of a type; `skip` has bit i set for entries already tried and failed in this
 * build phase (no spot, refused). Entries past index 30 are not considered.
 */
export function botShopNext(
  balance: Balance,
  self: Readonly<BotShopSelf>,
  owned: (buildingType: string) => number,
  list: readonly string[],
  skip = 0,
): number {
  const n = Math.min(list.length, 31);
  for (let i = 0; i < n; i++) {
    if ((skip & (1 << i)) !== 0) continue;
    const id = list[i] as string;
    const up = upgradeEntryWeapon(id);
    if (up !== null) {
      const level = self.weapon0 === up ? (self.level0 ?? 1) : self.weapon1 === up ? (self.level1 ?? 1) : 0;
      if (level === 0 || !(up in balance.weapons)) continue; // not held: nothing to upgrade
      let want = 1;
      for (let k = 0; k <= i; k++) if (list[k] === id) want++;
      if (level >= want || level >= balance.shop.upgrades.maxLevel) continue;
      if (upgradePrice(balance, up) > self.wallet) return -1;
      return i;
    }
    const gearPrice = botGearPrice(balance, id); // Story 5.11
    if (gearPrice !== null) {
      if (botOwnsGear(balance, self.gear ?? 0, id)) continue;
      if (gearPrice > self.wallet) return -1;
      return i;
    }
    const weaponPrice = shopPrice(balance, id);
    if (weaponPrice !== null) {
      if (self.weapon0 === id || self.weapon1 === id) continue;
      if (weaponPrice > self.wallet) return -1;
      return i;
    }
    const stats = buildingStats(balance, id);
    if (!stats) continue;
    let want = 0;
    for (let k = 0; k <= i; k++) if (list[k] === id) want++;
    if (owned(id) >= want) continue;
    if (stats.price > self.wallet) return -1;
    return i;
  }
  return -1;
}

/** The slot a bought weapon goes into: null when the second slot is empty (it fills that), else the slot not in hands. */
export function botWeaponSlot(self: Readonly<BotShopSelf>): 0 | 1 | null {
  if (self.weapon1 === "") return null;
  return self.active === 0 ? 1 : 0;
}

/** Candidate spots per radius (8 directions). */
const DIRECTIONS = 8;

/** Number of candidate spots `botPlaceCandidate` offers for this balance. */
export function botPlaceTries(balance: Balance): number {
  return DIRECTIONS * balance.bots.buildRadiiM.length;
}

/**
 * The `attempt`-th candidate spot for a building of `type` around a bot at (x, y): 8 directions
 * (east first, then every 45° counter-clockwise… in +y-down screen terms: E, SE, S, …) at each of
 * `bots.json › buildRadiiM`, rotated so its long side faces the bot. Writes the min corner and the
 * rotation into `out`; false when `attempt` is past the last candidate or the type is unknown.
 */
export function botPlaceCandidate(
  balance: Balance,
  type: string,
  x: number,
  y: number,
  attempt: number,
  out: { gx: number; gy: number; rot: number },
): boolean {
  const stats = buildingStats(balance, type);
  const radii = balance.bots.buildRadiiM;
  if (!stats || attempt < 0 || attempt >= DIRECTIONS * radii.length) return false;
  const r = radii[Math.floor(attempt / DIRECTIONS)] as number;
  const k = attempt % DIRECTIONS;
  const a = (k * Math.PI * 2) / DIRECTIONS;
  const dx = Math.cos(a);
  const dy = Math.sin(a);
  // East or west of the bot: turn it (rotation 1 swaps width and depth) so the long side faces the bot.
  const rot = Math.abs(dx) > Math.abs(dy) + 1e-9 ? 1 : 0;
  cornerForCentre(stats, rot, x + dx * r, y + dy * r, out);
  out.rot = rot;
  return true;
}

/** What one build phase's shopping did (headless runs). */
export interface BotShopResult {
  /** The last weapon bought is in the slot not in hands: swap to it on the next input. */
  swap: boolean;
  weapons: number;
  /** Story 5.1: weapon upgrades bought. */
  upgrades: number;
  /** Story 5.11: gear items bought. */
  gear: number;
  buildings: number;
  spent: number;
  /** The weapons bought (and Story 5.1 `upgrade:<weapon>` entries, Story 5.11 gear ids), in order (for the sim's log). */
  readonly bought: string[];
}

export function createBotShopResult(): BotShopResult {
  return { swap: false, weapons: 0, upgrades: 0, gear: 0, buildings: 0, spent: 0, bought: [] };
}

/**
 * Headless bots (sims, Story 3.10): one build phase's shopping for `playerId` through the real
 * `buyWeapon` / `placeBuilding` rules, then Ready (`ready`, default true). Call it once, on a tick in
 * the build phase. Resets and fills `out`. Story 4.4: `record` receives every action that changed
 * the World (buy, place, Ready), in order, for the replay's input log.
 */
export function botBuildPhase(
  world: World,
  playerId: string,
  list: readonly string[],
  out: BotShopResult,
  ready = true,
  record?: (cmd: BuildCommand) => void,
): BotShopResult {
  out.swap = false;
  out.weapons = 0;
  out.upgrades = 0;
  out.gear = 0;
  out.buildings = 0;
  out.spent = 0;
  out.bought.length = 0;
  const p = world.players.get(playerId);
  if (!p || world.run.phase !== "build") return out;
  const balance = world.balance;
  const self: BotShopSelf = { wallet: 0, weapon0: "", weapon1: "", active: 0, level0: 1, level1: 1, gear: 0 };
  const owned = (type: string): number => {
    let n = 0;
    for (const b of world.buildings.list) if (b.ownerId === playerId && b.type === type) n++;
    return n;
  };
  const spot = { gx: 0, gy: 0, rot: 0 };
  let skip = 0;
  // The slot the bot will hold once it has swapped to what it bought (a second purchase replaces the other one).
  let hands: number = p.loadout.active;
  for (let guard = 0; guard < 64; guard++) {
    self.wallet = p.wallet;
    self.weapon0 = p.loadout.slots[0].weapon;
    self.weapon1 = p.loadout.slots[1]?.weapon ?? "";
    self.active = hands;
    self.level0 = p.loadout.slots[0].level;
    self.level1 = p.loadout.slots[1]?.level ?? 1;
    self.gear = p.gear;
    const i = botShopNext(balance, self, owned, list, skip);
    if (i < 0) break;
    const id = list[i] as string;
    const before = p.wallet;
    const up = upgradeEntryWeapon(id);
    if (up !== null) {
      // Story 5.1: the same `upgradeWeapon` the shop's Upgrade row runs.
      if (!upgradeWeapon(world, playerId, up).ok) {
        skip |= 1 << i;
        continue;
      }
      record?.({ kind: "upgrade", playerId, weapon: up });
      out.upgrades++;
      out.bought.push(id);
    } else if (botGearPrice(balance, id) !== null) {
      // Story 5.11: the same `buyItem` the shop's Gear row runs (`shop.buy_item`).
      if (!buyItem(world, playerId, id).ok) {
        skip |= 1 << i;
        continue;
      }
      record?.({ kind: "item", playerId, item: id });
      out.gear++;
      out.bought.push(id);
    } else if (shopPrice(balance, id) !== null) {
      const slot = botWeaponSlot(self);
      const r = buyWeapon(world, playerId, id, slot);
      if (!r.ok) {
        skip |= 1 << i;
        continue;
      }
      record?.({ kind: "buy", playerId, weapon: id, slot });
      out.weapons++;
      out.bought.push(id);
      hands = r.value.slot;
    } else {
      let placed = false;
      if (ownedCount(world, playerId) < balance.buildings.maxPerPlayer) {
        for (let a = 0; botPlaceCandidate(balance, id, p.x, p.y, a, spot); a++) {
          if (placeBuilding(world, playerId, { type: id, gx: spot.gx, gy: spot.gy, rot: spot.rot }).ok) {
            record?.({ kind: "place", playerId, type: id, gx: spot.gx, gy: spot.gy, rot: spot.rot });
            placed = true;
            break;
          }
        }
      }
      if (!placed) {
        skip |= 1 << i;
        continue;
      }
      out.buildings++;
    }
    out.spent += before - p.wallet;
  }
  out.swap = hands !== p.loadout.active;
  if (ready) {
    setBuildReady(world, playerId, true);
    record?.({ kind: "ready", playerId, ready: true });
  }
  return out;
}
