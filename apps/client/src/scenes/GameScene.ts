import * as Phaser from "phaser";
import {
  NEUTRAL_INPUT,
  PROJECTILE_POOL_CAPACITY,
  TICK_RATE_HZ,
  ZOMBIE_POOL_CAPACITY,
  activeSlot,
  addPlayer,
  isGun,
  setLoadout,
  spectateTarget,
  ticksFor,
  weaponIds,
  weaponStats,
  parseWaveMix,
  ZOMBIE_STATE,
  type Balance,
  type PlayerInput,
  type PlayerState,
  type World,
} from "@topdown/shared";
import { dpr } from "../display";
import { STICK_RADIUS_CSS_PX, TouchSticks } from "../input/TouchSticks";
import { InputRouter } from "../input/InputRouter";
import { attachDesktopInput } from "../input/desktopInput";
import { pixelsPerMeter } from "../render/camera";
import { PlayerView } from "../render/PlayerView";
import { drawStreet } from "../render/StreetView";
import { ZombieView } from "../render/ZombieView";
import { BloodTrailView } from "../render/BloodTrailView";
import { FxView } from "../render/FxView";
import { ProjectileView } from "../render/ProjectileView";
import { DownedView } from "../render/DownedView";
import { menuStep, playingScreen, uiStore, type MenuAction } from "../ui/uiState";
import { neutralizeInput } from "../input/menuInput";
import { ToastQueue, playerLeftText } from "./toastQueue";
import { getSettings } from "../settings/settings";
import {
  COUNTDOWN_LIFT_M,
  MAX_DOWNED_MARKERS,
  MAX_RUSH_MARKERS,
  TEAMMATE_DOWNED,
  TEAMMATE_OUT,
  createHudModel,
} from "./hudModel";
import { LocalSimHost, type SimStepStats } from "../sim/LocalSimHost";
import { NetSimHost } from "../sim/NetSimHost";
import type { SimHost } from "../sim/SimHost";
import { ReadyRequest } from "./readyRequest";
import { activeRun } from "../net/activeRun";
import type { NetSession } from "../net/session";
import type { HudSceneData } from "./HudScene";
import type { BootSceneData } from "./BootScene";
import { urlOptions } from "../debug/urlOptions";
import { clientBalance } from "../debug/clientBalance";
import { getTuning, tunedBalance } from "../debug/tuning";
import { validLoadout } from "./validLoadout";
import { recordSimFrame } from "../debug/perfProbe";
import { perf } from "../debug/perfStats";
import { setupStressWorld, stressRun, viewAround, type ViewRect } from "../debug/stressScenario";
import { netSummary } from "../debug/netSummary";
import { netMeter } from "../net/netMeter";

/** `scene.restart(data)` / `scene.start(data)` options. Phaser keeps the last data when given none: always pass an object. */
export type GameSceneData =
  | {
      /** Offline (a LocalSimHost): Practice solo, tests, dev and the `?solo` links. Absent means solo. */
      mode?: "solo";
      /** Run seed (uint32); a random one when absent (dev cheat "set run seed", Story 1.11). */
      seed?: number;
    }
  /** The server runs the fight (Story 2.4): a NetSimHost on this run's session. */
  | { mode: "online"; session: NetSession };

/** A host with the step timing the perf overlay reads (both hosts have it). */
type SceneHost = SimHost & { readonly stats: SimStepStats };

/** A random uint32 run seed. Client code, so crypto is allowed here (never in packages/shared). */
export function newRunSeed(): number {
  return crypto.getRandomValues(new Uint32Array(1))[0] ?? 1;
}

/** The fight: runs the World through a SimHost, draws it, and feeds it the local input. */
const RUSH_COLOR = 0xff3b30;
/** Short screen shake for heavy weapons (FR19); intensity is a fraction of the view size. */
const SHAKE_MS = 80;
const SHAKE_INTENSITY = 0.004;
/** Rush chevron, in meters, drawn above each of the wave's last zombies. */
const CHEVRON_M = 0.28;
const CHEVRON_LIFT_M = 0.7;
const STATUS_OUT = "You're out: back after this wave";
/** Story 3.1: the banner at the run's first build phase. */
const BUILD_BANNER = "Build phase";
const STATUS_REVIVING = "Reviving…";
/** Solo Results: the one row's name. */
const SOLO_NAME = "You";

