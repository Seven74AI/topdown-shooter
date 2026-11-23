import * as Phaser from "phaser";
import type { PlayerState } from "@topdown/shared";
import { SLOT_COLORS } from "./playerColors";
import { pulseAlpha, pulseScale } from "./pulse";
import { ATLAS_CHARACTERS, SURVIVOR_FRAME, ensureAtlases, survivorFrameFor } from "./city/spriteAtlas";
import { CHAR_EXTENT_R } from "./city/spriteArt";

/** Story 4.9: the survivor sprite (`survivor_body_a`), tinted for states (MULTIPLY). */
const BODY_TINT = 0xffffff;
/** Story 2.8: a downed survivor is drawn darker; an out one is hidden. */
const DOWNED_TINT = 0x6a6e74;
/** Story 3.9: a slowed survivor (Crawler bite) is drawn a sickly green while it lasts. */
const SLOWED_TINT = 0xa9cf8a;
/** Story 2.9: ground ring in the slot colour (FR55, NFR11), in metres. */
const RING_GAP_M = 0.15;
const RING_WIDTH_M = 0.08;
const RING_ALPHA = 0.9;
/** Under the body (10) and Story 2.8's revive ring (9), above the street, blood, zombies and shots. */
const RING_DEPTH = 8.5;
const lerp = (a: number, b: number, t: number): number => a + (b - a) * t;

/** Survivor seen from above (Story 4.9 sprite, facing its aim) on a slot-coloured ground ring. Units are meters. */
export class PlayerView {
  private readonly ring: Phaser.GameObjects.Arc;
  private readonly body: Phaser.GameObjects.Image;
  x = 0;
  y = 0;
  private shownStatus: PlayerState["status"] | null = null;
  private shownSlowed = false;
  private slot = -1;
  /** Story 5.3: the frame shown (the active weapon's survivor frame); changed only on a swap or buy. */
  private shownFrame = SURVIVOR_FRAME;

  constructor(scene: Phaser.Scene, radiusM: number) {
    // A stroked Arc with no fill, created once and only moved (no Graphics redraw).
    this.ring = scene.add
      .circle(0, 0, radiusM + RING_GAP_M)
      .setStrokeStyle(RING_WIDTH_M, SLOT_COLORS[0], RING_ALPHA)
      .setDepth(RING_DEPTH);
    ensureAtlases(scene);
    const side = 2 * radiusM * CHAR_EXTENT_R.survivor;
    this.body = scene.add.image(0, 0, ATLAS_CHARACTERS, SURVIVOR_FRAME).setDisplaySize(side, side).setDepth(10);
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
    this.body.setPosition(this.x, this.y).setRotation(Math.atan2(p.facingY, p.facingX));
    const frame = survivorFrameFor(p.loadout.slots[p.loadout.active]?.weapon ?? "");
    if (frame !== this.shownFrame) {
      this.shownFrame = frame;
      this.body.setFrame(frame);
    }
    const slowed = p.slowTicksLeft > 0 && p.status === "alive";
    // Story 4.11: no burning tint any more (4.8's ember tint): BurnView draws flames, smoke and embers on the body.
    if (p.status !== this.shownStatus || slowed !== this.shownSlowed) {
      this.shownStatus = p.status; // only touch the objects when the status (or the slow) changes
      this.shownSlowed = slowed;
      const shown = p.status !== "out";
      const tint = p.status === "downed" ? DOWNED_TINT : slowed ? SLOWED_TINT : BODY_TINT;
      this.body.setTint(tint).setVisible(shown);
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
  }
}
