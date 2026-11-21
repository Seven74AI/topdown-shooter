import * as Phaser from "phaser";
import { loadBalance } from "@topdown/shared";
import { dpr } from "../display";
import { LocalSimHost } from "../sim/LocalSimHost";
import type { SimHost } from "../sim/SimHost";

const DEBUG_FONT_PX = 14; // CSS px, scaled by dpr()

/** A random uint32 run seed. Client code, so crypto is allowed here (never in packages/shared). */
export function newRunSeed(): number {
  return crypto.getRandomValues(new Uint32Array(1))[0] ?? 1;
}

/**
 * The fight. Story 1.2: runs the World through a SimHost and shows the tick counter.
 * Story 1.3 replaces the counter with the street and the survivor.
 */
export class GameScene extends Phaser.Scene {
  private host: SimHost | null = null;
  private tickText: Phaser.GameObjects.Text | null = null;
  private lastShownTick = -1;

  constructor() {
    super("Game");
  }

  create(): void {
    this.host = new LocalSimHost({ balance: loadBalance(), seed: newRunSeed() });
    this.tickText = this.add.text(8 * dpr(), 8 * dpr(), "tick 0", {
      fontFamily: "ui-monospace, monospace",
      fontSize: `${Math.round(DEBUG_FONT_PX * dpr())}px`,
      color: "#9aa0a6",
    });
    this.events.once(Phaser.Scenes.Events.SHUTDOWN, () => {
      this.host?.dispose();
      this.host = null;
    });
  }

  override update(_time: number, deltaMs: number): void {
    const host = this.host;
    if (!host) return;
    host.update(deltaMs / 1000); // LocalSimHost caps catch-up after long frames
    host.drainEvents(); // no consumers yet (Story 1.5 adds the effects dispatcher)
    const tick = host.world.tick;
    if (tick !== this.lastShownTick && this.tickText) {
      this.lastShownTick = tick;
      this.tickText.setText(`tick ${tick}`);
    }
  }
}
