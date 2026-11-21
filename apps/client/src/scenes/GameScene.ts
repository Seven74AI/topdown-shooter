import * as Phaser from "phaser";
import { NEUTRAL_INPUT, addPlayer, loadBalance, type Balance, type PlayerInput } from "@topdown/shared";
import { dpr } from "../display";
import { STICK_RADIUS_CSS_PX, TouchSticks } from "../input/TouchSticks";
import { pixelsPerMeter } from "../render/camera";
import { PlayerView } from "../render/PlayerView";
import { drawStreet } from "../render/StreetView";
import { LOCAL_PLAYER_ID, LocalSimHost } from "../sim/LocalSimHost";
import type { HudSceneData } from "./HudScene";

/** A random uint32 run seed. Client code, so crypto is allowed here (never in packages/shared). */
export function newRunSeed(): number {
  return crypto.getRandomValues(new Uint32Array(1))[0] ?? 1;
}

/** The fight: runs the World through a SimHost, draws it, and feeds it the local input. */
export class GameScene extends Phaser.Scene {
  private host: LocalSimHost | null = null;
  private sticks: TouchSticks | null = null;
  private playerView: PlayerView | null = null;
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
    addPlayer(world, LOCAL_PLAYER_ID, world.map.widthM / 2, world.map.heightM / 2);

    drawStreet(this, world.map);
    this.playerView = new PlayerView(this, balance.player.radiusM);

    const cam = this.cameras.main;
    cam.setBackgroundColor(0x000000);
    cam.setBounds(0, 0, world.map.widthM, world.map.heightM);
    this.applyZoom();
    this.scale.on(Phaser.Scale.Events.RESIZE, this.applyZoom, this);

    this.sticks = new TouchSticks(STICK_RADIUS_CSS_PX * dpr(), balance.controls.moveDeadZone);
    const hudData: HudSceneData = { sticks: this.sticks };
    this.scene.launch("Hud", hudData);

    this.events.once(Phaser.Scenes.Events.SHUTDOWN, () => {
      this.scale.off(Phaser.Scale.Events.RESIZE, this.applyZoom, this);
      this.scene.stop("Hud");
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
    host.drainEvents(); // no consumers yet (Story 1.5 adds the effects dispatcher)

    const player = host.world.players.get(LOCAL_PLAYER_ID);
    if (player && this.playerView) {
      this.playerView.update(player, host.alpha);
      this.cameras.main.centerOn(this.playerView.x, this.playerView.y);
    }
  }
}
