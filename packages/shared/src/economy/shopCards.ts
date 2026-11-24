import type { Balance } from "../config/balance";
import { err, ok, type Result } from "../core/result";
import type { World } from "../core/world";
import { buildPhaseIndex, shopStream } from "../core/seedStreams";
import { createSlot } from "../combat/loadout";
import type { PlayerState } from "../player/player";
import { MAX_PLAYERS } from "../net/messages";
import { spendMoney } from "./economy";
import { armorTier, buyGearAt, gearBit } from "./gear";
import { owns, titleCase, type ShopError } from "./shop";
import { MAX_CARDS, NO_CARD } from "./shopOffers";

/**
 * Story 5.13: the roguelike card shop (FR46, FR47, FR65). Each build phase every player gets their
 * own offer of `shop.json › cards` (6) weapon and gear cards, drawn once at the build start from
 * their own stream `shop:<slot>:<build>` (`shopStream`) and stored in `world.shop`. Only a paid
 * Reroll (`rev + 1`) changes it; a bought card is "Sold" and never refills.
 *
 * Fairness rules (story F1–F9): offers are per slot (a teammate's actions never touch my stream or
 * offer); a buy or reroll names the build and `rev` it saw (`stale_offer` otherwise) and the card's
 * index and item (`not_in_offer` otherwise); the price charged is `cardPrice` / `rerollPrice`, the
 * functions the UI shows; draw weights come only from `shop.json › rarity`.
 *
 * The draw allocates nothing (preallocated scratch); it runs only at a build start and on a reroll.
 *
 * Epic 8 (slot reuse, 4.4 review L2): on a slot reassignment inside a build phase set
 * `world.streams.shop[slot].buildPhaseIndex = -1` **and** `world.shop.build[slot] = -1`.
 */

export type CardKind = "weapon" | "gear";

/** One card item of the catalog (cached, frozen). */
export interface CardItem {
  readonly id: string;
  readonly kind: CardKind;
  readonly name: string;
  /** The item's balance price (`weapons.json` / `gear.json`); a card shows `cardPrice`. */
  readonly basePrice: number;
  /** Rarity tier id (`shop.json › rarity`, by base price: D2) and its index (0 = common). */
  readonly rarity: string;
  readonly rarityIndex: number;
  /** Draw weight (the tier's `weight`). */
  readonly weight: number;
}

interface Catalog {
  readonly items: readonly CardItem[];
  readonly indexOf: ReadonlyMap<string, number>;
  /** Gear mask bit per catalog index (0 for weapons). */
  readonly bit: readonly number[];
  /** Armor tier per catalog index (0 = not armor). */
  readonly tier: readonly number[];
}

const catalogs = new WeakMap<Balance, Catalog>();

function rarityOf(balance: Balance, price: number): number {
  const tiers = balance.shop.rarity;
  for (let i = 0; i < tiers.length; i++) {
    const max = (tiers[i] as { maxPrice: number | null }).maxPrice;
    if (max === null || price <= max) return i;
  }
  return tiers.length - 1;
}

function catalog(balance: Balance): Catalog {
  let c = catalogs.get(balance);
  if (!c) {
    const exclude = new Set(balance.shop.excludeFromCards);
    const items: CardItem[] = [];
    const bit: number[] = [];
    const tier: number[] = [];
    const add = (id: string, kind: CardKind, name: string, price: number, gBit: number, aTier: number): void => {
      const r = rarityOf(balance, price);
      const t = balance.shop.rarity[r] as { id: string; weight: number };
      items.push(Object.freeze({ id, kind, name, basePrice: price, rarity: t.id, rarityIndex: r, weight: t.weight }));
      bit.push(gBit);
      tier.push(aTier);
    };
    for (const [id, w] of Object.entries(balance.weapons)) if (!exclude.has(id)) add(id, "weapon", w.name ?? titleCase(id), w.price, 0, 0);
    for (const [id, g] of Object.entries(balance.gear.items)) {
      if (exclude.has(id) || !g.inShop) continue; // Stories 5.10/5.11: `inShop: false` is never drawn (dev: `shopAll`)
      add(id, "gear", g.name, g.price, gearBit(balance, id), g.armorTier ?? 0);
    }
    if (items.length >= NO_CARD) throw new Error("cardCatalog: too many card items for a uint8 index");
    const indexOf = new Map<string, number>();
    items.forEach((it, i) => indexOf.set(it.id, i));
    c = Object.freeze({ items: Object.freeze(items), indexOf, bit, tier });
    catalogs.set(balance, c);
  }
  return c;
}

