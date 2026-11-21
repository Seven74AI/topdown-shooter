import * as Phaser from "phaser";
import { GAME_TITLE } from "@topdown/shared";
import { dpr } from "../display";
import { uiStore } from "../ui/uiState";
import { skipsStartScreen, urlOptions } from "../debug/urlOptions";
import type { GameSceneData } from "./GameScene";

const TITLE_SHOW_MS = 500; // how long the title shows before the start screen (or a ?solo run)
const TITLE_FONT_PX = 32; // CSS pixels; scaled by dpr() so it reads the same on every phone

export class BootScene extends Phaser.Scene {
  constructor() {
    super("Boot");
  }

  create(): void {
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

    this.time.delayedCall(TITLE_SHOW_MS, () => {
      // ?solo, ?stress, ?loadout and ?tune start a solo run at once (Epic 1 playtest links).
      if (skipsStartScreen(urlOptions())) return this.startSolo();
      uiStore.handle("startSolo", () => this.startSolo());
      uiStore.handle("startOnline", () => this.startOnline());
      uiStore.set({ kind: "start" });
    });
  }

  /**
   * The host started the online run (Story 2.3). Until Story 2.4 adds the networked host this
   * shows a "Starting…" placeholder; 2.4 replaces it with
   * `this.scene.start("Game", { mode: "online", session })`.
   */
  private startOnline(): void {
    uiStore.set({ kind: "starting" });
  }

  /** Offline play, exactly as in Epic 1. */
  private startSolo(): void {
    uiStore.handle("startSolo", undefined);
    uiStore.handle("startOnline", undefined);
    this.scene.start("Game", { mode: "solo" } satisfies GameSceneData);
  }
}
