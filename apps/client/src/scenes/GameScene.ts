import * as Phaser from "phaser";
import {
  NEUTRAL_INPUT,
  ZOMBIE_POOL_CAPACITY,
  addPlayer,
  loadBalance,
  spawnRing,
  type Balance,
  type PlayerInput,
} from "@topdown/shared";
import { dpr } from "../display";
import { STICK_RADIUS_CSS_PX, TouchSticks } from "../input/TouchSticks";
import { pixelsPerMeter } from "../render/camera";
import { PlayerView } from "../render/PlayerView";
import { drawStreet } from "../render/StreetView";
import { ZombieView } from "../render/ZombieView";
import { uiStore } from "../ui/uiState";
import { createHudModel } from "./hudModel";
import { LOCAL_PLAYER_ID, LocalSimHost } from "../sim/LocalSimHost";
import type { HudSceneData } from "./HudScene";

/** A random uint32 run seed. Client code, so crypto is allowed here (never in packages/shared). */
export function newRunSeed(): number {
  return crypto.getRandomValues(new Uint32Array(1))[0] ?? 1;
}

/** The fight: runs the World through a SimHost, draws it, and feeds it the local input. */
/** Temporary Epic 1 spawner (removed by Story 1.7's wave director): Walkers along the map edges. */
const TEMP_START_WALKERS = 40;
const TEMP_RING_RADIUS_M = 30; // larger than the map: the ring is clamped onto the edges

export class GameScene extends Phaser.Scene {
  private host: LocalSimHost | null = null;
  private sticks: TouchSticks | null = null;
  private playerView: PlayerView | null = null;
  private zombieView: ZombieView | null = null;
  private readonly hudModel = createHudModel();
  private gameOver = false;
  /** Reused every frame (no per-frame allocation); the host copies it at each step. */
  private readonly input_: { -readonly [K in keyof PlayerInput]: PlayerInput[K] } = { ...NEUTRAL_INPUT };

  constructor() {
    super("Game");
  }

  create(): void {
    const balance: Balance = loadBalance();
    const host = new LocalSimHost({ balance, seed: newRunSeed() });
    this.host = host;
    const world = host.world;
    const cx = world.map.widthM / 2;
    const cy = world.map.heightM / 2;
    addPlayer(world, LOCAL_PLAYER_ID, cx, cy);
    spawnRing(world, "walker", TEMP_START_WALKERS, cx, cy, TEMP_RING_RADIUS_M);
    this.gameOver = false;
    uiStore.set({ kind: "playing" });
    uiStore.handle("restart", () => this.scene.restart());

    drawStreet(this, world.map);
    this.zombieView = new ZombieView(this, balance, ZOMBIE_POOL_CAPACITY);
    this.playerView = new PlayerView(this, balance.player.radiusM);

    const cam = this.cameras.main;
    cam.setBackgroundColor(0x000000);
    cam.setBounds(0, 0, world.map.widthM, world.map.heightM);
    this.applyZoom();
    this.scale.on(Phaser.Scale.Events.RESIZE, this.applyZoom, this);

    this.sticks = new TouchSticks(STICK_RADIUS_CSS_PX * dpr(), balance.controls.moveDeadZone);
    const hudData: HudSceneData = { sticks: this.sticks, model: this.hudModel };
    this.scene.launch("Hud", hudData);

    this.events.once(Phaser.Scenes.Events.SHUTDOWN, () => {
      this.scale.off(Phaser.Scale.Events.RESIZE, this.applyZoom, this);
      this.scene.stop("Hud");
      uiStore.handle("restart", undefined);
      this.zombieView?.destroy();
      this.playerView?.destroy();
      this.host?.dispose();
      this.host = null;
    });
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
    host.setLocalInput(this.input_);

    host.update(deltaMs / 1000); // LocalSimHost caps catch-up after long frames
    const events = host.drainEvents();
    for (let i = 0; i < events.length; i++) {
      const e = events[i];
      if (e?.type === "player.died" && e.playerId === LOCAL_PLAYER_ID && !this.gameOver) {
        this.gameOver = true;
        // The wave director arrives in Story 1.7; until then every run is wave 1.
        uiStore.set({ kind: "gameOver", waveReached: 1 });
      }
    }

    this.zombieView?.update(host.world, host.alpha);
    const player = host.world.players.get(LOCAL_PLAYER_ID);
    if (player && this.playerView) {
      this.playerView.update(player, host.alpha);
      this.cameras.main.centerOn(this.playerView.x, this.playerView.y);
      this.hudModel.hp = player.hp;
      this.hudModel.maxHp = player.maxHp;
    }
  }
}