export class GameScene extends Phaser.Scene {
  private host: SceneHost | null = null;
  /** `?stress` benchmark run (no in-run menu). */
  private stressMode = false;
  /** When the solo pause started (scene time), to shift the HUD's banner clock on resume. */
  private pausedAtMs = 0;
  /** The same host when solo (the in-run menu pauses it, Story 2.11); null online. */
  private localHost: LocalSimHost | null = null;
  /** Story 2.11: Leave game runs once (a double tap on Leave does nothing more). */
  private leaving = false;
  /** Story 2.11: "<name> left" lines for the HUD, one at a time. */
  private readonly toasts = new ToastQueue();
  /** How this run is simulated: the local World, or the server's (Story 2.4). */
  mode: "solo" | "online" = "solo";
  private sticks: TouchSticks | null = null;
  /** Touch sticks or keyboard + mouse, whichever was used last (Story 1.10). */
  private router: InputRouter | null = null;
  private readonly cursorWorld = new Phaser.Math.Vector2();
  /** One view per player in `world.players`, added and removed as players come and go (Story 2.4). */
  private readonly playerViews = new Map<string, PlayerView>();
  private playerRadiusM = 0;
  private readonly syncPlayerView = (p: PlayerState, id: string): void => {
    let view = this.playerViews.get(id);
    if (!view) {
      view = new PlayerView(this, this.playerRadiusM);
      view.setSlot(this.host?.playerInfo(id).slot ?? 0); // Story 2.9: ring colour by slot
      this.playerViews.set(id, view);
    }
    view.update(p, this.host?.alpha ?? 0, this.time.now);
  };
  /** Story 2.9: every other player for the HUD's names and edge arrows (drawn position, slot, flags). */
  private readonly collectTeammate = (p: PlayerState, id: string): void => {
    const host = this.host;
    const m = this.hudModel;
    if (!host || id === host.localPlayerId || m.teammateCount >= m.teammateSlot.length) return;
    const info = host.playerInfo(id);
    const i = m.teammateCount++;
    const view = this.playerViews.get(id);
    m.teammates[i * 2] = view ? view.x : p.x;
    m.teammates[i * 2 + 1] = view ? view.y : p.y;
    m.teammateSlot[i] = info.slot;
    m.teammateFlags[i] = (p.status === "downed" ? TEAMMATE_DOWNED : 0) | (p.status === "out" ? TEAMMATE_OUT : 0);
    if (m.teammateNames[info.slot] !== info.name) m.teammateNames[info.slot] = info.name;
  };
  private readonly dropPlayerView = (view: PlayerView, id: string): void => {
    if (this.host?.world.players.has(id)) return;
    view.destroy();
    this.playerViews.delete(id);
  };
  private zombieView: ZombieView | null = null;
  /** Story 3.9: blood trails behind Crawlers. */
  private trailView: BloodTrailView | null = null;
  private projectileView: ProjectileView | null = null;
  private fxView: FxView | null = null;
  private downedView: DownedView | null = null;
  /** Solo Results (Story 2.8): zombies the local player killed this run (online: from room state). */
  private kills = 0;
  /**
   * Story 3.1: the Ready this device asked for in the current build phase (shown at once, while the
   * server's copy is a round trip away online), and the phase it belongs to: cleared when it changes.
   */
  /** Story 3.1 review: my Ready button (server truth + a pending tap). */
  private readonly ready = new ReadyRequest();
  private myReady = false;
  private readyCount = 0;
  private readonly countReady = (p: PlayerState, id: string): void => {
    if (id === this.host?.localPlayerId ? this.myReady : p.buildReady) this.readyCount++;
  };
  /** Seconds in the "Downed: …" line now (the string is rebuilt only when it changes). */
  private statusSecs = -1;
  /** Set by `collectDowned` while it walks the players this frame. */
  private revivingSomeone = false;
  private readonly collectDowned = (p: PlayerState): void => {
    const m = this.hudModel;
    if (p.status !== "downed") return;
    if (p.reviverId !== null && p.reviverId === this.host?.localPlayerId) this.revivingSomeone = true;
    if (m.downedCount >= MAX_DOWNED_MARKERS) return;
    const i = m.downedCount * 3;
    m.downed[i] = p.x;
    m.downed[i + 1] = p.y - COUNTDOWN_LIFT_M;
    m.downed[i + 2] = Math.ceil(p.downedTicksLeft / TICK_RATE_HZ);
    m.downedCount++;
  };
  private readonly hudModel = createHudModel();
  private gameOver = false;
  /** False while the dev loadout picker is open: the world doesn't step yet. */
  private running = false;
  private hudWeaponId = "";
  private hudOtherId = "";
  private readonly chevrons: Phaser.GameObjects.Triangle[] = [];
  /** Reused every frame (no per-frame allocation); the host copies it at each step. */
  private readonly input_: { -readonly [K in keyof PlayerInput]: PlayerInput[K] } = { ...NEUTRAL_INPUT };

