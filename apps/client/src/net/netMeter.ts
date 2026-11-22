import { ByteRate, attachByteCounters, type CountedRoomLike } from "@topdown/shared";

/**
 * This device's bandwidth (Story 2.10, AC 1): payload bytes down (every WebSocket message of the
 * room's socket) and up (every frame `room.connection.send` writes), in 1-second buckets
 * (`ByteRate`, a ring of 60; nothing allocated per message). KB = 1024 bytes of message payload:
 * no WebSocket, TCP or TLS overhead. Attached at the join (connection.ts) and marked at each wave
 * start (GameScene), so the averages and peaks are per wave.
 */
export class NetMeter {
  down = new ByteRate();
  up = new ByteRate();
  private detachRoom: (() => void) | null = null;

  constructor(private readonly now: () => number = () => performance.now()) {}

  /** Counts this room from now on (a previous room's counters stop and start over). */
  attach(room: CountedRoomLike): void {
    this.detach();
    this.down = new ByteRate(); // once per join
    this.up = new ByteRate();
    this.detachRoom = attachByteCounters(room, this.down, this.up, this.now);
    this.markWave(this.now());
  }

  detach(): void {
    this.detachRoom?.();
    this.detachRoom = null;
  }

  /** A wave started: averages and peaks restart. */
  markWave(nowMs: number): void {
    this.down.mark(nowMs);
    this.up.mark(nowMs);
  }

  downKBps(nowMs: number): number {
    return this.down.lastSecondKBps(nowMs);
  }

  upKBps(nowMs: number): number {
    return this.up.lastSecondKBps(nowMs);
  }

  avgDownKBps(nowMs: number): number {
    return this.down.avgKBps(nowMs);
  }

  peakDownKBps(nowMs: number): number {
    return this.down.peakKBps(nowMs);
  }

  avgUpKBps(nowMs: number): number {
    return this.up.avgKBps(nowMs);
  }
}

/** The page's one meter (one room at a time). */
export const netMeter = new NetMeter();
