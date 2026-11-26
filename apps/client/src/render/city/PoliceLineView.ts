import type * as Phaser from "phaser";
import { standDepth } from "../barricadeLook";
import { ATLAS_DOWNTOWN } from "./spriteAtlas";
import type { PolicePiece } from "./streetPropsFrames";

/**
 * Story 9.14 (AC 4): the sawhorse police lines stand. A small pool of images on the downtown atlas shows the pieces the
 * city bake no longer draws (`drawCity.ts › policePieces`), sorted like the 9.11 standing barricades (`standDepth`):
 * above the bodies, nearer the camera over farther; a drum just over the pieces it stands on (`PolicePiece.sortY`).
 * Placed once per city bake (stage change), never per frame. `sprites()` feeds the 9.12 silhouettes (GameScene).
 */
/** Depth step between pieces of one line (later pieces over earlier ones; ≪ the lift) and the drums' lift. */
const ROW_EPS = 1e-6;
const DRUM_LIFT = 1e-4;

export class PoliceLineView {
  private readonly pool: Phaser.GameObjects.Image[] = [];
  /** The images in use (a prefix of the pool, kept as its own array for the silhouettes: no copy per frame). */
  private readonly shown: Phaser.GameObjects.Image[] = [];

  constructor(private readonly scene: Phaser.Scene) {}

  show(pieces: readonly PolicePiece[]): void {
    this.shown.length = 0;
    pieces.forEach((p, i) => {
      let img = this.pool[i];
      if (!img) {
        img = this.scene.add.image(0, 0, ATLAS_DOWNTOWN, p.frame);
        this.pool.push(img);
      }
      img
        .setFrame(p.frame)
        .setOrigin(p.originX, p.originY)
        .setPosition(p.x, p.y)
        .setDisplaySize(p.wM, p.hM)
        .setDepth(standDepth(p.sortY) + (p.drum ? DRUM_LIFT : 0) + p.order * ROW_EPS) // review M2: per line
        .setVisible(true);
      this.shown.push(img);
    });
    for (let i = pieces.length; i < this.pool.length; i++) (this.pool[i] as Phaser.GameObjects.Image).setVisible(false);
  }

  /** The standing police images in use (read-only; the same array every frame). */
  sprites(): readonly Phaser.GameObjects.Image[] {
    return this.shown;
  }

  destroy(): void {
    for (const img of this.pool) img.destroy();
    this.pool.length = 0;
    this.shown.length = 0;
  }
}