  constructor() {
    super("Game");
  }

  create(data?: GameSceneData): void {
    const session = data?.mode === "online" ? data.session : null;
    if (session && session !== activeRun.current()) {
      // A start queued while this tab was hidden, for a run that is over (Story 2.8 review): go to
      // the room's current run, or back to the lobby, instead of a dead scene over the lobby screen.
      this.host = null; // Phaser reuses this object: never update a previous run's host
      this.localHost = null;
      const now = activeRun.current();
      if (now) this.scene.start("Game", { mode: "online", session: now } satisfies GameSceneData);
      else this.scene.start("Boot", { lobby: true } satisfies BootSceneData);
      return;
    }
    this.mode = session ? "online" : "solo";
    const opts = urlOptions();
    // ?tune=1: the live tuning values from the panel (validated like any balance change). Online
    // always plays the bundled balance: the server checked that version at join.
    const balance: Balance = opts.tune && !session ? tunedBalance() : clientBalance();
    const stickRadiusCss = opts.tune ? getTuning().stickRadiusCssPx : STICK_RADIUS_CSS_PX;
    const soloSeed = data?.mode !== "online" && data?.seed !== undefined ? data.seed >>> 0 : undefined;
    // Story 2.7: the reversed-hit counter runs in dev builds, and in release while the overlay is on.
    const netHost = session ? new NetSimHost({ balance, session, measureHits: () => import.meta.env.DEV || perf.overlayOn }) : null;
    const localHost = netHost ? null : new LocalSimHost({ balance, seed: soloSeed ?? newRunSeed() });
    const host: SceneHost = netHost ?? (localHost as LocalSimHost);
    this.localHost = localHost;
    this.leaving = false;
    this.toasts.clear();
    perf.hits = netHost ? netHost.netStats : null;
    perf.net = netHost; // Story 2.10: the overlay's network lines
    const stress = session ? null : opts.stress;
    this.stressMode = stress !== null;
    this.pausedAtMs = 0;
    this.host = host;
    const world = host.world;
    const localId = host.localPlayerId;
    const cx = world.map.widthM / 2;
    const cy = world.map.heightM / 2;
    if (!session) addPlayer(world, localId, cx, cy); // online, players come from the server
    // Story 3.9 (temporary until 3.10): ?wavemix=walker,crawler mixes Crawlers into solo waves.
    if (!session && stress === null) world.debug.waveMix = parseWaveMix(opts.waveMix, balance);
    this.gameOver = false;
    this.kills = 0;
    this.ready.reset(); // Phaser reuses this scene object (restart): no Ready from the last run
    this.myReady = false;
    this.statusSecs = -1;
    // Phaser reuses this scene object on restart: reset what the HUD reads (no stale banner).
    Object.assign(this.hudModel, createHudModel());
    this.hudWeaponId = "";
    this.hudOtherId = "";
    if (balance.waves.lastRushCount > MAX_RUSH_MARKERS) {
      throw new Error(`waves.lastRushCount ${balance.waves.lastRushCount} exceeds MAX_RUSH_MARKERS ${MAX_RUSH_MARKERS}`);
    }
    if (session) {
      // Online game over → Back to start, or the connection dropped: leave the run (Story 2.4).
      uiStore.handle("leaveRun", (error) => this.scene.start("Boot", (error ? { error } : {}) satisfies BootSceneData));
      // Story 2.8: the room went back to the lobby; this device stays in it (the session was released).
      uiStore.handle("backToLobby", () => this.scene.start("Boot", { lobby: true } satisfies BootSceneData));
    } else {
      uiStore.handle("restart", () => this.scene.restart({} satisfies GameSceneData)); // {}: a new random seed
    }
    uiStore.handle("menu", (action) => this.onMenu(action)); // Story 2.11: the in-run menu's buttons
    // Story 2.11: teammates who leave get a toast; their ring, name and arrow go with their state entry.
    const offLeft = session?.onPlayerLeft((m) => {
      if (m.playerId !== localId) this.toasts.push(playerLeftText(m.name, m.reason));
    });
    // ?loadout=a,b (release-safe): start with those weapons; unknown ids are ignored. Solo only.
    const urlLoadout = opts.loadout && !session ? validLoadout(opts.loadout, weaponIds(balance)) : null;
    if (urlLoadout && stress === null) {
      const p = world.players.get(localId);
      if (p) setLoadout(balance, p.loadout, urlLoadout);
    }
    if (import.meta.env.DEV && !session && stress === null && !urlLoadout) {
      // Dev builds pick a loadout first (temporary until the shop, Story 3.3); release starts with the Pistol.
      this.running = false;
      uiStore.handle("startRun", (loadout) => {
        const p = world.players.get(localId);
        if (p) setLoadout(balance, p.loadout, loadout);
        this.running = true;
        uiStore.set(playingScreen(false));
      });
      uiStore.set({ kind: "loadoutPicker", weapons: weaponIds(balance) });
    } else {
      this.running = true;
      // Online, the run may already be over when this scene starts late (hidden tab): keep Results up.
      // (`!== "results"`, not `=== "wave"`: under `?lag` the throttled state still says "lobby" here; 2.11 review.)
      if (!session || session.room.state?.phase !== "results") uiStore.set(playingScreen(session !== null));
    }

    drawStreet(this, world.map);
    this.zombieView = new ZombieView(this, balance, ZOMBIE_POOL_CAPACITY, host.online);
    this.trailView = new BloodTrailView(this, ZOMBIE_POOL_CAPACITY);
    this.projectileView = new ProjectileView(this, PROJECTILE_POOL_CAPACITY);
    this.fxView = new FxView(this, this.zombieView, localId);
    this.downedView = new DownedView(this, world);
    this.playerRadiusM = balance.player.radiusM;
    this.playerViews.clear(); // Phaser reuses this scene object: the old views died at shutdown
    this.chevrons.length = 0;
    for (let i = 0; i < MAX_RUSH_MARKERS; i++) {
      const c = CHEVRON_M;
      this.chevrons.push(this.add.triangle(0, 0, -c, -c * 0.6, c, -c * 0.6, 0, c * 0.6, RUSH_COLOR).setDisplayOrigin(0, 0).setDepth(12).setVisible(false)); // Phaser 4: points are drawn from the display origin (2.9 review)
    }

    const cam = this.cameras.main;
    cam.setBackgroundColor(0x000000);
    cam.setBounds(0, 0, world.map.widthM, world.map.heightM);
    this.applyZoom();
    this.scale.on(Phaser.Scale.Events.RESIZE, this.applyZoom, this);
    if (stress !== null) {
      // Fixed ?stress scenario (release too): god mode, waves paused, Walkers inside the view, Pistol.
      const view = viewAround(world.map, cx, cy, this.scale.width / cam.zoom, this.scale.height / cam.zoom, { x: 0, y: 0, w: 0, h: 0 });
      setupStressWorld(world, stress, view, cx, cy);
      stressRun.start(performance.now(), stress);
    }

    this.sticks = new TouchSticks(stickRadiusCss * dpr(), balance.controls.moveDeadZone, balance.controls.aimDeadZone);
    const router = new InputRouter(this.sticks);
    this.router = router;
    const detachDesktop = attachDesktopInput(router, window, document, document.getElementById("game"));
    const hudData: HudSceneData = { sticks: this.sticks, model: this.hudModel, router, stickRadiusCss };
    this.scene.launch("Hud", hudData);

    this.events.once(Phaser.Scenes.Events.SHUTDOWN, () => {
      this.scale.off(Phaser.Scale.Events.RESIZE, this.applyZoom, this);
      this.scene.stop("Hud");
      detachDesktop();
      this.router = null;
      stressRun.cancel();
      netSummary.cancel();
      uiStore.handle("restart", undefined);
      uiStore.handle("startRun", undefined);
      uiStore.handle("leaveRun", undefined);
      uiStore.handle("backToLobby", undefined);
      uiStore.handle("menu", undefined);
      offLeft?.();
      this.toasts.clear();
      for (const c of this.chevrons) c.destroy();
      this.chevrons.length = 0;
      this.fxView?.destroy();
      this.downedView?.destroy();
      this.downedView = null;
      this.projectileView?.destroy();
      this.zombieView?.destroy();
      this.trailView?.destroy();
      this.trailView = null;
      for (const v of this.playerViews.values()) v.destroy();
      this.playerViews.clear();
      perf.hits = null;
      perf.net = null;
      this.host?.dispose(); // online: also leaves the room
      this.host = null;
      this.localHost = null;
    });
  }

