/**
 * The horde stream's binary frames (Story 2.5, ADR-02; Story 8.10: keyframes + deltas, version
 * `NET_PROTOCOL_VERSION` 2). Pure: no Colyseus, no DOM. Little-endian throughout.
 *
 * Every frame starts with the tick (u32, `world.tick` after the step) and a kind byte.
 *
 * **Keyframe** (`HORDE_KIND_KEY`): every zombie in the client's set as a full record.
 *
 * | Offset | Size | Field |
 * | --- | --- | --- |
 * | 0 | u32 | tick |
 * | 4 | u8 | kind = 1 |
 * | 5 | u16 | count |
 * | 7 + 8i | u16 | net id: bits 0–7 pool slot, bits 8–15 generation (`zombieNetId`) |
 * | +2 | u16 | x in cm from the map's top-left origin, clamped to 0…65535 |
 * | +4 | u16 | y, same |
 * | +6 | u8 | heading (`quantizeHeading`: 0 = +x, increasing toward +y) |
 * | +7 | u8 | typeState: low nibble `ZOMBIE_TYPES` index, high nibble: bits 4–6 `ZOMBIE_STATE`, bit 7 burning (Story 5.4) |
 *
 * **Delta** (`HORDE_KIND_DELTA`): against the previous frame sent to this client (the socket is
 * ordered and reliable, so the phone always holds it; a skipped frame makes the next one a key).
 *
 * | Offset | Size | Field |
 * | --- | --- | --- |
 * | 0 | u32 | tick |
 * | 4 | u8 | kind = 2 |
 * | 5 | u8 | gap: tick − the previous frame's tick (1…255); the decoder refuses a delta whose base it does not hold |
 * | 6 | u8 | new count |
 * | 7 | u8 | changed count |
 * | 8 | u8 | left count |
 * | 9 | 8 × new | new zombies (not in the set, or a new generation in the slot): full records as above |
 * | … | 2+ each | changed: slot u8, mask u8 (`HORDE_CHG_*`), then the move as one byte of two int4 cm (TINY: dx low nibble, dy high), two int8 cm (SMALL) or absolute u16 cm x, y (FULL), heading u8 (HEADING), typeState u8 (TYPE_STATE) |
 * | … | 1 each | left (out of view, dead, or the slot's zombie gone): slot u8 |
 *
 * Zombies not listed are unchanged. Heading is worked out on the phone from each refresh's move
 * (`quantizeHeading` of the cm move); the server sends it only when that would be off by more than
 * `HORDE_HEADING_TOLERANCE` steps (a standing zombie that turns, decision 8.10 D3). Zombies farther
 * than the encoder's near radius (`HORDE_NEAR_M`: Infinity in the game since B7, so off; `HORDE_FAR_RULE_RADIUS_M` 8 m with the rule on) from the view centre (FAR flag, toggled by `HORDE_CHG_FAR`; new and key
 * records start near) are refreshed only on ticks where `(slot ^ tick) & 1` is 0 (decision 8.10 D1);
 * the phone glides them between their own refresh ticks.
 *
 * Sent as `BYTES.HORDE_FRAME` (1 byte of type on the wire). Empty frames are still sent: the client
 * counts misses with them.
 */
