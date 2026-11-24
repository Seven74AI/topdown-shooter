import {
  BYTES,
  C2S,
  S2C,
  REPAIR_ERRORS,
  UPGRADE_ERRORS,
  SELL_ERRORS,
  MOVE_ERRORS,
  type BuildingSellRefused,
  type SellError,
  type MoveError,
  type BuildingMoveRefused,
  type BuildingRefused,
  type BuildingRepairRefused,
  type BuildingUpgradeRefused,
  type UpgradeError,
  type NetPinged,
  type PlaceError,
  type PlayerLeft,
  type RepairError,
  type RunJoined,
  type RunStateView,
  type ShopError,
  type ShopOfferView,
  MAX_CARDS,
  type SimEventsFlushed,
  type WeaponUpgradeError,
} from "@topdown/shared";
import type { ShopAnswer } from "../sim/SimHost";

const SHOP_ERRORS: readonly ShopError[] = [
  "not_build",
  "unknown_player",
  "not_alive", // Story 5.11 review M1
  "not_for_sale",
  "already_owned",
  "already_full", // Story 5.12
  "slot_required",
  "stale_offer", // Story 5.13
  "not_in_offer",
  "no_new_cards",
  "invalid_amount",
  "insufficient_funds",
];

/** A well-formed `shop.bought` (Story 3.3; 5.13: a card) as an answer, or null. */
export function parseShopBought(m: unknown): ShopAnswer | null {
  const o = m as { item?: unknown; card?: unknown; slot?: unknown } | null;
  if (!o || typeof o.item !== "string" || typeof o.card !== "number" || !Number.isInteger(o.card)) return null;
  if (o.slot !== undefined && o.slot !== 0 && o.slot !== 1) return null;
  return { ok: true, item: o.item, card: o.card, slot: o.slot === undefined ? null : o.slot };
}

/**
 * A well-formed `shop.refused` (Story 3.3; 5.13: `item: "reroll"` is a reroll's refusal) as an
 * answer, or null (an unknown error reads as `not_for_sale`).
 */
export function parseShopRefused(m: unknown): ShopAnswer | null {
  const o = m as { item?: unknown; card?: unknown; error?: unknown } | null;
  if (!o || typeof o.item !== "string" || typeof o.error !== "string" || typeof o.card !== "number") return null;
  const error = (SHOP_ERRORS as readonly string[]).includes(o.error) ? (o.error as ShopError) : "not_for_sale";
  if (o.item === "reroll") return { kind: "reroll", ok: false, error };
  return { ok: false, item: o.item, card: o.card, error };
}

/** Story 5.13: a well-formed `shop.offered` as an offer view, or null (malformed: dropped). */
export function parseShopOffered(m: unknown): ShopOfferView | null {
  const o = m as { build?: unknown; rev?: unknown; cards?: unknown; sold?: unknown; rerollPrice?: unknown; canReroll?: unknown } | null;
  const int = (x: unknown): x is number => typeof x === "number" && Number.isInteger(x) && x >= 0;
  if (!o || !int(o.build) || !int(o.rev) || !int(o.sold) || !int(o.rerollPrice) || typeof o.canReroll !== "boolean") return null;
  if (!Array.isArray(o.cards) || o.cards.length > MAX_CARDS || !o.cards.every((c) => typeof c === "string" && c.length <= 32)) return null;
  return { build: o.build, rev: o.rev, cards: [...(o.cards as string[])], sold: o.sold, rerollPrice: o.rerollPrice, canReroll: o.canReroll };
}

/**
 * Story 5.13: is `next` at least as new as `cur` (higher build, else higher rev, else the same offer
 * with every sold card still sold)? An older offer arriving after a newer one is ignored.
 */
export function offerIsNewer(cur: ShopOfferView | null, next: ShopOfferView): boolean {
  if (!cur) return true;
  if (next.build !== cur.build) return next.build > cur.build;
  if (next.rev !== cur.rev) return next.rev > cur.rev;
  return (next.sold & cur.sold) === cur.sold;
}

/** Story 5.1: `upgradeWeapon`'s errors (an unknown one reads as `not_owned`). */
const WEAPON_UPGRADE_ERRORS: readonly WeaponUpgradeError[] = ["not_build", "unknown_player", "not_alive", "not_owned", "max_level", "invalid_amount", "insufficient_funds"];

