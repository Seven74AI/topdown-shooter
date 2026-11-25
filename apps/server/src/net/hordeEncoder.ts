import {
  BYTES,
  HORDE_BACKPRESSURE_BYTES,
  HORDE_CHG_FAR,
  HORDE_CHG_HEADING,
  HORDE_CHG_POS_FULL,
  HORDE_CHG_POS_SMALL,
  HORDE_CHG_POS_TINY,
  HORDE_CHG_TYPE_STATE,
  HORDE_DELTA_HEADER_BYTES,
  HORDE_HEADER_BYTES,
  HORDE_HEADING_TOLERANCE,
  HORDE_KEY_INTERVAL_TICKS,
  HORDE_KIND_DELTA,
  HORDE_MAX_FRAME_BYTES,
  HORDE_NEAR_M,
  HORDE_RECORD_BYTES,
  HORDE_SMALL_MOVE_CM,
  HORDE_TINY_MOVE_MAX_CM,
  HORDE_TINY_MOVE_MIN_CM,
  HORDE_VIEW_MARGIN_M,
  isFarRefreshTick,
  quantizePos,
  writeHordeRecordCm,
  ZOMBIE_POOL_CAPACITY,
  isRushState,
  inRect,
  packTypeState,
  wireState,
  quantizeHeading,
  queryRect,
  rebuildGrid,
  viewRect,
  writeHordeHeader,
  zombieNetId,
  type Rect,
  type World,
} from "@topdown/shared";
import { ClientState } from "@colyseus/core";

/** Movement shorter than this keeps the last heading (a zombie standing still doesn't snap to +x). */
export const HEADING_MIN_MOVE_M = 1e-4;

/** The slice of a Colyseus client the encoder uses (tests pass fakes). */
export interface HordeClient {
  sendBytes(type: number, bytes: Uint8Array): void;
  /**
   * Colyseus `ClientState`. Only JOINED clients get frames: for any other state 0.18's
   * `enqueueClientRaw` queues bytes and replays them on join, which would break "never queued"
   * (Story 2.5 review; matters once Epic 8 adds reconnection).
   */
  readonly state: number;
  /** The `ws` socket; `bufferedAmount` is what it has not written yet. */
  readonly ref: unknown;
}

/** Per-client counters (AC 4, Task 9). `horde_stats` logs them on `wave.ended`. */
export interface HordeStats {
  framesSent: number;
  framesSkipped: number;
  /** Payload bytes plus the 2-byte Colyseus header (`[protocol][type]`) of each frame sent. */
  bytesSent: number;
  /** Story 8.10: frames sent as keyframes (join, after a skip, every second, or when a delta wasn't smaller). */
  keyframes: number;
}

export const newHordeStats = (): HordeStats => ({ framesSent: 0, framesSkipped: 0, bytesSent: 0, keyframes: 0 });

/** `[ROOM_DATA_BYTES][type]` in front of every frame: the type 1 is a 1-byte number. */
export const COLYSEUS_BYTES_HEADER = 2;

const bufferedAmount = (ref: unknown): number => {
  const b = (ref as { bufferedAmount?: unknown } | null)?.bufferedAmount;
  return typeof b === "number" ? b : 0;
};

/**
 * Story 8.10: what one client was last SENT (= what its phone holds: the socket is ordered and
 * reliable; a skipped frame sets `needsKey`). Fixed size (256 slots): no growth over endless waves.
 */
export class HordeClientState {
  hasBase = false;
  /** The next frame must be a keyframe (first frame, after a skip, a reconnect). */
  needsKey = true;
  /** Ticks since the last keyframe; starts at the client's stagger phase after the first one. */
  sinceKey = 0;
  lastTick = 0;
  readonly inSet = new Uint8Array(SLOTS);
  readonly netId = new Uint16Array(SLOTS);
  readonly xCm = new Uint16Array(SLOTS);
  readonly yCm = new Uint16Array(SLOTS);
  readonly heading = new Uint8Array(SLOTS);
  readonly typeState = new Uint8Array(SLOTS);
  readonly far = new Uint8Array(SLOTS);
  constructor(readonly keyPhase: number) {}
}

const SLOTS = 256;
const ACT_NONE = 0;
const ACT_NEW = 1;
const ACT_CHANGED = 2;
const ACT_LEFT = 3;

const tiny = (d: number): boolean => d >= HORDE_TINY_MOVE_MIN_CM && d <= HORDE_TINY_MOVE_MAX_CM;