/** Keyframe header: tick u32, kind u8, count u16. */
export const HORDE_HEADER_BYTES = 7;
/** Delta header: tick u32, kind u8, gap u8, new / changed / left counts u8. */
export const HORDE_DELTA_HEADER_BYTES = 9;
export const HORDE_KIND_KEY = 1;
export const HORDE_KIND_DELTA = 2;
/** Changed-record mask bits (Story 8.10). At most one of TINY, SMALL and FULL. */
export const HORDE_CHG_POS_SMALL = 0x01;
export const HORDE_CHG_POS_FULL = 0x02;
export const HORDE_CHG_HEADING = 0x04;
export const HORDE_CHG_TYPE_STATE = 0x08;
export const HORDE_CHG_FAR = 0x10;
/** A move of −8…7 cm per axis in one byte: dx in the low nibble, dy in the high one (two's complement). */
export const HORDE_CHG_POS_TINY = 0x20;
export const HORDE_CHG_MASK = 0x3f;
/** Largest move (cm, per axis) a TINY change carries (−8…7). */
export const HORDE_TINY_MOVE_MIN_CM = -8;
export const HORDE_TINY_MOVE_MAX_CM = 7;
/** Largest move (cm, per axis) a SMALL change carries. */
export const HORDE_SMALL_MOVE_CM = 127;
/**
 * Story 8.10 (decision 8.10 D2): a client gets a keyframe at least every this many ticks (1 s), so a
 * decoding mistake never lasts longer; staggered per client.
 */
export const HORDE_KEY_INTERVAL_TICKS = 20;
/**
 * Story 8.10 (decision 8.10 D1): the far rule's radius — zombies farther than this from the view
 * centre refreshed every 2nd tick (a Runner at 4 m/s needs 2 s to reach you from here). The rule is
 * OFF in the game (`HORDE_NEAR_M`, B7); tests and a later story pass this radius explicitly.
 */
export const HORDE_FAR_RULE_RADIUS_M = 8;
/**
 * Story 8.10 review RM2 → decision 8.10 B7 (supersedes D1 overnight): every zombie is refreshed every
 * tick. With the far rule on, far zombies stood still then jumped on the CLEAN line (15–16 % of their
 * between-refresh samples: the look-ahead frame two ticks out is often not there yet). The rule's code
 * path stays (the encoder's `nearM`, the FAR flag, the buffer's own-refresh lerp) for a story that
 * fixes that; cost: audit replay 6.7 → 8.2 KB/s, stampede 13.4 → 13.5 KB/s.
 */
export const HORDE_NEAR_M = Number.POSITIVE_INFINITY;
/**
 * Story 8.10 (decision 8.10 D3, B1): the heading byte is sent when the phone's own derivation would be
 * more than this many steps (of 256; 4 ≈ 5.6°: a walker's 6 cm move rounded to cm can be ~5 steps off) off the server's.
 */
export const HORDE_HEADING_TOLERANCE = 4;
export const HORDE_RECORD_BYTES = 8;
/** Metres → wire units (centimetres). */
export const POS_SCALE = 100;
/** Largest position on the wire (655.35 m). */
export const MAX_POS_CM = 0xffff;
/** Records per frame at most: the pool size (a slot fits 8 bits). */
export const HORDE_MAX_RECORDS = 256;
/**
 * Story 8.9 (decision 8.9 D4; was "absent from 3 frames in a row", Story 2.5 AC 3): a zombie absent
 * from a frame leaves the view once the render tick is this many ticks (150 ms) past the first frame
 * that lacked it. Counted in render time, not per arriving frame: 3 frames can land in one burst.
 */
export const HORDE_MISSING_TICKS = 3;
/** Zombies this far outside a client's view are still sent (AC 1). */
export const HORDE_VIEW_MARGIN_M = 4;
/** A client whose socket holds more than this skips horde frames until it drains (AC 4). */
export const HORDE_BACKPRESSURE_BYTES = 64 * 1024;

// ── Story 8.13: the slow-line skip (decision 8.13 D1–D3). The phone acks the newest server tick it has received in
// every input (`encodeInput`'s ack); the server times each new ack against when it wrote that tick: the age. The
// lowest age of the last HORDE_LINE_BASE_WINDOW_S is the line's own round trip; anything above it is time spent
// waiting in the line (a slow line's queue, which the 64 KB socket rule cannot see: 8.10 B6). ──

/**
 * Horde frames to a phone are skipped while its frames wait more than this in the line (ms above its base). Measured
 * (Story 8.13 table): a 128 kbit/s line waits ≤ 159 ms plus ±20 ms jitter and ≤ 50 ms of input sampling, so 300 ms
 * never trips there; a 64 kbit/s queue is caught before it passes ~1 s (we learn a wait only when its frame lands).
 */
