import * as Phaser from "phaser";
import {
  NEUTRAL_INPUT,
  PROJECTILE_POOL_CAPACITY,
  TICK_RATE_HZ,
  ZOMBIE_POOL_CAPACITY,
  activeSlot,
  addPlayer,
  buildingStats,
  isGun,
  setLoadout,
  shopBuildings,
  shopWeapons,
  spectateTarget,
  weaponName,
  ticksFor,
  weaponIds,
  weaponStats,
  parseWaveMix,
  ZOMBIE_STATE,
  type Balance,
  type PlaceError,
  type RepairError,
  type PlayerInput,
  type PlayerState,
  type World,
  buildingById,
} from "@topdown/shared";
import { dpr } from "../display";
import { STICK_RADIUS_CSS_PX, TouchSticks } from "../input/TouchSticks";
import { InputRouter } from "../input/InputRouter";
import { attachDesktopInput } from "../input/desktopInput";
import { pixelsPerMeter } from "../render/camera";
import { PlayerView } from "../render/PlayerView";
import { ZombieView } from "../render/ZombieView";
import { BloodTrailView } from "../render/BloodTrailView";
import { FxView } from "../render/FxView";
import { ProjectileView } from "../render/ProjectileView";
import { DownedView } from "../render/DownedView";
import { BuildingView } from "../render/BuildingView";
import { CityView } from "../render/city/CityView";
import { TurretView } from "../render/TurretView";
import { Placement, placeRefusalText } from "./placement";
import { RepairPanel, repairRefusalText } from "./repairPanel";
import { BuildingSelectView } from "../render/BuildingSelectView";
import { menuStep, playingScreen, uiStore, type MenuAction } from "../ui/uiState";
import { CLOSED_SHOP, shopAllowed, shopStep, shopStore, type ShopInput } from "../ui/shopStore";
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
/** Story 3.3: shop inputs the scene sends often, allocated once. */
const SHOP_CLOSE: ShopInput = Object.freeze({ type: "close" });
const shopTime: { type: "time"; nowMs: number } = { type: "time", nowMs: 0 };

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
  /** Story 3.4: placed buildings and the placement preview. */
  private buildingView: BuildingView | null = null;
  /**
   * Story 4.9: the Dead City look (static city baked per stage, light, rain, vignette). Its stage
   * entry point is `showStage`; it also redraws by itself when the obstacles change stage/version.
   */
  private cityView: CityView | null = null;
  /** Story 3.6: turret plates and heads (aim from the World / `turret.fired`). */
  private turretView: TurretView | null = null;
  /** Story 3.4: placement mode on this device (sticks off while active). */
  private readonly placement = new Placement();
  /** "Wood barricade · $40" for the type being placed, and the refusal texts (built once each). */
  private placingLabel = "";
  private readonly refusalTexts = new Map<PlaceError, string>();
  /** Story 3.7: the repair panel on this device, the selected building's outline. */
  private readonly repairPanel = new RepairPanel();
  private selectView: BuildingSelectView | null = null;
  /** A teammate's display name for the panel (called only when its texts change). */
  private readonly ownerName = (ownerId: string): string => this.host?.playerInfo(ownerId).name ?? ownerId;
  /** Solo Results (Story 2.8): zombies the local player killed this run (online: from room state). */
  private kills = 0;
  /**
   * Story 3.1: the Ready this device asked for in the current build phase (shown at once, while the
   * server's copy is a round trip away online), and the phase it belongs to: cleared when it changes.
   */
  /** Reused input of `shopAllowed` (no object per frame). */
  private readonly shopCheck = { phase: "", running: false, gameOver: false, menuOpen: false, stressMode: false, leaving: false };
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
  /** False until the run is on screen (and on a dead scene): the world doesn't step. */
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
    perf.soloSeed = localHost ? localHost.world.seed : null; // Story 4.4: online the overlay reads the server's
    const stress = session ? null : opts.stress;
    this.stressMode = stress !== null;
    this.pausedAtMs = 0;
    this.host = host;
    const world = host.world;
    const localId = host.localPlayerId;
    const cx = world.map.widthM / 2;
    const cy = world.map.heightM / 2;
    if (!session) addPlayer(world, localId, cx, cy); // online, players come from the server
    // Story 3.9 dev hook, kept by 3.10 as an override: ?wavemix=walker,crawler replaces the waves.json mix (solo).
    if (!session && stress === null) world.debug.waveMix = parseWaveMix(opts.waveMix, balance);
    this.gameOver = false;
    this.kills = 0;
    this.placement.cancel(); // Phaser reuses this scene object: no placement from the last run
    this.refusalTexts.clear();
    this.repairPanel.close(); // Story 3.7: no selection from the last run
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
    uiStore.handle("startPlacement", (type) => this.startPlacement(type)); // Story 3.4 (Story 3.3's shop calls it)
    // Story 2.11: teammates who leave get a toast; their ring, name and arrow go with their state entry.
    const offLeft = session?.onPlayerLeft((m) => {
      if (m.playerId !== localId) this.toasts.push(playerLeftText(m.name, m.reason));
    });
    // ?loadout=a,b (release-safe): start with those weapons; unknown ids are ignored. Solo only.
    // Story 3.3: every other run starts with the Pistol (the dev loadout is a dev cheat now).
    const urlLoadout = opts.loadout && !session ? validLoadout(opts.loadout, weaponIds(balance)) : null;
    if (urlLoadout && stress === null) {
      const p = world.players.get(localId);
      if (p) setLoadout(balance, p.loadout, urlLoadout);
    }
    this.running = true;
    // Online, the run may already be over when this scene starts late (hidden tab): keep Results up.
    // (`!== "results"`, not `=== "wave"`: under `?lag` the throttled state still says "lobby" here; 2.11 review.)
    if (!session || session.room.state?.phase !== "results") uiStore.set(playingScreen(session !== null));
    // Story 3.3: Phaser reuses this scene object (restart, late start): never a shop from the last run.
    shopStore.set(CLOSED_SHOP);
    uiStore.handle("shop", (action) => this.shopInput(action));

    this.zombieView = new ZombieView(this, balance, ZOMBIE_POOL_CAPACITY, host.online);
    this.trailView = new BloodTrailView(this, ZOMBIE_POOL_CAPACITY);
    this.projectileView = new ProjectileView(this, PROJECTILE_POOL_CAPACITY);
    this.fxView = new FxView(this, this.zombieView, localId, (id) => buildingById(host.world, id)?.ownerId);
    this.fxView.balance = balance; // Story 3.5: building footprints for the debris
    this.downedView = new DownedView(this, world);
    this.buildingView = new BuildingView(this);
    this.turretView = new TurretView(this);
    this.selectView = new BuildingSelectView(this);
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
    this.cityView = new CityView(this, world.map, cam.zoom);
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
      uiStore.handle("shop", undefined);
      shopStore.set(CLOSED_SHOP);
      uiStore.handle("leaveRun", undefined);
      uiStore.handle("backToLobby", undefined);
      uiStore.handle("menu", undefined);
      uiStore.handle("startPlacement", undefined);
      this.placement.cancel();
      this.buildingView?.destroy();
      this.buildingView = null;
      this.cityView?.destroy();
      this.cityView = null;
      this.turretView?.destroy();
      this.turretView = null;
      this.repairPanel.close();
      this.selectView?.destroy();
      this.selectView = null;
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
      perf.soloSeed = null;
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

  /** Story 4.4: the dev cheats' "Restart with seed" is solo only. */
  get isOnline(): boolean {
    return this.mode === "online";
  }

  /** Story 4.4: this run's seed (online the server's, from the room state). */
  get runSeed(): number {
    return this.host instanceof NetSimHost ? this.host.runSeed : (this.host?.world.seed ?? 0);
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
   * Solo Results after the wipe (Story 2.8) or, Story 3.10, after the last wave ("You held out!"):
   * wave reached, kills, money earned, Restart. Online, main.ts shows Results from the room state
   * when `phase` becomes "results" (every player's kills and earnings). `earned` is read from the
   * World after the step, so it includes the last wave's bonus (paid later in the same tick).
   */
  private showSoloResults(host: SceneHost, wave: number, heldOut: boolean): void {
    this.gameOver = true;
    const earned = host.world.players.get(host.localPlayerId)?.earned ?? 0;
    uiStore.set({ kind: "results", wave: Math.max(1, wave), heldOut, rows: [{ slot: 0, name: SOLO_NAME, kills: this.kills, earned }], online: false, seed: host.world.seed });
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
    m.readyButton = build && this.running && !this.gameOver && !menuOpen && !this.stressMode && !this.placement.active;
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

  /** Story 3.4: placement is possible now (a build phase, a run on screen, menu closed, my survivor standing). */
  private canPlace(host: SceneHost, menuOpen: boolean): boolean {
    const me = host.world.players.get(host.localPlayerId);
    return (
      host.world.run.phase === "build" &&
      this.running &&
      !this.gameOver &&
      !this.leaving &&
      !menuOpen &&
      !this.stressMode &&
      me !== undefined &&
      me.status === "alive"
    );
  }

  private refusalText(e: PlaceError): string {
    let t = this.refusalTexts.get(e);
    if (t === undefined) {
      t = placeRefusalText(e, this.host?.world.balance ?? clientBalance());
      this.refusalTexts.set(e, t);
    }
    return t;
  }

  /**
   * Story 3.4: `startPlacement` (Story 3.3's shop calls it when a building is tapped). Ignored
   * outside a build phase, under the menu, on Results or for an unknown type. Every held stick, key
   * and button lets go (the sticks are off while placing).
   */
  private startPlacement(type: string): void {
    const host = this.host;
    const screen = uiStore.get();
    const menuOpen = screen.kind === "playing" && screen.menu !== "closed";
    if (!host || !this.canPlace(host, menuOpen)) return;
    const me = host.world.players.get(host.localPlayerId);
    const stats = buildingStats(host.world.balance, type);
    if (!me || !stats) return;
    if (!this.placement.start(host.world.balance, type, me.x, me.y, me.facingX, me.facingY, host.world.waves.number)) return;
    this.placingLabel = `${stats.name} · $${stats.price}`;
    this.router?.releaseAll();
    host.clearEdges();
  }

  /**
   * Story 3.4: placement mode, once per frame before the input goes to the host. Taps (canvas px)
   * move the preview (through the camera that drew the frame), ⟳ rotates, ✕ cancels, ✓ sends the
   * request (solo: applied at once) and ends placement mode; the phase leaving the build, the menu or
   * game over cancel it. While active the input is neutral: the survivor stands still and holds fire.
   */
  private updatePlacement(host: SceneHost, menuOpen: boolean): void {
    const m = this.hudModel;
    const p = this.placement;
    const can = this.canPlace(host, menuOpen);
    if (p.active && (!can || host.world.waves.number !== p.wave)) p.cancel(); // review L3: a new wave/build ends it
    const tap = m.placeTap;
    const rotate = m.rotatePressed;
    const confirm = m.confirmPressed;
    const cancel = m.cancelPressed;
    m.placeTap = m.rotatePressed = m.confirmPressed = m.cancelPressed = false;
    if (!p.active) {
      m.placementActive = false;
      return;
    }
    if (tap) {
      const w = this.cameras.main.getWorldPoint(m.placeTapX, m.placeTapY, this.cursorWorld);
      p.moveTo(w.x, w.y);
    }
    if (rotate) p.rotate();
    if (cancel) {
      p.cancel();
      m.placementActive = false;
      return;
    }
    p.check(host.world, host.localPlayerId);
    if (confirm) {
      const req = p.confirm();
      if (req) host.placeBuilding(req);
      m.placementActive = false;
      return;
    }
    m.placementActive = true;
    m.placementValid = p.error === null;
    m.placementHint = p.error === null ? this.placingLabel : this.refusalText(p.error);
    neutralizeInput(this.input_);
  }

  /**
   * Story 3.7: the repair panel, once per frame after placement. Taps select a building only when
   * placement is possible (a build phase, a run on screen, my survivor standing) and no placement,
   * shop or menu is open; the panel closes as soon as that no longer holds or the building is gone.
   * Repair sends the request (solo: applied at once) and closes the panel; the server judges it.
   */
  private updateRepair(host: SceneHost, menuOpen: boolean, shopOpen: boolean): void {
    const m = this.hudModel;
    const p = this.repairPanel;
    const allowed = this.canPlace(host, menuOpen || shopOpen) && !this.placement.active;
    m.tapsEnabled = allowed;
    const tap = m.worldTap;
    const press = m.repairPressed;
    const close = m.repairClosePressed;
    m.worldTap = m.repairPressed = m.repairClosePressed = false;
    if (allowed && tap) {
      const w = this.cameras.main.getWorldPoint(m.worldTapX, m.worldTapY, this.cursorWorld);
      p.tap(host.world, w.x, w.y);
    }
    if (close) p.close();
    if (press && allowed && p.open) host.repairBuilding(p.press());
    m.repairOpen = p.update(host.world, host.localPlayerId, allowed, this.ownerName);
    if (m.repairOpen) {
      m.repairInfo = p.info;
      m.repairReason = p.reason;
      m.repairLabel = p.label;
    }
  }

  private readonly repairTexts = new Map<RepairError, string>();
  private repairText(e: RepairError): string {
    let t = this.repairTexts.get(e);
    if (t === undefined) {
      t = repairRefusalText(e);
      this.repairTexts.set(e, t);
    }
    return t;
  }

  /**
   * Story 3.3: the shop. The Shop button shows when Ready does (a build phase, a run on screen, menu
   * closed); the shop closes by itself as soon as that no longer holds (the wave started, Results,
   * the menu opened, leaving). While open it gets my wallet and weapons when they change, the
   * purchase answers, and the clock for the pending timeout. Returns whether it is open.
   */
  private updateShop(host: SceneHost, menuOpen: boolean): boolean {
    const m = this.hudModel;
    const sc = this.shopCheck;
    sc.phase = host.world.run.phase;
    sc.running = this.running;
    sc.gameOver = this.gameOver;
    sc.menuOpen = menuOpen;
    sc.stressMode = this.stressMode;
    sc.leaving = this.leaving;
    const can = shopAllowed(sc);
    if (shopStore.get().open && !can) this.shopInput(SHOP_CLOSE);
    const pressed = m.shopPressed;
    m.shopPressed = false;
    if (pressed && can && !shopStore.get().open) {
      const balance = host.world.balance;
      this.router?.releaseAll(); // nothing stays held under the shop (as for the menu)
      host.clearEdges();
      this.shopInput({ type: "open", weapons: shopWeapons(balance), buildings: shopBuildings(balance) });
    }
    // Answers: shown while open, dropped while closed (the World already has the result).
    for (let a = host.takeShopAnswer(); a !== null; a = host.takeShopAnswer()) this.shopInput({ type: "answer", answer: a });
    const s = shopStore.get();
    if (s.open) {
      const me = host.world.players.get(host.localPlayerId);
      if (me) {
        const w0 = me.loadout.slots[0].weapon;
        const w1 = me.loadout.slots[1]?.weapon ?? null;
        if (me.wallet !== s.wallet || w0 !== s.slots[0] || w1 !== s.slots[1]) this.shopInput({ type: "sync", wallet: me.wallet, slots: [w0, w1] });
      }
      if (s.pending !== null) {
        shopTime.nowMs = this.time.now;
        this.shopInput(shopTime);
      }
    }
    m.shopButton = can && !shopStore.get().open && !this.placement.active; // Story 3.4: hidden while placing
    return shopStore.get().open;
  }

  /** Story 3.3: a weapon's display name for the shop's "Bought …" text (module-level style: no closure per call). */
  private readonly shopName = (id: string): string => (this.host ? weaponName(this.host.world.balance, id) : id);

  /** Story 3.3: one step of the shop's state machine, and its effect (a purchase, or 3.4's placement). */
  private shopInput(input: ShopInput): void {
    const r = shopStep(shopStore.get(), input, this.shopName);
    shopStore.set(r.state);
    const e = r.effect;
    if (e === null) return;
    if (e.type === "buy") this.host?.buyWeapon(e.weapon, e.slot);
    else uiStore.request("startPlacement", e.id); // Story 3.4: placement mode
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
    if (!this.running) this.input_.swap = false; // nothing swaps before the run is on screen

    // Story 2.11: ☰ and Esc toggle the in-run menu (Esc is never game input).
    const menuKey = router.kbm.takeMenu();
    const menuTap = this.hudModel.menuPressed;
    this.hudModel.menuPressed = false;
    if (menuKey || menuTap) {
      // Story 3.3: Esc / ☰ close the shop first.
      if (shopStore.get().open) this.shopInput(SHOP_CLOSE);
      else this.onMenu("toggle");
      if (!this.host) return; // left
    }
    const screen = uiStore.get();
    const menuOpen = screen.kind === "playing" && screen.menu !== "closed";
    this.hudModel.menuOpen = menuOpen;
    // Not under ?stress: pausing would skew the benchmark's wall-clock duration (2.11 review).
    this.hudModel.menuButton = screen.kind === "playing" && this.running && !this.gameOver && !this.stressMode;
    // Menu open: online the run goes on and my survivor stands still (a fresh seq every step);
    // solo practice pauses (designer decision 2026-11-21), with the accumulator frozen.
    const shopOpen = this.updateShop(host, menuOpen);
    if (menuOpen || shopOpen) neutralizeInput(this.input_); // Story 3.3: I stand still while shopping
    this.updatePlacement(host, menuOpen || shopOpen); // Story 3.4: placement mode turns the sticks off (neutral input)
    this.updateRepair(host, menuOpen, shopOpen); // Story 3.7: tap a building → Repair
    this.updateReady(host, menuOpen || shopOpen);
    if (this.localHost) {
      if (menuOpen !== this.localHost.paused) this.setPresentationPaused(menuOpen);
      this.localHost.paused = menuOpen;
    }
    host.setLocalInput(this.input_);
    this.hudModel.toastText = this.toasts.current(this.time.now);

    if (this.running) host.update(deltaMs / 1000); // LocalSimHost caps catch-up after long frames
    if (perf.net) netSummary.frame(performance.now(), perf.net); // Story 2.10: ping samples for the wave summary
    const refused = host.takePlaceRefusal(); // Story 3.4: the server (or solo) said no
    if (refused) this.toasts.push(this.refusalText(refused));
    const repairRefused = host.takeRepairRefusal(); // Story 3.7
    if (repairRefused) this.toasts.push(this.repairText(repairRefused));
    const events = host.drainEvents();
    for (let i = 0; i < events.length; i++) {
      const e = events[i];
      if (!e) continue;
      this.fxView?.handle(e);
      if ((e.type === "team.wiped" || e.type === "run.held_out") && !host.online && !this.gameOver) {
        this.showSoloResults(host, e.wave, e.type === "run.held_out");
      } else if (e.type === "zombie.killed" && e.killerId === localId && e.buildingId === undefined) {
        // Story 3.6: my turret's kills pay me (money.earned) but are not my kills.
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
    this.downedView?.update(host.world, this.time.now);
    this.buildingView?.update(host.world, this.placement);
    this.turretView?.update(host.world, this.localHost?.paused === true ? 0 : deltaMs / 1000);
    this.selectView?.update(host.world, this.repairPanel.id);
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
    // Story 4.9: after the camera target is known (hudModel.camX/camY are this frame's view).
    const zoom = this.cameras.main.zoom;
    // Online: the first bake waits for the server's first state (runSeed arrives with it; review L).
    const synced = !(host instanceof NetSimHost) || host.runSeed !== 0;
    this.cityView?.update(host.world, this.hudModel.camX, this.hudModel.camY, this.scale.width / zoom, this.scale.height / zoom, this.localHost?.paused === true ? 0 : deltaMs / 1000, synced);
  }
}