  /** Dev tools and automated browser checks only (Story 1.11): the running World, or null. */
  get debugWorld(): World | null {
    return this.host?.world ?? null;
  }

  /** Dev tools: the camera's visible world rectangle this frame (meters). */
  debugView(out: ViewRect): ViewRect {
    const m = this.hudModel;
    out.x = m.camX;
    out.y = m.camY;
    out.w = this.scale.width / m.camZoom;
    out.h = this.scale.height / m.camZoom;
    return out;
  }

  /** Dev tools: restart the run, with a given seed or a random one. */
  restartRun(seed?: number): void {
    if (this.mode === "online") return; // the server owns the run
    this.scene.restart((seed === undefined ? {} : { seed }) satisfies GameSceneData);
  }

  /**
   * Solo pause (2.11 review): the sim already stops; this also freezes what is drawn on wall time —
   * FX tweens (blood fade, muzzle, puffs) in both scenes, the camera shake, and the wave banner's
   * clock (shifted by the paused time on resume).
   */
  private setPresentationPaused(paused: boolean): void {
    const hud = this.scene.get("Hud");
    if (paused) {
      this.pausedAtMs = this.time.now;
      this.tweens.pauseAll();
      hud?.tweens.pauseAll();
      this.cameras.main.shakeEffect.reset();
    } else {
      this.tweens.resumeAll();
      hud?.tweens.resumeAll();
      this.hudModel.bannerAtMs += this.time.now - this.pausedAtMs;
    }
  }