export const HORDE_LINE_SKIP_MS = 300;
/**
 * We learn a frame's wait only when it lands (wait + round trip later), so on a filling line the reading lags: the
 * skip compares HORDE_LINE_SKIP_MS with the wait projected to now, `wait + trend × age`, the trend being how fast the
 * wait grew per ms of send time over at least HORDE_LINE_TREND_SPAN_MS of acked ticks (clamped to 0 … this).
 */
export const HORDE_LINE_TREND_MAX = 2;
/** The trend is measured over acks whose ticks were written at least this far apart (ms): jitter averages out. */
export const HORDE_LINE_TREND_SPAN_MS = 200;
/** Skipping stops (a keyframe follows) once the wait is back under this (ms above base): the line has caught up. */
export const HORDE_LINE_RESUME_MS = 100;
/**
 * The wait must stay over HORDE_LINE_SKIP_MS for this long (ms of ack arrivals) before skipping starts: the inputs of
 * a burst after an upstream stall land together, the first ones carrying old acks, so one late ack is no queue.
 */
export const HORDE_LINE_CONFIRM_MS = 100;
/** The base (the line's round trip with nothing queued) is the lowest age of this many 1-second buckets. */
export const HORDE_LINE_BASE_WINDOW_S = 10;
/** With no new ack for this long (a hidden tab, a long stall), the skip ends: the 64 KB socket rule takes over. */
export const HORDE_LINE_SIGNAL_STALE_MS = 2000;
/** Largest frame in bytes. */
export const HORDE_MAX_FRAME_BYTES = HORDE_HEADER_BYTES + HORDE_RECORD_BYTES * HORDE_MAX_RECORDS;

/** Pool slot + generation → the 16-bit net id (also used by `sim.events_flushed`, Story 2.4). */
export const zombieNetId = (slot: number, generation: number): number => (slot & 0xff) | ((generation & 0xff) << 8);
/** The generation of a net id. */
export const zombieGenerationOfNetId = (netId: number): number => (netId >> 8) & 0xff;

const NIBBLE = 0xf;

/** Packs a type index and a state into one byte. Values over 15 are a programmer error. */
export function packTypeState(type: number, state: number): number {
  if (type < 0 || type > NIBBLE || state < 0 || state > NIBBLE || !Number.isInteger(type) || !Number.isInteger(state)) {
    throw new Error(`packTypeState: type ${type} / state ${state} must be integers in 0..15`);
  }
  return type | (state << 4);
}
export const typeOfTypeState = (ts: number): number => ts & NIBBLE;
/**
 * Story 5.4: bit 3 of the state nibble is "burning" (an ignited zombie: 0 added bytes), so a
 * `ZOMBIE_STATE` value must stay ≤ 7 (`MAX_WIRE_ZOMBIE_STATE`, a test enforces it).
 */
export const BURNING_STATE_BIT = 0x8;
export const MAX_WIRE_ZOMBIE_STATE = 7;
export const stateOfTypeState = (ts: number): number => (ts >> 4) & (NIBBLE & ~BURNING_STATE_BIT);
export const burningOfTypeState = (ts: number): boolean => ((ts >> 4) & BURNING_STATE_BIT) !== 0;
/** Story 5.4: the state nibble with the burning bit (state ≤ 7). */
export const wireState = (state: number, burning: boolean): number => (burning ? state | BURNING_STATE_BIT : state);

/** Metres → clamped centimetres. */
export function quantizePos(m: number): number {
  const cm = Math.round(m * POS_SCALE);
  return cm < 0 ? 0 : cm > MAX_POS_CM ? MAX_POS_CM : cm;
}

/** Byte length of a keyframe holding `count` records. */
export const hordeFrameBytes = (count: number): number => HORDE_HEADER_BYTES + HORDE_RECORD_BYTES * count;