/** Steps between two headings the short way round (0–128). */
export const headingSteps = (a: number, b: number): number => {
  const d = (a - b) & 0xff;
  return d > 128 ? 256 - d : d;
};

/**
 * Builds and sends horde frames (Story 2.5; Story 8.10: per-client keyframes and deltas), one
 * encoder per room. Preallocated: a tick allocates nothing here (Colyseus's own `sendBytes` copies
 * the payload into a fresh frame; the per-client state is made once per client object).
 *
 * Per tick: `prepare(world)` once (grid rebuild, headings, rusher list), then `send` per client:
 * the zombies inside the client's view rectangle plus HORDE_VIEW_MARGIN_M, plus every rusher
 * (the rush markers and edge arrows need off-screen ones), each once. Against what that client
 * holds: new = full record, changed = slot + mask + what changed, left = slot. Zombies farther than
 * `nearM` from the view centre are refreshed every 2nd tick (by slot parity); in the game `nearM` is
 * HORDE_NEAR_M = Infinity (B7: every zombie every tick), the far rule only with an explicit radius
 * (HORDE_FAR_RULE_RADIUS_M, tests and a later story). A keyframe goes
 * out on a client's first frame (join, a reconnect = a new client object, a late scene start: the
 * phone decodes from the join), after a skipped frame, every HORDE_KEY_INTERVAL_TICKS (staggered
 * per client), and whenever the delta would not be smaller.
 */
export class HordeEncoder {
  private readonly bytes = new Uint8Array(HORDE_MAX_FRAME_BYTES);
  private readonly view = new DataView(this.bytes.buffer);
  /** Changed and left records, copied behind the new ones once the counts are known. */
  private readonly chg = new Uint8Array(HORDE_MAX_FRAME_BYTES);
  private readonly left = new Uint8Array(SLOTS);
  /** `bytes.subarray(0, n)` for every length n, made once: a send creates no view. */
  private readonly frames: Uint8Array[];
  private readonly ids: Int32Array;
  private readonly heading: Uint8Array;
  private readonly lastGeneration: Int16Array;
  private readonly rushers: Int32Array;
  private rusherCount = 0;
  private readonly rect: Rect = { minX: 0, minY: 0, maxX: 0, maxY: 0 };
  private tick = 0;
  /** Per slot, for the client being encoded: wanted this tick (stamp), and the values to send. */
  private readonly wanted: Int32Array;
  private stamp = 0;
  private readonly tNetId = new Uint16Array(SLOTS);
  private readonly tX = new Uint16Array(SLOTS);
  private readonly tY = new Uint16Array(SLOTS);
  private readonly tHeading = new Uint8Array(SLOTS);
  private readonly tTypeState = new Uint8Array(SLOTS);
  private readonly tFar = new Uint8Array(SLOTS);
  /** Per slot: what the delta does to it, and the heading the phone ends with. */
  private readonly act = new Uint8Array(SLOTS);
  private readonly endHeading = new Uint8Array(SLOTS);
  /** Story 8.10: per client object (a reconnect brings a new one: a fresh state, so a keyframe). */
  private readonly clients = new WeakMap<object, HordeClientState>();
  private clientsMade = 0;
  /** True when the last `encodeFor` wrote a keyframe. */
  lastWasKey = false;

  private readonly nearSq: number;

  /**
   * `nearM`: the far rule's radius. Default HORDE_NEAR_M = Infinity (B7: off, every zombie at 20 Hz);
   * tests and tools pass HORDE_FAR_RULE_RADIUS_M (8 m) to run the far rule.
   */
  constructor(
    private readonly capacity = ZOMBIE_POOL_CAPACITY,
    nearM = HORDE_NEAR_M,
  ) {
    this.nearSq = nearM * nearM;
    if (capacity > SLOTS) throw new Error(`HordeEncoder: capacity ${capacity} > ${SLOTS} slots`);
    this.ids = new Int32Array(capacity);
    this.heading = new Uint8Array(capacity);
    this.lastGeneration = new Int16Array(capacity).fill(-1);
    this.rushers = new Int32Array(capacity);
    this.wanted = new Int32Array(SLOTS);
    this.frames = Array.from({ length: HORDE_MAX_FRAME_BYTES + 1 }, (_, n) => this.bytes.subarray(0, n));
  }

