import {
  BYTES,
  HORDE_BACKPRESSURE_BYTES,
  HORDE_LINE_BASE_WINDOW_S,
  HORDE_LINE_CONFIRM_MS,
  HORDE_LINE_MAX_GAP_MS,
  HORDE_LINE_RESUME_MS,
  HORDE_LINE_SIGNAL_STALE_MS,
  HORDE_LINE_SKIP_MS,
  HORDE_LINE_TREND_MAX,
  HORDE_LINE_TREND_SPAN_MS,
  TICK_DT_S,
  ackTickFrom,
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
  /** Story 8.13: of `framesSkipped`, those skipped because frames waited too long in the line (the slow-line skip). */
  lineSkipped: number;
  /** Story 8.13: the longest wait in the line the acks showed (ms above the line's base; 0 = none measured). */
  maxLineWaitMs: number;
  /** Story 8.13 review M1 (a): keyframes sent while skipping, because HORDE_LINE_MAX_GAP_MS had passed (the freeze cap). */
  lineCapKeys: number;
}

export const newHordeStats = (): HordeStats => ({ framesSent: 0, framesSkipped: 0, bytesSent: 0, keyframes: 0, lineSkipped: 0, maxLineWaitMs: 0, lineCapKeys: 0 });

/** Story 8.13: send times kept per tick (12.8 s of ticks); an ack older than that is timed from its tick number. */
const SENT_RING = 256;
const TICK_MS = TICK_DT_S * 1000;

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
  // ── Story 8.13: the slow-line skip (decision 8.13 D1–D3) ──
  /** The newest server tick this phone acked (−1: none yet). */
  ackTick = -1;
  /** When the newest ack arrived (ms, server clock; NaN: none yet). */
  ackAtMs = Number.NaN;
  /** The wait in the line the newest ack showed (ms above the base). */
  waitMs = 0;
  /** That wait projected to now with the trend (what the skip compares; ms). */
  projectedMs = 0;
  /** The last TREND_SAMPLES acks: when their tick was written (ms) and the wait they showed (a ring). */
  readonly trendSentMs = new Float64Array(TREND_SAMPLES);
  readonly trendWaitMs = new Float64Array(TREND_SAMPLES);
  trendCount = 0;
  trendHead = 0;
  /** Since when the wait has been over HORDE_LINE_SKIP_MS (NaN: it isn't). */
  overSinceMs = Number.NaN;
  /** Horde frames are skipped: they would wait too long in the line. */
  lineSlow = false;
  /** The lowest ack age per 1-second bucket (the second number in `baseSec`; −1 = empty). */
  readonly baseSec = new Int32Array(HORDE_LINE_BASE_WINDOW_S).fill(-1);
  readonly baseMs = new Float64Array(HORDE_LINE_BASE_WINDOW_S);
  /**
   * Review M1 (b): the upload's own wait. Per input, `arrival − seq × 50 ms` (the phone sends one per 50 ms step);
   * its lowest value of the last HORDE_LINE_BASE_WINDOW_S seconds is the upload's base, the rest is time the input
   * waited on the way up. The ack's wait minus it is what waited on the way DOWN (only that can a skip drain).
   */
  readonly upSec = new Int32Array(HORDE_LINE_BASE_WINDOW_S).fill(-1);
  readonly upMs = new Float64Array(HORDE_LINE_BASE_WINDOW_S);
  /** The upload wait of the newest input (ms). */
  upWaitMs = 0;
  /** When this phone's last horde frame went out (ms; NaN: none yet): the freeze cap (review M1 a). */
  lastFrameMs = Number.NaN;
  constructor(readonly keyPhase: number) {}

  /** Forgets the line measurement (a fresh baseline: a reset or a re-attach). */
  resetLine(): void {
    this.ackTick = -1;
    this.ackAtMs = Number.NaN;
    this.waitMs = 0;
    this.overSinceMs = Number.NaN;
    this.lineSlow = false;
    this.baseSec.fill(-1);
    this.upSec.fill(-1);
    this.upWaitMs = 0;
    this.projectedMs = 0;
    this.trendCount = 0;
    this.trendHead = 0;
  }
}