/** Keyframe header. */
export function writeHordeHeader(view: DataView, tick: number, count: number): void {
  view.setUint32(0, tick >>> 0, true);
  view.setUint8(4, HORDE_KIND_KEY);
  view.setUint16(5, count, true);
}

/** Writes keyframe record `i`; x and y in metres (quantized and clamped here). */
export function writeHordeRecord(
  view: DataView,
  i: number,
  netId: number,
  x: number,
  y: number,
  heading: number,
  typeState: number,
): void {
  writeHordeRecordCm(view, HORDE_HEADER_BYTES + HORDE_RECORD_BYTES * i, netId, quantizePos(x), quantizePos(y), heading, typeState);
}

/** A full 8-byte record at byte offset `o`, positions already in cm (Story 8.10: key and new records). */
export function writeHordeRecordCm(view: DataView, o: number, netId: number, xCm: number, yCm: number, heading: number, typeState: number): void {
  view.setUint16(o, netId & 0xffff, true);
  view.setUint16(o + 2, xCm & 0xffff, true);
  view.setUint16(o + 4, yCm & 0xffff, true);
  view.setUint8(o + 6, heading & 0xff);
  view.setUint8(o + 7, typeState & 0xff);
}

/** Receives a decoded frame; positions in metres. */
export interface HordeSink {
  begin(tick: number, count: number): void;
  /**
   * Story 8.10: `refreshTick` is the tick this zombie's pose was last refreshed (the frame's tick for
   * near zombies; a far one's own refresh tick between its alternate-tick refreshes). Absent: the frame's tick.
   */
  record(i: number, netId: number, x: number, y: number, heading: number, typeState: number, refreshTick?: number): void;
  end(): void;
}

export const u16 = (b: Uint8Array, o: number): number => (b[o] as number) | ((b[o + 1] as number) << 8);

/** Tick of a frame, or -1 when it is too short to have one. */
export function hordeFrameTick(bytes: Uint8Array): number {
  if (bytes.length < HORDE_HEADER_BYTES) return -1;
  return ((bytes[0] as number) | ((bytes[1] as number) << 8) | ((bytes[2] as number) << 16) | ((bytes[3] as number) << 24)) >>> 0;
}

/** Kind byte of a frame (`HORDE_KIND_*`), or -1 when it is too short. */
export const hordeFrameKind = (bytes: Uint8Array): number => (bytes.length < 5 ? -1 : (bytes[4] as number));

/** True for a keyframe whose length is exactly 7 + 8 × count and whose count fits the pool. */
export function isHordeFrameValid(bytes: Uint8Array): boolean {
  if (bytes.length < HORDE_HEADER_BYTES || bytes[4] !== HORDE_KIND_KEY) return false;
  const count = u16(bytes, 5);
  return count <= HORDE_MAX_RECORDS && bytes.length === hordeFrameBytes(count);
}

/**
 * Reads a KEYFRAME into `sink`, statelessly (tests and tools; the stream itself goes through
 * `HordeStreamDecoder`, which also applies deltas). Returns false (and calls nothing) for a delta
 * or when the length is not 7 + 8 × count. Reads bytes directly, so a decode allocates nothing (no DataView per frame); the
 * SDK hands a subarray view, and indexing it is offset-safe.
 */
export function readHordeFrame(bytes: Uint8Array, sink: HordeSink): boolean {
  if (!isHordeFrameValid(bytes)) return false;
  const count = u16(bytes, 5);
  sink.begin(hordeFrameTick(bytes), count);
  for (let i = 0; i < count; i++) {
    const o = HORDE_HEADER_BYTES + HORDE_RECORD_BYTES * i;
    sink.record(i, u16(bytes, o), u16(bytes, o + 2) / POS_SCALE, u16(bytes, o + 4) / POS_SCALE, bytes[o + 6] as number, bytes[o + 7] as number);
  }
  sink.end();
  return true;
}
