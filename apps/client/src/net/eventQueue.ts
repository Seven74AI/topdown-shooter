import type { SimEvent } from "@topdown/shared";

/** Events held at most (a hidden tab keeps receiving; the oldest are dropped past this). */
export const EVENT_QUEUE_CAPACITY = 2048;

/**
 * Server events waiting for the render tick (Story 2.4): `drain` hands out events whose tick is
 * ≤ the render tick, so a death plays when the drawn zombie gets there, not 100 ms early.
 * Ticks arrive in order (reliable messages over one socket). Story 2.7 puts instant local
 * cosmetic events in front of this queue.
 */
export class EventQueue {
  private readonly ticks: Float64Array;
  private readonly events: (SimEvent | null)[];
  private head = 0;
  private count = 0;
  /** Events dropped because the queue was full. */
  dropped = 0;

  constructor(private readonly capacity = EVENT_QUEUE_CAPACITY) {
    this.ticks = new Float64Array(capacity);
    this.events = new Array<SimEvent | null>(capacity).fill(null);
  }

  get size(): number {
    return this.count;
  }

  push(tick: number, event: SimEvent): void {
    if (this.count === this.capacity) {
      this.events[this.head] = null;
      this.head = (this.head + 1) % this.capacity;
      this.count--;
      this.dropped++;
    }
    const i = (this.head + this.count) % this.capacity;
    this.ticks[i] = tick;
    this.events[i] = event;
    this.count++;
  }

  /**
   * Appends every event with tick ≤ `renderTick` to `out`, oldest first. Returns how many. With
   * `ticksOut` (Story 3.6 review L1), each event's server tick is appended to it in step with `out`.
   */
  drain(renderTick: number, out: SimEvent[], ticksOut?: number[]): number {
    let n = 0;
    while (this.count > 0 && (this.ticks[this.head] as number) <= renderTick) {
      const e = this.events[this.head];
      const tick = this.ticks[this.head] as number;
      this.events[this.head] = null;
      this.head = (this.head + 1) % this.capacity;
      this.count--;
      if (e) {
        out.push(e);
        if (ticksOut) ticksOut.push(tick);
        n++;
      }
    }
    return n;
  }

  clear(): void {
    this.events.fill(null);
    this.head = 0;
    this.count = 0;
  }
}