  /**
   * Once per tick, after the step. Rebuilds `world.zombieGrid` (zombies moved after the AI's own
   * rebuild and the wave director spawned new ones; combat rebuilds it again before any sim query,
   * so this never changes the simulation), then headings from this tick's movement.
   */
  prepare(world: World): void {
    const z = world.zombies;
    rebuildGrid(world.zombieGrid, z.aliveIds, z.aliveCount, z.x, z.y);
    this.tick = world.tick;
    this.rusherCount = 0;
    for (let i = 0; i < z.aliveCount; i++) {
      const id = z.aliveIds[i] as number;
      const gen = z.generation[id] as number;
      if (this.lastGeneration[id] !== gen) {
        this.lastGeneration[id] = gen; // a new zombie in this slot: no heading from the dead one
        this.heading[id] = 0;
      }
      const dx = (z.x[id] as number) - (z.prevX[id] as number);
      const dy = (z.y[id] as number) - (z.prevY[id] as number);
      if (dx * dx + dy * dy > HEADING_MIN_MOVE_M * HEADING_MIN_MOVE_M) this.heading[id] = quantizeHeading(dx, dy);
      if (isRushState(z.state[id] as number)) this.rushers[this.rusherCount++] = id;
    }
  }

  /** The state kept for `client` (made on first use; a new client object gets a new one). */
  stateFor(client: object): HordeClientState {
    let st = this.clients.get(client);
    if (!st) {
      // Stagger: clients joining together get their 1 s keyframes on different ticks (AC 4).
      st = new HordeClientState((this.clientsMade++ * 7) % HORDE_KEY_INTERVAL_TICKS);
      this.clients.set(client, st);
    }
    return st;
  }

  /** Story 8.1 hook: the next frame to this client is a keyframe (a reconnect on the same object, a reset). */
  forceKey(client: object): void {
    this.stateFor(client).needsKey = true;
  }

  /**
   * Story 8.1 hook (call it in `RunRoom.attachClient`: first join, reconnect with the same sessionId,
   * takeover, seat restore): a fresh delta baseline for this client — nothing it held before is
   * assumed, and its next frame is a keyframe.
   */
  resetHordeStream(client: object): void {
    const st = this.stateFor(client);
    st.hasBase = false;
    st.needsKey = true;
    st.inSet.fill(0);
  }

  /**
   * Story 8.1 hook (takeover / final leave): drop this client's state. Optional — the state is held
   * in a WeakMap keyed by the client object, so a gone client is collected anyway (no leak).
   */
  forgetClient(client: object): void {
    this.clients.delete(client);
  }

  /**
   * The wanted set for a view centred on (px, py): ids + per-slot targets. Returns the count.
   */
  private collect(world: World, px: number, py: number): number {
    const z = world.zombies;
    const r = viewRect(world.map, px, py, HORDE_VIEW_MARGIN_M, this.rect);
    let n = queryRect(world.zombieGrid, z.x, z.y, r.minX, r.minY, r.maxX, r.maxY, this.ids);
    for (let k = 0; k < this.rusherCount && n < this.capacity; k++) {
      const id = this.rushers[k] as number;
      if (!inRect(r, z.x[id] as number, z.y[id] as number)) this.ids[n++] = id; // inside ones are in already
    }
    const stamp = ++this.stamp;
    for (let i = 0; i < n; i++) {
      const id = this.ids[i] as number;
      const x = z.x[id] as number;
      const y = z.y[id] as number;
      this.wanted[id] = stamp;
      this.tNetId[id] = zombieNetId(id, z.generation[id] as number);
      this.tX[id] = quantizePos(x);
      this.tY[id] = quantizePos(y);
      this.tHeading[id] = this.heading[id] as number;
      // Story 5.4: the burning bit
      this.tTypeState[id] = packTypeState(z.type[id] as number, wireState(z.state[id] as number, (z.igniteTicks[id] as number) > 0));
      const dx = x - px;
      const dy = y - py;
      this.tFar[id] = dx * dx + dy * dy > this.nearSq ? 1 : 0;
    }
    return n;
  }

  /** A keyframe of the wanted set (slot order) into the scratch buffer; returns its length. */
  private writeKey(n: number): number {
    const view = this.view;
    const stamp = this.stamp;
    writeHordeHeader(view, this.tick, n);
    let o = HORDE_HEADER_BYTES;
    for (let slot = 0; slot < SLOTS; slot++) {
      if (this.wanted[slot] !== stamp) continue;
      writeHordeRecordCm(view, o, this.tNetId[slot] as number, this.tX[slot] as number, this.tY[slot] as number, this.tHeading[slot] as number, this.tTypeState[slot] as number);
      o += HORDE_RECORD_BYTES;
    }
    return o;
  }

