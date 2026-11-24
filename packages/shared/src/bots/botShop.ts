import type { Balance } from "../config/balance";
import type { World } from "../core/world";
import { buildingStats, cornerForCentre, ownedCount, placeBuilding } from "../buildings/buildings";
import { upgradeWeapon } from "../economy/shop";
import { buyCard, cardItem, cardPrice, offerFor, reroll, rerollPrice, type ShopOfferView } from "../economy/shopCards";
import { upgradePrice } from "../combat/weapons";
import { armorTier, gearBit } from "../economy/gear";
import { buyItem } from "../economy/shop";
import { consumableStats, isConsumable } from "../economy/consumables";
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
 *   affordable → buy it; too dear → stop;
 * - Story 5.13: weapons and gear are cards: an entry not on the bot's current offer (unsold) → next;
 * - an id the shop doesn't sell → next. The end of the list returns `BOT_LIST_DONE` (−2), a "save up"
 *   stop −1.
 *
 * Story 5.13 (`botBuildPhase`): after the list, a bot with nothing left to save for buys the
 * cheapest affordable card it can use (gear; a weapon only into an empty slot), then rerolls (at
 * most `bots.maxRerollsPerBuild`) while nothing it wants is on offer and its wallet covers the
 * reroll plus the cheapest wanted card, and walks the list again.
 */

/** Story 5.13: `botShopNext` reached the end of the list (nothing to save up for). */
export const BOT_LIST_DONE = -2;

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
  /** Story 5.12: the consumable slot (absent = empty). */
  consumable?: string | null;
  consumableCount?: number;
}

/** Story 5.11: the list price of gear `id` if the shop sells it (a card item), else null. */
export function botGearPrice(balance: Balance, id: string): number | null {
  const it = cardItem(balance, id);
  return it && it.kind === "gear" ? it.basePrice : null;
}

/** Story 5.13: the index of an unsold card showing `id` in `offer`, or -1. */
export function botCardIndex(offer: Readonly<ShopOfferView> | null, id: string): number {
  if (!offer) return -1;
  for (let c = 0; c < offer.cards.length; c++) if (offer.cards[c] === id && (offer.sold & (1 << c)) === 0) return c;
  return -1;
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
  offer: Readonly<ShopOfferView> | null = null,
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
    const cons = consumableStats(balance, id); // Story 5.12: fill / refill the slot (a full one: skip)
    if (cons && cons.inShop) {
      if (self.consumable === id && (self.consumableCount ?? 0) >= cons.pack) continue;
      if (cons.price > self.wallet) return -1;
      return i;
    }
    const card = cardItem(balance, id); // Story 5.13: weapons and gear are cards
    if (card) {
      if (card.kind === "gear" ? botOwnsGear(balance, self.gear ?? 0, id) : self.weapon0 === id || self.weapon1 === id) continue;
      if (botCardIndex(offer, id) < 0) continue; // not on my offer this time
      if ((cardPrice(balance, id, offer?.build ?? 0) ?? 0) > self.wallet) return -1;
      return i;
    }
    if (id in balance.weapons) continue; // the Pistol (never a card)
    const stats = buildingStats(balance, id);
    if (!stats) continue;
    let want = 0;
    for (let k = 0; k <= i; k++) if (list[k] === id) want++;
    if (owned(id) >= want) continue;
    if (stats.price > self.wallet) return -1;
    return i;
  }
  return BOT_LIST_DONE;
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
  /** Story 5.13: cards bought (weapons + gear) and paid rerolls (and what they cost). */
  cards: number;
  rerolls: number;
  rerollSpent: number;
  buildings: number;
  spent: number;
  /** The weapons bought (and Story 5.1 `upgrade:<weapon>` entries, Story 5.11 gear ids), in order (for the sim's log). */
  readonly bought: string[];
}

export function createBotShopResult(): BotShopResult {
  return { swap: false, weapons: 0, upgrades: 0, gear: 0, cards: 0, rerolls: 0, rerollSpent: 0, buildings: 0, spent: 0, bought: [] };
}

/** Story 5.13: the cheapest card on `offer` the bot can use now (gear it lacks; a weapon only into an empty slot) and afford, or -1. */
function cheapestUsableCard(balance: Balance, self: Readonly<BotShopSelf>, offer: Readonly<ShopOfferView>): number {
  let best = -1;
  let bestPrice = Infinity;
  for (let c = 0; c < offer.cards.length; c++) {
    const id = offer.cards[c] as string;
    if (id === "" || (offer.sold & (1 << c)) !== 0) continue;
    const it = cardItem(balance, id);
    if (!it) continue;
    if (it.kind === "gear" ? botOwnsGear(balance, self.gear ?? 0, id) : self.weapon1 !== "" || self.weapon0 === id) continue;
    const price = cardPrice(balance, id, offer.build) ?? Infinity;
    if (price <= self.wallet && price < bestPrice) {
      best = c;
      bestPrice = price;
    }
  }
  return best;
}

/**
 * Story 5.13: the cheapest card item the bot still wants (a list weapon/gear it lacks; with the
 * list done, any gear it lacks or a weapon for an empty slot), or Infinity.
 */