/** A well-formed `shop.upgraded` (Story 5.1) as an answer, or null. */
export function parseShopUpgraded(m: unknown): ShopAnswer | null {
  const o = m as { weapon?: unknown; slot?: unknown; level?: unknown } | null;
  if (!o || typeof o.weapon !== "string" || (o.slot !== 0 && o.slot !== 1) || typeof o.level !== "number" || !Number.isInteger(o.level)) return null;
  return { kind: "upgrade", ok: true, weapon: o.weapon, slot: o.slot, level: o.level };
}

/** A well-formed `shop.upgrade_refused` (Story 5.1) as an answer, or null. */
export function parseShopUpgradeRefused(m: unknown): ShopAnswer | null {
  const o = m as { weapon?: unknown; error?: unknown } | null;
  if (!o || typeof o.weapon !== "string" || typeof o.error !== "string") return null;
  const error = (WEAPON_UPGRADE_ERRORS as readonly string[]).includes(o.error) ? (o.error as WeaponUpgradeError) : "not_owned";
  return { kind: "upgrade", ok: false, weapon: o.weapon, error };
}

/** A well-formed `shop.bought_item` (Story 5.11) as an answer, or null. */
export function parseShopBoughtItem(m: unknown): ShopAnswer | null {
  const o = m as { item?: unknown } | null;
  if (!o || typeof o.item !== "string") return null;
  return { kind: "item", ok: true, item: o.item };
}

/** A well-formed `shop.refused_item` (Story 5.11) as an answer, or null (an unknown error reads as `not_for_sale`). */
export function parseShopRefusedItem(m: unknown): ShopAnswer | null {
  const o = m as { item?: unknown; error?: unknown } | null;
  if (!o || typeof o.item !== "string" || typeof o.error !== "string") return null;
  const error = (SHOP_ERRORS as readonly string[]).includes(o.error) ? (o.error as ShopError) : "not_for_sale";
  return { kind: "item", ok: false, item: o.item, error };
}

/** A well-formed `player.left` (Story 2.11), or null. */
export function parsePlayerLeft(m: unknown): PlayerLeft | null {
  const o = m as Partial<PlayerLeft> | null;
  if (!o || typeof o.playerId !== "string" || typeof o.name !== "string") return null;
  if (o.reason !== "left" && o.reason !== "disconnected") return null;
  return { playerId: o.playerId, name: o.name, reason: o.reason };
}

const PLACE_ERRORS: readonly PlaceError[] = ["unknown_player", "not_alive", "not_build_phase", "unknown_type", "not_for_sale", "limit", "money", "blocked"];

/** The reason of a well-formed `building.refused` (Story 3.4), or null. */
export function parseBuildingRefused(m: unknown): PlaceError | null {
  const reason = (m as Partial<BuildingRefused> | null)?.reason;
  return typeof reason === "string" && (PLACE_ERRORS as readonly string[]).includes(reason) ? (reason as PlaceError) : null;
}

/** The reason of a well-formed `building.repair_refused` (Story 3.7), or null. */
export function parseRepairRefused(m: unknown): RepairError | null {
  const reason = (m as Partial<BuildingRepairRefused> | null)?.reason;
  return typeof reason === "string" && (REPAIR_ERRORS as readonly string[]).includes(reason) ? (reason as RepairError) : null;
}

/** The reason of a well-formed `building.upgrade_refused` (Story 5.9), or null. */
export function parseUpgradeRefused(m: unknown): UpgradeError | null {
  const reason = (m as Partial<BuildingUpgradeRefused> | null)?.reason;
  return typeof reason === "string" && (UPGRADE_ERRORS as readonly string[]).includes(reason) ? (reason as UpgradeError) : null;
}

/** The reason of a well-formed `building.sell_refused` (Story 5.20), or null. */
export function parseSellRefused(m: unknown): SellError | null {
  const reason = (m as Partial<BuildingSellRefused> | null)?.reason;
  return typeof reason === "string" && (SELL_ERRORS as readonly string[]).includes(reason) ? (reason as SellError) : null;
}

