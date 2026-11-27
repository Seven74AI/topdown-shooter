// Story 10.6 (B6, review N2): first, so the report log sees every console line and error from boot on.
import "./debug/clientLogBoot";
import * as Phaser from "phaser";
// The condensed HUD face (asset fixes round 5: the boss warning display; also the boss bar and painted labels).
import "@fontsource/oswald/600.css";
import "@fontsource/oswald/700.css";
import { h, render } from "preact";
import { dpr } from "./display";
import { clientLog, reportProbes } from "./debug/clientLog";

import { BootScene } from "./scenes/BootScene";
import { GameScene } from "./scenes/GameScene";
import { HudScene } from "./scenes/HudScene";
import { App } from "./ui/App";
import { installPerfProbe } from "./debug/perfProbe";
import { installGraphicsGuard } from "./render/gfx/graphicsGuard";
import { gfxStatus } from "./render/gfx/gfxStatus";
import { textureRegistry } from "./render/gfx/textureRegistry";
import { urlOptions } from "./debug/urlOptions";
import { installAdminGate } from "./debug/adminGate";
import { accountStore } from "./net/accountStore";
import { uiStore } from "./ui/uiState";
import { lobbyStore } from "./net/lobbyStore";
import { JOIN_ERROR_TEXT } from "./net/joinErrors";
import { parseJoinPath } from "./net/route";
import { NetSession, type NetRoomLike } from "./net/session";
import { DevThrottle, activeThrottle } from "./net/devThrottle";
import { createOnlinePhaseHandler } from "./net/onlineFlow";
import { clientBalance } from "./debug/clientBalance";
import { activeRun } from "./net/activeRun";
import type { RunConnection } from "./net/connection";
import { isRoomCode, type Result } from "@topdown/shared";
import { RUN_SAVED_TEXT, SERVER_RESTARTING_TEXT, serverNotice } from "./net/serverNotice";
import { seatStore } from "./net/seatStore";
import { linkStore } from "./net/linkMonitor";
import { NET_PROTOCOL_VERSION, RECONNECT, shouldRescueReload } from "@topdown/shared";
import "./ui/overlay.css";

// Story 6.11 re-review 2 (RR2-M1): when the page last became visible (no late dawn right after a freeze).
let lastShownMs = Number.NEGATIVE_INFINITY;
document.addEventListener("visibilitychange", () => {
  if (!document.hidden) lastShownMs = performance.now();
});

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

// Story 4.13: survive a lost WebGL context (Android app switch): redraw every generated texture on
// restore; a reload notice if it never comes back; a message when there is no WebGL at all.
installGraphicsGuard(game, () => lobbyStore.current() !== null);

// Story 10.6 (AC 3): what a report reads about the run and the graphics (only when a report is made).
reportProbes.run = () => {
  const screen = uiStore.get();
  if (screen.kind === "results") return { seed: screen.seed, wave: screen.wave };
  if (screen.kind !== "playing") return null;
  const scene = game.scene.getScene("Game") as GameScene | null;
  const world = scene?.reportWorld();
  return scene && world ? { seed: scene.runSeed, wave: world.waves.number } : null;
};
let rendererName: string | undefined | null = null;
reportProbes.renderer = () => {
  if (rendererName !== null) return rendererName;
  try {
    const gl = (game.renderer as { gl?: WebGLRenderingContext }).gl;
    const ext = gl?.getExtension("WEBGL_debug_renderer_info");
    const r = gl ? gl.getParameter(ext ? ext.UNMASKED_RENDERER_WEBGL : gl.RENDERER) : undefined;
    rendererName = typeof r === "string" ? r.slice(0, 200) : undefined;
  } catch {
    rendererName = undefined;
  }
  return rendererName;
};
clientLog.note("boot", { protocol: NET_PROTOCOL_VERSION, mode: import.meta.env.MODE });

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
  return { result: await go(c), connection: c };
}

function enterLobby(go: (c: Connection) => Promise<Result<RunConnection, string>>): void {
  void connectLazily(go).then((r) => {
    if (!r) return uiStore.set({ kind: "start", error: JOIN_ERROR_TEXT.unreachable });
    if (!r.result.ok) return uiStore.set({ kind: "start", error: r.result.error });
    enterRoom(r.result.value, r.connection);
  });
}

/**
 * Follows a joined room (a create, a join, or Story 8.1's recovered seat: a takeover, a remembered
 * seat or a reload's reconnect). A recovered room in a run phase starts the Game scene with a new
 * session (the late-scene-start path; a running Game scene restarts onto it).
 */
