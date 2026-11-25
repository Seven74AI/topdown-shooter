import { quantizeHeading } from "./heading";
import {
  HORDE_CHG_FAR,
  HORDE_CHG_HEADING,
  HORDE_CHG_MASK,
  HORDE_CHG_POS_FULL,
  HORDE_CHG_POS_SMALL,
  HORDE_CHG_POS_TINY,
  HORDE_CHG_TYPE_STATE,
  HORDE_DELTA_HEADER_BYTES,
  HORDE_HEADER_BYTES,
  HORDE_KIND_DELTA,
  HORDE_KIND_KEY,
  HORDE_MAX_RECORDS,
  HORDE_RECORD_BYTES,
  POS_SCALE,
  hordeFrameTick,
  isHordeFrameValid,
  u16,
  type HordeSink,
} from "./hordeFormat";

const SLOTS = HORDE_MAX_RECORDS;
const i8 = (v: number): number => (v > 127 ? v - 256 : v);
const i4 = (v: number): number => (v > 7 ? v - 16 : v);
const POS_BITS = HORDE_CHG_POS_TINY | HORDE_CHG_POS_SMALL | HORDE_CHG_POS_FULL;

/** Story 8.10: a far slot is refreshed on ticks where this is true (half of them each tick, by slot parity). */
export const isFarRefreshTick = (slot: number, tick: number): boolean => ((slot ^ tick) & 1) === 0;

/**
 * The phone's horde baseline (Story 8.10): one per connection, from the join (decision 8.10 D4), so
 * frames that arrive before the Game scene is up still update it. Reads keyframes and deltas and
 * hands the sink FULL frames (every zombie in the set, with its refresh tick), so `HordeBuffer`
 * keeps its API. Preallocated: a decode allocates nothing.
 *
 * - A bad frame (length, kind, an unknown slot, a slot twice, a move off the map's u16 range) is
 *   dropped and counted in `decodeErrors`, never thrown, and applies nothing.
 * - A delta whose base is not the frame this decoder applied last (`tick − gap`; after an error or
 *   before the first keyframe) is dropped and counted in `brokenChain`: the decoder waits for the
 *   next keyframe (at most 1 s, decision 8.10 D2). On an ordered socket this only follows an error.
 * - A keyframe always replaces the baseline (a new run restarts the tick).
 */
export class HordeStreamDecoder {
  /** Frames applied (keys + deltas). */
  framesDecoded = 0;
  /** Keyframes applied (Story 8.10 overlay `key N/s`). */
  keyframes = 0;
  /** Frames refused as malformed. */
  decodeErrors = 0;
  /** Deltas refused because their base is not held (waiting for a keyframe). */
  brokenChain = 0;

  private hasBase = false;
  private lastTick = 0;
  private count = 0;
  private readonly inSet = new Uint8Array(SLOTS);
  private readonly netId = new Uint16Array(SLOTS);
  private readonly xCm = new Uint16Array(SLOTS);
  private readonly yCm = new Uint16Array(SLOTS);
  private readonly heading = new Uint8Array(SLOTS);
  private readonly typeState = new Uint8Array(SLOTS);
  private readonly far = new Uint8Array(SLOTS);
  private readonly refreshTick = new Float64Array(SLOTS);
  /** Per slot: the frame stamp that last named it (a slot named twice in one frame is an error). */
  private readonly seen = new Int32Array(SLOTS);
  private stamp = 0;

  /** True once a keyframe is held (and no error since). */
  get synced(): boolean {
    return this.hasBase;
  }

  /** Tick of the last frame applied, or -1 before the first keyframe. */
  get latestTick(): number {
    return this.framesDecoded === 0 ? -1 : this.lastTick;
  }

  /** A new connection or a run back in the lobby: forget the baseline (the next frame must be a key). */
  reset(): void {
    this.hasBase = false;
    this.count = 0;
    this.inSet.fill(0);
  }