  /**
   * The in-run menu (Story 2.11): ☰, Esc and the menu's buttons all come here. Only while a run is
   * on screen (not in the dev loadout picker, not on Results). Opening it lets go of every held
   * key, button and stick, so nothing is still pressed when the player resumes.
   */
  private onMenu(action: MenuAction): void {
    const screen = uiStore.get();
    if (screen.kind !== "playing" || !this.running || this.gameOver || this.leaving || !this.host) return;
    const next = menuStep(screen.menu, action);
    if (next === "left") return this.leaveGame();
    if (next === screen.menu) return;
    if (screen.menu === "closed") {
      this.router?.releaseAll();
      this.host?.clearEdges(); // a Q pressed in the same step as Esc must not swap behind the menu
    }
    uiStore.set({ kind: "playing", menu: next, online: screen.online });
  }

  /**
   * Leave game (Story 2.11), once: online the host's dispose leaves the room for good
   * (`NetSession.leave` → `room.leave(true)`, consented: no reconnect window; the lobby store also
   * clears the share link), then the start screen without the title. Solo: the same without the room.
   */
  private leaveGame(): void {
    if (this.leaving) return;
    this.leaving = true;
    const online = this.mode === "online";
    this.host?.dispose();
    this.host = null;
    this.localHost = null;
    if (!online) history.replaceState(null, "", import.meta.env.BASE_URL);
    uiStore.set({ kind: "start" });
    this.scene.start("Boot", { start: true } satisfies BootSceneData); // stops Game, which stops Hud
  }

