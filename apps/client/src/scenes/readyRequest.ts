/** Story 3.1 review: how long the Ready button shows a request the server hasn't confirmed (≈ 2 RTT at 4G + slack). */
export const READY_PENDING_MS = 1500;

/**
 * This device's Ready button (Story 3.1 review). The server's `buildReady` is the truth; a tap is
 * shown at once as a pending request until the server agrees, for at most READY_PENDING_MS (a
 * dropped `build.set_ready`), and a new build — even one a hidden tab slept through — voids it.
 */
export class ReadyRequest {
  private pending: boolean | null = null;
  private pendingAtMs = 0;
  private phase = "";
  private wave = -1;

  /** Call once per frame before `tap`; returns what the button shows. */
  update(phase: string, wave: number, serverReady: boolean, nowMs: number): boolean {
    if (phase !== this.phase || wave !== this.wave) {
      this.phase = phase;
      this.wave = wave;
      this.pending = null; // the server cleared every Ready at the new phase
    }
    if (this.pending !== null && (this.pending === serverReady || nowMs - this.pendingAtMs > READY_PENDING_MS)) {
      this.pending = null; // the server agrees, or never got the request: its value wins
    }
    return this.pending ?? serverReady;
  }

  /** A tap: the value to send (the opposite of what is shown). */
  tap(serverReady: boolean, nowMs: number): boolean {
    const want = !(this.pending ?? serverReady);
    this.pending = want;
    this.pendingAtMs = nowMs;
    return want;
  }

  reset(): void {
    this.pending = null;
    this.phase = "";
    this.wave = -1;
  }
}