/** Story 5.22: a refused `building.move` — which building and why. */
export interface MoveRefusal {
  readonly id: number;
  readonly reason: MoveError;
  /** The refused move's number (review L3: matched with the pending move that sent it). */
  readonly seq: number;
}

/** A well-formed `building.move_refused` (Story 5.22) as a new record, or null. */
export function parseMoveRefused(m: unknown): MoveRefusal | null {
  const v = m as Partial<BuildingMoveRefused> | null;
  const id = v?.id;
  const reason = v?.reason;
  const seq = v?.seq;
  if (typeof id !== "number" || !Number.isInteger(id) || id < 1) return null;
  if (typeof seq !== "number" || !Number.isInteger(seq) || seq < 0) return null;
  return typeof reason === "string" && (MOVE_ERRORS as readonly string[]).includes(reason) ? { id, reason: reason as MoveError, seq } : null;
}

/** Event batches kept while no game scene listens yet: 200 ticks = 10 s of a hidden tab at Start. */
export const EARLY_EVENT_BATCHES_MAX = 200;

/**
 * The slice of the SDK `Room` the networked host uses (Story 2.4). NetSimHost depends on this,
 * never on the SDK class, so unit tests pass a fake and this module never loads the SDK.
 */
export interface NetRoomLike {
  /** Decoded room state; empty until the first full state arrives. */
  readonly state: RunStateView;
  send(type: string, message: unknown): void;
  /** Returns the unsubscribe. A number type is a binary message (`BYTES`): `T` is a Uint8Array view. */
  onMessage<T>(type: string | number, cb: (message: T) => void): () => void;
  /** Fires after each decoded patch. */
  readonly onStateChange: {
    (cb: (state: RunStateView) => void): unknown;
    remove(cb: (state: RunStateView) => void): void;
  };
  leave(consented?: boolean): unknown;
}

/**
 * The fight messages of one room, listened to from the moment the room is joined (Story 2.4
 * review). The Game scene is built later: a frame after the start patch at best, seconds later
 * for a guest whose tab is hidden at Start, and tick 1's events can even arrive before the start
 * patch. Until `onEvents` is called, `sim.events_flushed` batches are buffered (at most
 * EARLY_EVENT_BATCHES_MAX, oldest dropped) and then handed over in order. `net.pinged` is always
 * answered at once here, so the server's RTT never includes the scene's start-up.
 * A run in the same room again (Story 2.8, Back to lobby): batches that arrive after a host
 * unsubscribes are buffered again; `reset()` (called when the room returns to the lobby) drops
 * them, so the next run's scene never gets the previous run's events.
 *
 * Horde frames (`BYTES.HORDE_FRAME`, Story 2.5) are listened to from the join too, so the SDK
 * never warns about an unhandled type; until `onHorde` is called they are dropped (unreliable
 * snapshots: the next frame replaces them) and counted in `earlyHordeDropped`.
 *
 * `player.left` (Story 2.11) is listened to from the join as well; it goes to the `onPlayerLeft`
 * sink (the Game scene's toast) and is dropped while none listens (the lobby list follows the state).
 * Story 3.3: `shop.bought` / `shop.refused` likewise go to the `onShopAnswer` sink (the networked
 * host), dropped while none listens (a purchase is only made from a running Game scene).
 */
export class RunInbox {
  /** Latest RTT the server measured for this client (2.10 overlay). */
  rttMs = 0;
  /** Early event batches dropped because the buffer was full. */
  earlyDropped = 0;
  private closed = false;
  private readonly offs: (() => void)[] = [];
  private readonly early: SimEventsFlushed[] = [];
  private sink: ((m: SimEventsFlushed) => void) | null = null;
  /** Horde frames dropped because no game scene listened yet. */
  earlyHordeDropped = 0;
  private hordeSink: ((bytes: Uint8Array) => void) | null = null;
  private leftSink: ((m: PlayerLeft) => void) | null = null;
  private refusedSink: ((reason: PlaceError) => void) | null = null;
  private shopSink: ((a: ShopAnswer) => void) | null = null;
  /** Story 5.13: my latest `shop.offered` (highest build, rev); kept for a late Game scene start or a woken tab. */
  private offer: ShopOfferView | null = null;
  private repairSink: ((reason: RepairError) => void) | null = null;
  private upgradeSink: ((reason: UpgradeError) => void) | null = null;
  private sellSink: ((reason: SellError) => void) | null = null;
  private moveSink: ((r: MoveRefusal) => void) | null = null;

