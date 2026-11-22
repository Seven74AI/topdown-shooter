import { C2S, S2C, type NetPinged, type RunJoined, type RunStateView, type SimEventsFlushed } from "@topdown/shared";

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
  /** Returns the unsubscribe. */
  onMessage<T>(type: string, cb: (message: T) => void): () => void;
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

  constructor(private readonly room: Pick<NetRoomLike, "send" | "onMessage">) {
    this.offs.push(room.onMessage(S2C.SIM_EVENTS_FLUSHED, (m: SimEventsFlushed) => this.receiveEvents(m)));
    this.offs.push(room.onMessage(S2C.NET_PINGED, (m: NetPinged) => this.receivePing(m)));
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

  /** Stops listening for good. Safe to call twice. */
  close(): void {
    if (this.closed) return;
    this.closed = true;
    for (const off of this.offs) off();
    this.offs.length = 0;
    this.early.length = 0;
    this.sink = null;
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

  /** Leaves the room for good (consented). Safe to call twice. */
  leave(): void {
    if (this.left) return;
    this.left = true;
    this.inbox.close();
    this.onLeave();
  }
}
