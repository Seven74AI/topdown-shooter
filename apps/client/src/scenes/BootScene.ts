import * as Phaser from "phaser";
import { GAME_TITLE } from "@topdown/shared";
import { dpr } from "../display";
import { uiStore } from "../ui/uiState";
import { skipsStartScreen, urlOptions } from "../debug/urlOptions";
import { urlHasDevSwitch } from "../debug/soloDevSwitches";
import { accountSession } from "../net/account";
import { prewarmAmbience } from "../audio/ambience";
import type { GameSceneData } from "./GameScene";
import type { NetSession } from "../net/session";
import { loadStreetProps } from "../render/city/streetPropsAtlas";

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
    // Story 9.14 (B1, B26): the street props atlas image (~0.5 MB) downloads in the background; nothing waits for it. A
    // run that starts before it is in draws its street props from code; the next run uses the image.
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
      if (skipsStartScreen(urlOptions())) {
        // Story 10.11 (AD-4): a production direct link with a dev switch waits for the session (≤ 3 s, the account
        // fetch's own timeout) so an admin's first run honours it; every other link starts at once, as before.
        if (!import.meta.env.DEV && urlHasDevSwitch(location.search)) {
          void accountSession().finally(() => this.startSolo());
          return;
        }
        return this.startSolo();
      }
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
   * Story 9.14 (review NEW-1, B26): the first start request only starts the Game scene, at once (the handlers go, the
   * title's delayed step is cancelled); later requests are ignored. Nothing waits for the street props image.
   */
  private startGame(data: GameSceneData): void {
    if (this.starting) return;
    this.starting = true;
    uiStore.handle("startSolo", undefined);
    uiStore.handle("startOnline", undefined);
    this.titleTimer?.remove();
    this.titleTimer = null;
    this.scene.start("Game", data);
  }
}
