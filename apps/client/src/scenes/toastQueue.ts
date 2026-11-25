import { MAX_PLAYERS } from "@topdown/shared";

/** How long a toast line shows (Story 2.11: "<name> left"). */
export const TOAST_SHOW_MS = 3000;
/** Toasts kept waiting; more are dropped (at most the other players can leave at once). */
export const TOAST_QUEUE_MAX = MAX_PLAYERS;

/** "<name> left" or "<name> lost connection" (Story 2.11); Story 8.3: "<name> was removed" (the host removed them). */
export function playerLeftText(name: string, reason: "left" | "disconnected" | "removed"): string {
  if (reason === "removed") return `${name} was removed`;
  return reason === "left" ? `${name} left` : `${name} lost connection`;
}

/**
 * Short HUD messages shown one at a time for TOAST_SHOW_MS each, in arrival order (Story 2.11).
 * Its own line, so a toast never replaces a wave banner. Presentation time (ms), not sim ticks.
 * `current()` allocates nothing; `push` is rare (a player leaving).
 */
export class ToastQueue {
  private readonly queue: string[] = [];
  /** When the front toast started showing; NaN when it hasn't yet. */
  private shownAtMs = Number.NaN;

  push(text: string): void {
    if (this.queue.length >= TOAST_QUEUE_MAX) return;
    this.queue.push(text);
  }

  /** Story 5.16: push unless the same text is already showing or waiting (a refused tile tapped again). */
  pushUnique(text: string): void {
    if (!this.queue.includes(text)) this.push(text);
  }

  /**
   * Story 5.16: removes every copy of `text` (a build-bar refusal once a pick succeeds, so it doesn't
   * sit over the hand's hint line). The next toast, if any, starts in full. Taps only.
   */
  withdraw(text: string): void {
    for (let i = this.queue.length - 1; i >= 0; i--) {
      if (this.queue[i] !== text) continue;
      this.queue.splice(i, 1);
      if (i === 0) this.shownAtMs = Number.NaN;
    }
  }

  /** The text to show now ("" when none); moves on to the next toast when the front one is done. */
  current(nowMs: number): string {
    while (this.queue.length > 0) {
      if (Number.isNaN(this.shownAtMs)) this.shownAtMs = nowMs;
      if (nowMs - this.shownAtMs < TOAST_SHOW_MS) return this.queue[0] as string;
      this.queue.shift();
      this.shownAtMs = this.queue.length > 0 ? this.shownAtMs + TOAST_SHOW_MS : Number.NaN;
      if (this.queue.length > 0 && nowMs - this.shownAtMs >= TOAST_SHOW_MS) this.shownAtMs = nowMs; // a long gap: show the next in full
    }
    return "";
  }

  clear(): void {
    this.queue.length = 0;
    this.shownAtMs = Number.NaN;
  }
}
