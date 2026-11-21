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
import { parseJoinPath } from "./net/route";
import type { RunConnection } from "./net/connection";
import type { Result } from "@topdown/shared";
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

// Online lobby (Stories 2.1/2.3): networking stays in net/, the scenes don't know about it. The SDK
// is loaded on the first Create game or Join, so solo play doesn't download it.
type Connection = typeof import("./net/connection");

async function connectLazily(go: (c: Connection) => Promise<Result<RunConnection, string>>) {
  let c: Connection;
  try {
    c = await import("./net/connection");
  } catch {
    return; // chunk failed to load (offline)
  }
  return { result: await go(c), watch: c.watchLobby };
}

function enterLobby(go: (c: Connection) => Promise<Result<RunConnection, string>>): void {
  void connectLazily(go).then((r) => {
    if (!r) return uiStore.set({ kind: "start", error: JOIN_ERROR_TEXT.unreachable });
    if (!r.result.ok) return uiStore.set({ kind: "start", error: r.result.error });
    const room = r.result.value;
    lobbyStore.attach(room, {
      watch: r.watch,
      onLost: () => uiStore.set({ kind: "start", error: JOIN_ERROR_TEXT.unreachable }),
      onPhase: (phase) => {
        if (phase === "wave") uiStore.request("startOnline");
      },
    });
    uiStore.set({ kind: "lobby", code: room.roomId });
  });
}

uiStore.handle("createGame", (name) => enterLobby((c) => c.createGame(name)));
uiStore.handle("joinGame", (code, name) => enterLobby((c) => c.joinGame(code, name)));
uiStore.handle("leaveLobby", () => {
  lobbyStore.leave();
  // A share link is done with once you leave. BASE_URL is "/" on the VPS (GitHub Pages: a subpath).
  history.replaceState(null, "", import.meta.env.BASE_URL);
  uiStore.set({ kind: "start" });
});

const ui = document.getElementById("ui");
// A share link `/j/<code>` opens the start screen with the code filled in and the name focused.
if (ui) render(h(App, { joinCode: parseJoinPath(location.pathname) }), ui);

if (import.meta.env.DEV) {
  // Dev builds only: Vite replaces import.meta.env.DEV with false in production and drops this
  // block, the dynamic import and the cheat chunk (checked by tools/checks/noCheatsInRelease.test.ts).
  Object.assign(window, { __game: game }); // for automated browser checks (docs/perf/epic-1-stress.md)
  void import("./debug/DevCheats").then(({ mountDevCheats }) => mountDevCheats(game));
}
