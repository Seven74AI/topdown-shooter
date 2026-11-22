import type { NetSession } from "../net/session";
import type { ShopAction } from "./shopStore";

/**
 * Tiny typed store between Phaser scenes and Preact screens (no globals on window).
 * Phaser writes the state; Preact renders it and sends requests back through `on`.
 */
export type UiScreen =
  /** Start screen (Stories 2.1/2.3): name, Create game, code + Join, Practice solo. `error` is player text. */
  | { kind: "start"; error?: string }
  /** Online lobby; players come from `net/lobbyStore`. */
  | { kind: "lobby"; code: string }
  /**
   * A run is on screen (solo or online). `menu` (Story 2.11): the in-run menu over the live game,
   * so the HUD and the game keep rendering underneath. `online`: the game keeps running.
   */
  | { kind: "playing"; menu: MenuState; online: boolean }
  /**
   * Team wipe (Story 2.8): wave reached and kills per player, sorted by slot. `online`: Back to
   * lobby (the whole room) instead of Restart.
   */
  | { kind: "results"; wave: number; rows: readonly ResultRow[]; online: boolean };

/** The in-run menu (Story 2.11): closed, open (Resume, Leave game), or asking to confirm the leave. */
export type MenuState = "closed" | "open" | "confirmLeave";

/**
 * What the player did: `toggle` (☰ or Esc), `resume`, `leave` (Leave game: asks first), `cancel`
 * (the confirm step's Cancel), `confirm` (the confirm step's Leave).
 */
export type MenuAction = "toggle" | "resume" | "leave" | "cancel" | "confirm";

/**
 * The in-run menu's state machine (Story 2.11). Returns the next state, or "left" when the player
 * confirmed the leave (only from `confirmLeave`). Esc and ☰ close the menu from any open state.
 */
export function menuStep(state: MenuState, action: MenuAction): MenuState | "left" {
  switch (action) {
    case "toggle":
      return state === "closed" ? "open" : "closed";
    case "resume":
      return "closed";
    case "leave":
      return state === "open" ? "confirmLeave" : state;
    case "cancel":
      return state === "confirmLeave" ? "open" : state;
    case "confirm":
      return state === "confirmLeave" ? "left" : state;
  }
}

/** A run on screen with the menu closed. */
export const playingScreen = (online: boolean): UiScreen => ({ kind: "playing", menu: "closed", online });

/** One line of the Results table. */
export interface ResultRow {
  readonly slot: number;
  readonly name: string;
  readonly kills: number;
}

export interface UiRequests {
  restart: () => void;
  /** Story 3.3: the shop's buttons (Close, a weapon, "Replace which?", a building); the Game scene runs `shopStep`. */
  shop: (action: ShopAction) => void;
  /**
   * Story 3.4 contract: a building tapped in the shop starts placement mode for that building type
   * (the shop has closed). The Game scene registers it and ignores it outside a build phase.
   */
  startPlacement: (buildingTypeId: string) => void;
  /** Start screen: create an online run with this (already validated) name. */
  createGame: (name: string) => void;
  /** Start screen: join the run with this (well-formed) code and (validated) name (Story 2.3). */
  joinGame: (code: string, name: string) => void;
  /** Lobby: the run started (phase `wave`): start `Game` online on this session (Story 2.4). */
  startOnline: (session: NetSession) => void;
  /** Results (online): Back to lobby, sends `lobby.return` (Story 2.8). */
  lobbyReturn: () => void;
  /** The room went back to the lobby: stop the Game scene without leaving the room (Story 2.8). */
  backToLobby: () => void;
  /** Online run: leave it and go back to the start screen, with an error text if the connection dropped. */
  leaveRun: (error?: string) => void;
  /** In-run menu (Story 2.11): ☰, Esc and the menu's buttons; the Game scene applies `menuStep`. */
  menu: (action: MenuAction) => void;
  /** Start screen: play offline, exactly as Epic 1. */
  startSolo: () => void;
  /** Lobby: leave the room and return to the start screen. */
  leaveLobby: () => void;
}

type Listener = (screen: UiScreen) => void;

class UiStore {
  private screen: UiScreen = playingScreen(false);
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
