import * as Phaser from "phaser";
import {
  NEUTRAL_INPUT,
  PROJECTILE_POOL_CAPACITY,
  ZOMBIE_POOL_CAPACITY,
  activeSlot,
  addPlayer,
  isGun,
  setLoadout,
  ticksFor,
  weaponIds,
  weaponStats,
  loadBalance,
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
import { FxView } from "../render/FxView";
import { ProjectileView } from "../render/ProjectileView";
import { uiStore } from "../ui/uiState";
import { getSettings } from "../settings/settings";
import { MAX_RUSH_MARKERS, createHudModel } from "./hudModel";
import { LocalSimHost, type SimStepStats } from "../sim/LocalSimHost";
import { NetSimHost } from "../sim/NetSimHost";
import type { SimHost } from "../sim/SimHost";
import type { NetSession } from "../net/session";
import type { HudSceneData } from "./HudScene";
import { urlOptions } from "../debug/urlOptions";
import { getTuning, tunedBalance } from "../debug/tuning";
import { validLoadout } from "./validLoadout";
import { recordSimFrame } from "../debug/perfProbe";
import { perf } from "../debug/perfStats";
import { setupStressWorld, stressRun, viewAround, type ViewRect } from "../debug/stressScenario";

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

export class GameScene extends Phaser.Scene {
  private host: SceneHost | null = null;
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
      view = new PlayerView(this, this.playerRadiusM); // Story 2.9 adds rings, colours and names
      this.playerViews.set(id, view);
    }
    view.update(p, this.host?.alpha ?? 0);
  };
  private readonly dropPlayerView = (view: PlayerView, id: string): void => {
    if (this.host?.world.players.has(id)) return;
    view.destroy();
    this.playerViews.delete(id);
  };
  private zombieView: ZombieView | null = null;
  private projectileView: ProjectileView | null = null;
  private fxView: FxView | null = null;
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
    this.mode = session ? "online" : "solo";
    const opts = urlOptions();
    // ?tune=1: the live tuning values from the panel (validated like any balance change). Online
    // always plays the bundled balance: the server checked that version at join.
    const balance: Balance = opts.tune && !session ? tunedBalance() : loadBalance();
    const stickRadiusCss = opts.tune ? getTuning().stickRadiusCssPx : STICK_RADIUS_CSS_PX;
    const soloSeed = data?.mode !== "online" && data?.seed !== undefined ? data.seed >>> 0 : undefined;
    // Story 2.7: the reversed-hit counter runs in dev builds, and in release while the overlay is on.
    const netHost = session ? new NetSimHost({ balance, session, measureHits: () => import.meta.env.DEV || perf.overlayOn }) : null;
    const host: SceneHost = netHost ?? new LocalSimHost({ balance, seed: soloSeed ?? newRunSeed() });
    perf.hits = netHost ? netHost.netStats : null;
    const stress = session ? null : opts.stress;
    this.host = host;
    const world = host.world;
    const localId = host.localPlayerId;
    const cx = world.map.widthM / 2;
    const cy = world.map.heightM / 2;
    if (!session) addPlayer(world, localId, cx, cy); // online, players come from the server
    this.gameOver = false;
    // Phaser reuses this scene object on restart: reset what the HUD reads (no stale banner).
    Object.assign(this.hudModel, createHudModel());
    this.hudWeaponId = "";
    this.hudOtherId = "";
    if (balance.waves.lastRushCount > MAX_RUSH_MARKERS) {
      throw new Error(`waves.lastRushCount ${balance.waves.lastRushCount} exceeds MAX_RUSH_MARKERS ${MAX_RUSH_MARKERS}`);
    }
    if (session) {
      // Online game over → Back to start, or the connection dropped: leave the run (Story 2.4).
      uiStore.handle("leaveRun", (error) => this.scene.start("Boot", error ? { error } : {}));
    } else {
      uiStore.handle("restart", () => this.scene.restart({} satisfies GameSceneData)); // {}: a new random seed
    }
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
        uiStore.set({ kind: "playing" });
      });
      uiStore.set({ kind: "loadoutPicker", weapons: weaponIds(balance) });
    } else {
      this.running = true;
      uiStore.set({ kind: "playing" });
    }

    drawStreet(this, world.map);
    this.zombieView = new ZombieView(this, balance, ZOMBIE_POOL_CAPACITY, host.online);
    this.projectileView = new ProjectileView(this, PROJECTILE_POOL_CAPACITY);
    this.fxView = new FxView(this, this.zombieView, localId);
    this.playerRadiusM = balance.player.radiusM;
    this.playerViews.clear(); // Phaser reuses this scene object: the old views died at shutdown
    this.chevrons.length = 0;
    for (let i = 0; i < MAX_RUSH_MARKERS; i++) {
      const c = CHEVRON_M;
      this.chevrons.push(this.add.triangle(0, 0, -c, -c * 0.6, c, -c * 0.6, 0, c * 0.6, RUSH_COLOR).setDepth(12).setVisible(false));
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
      uiStore.handle("restart", undefined);
      uiStore.handle("startRun", undefined);
      uiStore.handle("leaveRun", undefined);
      for (const c of this.chevrons) c.destroy();
      this.chevrons.length = 0;
      this.fxView?.destroy();
      this.projectileView?.destroy();
      this.zombieView?.destroy();
      for (const v of this.playerViews.values()) v.destroy();
      this.playerViews.clear();
      perf.hits = null;
      this.host?.dispose(); // online: also leaves the room
      this.host = null;
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

  /** Game over with the wave reached; online it offers Back to start (Story 2.8 brings downed/revive). */
  private showGameOver(host: SimHost): void {
    this.gameOver = true;
    uiStore.set({ kind: "gameOver", waveReached: Math.max(1, host.world.waves.number), online: host.online });
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
    host.setLocalInput(this.input_);

    if (this.running) host.update(deltaMs / 1000); // LocalSimHost caps catch-up after long frames
    const events = host.drainEvents();
    for (let i = 0; i < events.length; i++) {
      const e = events[i];
      if (!e) continue;
      this.fxView?.handle(e);
      if (e.type === "player.died" && e.playerId === localId && !this.gameOver) {
        this.showGameOver(host);
      } else if (e.type === "weapon.fired" && e.playerId === localId) {
        const stats = host.world.balance.weapons[e.weapon];
        if (stats?.screenShake && getSettings().screenShake) this.cameras.main.shake(SHAKE_MS, SHAKE_INTENSITY);
      } else if (e.type === "wave.started") {
        this.showBanner(`Wave ${e.number}`);
      } else if (e.type === "wave.ended") {
        this.showBanner(`Wave ${e.number} cleared`);
      }
    }

    this.zombieView?.update(host.world, host.alpha);
    this.projectileView?.update(host.world.projectiles, host.alpha);
    this.syncPlayerViews(host.world);
    const player = host.world.players.get(localId);
    // Online, the death event may have played before this scene listened: the state decides too.
    if (player && host.online && player.status === "dead" && !this.gameOver) this.showGameOver(host);
    const playerView = this.playerViews.get(localId);
    if (player && playerView) {
      this.cameras.main.centerOn(playerView.x, playerView.y);
      this.updateRushMarkers(host.alpha, playerView.x, playerView.y);
      const m = this.hudModel;
      recordSimFrame(host.stats, host.world.zombies, m.camX, m.camY, this.scale.width / m.camZoom, this.scale.height / m.camZoom);
      this.hudModel.hp = player.hp;
      this.hudModel.maxHp = player.maxHp;
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
