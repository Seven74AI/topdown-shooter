import * as Phaser from "phaser";
import { ATLAS_FIREFX, FIRE_FLAME_FRAMES, FIRE_SMOKE_FRAMES, FX_FIRE_EMBER, FX_FIRE_LIGHT, ensureFireFxAtlas } from "./city/fireFxAtlas";
import { BODY_EMBERS_MAX, BODY_FLAMES_MAX, BODY_SMOKE_MAX, BodyFire, emberDraw, fireFlicker, flameDraw, smokeDraw, type ParticleDraw } from "./city/fireParticles";
import { MAX_BURNING_PLAYERS } from "./burnCue";

/**
 * Depths: the smoke BELOW zombies (4.5+) and survivors (10) like the car fire's (4.11 review L3: it
 * never hides a zombie); the body's light and flames above the survivor body (10), the sparks above
 * them, all below the rush chevrons and bars (12).
 */
const SMOKE_DEPTH = 4.39;
const GLOW_DEPTH = 10.15;
const FLAME_DEPTH = 10.2;
const EMBER_DEPTH = 10.3;
/** The lab's warm light on a burning body: this wide (× body radius) and bright at full burn. */
const GLOW_R = 3.5;
const GLOW_ALPHA = 0.3;

interface Slot {
  id: string | null;
  touched: boolean;
  x: number;
  y: number;
  r: number;
  readonly fire: BodyFire;
  readonly glow: Phaser.GameObjects.Image;
  readonly flames: Phaser.GameObjects.Image[];
  readonly smoke: Phaser.GameObjects.Image[];
  readonly embers: Phaser.GameObjects.Image[];
  readonly flameFrame: Int8Array;
  readonly smokeFrame: Int8Array;
}

/**
 * Story 4.11 cues, Story 4.12 look (fire-lab "Burning survivor"): particle flames, smoke and embers
 * on every survivor the server reports burning (`FireCue`: `player.damaged` fire events, online and
 * solo). A fixed pool of `MAX_BURNING_PLAYERS` slots, each a `BodyFire` (≤ 28 flames, 10 puffs, 14
 * sparks; half with `?fx=low`) bound to one player while it burns and while its flames die down
 * (~0.9 s after the cue ends). Each frame: `begin`, one `draw` per alive survivor, `end`. Image
 * properties only: no allocation per frame.
 */
export class BurnView {
  private readonly slots: Slot[] = [];
  private dt = 0;
  private t = 0;
  private readonly d: ParticleDraw = { x: 0, y: 0, w: 0, h: 0, rot: 0, alpha: 0, tint: 0, frame: 0 };

  constructor(scene: Phaser.Scene, low = false) {
    ensureFireFxAtlas(scene);
    const img = (frame: string, depth: number, add: boolean): Phaser.GameObjects.Image => {
      const i = scene.add.image(0, 0, ATLAS_FIREFX, frame).setDepth(depth).setVisible(false);
      if (add) i.setBlendMode(Phaser.BlendModes.ADD);
      return i;
    };
    for (let s = 0; s < MAX_BURNING_PLAYERS; s++) {
      const slot: Slot = {
        id: null,
        touched: false,
        x: 0,
        y: 0,
        r: 0,
        fire: new BodyFire(0xb0d7 + s * 104729, low),
        glow: img(FX_FIRE_LIGHT, GLOW_DEPTH, true),
        flames: [],
        smoke: [],
        embers: [],
        flameFrame: new Int8Array(BODY_FLAMES_MAX).fill(-1),
        smokeFrame: new Int8Array(BODY_SMOKE_MAX).fill(-1),
      };
      for (let i = 0; i < BODY_FLAMES_MAX; i++) slot.flames.push(img(FIRE_FLAME_FRAMES[0] as string, FLAME_DEPTH, true));
      for (let i = 0; i < BODY_SMOKE_MAX; i++) slot.smoke.push(img(FIRE_SMOKE_FRAMES[0] as string, SMOKE_DEPTH, false));
      for (let i = 0; i < BODY_EMBERS_MAX; i++) slot.embers.push(img(FX_FIRE_EMBER, EMBER_DEPTH, true));
      this.slots.push(slot);
    }
  }