/** Story 5.13: every card item in a fixed order (weapons in `weapons.json` order, then gear); cached per balance. */
export function cardCatalog(balance: Balance): readonly CardItem[] {
  return catalog(balance).items;
}

/** Story 5.13: the catalog entry of `id`, or undefined when it is not a card item. */
export function cardItem(balance: Balance, id: string): CardItem | undefined {
  const c = catalog(balance);
  const i = c.indexOf.get(id);
  return i === undefined ? undefined : c.items[i];
}

/** Story 5.13 (F9): the price a card of `item` shows and charges in build phase `build` (integer; null: not a card item). */
export function cardPrice(balance: Balance, item: string, build: number): number | null {
  const it = cardItem(balance, item);
  if (!it) return null;
  const scale = balance.shop.priceScalePerBuild;
  return scale === 0 ? it.basePrice : Math.round(it.basePrice * (1 + scale * Math.max(0, build)));
}

/** Story 5.13 (F3, F9): the price of the next reroll after `rerollsThisBuild` rerolls (integer). */
export function rerollPrice(balance: Balance, rerollsThisBuild: number): number {
  return balance.shop.reroll.price + balance.shop.reroll.stepPerReroll * Math.max(0, rerollsThisBuild);
}

/** Story 5.13: a player id's slot (`"p<N>"` → N; solo `"local"` → 0); -1 when it has none. */
export function slotOf(playerId: string): number {
  if (playerId === "local") return 0;
  if (playerId.length === 2 && playerId.charCodeAt(0) === 112 /* p */) {
    const n = playerId.charCodeAt(1) - 48;
    if (n >= 0 && n < MAX_PLAYERS) return n;
  }
  return -1;
}

/** Story 5.13: the player already has catalog item `i` (a weapon in a slot; owned gear; armor ≤ the owned tier). */
function ownsIndex(balance: Balance, c: Catalog, p: Readonly<PlayerState>, i: number): boolean {
  const it = c.items[i] as CardItem;
  if (it.kind === "weapon") return owns(p.loadout, it.id);
  const bit = c.bit[i] as number;
  if ((p.gear & bit) !== 0) return true;
  const t = c.tier[i] as number;
  return t > 0 && armorTier(balance, p.gear) >= t;
}

/** Story 5.13: the player already has card item `id` (the shop shows "Owned"). */
export function ownsCardItem(balance: Balance, p: Readonly<PlayerState>, id: string): boolean {
  const c = catalog(balance);
  const i = c.indexOf.get(id);
  return i !== undefined && ownsIndex(balance, c, p, i);
}

// Draw scratch (one draw at a time; never allocates).
const candidate = new Uint8Array(NO_CARD);
const picked = new Uint8Array(MAX_CARDS);

/**
 * Story 5.13, **the Epic 7 seam** (7.3/7.4 replace it with the player's unlocks): writes 1 into
 * `out[i]` for every catalog index the player may be offered, 0 otherwise. Today: every catalog item.
 */
export function cardPool(world: Readonly<World>, playerId: string, out: Uint8Array): void {
  void playerId;
  const n = catalog(world.balance).items.length;
  for (let i = 0; i < n; i++) out[i] = 1;
}

/** One weighted pick (one `rng.next()`, always) among candidates of `kind` (null = any); -1 when none. */
function pick(c: Catalog, n: number, kind: CardKind | null, r: number): number {
  let total = 0;
  for (let i = 0; i < n; i++) if (candidate[i] === 1 && (kind === null || (c.items[i] as CardItem).kind === kind)) total += (c.items[i] as CardItem).weight;
  if (total === 0) return -1;
  let x = r * total;
  let last = -1;
  for (let i = 0; i < n; i++) {
    if (candidate[i] !== 1 || (kind !== null && (c.items[i] as CardItem).kind !== kind)) continue;
    last = i;
    x -= (c.items[i] as CardItem).weight;
    if (x < 0) return i;
  }
  return last; // float rounding at the very top of the range
}

