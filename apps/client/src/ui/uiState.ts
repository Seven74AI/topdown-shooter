import type { NetSession } from "../net/session";
import type { ShopAction } from "./shopStore";
import type { RunEnding } from "@topdown/shared";

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
   * Story 7.3 (AC 6, decision 7.3 D2): the Progress hub, opened from the start screen or the lobby (never in a run).
   * `back` is the screen Back returns to (the lobby's room stays joined meanwhile; a run that starts replaces this).
   */
  | { kind: "progress"; back: ProgressBack }
  /**
   * Story 7.6 (AC 3, 7, 9; layout AC1): an account screen — the Save my progress / Log in / Forgot password forms, the
   * one-time recovery-code card (`code`) or the log-out confirm. `back` is the screen it returns to (the start screen,
   * the hub, or Results for the nudge); a room stays joined meanwhile.
   */
  | { kind: "account"; view: AccountView; back: UiScreen; code?: string; /** review M2: the code card after a reset says every other phone was logged out. */ reset?: boolean }
  /**
   * A run is on screen (solo or online). `menu` (Story 2.11): the in-run menu over the live game,
   * so the HUD and the game keep rendering underneath. `online`: the game keeps running.
   */
  | { kind: "playing"; menu: MenuState; online: boolean }
  /**
   * Team wipe (Story 2.8): wave reached and kills per player, sorted by slot. `online`: Back to
   * lobby (the whole room) instead of Restart. Story 3.10: each row also carries the money earned.
   * Story 4.4: `seed` = the run seed (online the server's). Story 6.11: `ending` ("wiped" |
   * "extracted" | "lost", replaces 3.10's `heldOut`), `endless` (the team chose Stay: DW2), and
   * `dawnEndsAtMs` (performance.now() ms; the dawn plays until then, `dawnModel.ts`).
   */
  | { kind: "results"; wave: number; rows: readonly ResultRow[]; online: boolean; ending: RunEnding; endless: boolean; seed: number; dawnEndsAtMs: number; /** Story 7.2 review N1: this phone's slot (the "YOU" row); absent = none marked. */ mySlot?: number };

/** Story 7.6: which account screen. */
export type AccountView = "save" | "login" | "forgot" | "code" | "logout";

/** Story 7.6: an account screen over `from` (an account screen's own back is kept: Back never returns to a form). */
export const openAccount = (view: AccountView, from: UiScreen, code?: string, reset = false): UiScreen => {
  const back = from.kind === "account" ? from.back : from.kind === "start" ? { kind: "start" as const } : from;
  if (code === undefined) return { kind: "account", view, back };
  return reset ? { kind: "account", view, back, code, reset: true } : { kind: "account", view, back, code };
};

/** Story 7.3: where the Progress hub can be opened from, and returns to. */
export type ProgressBack = { kind: "start" } | { kind: "lobby"; code: string };

/** Story 7.3: the hub over `from` (the start screen's error is not kept). */
export const openProgress = (from: ProgressBack): UiScreen => ({ kind: "progress", back: from.kind === "lobby" ? { kind: "lobby", code: from.code } : { kind: "start" } });

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
  /** Story 3.10: money earned this run (`PlayerState.earned`; the starting wallet not included). */
  readonly earned: number;
}

/** Story 6.11 / 6.12: the Results title: "Extracted", "Lost in the city" (a wipe after Stay), else "Wave reached N". */
export function resultsTitle(screen: { wave: number; ending: RunEnding }): string {
  if (screen.ending === "extracted") return "Extracted";
  if (screen.ending === "lost") return "Lost in the city";
  return `Wave reached ${screen.wave}`;
}

/** Story 6.11 / 6.12: the line under the title ("" = none: the title already says the wave). */
export function resultsSub(screen: { wave: number; ending: RunEnding }): string {
  if (screen.ending === "extracted") return `Wave reached ${screen.wave}`;
  if (screen.ending === "lost") return `Wave reached ${screen.wave} · rewards after wave 10 lost`;
  return "";
}

export interface UiRequests {
  restart: () => void;
  /**
   * Story 3.3: the shop's buttons (Close, a weapon, an upgrade, "Replace which?"); the Game scene runs
   * `shopStep`. Story 5.16: buildings are picked from the HUD's build bar, not the shop.
   */
  shop: (action: ShopAction) => void;
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