  private showBanner(text: string): void {
    this.hudModel.bannerText = text;
    this.hudModel.bannerAtMs = this.time.now;
  }

  /** Red chevrons above rushing zombies, and their positions for the HUD's edge arrows (FR30). */
  private updateRushMarkers(alpha: number, centerX: number, centerY: number): void {
    const host = this.host;
    if (!host) return;
    const z = host.world.zombies;
    const m = this.hudModel;
    let n = 0;
    for (let i = 0; i < z.aliveCount && n < MAX_RUSH_MARKERS; i++) {
      const id = z.aliveIds[i] as number;
      if (z.state[id] !== ZOMBIE_STATE.RUSH) continue;
      const x = (z.prevX[id] as number) + ((z.x[id] as number) - (z.prevX[id] as number)) * alpha;
      const y = (z.prevY[id] as number) + ((z.y[id] as number) - (z.prevY[id] as number)) * alpha;
      (this.chevrons[n] as Phaser.GameObjects.Triangle).setPosition(x, y - CHEVRON_LIFT_M).setVisible(true);
      m.rushers[n * 2] = x;
      m.rushers[n * 2 + 1] = y;
      n++;
    }
    m.rusherCount = n;
    for (let i = n; i < this.chevrons.length; i++) {
      const c = this.chevrons[i] as Phaser.GameObjects.Triangle;
      if (c.visible) c.setVisible(false);
    }
    // The camera's worldView only updates when it renders: compute this frame's view from the
    // centerOn target, clamped to the map like the camera bounds.
    const cam = this.cameras.main;
    const halfW = this.scale.width / cam.zoom / 2;
    const halfH = this.scale.height / cam.zoom / 2;
    const map = host.world.map;
    const cx = map.widthM > 2 * halfW ? Math.min(map.widthM - halfW, Math.max(halfW, centerX)) : map.widthM / 2;
    const cy = map.heightM > 2 * halfH ? Math.min(map.heightM - halfH, Math.max(halfH, centerY)) : map.heightM / 2;
    m.camX = cx - halfW;
    m.camY = cy - halfH;
    m.camZoom = cam.zoom;
    m.wave = host.world.waves.number;
    m.remaining = host.world.waves.remaining;
  }

  /**
   * Solo Results after the wipe (Story 2.8): wave reached, kills, Restart. Online, main.ts shows
   * Results from the room state when `phase` becomes "results" (every player's kills).
   */
  private showSoloResults(wave: number): void {
    this.gameOver = true;
    uiStore.set({ kind: "results", wave: Math.max(1, wave), rows: [{ slot: 0, name: SOLO_NAME, kills: this.kills }], online: false });
  }

  /**
   * Story 3.1: the build phase's countdown and Ready button. A tap toggles this device's Ready
   * (`SimHost.setBuildReady`: solo at once, online as `build.set_ready`); the button shows the asked
   * state at once. Hidden outside a build, before the loadout is picked, on Results and under the menu.
   */
  private updateReady(host: SceneHost, menuOpen: boolean): void {
    const m = this.hudModel;
    const run = host.world.run;
    const build = run.phase === "build";
    m.buildSecs = build ? Math.ceil(run.buildTicksLeft / TICK_RATE_HZ) : -1;
    m.readyButton = build && this.running && !this.gameOver && !menuOpen && !this.stressMode;
    const serverReady = host.world.players.get(host.localPlayerId)?.buildReady === true;
    const now = this.time.now;
    this.myReady = this.ready.update(run.phase, host.world.waves.number, serverReady, now);
    const pressed = m.readyPressed;
    m.readyPressed = false;
    if (pressed && m.readyButton) {
      this.myReady = this.ready.tap(serverReady, now);
      host.setBuildReady(this.myReady);
    }
    m.readyOn = this.myReady;
    this.readyCount = 0;
    if (build) host.world.players.forEach(this.countReady);
    m.readyCount = this.readyCount;
    m.readyTotal = host.world.players.size;
  }

