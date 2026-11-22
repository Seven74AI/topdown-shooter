/**
 * Bandwidth counters (Story 2.10): bytes per whole second in a ring of BYTE_RATE_RING_S buckets,
 * plus the average and the peak second since a mark (the wave start). Used by the client overlay,
 * the server's `net_stats` line and the bots. Pure (times are passed in) and preallocated: adding
 * bytes never allocates.
 *
 * KB means 1024 bytes of WebSocket message payload: no WebSocket, TCP or TLS overhead.
 */

/** Seconds of history kept. */
export const BYTE_RATE_RING_S = 60;
/** Bytes in a KB. */
export const KB_BYTES = 1024;

const MS_PER_S = 1000;

export class ByteRate {
  private readonly buckets = new Float64Array(BYTE_RATE_RING_S);
  /** Second index (`floor(ms / 1000)`) of the newest bucket; -1 before the first call. */
  private headSec = -1;
  private markMs = Number.NaN;
  /** First whole second after the mark: only seconds from here count for the peak. */
  private markSec = 0;
  private sinceMarkBytes = 0;
  private peakBytes = 0;
  /** Every byte counted so far. */
  totalBytes = 0;
  /** Messages counted so far. */
  totalMessages = 0;

  add(nowMs: number, bytes: number): void {
    this.advance(nowMs);
    if (Number.isNaN(this.markMs)) this.mark(nowMs);
    const i = this.headSec % BYTE_RATE_RING_S;
    this.buckets[i] = (this.buckets[i] as number) + bytes;
    this.totalBytes += bytes;
    this.totalMessages++;
    this.sinceMarkBytes += bytes;
  }

  /** Starts the "since" window (avg and peak) at `nowMs`. */
  mark(nowMs: number): void {
    this.advance(nowMs);
    this.markMs = nowMs;
    this.markSec = Math.ceil(nowMs / MS_PER_S);
    this.sinceMarkBytes = 0;
    this.peakBytes = 0;
  }

  /** KB/s of the last whole second before `nowMs`. */
  lastSecondKBps(nowMs: number): number {
    this.advance(nowMs);
    if (this.headSec < 1) return 0;
    return (this.buckets[(this.headSec - 1) % BYTE_RATE_RING_S] as number) / KB_BYTES;
  }

  /** Average KB/s since the mark (the first `add` marks if `mark` was never called). */
  avgKBps(nowMs: number): number {
    if (Number.isNaN(this.markMs)) return 0;
    const s = (nowMs - this.markMs) / MS_PER_S;
    return s > 0 ? this.sinceMarkBytes / KB_BYTES / s : 0;
  }

  /** Busiest whole second since the mark, KB/s. */
  peakKBps(nowMs: number): number {
    this.advance(nowMs);
    return this.peakBytes / KB_BYTES;
  }

  /** Bytes counted since the mark. */
  get bytesSinceMark(): number {
    return this.sinceMarkBytes;
  }

  /** Moves the head to `nowMs`'s second: finished seconds feed the peak, skipped ones are cleared. */
  private advance(nowMs: number): void {
    const sec = Math.floor(nowMs / MS_PER_S);
    if (this.headSec < 0) {
      this.headSec = sec;
      return;
    }
    if (sec <= this.headSec) return;
    const done = this.buckets[this.headSec % BYTE_RATE_RING_S] as number;
    if (this.headSec >= this.markSec && done > this.peakBytes) this.peakBytes = done;
    const steps = Math.min(sec - this.headSec, BYTE_RATE_RING_S);
    for (let k = 1; k <= steps; k++) this.buckets[(sec - steps + k) % BYTE_RATE_RING_S] = 0;
    this.headSec = sec;
  }
}

/** The slice of a socket the counters listen on (a browser `WebSocket`, or Node's). */
export interface MessageSocketLike {
  addEventListener(type: "message", listener: (event: { data: unknown }) => void): void;
  removeEventListener(type: "message", listener: (event: { data: unknown }) => void): void;
}

/** The slice of an SDK room the counters wrap (`room.connection`). */
export interface CountedRoomLike {
  readonly connection: { transport: unknown; send(data: Uint8Array): void };
}

/** Payload size of a WebSocket message (`arraybuffer` binary type, or a string frame). */
export function messageBytes(data: unknown): number {
  if (data instanceof ArrayBuffer) return data.byteLength;
  if (ArrayBuffer.isView(data)) return data.byteLength;
  if (typeof data === "string") return data.length; // never sent by Colyseus 0.18; approximate
  return 0;
}

/**
 * Counts one room's traffic (Story 2.10): a `message` listener on the SDK's socket
 * (`room.connection.transport.ws`) adds each message's bytes to `down`, and a wrapper around
 * `room.connection.send` adds each sent frame's to `up`. Returns the detach (the socket listener
 * is removed; the send wrapper is restored). Nothing is allocated per message.
 */
export function attachByteCounters(room: CountedRoomLike, down: ByteRate, up: ByteRate, now: () => number): () => void {
  const ws = (room.connection.transport as { ws?: MessageSocketLike } | null)?.ws;
  const onMessage = (event: { data: unknown }): void => down.add(now(), messageBytes(event.data));
  ws?.addEventListener("message", onMessage);
  const conn = room.connection;
  const send = conn.send;
  const counted = (data: Uint8Array): void => {
    up.add(now(), data.byteLength);
    send.call(conn, data);
  };
  conn.send = counted;
  return () => {
    ws?.removeEventListener("message", onMessage);
    if (conn.send === counted) conn.send = send;
  };
}
