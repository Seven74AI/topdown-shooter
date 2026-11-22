import {
  C2S,
  NEUTRAL_INPUT,
  PLAYER_STATE_FIELDS,
  RUN_STATE_FIELDS,
  type PlayerInput,
  type PlayerStateView,
  type RunStateView,
} from "@topdown/shared";
import type { NetRoomLike } from "./session";
import { THROTTLE_BYTES_MAX, THROTTLE_QUEUE_SIZE } from "./netConfig";

export interface DevThrottleOptions {
  /** Simulated round trip (ms): each direction gets half. */
  lagMs: number;
  /** Spread of the one-way delay (ms): ± half of it, uniform. */
  jitterMs: number;
  /** Tests inject these. */
  random?: () => number;
  now?: () => number;
}

/**
 * Every field of the state (shared key lists, retro A2): checked at compile time against the views
 * AND the server schema (RunState.ts), so a new schema field can't be left out of this copy.
 */
const PLAYER_KEYS = Object.keys(PLAYER_STATE_FIELDS);
const STATE_KEYS = Object.keys(RUN_STATE_FIELDS);

type Fields = Record<string, unknown>;

/** A plain copy of the room state (all view fields), reused: player objects persist per id. */
class StateCopy {
  readonly players = new Map<string, Fields>();
  readonly view: Fields = { players: this.players };
  private gen = 0;
  private readonly seen = new Map<string, number>();
  private readonly copyPlayer = (p: PlayerStateView, id: string): void => {
    let d = this.players.get(id);
    if (!d) {
      d = {}; // once per player id and copy slot
      this.players.set(id, d);
    }
    const src = p as unknown as Fields;
    for (let i = 0; i < PLAYER_KEYS.length; i++) {
      const k = PLAYER_KEYS[i] as string;
      d[k] = src[k];
    }
    this.seen.set(id, this.gen);
  };
  private readonly sweep = (_p: Fields, id: string): void => {
    if (this.seen.get(id) === this.gen) return;
    this.players.delete(id);
    this.seen.delete(id);
  };

  copyFrom(src: RunStateView): void {
    const s = src as unknown as Fields;
    for (let i = 0; i < STATE_KEYS.length; i++) {
      const k = STATE_KEYS[i] as string;
      this.view[k] = s[k];
    }
    this.gen++;
    src.players?.forEach(this.copyPlayer);
    this.players.forEach(this.sweep);
  }

  get asState(): RunStateView {
    return this.view as unknown as RunStateView;
  }
}

const KIND_STATE = 0;
const KIND_MESSAGE = 1;
const KIND_BYTES = 2;

interface Incoming {
  due: number;
  kind: number;
  type: string | number;
  message: unknown;
  state: StateCopy | null;
  bytes: Uint8Array | null;
  length: number;
}

interface Outgoing {
  due: number;
  type: string;
  message: unknown;
  readonly input: { -readonly [K in keyof PlayerInput]: PlayerInput[K] };
}

type StateListener = (state: RunStateView) => void;
type MessageHandler = (message: unknown) => void;

/**
 * Dev network throttle (Story 2.6, `?lag=<rttMs>&jitter=<ms>`, release builds too; it only hurts
 * the device that turns it on). Wraps the room the fight reads through, so NetSimHost and the
 * RunInbox don't know it exists:
 *
 * - outgoing `send` (inputs, pongs) is held `lag/2 ± jitter/2`;
 * - incoming state patches, messages (event batches, pings) and binary frames (Story 2.5 horde)
 *   are held the same way. Patches are copied into pooled plain copies (`state` is the copy last
 *   handed on, so HP and positions are delayed alike), byte frames into pooled 2054-byte buffers;
 *   message objects are fresh per message from the SDK and are held by reference.
 * - Order is kept per direction (TCP never reorders): `due = max(lastDue, now + lag/2 + u)`.
 *
 * Nothing runs on timers: `pump(nowMs)` delivers what is due, from the game loop. When a queue is
 * full (a hidden tab stops the loop), its oldest entry is delivered at once.
 */
export class DevThrottle implements NetRoomLike {
  readonly onStateChange: NetRoomLike["onStateChange"];
  private readonly random: () => number;
  private readonly now: () => number;
  private readonly oneWayMs: number;
  private readonly spreadMs: number;
  private readonly incoming: Incoming[];
  private inHead = 0;
  private inCount = 0;
  private inLastDue = -Infinity;
  private readonly outgoing: Outgoing[];
  private outHead = 0;
  private outCount = 0;
  private outLastDue = -Infinity;
  private readonly delivered = new StateCopy();
  private hasDelivered = false;
  private readonly listeners: StateListener[] = [];
  private readonly handlers = new Map<string | number, MessageHandler[]>();
  private readonly innerOffs: (() => void)[] = [];
  private closed = false;
  private readonly onInnerState = (state: RunStateView): void =>
    this.receiveState(state);

  constructor(
    private readonly inner: NetRoomLike,
    opts: DevThrottleOptions,
  ) {
    this.oneWayMs = Math.max(0, opts.lagMs) / 2;
    this.spreadMs = Math.max(0, opts.jitterMs);
    this.random = opts.random ?? Math.random;
    this.now = opts.now ?? (() => performance.now());
    this.incoming = Array.from({ length: THROTTLE_QUEUE_SIZE }, () => ({
      due: 0,
      kind: KIND_MESSAGE,
      type: "",
      message: null,
      state: null,
      bytes: null,
      length: 0,
    }));
    this.outgoing = Array.from({ length: THROTTLE_QUEUE_SIZE }, () => ({
      due: 0,
      type: "",
      message: null,
      input: { ...NEUTRAL_INPUT },
    }));
    const listeners = this.listeners;
    const on = (cb: StateListener): void => {
      if (!listeners.includes(cb)) listeners.push(cb);
    };
    on.remove = (cb: StateListener): void => {
      const i = listeners.indexOf(cb);
      if (i >= 0) listeners.splice(i, 1);
    };
    this.onStateChange = on;
    inner.onStateChange(this.onInnerState);
  }

