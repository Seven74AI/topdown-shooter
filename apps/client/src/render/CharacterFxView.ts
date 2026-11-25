import * as Phaser from "phaser";
import { VEIN_STEPS, type BloaterFxData } from "./city/charBloaterFx";
import { FX_BUBBLE, FX_BUBBLE_PX, FX_DRIP, FX_DRIP_PX, FX_SAC, FX_SAC_HALO, FX_SAC_HALO_PX, FX_SAC_PX, TEX_CHAR_FX } from "./city/charactersAtlas";

/**
 * Story 9.13 (B6, B7): the Bloaters' glowing veins and acid sacs and the Spitters' acid drips (take 4 ›
 * `drawBloaterFx`, the drips in `animated`), as pooled sprites: no canvas work and no allocation per frame. Capped by
 * `controls.fx.maxBloaterFx` / `maxSpitterDrips` (the nearest the camera, picked by `ZombieView`'s cap pass, which
 * also hands out the slots). Veins: two crossfaded pictures of the baked pulse (`VEIN_STEPS` over one period). Sacs:
 * a glossy blister throbbing, its halo (additive) and four bubbles rising inside. Drips: one every 0.6 s from the
 * mouth (deterministic per zombie: no `Math.random`), falling in 0.35 s, then a puddle spreading in world space
 * (it doesn't turn with the body) for 2 s.
 */
/** Sacs drawn per Bloater at most (BL5 has the most). */
export const MAX_SACS = 10;
const BUBBLES = 4;
/** take 4's drips: one every 0.6 s, gone after 2.4 s (so 4 at once), falling 0.35 s; page px at 68 per radius. */
const DRIP_EVERY_S = 0.6;
const DRIP_LIFE_S = 2.4;
const DRIP_FALL_S = 0.35;
const DRIPS = Math.ceil(DRIP_LIFE_S / DRIP_EVERY_S);
const PAGE_PX_PER_R = 68;
/** Depth above the body for the veins / sacs / drips (the body's own depth band). */
const VEIN_DZ = 0.01;
const SAC_DZ = 0.012;
const HALO_DZ = 0.013;
const BUBBLE_DZ = 0.014;
const DRIP_DZ = 0.015;

interface BloaterSlot {
  readonly veins: [Phaser.GameObjects.Image, Phaser.GameObjects.Image];
  readonly sacs: Phaser.GameObjects.Image[];
  readonly halos: Phaser.GameObjects.Image[];
  readonly bubbles: Phaser.GameObjects.Image[];
  used: boolean;
  shown: number;
}
interface SpitterSlot {
  readonly drops: Phaser.GameObjects.Image[];
  /** Per drop: the drop index it shows, and where it landed (world). */
  readonly n: Float64Array;
  readonly wx: Float32Array;
  readonly wy: Float32Array;
  used: boolean;
}

const hash01 = (a: number, b: number): number => {
  let h = Math.imul(a ^ Math.imul(b, 0x9e3779b1), 0x85ebca6b);
  h = Math.imul(h ^ (h >>> 13), 0xc2b2ae35);
  return ((h ^ (h >>> 16)) >>> 0) / 4294967296;
};

export class CharacterFxView {
  private readonly bloaters: (BloaterSlot | undefined)[];
  private readonly spitters: (SpitterSlot | undefined)[];

  constructor(
    private readonly scene: Phaser.Scene,
    readonly maxBloaters: number,
    readonly maxSpitters: number,
  ) {
    this.bloaters = new Array<BloaterSlot | undefined>(maxBloaters).fill(undefined);
    this.spitters = new Array<SpitterSlot | undefined>(maxSpitters).fill(undefined);
  }

  /** Sprites made so far (tests: the pools don't grow past the caps). */
  get spriteCount(): number {
    let n = 0;
    for (const b of this.bloaters) if (b) n += 2 + b.sacs.length + b.halos.length + b.bubbles.length;
    for (const s of this.spitters) if (s) n += s.drops.length;
    return n;
  }
  /** Sprites visible now (tests). */
  get visibleCount(): number {
    let n = 0;
    for (const b of this.bloaters) if (b) for (const i of [...b.veins, ...b.sacs, ...b.halos, ...b.bubbles]) if (i.visible) n++;
    for (const s of this.spitters) if (s) for (const i of s.drops) if (i.visible) n++;
    return n;
  }

  begin(): void {
    for (const b of this.bloaters) if (b) b.used = false;
    for (const s of this.spitters) if (s) s.used = false;
  }

  private image(frame: string, depth: number, add: boolean): Phaser.GameObjects.Image {
    const img = this.scene.add.image(0, 0, TEX_CHAR_FX, frame).setDepth(depth).setVisible(false);
    if (add) img.setBlendMode(Phaser.BlendModes.ADD);
    return img;
  }

