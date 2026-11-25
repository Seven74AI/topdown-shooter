/**
 * Story 8.11 (T1, T6): what a bot's socket carries, by kind, so the "one packet per tick" numbers are measured on the
 * same line before and after. NOT game code (tools only).
 *
 * Down (server → bot), from each WebSocket message's first bytes (Colyseus 0.18 framing: `[protocol][type]…`):
 * state patches (`ROOM_STATE_PATCH` 15), horde frames (`ROOM_DATA_BYTES` 17, type `BYTES.HORDE_FRAME`), event batches
 * (`ROOM_DATA` 13, type `sim.events_flushed`) and the rest. Up (bot → server): input messages (the msgpack
 * `input.send` of before, or the binary `BYTES.INPUT` of 8.11) and the rest. Bytes are WebSocket payload bytes
 * (the Colyseus frame; no WebSocket/TCP headers).
 *
 * Patches: `patch()` is called on each state change with the state's `tick`; during a wave, the histogram counts how
 * many server ticks each patch advanced (F3: exactly one).
 */
import { BYTES, S2C } from "@topdown/shared";

/** The msgpack input message before Story 8.11 (the "before" runs). */
const OLD_INPUT_TYPE = "input.send";

const P_ROOM_DATA = 13;
const P_STATE_PATCH = 15;
const P_ROOM_DATA_BYTES = 17;

export interface WireCounts {
  downMsgs: number;
  patchBytes: number;
  patches: number;
  hordeBytes: number;
  eventBytes: number;
  otherDownBytes: number;
  inputMsgs: number;
  inputBytes: number;
  otherUpBytes: number;
  /** Patches that advanced 0, 1, 2, 3+ ticks (during a wave). */
  readonly ticksPerPatch: [number, number, number, number];
}

const zero = (): WireCounts => ({
  downMsgs: 0,
  patchBytes: 0,
  patches: 0,
  hordeBytes: 0,
  eventBytes: 0,
  otherDownBytes: 0,
  inputMsgs: 0,
  inputBytes: 0,
  otherUpBytes: 0,
  ticksPerPatch: [0, 0, 0, 0],
});

/** The message type after the protocol byte: a msgpack fixstr / number (Colyseus `encode.string` / `encode.number`). */
function typeOf(b: Uint8Array): string | number | null {
  const t = b[1];
  if (t === undefined) return null;
  if (t < 0x80) return t; // positive fixint
  if ((t & 0xe0) === 0xa0) {
    const len = t & 0x1f;
    let s = "";
    for (let i = 0; i < len && 2 + i < b.length; i++) s += String.fromCharCode(b[2 + i] as number);
    return s;
  }
  return null;
}

const bytesOf = (data: unknown): Uint8Array | null =>
  data instanceof Uint8Array ? data : data instanceof ArrayBuffer ? new Uint8Array(data) : null;

export class WireMeter {
  readonly total: WireCounts = zero();
  private lastTick = -1;

  down(data: unknown): void {
    const b = bytesOf(data);
    if (!b) return;
    const c = this.total;
    c.downMsgs++;
    const p = b[0];
    if (p === P_STATE_PATCH) {
      c.patchBytes += b.length;
      return;
    }
    const type = p === P_ROOM_DATA || p === P_ROOM_DATA_BYTES ? typeOf(b) : null;
    if (p === P_ROOM_DATA_BYTES && type === BYTES.HORDE_FRAME) c.hordeBytes += b.length;
    else if (p === P_ROOM_DATA && type === S2C.SIM_EVENTS_FLUSHED) c.eventBytes += b.length;
    else c.otherDownBytes += b.length;
  }

  up(b: Uint8Array): void {
    const c = this.total;
    const type = b[0] === P_ROOM_DATA || b[0] === P_ROOM_DATA_BYTES ? typeOf(b) : null;
    const isInput = (b[0] === P_ROOM_DATA && type === OLD_INPUT_TYPE) || (b[0] === P_ROOM_DATA_BYTES && type === BYTES.INPUT);
    if (isInput) {
      c.inputMsgs++;
      c.inputBytes += b.length;
    } else c.otherUpBytes += b.length;
  }

  /** A state change arrived (one per patch); `inWave`: count its tick advance. */
  patch(tick: number, inWave: boolean): void {
    this.total.patches++;
    if (inWave && this.lastTick >= 0) {
      const d = Math.max(0, Math.min(3, tick - this.lastTick));
      this.total.ticksPerPatch[d] = (this.total.ticksPerPatch[d] as number) + 1;
    }
    this.lastTick = tick;
  }

  /** A copy of the counters (for a wave's start mark). */
  snapshot(): WireCounts {
    const t = this.total;
    return { ...t, ticksPerPatch: [...t.ticksPerPatch] as [number, number, number, number] };
  }
}

/** Per-second rates over a wave (`now − mark`), for the `bot_wave` line. */
export function wireRates(now: WireCounts, mark: WireCounts, seconds: number, ticks: number): Record<string, number | number[]> {
  const s = seconds > 0 ? seconds : 1;
  const r2 = (n: number): number => Math.round(n * 100) / 100;
  const kb = (n: number): number => r2(n / 1024 / s);
  return {
    downMsgsPerS: r2((now.downMsgs - mark.downMsgs) / s),
    patchesPerS: r2((now.patches - mark.patches) / s),
    ticksPerS: r2(ticks / s),
    ticksPerPatch: now.ticksPerPatch.map((v, i) => v - (mark.ticksPerPatch[i] as number)),
    patchKBps: kb(now.patchBytes - mark.patchBytes),
    hordeWireKBps: kb(now.hordeBytes - mark.hordeBytes),
    eventKBps: kb(now.eventBytes - mark.eventBytes),
    otherDownKBps: kb(now.otherDownBytes - mark.otherDownBytes),
    inputsPerS: r2((now.inputMsgs - mark.inputMsgs) / s),
    inputUpKBps: kb(now.inputBytes - mark.inputBytes),
    otherUpKBps: kb(now.otherUpBytes - mark.otherUpBytes),
  };
}