/** Story 5.13: the slot's offer index base into `world.shop.cards`. */
const base = (slot: number): number => slot * MAX_CARDS;

/**
 * Story 5.13 (AC 2, F6): draws `playerId`'s offer for the current build phase from
 * `shop:<slot>:<build>` into `world.shop` (rev = `rev`, nothing sold). Candidates = `cardPool` minus
 * what the player owns; the floor (`shop.json › floor`: weapons, then gear) is filled first as far
 * as the candidates allow, the rest from both categories; never the same item twice. Exactly
 * `shop.json › cards` `rng.next()` per offer (a slot with no candidate still consumes its draw and
 * stays empty). Stored in catalog order (weapons then gear), empty slots last. Dev
 * (`world.debug.shopCards`): the build-start offer starts with those items (still `cards` draws).
 * Build phase only (`shopStream` throws otherwise).
 */
export function drawOffer(world: World, playerId: string, rev = 0): void {
  const slot = slotOf(playerId);
  const p = world.players.get(playerId);
  if (slot < 0 || !p) return;
  const rng = shopStream(world, slot);
  const balance = world.balance;
  const c = catalog(balance);
  const n = c.items.length;
  const cards = balance.shop.cards;
  cardPool(world, playerId, candidate);
  for (let i = 0; i < n; i++) if (candidate[i] === 1 && ownsIndex(balance, c, p, i)) candidate[i] = 0;
  let k = 0;
  let weapons = 0;
  let gear = 0;
  const forced = rev === 0 ? world.debug.shopCards : null;
  if (forced) {
    for (let f = 0; f < forced.length && k < cards; f++) {
      const i = c.indexOf.get(forced[f] as string);
      if (i === undefined || candidate[i] !== 1) continue;
      candidate[i] = 0;
      picked[k++] = i;
      if ((c.items[i] as CardItem).kind === "weapon") weapons++;
      else gear++;
    }
  }
  const forcedCount = k;
  // A floor category with no candidate left counts as met: the rest come from the other one (7.4 fallback).
  let weaponFloorDone = false;
  let gearFloorDone = false;
  for (let d = 0; d < cards; d++) {
    const r = rng.next();
    if (d < forcedCount) continue; // a forced slot still uses its draw (the stream stays aligned)
    const kind: CardKind | null = !weaponFloorDone && weapons < balance.shop.floor.weapon ? "weapon" : !gearFloorDone && gear < balance.shop.floor.gear ? "gear" : null;
    let i = pick(c, n, kind, r);
    if (i < 0 && kind !== null) {
      if (kind === "weapon") weaponFloorDone = true;
      else gearFloorDone = true;
      i = pick(c, n, null, r);
    }
    if (i < 0) {
      picked[k++] = NO_CARD; // the pool is spent: an empty slot ("—")
      continue;
    }
    candidate[i] = 0;
    picked[k++] = i;
    if ((c.items[i] as CardItem).kind === "weapon") weapons++;
    else gear++;
  }
  // Catalog order, empty slots last (insertion sort over ≤ 6; NO_CARD = 255 sorts last).
  for (let a = 1; a < k; a++) {
    const v = picked[a] as number;
    let b = a - 1;
    while (b >= 0 && (picked[b] as number) > v) {
      picked[b + 1] = picked[b] as number;
      b--;
    }
    picked[b + 1] = v;
  }
  const o = world.shop;
  const at = base(slot);
  for (let j = 0; j < MAX_CARDS; j++) o.cards[at + j] = j < k ? (picked[j] as number) : NO_CARD;
  o.build[slot] = buildPhaseIndex(world);
  o.rev[slot] = rev;
  o.sold[slot] = 0;
}

/** Story 5.13 (AC 2): every player's build-start offer (`startBuild`, after the decay steps). */
export function drawAllOffers(world: World): void {
  for (const id of world.players.keys()) drawOffer(world, id, 0);
}

