/**
 * Tiny typed store between Phaser scenes and Preact screens (no globals on window).
 * Phaser writes the state; Preact renders it and sends requests back through `on`.
 */
export type UiScreen = { kind: "playing" } | { kind: "gameOver"; waveReached: number };

export interface UiRequests {
  restart: () => void;
}

type Listener = (screen: UiScreen) => void;

class UiStore {
  private screen: UiScreen = { kind: "playing" };
  private readonly listeners = new Set<Listener>();
  private requests: Partial<UiRequests> = {};

  get(): UiScreen {
    return this.screen;
  }

  set(screen: UiScreen): void {
    this.screen = screen;
    for (const l of this.listeners) l(screen);
  }

  subscribe(listener: Listener): () => void {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }

  /** Phaser registers handlers for requests coming from the UI. */
  handle<K extends keyof UiRequests>(name: K, fn: UiRequests[K] | undefined): void {
    if (fn) this.requests[name] = fn;
    else delete this.requests[name];
  }

  request<K extends keyof UiRequests>(name: K): void {
    this.requests[name]?.();
  }
}

export const uiStore = new UiStore();
