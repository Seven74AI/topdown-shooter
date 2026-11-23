import { romanLevel, type ShopBuilding, type ShopError, type ShopGear, type ShopWeapon, type WeaponUpgradeError } from "@topdown/shared";
import type { ShopAnswer } from "../sim/SimHost";

/**
 * Story 3.3: the shop screen's state, between the Game scene (which owns the purchases and feeds
 * wallet and slots) and the Preact `ShopScreen`. `shopStep` is the pure state machine; the Game
 * scene applies it and runs the `buy` effect it returns (one `SimHost.buyWeapon` per effect).
 */
export interface ShopState {
  readonly open: boolean;
  /** Offered items (from balance, set at open). */
  readonly weapons: readonly ShopWeapon[];
  readonly buildings: readonly ShopBuilding[];
  /** My wallet and weapons as the World has them (server truth online). */
  readonly wallet: number;
  readonly slots: readonly [string, string | null];
  /** Story 5.1: each slot's upgrade level as the World has it (server truth online; 0 = empty slot). */
  readonly levels: readonly [number, number];
  /** Story 5.1: the price of one upgrade level per weapon id, and the max level (from balance, set at open). */
  readonly upgradePrices: Readonly<Record<string, number>>;
  readonly maxLevel: number;
  /**
   * A purchase sent and not answered yet: every item is disabled (one purchase at a time). A weapon
   * id for a buy, `upgradeKey(weapon)` for a Story 5.1 upgrade.
   */
  readonly pending: string | null;
  /**
   * Story 5.1 review (F1): an accepted upgrade stays pending until a sync shows `levels[slot] >=
   * level` (the answer can arrive before the state patch); null otherwise. The timeout still applies.
   */
  readonly awaitLevel: { readonly slot: 0 | 1; readonly level: number } | null;
  /** Story 5.11: the gear the shop lists (from balance, set at open) and my owned-gear mask (server truth online). */
  readonly gear: readonly ShopGear[];
  readonly gearMask: number;
  /**
   * Story 5.11 (AC 8): an accepted gear purchase stays pending until a sync shows this bit (the
   * answer can arrive before the state patch); 0 otherwise. The timeout still applies.
   */
  readonly awaitGear: number;
  /** When `pending` was sent (ms, the scene's clock), for the timeout. */
  readonly pendingAtMs: number;
  /** Both slots full: the weapon waiting for "Replace which?". */
  readonly choosing: string | null;
  /** The last answer's text ("" = none) and whether it was a refusal. */
  readonly message: string;
  readonly refused: boolean;
}

export const CLOSED_SHOP: ShopState = Object.freeze({
  open: false,
  weapons: [],
  buildings: [],
  wallet: 0,
  slots: ["", null] as const,
  levels: [0, 0] as const,
  upgradePrices: {},
  maxLevel: 1,
  pending: null,
  awaitLevel: null,
  gear: [],
  gearMask: 0,
  awaitGear: 0,
  pendingAtMs: 0,
  choosing: null,
  message: "",
  refused: false,
});

/** A purchase without an answer for this long is given up (the buttons come back). */
export const SHOP_PENDING_TIMEOUT_MS = 3000;

/** What the player did in the shop (`UiRequests.shop`). */
export type ShopAction =
  | { readonly type: "close" }
  /** Tap a weapon. */
  | { readonly type: "buy"; readonly weapon: string }
  /** Story 5.1: tap an Upgrade row. */
  | { readonly type: "upgrade"; readonly weapon: string }
  /** Story 5.11: tap a Gear item (Story 5.12: consumables use the same action and message). */
  | { readonly type: "item"; readonly item: string }
  /** "Replace which?": the slot the chosen weapon replaces. */
  | { readonly type: "slot"; readonly slot: 0 | 1 }
  /** "Replace which?": Cancel. */
  | { readonly type: "cancel" }
  /** Tap a building (Story 3.4 contract): starts placement, closes the shop. */
  | { readonly type: "building"; readonly id: string };

/** Everything that drives the shop: the player's actions, plus what the Game scene feeds. */
export type ShopInput =
  | ShopAction
  | {
      readonly type: "open";
      readonly weapons: readonly ShopWeapon[];
      readonly buildings: readonly ShopBuilding[];
      /** Story 5.1 (absent: no upgrades offered). */
      readonly upgradePrices?: Readonly<Record<string, number>>;
      readonly maxLevel?: number;
      /** Story 5.11 (absent: no Gear section). */
      readonly gear?: readonly ShopGear[];
    }
  | { readonly type: "sync"; readonly wallet: number; readonly slots: readonly [string, string | null]; readonly levels?: readonly [number, number]; readonly gearMask?: number }
  | { readonly type: "answer"; readonly answer: ShopAnswer }
  | { readonly type: "time"; readonly nowMs: number };

