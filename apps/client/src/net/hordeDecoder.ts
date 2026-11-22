import { hordeFrameTick, isHordeFrameValid, readHordeFrame } from "@topdown/shared";
import type { HordeBuffer } from "./hordeBuffer";

/**
 * Horde frames from the socket into the buffer (Story 2.5). The SDK hands a subarray view of its
 * receive buffer: `readHordeFrame` indexes it from its own offset (never `bytes.buffer` from 0)
 * and allocates nothing. A bad frame is dropped and counted, never thrown; a frame whose tick is
 * not newer than the newest held (duplicate, out of order) is dropped too.
 */
export class HordeDecoder {
  /** Frames accepted into the buffer (Story 2.10 overlay). */
  framesReceived = 0;
  /** Frames with a bad length or not bytes at all. */
  decodeErrors = 0;
  /** Duplicate or out-of-order frames. */
  staleFrames = 0;

  constructor(private readonly buffer: HordeBuffer) {}

  /** Returns true when the frame went into the buffer. */
  receive(bytes: unknown): boolean {
    if (!(bytes instanceof Uint8Array) || !isHordeFrameValid(bytes)) {
      this.decodeErrors++;
      return false;
    }
    if (this.buffer.size > 0 && hordeFrameTick(bytes) <= this.buffer.latestTick) {
      this.staleFrames++;
      return false;
    }
    readHordeFrame(bytes, this.buffer);
    this.framesReceived++;
    return true;
  }
}