  constructor(private readonly room: Pick<NetRoomLike, "send" | "onMessage">) {
    this.offs.push(room.onMessage(S2C.SIM_EVENTS_FLUSHED, (m: SimEventsFlushed) => this.receiveEvents(m)));
    this.offs.push(room.onMessage(S2C.NET_PINGED, (m: NetPinged) => this.receivePing(m)));
    this.offs.push(room.onMessage(BYTES.HORDE_FRAME, (b: Uint8Array) => this.receiveHorde(b)));
    this.offs.push(room.onMessage(S2C.PLAYER_LEFT, (m: unknown) => this.receiveLeft(m)));
    this.offs.push(room.onMessage(S2C.BUILDING_REFUSED, (m: unknown) => this.receiveRefused(m)));
    this.offs.push(room.onMessage(S2C.SHOP_BOUGHT, (m: unknown) => this.receiveShop(parseShopBought(m))));
    this.offs.push(room.onMessage(S2C.SHOP_REFUSED, (m: unknown) => this.receiveShop(parseShopRefused(m))));
    this.offs.push(room.onMessage(S2C.SHOP_OFFERED, (m: unknown) => this.receiveOffer(parseShopOffered(m)))); // Story 5.13
    this.offs.push(room.onMessage(S2C.SHOP_UPGRADED, (m: unknown) => this.receiveShop(parseShopUpgraded(m)))); // Story 5.1
    this.offs.push(room.onMessage(S2C.SHOP_UPGRADE_REFUSED, (m: unknown) => this.receiveShop(parseShopUpgradeRefused(m))));
    this.offs.push(room.onMessage(S2C.SHOP_BOUGHT_ITEM, (m: unknown) => this.receiveShop(parseShopBoughtItem(m)))); // Story 5.11
    this.offs.push(room.onMessage(S2C.SHOP_REFUSED_ITEM, (m: unknown) => this.receiveShop(parseShopRefusedItem(m))));
    this.offs.push(room.onMessage(S2C.BUILDING_REPAIR_REFUSED, (m: unknown) => this.receiveRepairRefused(m)));
    this.offs.push(room.onMessage(S2C.BUILDING_UPGRADE_REFUSED, (m: unknown) => this.receiveUpgradeRefused(m)));
    this.offs.push(room.onMessage(S2C.BUILDING_SELL_REFUSED, (m: unknown) => this.receiveSellRefused(m))); // Story 5.20
    this.offs.push(room.onMessage(S2C.BUILDING_MOVE_REFUSED, (m: unknown) => this.receiveMoveRefused(m))); // Story 5.22
  }

  /** Story 5.22: each `building.move_refused` from now on (dropped while none listens). Returns the unsubscribe. */
  onMoveRefused(sink: (r: MoveRefusal) => void): () => void {
    this.moveSink = sink;
    return () => {
      if (this.moveSink === sink) this.moveSink = null;
    };
  }

  private receiveMoveRefused(m: unknown): void {
    if (this.closed || !this.moveSink) return;
    const r = parseMoveRefused(m);
    if (r) this.moveSink(r);
  }

  /** Story 5.20: each `building.sell_refused` from now on (dropped while none listens). Returns the unsubscribe. */
  onSellRefused(sink: (reason: SellError) => void): () => void {
    this.sellSink = sink;
    return () => {
      if (this.sellSink === sink) this.sellSink = null;
    };
  }

  private receiveSellRefused(m: unknown): void {
    if (this.closed || !this.sellSink) return;
    const reason = parseSellRefused(m);
    if (reason) this.sellSink(reason);
  }

  /** Story 5.9: each `building.upgrade_refused` from now on (dropped while none listens). Returns the unsubscribe. */
  onUpgradeRefused(sink: (reason: UpgradeError) => void): () => void {
    this.upgradeSink = sink;
    return () => {
      if (this.upgradeSink === sink) this.upgradeSink = null;
    };
  }

