import * as Phaser from "phaser";
import { SILHOUETTE_SURVIVOR, SILHOUETTE_ZOMBIE, behindAnyWall, silhouetteAlpha, type WallPic } from "./wallSilhouette";
import { ABOVE_STANDING_DEPTH } from "./barricadeLook";

/**
 * Designer pick C (2026-11-25): the hidden part of a body behind a standing wall glows through it (`wallSilhouette.ts`).
 * Each frame: the bodies behind a wall get a pooled copy of their sprite, filled red (zombie) or blue (survivor), on a
 * layer just above the walls; the layer is masked by copies of the wall pictures (a container that is never drawn
 * itself), so a silhouette only shows where a wall really covers the body. When nobody is behind a wall the layer is
 * hidden and the mask isn't rendered at all.
 */
export interface SilhouetteBody {
  readonly img: Phaser.GameObjects.Image;
  readonly zombie: boolean;
  /** Body radius (m). */
  readonly r: number;
}

/** Above the walls (and their selection outline), under the heal plus (11) and the darkness (11.7). */
const SILHOUETTE_DEPTH = ABOVE_STANDING_DEPTH + 0.01;

export class WallSilhouetteView {
  private readonly layer: Phaser.GameObjects.Layer;
  private readonly maskWalls: Phaser.GameObjects.Container;
  private readonly sils: Phaser.GameObjects.Image[] = [];
  private readonly maskPics: Phaser.GameObjects.Image[] = [];
  private readonly pics: WallPic[] = [];
  /** How many silhouettes were shown last frame (tests and checks read it). */
  shown = 0;

  constructor(private readonly scene: Phaser.Scene) {
    this.layer = scene.add.layer().setDepth(SILHOUETTE_DEPTH).setVisible(false);
    this.maskWalls = scene.make.container({ x: 0, y: 0 }, false);
    this.layer.enableFilters();
    this.layer.filters?.external.addMask(this.maskWalls);
  }

  /** `walls`: the standing wall and corner sprites on screen; `bodies`: every drawn body (zombies and survivors). */
  update(walls: readonly Phaser.GameObjects.Image[], bodies: readonly SilhouetteBody[], nowMs: number): void {
    let nw = 0;
    for (const w of walls) {
      if (!w.visible) continue;
      let p = this.pics[nw];
      if (!p) {
        p = { x0: 0, y0: 0, x1: 0, y1: 0, baseY: 0 };
        this.pics.push(p);
      }
      p.x0 = w.x - w.originX * w.displayWidth;
      p.x1 = p.x0 + w.displayWidth;
      p.y0 = w.y - w.originY * w.displayHeight;
      p.y1 = p.y0 + w.displayHeight;
      p.baseY = w.y;
      nw++;
    }
    let n = 0;
    if (nw > 0) {
      for (const b of bodies) {
        const img = b.img;
        if (!img.visible || !behindAnyWall(img.x, img.y, b.r, this.pics, nw)) continue;
        let s = this.sils[n];
        if (!s) {
          s = new Phaser.GameObjects.Image(this.scene, 0, 0, img.texture.key, img.frame.name);
          this.layer.add(s);
          this.sils.push(s);
        }
        if (s.texture.key !== img.texture.key || s.frame.name !== img.frame.name) s.setTexture(img.texture.key, img.frame.name);
        s.setOrigin(img.originX, img.originY)
          .setPosition(img.x, img.y)
          .setRotation(img.rotation)
          .setDisplaySize(img.displayWidth, img.displayHeight)
          .setTint(b.zombie ? SILHOUETTE_ZOMBIE : SILHOUETTE_SURVIVOR)
          .setTintMode(Phaser.TintModes.FILL)
          .setVisible(true);
        n++;
      }
    }
    for (let i = n; i < this.sils.length; i++) (this.sils[i] as Phaser.GameObjects.Image).setVisible(false);
    this.shown = n;
    if (n === 0) {
      if (this.layer.visible) this.layer.setVisible(false);
      return;
    }
    // the mask: the walls' own pictures (their alpha) where they stand now
    let m = 0;
    for (const w of walls) {
      if (!w.visible) continue;
      let c = this.maskPics[m];
      if (!c) {
        c = new Phaser.GameObjects.Image(this.scene, 0, 0, w.texture.key, w.frame.name);
        this.maskWalls.add(c);
        this.maskPics.push(c);
      }
      if (c.texture.key !== w.texture.key || c.frame.name !== w.frame.name) c.setTexture(w.texture.key, w.frame.name);
      c.setOrigin(w.originX, w.originY).setPosition(w.x, w.y).setDisplaySize(w.displayWidth, w.displayHeight).setVisible(true);
      m++;
    }
    for (let i = m; i < this.maskPics.length; i++) (this.maskPics[i] as Phaser.GameObjects.Image).setVisible(false);
    this.layer.setAlpha(silhouetteAlpha(nowMs / 1000)).setVisible(true);
  }

  destroy(): void {
    this.layer.destroy();
    this.maskWalls.destroy();
    this.sils.length = 0;
    this.maskPics.length = 0;
  }
}
