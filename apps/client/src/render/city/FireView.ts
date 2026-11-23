import * as Phaser from "phaser";
import type { FireRecord } from "@topdown/shared";
import { ATLAS_FIREFX, FIRE_FLAME_FRAMES, FIRE_SMOKE_FRAMES, FX_FIRE_EMBER, FX_FIRE_LIGHT, ensureFireFxAtlas } from "./fireFxAtlas";
import { CarFire, fireInView, FIRE_EMBERS_MAX, FIRE_FLAMES_MAX, FIRE_SMOKE_MAX, emberDraw, fireFlicker, flameDraw, smokeDraw, type ParticleDraw } from "./fireParticles";
import { fireRingRadiusM } from "./fireRing";
import { flameCoreFrac } from "./fireSprites";

/**
 * Depths (4.11 review L3 kept): the ground light with the other animated lights; the smoke above the
 * car but BELOW zombies (4.5–5.5) and survivors (10), so it never hides an approaching zombie; the
 * flames over the smoke (still under the zombies: they avoid fire); sparks above the characters,
 * below the rain.
 */
const LIGHT_DEPTH = 4.32;
const SMOKE_DEPTH = 4.36;
const FLAME_DEPTH = 4.38;
const EMBER_DEPTH = 11.6;
/** Lab panel D's ground light: 2R wide (it ends at the zone edge), additive, flickering. */
const LIGHT_ALPHA = 0.13;
/** Particles fainter than this are hidden instead of drawn (fill rate). */
const MIN_ALPHA = 0.01;


interface Slot {
  name: string | null;
  readonly fire: CarFire;
  readonly flames: Phaser.GameObjects.Image[];
  readonly smoke: Phaser.GameObjects.Image[];
  readonly embers: Phaser.GameObjects.Image[];
  readonly light: Phaser.GameObjects.Image;
  readonly flameFrame: Int8Array;
  readonly smokeFrame: Int8Array;
  x: number;
  y: number;
  r: number;
  /** Drawn last frame (false while culled). */
  shown: boolean;
}

/**
 * Story 4.12: the burning cars' fire drawn by code (designer pick: fire-lab panel D): per fire a
 * pooled particle fire (`CarFire`: ≤ 130 flames, 44 smoke puffs, 24 sparks; half with `?fx=low`),
 * one pooled image per particle slot, plus a soft flickering ground light. Only image properties
 * change per frame (no allocation). The thin ring line and the scorch stay in `CityView` / the bake.
 */
export class FireView {
  private readonly slots: Slot[] = [];
  private readonly d: ParticleDraw = { x: 0, y: 0, w: 0, h: 0, rot: 0, alpha: 0, tint: 0, frame: 0 };

  constructor(scene: Phaser.Scene, maxFires: number, low: boolean) {
    ensureFireFxAtlas(scene);
    const img = (frame: string, depth: number, add: boolean): Phaser.GameObjects.Image => {
      const i = scene.add.image(0, 0, ATLAS_FIREFX, frame).setDepth(depth).setVisible(false);
      if (add) i.setBlendMode(Phaser.BlendModes.ADD);
      return i;
    };
    for (let s = 0; s < maxFires; s++) {
      const slot: Slot = {
        name: null,
        fire: new CarFire(0x4f12 + s * 7919, low),
        flames: [],
        smoke: [],
        embers: [],
        light: img(FX_FIRE_LIGHT, LIGHT_DEPTH, true),
        flameFrame: new Int8Array(FIRE_FLAMES_MAX).fill(-1),
        smokeFrame: new Int8Array(FIRE_SMOKE_MAX).fill(-1),
        x: 0,
        y: 0,
        r: 0,
        shown: false,
      };
      for (let i = 0; i < FIRE_FLAMES_MAX; i++) slot.flames.push(img(FIRE_FLAME_FRAMES[0] as string, FLAME_DEPTH, true));
      for (let i = 0; i < FIRE_SMOKE_MAX; i++) slot.smoke.push(img(FIRE_SMOKE_FRAMES[0] as string, SMOKE_DEPTH, false));
      for (let i = 0; i < FIRE_EMBERS_MAX; i++) slot.embers.push(img(FX_FIRE_EMBER, EMBER_DEPTH, true));
      this.slots.push(slot);
    }
  }

  /**
   * On a bake: the burning fires (at most the pool's slots) and each car's facing (radians). A fire
   * that keeps burning keeps its particles; a new one starts empty; a fire gone out is hidden.
   */
  setFires(fires: readonly FireRecord[], carAngle: (f: FireRecord) => number): void {
    for (let s = 0; s < this.slots.length; s++) {
      const slot = this.slots[s] as Slot;
      const f = fires[s];
      if (!f) {
        if (slot.name !== null) {
          slot.name = null;
          slot.fire.clear();
          this.hide(slot);
        }
        continue;
      }
      if (slot.name !== f.name) {
        slot.name = f.name;
        slot.fire.clear();
        this.hide(slot);
      }
      slot.fire.setCar(carAngle(f));
      slot.x = f.x;
      slot.y = f.y;
      slot.r = fireRingRadiusM(f);
      slot.light.setPosition(f.x, f.y).setDisplaySize(2 * slot.r, 2 * slot.r);
    }
  }