  /** Start of a frame: `dtS` (0 while paused), the view's clock `tS` (s). */
  begin(dtS: number, tS: number): void {
    this.dt = dtS;
    this.t = tS;
    for (const s of this.slots) s.touched = false;
  }

  /**
   * One survivor at its drawn position (m), body radius `r` (m): `burning` = the server says it burns
   * (`FireCue`) and it is alive. A survivor not burning and not in a slot costs one short search.
   */
  draw(id: string, x: number, y: number, r: number, burning: boolean): void {
    let slot: Slot | undefined;
    for (const s of this.slots) if (s.id === id) slot = s;
    if (!slot) {
      if (!burning) return;
      for (const s of this.slots) if (s.id === null && !slot) slot = s;
      if (!slot) return; // more burning players than the pool: the extra ones show no flames
      slot.id = id;
      slot.fire.clear();
    }
    slot.touched = true;
    slot.x = x;
    slot.y = y;
    slot.r = r;
    this.step(slot, burning);
  }

  /** Slots whose survivor was not drawn this frame (left, downed out of view) die down where they were. */
  end(): void {
    for (const s of this.slots) if (s.id !== null && !s.touched) this.step(s, false);
  }

  /** Live particles over every survivor (browser checks read it). */
  particleCount(): number {
    let n = 0;
    for (const s of this.slots) if (s.id !== null) n += s.fire.count();
    return n;
  }

  private step(slot: Slot, burning: boolean): void {
    const f = slot.fire;
    f.update(this.dt, this.t, slot.x, slot.y, slot.r, burning);
    if (f.idle()) {
      slot.id = null;
      this.hide(slot);
      return;
    }
    const d = this.d;
    slot.glow
      .setPosition(slot.x, slot.y)
      .setDisplaySize(GLOW_R * slot.r, GLOW_R * slot.r)
      .setAlpha(GLOW_ALPHA * f.burn * fireFlicker(this.t, 3))
      .setVisible(f.burn > 0);
    for (let i = 0; i < f.flames.cap; i++) {
      const img = slot.flames[i] as Phaser.GameObjects.Image;
      if (!flameDraw(f.flames, i, 0, d)) {
        if (img.visible) img.setVisible(false);
        continue;
      }
      if (slot.flameFrame[i] !== d.frame) {
        slot.flameFrame[i] = d.frame;
        img.setFrame(FIRE_FLAME_FRAMES[d.frame] as string);
      }
      img.setPosition(d.x, d.y).setDisplaySize(d.w, d.h).setRotation(d.rot).setAlpha(d.alpha).setTint(d.tint);
      if (!img.visible) img.setVisible(true);
    }
    for (let i = 0; i < f.smoke.cap; i++) {
      const img = slot.smoke[i] as Phaser.GameObjects.Image;
      if (!smokeDraw(f.smoke, i, "dark", NaN, NaN, d)) {
        if (img.visible) img.setVisible(false);
        continue;
      }
      if (slot.smokeFrame[i] !== d.frame) {
        slot.smokeFrame[i] = d.frame;
        img.setFrame(FIRE_SMOKE_FRAMES[d.frame] as string);
      }
      img.setPosition(d.x, d.y).setDisplaySize(d.w, d.h).setRotation(d.rot).setAlpha(d.alpha).setTint(d.tint);
      if (!img.visible) img.setVisible(true);
    }
    for (let i = 0; i < f.embers.cap; i++) {
      const img = slot.embers[i] as Phaser.GameObjects.Image;
      if (!emberDraw(f.embers, i, 0, d)) {
        if (img.visible) img.setVisible(false);
        continue;
      }
      img.setPosition(d.x, d.y).setDisplaySize(d.w, d.h).setRotation(d.rot).setAlpha(d.alpha);
      if (!img.visible) img.setVisible(true);
    }
  }

  private hide(slot: Slot): void {
    slot.glow.setVisible(false);
    for (const img of slot.flames) img.setVisible(false);
    for (const img of slot.smoke) img.setVisible(false);
    for (const img of slot.embers) img.setVisible(false);
  }

  destroy(): void {
    for (const s of this.slots) {
      s.glow.destroy();
      for (const img of s.flames) img.destroy();
      for (const img of s.smoke) img.destroy();
      for (const img of s.embers) img.destroy();
    }
    this.slots.length = 0;
  }
}