  /**
   * Decodes one frame; with a `sink`, hands it the full frame. Returns false (sink untouched) when
   * the frame was refused.
   */
  decode(bytes: unknown, sink: HordeSink | null): boolean {
    if (!(bytes instanceof Uint8Array) || bytes.length < 5) return this.error();
    const kind = bytes[4] as number;
    const tick = hordeFrameTick(bytes);
    if (kind === HORDE_KIND_KEY) {
      if (!this.validKey(bytes)) return this.error();
      this.applyKey(bytes, tick);
      this.keyframes++;
    } else if (kind === HORDE_KIND_DELTA) {
      if (!this.validDelta(bytes)) return this.error();
      const gap = bytes[5] as number;
      if (!this.hasBase || ((tick - gap) >>> 0) !== this.lastTick) {
        this.hasBase = false;
        this.brokenChain++;
        return false;
      }
      this.applyDelta(bytes, tick);
    } else return this.error();
    this.hasBase = true;
    this.lastTick = tick;
    this.framesDecoded++;
    if (sink) this.emit(sink, tick);
    return true;
  }

  private error(): false {
    this.decodeErrors++;
    this.hasBase = false;
    return false;
  }

  private validKey(b: Uint8Array): boolean {
    if (!isHordeFrameValid(b)) return false;
    const n = u16(b, 5);
    const stamp = ++this.stamp;
    for (let i = 0; i < n; i++) {
      const slot = b[HORDE_HEADER_BYTES + HORDE_RECORD_BYTES * i] as number;
      if (this.seen[slot] === stamp) return false;
      this.seen[slot] = stamp;
    }
    return true;
  }

  /** Walks the whole delta without applying it; leaves `seen` stamped with every slot it names. */
  private validDelta(b: Uint8Array): boolean {
    const len = b.length;
    if (len < HORDE_DELTA_HEADER_BYTES || (b[5] as number) === 0) return false;
    const nNew = b[6] as number;
    const nChg = b[7] as number;
    const nLeft = b[8] as number;
    const stamp = ++this.stamp;
    let o = HORDE_DELTA_HEADER_BYTES;
    if (o + nNew * HORDE_RECORD_BYTES > len) return false;
    for (let i = 0; i < nNew; i++, o += HORDE_RECORD_BYTES) {
      const slot = b[o] as number;
      if (this.seen[slot] === stamp) return false;
      this.seen[slot] = stamp;
    }
    for (let i = 0; i < nChg; i++) {
      if (o + 2 > len) return false;
      const slot = b[o] as number;
      const mask = b[o + 1] as number;
      o += 2;
      if (mask === 0 || (mask & ~HORDE_CHG_MASK) !== 0) return false;
      const pos = mask & POS_BITS;
      if ((pos & (pos - 1)) !== 0) return false; // two kinds of move
      if (this.seen[slot] === stamp || this.inSet[slot] === 0) return false;
      this.seen[slot] = stamp;
      if (pos === HORDE_CHG_POS_TINY) {
        if (o + 1 > len) return false;
        const v = b[o] as number;
        const x = (this.xCm[slot] as number) + i4(v & 0xf);
        const y = (this.yCm[slot] as number) + i4(v >> 4);
        if (x < 0 || x > 0xffff || y < 0 || y > 0xffff) return false;
        o += 1;
      } else if ((mask & HORDE_CHG_POS_SMALL) !== 0) {
        if (o + 2 > len) return false;
        const x = (this.xCm[slot] as number) + i8(b[o] as number);
        const y = (this.yCm[slot] as number) + i8(b[o + 1] as number);
        if (x < 0 || x > 0xffff || y < 0 || y > 0xffff) return false;
        o += 2;
      } else if ((mask & HORDE_CHG_POS_FULL) !== 0) o += 4;
      if ((mask & HORDE_CHG_HEADING) !== 0) o++;
      if ((mask & HORDE_CHG_TYPE_STATE) !== 0) o++;
    }
    if (o > len) return false;
    for (let i = 0; i < nLeft; i++, o++) {
      if (o >= len) return false;
      const slot = b[o] as number;
      if (this.seen[slot] === stamp || this.inSet[slot] === 0) return false;
      this.seen[slot] = stamp;
    }
    return o === len;
  }