  private receiveUpgradeRefused(m: unknown): void {
    if (this.closed || !this.upgradeSink) return;
    const reason = parseUpgradeRefused(m);
    if (reason) this.upgradeSink(reason);
  }

  /** Story 3.7: each `building.repair_refused` from now on (dropped while none listens). Returns the unsubscribe. */
  onRepairRefused(sink: (reason: RepairError) => void): () => void {
    this.repairSink = sink;
    return () => {
      if (this.repairSink === sink) this.repairSink = null;
    };
  }

  private receiveRepairRefused(m: unknown): void {
    if (this.closed || !this.repairSink) return;
    const reason = parseRepairRefused(m);
    if (reason) this.repairSink(reason);
  }

  /** Story 3.4: each `building.refused` from now on (dropped while none listens). Returns the unsubscribe. */
  onBuildingRefused(sink: (reason: PlaceError) => void): () => void {
    this.refusedSink = sink;
    return () => {
      if (this.refusedSink === sink) this.refusedSink = null;
    };
  }

  /** Each purchase answer from now on (Story 3.3). Returns the unsubscribe. */
  onShopAnswer(sink: (a: ShopAnswer) => void): () => void {
    this.shopSink = sink;
    return () => {
      if (this.shopSink === sink) this.shopSink = null;
    };
  }

  /** Story 5.13: my latest offer (kept from the join, whoever listens), or null before the first. */
  latestOffer(): ShopOfferView | null {
    return this.offer;
  }

  private receiveOffer(o: ShopOfferView | null): void {
    if (this.closed || !o || !offerIsNewer(this.offer, o)) return;
    this.offer = o;
  }

  private receiveShop(a: ShopAnswer | null): void {
    if (this.closed || !this.shopSink || !a) return;
    this.shopSink(a);
  }

  /** Each `player.left` from now on (Story 2.11). Returns the unsubscribe. */
  onPlayerLeft(sink: (m: PlayerLeft) => void): () => void {
    this.leftSink = sink;
    return () => {
      if (this.leftSink === sink) this.leftSink = null;
    };
  }

  /** Each horde frame from now on (earlier ones were dropped). Returns the unsubscribe. */
  onHorde(sink: (bytes: Uint8Array) => void): () => void {
    this.hordeSink = sink;
    return () => {
      if (this.hordeSink === sink) this.hordeSink = null;
    };
  }

  /** Buffered batches first (in arrival order), then each new one. Returns the unsubscribe. */
  onEvents(sink: (m: SimEventsFlushed) => void): () => void {
    this.sink = sink;
    const early = this.early;
    for (let i = 0; i < early.length; i++) sink(early[i] as SimEventsFlushed);
    early.length = 0;
    return () => {
      if (this.sink === sink) this.sink = null;
    };
  }

  /**
   * Story 2.8: the room went back to the lobby. Drops buffered batches of the run that ended (the
   * server sends nothing in the lobby, so anything here is from that run) and the early counters.
   */
  reset(): void {
    this.offer = null; // Story 5.13: the next run draws from build 0 again
    this.early.length = 0;
    this.earlyDropped = 0;
    this.earlyHordeDropped = 0;
  }

  /** Stops listening for good. Safe to call twice. */
  close(): void {
    if (this.closed) return;
    this.closed = true;
    for (const off of this.offs) off();
    this.offs.length = 0;
    this.early.length = 0;
    this.sink = null;
    this.hordeSink = null;
    this.leftSink = null;
    this.refusedSink = null;
    this.shopSink = null;
    this.repairSink = null;
    this.upgradeSink = null;
  }

  private receiveRefused(m: unknown): void {
    if (this.closed || !this.refusedSink) return;
    const reason = parseBuildingRefused(m);
    if (reason) this.refusedSink(reason);
  }

  private receiveLeft(m: unknown): void {
    if (this.closed || !this.leftSink) return;
    const left = parsePlayerLeft(m);
    if (left) this.leftSink(left);
  }

  private receiveHorde(bytes: Uint8Array): void {
    if (this.closed) return;
    if (this.hordeSink) this.hordeSink(bytes);
    else this.earlyHordeDropped++;
  }

