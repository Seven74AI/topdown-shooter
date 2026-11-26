/**
 * Page-only stand-in for the game's `render/city/canvasTexture.ts` (swapped in by build.mjs): instead of making a
 * Phaser texture, it keeps the painted canvas and its frame rectangles, so the page shows the game's FX pictures
 * exactly as the game paints them (the "Now" column). Same paint code, no Phaser.
 */
export interface Captured {
  canvas: HTMLCanvasElement;
  frames: Map<string, { x: number; y: number; w: number; h: number }>;
}
export const captured = new Map<string, Captured>();
export const RebuildPhase = { atlas: 0, cache: 1, bake: 2 } as const;
export function addGeneratedTexture(_scene: unknown, key: string, canvas: HTMLCanvasElement, paint: (g: CanvasRenderingContext2D) => void, addFrames?: (tex: never) => void): unknown {
  if (captured.has(key)) return null;
  paint(canvas.getContext("2d") as CanvasRenderingContext2D);
  const frames = new Map<string, { x: number; y: number; w: number; h: number }>();
  const tex = { add: (name: string, _src: number, x: number, y: number, w: number, h: number) => frames.set(name, { x, y, w, h }), refresh: () => {}, key };
  addFrames?.(tex as never);
  captured.set(key, { canvas, frames });
  return tex;
}
export function addCanvasTexture(): null {
  return null;
}
export function releaseCanvas(c: HTMLCanvasElement): void {
  c.width = 0;
  c.height = 0;
}
/** The fake scene the game's `ensure…()` builders get: only `textures.exists` is read on the paths we use. */
export const fakeScene = {
  textures: {
    exists: (k: string): boolean => captured.has(k),
    get: (): never => {
      throw new Error("not on the page");
    },
    remove: (): void => {},
  },
} as never;
/** One captured frame cut out onto its own canvas. */
export function frameCanvas(key: string, name: string): HTMLCanvasElement {
  const a = captured.get(key);
  const f = a?.frames.get(name);
  if (!a || !f) throw new Error(`no frame ${key}/${name}`);
  const c = document.createElement("canvas");
  c.width = f.w;
  c.height = f.h;
  c.getContext("2d")!.drawImage(a.canvas, f.x, f.y, f.w, f.h, 0, 0, f.w, f.h);
  return c;
}
