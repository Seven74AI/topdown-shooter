/**
 * The horde stream's binary frame (Story 2.5, ADR-02). Pure: no Colyseus, no DOM.
 *
 * Little-endian throughout:
 *
 * | Offset | Size | Field |
 * | --- | --- | --- |
 * | 0 | u32 | tick (`world.tick` after the step) |
 * | 4 | u16 | count |
 * | 6 + 8i | u16 | net id: bits 0–7 pool slot, bits 8–15 generation (`zombieNetId`) |
 * | +2 | u16 | x in cm from the map's top-left origin, clamped to 0…65535 |
 * | +4 | u16 | y, same |
 * | +6 | u8 | heading (`quantizeHeading`: 0 = +x, increasing toward +y) |
 * | +7 | u8 | typeState: low nibble `ZOMBIE_TYPES` index, high nibble: bits 4–6 `ZOMBIE_STATE`, bit 7 burning (Story 5.4) |
 *
 * Sent as `BYTES.HORDE_FRAME` (1 byte of type on the wire). Empty frames (6 bytes) are still
 * sent: the client counts misses with them.
 */
export const HORDE_HEADER_BYTES = 6;
export const HORDE_RECORD_BYTES = 8;
/** Metres → wire units (centimetres). */
export const POS_SCALE = 100;
/** Largest position on the wire (655.35 m). */
export const MAX_POS_CM = 0xffff;
/** Records per frame at most: the pool size (a slot fits 8 bits). */
export const HORDE_MAX_RECORDS = 256;
/** A zombie absent from this many frames in a row is removed from view (AC 3). */
export const HORDE_MISSING_LIMIT = 3;
/** Zombies this far outside a client's view are still sent (AC 1). */
export const HORDE_VIEW_MARGIN_M = 4;
/** A client whose socket holds more than this skips horde frames until it drains (AC 4). */
export const HORDE_BACKPRESSURE_BYTES = 64 * 1024;
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

/** Byte length of a frame holding `count` records. */
export const hordeFrameBytes = (count: number): number => HORDE_HEADER_BYTES + HORDE_RECORD_BYTES * count;

export function writeHordeHeader(view: DataView, tick: number, count: number): void {
  view.setUint32(0, tick >>> 0, true);
  view.setUint16(4, count, true);
}

/** Writes record `i`; x and y in metres (quantized and clamped here). */
export function writeHordeRecord(
  view: DataView,
  i: number,
  netId: number,
  x: number,
  y: number,
  heading: number,
  typeState: number,
): void {
  const o = HORDE_HEADER_BYTES + HORDE_RECORD_BYTES * i;
  view.setUint16(o, netId & 0xffff, true);
  view.setUint16(o + 2, quantizePos(x), true);
  view.setUint16(o + 4, quantizePos(y), true);
  view.setUint8(o + 6, heading & 0xff);
  view.setUint8(o + 7, typeState & 0xff);
}

/** Receives a decoded frame; positions in metres. */
export interface HordeSink {
  begin(tick: number, count: number): void;
  record(i: number, netId: number, x: number, y: number, heading: number, typeState: number): void;
  end(): void;
}

const u16 = (b: Uint8Array, o: number): number => (b[o] as number) | ((b[o + 1] as number) << 8);

/** Tick of a frame, or -1 when it is too short to have one. */
export function hordeFrameTick(bytes: Uint8Array): number {
  if (bytes.length < HORDE_HEADER_BYTES) return -1;
  return ((bytes[0] as number) | ((bytes[1] as number) << 8) | ((bytes[2] as number) << 16) | ((bytes[3] as number) << 24)) >>> 0;
}

/** True when the length is exactly 6 + 8 × count and count fits the pool. */
export function isHordeFrameValid(bytes: Uint8Array): boolean {
  if (bytes.length < HORDE_HEADER_BYTES) return false;
  const count = u16(bytes, 4);
  return count <= HORDE_MAX_RECORDS && bytes.length === hordeFrameBytes(count);
}

/**
 * Reads a frame into `sink`. Returns false (and calls nothing) when the length is not
 * 6 + 8 × count. Reads bytes directly, so a decode allocates nothing (no DataView per frame); the
 * SDK hands a subarray view, and indexing it is offset-safe.
 */
export function readHordeFrame(bytes: Uint8Array, sink: HordeSink): boolean {
  if (!isHordeFrameValid(bytes)) return false;
  const count = u16(bytes, 4);
  sink.begin(hordeFrameTick(bytes), count);
  for (let i = 0; i < count; i++) {
    const o = HORDE_HEADER_BYTES + HORDE_RECORD_BYTES * i;
    sink.record(i, u16(bytes, o), u16(bytes, o + 2) / POS_SCALE, u16(bytes, o + 4) / POS_SCALE, bytes[o + 6] as number, bytes[o + 7] as number);
  }
  sink.end();
  return true;
}
