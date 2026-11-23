import * as Phaser from "phaser";
import { ATLAS_FX, FX_GLOW } from "./city/spriteAtlas";
import { hash } from "./city/spriteArt";
import { ATLAS_OBJECTS, FLAME_FRAMES, SMOKE_FRAMES, ensureObjectsAtlas } from "./city/objectsAtlas";
import {
  BODY_EMBERS,
  BODY_EMBER_S,
  BODY_FLAMES,
  BODY_FLAME_FLICKER_HZ,
  BODY_FLAME_R,
  BODY_SMOKE,
  BODY_SMOKE_S,
  MAX_BURNING_PLAYERS,
  bodyFlameSpot,
} from "./burnCue";

/** Above the survivor body (10), below the rush chevrons and bars (12). */
const FLAME_DEPTH = 10.2;
const EMBER_DEPTH = 10.3;
const SMOKE_DEPTH = 10.4;
const EMBER_M = 0.1;
const EMBER_RISE_M = 1.1;
const EMBER_COLOR = 0xffa040;
const SMOKE_START_M = 0.5;
const SMOKE_END_M = 1.4;
const SMOKE_DRIFT_X_M = 0.5;
const SMOKE_DRIFT_Y_M = -0.9;
const SMOKE_ALPHA = 0.45;
const SMOKE_TINT = 0x9a948e;

interface Slot {
  readonly flames: Phaser.GameObjects.Image[];
  readonly flameFrame: Int8Array;
  readonly smoke: Phaser.GameObjects.Image[];
  readonly embers: Phaser.GameObjects.Image[];
  shown: boolean;
}

/**
 * Story 4.11: the burning cues on survivors (designer: (1) animated flames on the body, (2) smoke
 * puffs and rising embers), for every player the server reports burning (`FireCue`, online and
 * solo). A fixed pool of `MAX_BURNING_PLAYERS` slots; each frame `begin`, one `draw` per burning
 * survivor (its drawn position), `end` hides the unused slots. Alpha / position / size only: no
 * allocation per frame.
 */
export class BurnView {
  private readonly slots: Slot[] = [];
  private used = 0;
  private readonly p = { x: 0, y: 0 };

  constructor(scene: Phaser.Scene) {
    ensureObjectsAtlas(scene);
    for (let s = 0; s < MAX_BURNING_PLAYERS; s++) {
      const slot: Slot = { flames: [], flameFrame: new Int8Array(BODY_FLAMES).fill(-1), smoke: [], embers: [], shown: false };
      for (let i = 0; i < BODY_FLAMES; i++) slot.flames.push(scene.add.image(0, 0, ATLAS_OBJECTS, FLAME_FRAMES[0] as string).setDepth(FLAME_DEPTH).setVisible(false));
      for (let i = 0; i < BODY_SMOKE; i++) slot.smoke.push(scene.add.image(0, 0, ATLAS_OBJECTS, SMOKE_FRAMES[i % SMOKE_FRAMES.length] as string).setTint(SMOKE_TINT).setDepth(SMOKE_DEPTH).setVisible(false));
      for (let i = 0; i < BODY_EMBERS; i++) slot.embers.push(scene.add.image(0, 0, ATLAS_FX, FX_GLOW).setBlendMode(Phaser.BlendModes.ADD).setTint(EMBER_COLOR).setDisplaySize(EMBER_M, EMBER_M).setDepth(EMBER_DEPTH).setVisible(false));
      this.slots.push(slot);
    }
  }

  begin(): void {
    this.used = 0;
  }

  /** One burning survivor at (x, y) (m), body radius `r` (m), at time `tS` (s). Ignored past the pool. */
  draw(x: number, y: number, r: number, tS: number): void {
    const s = this.used;
    const slot = this.slots[s];
    if (!slot) return;
    this.used++;
    if (!slot.shown) {
      slot.shown = true;
      for (const img of slot.flames) img.setVisible(true);
      for (const img of slot.smoke) img.setVisible(true);
      for (const img of slot.embers) img.setVisible(true);
    }
    const step = Math.floor(tS * BODY_FLAME_FLICKER_HZ);
    for (let i = 0; i < BODY_FLAMES; i++) {
      const img = slot.flames[i] as Phaser.GameObjects.Image;
      const fr = (step + i * 5 + s) % FLAME_FRAMES.length;
      if (slot.flameFrame[i] !== fr) {
        slot.flameFrame[i] = fr;
        img.setFrame(FLAME_FRAMES[fr] as string);
      }
      bodyFlameSpot(i, BODY_FLAMES, tS, r, this.p);
      const flick = hash(step * 1.7 + i * 11.3 + s * 3.1);
      const size = 2 * r * BODY_FLAME_R * (0.75 + 0.4 * flick);
      img.setPosition(x + this.p.x, y + this.p.y).setDisplaySize(size, size).setRotation(flick * Math.PI).setAlpha(0.75 + 0.25 * flick);
    }
    for (let i = 0; i < BODY_SMOKE; i++) {
      const img = slot.smoke[i] as Phaser.GameObjects.Image;
      const ph0 = tS / BODY_SMOKE_S + i / BODY_SMOKE + s * 0.29;
      const ph = ph0 - Math.floor(ph0);
      const size = SMOKE_START_M + (SMOKE_END_M - SMOKE_START_M) * ph;
      img.setPosition(x + SMOKE_DRIFT_X_M * ph, y + SMOKE_DRIFT_Y_M * ph).setDisplaySize(size, size).setRotation(ph0 + i).setAlpha(SMOKE_ALPHA * Math.min(1, ph * 5) * (1 - ph));
    }
    for (let i = 0; i < BODY_EMBERS; i++) {
      const img = slot.embers[i] as Phaser.GameObjects.Image;
      const ph0 = tS / BODY_EMBER_S + i / BODY_EMBERS + s * 0.41;
      const ph = ph0 - Math.floor(ph0);
      const ox = (hash(Math.floor(ph0) * 5.3 + i * 2.9 + s) - 0.5) * 2 * r;
      img.setPosition(x + ox + ph * 0.25, y - ph * EMBER_RISE_M).setAlpha(1 - ph);
    }
  }

  /** Hides the slots not drawn this frame (players no longer burning). */
  end(): void {
    for (let s = this.used; s < this.slots.length; s++) {
      const slot = this.slots[s] as Slot;
      if (!slot.shown) continue;
      slot.shown = false;
      for (const img of slot.flames) img.setVisible(false);
      for (const img of slot.smoke) img.setVisible(false);
      for (const img of slot.embers) img.setVisible(false);
    }
  }

  destroy(): void {
    for (const slot of this.slots) for (const img of [...slot.flames, ...slot.smoke, ...slot.embers]) img.destroy();
    this.slots.length = 0;
  }
}
