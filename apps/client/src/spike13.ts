// SPIKE-13-1: the whole file is a throwaway spike hook (branch spike-13-1 only, never merged).
// Built in only when VITE_SPIKE is set. The app polls the runner's control server (VITE_SPIKE_CTL)
// for commands and reports every result twice: a `SPIKE13 ` console line (stdout of the app,
// Capacitor's console bridge) and a POST to the control server's /log.
import type * as Phaser from "phaser";
import { Preferences } from "@capacitor/preferences"; // SPIKE-13-1 (F4)
import { serverUrl } from "./net/serverUrl";
import { shareLink } from "./ui/share";
import { parseJoinPath } from "./net/route";
import { uiStore } from "./ui/uiState";
import { lobbyStore } from "./net/lobbyStore";
import { GUEST_TOKEN_KEY, guestTokens } from "./net/guestToken";
import { accountSession } from "./net/account";
import { unlockAudio } from "./audio/placeholderSfx";
import { gfxStatus } from "./render/gfx/gfxStatus";
import { textureRegistry } from "./render/gfx/textureRegistry";
import { installHintStore } from "./install/installHint";
import { C2S } from "@topdown/shared";

const CTL = (import.meta.env.VITE_SPIKE_CTL as string | undefined) ?? "http://127.0.0.1:2668";
const t0 = performance.now();
let seq = 0;

function out(key: string, value: unknown): void {
  const line = `SPIKE13 ${key} ${JSON.stringify(value)}`;
  console.log(line);
  const body = JSON.stringify({ n: seq++, t: Math.round(performance.now() - t0), key, value });
  void fetch(`${CTL}/log`, { method: "POST", body, headers: { "content-type": "text/plain" } }).catch((e: unknown) => console.log(`SPIKE13 ctl_log_error ${String(e)}`));
}

const err = (e: unknown): string => (e instanceof Error ? `${e.name}: ${e.message}` : String(e));
const sleep = (ms: number): Promise<void> => new Promise((r) => setTimeout(r, ms));

type AnyRoom = { roomId: string; sessionId: string; state: { phase?: string; wave?: number; remaining?: number; players?: { size: number; forEach(fn: (p: { name: string; ready: boolean }, id: string) => void): void } }; send(t: string, m: unknown): void };
const room = (): AnyRoom | null => lobbyStore.current() as unknown as AnyRoom | null;

function safeArea(): Record<string, string> {
  const d = document.createElement("div");
  d.style.cssText = "position:fixed;left:0;top:0;padding:env(safe-area-inset-top) env(safe-area-inset-right) env(safe-area-inset-bottom) env(safe-area-inset-left);visibility:hidden";
  document.body.appendChild(d);
  const cs = getComputedStyle(d);
  const r = { top: cs.paddingTop, right: cs.paddingRight, bottom: cs.paddingBottom, left: cs.paddingLeft };
  d.remove();
  return r;
}

function audioState(game: Phaser.Game): unknown {
  const s = game.sound as unknown as { locked?: boolean; context?: AudioContext };
  return { phaserLocked: s.locked ?? null, phaserCtx: s.context?.state ?? null };
}