function enterRoom(room: RunConnection, c: Connection): void {
  {
    lobbyStore.attach(room, {
      watch: c.watchLobby,
      fight: throttled(room),
      // Story 8.1 (AC 6): the takeover by guest token, with the name this seat joined with.
      rejoin: () => c.rejoinGame(room.roomId, seatStore.load()?.name ?? lobbyStore.myName() ?? ""),
      onRecovered: (next) => {
        room.reconnection.enabled = false; // the old room stops retrying; the new one has the seat
        enterRoom(next, c);
        void room.leave(false); // after the attach (the store follows `next`); never consented: the old session no longer owns the seat, and a consented leave must never free it
      },
      onLost: (reason, serverText) => {
        if (reason === "taken_over") {
          // Story 8.1 (D5): this seat is open in another tab now.
          uiStore.set({ kind: "start", error: JOIN_ERROR_TEXT.alreadyJoined });
          uiStore.request("leaveRun", JOIN_ERROR_TEXT.alreadyJoined);
          return;
        }
        if (reason === "saved") {
          // Story 8.5 (AC 9): "Run saved. Anyone from this run can resume it for 7 days." with OK; carried ghosts drop with the scene.
          uiStore.set({ kind: "start" });
          uiStore.request("leaveRun");
          serverNotice.show(RUN_SAVED_TEXT);
          return;
        }
        if (reason === "removed") {
          // Story 8.3 (AC 12): "You were removed from this run" with Back to start (the notice dialog); no reconnect.
          uiStore.set({ kind: "start" });
          uiStore.request("leaveRun");
          serverNotice.show(JOIN_ERROR_TEXT.removed);
          return;
        }
        if (reason === "connection_lost") {
          uiStore.set({ kind: "start", error: JOIN_ERROR_TEXT.unreachable });
          uiStore.request("leaveRun", JOIN_ERROR_TEXT.unreachable); // mid-run: stop the Game scene too
          return;
        }
        uiStore.set({ kind: "start" }); // Story 2.2: stop or redeploy, the dialog goes over the start screen
        uiStore.request("leaveRun"); // mid-run: stop the Game scene too
        serverNotice.show(serverText ?? SERVER_RESTARTING_TEXT); // e.g. "The game hit an error, sorry"
      },
      // Lobby → wave → results → lobby → wave … in the same room (Stories 2.4, 2.8).
      onPhase: createOnlinePhaseHandler({
        code: room.roomId,
        state: () => room.state,
        // The host started: a fresh session per run. `run.joined` came long before.
        makeSession: () => {
          const joined = lobbyStore.joinedInfo();
          const inbox = lobbyStore.inbox();
          const fight = lobbyStore.fightRoom(); // the dev throttle around the room when `?lag` is on (2.6)
          if (!joined || !inbox || !fight || lobbyStore.current() !== room) return null;
          // Bound to this room (Story 2.4 review): a late leave of this session never leaves a newer room.
          return new NetSession(fight, joined, () => leaveRoom(room), inbox);
        },
        inbox: () => lobbyStore.inbox(),
        mySlot: () => lobbyStore.joinedInfo()?.slot, // Story 7.2 review N1: the Results "YOU" row
        dawnS: clientBalance().waves.evac.dawnS, // Story 6.11
        pageHidden: () => document.hidden, // re-review 2 (RR2-M1)
        lastShownMs: () => lastShownMs,
        ui: uiStore,
      }),
    });
    uiStore.set({ kind: "lobby", code: room.roomId });
  }
}

/**
 * Story 8.1 (AC 6, 7): a reload (or the hung-reconnect rescue below) with a seat in sessionStorage
 * goes straight back into it: the SDK token first, then the takeover by guest token. Nothing saved,
 * or the seat is gone: the start screen as usual.
 */
function resumeSavedSeat(): void {
  const seat = seatStore.load();
  if (!seat) return;
  void import("./net/connection")
    .then(async (c) => {
      let removed = false;
      const room =
        (await c.reconnectSeat(seat.token)) ??
        (await c.rejoinGame(seat.roomId, seat.name).then((r) => {
          if (!r.ok && r.reason === "removed") removed = true;
          return r.ok ? r.room : null;
        }));
      if (!room) {
        seatStore.clear();
        if (removed) serverNotice.show(JOIN_ERROR_TEXT.removed); // Story 8.3 review M3: a removed seat reloads into the notice
        return;
      }
      enterRoom(room, c);
    })
    .catch(() => {});
}