  private receiveEvents(m: SimEventsFlushed): void {
    if (this.closed) return;
    if (this.sink) {
      this.sink(m);
      return;
    }
    if (this.early.length >= EARLY_EVENT_BATCHES_MAX) {
      this.early.shift(); // only while no scene listens: never per tick in a running game
      this.earlyDropped++;
    }
    this.early.push(m);
  }

  /** Answer at once: the server's RTT is ping → pong. */
  private receivePing(m: NetPinged): void {
    if (this.closed || !m || typeof m.id !== "number") return;
    this.room.send(C2S.NET_PONG, { id: m.id });
    if (typeof m.rttMs === "number") this.rttMs = m.rttMs;
  }
}

/**
 * An online run seen from this device (Story 2.4): the room, and the player id and slot from
 * `run.joined` (taken from `lobbyStore.joinedInfo()`, which got it long before the start).
 * `leave` ends the run for this device (it goes through the lobby store, which owns the room).
 * `inbox` is the room's `RunInbox` from `lobbyStore.inbox()` (it has listened since the join);
 * tests may leave it out and get a fresh one.
 */
export class NetSession {
  readonly playerId: string;
  readonly slot: number;
  readonly inbox: RunInbox;
  private left = false;

  constructor(
    readonly room: NetRoomLike,
    joined: RunJoined,
    private readonly onLeave: () => void,
    inbox?: RunInbox,
  ) {
    this.playerId = joined.playerId;
    this.slot = joined.slot;
    this.inbox = inbox ?? new RunInbox(room);
  }

  /** Latest RTT the server measured for this client. */
  get rttMs(): number {
    return this.inbox.rttMs;
  }

  /** See `RunInbox.onEvents`. */
  onEvents(sink: (m: SimEventsFlushed) => void): () => void {
    return this.inbox.onEvents(sink);
  }

  /** See `RunInbox.onHorde`. */
  onHorde(sink: (bytes: Uint8Array) => void): () => void {
    return this.inbox.onHorde(sink);
  }

  /** See `RunInbox.onBuildingRefused`. */
  onBuildingRefused(sink: (reason: PlaceError) => void): () => void {
    return this.inbox.onBuildingRefused(sink);
  }

  /** See `RunInbox.onPlayerLeft`. */
  onPlayerLeft(sink: (m: PlayerLeft) => void): () => void {
    return this.inbox.onPlayerLeft(sink);
  }

  /** See `RunInbox.onRepairRefused`. */
  onRepairRefused(sink: (reason: RepairError) => void): () => void {
    return this.inbox.onRepairRefused(sink);
  }

  /** See `RunInbox.onUpgradeRefused` (Story 5.9). */
  onUpgradeRefused(sink: (reason: UpgradeError) => void): () => void {
    return this.inbox.onUpgradeRefused(sink);
  }

  /** See `RunInbox.onSellRefused` (Story 5.20). */
  onSellRefused(sink: (reason: SellError) => void): () => void {
    return this.inbox.onSellRefused(sink);
  }

  /** See `RunInbox.onMoveRefused` (Story 5.22). */
  onMoveRefused(sink: (r: MoveRefusal) => void): () => void {
    return this.inbox.onMoveRefused(sink);
  }

  /** See `RunInbox.onShopAnswer`. */
  onShopAnswer(sink: (a: ShopAnswer) => void): () => void {
    return this.inbox.onShopAnswer(sink);
  }

  /** See `RunInbox.latestOffer` (Story 5.13). */
  latestOffer(): ShopOfferView | null {
    return this.inbox.latestOffer();
  }

  /**
   * Story 2.8: this run ended but the room stays (Back to lobby). From now on `leave()` (e.g. the
   * Game scene's dispose) does nothing: the lobby store still owns the room and its inbox.
   */
  release(): void {
    this.left = true;
  }

  /**
   * Leaves the room for good (consented, `room.leave(true)` through the lobby store: Story 2.11's
   * Leave game, and the Game scene's dispose). Safe to call twice; a no-op after `release()`.
   */
  leave(): void {
    if (this.left) return;
    this.left = true;
    this.inbox.close();
    this.onLeave();
  }
}