async function probe(game: Phaser.Game): Promise<void> {
  // F1 boot and WebGL
  const r = game.renderer as unknown as { type: number; gl?: WebGLRenderingContext };
  const gl = r.gl;
  const ext = gl?.getExtension("WEBGL_debug_renderer_info");
  out("F1", {
    href: location.href,
    ua: navigator.userAgent,
    rendererType: r.type, // 1 canvas, 2 WebGL
    glVersion: gl ? gl.getParameter(gl.VERSION) : null,
    glslVersion: gl ? gl.getParameter(gl.SHADING_LANGUAGE_VERSION) : null,
    glRenderer: gl ? gl.getParameter(ext ? ext.UNMASKED_RENDERER_WEBGL : gl.RENDERER) : null,
    maxTexture: gl ? gl.getParameter(gl.MAX_TEXTURE_SIZE) : null,
    webgl2: !!document.createElement("canvas").getContext("webgl2"),
    oswald600: document.fonts.check("600 16px Oswald"),
    oswald700: document.fonts.check("700 16px Oswald"),
    fontsStatus: document.fonts.status,
    bootLoaderLeft: !!document.getElementById("boot-loader"),
    screen: uiStore.get().kind,
    gfx: gfxStatus.line(),
    textures: textureRegistry.keys().length,
    dpr: devicePixelRatio,
    inner: [innerWidth, innerHeight],
    screenWH: [screen.width, screen.height],
    safeArea: safeArea(),
    viewportMeta: document.querySelector('meta[name="viewport"]')?.getAttribute("content") ?? null,
    isSecureContext,
  });
  // F3 audio (before any input)
  out("F3_before", audioState(game));
  // F4 storage: what came back from the last launch, then write this launch's stamp
  const stamp = new Date().toISOString();
  let prefPrev: string | null = null;
  try {
    prefPrev = (await Preferences.get({ key: "spike13.stamp" })).value;
    await Preferences.set({ key: "spike13.stamp", value: stamp });
  } catch (e) {
    prefPrev = `error ${err(e)}`;
  }
  const keys: string[] = [];
  for (let i = 0; i < localStorage.length; i++) keys.push(localStorage.key(i) ?? "");
  out("F4", {
    lsPrevStamp: localStorage.getItem("spike13.stamp"),
    lsGuestTokenBefore: localStorage.getItem(GUEST_TOKEN_KEY),
    guestToken: guestTokens.get(),
    lsSettings: localStorage.getItem("topdown-shooter.settings") !== null,
    lsKeys: keys,
    prefPrevStamp: prefPrev,
    stamp,
  });
  localStorage.setItem("spike13.stamp", stamp);
  // F7 server URL, share links, join path
  out("F7", {
    serverUrlBuilt: serverUrl(),
    serverUrlWithoutOverride: `${location.origin}/api`,
    origin: location.origin,
    shareLink: shareLink("ABCD"),
    pathname: location.pathname,
    parseJoinPath: parseJoinPath(location.pathname, import.meta.env.BASE_URL),
    parseJoinPathOfShare: parseJoinPath("/j/ABCD", import.meta.env.BASE_URL),
    baseUrl: import.meta.env.BASE_URL,
  });
  // F8 browser-only APIs
  let clip = "absent";
  if (navigator.clipboard) {
    try {
      await navigator.clipboard.writeText("spike13");
      clip = "ok";
    } catch (e) {
      clip = err(e);
    }
  }
  let orient = "absent";
  const so = screen.orientation as unknown as { lock?: (o: string) => Promise<void>; type?: string } | undefined;
  if (so && typeof so.lock === "function") {
    try {
      await so.lock("landscape");
      orient = "ok";
    } catch (e) {
      orient = err(e);
    }
  }
  const ih = installHintStore as unknown as Record<string, unknown>;
  out("F8", {
    vibrate: typeof (navigator as { vibrate?: unknown }).vibrate,
    clipboard: typeof navigator.clipboard,
    clipboardWrite: clip,
    share: typeof navigator.share,
    canShare: typeof navigator.canShare,
    orientationType: so?.type ?? null,
    orientationLock: orient,
    fullscreenEnabled: (document as { fullscreenEnabled?: boolean }).fullscreenEnabled ?? null,
    webkitFullscreenEnabled: (document as { webkitFullscreenEnabled?: boolean }).webkitFullscreenEnabled ?? null,
    requestFullscreen: typeof document.documentElement.requestFullscreen,
    standalone: (navigator as { standalone?: boolean }).standalone ?? null,
    displayModeStandalone: matchMedia("(display-mode: standalone)").matches,
    beforeInstallPromptFired: bipFired,
    installHintStore: Object.fromEntries(Object.entries(ih).filter(([, v]) => typeof v !== "function").map(([k, v]) => [k, String(v)])),
    installHintInDom: !!document.querySelector("[class*=install]"),
    serviceWorker: typeof navigator.serviceWorker,
  });
  // F5 account session, three ways
  const url = `${serverUrl()}/account/session`;
  for (const credentials of ["same-origin", "include"] as const) {
    try {
      const res = await fetch(url, { method: "POST", credentials, headers: { "content-type": "application/json" }, body: JSON.stringify({ deviceToken: guestTokens.get() }) });
      const text = await res.text();
      out(`F5_${credentials}`, { status: res.status, type: res.type, body: text.slice(0, 300), setCookieVisible: res.headers.get("set-cookie"), acao: res.headers.get("access-control-allow-origin") });
    } catch (e) {
      out(`F5_${credentials}`, { error: err(e) });
    }
  }
  try {
    // without a body token: does the cookie alone come back (= was it stored and sent)?
    const res = await fetch(url, { method: "POST", credentials: "include", headers: { "content-type": "application/json" }, body: "{}" });
    out("F5_cookie_only", { status: res.status, body: (await res.text()).slice(0, 300) });
  } catch (e) {
    out("F5_cookie_only", { error: err(e) });
  }
  const s = await accountSession();
  out("F5_accountSession", s === null ? null : { saved: s.saved, deviceTokenMatches: s.deviceToken === guestTokens.get() });
  out("F5_document_cookie", document.cookie);
}

let bipFired = false;
let watchTimer: ReturnType<typeof setInterval> | null = null;

function watchRoom(): void {
  if (watchTimer) return;
  let last = "";
  watchTimer = setInterval(() => {
    const r = room();
    const st = r?.state;
    let ready = 0;
    st?.players?.forEach((p) => void (p.ready && ready++));
    const now = JSON.stringify({ code: r?.roomId ?? null, phase: st?.phase ?? null, wave: st?.wave ?? null, players: st?.players?.size ?? 0, ready, screen: uiStore.get().kind });
    if (now !== last) out("F6_state", JSON.parse(now));
    last = now;
  }, 500);
}