  /** Live particles over every fire (browser checks read it). */
  particleCount(): number {
    let n = 0;
    for (const s of this.slots) if (s.name !== null) n += s.fire.count();
    return n;
  }

  /**
   * Browser checks: how far the brightest reach of the drawn flames (their alpha > 50 % core at the
   * images' displayed size) passes the zone edge, at most (≤ 0 = the edge rule holds on screen).
   */
  brightEdgeExcess(): number {
    const core = flameCoreFrac();
    let worst = -Infinity;
    for (const s of this.slots) {
      if (s.name === null) continue;
      for (const img of s.flames) {
        if (!img.visible) continue;
        const e = Math.hypot(img.x - s.x, img.y - s.y) + (core * Math.max(img.displayWidth, img.displayHeight)) / 2 - s.r;
        if (e > worst) worst = e;
      }
    }
    return worst;
  }

  /**
   * One frame: `dtS` = 0 while paused (everything holds still), `tS` the view's clock, the camera
   * view (m). A fire out of view holds still and draws nothing.
   */
  update(dtS: number, tS: number, vx: number, vy: number, vw: number, vh: number): void {
    const d = this.d;
    for (let s = 0; s < this.slots.length; s++) {
      const slot = this.slots[s] as Slot;
      if (slot.name === null) continue;
      if (!fireInView(slot.x, slot.y, slot.r, vx, vy, vw, vh)) {
        if (slot.shown) this.hide(slot);
        continue;
      }
      if (!slot.shown) {
        slot.shown = true;
        slot.light.setVisible(true);
      }
      const fire = slot.fire;
      fire.update(dtS, tS, slot.r);
      slot.light.setAlpha(LIGHT_ALPHA * fireFlicker(tS, 0.7 + s));
      const fp = fire.flames;
      for (let i = 0; i < fp.cap; i++) {
        const img = slot.flames[i] as Phaser.GameObjects.Image;
        if (!flameDraw(fp, i, slot.r, d) || d.alpha < MIN_ALPHA) {
          if (img.visible) img.setVisible(false);
          continue;
        }
        if (slot.flameFrame[i] !== d.frame) {
          slot.flameFrame[i] = d.frame;
          img.setFrame(FIRE_FLAME_FRAMES[d.frame] as string);
        }
        img.setPosition(slot.x + d.x, slot.y + d.y).setDisplaySize(d.w, d.h).setRotation(d.rot).setAlpha(d.alpha).setTint(d.tint);
        if (!img.visible) img.setVisible(true);
      }
      const sp = fire.smoke;
      for (let i = 0; i < sp.cap; i++) {
        const img = slot.smoke[i] as Phaser.GameObjects.Image;
        if (!smokeDraw(sp, i, "black", 0, 0, d) || d.alpha < MIN_ALPHA) {
          if (img.visible) img.setVisible(false);
          continue;
        }
        if (slot.smokeFrame[i] !== d.frame) {
          slot.smokeFrame[i] = d.frame;
          img.setFrame(FIRE_SMOKE_FRAMES[d.frame] as string);
        }
        img.setPosition(slot.x + d.x, slot.y + d.y).setDisplaySize(d.w, d.h).setRotation(d.rot).setAlpha(d.alpha).setTint(d.tint);
        if (!img.visible) img.setVisible(true);
      }
      const ep = fire.embers;
      for (let i = 0; i < ep.cap; i++) {
        const img = slot.embers[i] as Phaser.GameObjects.Image;
        if (!emberDraw(ep, i, slot.r, d) || d.alpha < MIN_ALPHA) {
          if (img.visible) img.setVisible(false);
          continue;
        }
        img.setPosition(slot.x + d.x, slot.y + d.y).setDisplaySize(d.w, d.h).setRotation(d.rot).setAlpha(d.alpha);
        if (!img.visible) img.setVisible(true);
      }
    }
  }

  private hide(slot: Slot): void {
    slot.shown = false;
    slot.light.setVisible(false);
    for (const img of slot.flames) img.setVisible(false);
    for (const img of slot.smoke) img.setVisible(false);
    for (const img of slot.embers) img.setVisible(false);
  }

  destroy(): void {
    for (const s of this.slots) {
      s.light.destroy();
      for (const img of s.flames) img.destroy();
      for (const img of s.smoke) img.destroy();
      for (const img of s.embers) img.destroy();
    }
    this.slots.length = 0;
  }
}
