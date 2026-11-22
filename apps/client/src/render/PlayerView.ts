import * as Phaser from "phaser";
import type { PlayerState } from "@topdown/shared";
import { SLOT_COLORS } from "./playerColors";
import { pulseAlpha, pulseScale } from "./pulse";

const BODY_COLOR = 0xd0d4d8;
/** Story 2.8: a downed survivor is drawn darker; an out one is hidden. */
const DOWNED_BODY_COLOR = 0x5a5e63;
const TICK_COLOR = 0x202428;
/** Story 2.9: ground ring in the slot colour (FR55, NFR11), in metres. */
const RING_GAP_M = 0.15;
const RING_WIDTH_M = 0.08;
const RING_ALPHA = 0.9;
/** Under the body (10) and Story 2.8's revive ring (9), above the street, blood, zombies and shots. */
const RING_DEPTH = 8.5;
const lerp = (a: number, b: number, t: number): number => a + (b - a) * t;

/** Placeholder survivor seen from above: a slot-coloured ground ring, a body circle and a facing tick. Units are meters. */
export class PlayerView {
  private readonly ring: Phaser.GameObjects.Arc;
  private readonly body: Phaser.GameObjects.Arc;
  private readonly tick: Phaser.GameObjects.Rectangle;
  x = 0;
  y = 0;
  private shownStatus: PlayerState["status"] | null = null;
  private slot = -1;

  constructor(scene: Phaser.Scene, radiusM: number) {
    // A stroked Arc with no fill, created once and only moved (no Graphics redraw).
    this.ring = scene.add
      .circle(0, 0, radiusM + RING_GAP_M)
      .setStrokeStyle(RING_WIDTH_M, SLOT_COLORS[0], RING_ALPHA)
      .setDepth(RING_DEPTH);
    this.body = scene.add.circle(0, 0, radiusM, BODY_COLOR).setDepth(10);
    this.tick = scene.add.rectangle(0, 0, radiusM, radiusM * 0.3, TICK_COLOR).setOrigin(0, 0.5).setDepth(11);
  }

  /** Ring colour by lobby slot (0–3; solo is 0, blue). */
  setSlot(slot: number): void {
    if (slot === this.slot) return;
    this.slot = slot;
    this.ring.setStrokeStyle(RING_WIDTH_M, SLOT_COLORS[slot] ?? SLOT_COLORS[0], RING_ALPHA);
  }

  /** Reads the player (never writes it) and draws it at the interpolated position; `timeMs` drives the downed pulse. */
  update(p: PlayerState, alpha: number, timeMs: number): void {
    this.x = lerp(p.prevX, p.x, alpha);
    this.y = lerp(p.prevY, p.y, alpha);
    this.ring.setPosition(this.x, this.y);
    this.body.setPosition(this.x, this.y);
    this.tick.setPosition(this.x, this.y).setRotation(Math.atan2(p.facingY, p.facingX));
    if (p.status !== this.shownStatus) {
      this.shownStatus = p.status; // only touch the objects when the status changes
      const shown = p.status !== "out";
      this.body.setFillStyle(p.status === "downed" ? DOWNED_BODY_COLOR : BODY_COLOR).setVisible(shown);
      this.tick.setVisible(shown);
      this.ring.setVisible(shown).setScale(1).setAlpha(1);
    }
    if (p.status === "downed") {
      // Story 2.9: a downed survivor's ring pulses (mine too), so the revive chance is obvious.
      this.ring.setScale(pulseScale(timeMs)).setAlpha(pulseAlpha(timeMs));
    }
  }

  destroy(): void {
    this.ring.destroy();
    this.body.destroy();
    this.tick.destroy();
  }
}
