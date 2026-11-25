import type { NetSession } from "../net/session";
import type { ShopAction } from "./shopStore";
import type { RunEnding, TrainingLevels } from "@topdown/shared";

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
   * Story 7.10 (AC 1, ED1): the survivor editor, from the hub's Survivor tab or my own lobby card. `back` is the screen
   * Back and Done return to (the hub, or the lobby whose room stays joined; a run that starts replaces this).
   */
  | { kind: "survivor"; back: SurvivorBack }
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

/** Story 7.3: where the Progress hub can be opened from, and returns to. */
export type ProgressBack = { kind: "start" } | { kind: "lobby"; code: string };

/** Story 7.10: where the survivor editor can be opened from, and returns to. */
export type SurvivorBack = { kind: "progress"; back: ProgressBack } | { kind: "lobby"; code: string };

/** Story 7.10: the editor over `from` (a copy: the screen objects are never shared). */
export const openSurvivor = (from: SurvivorBack): UiScreen => ({
  kind: "survivor",
  back: from.kind === "lobby" ? { kind: "lobby", code: from.code } : { kind: "progress", back: from.back.kind === "lobby" ? { kind: "lobby", code: from.back.code } : { kind: "start" } },
});

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
  /** Story 7.5 (T4, TL3): the player's Training levels (the schema's; absent = all 0). */
  readonly training?: TrainingLevels;
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
