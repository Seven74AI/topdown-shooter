import * as Phaser from "phaser";
import { coveringWall, silhouetteAlpha, silhouetteCrop, type SilCrop, type WallPic } from "./wallSilhouette";
import { ABOVE_STANDING_DEPTH } from "./barricadeLook";
import { wallOccluderX } from "./city/buildingsFrames";

/**
 * Designer pick C (2026-11-25): the hidden part of a body behind a standing wall glows through it (`wallSilhouette.ts`).
 * Each frame the bodies behind a wall get a pooled copy of their sprite, filled with their colour, cropped to the wall
 * that covers them (review M1: a crop, not a mask filter: no off-screen pass) and turned to the nearest quarter turn so
 * the crop is exact. The pool is capped (`controls.fx.maxWallSilhouettes`, review L2) and shrinks when the extra copies
 * have been unused for a while.
 */
export interface SilhouetteBody {
  img: Phaser.GameObjects.Image;
  /** Fill colour: red for zombies, the slot colour for survivors (review L1). */
  color: number;
  /** Body radius (m). */
  r: number;
}

/** Just above the walls, under their selection outline (review N2), the heal plus (11) and the darkness (11.7). */
const SILHOUETTE_DEPTH = ABOVE_STANDING_DEPTH - 0.005;
/** Extra pooled copies are freed after this long unused (ms). */
const SHRINK_AFTER_MS = 5000;

export class WallSilhouetteView {
  private readonly sils: Phaser.GameObjects.Image[] = [];
  private readonly pics: WallPic[] = [];
  private readonly crop: SilCrop = { rotation: 0, x: 0, y: 0, w: 0, h: 0 };
  private readonly geom = { x: 0, y: 0, rotation: 0, displayW: 1, displayH: 1, originX: 0.5, originY: 0.5, frameW: 1, frameH: 1 };
  private lastFullMs = 0;
  /** How many silhouettes were shown last frame (tests and checks read it). */
  shown = 0;

  constructor(
    private readonly scene: Phaser.Scene,
    private readonly cap: number,
  ) {}

  /** The pool's size now (tests). */
  get pooled(): number {
    return this.sils.length;
  }

  /**
   * `walls`: the standing wall and corner sprites on screen; `bodies[0..count)`: the drawn bodies; `dark`: the darkness
   * is up (then nothing shows: the darkness covers the walls' bodies, survivors are drawn above it).
   */
  update(walls: readonly Phaser.GameObjects.Image[], bodies: readonly SilhouetteBody[], count: number, nowMs: number, dark: boolean): void {
    let n = 0;
    if (!dark && walls.length > 0) {
      let nw = 0;
      for (const w of walls) {
        if (!w.visible) continue;
        let p = this.pics[nw];
        if (!p) {
          p = { x0: 0, y0: 0, x1: 0, y1: 0, baseY: 0 };
          this.pics.push(p);
        }
        // only the part of the picture that is solid wall (a side wall's strip, a corner's post: review L3)
        const left = w.x - w.originX * w.displayWidth;
        const oc = wallOccluderX(w.frame.name);
        p.x0 = left + (oc ? oc[0] : 0) * w.displayWidth;
        p.x1 = left + (oc ? oc[1] : 1) * w.displayWidth;
        p.y0 = w.y - w.originY * w.displayHeight;
        p.y1 = p.y0 + w.displayHeight;
        p.baseY = w.y;
        nw++;
      }
      const alpha = silhouetteAlpha(nowMs / 1000);
      for (let i = 0; i < count && n < this.cap; i++) {
        const b = bodies[i] as SilhouetteBody;
        const img = b.img;
        if (!img.visible) continue;
        const wi = coveringWall(img.x, img.y, b.r, this.pics, nw);
        if (wi < 0) continue;
        const g = this.geom;
        g.x = img.x;
        g.y = img.y;
        g.rotation = img.rotation;
        g.displayW = img.displayWidth;
        g.displayH = img.displayHeight;
        g.originX = img.originX;
        g.originY = img.originY;
        g.frameW = img.frame.width;
        g.frameH = img.frame.height;
        const c = silhouetteCrop(g, this.pics[wi] as WallPic, this.crop);
        if (!c) continue;
        let s = this.sils[n];
        if (!s) {
          s = this.scene.add.image(0, 0, img.texture.key, img.frame.name).setDepth(SILHOUETTE_DEPTH).setTintMode(Phaser.TintModes.FILL);
          this.sils.push(s);
        }
        if (s.texture.key !== img.texture.key || s.frame.name !== img.frame.name) s.setTexture(img.texture.key, img.frame.name);
        s.setOrigin(img.originX, img.originY)
          .setPosition(img.x, img.y)
          .setRotation(c.rotation)
          .setDisplaySize(img.displayWidth, img.displayHeight)
          .setCrop(c.x, c.y, c.w, c.h)
          .setTint(b.color)
          .setAlpha(alpha)
          .setVisible(true);
        n++;
      }
    }
    for (let i = n; i < this.sils.length; i++) {
      const s = this.sils[i] as Phaser.GameObjects.Image;
      if (s.visible) s.setVisible(false);
    }
    // review L2: the pool shrinks back when its extra copies have been idle a while
    if (n >= this.sils.length) this.lastFullMs = nowMs;
    else if (nowMs - this.lastFullMs > SHRINK_AFTER_MS) {
      for (const s of this.sils.splice(n)) s.destroy();
      this.lastFullMs = nowMs;
    }
    this.shown = n;
  }

  destroy(): void {
    for (const s of this.sils) s.destroy();
    this.sils.length = 0;
  }
}