  /** Countdowns of downed players for the HUD, and the local status line (Story 2.8). */
  private updateDownedHud(world: Readonly<World>, me: PlayerState): void {
    const m = this.hudModel;
    m.downedCount = 0;
    this.revivingSomeone = false;
    if (world.teamWiped) {
      m.statusText = ""; // Results are up: no countdowns (solo goes straight there when downed)
      return;
    }
    world.players.forEach(this.collectDowned);
    if (me.status === "downed") {
      const secs = Math.ceil(me.downedTicksLeft / TICK_RATE_HZ);
      if (secs !== this.statusSecs) {
        this.statusSecs = secs;
        m.statusText = `Downed: a teammate can revive you (${secs} s)`;
      }
      return;
    }
    this.statusSecs = -1;
    m.statusText = me.status === "out" ? STATUS_OUT : this.revivingSomeone ? STATUS_REVIVING : "";
  }

  /** Story 2.9: teammates for the HUD (none once the team is wiped: Results are up). */
  private updateTeammates(world: Readonly<World>): void {
    this.hudModel.teammateCount = 0;
    if (!world.teamWiped) world.players.forEach(this.collectTeammate);
  }

  /** Adds, updates and removes player views to match `world.players` (no allocation per frame). */
  private syncPlayerViews(world: Readonly<World>): void {
    this.playerViews.forEach(this.dropPlayerView); // deleting inside forEach is safe for a Map
    world.players.forEach(this.syncPlayerView);
  }

  private applyZoom(): void {
    this.cameras.main.setZoom(pixelsPerMeter(this.scale.width, this.scale.height));
  }