export type ShopEffect =
  | { readonly type: "buy"; readonly weapon: string; readonly slot: 0 | 1 | null }
  | { readonly type: "upgrade"; readonly weapon: string }
  | { readonly type: "item"; readonly item: string }
  | { readonly type: "startPlacement"; readonly id: string }
  | null;

export interface ShopStepResult {
  readonly state: ShopState;
  readonly effect: ShopEffect;
}

/** Player texts (one place for wording). */
export const SHOP_TEXT = {
  title: "Shop",
  weapons: "Weapons",
  buildings: "Buildings",
  owned: "Owned",
  free: "Free",
  close: "Close",
  replace: "Replace which weapon?",
  lost: "The replaced weapon is lost.",
  cancel: "Cancel",
  waiting: "Buying…",
  bought: (name: string) => `Bought ${name}`,
  // Story 5.1
  upgrades: "Upgrades",
  max: "Max",
  upgradesLost: "Its upgrades are lost.",
  upgraded: (name: string, level: number) => `${name} upgraded to ${romanLevel(level)}`,
  // Story 5.11
  gear: "Gear",
  replacesArmor1: "Replaces Body armor I",
  coveredByArmor2: "Armor II covers it",
} as const;

/** Story 5.11: the `pending` key of a gear / item purchase (never a weapon id: ids have no colon). */
export const itemKey = (item: string): string => `item:${item}`;

/** Story 5.11: how a Gear row shows (pure: the screen and the tests read it). */
export interface GearRowView {
  readonly id: string;
  readonly name: string;
  readonly price: number;
  /** Owned, or an armor of a tier ≤ the one owned (armor II covers I): "Owned", disabled. */
  readonly owned: boolean;
  /** Owned only by being covered by a higher armor tier (the row's note). */
  readonly covered: boolean;
  /** Not owned and more than the wallet. */
  readonly short: boolean;
  /** A note under the name ("Replaces Body armor I"; "" = none). */
  readonly note: string;
}

/** Story 5.11: the highest armor tier in my mask (0 = none). */
function ownedArmorTier(s: ShopState): number {
  let best = 0;
  for (const g of s.gear) if (g.armorTier > best && (s.gearMask & g.bit) !== 0) best = g.armorTier;
  return best;
}

/** Story 5.11: the Gear rows from the state the World fed (bit order). */
export function gearRows(s: ShopState): GearRowView[] {
  const tier = ownedArmorTier(s);
  return s.gear.map((g) => {
    const bitOwned = (s.gearMask & g.bit) !== 0;
    const covered = !bitOwned && g.armorTier > 0 && g.armorTier <= tier;
    const owned = bitOwned || covered;
    const note = covered ? SHOP_TEXT.coveredByArmor2 : !owned && g.armorTier > 1 && tier > 0 ? SHOP_TEXT.replacesArmor1 : "";
    return { id: g.id, name: g.name, price: g.price, owned, covered, short: !owned && g.price > s.wallet, note };
  });
}

/** Story 5.1: refusal texts of an upgrade. */
export function upgradeErrorText(error: WeaponUpgradeError): string {
  switch (error) {
    case "insufficient_funds":
      return "Not enough money";
    case "max_level":
      return "Already at max level";
    case "not_owned":
      return "You don't have that weapon";
    case "not_build":
      return "The shop is closed";
    default:
      return "Can't upgrade that";
  }
}

/** Story 5.1: the `pending` key of an upgrade (never a weapon id: ids have no colon). */
export const upgradeKey = (weapon: string): string => `upgrade:${weapon}`;

/** One Upgrade row as the shop shows it (Story 5.1). */
export interface UpgradeRowView {
  readonly weapon: string;
  readonly slot: 0 | 1;
  readonly level: number;
  /** The next level's price, or null at the max level (the row reads "Max" and is disabled). */
  readonly price: number | null;
}

/** Story 5.1: the Upgrade rows for my slots (slot 0 first), from the state the World fed. */
export function upgradeRows(s: ShopState): UpgradeRowView[] {
  const rows: UpgradeRowView[] = [];
  for (const slot of [0, 1] as const) {
    const weapon = s.slots[slot];
    const price = weapon ? s.upgradePrices[weapon] : undefined;
    if (!weapon || price === undefined) continue;
    const level = Math.max(1, s.levels[slot]);
    rows.push({ weapon, slot, level, price: level >= s.maxLevel ? null : price });
  }
  return rows;
}

