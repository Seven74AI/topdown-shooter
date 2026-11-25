import * as Phaser from "phaser";
import { GAME_TITLE } from "@topdown/shared";
import { dpr } from "../display";
import { uiStore } from "../ui/uiState";
import { skipsStartScreen, urlOptions } from "../debug/urlOptions";
import { prewarmAmbience } from "../audio/ambience";
import type { GameSceneData } from "./GameScene";
import type { NetSession } from "../net/session";
import { loadStreetProps, streetPropsState, whenStreetPropsSettled } from "../render/city/streetPropsAtlas";
import { playingScreen } from "../ui/uiState";

/** `scene.start("Boot", data)`: back from an online run, maybe with an error for the start screen. */
export interface BootSceneData {
  error?: string;
  /** Story 2.8: the room went back to the lobby; the lobby screen is already up (no title, no start screen). */
  lobby?: boolean;
  /** Story 2.11: the player left a run from the in-run menu; the start screen is already up (no title). */
  start?: boolean;
}

const TITLE_SHOW_MS = 500; // how long the title shows before the start screen (or a ?solo run)
const TITLE_FONT_PX = 32; // CSS pixels; scaled by dpr() so it reads the same on every phone
const LOADING_FONT_PX = 16; // Story 9.14: the "Loading…" line under the title (CSS px)
const LOADING_GAP_PX = 36; // its distance below the screen's middle (CSS px)

export class BootScene extends Phaser.Scene {
  /**
   * Story 9.14 (review NEW-1): the first start request taken (solo or online); every later one is ignored, the title's
   * delayed start screen never comes back, and the Game scene starts exactly once. Reset in `create` (Phaser reuses
   * the scene object when Boot starts again).
   */
  private starting = false;
  /** The title's delayed step (start screen, or the `?solo` start), removed once a start is taken. */
  private titleTimer: Phaser.Time.TimerEvent | null = null;

  constructor() {
    super("Boot");
  }

  create(data?: BootSceneData): void {
    this.starting = false;
    this.titleTimer = null;
    // Story 9.14 (B1, review H1): the street props atlas image (~0.5 MB) downloads in the background while the title and
    // the start screen are up; a start waits for it to settle (at most `STREET_PROPS_TIMEOUT_MS`), see `startGame`.
    loadStreetProps(this);
    prewarmAmbience(); // Stories 4.6/4.7 review M: synthesize the ambience loops in idle time on the start screen / lobby (once per page)
    const error = data?.error;
    if (data?.lobby || data?.start) {
      // Waiting for the next start in the same room, or back on the start screen after Leave game:
      // only the start handlers are needed.
      uiStore.handle("startSolo", () => this.startSolo());
      uiStore.handle("startOnline", (session) => this.startOnline(session));
      return;
    }
    // Story 8.1: a reload mid-run takes its seat straight back (main.ts › resumeSavedSeat) and may ask
    // for the Game scene during the title: listen from the start, not only after TITLE_SHOW_MS.
    uiStore.handle("startOnline", (session) => this.startOnline(session));
    const title = this.add
      .text(0, 0, GAME_TITLE, {
        fontFamily: "system-ui, sans-serif",
        fontSize: `${Math.round(TITLE_FONT_PX * dpr())}px`,
        color: "#ffffff",
      })
      .setOrigin(0.5);

    const center = (): void => {
      title.setPosition(this.scale.width / 2, this.scale.height / 2);
    };
    center();

    // Re-center on rotation / window resize.
    this.scale.on(Phaser.Scale.Events.RESIZE, center);
    this.events.once(Phaser.Scenes.Events.SHUTDOWN, () => {
      this.scale.off(Phaser.Scale.Events.RESIZE, center);
    });

    this.titleTimer = this.time.delayedCall(TITLE_SHOW_MS, () => {
      this.titleTimer = null;
      if (this.starting) return; // review NEW-1: a start was taken during the title (a resumed seat): keep its screen
      // ?solo, ?stress, ?loadout and ?tune start a solo run at once (Epic 1 playtest links).
      if (skipsStartScreen(urlOptions())) return this.startSolo();
      uiStore.handle("startSolo", () => this.startSolo());
      uiStore.handle("startOnline", (session) => this.startOnline(session));
      uiStore.set(error ? { kind: "start", error } : { kind: "start" });
    });
  }

  /** The host started the online run: the server runs the fight (Story 2.4). */
  private startOnline(session: NetSession): void {
    this.startGame({ mode: "online", session });
  }

  /** Offline play, exactly as in Epic 1. */
  private startSolo(): void {
    this.startGame({ mode: "solo" });
  }

  /**
   * Story 9.14 (reviews H1, NEW-1, NEW-2): takes the first start request only (the handlers go, the title's delayed
   * step is cancelled); the Game scene starts once the street props image has settled (drawn with it, or from code
   * after a failure or the timeout), exactly once, and only if Boot is still the running scene. While it waits the
   * start screen goes (its buttons would do nothing) and the canvas says "Loading…" under the title.
   */
  private startGame(data: GameSceneData): void {
    if (this.starting) return;
    this.starting = true;
    uiStore.handle("startSolo", undefined);
    uiStore.handle("startOnline", undefined);
    this.titleTimer?.remove();
    this.titleTimer = null;
    if (streetPropsState() === "loading") this.showLoading(data.mode === "online");
    whenStreetPropsSettled(() => {
      if (!this.sys.isActive()) return;
      this.scene.start("Game", data);
    });
  }

  private showLoading(online: boolean): void {
    uiStore.set(playingScreen(online)); // the Game scene sets the same screen when it starts
    this.add
      .text(this.scale.width / 2, this.scale.height / 2 + LOADING_GAP_PX * dpr(), "Loading…", {
        fontFamily: "system-ui, sans-serif",
        fontSize: `${Math.round(LOADING_FONT_PX * dpr())}px`,
        color: "#c8c8c8",
      })
      .setOrigin(0.5);
  }
}