  override update(_time: number, deltaMs: number): void {
    const host = this.host;
    const router = this.router;
    if (!host || !router) return;

    // Mouse aim: survivor (last drawn position) → cursor, through the camera that drew that frame.
    const localId = host.localPlayerId;
    const pv = this.playerViews.get(localId);
    const cw = this.cursorWorld.set(Number.NaN, Number.NaN);
    if (router.isMouse && pv && !Number.isNaN(router.cursorX)) this.cameras.main.getWorldPoint(router.cursorX, router.cursorY, cw);
    router.build(this.input_, this.hudModel.swapPressed, pv?.x ?? 0, pv?.y ?? 0, cw.x, cw.y);
    this.hudModel.swapPressed = false;
    if (!this.running) this.input_.swap = false; // a Q / swap tap in the picker must not swap at run start

    // Story 2.11: ☰ and Esc toggle the in-run menu (Esc is never game input).
    const menuKey = router.kbm.takeMenu();
    const menuTap = this.hudModel.menuPressed;
    this.hudModel.menuPressed = false;
    if (menuKey || menuTap) {
      this.onMenu("toggle");
      if (!this.host) return; // left
    }
    const screen = uiStore.get();
    const menuOpen = screen.kind === "playing" && screen.menu !== "closed";
    this.hudModel.menuOpen = menuOpen;
    // Not under ?stress: pausing would skew the benchmark's wall-clock duration (2.11 review).
    this.hudModel.menuButton = screen.kind === "playing" && this.running && !this.gameOver && !this.stressMode;
    // Menu open: online the run goes on and my survivor stands still (a fresh seq every step);
    // solo practice pauses (designer decision 2026-11-21), with the accumulator frozen.
    if (menuOpen) neutralizeInput(this.input_);
    this.updateReady(host, menuOpen);
    if (this.localHost) {
      if (menuOpen !== this.localHost.paused) this.setPresentationPaused(menuOpen);
      this.localHost.paused = menuOpen;
    }
    host.setLocalInput(this.input_);
    this.hudModel.toastText = this.toasts.current(this.time.now);

    if (this.running) host.update(deltaMs / 1000); // LocalSimHost caps catch-up after long frames
    if (perf.net) netSummary.frame(performance.now(), perf.net); // Story 2.10: ping samples for the wave summary
    const events = host.drainEvents();
    for (let i = 0; i < events.length; i++) {
      const e = events[i];
      if (!e) continue;
      this.fxView?.handle(e);
      if (e.type === "team.wiped" && !host.online && !this.gameOver) {
        this.showSoloResults(e.wave);
      } else if (e.type === "zombie.killed" && e.killerId === localId) {
        this.kills++;
      } else if (e.type === "money.earned" && e.playerId === localId) {
        this.hudModel.moneyGain += e.amount; // Story 3.2: one "+N" per frame
      } else if (e.type === "weapon.fired" && e.playerId === localId) {
        const stats = host.world.balance.weapons[e.weapon];
        if (stats?.screenShake && getSettings().screenShake) this.cameras.main.shake(SHAKE_MS, SHAKE_INTENSITY);
      } else if (e.type === "build.started") {
        if (e.wave === 1) this.showBanner(BUILD_BANNER); // later builds keep "Wave N cleared"
      } else if (e.type === "wave.started") {
        this.showBanner(`Wave ${e.number}`);
        // Story 2.10: measured only with the overlay on (the 1.11 rule: no measuring cost otherwise).
        if (perf.net && perf.overlayOn) netSummary.start(performance.now(), e.number, perf.net, netMeter);
      } else if (e.type === "wave.ended") {
        this.showBanner(`Wave ${e.number} cleared`);
        if (perf.net) netSummary.end(performance.now(), e.number, perf.net, netMeter, perf.overlayOn);
      }
    }

    this.zombieView?.update(host.world, host.alpha);
    this.trailView?.update(host.world, host.alpha, deltaMs, this.localHost?.paused === true);
    this.projectileView?.update(host.world.projectiles, host.alpha);
    this.syncPlayerViews(host.world);
    this.downedView?.update(host.world);
    const player = host.world.players.get(localId);
    const playerView = this.playerViews.get(localId);
    this.hudModel.teammateCount = 0; // never stale while my player is missing (2.9 review)
    if (player && playerView) {
      // Out (Story 2.8): the camera spectates the lowest-slot standing teammate (the server streams that view).
      const target = player.status === "out" ? spectateTarget(host.world, localId) : null;
      const viewOf = (target && this.playerViews.get(target.id)) ?? playerView;
      this.cameras.main.centerOn(viewOf.x, viewOf.y);
      this.updateRushMarkers(host.alpha, viewOf.x, viewOf.y);
      this.updateDownedHud(host.world, player);
      this.updateTeammates(host.world);
      const m = this.hudModel;
      recordSimFrame(host.stats, host.world.zombies, m.camX, m.camY, this.scale.width / m.camZoom, this.scale.height / m.camZoom);
      this.hudModel.hp = player.hp;
      this.hudModel.maxHp = player.maxHp;
      this.hudModel.money = player.wallet;
      this.hudModel.localX = viewOf.x;
      this.hudModel.localY = viewOf.y;
      const slot = activeSlot(player.loadout);
      const stats = weaponStats(host.world.balance, slot.weapon);
      if (slot.weapon !== this.hudWeaponId) {
        this.hudWeaponId = slot.weapon; // rebuild the label only when the weapon changes
        this.hudModel.weaponName = slot.weapon.replace(/_/g, " ").toUpperCase();
      }
      if (isGun(stats)) {
        this.hudModel.ammo = slot.ammo;
        this.hudModel.magazine = stats.magazine;
        const totalTicks = ticksFor(stats.reloadS);
        this.hudModel.reloadFrac = slot.reloadTicks > 0 ? 1 - slot.reloadTicks / totalTicks : -1;
      } else {
        this.hudModel.ammo = -1;
        this.hudModel.magazine = 0;
        this.hudModel.reloadFrac = -1;
      }
      const other = player.loadout.slots[player.loadout.active === 0 ? 1 : 0];
      if (other) {
        if (other.weapon !== this.hudOtherId) {
          this.hudOtherId = other.weapon;
          this.hudModel.otherWeaponName = other.weapon.replace(/_/g, " ").toUpperCase();
        }
        const otherStats = weaponStats(host.world.balance, other.weapon);
        this.hudModel.otherAmmo = isGun(otherStats) ? other.ammo : -1;
        this.hudModel.otherMag = isGun(otherStats) ? otherStats.magazine : 0;
      } else {
        this.hudOtherId = "";
        this.hudModel.otherWeaponName = "";
      }
      const swapTicks = ticksFor(host.world.balance.player.swapS);
      this.hudModel.swapFrac = player.loadout.swapTicks > 0 ? (swapTicks - player.loadout.swapTicks + 1) / swapTicks : -1;
    }
  }
}