/**
 * Story 8.13: puts `value` into its 1-second bucket of a HORDE_LINE_BASE_WINDOW_S ring (each bucket keeps its lowest)
 * and returns the lowest value of the buckets still in the window. No allocation.
 */
function windowMin(secs: Int32Array, mins: Float64Array, nowMs: number, value: number): number {
  const sec = Math.floor(nowMs / 1000);
  const b = sec % HORDE_LINE_BASE_WINDOW_S;
  if (secs[b] !== sec) {
    secs[b] = sec;
    mins[b] = value;
  } else if (value < (mins[b] as number)) mins[b] = value;
  let min = value;
  for (let i = 0; i < HORDE_LINE_BASE_WINDOW_S; i++) {
    const s = secs[i] as number;
    if (s >= 0 && sec - s < HORDE_LINE_BASE_WINDOW_S && (mins[i] as number) < min) min = mins[i] as number;
  }
  return min;
}

const SLOTS = 256;
/** Story 8.13: acks kept for the trend (20 Hz: 0.8 s, over HORDE_LINE_TREND_SPAN_MS even with every other tick acked). */
const TREND_SAMPLES = 16;
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
  /** Story 8.13: when each tick's frames were written (ms; slot `tick % SENT_RING`, and which tick it holds). */
  private readonly sentAtMs = new Float64Array(SENT_RING);
  private readonly sentTick = new Int32Array(SENT_RING).fill(-1);
  /** Story 8.13: `prepare`'s time (ms): what `send` checks a stale ack against. */
  private nowMs = 0;

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
  prepare(world: World, nowMs = performance.now()): void {
    const z = world.zombies;
    rebuildGrid(world.zombieGrid, z.aliveIds, z.aliveCount, z.x, z.y);
    this.tick = world.tick;
    // Story 8.13: this tick's patch and frames go out in this callback (one write, 8.11): its send time for the acks.
    this.nowMs = nowMs;
    const ring = world.tick % SENT_RING;
    this.sentAtMs[ring] = nowMs;
    this.sentTick[ring] = world.tick;
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
    st.resetLine(); // Story 8.13
  }

  /**
   * Story 8.13 (decision 8.13 D1): an input from `client` arrived at `nowMs` carrying `ackLow`, the low 16 bits of the
   * newest server tick its phone had received (`decodeInputAck`; −1 = none). A NEW ack is timed against when that
   * tick was written: its age = the line's round trip + the time the tick waited in the line. The lowest age of the
   * last HORDE_LINE_BASE_WINDOW_S seconds is the base (the round trip alone); `waitMs` is the age above it.
   *
   * Only the newest ack counts and only when it moves forward, so stalls don't read as a queue: after a downstream
   * stall the burst's newest frame is fresh; after an upstream stall the burst's newest input carries a fresh ack
   * (its older inputs' acks, timed late, are each overtaken in the same burst, and HORDE_LINE_CONFIRM_MS of being over
   * the limit is needed before any skip). A queue in the line keeps every ack old: the wait stays up, the skip starts.
   *
   * Review M1: the age also holds the input's way UP, which a skip cannot drain. With `seq` (the input's), the upload's
   * own wait is measured from arrival times (`arrival − seq × 50 ms` above its 10 s minimum) and taken off, so only a
   * downstream queue skips frames. Without `seq` (tests) the whole age counts.
   */
  ack(client: object, ackLow: number, nowMs: number, seq = -1): void {
    const st = this.stateFor(client);
    // Review M1 (b): every input (a new ack or not) times the upload: its wait above the upload's own base.
    if (seq >= 0) {
      const up = nowMs - seq * TICK_MS;
      st.upWaitMs = up - windowMin(st.upSec, st.upMs, nowMs, up);
    }
    const tick = ackTickFrom(ackLow, this.tick);
    if (tick < 0 || tick <= st.ackTick) return;
    st.ackTick = tick;
    const ring = tick % SENT_RING;
    const sentMs = this.sentTick[ring] === tick ? (this.sentAtMs[ring] as number) : this.nowMs - (this.tick - tick) * TICK_MS;
    const age = nowMs - sentMs;
    // The ack's wait above the line's base, minus what this input waited on the way up (review M1 b): the down wait.
    const wait = Math.max(0, age - windowMin(st.baseSec, st.baseMs, nowMs, age) - (seq >= 0 ? st.upWaitMs : 0));
    // The trend: against the newest kept ack written at least HORDE_LINE_TREND_SPAN_MS before this one.
    let trend = 0;
    for (let k = st.trendCount - 1; k >= 0; k--) {
      const j = (st.trendHead + k) % TREND_SAMPLES;
      const span = sentMs - (st.trendSentMs[j] as number);
      if (span < HORDE_LINE_TREND_SPAN_MS) continue;
      trend = Math.min(HORDE_LINE_TREND_MAX, Math.max(0, (wait - (st.trendWaitMs[j] as number)) / span));
      break;
    }
    const w = (st.trendHead + st.trendCount) % TREND_SAMPLES;
    st.trendSentMs[w] = sentMs;
    st.trendWaitMs[w] = wait;
    if (st.trendCount < TREND_SAMPLES) st.trendCount++;
    else st.trendHead = (st.trendHead + 1) % TREND_SAMPLES;
    // Projected over how long ago that frame left, minus the upload wait (review M1: its noise is no downstream growth).
    const projected = wait + trend * Math.max(0, age - (seq >= 0 ? st.upWaitMs : 0));
    st.waitMs = wait;
    st.projectedMs = projected;
    const gap = nowMs - st.ackAtMs; // NaN for the first ack
    st.ackAtMs = nowMs;
    if (projected > HORDE_LINE_SKIP_MS) {
      // A queue moves the ack every tick (patches go out at 20 Hz): a late ack after a quiet gap (overlapping up and
      // down stalls) starts the confirm time again instead of confirming an earlier burst's late acks.
      if (Number.isNaN(st.overSinceMs) || !(gap <= 2 * HORDE_LINE_CONFIRM_MS)) st.overSinceMs = nowMs;
      if (nowMs - st.overSinceMs >= HORDE_LINE_CONFIRM_MS) st.lineSlow = true;
    } else {
      st.overSinceMs = Number.NaN;
      if (wait < HORDE_LINE_RESUME_MS) st.lineSlow = false; // the measured wait itself: the line has caught up
    }
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
   * Sends one frame to `client`, unless it isn't JOINED, its socket holds more than
   * HORDE_BACKPRESSURE_BYTES, or (Story 8.13) its frames wait too long in the line (`ack`): then the
   * frame is skipped, never queued (AC 4), and the next one is a keyframe (Story 8.10). Only horde
   * frames are skipped: the patch and the events of the tick still go. Returns the bytes sent (0 when skipped).
   */
  send(world: World, client: HordeClient, stats: HordeStats, px: number, py: number): number {
    const st = this.stateFor(client);
    // Story 8.13: no ack for a while (a hidden tab, a long stall): the skip ends, the 64 KB socket rule is left.
    if (st.lineSlow && this.nowMs - st.ackAtMs > HORDE_LINE_SIGNAL_STALE_MS) st.lineSlow = false;
    if (st.waitMs > stats.maxLineWaitMs) stats.maxLineWaitMs = st.waitMs;
    // Review M1 (a), the freeze cap: while skipping, a keyframe at least every HORDE_LINE_MAX_GAP_MS whatever the cause.
    const capKey = st.lineSlow && !(this.nowMs - st.lastFrameMs < HORDE_LINE_MAX_GAP_MS);
    if (client.state !== ClientState.JOINED || bufferedAmount(client.ref) > HORDE_BACKPRESSURE_BYTES || (st.lineSlow && !capKey)) {
      stats.framesSkipped++;
      if (st.lineSlow && client.state === ClientState.JOINED) stats.lineSkipped++;
      st.needsKey = true;
      return 0;
    }
    if (capKey) stats.lineCapKeys++;
    st.lastFrameMs = this.nowMs;
    const frame = this.encodeFor(world, st, px, py);
    client.sendBytes(BYTES.HORDE_FRAME, frame); // copied by Colyseus (`getMessageBytes.raw`): reusable at once
    stats.framesSent++;
    if (this.lastWasKey) stats.keyframes++;
    stats.bytesSent += frame.length + COLYSEUS_BYTES_HEADER;
    return frame.length;
  }
}