/**
 * Story 5.13: the player's offer exists for this build (a player added after the build start gets
 * theirs now; the stream is keyed by slot and build, so the cards are the same). False outside a
 * build phase or without a slot.
 */
function ensureOffer(world: World, playerId: string, slot: number): boolean {
  if (world.run.phase !== "build" || slot < 0) return false;
  if (world.shop.build[slot] !== buildPhaseIndex(world)) drawOffer(world, playerId, 0);
  return world.shop.build[slot] === buildPhaseIndex(world);
}

/** Story 5.13: what the client shows of one offer (`shop.offered`; solo reads it from the World). */
export interface ShopOfferView {
  readonly build: number;
  readonly rev: number;
  /** `shop.json › cards` item ids ("" = an empty slot). */
  readonly cards: readonly string[];
  /** Bit c = card c sold. */
  readonly sold: number;
  readonly rerollPrice: number;
  /** A reroll can show something new (F6: false when the pool is spent). */
  readonly canReroll: boolean;
}

/** Story 5.13: a reroll could show an item not on offer now (a candidate exists outside the unsold cards). */
function rerollHasNew(world: Readonly<World>, playerId: string, slot: number): boolean {
  const p = world.players.get(playerId);
  if (!p) return false;
  const balance = world.balance;
  const c = catalog(balance);
  const n = c.items.length;
  cardPool(world, playerId, candidate);
  const at = base(slot);
  const sold = world.shop.sold[slot] as number;
  for (let j = 0; j < MAX_CARDS; j++) {
    const i = world.shop.cards[at + j] as number;
    if (i !== NO_CARD && (sold & (1 << j)) === 0) candidate[i] = 0;
  }
  for (let i = 0; i < n; i++) if (candidate[i] === 1 && !ownsIndex(balance, c, p, i)) return true;
  return false;
}

/**
 * Story 5.13: the player's stored offer for the current build (drawn now if it is missing, e.g. a
 * player added after the build start), or null outside a build phase / without a slot. Allocates
 * (messages and UI on change, never per tick). Never redraws a stored offer (F2).
 */
export function offerFor(world: World, playerId: string): ShopOfferView | null {
  const slot = slotOf(playerId);
  if (!ensureOffer(world, playerId, slot)) return null;
  return readOffer(world, playerId);
}

/** Story 5.13: the stored offer as it is (no draw; null when the slot has none for this build). Solo UI and tests. */
export function readOffer(world: Readonly<World>, playerId: string): ShopOfferView | null {
  const slot = slotOf(playerId);
  if (slot < 0 || world.run.phase !== "build" || world.shop.build[slot] !== buildPhaseIndex(world)) return null;
  const items = catalog(world.balance).items;
  const at = base(slot);
  const out: string[] = [];
  for (let j = 0; j < world.balance.shop.cards; j++) {
    const i = world.shop.cards[at + j] as number;
    out.push(i === NO_CARD ? "" : (items[i] as CardItem).id);
  }
  const rev = world.shop.rev[slot] as number;
  return { build: world.shop.build[slot] as number, rev, cards: out, sold: world.shop.sold[slot] as number, rerollPrice: rerollPrice(world.balance, rev), canReroll: rerollHasNew(world, playerId, slot) };
}

/** What a card purchase did. */
export interface CardBought {
  readonly item: string;
  readonly kind: CardKind;
  readonly card: number;
  readonly price: number;
  /** Weapons: the slot it went into (gear: null). */
  readonly slot: 0 | 1 | null;
}

/**
 * Story 5.13 (AC 5; F4): buys card `card` (showing `item`) of the offer (`build`, `rev`) the player
 * saw. Checks, in order: a build phase, a known player, standing (`not_alive`), the offer's build and
 * rev (`stale_offer`), the card holds `item` and is not sold (`not_in_offer`), not owned
 * (`already_owned`), the slot (weapons: the empty second slot first, else `slot` replaces it;
 * `slot_required`), then the wallet at `cardPrice`. On success the item is given (a weapon full,
 * level I; gear with its 5.11 effects) and the card is sold. On an error nothing changes.
 */