  /**
   * One Bloater in slot `slot` (< maxBloaters): its sheet and vein frames (`layerNames(frame).veins`), its body image's pose (`x, y, rot`, display `sx × sy` m, frame side
   * `n` px), `alpha` (fog), the time `t` (s) and its baked data.
   */
  bloater(slot: number, sheet: string, veins: readonly string[], n: number, x: number, y: number, rot: number, sx: number, sy: number, depth: number, alpha: number, t: number, fx: BloaterFxData): void {
    let b = this.bloaters[slot];
    if (!b) {
      const v0 = this.scene.add.image(0, 0, sheet, veins[0]).setBlendMode(Phaser.BlendModes.ADD).setVisible(false);
      const v1 = this.scene.add.image(0, 0, sheet, veins[0]).setBlendMode(Phaser.BlendModes.ADD).setVisible(false);
      b = { veins: [v0, v1], sacs: [], halos: [], bubbles: [], used: false, shown: 0 };
      for (let i = 0; i < MAX_SACS; i++) {
        b.sacs.push(this.image(FX_SAC, 0, false));
        b.halos.push(this.image(FX_SAC_HALO, 0, true));
        for (let k = 0; k < BUBBLES; k++) b.bubbles.push(this.image(FX_BUBBLE, 0, false));
      }
      this.bloaters[slot] = b;
    }
    b.used = true;
    // the veins: the pulse crossfaded between its baked steps
    const f = ((((t / fx.periodS) % 1) + 1) % 1) * VEIN_STEPS;
    const i0 = Math.floor(f) % VEIN_STEPS;
    const i1 = (i0 + 1) % VEIN_STEPS;
    const w = f - Math.floor(f);
    for (let k = 0; k < 2; k++) {
      const img = b.veins[k] as Phaser.GameObjects.Image;
      const name = veins[k === 0 ? i0 : i1] as string;
      if (img.texture.key !== sheet) img.setTexture(sheet, name);
      else if (img.frame.name !== name) img.setFrame(name);
      img.setPosition(x, y).setRotation(rot).setDisplaySize(sx, sy).setDepth(depth + VEIN_DZ).setAlpha(alpha * (k === 0 ? 1 - w : w)).setVisible(true);
    }
    // the sacs (frame px → world: the frame faces +x; its centre is the body's)
    const kx = sx / n;
    const ky = sy / n;
    const c = Math.cos(rot);
    const s = Math.sin(rot);
    const count = Math.min(MAX_SACS, fx.sacs.length);
    const pk = kx * (FX_SAC_PX / 2 / (FX_SAC_PX / 2 - 2));
    for (let i = 0; i < MAX_SACS; i++) {
      const body = b.sacs[i] as Phaser.GameObjects.Image;
      const halo = b.halos[i] as Phaser.GameObjects.Image;
      if (i >= count) {
        if (i < b.shown) {
          body.setVisible(false);
          halo.setVisible(false);
          for (let k = 0; k < BUBBLES; k++) (b.bubbles[i * BUBBLES + k] as Phaser.GameObjects.Image).setVisible(false);
        }
        continue;
      }
      const sc = fx.sacs[i] as BloaterFxData["sacs"][number];
      const lx = (sc.x - n / 2) * kx;
      const ly = (sc.y - n / 2) * ky;
      const wx = x + lx * c - ly * s;
      const wy = y + lx * s + ly * c;
      const th = 1 + 0.08 * Math.sin(t * (2 + fx.s * 4) + sc.seed);
      const r = sc.r * th * (1 + fx.s * 0.25); // frame px
      body.setPosition(wx, wy).setRotation(rot).setDisplaySize(2 * r * pk, 2 * r * pk).setDepth(depth + SAC_DZ).setAlpha(alpha).setVisible(true);
      const hr = (1.8 * r * kx) / (FX_SAC_HALO_PX / 2 - 1);
      halo.setPosition(wx, wy).setDisplaySize(FX_SAC_HALO_PX * hr, FX_SAC_HALO_PX * hr).setDepth(depth + HALO_DZ).setAlpha(alpha * (0.1 + fx.s * 0.12)).setVisible(true);
      for (let k = 0; k < BUBBLES; k++) {
        const bub = b.bubbles[i * BUBBLES + k] as Phaser.GameObjects.Image;
        const ph = (((t * (0.5 + 0.2 * k) + sc.seed * 0.37 + k * 0.25) % 1) + 1) % 1;
        const bx = Math.sin(sc.seed + k * 2.1) * r * 0.45;
        const by = r * 0.8 - ph * r * 1.6;
        const bl = bx * kx;
        const bm = by * ky;
        const br = Math.max(0.4, r * 0.12) * kx * (FX_BUBBLE_PX / (FX_BUBBLE_PX / 2 - 1));
        bub.setPosition(wx + bl * c - bm * s, wy + bl * s + bm * c).setDisplaySize(br, br).setDepth(depth + BUBBLE_DZ).setAlpha(alpha * 0.55 * Math.sin(ph * Math.PI)).setVisible(true);
      }
    }
    b.shown = count;
  }

