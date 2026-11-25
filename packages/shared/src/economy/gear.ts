import type { Balance } from "../config/balance";
import { err, ok, type Result } from "../core/result";
import { ticksFor } from "../core/time";
import type { World } from "../core/world";
import type { PlayerState } from "../player/player";
import { spendMoney } from "./economy";
import type { ShopError } from "./shop";
import { trainedMaxHp } from "../meta/training";

/**
 * Story 5.11: gear (FR48) — bought in a build phase, owned for the rest of the run.
 *
 * - Stored on the player as a bitmask `PlayerState.gear`: bit i = the i-th key of `gear.json › items`
 *   (≤ 8, a uint8 on the wire). Kept through downed, out, return and every build start; the lobby
 *   return builds a new World (and `resetRunFields` zeroes the schema).
 * - Body armor: max HP = `player.maxHp` + the bonus of the BEST armor owned (never summed). A higher
 *   tier replaces the lower ones (their bits are cleared); owning a tier refuses every tier ≤ it.
 * - Running shoes: `speedBonusPct` (integer percent) multiplies with every slow (`playerSpeed`).
 * - Revive kit: its owner revives a teammate in `reviveS` (the reviver's kit, not the downed one's).
 * - Tactical flashlight: only the bit (Story 6.3's blackout cone); `inShop: false` until then.
 *
 * Every function reads precomputed per-balance tables (cached): nothing allocates per tick.
 */

export type GearId = string;

/** One row of the shop's Gear section (cached, frozen). */
export interface ShopGear {
  readonly id: GearId;
  readonly name: string;
  readonly price: number;
  /** The mask bit of this item. */
  readonly bit: number;
  /** Armor tier (0 = not armor). */
  readonly armorTier: number;
}

interface GearTable {
  readonly ids: readonly GearId[];
  readonly bitOf: ReadonlyMap<GearId, number>;
  /** Per bit index. */
  readonly tier: readonly number[];
  readonly hpBonus: readonly number[];
  readonly speedPct: readonly number[];
  /** Revive ticks the owner needs (0 = not a revive kit). */
  readonly reviveTicks: readonly number[];
  readonly inShop: readonly boolean[];
  /** The items the shop lists (`inShop`), in bit order. */
  readonly shop: readonly ShopGear[];
  /** Every item (the HUD icons, the dev shop), in bit order. */
  readonly all: readonly ShopGear[];
  /** `ticksFor(player.reviveS)`. */
  readonly baseReviveTicks: number;
}

const tables = new WeakMap<Balance, GearTable>();

function table(balance: Balance): GearTable {
  let t = tables.get(balance);
  if (!t) {
    const ids = Object.keys(balance.gear.items);
    const bitOf = new Map<GearId, number>();
    const tier: number[] = [];
    const hpBonus: number[] = [];
    const speedPct: number[] = [];
    const reviveTicks: number[] = [];
    const inShop: boolean[] = [];
    const shop: ShopGear[] = [];
    const all: ShopGear[] = [];
    ids.forEach((id, i) => {
      const g = balance.gear.items[id];
      if (!g) return;
      bitOf.set(id, 1 << i);
      tier.push(g.armorTier ?? 0);
      hpBonus.push(g.maxHpBonus ?? 0);
      speedPct.push(g.speedBonusPct ?? 0);
      reviveTicks.push(g.reviveS === undefined ? 0 : ticksFor(g.reviveS));
      inShop.push(g.inShop);
      const row = Object.freeze({ id, name: g.name, price: g.price, bit: 1 << i, armorTier: g.armorTier ?? 0 });
      all.push(row);
      if (g.inShop) shop.push(row);
    });
    t = Object.freeze({
      ids: Object.freeze(ids),
      bitOf,
      tier,
      hpBonus,
      speedPct,
      reviveTicks,
      inShop,
      shop: Object.freeze(shop),
      all: Object.freeze(all),
      baseReviveTicks: ticksFor(balance.player.reviveS),
    });
    tables.set(balance, t);
  }
  return t;
}

/** The gear ids in bit order (`gear.json` key order). */
export function gearIds(balance: Balance): readonly GearId[] {
  return table(balance).ids;
}

/** The mask bit of a gear id, or 0 for an unknown id. */
export function gearBit(balance: Balance, id: string): number {
  return table(balance).bitOf.get(id) ?? 0;
}

/** Every gear item in bit order (HUD icon order). */
export function allGear(balance: Balance): readonly ShopGear[] {
  return table(balance).all;
}

/** The gear the shop lists (`inShop`; `?shopall=1` / `DEV_SHOP_ALL=1` lists every item). */
export function shopGear(balance: Balance): readonly ShopGear[] {
  return table(balance).shop;
}

/** The player owns this gear item. */
export function ownsGear(balance: Balance, p: Readonly<PlayerState>, id: string): boolean {
  const bit = gearBit(balance, id);
  return bit !== 0 && (p.gear & bit) !== 0;
}