export function buyCard(world: World, playerId: string, build: number, rev: number, card: number, item: string, slot: 0 | 1 | null): Result<CardBought, ShopError> {
  if (world.run.phase !== "build") return err("not_build");
  const p = world.players.get(playerId);
  const s = slotOf(playerId);
  if (!p || s < 0) return err("unknown_player");
  if (p.status !== "alive") return err("not_alive");
  ensureOffer(world, playerId, s);
  if (world.shop.build[s] !== build || world.shop.rev[s] !== rev) return err("stale_offer");
  if (!Number.isInteger(card) || card < 0 || card >= world.balance.shop.cards) return err("not_in_offer");
  const i = world.shop.cards[base(s) + card] as number;
  if (i === NO_CARD || ((world.shop.sold[s] as number) & (1 << card)) !== 0) return err("not_in_offer");
  const c = catalog(world.balance);
  const it = c.items[i] as CardItem;
  if (it.id !== item) return err("not_in_offer");
  if (ownsIndex(world.balance, c, p, i)) return err("already_owned");
  const price = cardPrice(world.balance, item, build) as number;
  let into: 0 | 1 | null = null;
  if (it.kind === "weapon") {
    const lo = p.loadout;
    into = lo.slots[1] === null ? 1 : slot;
    if (into === null) return err("slot_required");
    const paid = spendMoney(world, playerId, price);
    if (!paid.ok) return paid;
    lo.slots[into] = createSlot(world.balance, item); // full magazine, level I (5.1)
  } else {
    const r = buyGearAt(world, playerId, item, price);
    if (!r.ok) return r;
  }
  world.shop.sold[s] = (world.shop.sold[s] as number) | (1 << card);
  return ok({ item, kind: it.kind, card, price, slot: into });
}

/** What a reroll did. */
export interface Rerolled {
  /** The new offer's rev. */
  readonly rev: number;
  readonly price: number;
}

/**
 * Story 5.13 (AC 6; F3): replaces all cards of the offer (`build`, `rev`) with a new draw from the
 * next values of the player's stream (rev + 1, nothing sold). Checks, in order: a build phase, a
 * known player, standing, build and rev (`stale_offer`: a repeat never charges twice), a new card
 * possible (`no_new_cards`, F6), then the wallet at `rerollPrice`. On an error nothing changes.
 */
export function reroll(world: World, playerId: string, build: number, rev: number): Result<Rerolled, ShopError> {
  if (world.run.phase !== "build") return err("not_build");
  const p = world.players.get(playerId);
  const s = slotOf(playerId);
  if (!p || s < 0) return err("unknown_player");
  if (p.status !== "alive") return err("not_alive");
  ensureOffer(world, playerId, s);
  if (world.shop.build[s] !== build || world.shop.rev[s] !== rev) return err("stale_offer");
  if (!rerollHasNew(world, playerId, s)) return err("no_new_cards");
  const price = rerollPrice(world.balance, rev);
  const paid = spendMoney(world, playerId, price);
  if (!paid.ok) return paid;
  drawOffer(world, playerId, rev + 1);
  return ok({ rev: rev + 1, price });
}

/** Story 5.13: `world.shop` as plain data (`snapshotWorld`). */
export function snapshotShop(world: Readonly<World>): { build: number[]; rev: number[]; cards: number[]; sold: number[] } {
  return { build: Array.from(world.shop.build), rev: Array.from(world.shop.rev), cards: Array.from(world.shop.cards), sold: Array.from(world.shop.sold) };
}

/**
 * Story 5.13 dev switch (server `DEV_SHOP_CARDS`, solo `?shopcards=`): `"a,b"` → the card item ids,
 * or null when empty, more than `MAX_CARDS`, repeated or naming a non-card item (the Pistol too).
 */
export function parseDevShopCards(raw: string, balance: Balance): readonly string[] | null {
  const ids = raw
    .split(",")
    .map((s) => s.trim())
    .filter((s) => s.length > 0);
  if (ids.length === 0 || ids.length > MAX_CARDS || new Set(ids).size !== ids.length) return null;
  if (!ids.every((id) => cardItem(balance, id) !== undefined)) return null;
  return Object.freeze(ids);
}