  private applyKey(b: Uint8Array, tick: number): void {
    this.inSet.fill(0);
    const n = u16(b, 5);
    for (let i = 0, o = HORDE_HEADER_BYTES; i < n; i++, o += HORDE_RECORD_BYTES) this.put(b, o, tick);
    this.count = n;
  }

  private put(b: Uint8Array, o: number, tick: number): void {
    const id = u16(b, o);
    const slot = id & 0xff;
    this.inSet[slot] = 1;
    this.netId[slot] = id;
    this.xCm[slot] = u16(b, o + 2);
    this.yCm[slot] = u16(b, o + 4);
    this.heading[slot] = b[o + 6] as number;
    this.typeState[slot] = b[o + 7] as number;
    this.far[slot] = 0;
    this.refreshTick[slot] = tick;
  }

  private applyDelta(b: Uint8Array, tick: number): void {
    const stamp = this.stamp; // validDelta stamped every slot this frame names
    const nNew = b[6] as number;
    const nChg = b[7] as number;
    const nLeft = b[8] as number;
    let o = HORDE_DELTA_HEADER_BYTES;
    for (let i = 0; i < nNew; i++, o += HORDE_RECORD_BYTES) {
      if (this.inSet[b[o] as number] === 0) this.count++;
      this.put(b, o, tick);
    }
    for (let i = 0; i < nChg; i++) {
      const slot = b[o] as number;
      const mask = b[o + 1] as number;
      o += 2;
      const x0 = this.xCm[slot] as number;
      const y0 = this.yCm[slot] as number;
      let x = x0;
      let y = y0;
      if ((mask & HORDE_CHG_POS_TINY) !== 0) {
        const v = b[o++] as number;
        x += i4(v & 0xf);
        y += i4(v >> 4);
      } else if ((mask & HORDE_CHG_POS_SMALL) !== 0) {
        x += i8(b[o] as number);
        y += i8(b[o + 1] as number);
        o += 2;
      } else if ((mask & HORDE_CHG_POS_FULL) !== 0) {
        x = u16(b, o);
        y = u16(b, o + 2);
        o += 4;
      }
      this.xCm[slot] = x;
      this.yCm[slot] = y;
      if ((mask & HORDE_CHG_HEADING) !== 0) this.heading[slot] = b[o++] as number;
      else if (x !== x0 || y !== y0) this.heading[slot] = quantizeHeading(x - x0, y - y0);
      if ((mask & HORDE_CHG_TYPE_STATE) !== 0) this.typeState[slot] = b[o++] as number;
      if ((mask & HORDE_CHG_FAR) !== 0) this.far[slot] = (this.far[slot] as number) ^ 1;
      this.refreshTick[slot] = tick;
    }
    for (let i = 0; i < nLeft; i++, o++) {
      this.inSet[b[o] as number] = 0;
      this.count--;
    }
    // Not named: unchanged. Near ones (and far ones on their refresh tick) were refreshed now.
    for (let slot = 0; slot < SLOTS; slot++) {
      if (this.inSet[slot] === 0 || this.seen[slot] === stamp) continue;
      if (this.far[slot] === 0 || isFarRefreshTick(slot, tick)) this.refreshTick[slot] = tick;
    }
  }

  private emit(sink: HordeSink, tick: number): void {
    sink.begin(tick, this.count);
    let i = 0;
    for (let slot = 0; slot < SLOTS; slot++) {
      if (this.inSet[slot] === 0) continue;
      sink.record(
        i++,
        this.netId[slot] as number,
        (this.xCm[slot] as number) / POS_SCALE,
        (this.yCm[slot] as number) / POS_SCALE,
        this.heading[slot] as number,
        this.typeState[slot] as number,
        this.refreshTick[slot] as number,
      );
    }
    sink.end();
  }
}
