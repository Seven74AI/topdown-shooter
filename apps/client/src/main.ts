import * as Phaser from "phaser";
import { h, render } from "preact";
import { dpr } from "./display";
import { BootScene } from "./scenes/BootScene";
import { GameScene } from "./scenes/GameScene";
import { HudScene } from "./scenes/HudScene";
import { App } from "./ui/App";
import { installPerfProbe } from "./debug/perfProbe";
import { urlOptions } from "./debug/urlOptions";
import { uiStore } from "./ui/uiState";
import { lobbyStore } from "./net/lobbyStore";
import { JOIN_ERROR_TEXT } from "./net/joinErrors";
import "./ui/overlay.css";

// Phaser 4 has no `resolution` option: size the canvas in device pixels
// (capped at MAX_DPR) and zoom it back down to the CSS viewport.
const deviceSize = (): [number, number] => [
  Math.round(window.innerWidth * dpr()),
  Math.round(window.innerHeight * dpr()),
];

/** Touch pointers Phaser tracks: move stick + aim stick + one HUD button. */
const ACTIVE_TOUCH_POINTERS = 3;

const [width, height] = deviceSize();

const game = new Phaser.Game({
  type: Phaser.AUTO,
  parent: "game",
  backgroundColor: "#000000",
  width,
  height,
  scale: { mode: Phaser.Scale.NONE, zoom: 1 / dpr() },
  input: { activePointers: ACTIVE_TOUCH_POINTERS },
  scene: [BootScene, GameScene, HudScene],
});

window.addEventListener("resize", () => {
  game.scale.resize(...deviceSize());
  game.scale.setZoom(1 / dpr());
});

// Performance overlay and ?stress timing (Story 1.11): release builds too.
installPerfProbe(game, urlOptions().debug);

// Online lobby (Story 2.1): networking stays in net/, the scenes don't know about it. The SDK is
// loaded on the first Create game, so solo play doesn't download it.
async function createGameLazily(name: string) {
  try {
    const { createGame } = await import("./net/connection");
    return await createGame(name);
  } catch {
    return { ok: false, error: JOIN_ERROR_TEXT.unreachable } as const; // chunk failed to load (offline)
  }
}
uiStore.handle("createGame", (name) => {
  void createGameLazily(name).then((r) => {
    if (!r.ok) return uiStore.set({ kind: "start", error: r.error });
    lobbyStore.attach(r.value, () => uiStore.set({ kind: "start", error: JOIN_ERROR_TEXT.unreachable }));
    uiStore.set({ kind: "lobby", code: r.value.roomId });
  });
});
uiStore.handle("leaveLobby", () => {
  lobbyStore.leave();
  uiStore.set({ kind: "start" });
});

const ui = document.getElementById("ui");
if (ui) render(h(App, {}), ui);

if (import.meta.env.DEV) {
  // Dev builds only: Vite replaces import.meta.env.DEV with false in production and drops this
  // block, the dynamic import and the cheat chunk (checked by tools/checks/noCheatsInRelease.test.ts).
  Object.assign(window, { __game: game }); // for automated browser checks (docs/perf/epic-1-stress.md)
  void import("./debug/DevCheats").then(({ mountDevCheats }) => mountDevCheats(game));
}
