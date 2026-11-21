import type { NetSession } from "../net/session";

/**
 * Tiny typed store between Phaser scenes and Preact screens (no globals on window).
 * Phaser writes the state; Preact renders it and sends requests back through `on`.
 */
export type UiScreen =
  /** Start screen (Stories 2.1/2.3): name, Create game, code + Join, Practice solo. `error` is player text. */
  | { kind: "start"; error?: string }
  /** Online lobby; players come from `net/lobbyStore`. */
  | { kind: "lobby"; code: string }
  | { kind: "playing" }
  /** `online`: Back to start (leaves the room) instead of Restart (Story 2.4). */
  | { kind: "gameOver"; waveReached: number; online?: boolean }
  /** Dev builds: choose two weapons before the run (temporary until the shop, Story 3.3). */
  | { kind: "loadoutPicker"; weapons: readonly string[] };

export type LoadoutChoice = readonly [string, string | null];

export interface UiRequests {
  restart: () => void;
  startRun: (loadout: LoadoutChoice) => void;
  /** Start screen: create an online run with this (already validated) name. */
  createGame: (name: string) => void;
  /** Start screen: join the run with this (well-formed) code and (validated) name (Story 2.3). */
  joinGame: (code: string, name: string) => void;
  /** Lobby: the run started (phase `wave`): start `Game` online on this session (Story 2.4). */
  startOnline: (session: NetSession) => void;
  /** Online run: leave it and go back to the start screen, with an error text if the connection dropped. */
  leaveRun: (error?: string) => void;
  /** Start screen: play offline, exactly as Epic 1. */
  startSolo: () => void;
  /** Lobby: leave the room and return to the start screen. */
  leaveLobby: () => void;
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

  request<K extends keyof UiRequests>(name: K, ...args: Parameters<UiRequests[K]>): void {
    const fn = this.requests[name] as ((...a: Parameters<UiRequests[K]>) => void) | undefined;
    fn?.(...args);
  }
}

export const uiStore = new UiStore();
