import type { SimEvent } from "./simEvents";

export type EventHandler = (event: SimEvent) => void;

/**
 * Typed, synchronous event bus inside the World. Systems emit during a tick;
 * `flush()` (called once at the end of `step`) delivers them in order, exactly once.
 * Events emitted by a subscriber during a flush are queued for the next flush.
 */
export class EventBus {
  private pending: SimEvent[] = [];
  private delivering: SimEvent[] = [];
  private readonly handlers: EventHandler[] = [];

  emit(event: SimEvent): void {
    this.pending.push(event);
  }

  subscribe(handler: EventHandler): () => void {
    this.handlers.push(handler);
    return () => {
      const i = this.handlers.indexOf(handler);
      if (i >= 0) this.handlers.splice(i, 1);
    };
  }

  /** Number of events waiting for the next flush. */
  get pendingCount(): number {
    return this.pending.length;
  }

  flush(): void {
    // Swap buffers so events emitted by handlers land in the (now empty) pending array.
    const batch = this.pending;
    this.pending = this.delivering;
    this.delivering = batch;
    for (let i = 0; i < batch.length; i++) {
      const event = batch[i] as SimEvent;
      for (let h = 0; h < this.handlers.length; h++) (this.handlers[h] as EventHandler)(event);
    }
    batch.length = 0;
  }
}
