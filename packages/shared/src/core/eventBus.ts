import type { SimEvent } from "./simEvents";

export type EventHandler = (event: SimEvent) => void;

/**
 * Typed, synchronous event bus inside the World. Systems emit during a tick;
 * `flush()` (called once at the end of `step`) delivers them in order, exactly once.
 *
 * - Events emitted by a subscriber during a flush are queued for the next flush.
 * - Subscribing/unsubscribing during a flush takes effect from the next flush
 *   (handlers are copy-on-write, so the running flush never skips anyone).
 * - A throwing handler doesn't stop delivery: every event still reaches every handler,
 *   the batch is cleared, then the first error is rethrown (it is a programmer error).
 */
export class EventBus {
  private pending: SimEvent[] = [];
  private delivering: SimEvent[] = [];
  private handlers: readonly EventHandler[] = [];

  emit(event: SimEvent): void {
    this.pending.push(event);
  }

  subscribe(handler: EventHandler): () => void {
    this.handlers = [...this.handlers, handler];
    return () => {
      this.handlers = this.handlers.filter((h) => h !== handler);
    };
  }

  /** Number of events waiting for the next flush. */
  get pendingCount(): number {
    return this.pending.length;
  }

  /**
   * The `i`-th event waiting for the next flush, in emit order (Story 3.2: the economy system reads
   * this tick's events before they are delivered). Read only: never keep or change it.
   */
  pendingAt(i: number): SimEvent | undefined {
    return this.pending[i];
  }

  flush(): void {
    // Swap buffers so events emitted by handlers land in the (now empty) pending array.
    const batch = this.pending;
    this.pending = this.delivering;
    this.delivering = batch;
    const handlers = this.handlers; // snapshot for this flush
    let firstError: unknown = undefined;
    let failed = false;
    for (let i = 0; i < batch.length; i++) {
      const event = batch[i] as SimEvent;
      for (let h = 0; h < handlers.length; h++) {
        try {
          (handlers[h] as EventHandler)(event);
        } catch (e) {
          if (!failed) {
            failed = true;
            firstError = e;
          }
        }
      }
    }
    batch.length = 0;
    if (failed) throw firstError;
  }
}