function cheapestWanted(balance: Balance, self: Readonly<BotShopSelf>, list: readonly string[], listDone: boolean, build: number): number {
  let best = Infinity;
  const consider = (id: string): void => {
    const it = cardItem(balance, id);
    if (!it) return;
    if (it.kind === "gear" ? botOwnsGear(balance, self.gear ?? 0, id) : self.weapon0 === id || self.weapon1 === id) return;
    if (it.kind === "weapon" && listDone && !list.includes(id) && self.weapon1 !== "") return;
    best = Math.min(best, cardPrice(balance, id, build) ?? Infinity);
  };
  for (const id of list) consider(id);
  if (listDone) for (const id of Object.keys(balance.gear.items)) consider(id);
  if (listDone && self.weapon1 === "") for (const id of Object.keys(balance.weapons)) consider(id);
  return best;
}

/**
 * Headless bots (sims, Story 3.10): one build phase's shopping for `playerId` through the real
 * `buyCard` / `reroll` / `upgradeWeapon` / `buyItem` / `placeBuilding` rules, then Ready (`ready`,
 * default true). Call it once, on a tick in the build phase. Resets and fills `out`. Story 4.4:
 * `record` receives every action that changed the World (card, reroll, place, Ready…), in order,
 * for the replay's input log.
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
  out.cards = 0;
  out.rerolls = 0;
  out.rerollSpent = 0;
  out.buildings = 0;
  out.spent = 0;
  out.bought.length = 0;
  const p = world.players.get(playerId);
  if (!p || world.run.phase !== "build") return out;
  const balance = world.balance;
  const self: BotShopSelf = { wallet: 0, weapon0: "", weapon1: "", active: 0, level0: 1, level1: 1, gear: 0, consumable: null, consumableCount: 0 };
  const owned = (type: string): number => {
    let n = 0;
    for (const b of world.buildings.list) if (b.ownerId === playerId && b.type === type) n++;
    return n;
  };
  const spot = { gx: 0, gy: 0, rot: 0 };
  // The slot the bot will hold once it has swapped to what it bought (a second purchase replaces the other one).
  let hands: number = p.loadout.active;
  const refresh = (): void => {
    self.wallet = p.wallet;
    self.weapon0 = p.loadout.slots[0].weapon;
    self.weapon1 = p.loadout.slots[1]?.weapon ?? "";
    self.active = hands;
    self.level0 = p.loadout.slots[0].level;
    self.level1 = p.loadout.slots[1]?.level ?? 1;
    self.gear = p.gear;
    self.consumable = p.consumable; // Story 5.12
    self.consumableCount = p.consumableCount;
  };
  // Story 5.13: buy card `c` of `offer`; true on success.
  const takeCard = (offer: ShopOfferView, c: number): boolean => {
    const id = offer.cards[c] as string;
    const it = cardItem(balance, id);
    if (!it) return false;
    const slot = it.kind === "weapon" ? botWeaponSlot(self) : null;
    const before = p.wallet;
    const r = buyCard(world, playerId, offer.build, offer.rev, c, id, slot);
    if (!r.ok) return false;
    record?.({ kind: "buyCard", playerId, build: offer.build, rev: offer.rev, card: c, item: id, slot });
    out.cards++;
    if (it.kind === "weapon") {
      out.weapons++;
      if (r.value.slot !== null) hands = r.value.slot;
    } else out.gear++;
    out.bought.push(id);
    out.spent += before - p.wallet;
    return true;
  };
  for (let pass = 0; pass <= balance.bots.maxRerollsPerBuild; pass++) {
    let skip = 0;
    let done = false;
    for (let guard = 0; guard < 64; guard++) {
      refresh();
      const offer = offerFor(world, playerId);
      const i = botShopNext(balance, self, owned, list, skip, offer);
      if (i < 0) {
        done = i === BOT_LIST_DONE;
        break;
      }
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
      } else if (isConsumable(balance, id)) {
        // Story 5.12: the same `buyItem` the shop's Consumables row runs.
        if (!buyItem(world, playerId, id).ok) {
          skip |= 1 << i;
          continue;
        }
        record?.({ kind: "item", playerId, item: id });
        out.bought.push(id);
      } else if (cardItem(balance, id)) {
        // Story 5.13: the card on my offer (botShopNext found it unsold).
        if (!offer || !takeCard(offer, botCardIndex(offer, id))) skip |= 1 << i;
        continue;
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
    // Story 5.13: nothing left to save for: the cheapest usable card (a saving bot keeps its money).
    let offer = offerFor(world, playerId);
    if (!offer) break;
    if (done) {
      for (let c = cheapestUsableCard(balance, self, offer); c >= 0; c = cheapestUsableCard(balance, self, offer)) {
        if (!takeCard(offer, c)) break;
        refresh();
        offer = offerFor(world, playerId) as ShopOfferView;
      }
    }
    refresh();
    // Then maybe a reroll: a wanted card (a list item it lacks; with the list done, anything usable)
    // is not on offer, and the wallet covers the reroll plus the cheapest of them.
    if (pass === balance.bots.maxRerollsPerBuild || !offer.canReroll) break;
    const price = rerollPrice(balance, offer.rev);
    if (self.wallet < price + cheapestWanted(balance, self, list, done, offer.build)) break;
    const before = p.wallet;
    if (!reroll(world, playerId, offer.build, offer.rev).ok) break;
    record?.({ kind: "reroll", playerId, build: offer.build, rev: offer.rev });
    out.rerolls++;
    out.rerollSpent += before - p.wallet;
    out.spent += before - p.wallet;
  }
  out.swap = hands !== p.loadout.active;
  if (ready) {
    setBuildReady(world, playerId, true);
    record?.({ kind: "ready", playerId, ready: true });
  }
  return out;
}