  /**
   * Builds today's full frame (a keyframe) for a view centred on (px, py), statelessly. Returns a
   * view of the scratch buffer (valid until the next call). Tools and the bandwidth tests use it.
   */
  encode(world: World, px: number, py: number): Uint8Array {
    this.lastWasKey = true;
    return this.frames[this.writeKey(this.collect(world, px, py))] as Uint8Array;
  }

  /**
   * Story 8.10: the frame for `st`'s client (key or delta) into the scratch buffer, and `st` moved
   * to what the phone will hold once it is applied. Returns a view of the scratch buffer.
   */
  encodeFor(world: World, st: HordeClientState, px: number, py: number): Uint8Array {
    const n = this.collect(world, px, py);
    const tick = this.tick;
    const keyLen = HORDE_HEADER_BYTES + HORDE_RECORD_BYTES * n;
    const gap = (tick - st.lastTick) >>> 0;
    let key = !st.hasBase || st.needsKey || st.sinceKey + 1 >= HORDE_KEY_INTERVAL_TICKS || gap < 1 || gap > 255;
    const len = key ? 0 : this.writeDelta(st, keyLen);
    if (len < 0) key = true; // the delta would not be smaller (or a count over 255)
    st.lastTick = tick;
    if (key) {
      this.commitKey(st);
      this.lastWasKey = true;
      return this.frames[this.writeKey(n)] as Uint8Array;
    }
    this.commitDelta(st);
    st.sinceKey++;
    this.lastWasKey = false;
    this.bytes[5] = gap;
    return this.frames[len] as Uint8Array;
  }

  /** Writes the delta; returns its length, or −1 when it would be ≥ `keyLen` or a count exceeds 255. */
  private writeDelta(st: HordeClientState, keyLen: number): number {
    const b = this.bytes;
    const view = this.view;
    const chg = this.chg;
    const stamp = this.stamp;
    const tick = this.tick;
    let o = HORDE_DELTA_HEADER_BYTES;
    let c = 0;
    let nNew = 0;
    let nChg = 0;
    let nLeft = 0;
    for (let slot = 0; slot < SLOTS; slot++) {
      this.act[slot] = ACT_NONE;
      const has = st.inSet[slot] === 1;
      if (this.wanted[slot] !== stamp) {
        if (!has) continue;
        this.act[slot] = ACT_LEFT;
        this.left[nLeft++] = slot;
        continue;
      }
      const netId = this.tNetId[slot] as number;
      if (!has || st.netId[slot] !== netId) {
        if (o + HORDE_RECORD_BYTES + c + nLeft >= keyLen) return -1; // already no smaller than the keyframe
        writeHordeRecordCm(view, o, netId, this.tX[slot] as number, this.tY[slot] as number, this.tHeading[slot] as number, this.tTypeState[slot] as number);
        o += HORDE_RECORD_BYTES;
        nNew++;
        this.act[slot] = ACT_NEW;
        continue;
      }
      const far = this.tFar[slot] as number;
      const toggle = st.far[slot] !== far;
      if (!toggle && far === 1 && !isFarRefreshTick(slot, tick)) continue; // a far zombie between its refreshes
      const dx = (this.tX[slot] as number) - (st.xCm[slot] as number);
      const dy = (this.tY[slot] as number) - (st.yCm[slot] as number);
      const moved = dx !== 0 || dy !== 0;
      let mask = toggle ? HORDE_CHG_FAR : 0;
      if (moved) mask |= tiny(dx) && tiny(dy) ? HORDE_CHG_POS_TINY : Math.abs(dx) <= HORDE_SMALL_MOVE_CM && Math.abs(dy) <= HORDE_SMALL_MOVE_CM ? HORDE_CHG_POS_SMALL : HORDE_CHG_POS_FULL;
      const derived = moved ? quantizeHeading(dx, dy) : (st.heading[slot] as number); // what the phone works out
      const truth = this.tHeading[slot] as number;
      const sendHeading = headingSteps(derived, truth) > HORDE_HEADING_TOLERANCE;
      if (sendHeading) mask |= HORDE_CHG_HEADING;
      const ts = this.tTypeState[slot] as number;
      if (ts !== st.typeState[slot]) mask |= HORDE_CHG_TYPE_STATE;
      this.endHeading[slot] = sendHeading ? truth : derived;
      if (mask === 0) continue;
      const need = 2 + ((mask & HORDE_CHG_POS_TINY) !== 0 ? 1 : 0) + ((mask & HORDE_CHG_POS_SMALL) !== 0 ? 2 : 0) + ((mask & HORDE_CHG_POS_FULL) !== 0 ? 4 : 0) + (sendHeading ? 1 : 0) + ((mask & HORDE_CHG_TYPE_STATE) !== 0 ? 1 : 0);
      if (o + c + need + nLeft >= keyLen) return -1; // already no smaller than the keyframe
      chg[c++] = slot;
      chg[c++] = mask;
      if ((mask & HORDE_CHG_POS_TINY) !== 0) chg[c++] = (dx & 0xf) | ((dy & 0xf) << 4);
      else if ((mask & HORDE_CHG_POS_SMALL) !== 0) {
        chg[c++] = dx & 0xff;
        chg[c++] = dy & 0xff;
      } else if ((mask & HORDE_CHG_POS_FULL) !== 0) {
        const x = this.tX[slot] as number;
        const y = this.tY[slot] as number;
        chg[c++] = x & 0xff;
        chg[c++] = x >> 8;
        chg[c++] = y & 0xff;
        chg[c++] = y >> 8;
      }
      if (sendHeading) chg[c++] = truth;
      if ((mask & HORDE_CHG_TYPE_STATE) !== 0) chg[c++] = ts;
      nChg++;
      this.act[slot] = ACT_CHANGED;
    }
    const len = o + c + nLeft;
    if (len >= keyLen || nNew > 255 || nChg > 255 || nLeft > 255) return -1;
    for (let i = 0; i < c; i++) b[o + i] = chg[i] as number; // by hand: a subarray would allocate
    view.setUint32(0, tick >>> 0, true);
    b[4] = HORDE_KIND_DELTA;
    b[6] = nNew;
    b[7] = nChg;
    b[8] = nLeft;
    for (let i = 0; i < nLeft; i++) b[o + c + i] = this.left[i] as number;
    return len;
  }

