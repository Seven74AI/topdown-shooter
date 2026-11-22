import type * as Phaser from "phaser";

/**
 * Story 4.9 review (M memory): `textures.addCanvas` makes a `CanvasTexture`, whose constructor keeps a
 * full `getImageData` copy of the canvas (`imageData`, `data`, `pixels`, `buffer`) for pixel access
 * we never use; `refresh()` only re-uploads the canvas (it never reads that copy, Phaser 4.2.1
 * `CanvasTexture.js`). Dropping the copy saves w × h × 4 bytes per texture (8.6 MB per 1272 × 1696
 * tile). Do not call `CanvasTexture.update()` / `getPixel()` on these textures.
 */
export function addCanvasTexture(scene: Phaser.Scene, key: string, canvas: HTMLCanvasElement): Phaser.Textures.CanvasTexture | null {
  const tex = scene.textures.addCanvas(key, canvas);
  if (tex) {
    const t = tex as unknown as { imageData: unknown; data: unknown; pixels: unknown; buffer: unknown };
    t.imageData = null;
    t.data = null;
    t.pixels = null;
    t.buffer = null;
  }
  return tex;
}

/** Lets the browser free a canvas's pixels at once (Safari keeps them until the size is 0). */
export function releaseCanvas(canvas: HTMLCanvasElement): void {
  canvas.width = 0;
  canvas.height = 0;
}
