import {
  BOSS_STATE_FIELDS,
  BUILDING_STATE_FIELDS,
  INPUT_BYTES,
  PLAYER_STATE_FIELDS,
  RUN_STATE_FIELDS,
  type BuildingStateView,
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
  /**
   * Story 8.8 (`&loss=<pct>`): the lossy line. With probability `lossPct` / 100 per message, in each
   * direction, that message waits an extra `stallMs` (a TCP retransmit stall); order is kept, so
   * everything behind it waits too (head-of-line). Never a reorder, never a dropped message.
   * 0 / absent = no extra random draw (`?lag=&jitter=` behave bit for bit as before).
   */
  lossPct?: number;
  /** Story 8.8 (`&stall=<ms>`): the extra wait of a stalled message (default `DEFAULT_STALL_MS`). */
  stallMs?: number;
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
const BUILDING_KEYS = Object.keys(BUILDING_STATE_FIELDS);
const BOSS_KEYS = Object.keys(BOSS_STATE_FIELDS); // Story 6.5

type Fields = Record<string, unknown>;

/**
 * Story 8.8 (decision 8.8 D2): one "lost packet" costs a 200 ms stall (about one 4G retransmit, the
 * network audit's main rows, docs/perf/network-audit-2026-11.md §3.5); `&stall=400` is the worse case.
 * Kept here, not in netConfig.ts (Story 8.9 owns that file in the same build round).
 */
export const DEFAULT_STALL_MS = 200;
/** Largest `?lag` / `?jitter` accepted (ms; Story 2.6, moved here from urlOptions.ts by Story 8.8 review N2). */
export const MAX_THROTTLE_LAG_MS = 2000;
export const MAX_THROTTLE_JITTER_MS = 1000;
/** Story 8.8: largest `&loss` (%) and `&stall` (ms) accepted. */
export const MAX_THROTTLE_LOSS_PCT = 20;
export const MAX_THROTTLE_STALL_MS = 1000;

/**
 * Story 8.8: the throttle the fight reads through, for the `?debug=1` overlay line (set by
 * `main.ts › throttled()`, cleared when its room is left). Null when `?lag` / `&loss` is off.
 */
export const activeThrottle: { current: DevThrottle | null } = { current: null };

/**
 * Story 8.8 (AC 1): the overlay's ` · loss 1 % × 200 (stalls ↓3 ↑2)` suffix while the lossy line is
 * on (↓ = server→phone, ↑ = phone→server), else "".
 */
export function throttleLossText(t: { readonly lossPct: number; readonly stallMs: number; readonly stallsIn: number; readonly stallsOut: number } | null): string {
  if (!t || t.lossPct <= 0) return "";
  return ` · loss ${t.lossPct} % × ${t.stallMs} (stalls ↓${t.stallsIn} ↑${t.stallsOut})`;
}

/** A plain copy of the room state (all view fields), reused: player objects persist per id. */
class StateCopy {
  readonly players = new Map<string, Fields>();
  /** Story 3.4: buildings by id, copied like players (objects persist per id). */
  readonly buildings = new Map<string, Fields>();
  /** Story 6.5: the boss record (one nested object, copied field by field). */
  readonly boss: Fields = {};
  readonly view: Fields = { players: this.players, buildings: this.buildings, boss: this.boss };
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
  private readonly seenBuildings = new Map<string, number>();
  private readonly copyBuilding = (b: BuildingStateView, id: string): void => {
    let d = this.buildings.get(id);
    if (!d) {
      d = {}; // once per building id and copy slot
      this.buildings.set(id, d);
    }
    const src = b as unknown as Fields;
    for (let i = 0; i < BUILDING_KEYS.length; i++) {
      const k = BUILDING_KEYS[i] as string;
      d[k] = src[k];
    }
    this.seenBuildings.set(id, this.gen);
  };
  private readonly sweepBuildings = (_b: Fields, id: string): void => {
    if (this.seenBuildings.get(id) === this.gen) return;
    this.buildings.delete(id);
    this.seenBuildings.delete(id);
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
    src.buildings?.forEach(this.copyBuilding);
    this.buildings.forEach(this.sweepBuildings);
    const boss = (src as { boss?: unknown }).boss as Fields | undefined;
    if (boss) for (let i = 0; i < BOSS_KEYS.length; i++) this.boss[BOSS_KEYS[i] as string] = boss[BOSS_KEYS[i] as string];
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
  /** Story 8.11: a binary message (the input): its type (-1 = none) and a pooled copy of its bytes. */
  bytesType: number;
  readonly bytes: Uint8Array;
}

type StateListener = (state: RunStateView) => void;
type MessageHandler = (message: unknown) => void;

/**
 * Dev network throttle (Story 2.6, `?lag=<rttMs>&jitter=<ms>`, release builds too; it only hurts
 * the device that turns it on). Wraps the room the fight reads through, so NetSimHost and the
 * RunInbox don't know it exists:
 *
 * - outgoing `send` (pongs, other messages) and `sendBytes` (Story 8.11: the binary input) are held `lag/2 ± jitter/2`;
 * - incoming state patches, messages (event batches, pings) and binary frames (Story 2.5 horde)
 *   are held the same way. Patches are copied into pooled plain copies (`state` is the copy last
 *   handed on, so HP and positions are delayed alike), byte frames into pooled THROTTLE_BYTES_MAX (2055-byte, Story 8.10: one horde keyframe of 256) buffers;
 *   message objects are fresh per message from the SDK and are held by reference.
 * - Order is kept per direction (TCP never reorders): `due = max(lastDue, now + lag/2 + u)`.
 * - Story 8.8 (`&loss=<pct>&stall=<ms>`): a message drawn as "lost" adds `stallMs` to its due; the
 *   ordered `max(lastDue, …)` makes every message behind it wait too (the head-of-line model).
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
  /** Story 8.8: the lossy line (0 = off). */
  readonly lossPct: number;
  readonly stallMs: number;
  /** Story 8.8: stalls injected so far, per direction (overlay, tests). */
  stallsIn = 0;
  stallsOut = 0;
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
    this.lossPct = Math.min(MAX_THROTTLE_LOSS_PCT, Math.max(0, opts.lossPct ?? 0));
    this.stallMs = Math.min(MAX_THROTTLE_STALL_MS, Math.max(0, opts.stallMs ?? DEFAULT_STALL_MS));
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
      bytesType: -1,
      bytes: new Uint8Array(INPUT_BYTES),
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
    const e = this.queueOutgoing();
    if (!e) return;
    e.type = type;
    e.bytesType = -1;
    e.message = structuredClone(message); // rare (pongs 1/s, shop, ready…)
  }

  /** Story 8.11: the binary input, held like any outgoing message; its bytes are copied now (NetSimHost reuses them). */
  sendBytes(type: number, bytes: Uint8Array): void {
    if (bytes.length !== INPUT_BYTES) {
      this.inner.sendBytes(type, bytes); // nothing else is sent as bytes; never held in a wrong-size slot
      return;
    }
    const e = this.queueOutgoing();
    if (!e) return;
    e.bytesType = type;
    e.bytes.set(bytes); // no allocation
    e.message = null;
  }

  /** The next outgoing slot, its due time set (in order: never earlier than the one before), or null once closed. */
  private queueOutgoing(): Outgoing | null {
    if (this.closed) return null;
    if (this.outCount === THROTTLE_QUEUE_SIZE) this.deliverOutgoing();
    const e = this.outgoing[
      (this.outHead + this.outCount) % THROTTLE_QUEUE_SIZE
    ] as Outgoing;
    this.outCount++;
    let due = this.dueFrom(this.now());
    if (this.stalled()) {
      due += this.stallMs;
      this.stallsOut++;
    }
    e.due = this.outLastDue = Math.max(this.outLastDue, due);
    return e;
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

  /** Story 8.8: this message is "lost" and waits for its retransmit (no draw when the line is clean). */
  private stalled(): boolean {
    return this.lossPct > 0 && this.random() * 100 < this.lossPct;
  }

  private nextIncoming(): Incoming {
    if (this.inCount === THROTTLE_QUEUE_SIZE) this.deliverIncoming();
    const e = this.incoming[
      (this.inHead + this.inCount) % THROTTLE_QUEUE_SIZE
    ] as Incoming;
    this.inCount++;
    let due = this.dueFrom(this.now());
    if (this.stalled()) {
      due += this.stallMs;
      this.stallsIn++;
    }
    e.due = this.inLastDue = Math.max(this.inLastDue, due);
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
    if (e.bytesType >= 0) {
      this.inner.sendBytes(e.bytesType, e.bytes); // copied synchronously by the SDK
      e.bytesType = -1;
      return;
    }
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
