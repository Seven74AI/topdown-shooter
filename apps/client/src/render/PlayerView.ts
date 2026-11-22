import * as Phaser from "phaser";
import type { PlayerState } from "@topdown/shared";

const BODY_COLOR = 0xd0d4d8;
/** Story 2.8: a downed survivor is drawn darker; an out one is hidden. */
const DOWNED_BODY_COLOR = 0x5a5e63;
const TICK_COLOR = 0x202428;
const lerp = (a: number, b: number, t: number): number => a + (b - a) * t;

/** Placeholder survivor seen from above: a body circle and a facing tick. Units are meters. */
export class PlayerView {
  private readonly body: Phaser.GameObjects.Arc;
  private readonly tick: Phaser.GameObjects.Rectangle;
  x = 0;
  y = 0;
  private shownStatus: PlayerState["status"] | null = null;

  constructor(scene: Phaser.Scene, radiusM: number) {
    this.body = scene.add.circle(0, 0, radiusM, BODY_COLOR).setDepth(10);
    this.tick = scene.add.rectangle(0, 0, radiusM, radiusM * 0.3, TICK_COLOR).setOrigin(0, 0.5).setDepth(11);
  }

  /** Reads the player (never writes it) and draws it at the interpolated position. */
  update(p: PlayerState, alpha: number): void {
    this.x = lerp(p.prevX, p.x, alpha);
    this.y = lerp(p.prevY, p.y, alpha);
    this.body.setPosition(this.x, this.y);
    this.tick.setPosition(this.x, this.y).setRotation(Math.atan2(p.facingY, p.facingX));
    if (p.status !== this.shownStatus) {
      this.shownStatus = p.status; // only touch the objects when the status changes
      this.body.setFillStyle(p.status === "downed" ? DOWNED_BODY_COLOR : BODY_COLOR).setVisible(p.status !== "out");
      this.tick.setVisible(p.status !== "out");
    }
  }

  destroy(): void {
    this.body.destroy();
    this.tick.destroy();
  }
}
