import type { ShopBuilding, ShopError, ShopWeapon } from "@topdown/shared";
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
  /** A purchase sent and not answered yet: every item is disabled (one purchase at a time). */
  readonly pending: string | null;
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
  pending: null,
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
  /** "Replace which?": the slot the chosen weapon replaces. */
  | { readonly type: "slot"; readonly slot: 0 | 1 }
  /** "Replace which?": Cancel. */
  | { readonly type: "cancel" }
  /** Tap a building (Story 3.4 contract): starts placement, closes the shop. */
  | { readonly type: "building"; readonly id: string };

/** Everything that drives the shop: the player's actions, plus what the Game scene feeds. */
export type ShopInput =
  | ShopAction
  | { readonly type: "open"; readonly weapons: readonly ShopWeapon[]; readonly buildings: readonly ShopBuilding[] }
  | { readonly type: "sync"; readonly wallet: number; readonly slots: readonly [string, string | null] }
  | { readonly type: "answer"; readonly answer: ShopAnswer }
  | { readonly type: "time"; readonly nowMs: number };

export type ShopEffect =
  | { readonly type: "buy"; readonly weapon: string; readonly slot: 0 | 1 | null }
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
} as const;

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
    default:
      return "Can't buy that";
  }
}

const ownsWeapon = (s: ShopState, id: string): boolean => s.slots[0] === id || s.slots[1] === id;

const NONE: ShopEffect = null;
const same = (state: ShopState): ShopStepResult => ({ state, effect: NONE });

/** The shop's state machine (pure). `nameOf` gives a weapon's display name for the "Bought" text. */
export function shopStep(s: ShopState, input: ShopInput, nameOf: (id: string) => string = (id) => id): ShopStepResult {
  switch (input.type) {
    case "open":
      if (s.open) return same(s);
      return same({ ...CLOSED_SHOP, open: true, weapons: input.weapons, buildings: input.buildings, wallet: s.wallet, slots: s.slots });
    case "close":
      // Keeps wallet and slots (fed every frame while open anyway); an answer after close is ignored.
      return s.open ? same({ ...CLOSED_SHOP, wallet: s.wallet, slots: s.slots }) : same(s);
    case "sync":
      if (s.wallet === input.wallet && s.slots[0] === input.slots[0] && s.slots[1] === input.slots[1]) return same(s);
      return same({ ...s, wallet: input.wallet, slots: input.slots });
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
      return { state: { ...CLOSED_SHOP, wallet: s.wallet, slots: s.slots }, effect: { type: "startPlacement", id: input.id } };
    case "answer": {
      const a = input.answer;
      if (!s.open) return same(s);
      const message = a.ok ? SHOP_TEXT.bought(nameOf(a.weapon)) : shopErrorText(a.error);
      return same({ ...s, pending: null, pendingAtMs: 0, message, refused: !a.ok });
    }
    case "time":
      if (s.pending === null) return same(s);
      if (s.pendingAtMs === 0) return same({ ...s, pendingAtMs: input.nowMs }); // the clock starts with the first frame after the send
      return input.nowMs - s.pendingAtMs >= SHOP_PENDING_TIMEOUT_MS ? same({ ...s, pending: null, pendingAtMs: 0 }) : same(s);
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