/** Story 5.1: the "Replace which weapon?" button's warning for `slot` ("" when its weapon is at I). */
export function replaceWarning(s: ShopState, slot: 0 | 1): string {
  return s.slots[slot] && s.levels[slot] > 1 ? SHOP_TEXT.upgradesLost : "";
}

/** The refusal texts (architecture › error handling: short, plain, actionable). */
export function shopErrorText(error: ShopError): string {
  switch (error) {
    case "insufficient_funds":
      return "Not enough money";
    case "already_owned":
      return "You already have it";
    case "not_build":
      return "The shop is closed";
    case "slot_required":
      return "Choose a slot to replace";
    case "not_alive":
      return "You can't shop while down"; // Story 5.11 review M1
    default:
      return "Can't buy that";
  }
}

const ownsWeapon = (s: ShopState, id: string): boolean => s.slots[0] === id || s.slots[1] === id;

const NONE: ShopEffect = null;
const same = (state: ShopState): ShopStepResult => ({ state, effect: NONE });

/**
 * Story 5.11: does the World's new state show the pending item `key` (`itemKey(id)`) as bought?
 * Gear: its bit is set in the new mask and wasn't before. **Story 5.12 hook:** consumables have no
 * bit — add a count (e.g. `consumables` in the sync input and an `awaitCount` like `awaitGear`) and
 * answer here when the synced count rose above the count at the tap; until then a consumable
 * purchase unlocks on its answer or the timeout.
 */
function itemArrived(s: ShopState, key: string, newMask: number): boolean {
  const bit = s.awaitGear !== 0 ? s.awaitGear : (s.gear.find((g) => itemKey(g.id) === key)?.bit ?? 0);
  return bit !== 0 && (newMask & bit) !== 0 && (s.gearMask & bit) === 0;
}