  /**
   * One Spitter in slot `slot` (< maxSpitters): drips from its mouth (`mouth` in radii along the facing), pose
   * `x, y, rot`, radius `rM` (m), zombie `id` (the deterministic jitter), time `t` (s, with the zombie's offset).
   */
  spitter(slot: number, id: number, x: number, y: number, rot: number, rM: number, mouthX: number, mouthY: number, depth: number, alpha: number, t: number): void {
    let sp = this.spitters[slot];
    if (!sp) {
      sp = { drops: [], n: new Float64Array(DRIPS).fill(-1), wx: new Float32Array(DRIPS), wy: new Float32Array(DRIPS), used: false };
      for (let i = 0; i < DRIPS; i++) sp.drops.push(this.image(FX_DRIP, 0, true));
      this.spitters[slot] = sp;
    }
    sp.used = true;
    const u = rM / PAGE_PX_PER_R; // m per page px
    const c = Math.cos(rot);
    const s = Math.sin(rot);
    const last = Math.floor(t / DRIP_EVERY_S);
    const pic = FX_DRIP_PX / (FX_DRIP_PX / 2 - 1); // display size per radius
    for (let j = 0; j < DRIPS; j++) {
      const nIdx = last - j;
      const img = sp.drops[nIdx - Math.floor(nIdx / DRIPS) * DRIPS] as Phaser.GameObjects.Image;
      const slotI = nIdx - Math.floor(nIdx / DRIPS) * DRIPS;
      const age = t - nIdx * DRIP_EVERY_S;
      if (age < 0 || age > DRIP_LIFE_S) {
        img.setVisible(false);
        continue;
      }
      const jx = (hash01(id, nIdx) - 0.5) * 6;
      const jy = (hash01(id + 7919, nIdx) - 0.5) * 6;
      const px = mouthX * PAGE_PX_PER_R + jx;
      const py = mouthY * PAGE_PX_PER_R + jy;
      const fall = Math.min(1, age / DRIP_FALL_S);
      if (fall < 1) {
        sp.n[slotI] = -1;
        const lx = (px + fall * 6) * u;
        const ly = py * u;
        img.setPosition(x + lx * c - ly * s, y + lx * s + ly * c).setRotation(rot).setDisplaySize(2.5 * u * pic, 3.5 * u * pic).setAlpha(alpha * 0.9);
      } else {
        if (sp.n[slotI] !== nIdx) {
          // landed: the puddle stays where it fell (world space)
          sp.n[slotI] = nIdx;
          const lx = (px + 6) * u;
          const ly = py * u;
          sp.wx[slotI] = x + lx * c - ly * s;
          sp.wy[slotI] = y + lx * s + ly * c;
        }
        const a = age - DRIP_FALL_S;
        img.setPosition(sp.wx[slotI] as number, sp.wy[slotI] as number).setRotation(0).setDisplaySize((3 + a * 5) * u * pic, (2.2 + a * 3.5) * u * pic).setAlpha(alpha * Math.max(0, 0.6 - a * 0.3));
      }
      img.setDepth(depth + DRIP_DZ).setVisible(true);
    }
  }

  /** Hides the slots not used this frame. */
  end(): void {
    for (const b of this.bloaters) {
      if (!b || b.used) continue;
      if (b.veins[0].visible) {
        b.veins[0].setVisible(false);
        b.veins[1].setVisible(false);
      }
      if (b.shown > 0) {
        for (let i = 0; i < b.shown; i++) {
          (b.sacs[i] as Phaser.GameObjects.Image).setVisible(false);
          (b.halos[i] as Phaser.GameObjects.Image).setVisible(false);
          for (let k = 0; k < BUBBLES; k++) (b.bubbles[i * BUBBLES + k] as Phaser.GameObjects.Image).setVisible(false);
        }
        b.shown = 0;
      }
    }
    for (const sp of this.spitters) {
      if (!sp || sp.used) continue;
      for (const d of sp.drops) if (d.visible) d.setVisible(false);
      sp.n.fill(-1);
    }
  }

  destroy(): void {
    for (const b of this.bloaters) if (b) for (const i of [...b.veins, ...b.sacs, ...b.halos, ...b.bubbles]) i.destroy();
    for (const s of this.spitters) if (s) for (const i of s.drops) i.destroy();
    this.bloaters.fill(undefined);
    this.spitters.fill(undefined);
  }
}
