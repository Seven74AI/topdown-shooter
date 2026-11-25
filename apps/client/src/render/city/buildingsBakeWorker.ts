/**
 * Review R1/R2 (asset art review 2026-11-25): the buildings atlas's relit pictures, baked off the main thread. The
 * main thread (`buildingsAtlas.ts › sendToWorker`) posts `{ gen, frames }`; for each frame this relights the code
 * drawing on OffscreenCanvases (the same `bakeSteps` the main-thread fallback runs) and posts the picture back as an
 * ImageBitmap (transferred), with its glow layer and animation data. No Phaser, no DOM.
 */
import { bakeSteps, relitSpecs } from "./buildingsFrames";

interface Job {
  readonly gen: number;
  readonly frames: readonly string[];
}
interface WorkerScope {
  onmessage: ((e: MessageEvent<Job>) => void) | null;
  postMessage(message: unknown, transfer: Transferable[]): void;
}
const scope = self as unknown as WorkerScope;
const make = (w: number, h: number): HTMLCanvasElement => new OffscreenCanvas(Math.max(1, w), Math.max(1, h)) as unknown as HTMLCanvasElement;

scope.onmessage = (e) => {
  const { gen, frames } = e.data;
  for (const name of frames) {
    const a = relitSpecs().find((x) => x.frame === name);
    if (!a) continue;
    const steps = bakeSteps(a, make);
    let s = steps.next();
    while (!s.done) s = steps.next();
    const r = s.value;
    const base = (r.base as unknown as OffscreenCanvas).transferToImageBitmap();
    const bloom = r.bloom ? (r.bloom as unknown as OffscreenCanvas).transferToImageBitmap() : null;
    scope.postMessage({ gen, frame: name, base, bloom, glowAt: r.glowAt, spots: r.spots }, bloom ? [base, bloom] : [base]);
  }
};
