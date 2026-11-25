import { HordeStreamDecoder, type HordeSink } from "@topdown/shared";
import type { HordeBuffer } from "./hordeBuffer";

/**
 * Decoded horde frames into the buffer (Story 2.5; Story 8.10: the session's `HordeStreamDecoder`
 * decodes keyframes and deltas from the join and hands this sink full frames). A frame whose tick is
 * not newer than the newest held is dropped and counted (`staleFrames`); on an ordered socket it can
 * only come from a new run's keyframe, and the stream decoder already refuses any delta whose base it
 * does not hold. The overlay's error and keyframe counts are the stream decoder's.
 */
export class HordeDecoder implements HordeSink {
  /** Frames accepted into the buffer (Story 2.10 overlay). */
  framesReceived = 0;
  /** Frames not newer than the newest held. */
  staleFrames = 0;
  private accepting = false;

  constructor(
    private readonly buffer: HordeBuffer,
    /** The session's stream decoder (counts errors and keyframes); tests and tools may let it make one. */
    readonly stream: HordeStreamDecoder = new HordeStreamDecoder(),
    /** Called after each accepted frame (Story 8.9: a clock and lateness sample). */
    private readonly onFrame: () => void = () => {},
  ) {}

  /** Frames refused by the stream decoder: malformed, or a delta without its base (Story 8.10 overlay `err`). */
  get decodeErrors(): number {
    return this.stream.decodeErrors + this.stream.brokenChain;
  }

  /** Keyframes decoded on this connection (Story 8.10 overlay `key N/s`). */
  get keyframes(): number {
    return this.stream.keyframes;
  }

  /** Decodes `bytes` with `stream` into the buffer (tests and tools; the game's session decodes). True when it went in. */
  receive(bytes: unknown): boolean {
    const before = this.framesReceived;
    this.stream.decode(bytes, this);
    return this.framesReceived > before;
  }

  begin(tick: number, count: number): void {
    this.accepting = !(this.buffer.size > 0 && tick <= this.buffer.latestTick);
    if (!this.accepting) {
      this.staleFrames++;
      return;
    }
    this.buffer.begin(tick, count);
  }

  record(i: number, netId: number, x: number, y: number, heading: number, typeState: number, refreshTick?: number): void {
    if (this.accepting) this.buffer.record(i, netId, x, y, heading, typeState, refreshTick);
  }

  end(): void {
    if (!this.accepting) return;
    this.accepting = false;
    this.buffer.end();
    this.framesReceived++;
    this.onFrame();
  }
}