/** The highest armor tier in `mask` (0 = none). */
export function armorTier(balance: Balance, mask: number): number {
  const t = table(balance);
  let best = 0;
  for (let i = 0; i < t.tier.length; i++) if ((mask & (1 << i)) !== 0 && (t.tier[i] as number) > best) best = t.tier[i] as number;
  return best;
}

/** The max HP bonus of the best armor in `mask` (never two armors summed). */
export function armorBonus(balance: Balance, mask: number): number {
  const t = table(balance);
  let bestTier = 0;
  let bonus = 0;
  for (let i = 0; i < t.tier.length; i++) {
    if ((mask & (1 << i)) === 0) continue;
    const tier = t.tier[i] as number;
    if (tier > bestTier) {
      bestTier = tier;
      bonus = t.hpBonus[i] as number;
    }
  }
  return bonus;
}

/**
 * Max HP with the gear in `mask`: the Training-trained base (Story 7.5, decision 7.5 D1: `player.maxHp` × (1 + 2 % × L),
 * rounded) + the best armor's bonus, unscaled. `trainHp` is the player's own level (default 0).
 */
export function effectiveMaxHp(balance: Balance, mask: number, trainHp = 0): number {
  return trainedMaxHp(balance, trainHp) + armorBonus(balance, mask);
}

/** The move speed bonus in integer percent of the gear in `mask` (running shoes: 10). */
export function speedBonusPct(balance: Balance, mask: number): number {
  const t = table(balance);
  let pct = 0;
  for (let i = 0; i < t.speedPct.length; i++) if ((mask & (1 << i)) !== 0) pct += t.speedPct[i] as number;
  return pct;
}

/**
 * Ticks a reviver with the gear in `reviverMask` needs (D1: the kit belongs to the reviver): the
 * fastest kit owned, else `ticksFor(player.reviveS)`.
 */
export function reviveTicksFor(balance: Balance, reviverMask: number): number {
  const t = table(balance);
  let best = t.baseReviveTicks;
  for (let i = 0; i < t.reviveTicks.length; i++) {
    const k = t.reviveTicks[i] as number;
    if (k > 0 && (reviverMask & (1 << i)) !== 0 && k < best) best = k;
  }
  return best;
}

/** What a gear purchase did. */
export interface BoughtGear {
  readonly item: GearId;
  readonly price: number;
}

/**
 * Buys gear `item` for `playerId` (Story 5.11). Checks, in order: a build phase, a known player,
 * standing (`not_alive` while downed or out: review M1),
 * a known item that is in the shop (`not_for_sale`), not owned (an armor tier ≤ the owned one also
 * counts as owned: armor II covers I), then `spendMoney`. On success the bit is set (a higher armor
 * clears the lower armor bits), `maxHp` becomes `effectiveMaxHp` and the current HP rises by the
 * max-HP increase (D2), never above the new max. On an error nothing changes.
 */
export function buyGear(world: World, playerId: string, item: string): Result<BoughtGear, ShopError> {
  if (world.run.phase !== "build") return err("not_build");
  const p = world.players.get(playerId);
  if (!p) return err("unknown_player");
  // Review M1 (G6): only a standing player shops (a fire can down someone in a build phase).
  if (p.status !== "alive") return err("not_alive");
  const t = table(world.balance);
  const bit = t.bitOf.get(item);
  if (bit === undefined) return err("not_for_sale");
  const index = 31 - Math.clz32(bit);
  if (!t.inShop[index]) return err("not_for_sale");
  return buyGearAt(world, playerId, item, world.balance.gear.items[item]?.price ?? 0);
}

/**
 * Story 5.13: the gear purchase itself at `price` (a card's `cardPrice`), after the caller checked
 * phase, player, standing and that the item is offered: not owned (an armor tier ≤ the owned one
 * also counts), then `spendMoney`, then the 5.11 effects. On an error nothing changes.
 */
export function buyGearAt(world: World, playerId: string, item: string, price: number): Result<BoughtGear, ShopError> {
  const p = world.players.get(playerId);
  if (!p) return err("unknown_player");
  const t = table(world.balance);
  const bit = t.bitOf.get(item);
  if (bit === undefined) return err("not_for_sale");
  const index = 31 - Math.clz32(bit);
  if ((p.gear & bit) !== 0) return err("already_owned");
  const tier = t.tier[index] as number;
  if (tier > 0 && armorTier(world.balance, p.gear) >= tier) return err("already_owned");
  const paid = spendMoney(world, playerId, price);
  if (!paid.ok) return paid;
  let mask = p.gear | bit;
  if (tier > 0) for (let i = 0; i < t.tier.length; i++) if (i !== index && (t.tier[i] as number) > 0 && (t.tier[i] as number) < tier) mask &= ~(1 << i);
  const oldMax = p.maxHp;
  p.gear = mask;
  p.maxHp = effectiveMaxHp(world.balance, mask, p.trainHp);
  if (p.maxHp > oldMax) p.hp = Math.min(p.maxHp, p.hp + (p.maxHp - oldMax));
  return ok({ item, price });
}