  private commitKey(st: HordeClientState): void {
    const stamp = this.stamp;
    for (let slot = 0; slot < SLOTS; slot++) {
      if (this.wanted[slot] !== stamp) {
        st.inSet[slot] = 0;
        continue;
      }
      st.inSet[slot] = 1;
      st.netId[slot] = this.tNetId[slot] as number;
      st.xCm[slot] = this.tX[slot] as number;
      st.yCm[slot] = this.tY[slot] as number;
      st.heading[slot] = this.tHeading[slot] as number;
      st.typeState[slot] = this.tTypeState[slot] as number;
      st.far[slot] = 0;
    }
    st.sinceKey = st.hasBase ? 0 : st.keyPhase; // the join key starts the client's stagger
    st.hasBase = true;
    st.needsKey = false;
  }

  private commitDelta(st: HordeClientState): void {
    for (let slot = 0; slot < SLOTS; slot++) {
      const a = this.act[slot] as number;
      if (a === ACT_NONE) continue;
      if (a === ACT_LEFT) {
        st.inSet[slot] = 0;
        continue;
      }
      st.inSet[slot] = 1;
      st.netId[slot] = this.tNetId[slot] as number;
      st.xCm[slot] = this.tX[slot] as number;
      st.yCm[slot] = this.tY[slot] as number;
      st.typeState[slot] = this.tTypeState[slot] as number;
      if (a === ACT_NEW) {
        st.heading[slot] = this.tHeading[slot] as number;
        st.far[slot] = 0;
      } else {
        st.heading[slot] = this.endHeading[slot] as number;
        st.far[slot] = this.tFar[slot] as number;
      }
    }
  }

  /**
   * Sends one frame to `client`, unless it isn't JOINED or its socket holds more than
   * HORDE_BACKPRESSURE_BYTES: then the frame is skipped, never queued (AC 4), and the next one is a
   * keyframe (Story 8.10). Returns the bytes sent (0 when skipped).
   */
  send(world: World, client: HordeClient, stats: HordeStats, px: number, py: number): number {
    const st = this.stateFor(client);
    if (client.state !== ClientState.JOINED || bufferedAmount(client.ref) > HORDE_BACKPRESSURE_BYTES) {
      stats.framesSkipped++;
      st.needsKey = true;
      return 0;
    }
    const frame = this.encodeFor(world, st, px, py);
    client.sendBytes(BYTES.HORDE_FRAME, frame); // copied by Colyseus (`getMessageBytes.raw`): reusable at once
    stats.framesSent++;
    if (this.lastWasKey) stats.keyframes++;
    stats.bytesSent += frame.length + COLYSEUS_BYTES_HEADER;
    return frame.length;
  }
}
