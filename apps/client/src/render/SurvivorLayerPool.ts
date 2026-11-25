import type * as Phaser from "phaser";
import { ANIMATED_LAYERS, type AnimatedLayerId } from "@topdown/shared";
import { addGeneratedTexture } from "./city/canvasTexture";
import { CHAR_R_PX } from "./city/spriteAtlas";
import { SURVIVOR_LAYERS, layerTextureKey } from "./city/survivorLayers";

/** At most one survivor per lobby slot wears a given layer: 4 sprites per layer cover every run. */
export const LAYER_POOL_SIZE = 4;

/**
 * Story 7.8 (designer 2026-11-24): the sprites of animated part layers (the spinning propeller first). Each layer's
 * texture is drawn once through `addGeneratedTexture` (repainted after a lost context, brief 20); `LAYER_POOL_SIZE`
 * images per layer are made up front, hidden, and handed out to survivor views. Nothing is created per frame.
 */
export class SurvivorLayerPool {
  private readonly free = new Map<AnimatedLayerId, Phaser.GameObjects.Image[]>();

  constructor(
    scene: Phaser.Scene,
    makeCanvas: () => HTMLCanvasElement = () => document.createElement("canvas"),
  ) {
    for (const id of ANIMATED_LAYERS) {
      const L = SURVIVOR_LAYERS[id];
      const side = Math.ceil(2 * L.extentR * CHAR_R_PX);
      const key = layerTextureKey(id);
      if (!scene.textures.exists(key)) {
        const canvas = makeCanvas();
        canvas.width = side;
        canvas.height = side;
        addGeneratedTexture(scene, key, canvas, (g) => {
          g.save();
          g.translate(side / 2, side / 2);
          L.draw(g, CHAR_R_PX);
          g.restore();
        });
      }
      const imgs: Phaser.GameObjects.Image[] = [];
      for (let i = 0; i < LAYER_POOL_SIZE; i++) imgs.push(scene.add.image(0, 0, key).setVisible(false));
      this.free.set(id, imgs);
    }
  }

  /** A free sprite for `id`, or null when all are in use. */
  acquire(id: AnimatedLayerId): Phaser.GameObjects.Image | null {
    return this.free.get(id)?.pop() ?? null;
  }

  /** Gives a sprite back (hidden). */
  release(id: AnimatedLayerId, img: Phaser.GameObjects.Image): void {
    img.setVisible(false).setAlpha(1).setTint(0xffffff); // Story 7.9 re-review RR1: no faded / tinted sprite for the next wearer
    this.free.get(id)?.push(img);
  }

  /** Sprites still free for `id` (tests). */
  available(id: AnimatedLayerId): number {
    return this.free.get(id)?.length ?? 0;
  }
}
