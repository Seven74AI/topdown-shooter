import type { FlameCues } from "../render/flameCues";
import type { PlaceError, PlaceRequest, PlayerInput, RepairError, ShopError, SimEvent, UpgradeError, WeaponUpgradeError, World } from "@topdown/shared";

/**
 * Story 3.3: how a purchase ended (solo at once, online the server's `shop.bought` / `shop.refused`).
 * Story 5.1: `kind: "upgrade"` for a weapon upgrade (`shop.upgraded` / `shop.upgrade_refused`).
 */
export type ShopAnswer =
  | { readonly kind?: "buy"; readonly ok: true; readonly weapon: string; readonly slot: 0 | 1 }
  | { readonly kind?: "buy"; readonly ok: false; readonly weapon: string; readonly error: ShopError }
  | { readonly kind: "upgrade"; readonly ok: true; readonly weapon: string; readonly slot: 0 | 1; readonly level: number }
  | { readonly kind: "upgrade"; readonly ok: false; readonly weapon: string; readonly error: WeaponUpgradeError };

/** Presentation data of a player (Story 2.9): kept out of the shared `PlayerState`. */
export interface PlayerInfo {
  /** Lobby slot 0–3 (ring and arrow colour, `SLOT_COLORS`). */
  readonly slot: number;
  /** Display name ("" solo). */
  readonly name: string;
}

/**
 * How scenes talk to the simulation. Epic 1 uses LocalSimHost (the World runs in the browser);
 * Story 2.4 adds a networked host behind the same interface, so scenes don't change.
 *
 * Interpolation: entity pools keep `prevX/prevY` copied at the start of each tick; renderers draw
 * `lerp(prev, current, alpha)`. This interface only provides `alpha`.
 */
export interface SimHost {
  /** Advance by a real frame time in seconds; steps the simulation 0..N times. */
  update(frameDtS: number): void;
  /** Fraction of the next step already elapsed, in [0, 1). */
  readonly alpha: number;
  /** The authoritative (local) or predicted (networked) world. Renderers only read it. */
  readonly world: Readonly<World>;
  /**
   * The local player's input for upcoming steps. Continuous fields (move, aim, fire) use the latest
   * value; edge flags (swap, consumable) set by any call reach exactly one step.
   */
  setLocalInput(input: PlayerInput): void;
  /**
   * Story 3.1: the local player's build-phase Ready (a toggle; ignored outside a build). Solo it
   * applies before the next step; online it is sent as `build.set_ready` and comes back in the state.
   */
  setBuildReady(ready: boolean): void;
  /**
   * Story 3.4: ask to place a building (the server validates; solo runs the same check now). A
   * refusal comes back through `takePlaceRefusal` (solo at once, online a round trip later).
   */
  placeBuilding(req: PlaceRequest): void;
  /** The oldest placement refusal not taken yet, or null. */
  takePlaceRefusal(): PlaceError | null;
  /**
   * Story 3.7: ask to repair building `id` (anyone's) to full HP, paid from my wallet (the server
   * validates; solo runs the same rules now). A refusal comes back through `takeRepairRefusal`.
   */
  repairBuilding(id: number): void;
  /** The latest repair refusal not taken yet, or null. */
  takeRepairRefusal(): RepairError | null;
  /**
   * Story 5.9: ask to upgrade my building `id` one tier (wood → reinforced → metal), paid from my
   * wallet (the server validates; solo runs the same rules now). The building shows the new tier
   * only when the World says so (online: the state). A refusal comes back through `takeUpgradeRefusal`.
   */
  upgradeBuilding(id: number): void;
  /** The latest upgrade refusal not taken yet, or null. */
  takeUpgradeRefusal(): UpgradeError | null;
  /**
   * Story 3.3: buy a weapon of the fixed shop (`slot`: which one it replaces when both are full).
   * Solo the shared `buyWeapon` runs at once; online it is sent as `shop.buy` and the server decides.
   * Either way the answer comes from `takeShopAnswer`; wallet and weapons change only in the World.
   */
  buyWeapon(weapon: string, slot: 0 | 1 | null): void;
  /**
   * Story 5.1: upgrade one of my weapons by one level. Solo the shared `upgradeWeapon` runs at once;
   * online it is sent as `shop.upgrade` and the server decides. The answer comes from
   * `takeShopAnswer` (`kind: "upgrade"`); the level and wallet change only in the World (online: state).
   */
  upgradeWeapon(weapon: string): void;
  /** The oldest purchase answer not taken yet, or null. */
  takeShopAnswer(): ShopAnswer | null;
  /** Drops a swap/consumable latched but not sent yet (the in-run menu opened in the same step; 2.11 review). */
  clearEdges(): void;
  /**
   * Events produced since the last call, in order; each event is returned exactly once.
   * The returned array is reused: it is valid only until the next `drainEvents()` call.
   */
  drainEvents(): readonly SimEvent[];
  /** Id of the player this device controls ("local" solo, "p0"–"p3" online). */
  readonly localPlayerId: string;
  /** True for the networked host: renderers may use it to pick data sources (e.g. Story 2.5 heading). */
  readonly online: boolean;
  /**
   * Story 5.4: who is flaming now (the cones). The scene feeds it every drained event; the networked
   * host also feeds my predicted flame and every state patch's fuel (the lost-event fallback).
   */
  readonly flames: FlameCues;
  /**
   * Slot and name of a player (Story 2.9). The returned object may be reused: read it before the
   * next call. Unknown ids get slot 0 (or the id's slot online) and "".
   */
  playerInfo(id: string): PlayerInfo;
  /** Ends the run on this host (the networked host also leaves the room). */
  dispose(): void;
}
