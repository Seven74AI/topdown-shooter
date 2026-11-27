import * as Phaser from "phaser";
import { aboveDarkness } from "./darkness/aboveDark";
import { createCrewPose, crewPose, type CrewPose } from "./crewPose";

/** Placeholder palette (X9: photoreal later): a flight suit, a dark helmet, a hi-vis vest band. */
const SUIT = 0x4a5240;
const SUIT_DARK = 0x2c3127;
const HELMET = 0x1d2024;
const VISOR = 0x6d7e8c;
const VEST = 0xd9a441;
/** Sizes (m). */
const SHOULDER_RX = 0.3;
const SHOULDER_RY = 0.2;
const HEAD_R = 0.15;
const ARM_LEN = 0.42;
const ARM_W = 0.1;

/**
 * Story 12.3 (AC 8): the helicopter crew member — one simple code-drawn figure (top-down, like the survivors), drawn
 * once into two Graphics (the body and the waving arm); each frame only moves, rotates and fades them (no redraw, no
 * texture, no allocation). Under the helicopter's body in depth, so it disappears into the door when it climbs back.
 */
export class CrewView {
  private readonly body: Phaser.GameObjects.Graphics;
  private readonly arm: Phaser.GameObjects.Graphics;
  private readonly pose: CrewPose = createCrewPose();

  constructor(scene: Phaser.Scene, private readonly padX: number, private readonly padY: number) {
    this.arm = aboveDarkness(scene.add.graphics(), "pickup").setVisible(false);
    this.arm.fillStyle(SUIT_DARK, 1).fillRoundedRect(0, -ARM_W / 2, ARM_LEN, ARM_W, ARM_W / 2);
    this.arm.fillStyle(VEST, 1).fillCircle(ARM_LEN, 0, ARM_W * 0.6); // a glove
    this.body = aboveDarkness(scene.add.graphics(), "pickup").setVisible(false);
    this.body.fillStyle(SUIT, 1).fillEllipse(0, 0, SHOULDER_RX * 2, SHOULDER_RY * 2);
    this.body.fillStyle(VEST, 1).fillRect(-SHOULDER_RX * 0.85, -0.03, SHOULDER_RX * 1.7, 0.06);
    this.body.fillStyle(HELMET, 1).fillCircle(0, 0, HEAD_R);
    this.body.fillStyle(VISOR, 1).fillEllipse(0, HEAD_R * 0.45, HEAD_R * 1.2, HEAD_R * 0.6); // facing south (the walkers)
  }

  /** See `crewPose` for the inputs. */
  update(outS: number, aboardS: number, pullS: number): void {
    const p = crewPose(outS, aboardS, pullS, this.pose);
    if (this.body.visible !== p.visible) {
      this.body.setVisible(p.visible);
      this.arm.setVisible(p.visible);
    }
    if (!p.visible) return;
    const x = this.padX + p.dx;
    const y = this.padY + p.dy;
    this.body.setPosition(x, y).setAlpha(p.alpha);
    this.arm.setPosition(x + SHOULDER_RX * 0.8, y).setRotation(p.armRad).setAlpha(p.alpha);
  }

  get visible(): boolean {
    return this.pose.visible;
  }

  destroy(): void {
    this.body.destroy();
    this.arm.destroy();
  }
}