// Story 8.1 (AC 7, D6: any browser): a page hidden > 10 s whose reconnect still hasn't opened 5 s
// after it was shown again reloads; `resumeSavedSeat` then takes the seat straight back.
let hiddenAtMs = Number.NEGATIVE_INFINITY;
let hiddenForMs = 0;
document.addEventListener("visibilitychange", () => {
  const now = performance.now();
  if (document.hidden) {
    hiddenAtMs = now;
    return;
  }
  hiddenForMs = Number.isFinite(hiddenAtMs) ? now - hiddenAtMs : 0;
  const shownAt = now;
  if (hiddenForMs <= RECONNECT.hiddenRescueMs) return;
  setTimeout(() => {
    if (document.hidden) return;
    if (shouldRescueReload(hiddenForMs, performance.now() - shownAt, linkStore.get().status === "reconnecting")) location.reload();
  }, RECONNECT.rescueOpenMs);
});

/**
 * `?lag=<rttMs>&jitter=<ms>` (Story 2.6, release builds too; Story 8.8 `&loss=<pct>&stall=<ms>`): the fight reads this room through
 * the dev throttle. It wraps the room at the join, before the RunInbox exists, so pings, event
 * batches, patches and inputs are all delayed alike. Pumped from the game loop (no timers), in the
 * lobby too, until the room is left.
 */
function throttled(room: RunConnection): NetRoomLike {
  const o = urlOptions().throttle;
  if (!o) return room;
  const throttle = new DevThrottle(room, { lagMs: o.rttMs, jitterMs: o.jitterMs, lossPct: o.lossPct, stallMs: o.stallMs });
  activeThrottle.current = throttle; // Story 8.8: the overlay's loss line
  const pump = (): void => throttle.pump(performance.now());
  game.events.on(Phaser.Core.Events.PRE_STEP, pump);
  room.onLeave(() => {
    game.events.off(Phaser.Core.Events.PRE_STEP, pump);
    throttle.close();
    if (activeThrottle.current === throttle) activeThrottle.current = null;
  });
  return throttle;
}

uiStore.handle("createGame", (name) => enterLobby((c) => c.createGame(name)));
uiStore.handle("joinGame", (code, name) => enterLobby((c) => c.joinGame(code, name)));
uiStore.handle("resumeGame", (id, name) => enterLobby((c) => c.resumeGame(id, name))); // Story 8.6
/**
 * Leaves the room for good: the current one, or with `room` only if that is still the current one.
 * A share link is done with once you leave (BASE_URL: "/" on the VPS).
 */
function leaveRoom(room?: RunConnection): void {
  if (room !== undefined && !lobbyStore.leave(room)) return; // a stale session: a newer room stays
  if (room === undefined) lobbyStore.leave();
  activeRun.set(null); // no run of that room is current any more
  history.replaceState(null, "", import.meta.env.BASE_URL);
}

uiStore.handle("lobbyReturn", () => lobbyStore.returnToLobby());
uiStore.handle("leaveLobby", () => {
  leaveRoom();
  // Safety net (2.11 review): if an online Game scene runs behind the lobby screen, stop it too
  // (a request with no handler, the usual case, does nothing).
  uiStore.request("leaveRun");
  uiStore.set({ kind: "start" });
});

const ui = document.getElementById("ui");
// A share link `/j/<code>` opens the start screen with the code filled in and the name focused.
const joinCode = parseJoinPath(location.pathname, import.meta.env.BASE_URL);
// A share link whose code can't exist (e.g. a typo, /j/ABCDE) says so instead of guessing a code.
if (joinCode !== null && !isRoomCode(joinCode)) uiStore.set({ kind: "start", error: JOIN_ERROR_TEXT.notFound });
if (ui) render(h(App, { joinCode: joinCode !== null && isRoomCode(joinCode) ? joinCode : null }), ui);
resumeSavedSeat(); // Story 8.1: a reload mid-run takes its seat back

if (import.meta.env.DEV) {
  // Dev builds only: Vite replaces import.meta.env.DEV with false in production and drops this
  // block (checked by tools/checks/noCheatsInRelease.test.ts).
  Object.assign(window, { __game: game }); // for automated browser checks (docs/perf/epic-1-stress.md)
  // Story 4.13 browser checks: renderer, lost / restored counts, registry rebuilds.
  Object.assign(window, {
    __gfx: () => ({ line: gfxStatus.line(), rebuilds: textureRegistry.rebuildCount, last: textureRegistry.lastReport, keys: textureRegistry.keys() }),
  });
  void import("./debug/adminTools").then(({ mountAdminTools }) => mountAdminTools(game));
} else {
  // Story 10.11 (AC 3, 7): production builds download the cheat panel only for an admin account (never `__game` /
  // `__gfx`: those stay dev-only above). The chunk is `assets/admin-tools-*` (vite.config.ts).
  installAdminGate(game, accountStore, () => import("./debug/adminTools"));
}