  /** The state last handed on (the real room's until the first delayed patch). */
  get state(): RunStateView {
    return this.hasDelivered ? this.delivered.asState : this.inner.state;
  }

  /** Messages waiting, per direction (tests). */
  get pending(): { incoming: number; outgoing: number } {
    return { incoming: this.inCount, outgoing: this.outCount };
  }

  send(type: string, message: unknown): void {
    if (this.closed) return;
    if (this.outCount === THROTTLE_QUEUE_SIZE) this.deliverOutgoing();
    const e = this.outgoing[
      (this.outHead + this.outCount) % THROTTLE_QUEUE_SIZE
    ] as Outgoing;
    this.outCount++;
    e.due = this.outLastDue = Math.max(
      this.outLastDue,
      this.dueFrom(this.now()),
    );
    e.type = type;
    if (type === C2S.INPUT_SEND) {
      Object.assign(e.input, message); // NetSimHost reuses its send buffer: copy now (no allocation)
      e.message = e.input;
    } else {
      e.message = structuredClone(message); // rare (pongs, 1/s)
    }
  }

  onMessage<T>(type: string | number, cb: (message: T) => void): () => void {
    let list = this.handlers.get(type);
    if (!list) {
      list = [];
      this.handlers.set(type, list);
      // The SDK keys handlers by type; Story 2.5's horde frame type is numeric.
      const subscribe = this.inner.onMessage as (
        t: string | number,
        h: (m: unknown) => void,
      ) => () => void;
      this.innerOffs.push(
        subscribe.call(this.inner, type, (m: unknown) =>
          this.receiveMessage(type, m),
        ),
      );
    }
    const handlers = list;
    const h = cb as MessageHandler;
    handlers.push(h);
    return () => {
      const i = handlers.indexOf(h);
      if (i >= 0) handlers.splice(i, 1);
    };
  }

  leave(consented?: boolean): unknown {
    this.close();
    return this.inner.leave(consented);
  }

  /** Delivers everything due by `nowMs`, both directions. Call once per frame. */
  pump(nowMs: number): void {
    while (
      this.outCount > 0 &&
      (this.outgoing[this.outHead] as Outgoing).due <= nowMs
    )
      this.deliverOutgoing();
    while (
      this.inCount > 0 &&
      (this.incoming[this.inHead] as Incoming).due <= nowMs
    )
      this.deliverIncoming();
  }

  /** Stops listening to the room and drops what is in flight. Safe to call twice. */
  close(): void {
    if (this.closed) return;
    this.closed = true;
    this.inner.onStateChange.remove(this.onInnerState);
    for (const off of this.innerOffs) off();
    this.innerOffs.length = 0;
    this.handlers.clear();
    this.listeners.length = 0;
    this.inCount = 0;
    this.outCount = 0;
  }

  private dueFrom(nowMs: number): number {
    return nowMs + this.oneWayMs + (this.random() - 0.5) * this.spreadMs;
  }

  private nextIncoming(): Incoming {
    if (this.inCount === THROTTLE_QUEUE_SIZE) this.deliverIncoming();
    const e = this.incoming[
      (this.inHead + this.inCount) % THROTTLE_QUEUE_SIZE
    ] as Incoming;
    this.inCount++;
    e.due = this.inLastDue = Math.max(this.inLastDue, this.dueFrom(this.now()));
    return e;
  }

  private receiveState(state: RunStateView): void {
    if (this.closed || !state) return;
    const e = this.nextIncoming();
    e.kind = KIND_STATE;
    e.state ??= new StateCopy(); // once per queue slot
    e.state.copyFrom(state);
  }

  private receiveMessage(type: string | number, m: unknown): void {
    if (this.closed) return;
    const e = this.nextIncoming();
    e.type = type;
    if (m instanceof Uint8Array && m.length <= THROTTLE_BYTES_MAX) {
      e.kind = KIND_BYTES;
      e.bytes ??= new Uint8Array(THROTTLE_BYTES_MAX); // once per queue slot
      e.bytes.set(m);
      e.length = m.length;
    } else {
      e.kind = KIND_MESSAGE;
      e.message = m instanceof Uint8Array ? m.slice() : m;
    }
  }

  private deliverOutgoing(): void {
    const e = this.outgoing[this.outHead] as Outgoing;
    this.outHead = (this.outHead + 1) % THROTTLE_QUEUE_SIZE;
    this.outCount--;
    const m = e.message;
    e.message = null;
    this.inner.send(e.type, m); // encoded synchronously by the SDK
  }

  private deliverIncoming(): void {
    const e = this.incoming[this.inHead] as Incoming;
    this.inHead = (this.inHead + 1) % THROTTLE_QUEUE_SIZE;
    this.inCount--;
    if (e.kind === KIND_STATE) {
      this.delivered.copyFrom((e.state as StateCopy).asState);
      this.hasDelivered = true;
      const state = this.delivered.asState;
      for (let i = 0; i < this.listeners.length; i++)
        (this.listeners[i] as StateListener)(state);
      return;
    }
    const list = this.handlers.get(e.type);
    const m =
      e.kind === KIND_BYTES
        ? (e.bytes as Uint8Array).subarray(0, e.length)
        : e.message;
    e.message = null;
    if (!list) return;
    for (let i = 0; i < list.length; i++) (list[i] as MessageHandler)(m);
  }
}
