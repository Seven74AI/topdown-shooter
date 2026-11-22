import {
  BYTES,
  C2S,
  S2C,
  type NetPinged,
  type PlayerLeft,
  type RunJoined,
  type RunStateView,
  type ShopError,
  type SimEventsFlushed,
} from "@topdown/shared";
import type { ShopAnswer } from "../sim/SimHost";

const SHOP_ERRORS: readonly ShopError[] = [
  "not_build",
  "unknown_player",
  "not_for_sale",
  "already_owned",
  "slot_required",
  "invalid_amount",
  "insufficient_funds",
];

/** A well-formed `shop.bought` (Story 3.3) as an answer, or null. */
export function parseShopBought(m: unknown): ShopAnswer | null {
  const o = m as { weapon?: unknown; slot?: unknown } | null;
  if (!o || typeof o.weapon !== "string" || (o.slot !== 0 && o.slot !== 1)) return null;
  return { ok: true, weapon: o.weapon, slot: o.slot };
}

/** A well-formed `shop.refused` (Story 3.3) as an answer, or null (an unknown error reads as `not_for_sale`). */
export function parseShopRefused(m: unknown): ShopAnswer | null {
  const o = m as { weapon?: unknown; error?: unknown } | null;
  if (!o || typeof o.weapon !== "string" || typeof o.error !== "string") return null;
  const error = (SHOP_ERRORS as readonly string[]).includes(o.error) ? (o.error as ShopError) : "not_for_sale";
  return { ok: false, weapon: o.weapon, error };
}

/** A well-formed `player.left` (Story 2.11), or null. */
export function parsePlayerLeft(m: unknown): PlayerLeft | null {
  const o = m as Partial<PlayerLeft> | null;
  if (!o || typeof o.playerId !== "string" || typeof o.name !== "string") return null;
  if (o.reason !== "left" && o.reason !== "disconnected") return null;
  return { playerId: o.playerId, name: o.name, reason: o.reason };
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
  private shopSink: ((a: ShopAnswer) => void) | null = null;

  constructor(private readonly room: Pick<NetRoomLike, "send" | "onMessage">) {
    this.offs.push(room.onMessage(S2C.SIM_EVENTS_FLUSHED, (m: SimEventsFlushed) => this.receiveEvents(m)));
    this.offs.push(room.onMessage(S2C.NET_PINGED, (m: NetPinged) => this.receivePing(m)));
    this.offs.push(room.onMessage(BYTES.HORDE_FRAME, (b: Uint8Array) => this.receiveHorde(b)));
    this.offs.push(room.onMessage(S2C.PLAYER_LEFT, (m: unknown) => this.receiveLeft(m)));
    this.offs.push(room.onMessage(S2C.SHOP_BOUGHT, (m: unknown) => this.receiveShop(parseShopBought(m))));
    this.offs.push(room.onMessage(S2C.SHOP_REFUSED, (m: unknown) => this.receiveShop(parseShopRefused(m))));
  }

  /** Each purchase answer from now on (Story 3.3). Returns the unsubscribe. */
  onShopAnswer(sink: (a: ShopAnswer) => void): () => void {
    this.shopSink = sink;
    return () => {
      if (this.shopSink === sink) this.shopSink = null;
    };
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
    this.shopSink = null;
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

  /** See `RunInbox.onPlayerLeft`. */
  onPlayerLeft(sink: (m: PlayerLeft) => void): () => void {
    return this.inbox.onPlayerLeft(sink);
  }

  /** See `RunInbox.onShopAnswer`. */
  onShopAnswer(sink: (a: ShopAnswer) => void): () => void {
    return this.inbox.onShopAnswer(sink);
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
