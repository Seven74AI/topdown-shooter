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
  type World,
} from "@topdown/shared";
import { dpr } from "../display";
import { STICK_RADIUS_CSS_PX, TouchSticks } from "../input/TouchSticks";
import { pixelsPerMeter } from "../render/camera";
import { PlayerView } from "../render/PlayerView";
import { drawStreet } from "../render/StreetView";
import { ZombieView } from "../render/ZombieView";
import { FxView } from "../render/FxView";
import { ProjectileView } from "../render/ProjectileView";
import { uiStore } from "../ui/uiState";
import { getSettings } from "../settings/settings";
import { MAX_RUSH_MARKERS, createHudModel } from "./hudModel";
import { LOCAL_PLAYER_ID, LocalSimHost } from "../sim/LocalSimHost";
import type { HudSceneData } from "./HudScene";
import { urlOptions } from "../debug/urlOptions";
import { recordSimFrame } from "../debug/perfProbe";
import { setupStressWorld, stressRun, viewAround, type ViewRect } from "../debug/stressScenario";

/** `scene.restart(data)` / `scene.start(data)` options. Phaser keeps the last data when given none: always pass an object. */
export interface GameSceneData {
  /** Run seed (uint32); a random one when absent (dev cheat "set run seed", Story 1.11). */
  seed?: number;
}

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
  private host: LocalSimHost | null = null;
  private sticks: TouchSticks | null = null;
  private playerView: PlayerView | null = null;
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
    const balance: Balance = loadBalance();
    const seed = data?.seed !== undefined ? data.seed >>> 0 : newRunSeed();
    const host = new LocalSimHost({ balance, seed });
    const stress = urlOptions().stress;
    this.host = host;
    const world = host.world;
    const cx = world.map.widthM / 2;
    const cy = world.map.heightM / 2;
    addPlayer(world, LOCAL_PLAYER_ID, cx, cy);
    this.gameOver = false;
    // Phaser reuses this scene object on restart: reset what the HUD reads (no stale banner).
    Object.assign(this.hudModel, createHudModel());
    this.hudWeaponId = "";
    this.hudOtherId = "";
    if (balance.waves.lastRushCount > MAX_RUSH_MARKERS) {
      throw new Error(`waves.lastRushCount ${balance.waves.lastRushCount} exceeds MAX_RUSH_MARKERS ${MAX_RUSH_MARKERS}`);
    }
    uiStore.handle("restart", () => this.scene.restart({} satisfies GameSceneData)); // {}: a new random seed
    if (import.meta.env.DEV && stress === null) {
      // Dev builds pick a loadout first (temporary until the shop, Story 3.3); release starts with the Pistol.
      this.running = false;
      uiStore.handle("startRun", (loadout) => {
        const p = world.players.get(LOCAL_PLAYER_ID);
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
    this.zombieView = new ZombieView(this, balance, ZOMBIE_POOL_CAPACITY);
    this.projectileView = new ProjectileView(this, PROJECTILE_POOL_CAPACITY);
    this.fxView = new FxView(this, this.zombieView, LOCAL_PLAYER_ID);
    this.playerView = new PlayerView(this, balance.player.radiusM);
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

    this.sticks = new TouchSticks(STICK_RADIUS_CSS_PX * dpr(), balance.controls.moveDeadZone, balance.controls.aimDeadZone);
    const hudData: HudSceneData = { sticks: this.sticks, model: this.hudModel };
    this.scene.launch("Hud", hudData);

    this.events.once(Phaser.Scenes.Events.SHUTDOWN, () => {
      this.scale.off(Phaser.Scale.Events.RESIZE, this.applyZoom, this);
      this.scene.stop("Hud");
      stressRun.cancel();
      uiStore.handle("restart", undefined);
      uiStore.handle("startRun", undefined);
      for (const c of this.chevrons) c.destroy();
      this.chevrons.length = 0;
      this.fxView?.destroy();
      this.projectileView?.destroy();
      this.zombieView?.destroy();
      this.playerView?.destroy();
      this.host?.dispose();
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

  private applyZoom(): void {
    this.cameras.main.setZoom(pixelsPerMeter(this.scale.width, this.scale.height));
  }

  override update(_time: number, deltaMs: number): void {
    const host = this.host;
    if (!host || !this.sticks) return;

    const mv = this.sticks.moveVector();
    this.input_.moveX = mv.x;
    this.input_.moveY = mv.y;
    const aim = this.sticks.aimVector();
    this.input_.aimX = aim.x;
    this.input_.aimY = aim.y;
    this.input_.fire = aim.fire;
    this.input_.swap = this.hudModel.swapPressed; // edge flag: LocalSimHost latches it for one step
    this.hudModel.swapPressed = false;
    host.setLocalInput(this.input_);

    if (this.running) host.update(deltaMs / 1000); // LocalSimHost caps catch-up after long frames
    const events = host.drainEvents();
    for (let i = 0; i < events.length; i++) {
      const e = events[i];
      if (!e) continue;
      this.fxView?.handle(e);
      if (e.type === "player.died" && e.playerId === LOCAL_PLAYER_ID && !this.gameOver) {
        this.gameOver = true;
        uiStore.set({ kind: "gameOver", waveReached: Math.max(1, host.world.waves.number) });
      } else if (e.type === "weapon.fired" && e.playerId === LOCAL_PLAYER_ID) {
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
    const player = host.world.players.get(LOCAL_PLAYER_ID);
    if (player && this.playerView) {
      this.playerView.update(player, host.alpha);
      this.cameras.main.centerOn(this.playerView.x, this.playerView.y);
      this.updateRushMarkers(host.alpha, this.playerView.x, this.playerView.y);
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
      this.hudModel.swapFrac = player.loadout.swapTicks > 0 ? 1 - player.loadout.swapTicks / swapTicks : -1;
    }
  }
}