/** The shop's state machine (pure). `nameOf` gives a weapon's display name for the "Bought" text. */
export function shopStep(s: ShopState, input: ShopInput, nameOf: (id: string) => string = (id) => id): ShopStepResult {
  switch (input.type) {
    case "open":
      if (s.open) return same(s);
      return same({
        ...CLOSED_SHOP,
        open: true,
        weapons: input.weapons,
        buildings: input.buildings,
        upgradePrices: input.upgradePrices ?? {},
        maxLevel: input.maxLevel ?? 1,
        gear: input.gear ?? [],
        wallet: s.wallet,
        slots: s.slots,
        levels: s.levels,
        gearMask: s.gearMask,
      });
    case "close":
      // Keeps wallet and slots (fed every frame while open anyway); an answer after close is ignored.
      return s.open ? same({ ...CLOSED_SHOP, wallet: s.wallet, slots: s.slots, levels: s.levels, gearMask: s.gearMask }) : same(s);
    case "sync": {
      const levels = input.levels ?? s.levels;
      const gearMask = input.gearMask ?? s.gearMask;
      if (s.wallet === input.wallet && s.slots[0] === input.slots[0] && s.slots[1] === input.slots[1] && s.levels[0] === levels[0] && s.levels[1] === levels[1] && s.gearMask === gearMask) return same(s);
      // Story 5.1 review: the state now shows the accepted upgrade: the rows are current, unlock them.
      if (s.awaitLevel !== null && levels[s.awaitLevel.slot] >= s.awaitLevel.level) {
        return same({ ...s, wallet: input.wallet, slots: input.slots, levels, gearMask, pending: null, pendingAtMs: 0, awaitLevel: null });
      }
      // Story 5.11 (AC 8): the state shows the bought item (answer first or not): unlock.
      if (s.pending !== null && s.pending.startsWith("item:") && itemArrived(s, s.pending, gearMask)) {
        return same({ ...s, wallet: input.wallet, slots: input.slots, levels, gearMask, pending: null, pendingAtMs: 0, awaitGear: 0 });
      }
      return same({ ...s, wallet: input.wallet, slots: input.slots, levels, gearMask });
    }
    case "upgrade": {
      // Story 5.1 (F1): one tap sends one upgrade at a time; nothing while anything is pending.
      if (!s.open || s.pending !== null || s.choosing !== null) return same(s);
      const row = upgradeRows(s).find((r) => r.weapon === input.weapon);
      if (!row || row.price === null) return same(s);
      return { state: { ...s, pending: upgradeKey(input.weapon), pendingAtMs: 0, message: "", refused: false }, effect: { type: "upgrade", weapon: input.weapon } };
    }
    case "item": {
      // Story 5.11: one purchase in flight at a time (G4/G13); owned / covered gear sends nothing.
      if (!s.open || s.pending !== null || s.choosing !== null) return same(s);
      const row = gearRows(s).find((r) => r.id === input.item);
      if (!row || row.owned) return same(s);
      return { state: { ...s, pending: itemKey(input.item), pendingAtMs: 0, awaitGear: 0, message: "", refused: false }, effect: { type: "item", item: input.item } };
    }
    case "buy": {
      if (!s.open || s.pending !== null || ownsWeapon(s, input.weapon)) return same(s);
      if (!s.weapons.some((w) => w.id === input.weapon)) return same(s);
      if (s.slots[1] !== null) return same({ ...s, choosing: input.weapon, message: "", refused: false });
      return { state: { ...s, pending: input.weapon, pendingAtMs: 0, choosing: null, message: "", refused: false }, effect: { type: "buy", weapon: input.weapon, slot: null } };
    }
    case "slot": {
      const weapon = s.choosing;
      if (!s.open || weapon === null || s.pending !== null) return same(s);
      return { state: { ...s, pending: weapon, pendingAtMs: 0, choosing: null }, effect: { type: "buy", weapon, slot: input.slot } };
    }
    case "cancel":
      return s.choosing === null ? same(s) : same({ ...s, choosing: null });
    case "building":
      if (!s.open || !s.buildings.some((b) => b.id === input.id)) return same(s);
      return { state: { ...CLOSED_SHOP, wallet: s.wallet, slots: s.slots, levels: s.levels, gearMask: s.gearMask }, effect: { type: "startPlacement", id: input.id } };
    case "answer": {
      const a = input.answer;
      if (!s.open) return same(s);
      let message: string;
      let key: string;
      if (a.kind === "upgrade") {
        message = a.ok ? SHOP_TEXT.upgraded(nameOf(a.weapon), a.level) : upgradeErrorText(a.error);
        key = upgradeKey(a.weapon);
      } else if (a.kind === "item") {
        const g = s.gear.find((x) => x.id === a.item);
        message = a.ok ? SHOP_TEXT.bought(g?.name ?? nameOf(a.item)) : shopErrorText(a.error);
        key = itemKey(a.item);
        if (s.pending !== null && key === s.pending && a.ok && g && (s.gearMask & g.bit) === 0) {
          // Story 5.11 (AC 8): accepted, but the state doesn't show the bit yet: stay pending on it.
          return same({ ...s, awaitGear: g.bit, message, refused: false });
        }
      } else {
        message = a.ok ? SHOP_TEXT.bought(nameOf(a.weapon)) : shopErrorText(a.error);
        key = a.weapon;
      }
      // A late answer for an earlier purchase shows its text but doesn't unlock a newer one (3.3 review).
      if (s.pending !== null && key !== s.pending) return same({ ...s, message, refused: !a.ok });
      // Story 5.1 review (F1): an accepted upgrade unlocks only once the World shows its level, so a
      // second tap can't buy from a row still showing the old level and wallet.
      if (a.kind === "upgrade" && a.ok && s.pending !== null && s.levels[a.slot] < a.level) {
        return same({ ...s, awaitLevel: { slot: a.slot, level: a.level }, message, refused: false });
      }
      return same({ ...s, pending: null, pendingAtMs: 0, awaitLevel: null, awaitGear: 0, message, refused: !a.ok });
    }
    case "time":
      if (s.pending === null) return same(s);
      if (s.pendingAtMs === 0) return same({ ...s, pendingAtMs: input.nowMs }); // the clock starts with the first frame after the send
      return input.nowMs - s.pendingAtMs >= SHOP_PENDING_TIMEOUT_MS ? same({ ...s, pending: null, pendingAtMs: 0, awaitLevel: null, awaitGear: 0 }) : same(s);
  }
}

type Listener = (s: ShopState) => void;

/** The shop screen's store (no globals on window). Written only by the Game scene. */
class ShopStore {
  private state: ShopState = CLOSED_SHOP;
  private readonly listeners = new Set<Listener>();

  get(): ShopState {
    return this.state;
  }

  set(state: ShopState): void {
    if (state === this.state) return; // the reducer returns the same object when nothing changed
    this.state = state;
    for (const l of this.listeners) l(state);
  }

  subscribe(listener: Listener): () => void {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }
}

export const shopStore = new ShopStore();

/**
 * Story 3.3 (review: make the rule testable): the shop may be open only in a build phase with a run
 * on screen, no menu, no stress run and not while leaving. GameScene closes an open shop as soon as
 * this turns false, and the survivor stands still while it is open.
 */
export function shopAllowed(c: {
  phase: string;
  running: boolean;
  gameOver: boolean;
  menuOpen: boolean;
  stressMode: boolean;
  leaving: boolean;
}): boolean {
  return c.phase === "build" && c.running && !c.gameOver && !c.menuOpen && !c.stressMode && !c.leaving;
}