async function run(game: Phaser.Game, cmd: { op: string; arg?: string }): Promise<void> {
  switch (cmd.op) {
    case "probe":
      return probe(game);
    case "audio_input": {
      // F3: a synthetic (untrusted) input, then unlockAudio() as the HUD's first touch would call it
      document.dispatchEvent(new KeyboardEvent("keydown", { key: "w", code: "KeyW" }));
      document.dispatchEvent(new KeyboardEvent("keyup", { key: "w", code: "KeyW" }));
      unlockAudio();
      await sleep(1000);
      const ac = new AudioContext();
      const fresh = ac.state;
      await Promise.race([ac.resume().catch(() => {}), sleep(2000)]); // a resume without a gesture can stay pending
      await sleep(300);
      out("F3_after", { ...(audioState(game) as object), freshContextAtCreate: fresh, freshContextAfterResume: ac.state });
      void ac.close();
      return;
    }
    case "create":
      out("F6_create", { serverUrl: serverUrl() });
      watchRoom();
      uiStore.request("createGame", cmd.arg ?? "Spike");
      for (let i = 0; i < 40 && !room(); i++) await sleep(250);
      out("F6_created", { code: room()?.roomId ?? null, screen: uiStore.get(), seat: room()?.sessionId ?? null });
      return;
    case "lobby_ready":
      room()?.send(C2S.LOBBY_SET_READY, { ready: true });
      return out("F6_sent", "lobby_ready");
    case "start":
      room()?.send(C2S.RUN_START, {});
      return out("F6_sent", "start");
    case "build_ready":
      room()?.send(C2S.BUILD_SET_READY, { ready: true });
      return out("F6_sent", "build_ready");
    case "shop": {
      const gs = game.scene.getScene("Game") as unknown as { hudModel?: { shopPressed: boolean } } | null;
      if (gs?.hudModel) gs.hudModel.shopPressed = true; // the build bar's Shop tile, without the tap
      await sleep(1500);
      return out("F9_shop", { open: !!document.querySelector(".shop"), safeArea: safeArea() });
    }
    case "state":
      return out("state", { screen: uiStore.get().kind, gfx: gfxStatus.line(), rebuilds: textureRegistry.rebuildCount, textures: textureRegistry.keys().length, hidden: document.hidden, audio: audioState(game), stress: (window as { __stress?: (ms: number) => unknown }).__stress?.(3000) ?? null });
    case "stress": {
      // F2: reload into `?stress=150&debug=1` (urlOptions reads location.search once, at boot)
      location.replace(`${import.meta.env.BASE_URL}?stress=${cmd.arg ?? "150"}&debug=1`);
      return;
    }
    case "eval":
      return out("eval", String(cmd.arg ? (0, eval)(cmd.arg) : null));
    default:
      return out("unknown_cmd", cmd);
  }
}

export function runSpike13(game: Phaser.Game): void {
  window.addEventListener("beforeinstallprompt", () => {
    bipFired = true;
    out("F8_beforeinstallprompt", true);
  });
  document.addEventListener("visibilitychange", () => out("F10_visibility", { hidden: document.hidden, gfx: gfxStatus.line(), rebuilds: textureRegistry.rebuildCount, loopRunning: (game.loop as unknown as { running?: boolean }).running ?? null }));
  window.addEventListener("error", (e) => out("pageerror", `${e.message} @ ${e.filename}:${e.lineno}`));
  window.addEventListener("unhandledrejection", (e) => out("rejection", err(e.reason)));
  out("boot", { href: location.href, sinceNavMs: Math.round(performance.now()), ctl: CTL });
  if (location.search.includes("stress=")) {
    // F2 sampling: every 3 s, 12 samples (36 s)
    void (async () => {
      for (let i = 0; i < 12; i++) {
        await sleep(3000);
        out("F2", (window as { __stress?: (ms: number) => unknown }).__stress?.(3000) ?? { noProbe: true, screen: uiStore.get().kind });
      }
      out("F2_done", { mem: (performance as { memory?: { usedJSHeapSize: number } }).memory?.usedJSHeapSize ?? null });
    })();
  }
  // the command loop: GET /cmd → {op, arg} or {} (nothing to do)
  void (async () => {
    let fails = 0;
    for (;;) {
      try {
        const res = await fetch(`${CTL}/cmd`, { cache: "no-store" });
        const cmd = (await res.json()) as { op?: string; arg?: string };
        fails = 0;
        if (cmd.op) {
          try {
            let done = false;
            await Promise.race([run(game, cmd as { op: string; arg?: string }).finally(() => (done = true)), sleep(45_000).then(() => void (done || out("cmd_timeout", cmd.op)))]);
          } catch (e) {
            out("cmd_error", { op: cmd.op, error: err(e) });
          }
          continue;
        }
      } catch (e) {
        if (fails++ % 20 === 0) console.log(`SPIKE13 ctl_poll_error ${err(e)}`);
      }
      await sleep(400);
    }
  })();
}
