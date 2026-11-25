/**
 * Story 9.13 (AC 3): the characters' relit pictures, baked off the main thread. The main thread
 * (`charactersAtlas.ts › sendToWorker`) posts `{ gen, frames, bodies }`; the worker bakes the survivor bodies first
 * (a body asked for while frames are queued jumps the queue), then each frame (the same `charFrameSteps` /
 * `bodyBakeSteps` the main-thread fallback runs, on OffscreenCanvases), one task per macrotask so new messages get
 * in, and posts each picture back as transferred ImageBitmaps with its animation data. No Phaser, no DOM.
 */
import { bodyBakeSteps, charArt, charFrameSteps } from "./charactersFrames";
import { freeCanvas, setCanvasRecycler } from "./canvasRecycle";
import type { CharWorkerJob } from "./charactersAtlas";
import type { ResolvedLook } from "./survivorLook";

interface WorkerScope {
  onmessage: ((e: MessageEvent<CharWorkerJob>) => void) | null;
  postMessage(message: unknown, transfer: Transferable[]): void;
}
const scope = self as unknown as WorkerScope;
/**
 * B17: the bake's canvases are CPU-backed (`willReadFrequently`) and REUSED (a pool per size, reset between uses), and
 * the pictures go back as pixels (`ImageData`, its buffer transferred), not ImageBitmaps: in a running game a new
 * canvas's first readback and every `transferToImageBitmap` wait for the GPU process, which is busy drawing the game
 * (measured headless: ~60 ms each, ~7 pictures/s instead of ~50).
 */
const pool = new Map<string, OffscreenCanvas[]>();
const resettable = typeof OffscreenCanvasRenderingContext2D !== "undefined" && "reset" in OffscreenCanvasRenderingContext2D.prototype;
const make = (w: number, h: number): HTMLCanvasElement => {
  const W = Math.max(1, w);
  const H = Math.max(1, h);
  const c = resettable ? pool.get(`${W}x${H}`)?.pop() : undefined;
  if (c) {
    (c.getContext("2d") as OffscreenCanvasRenderingContext2D).reset();
    return c as unknown as HTMLCanvasElement;
  }
  const n = new OffscreenCanvas(W, H);
  (n.getContext("2d", { willReadFrequently: true }) as OffscreenCanvasRenderingContext2D).getImageData(0, 0, 1, 1); // pay the first readback once
  return n as unknown as HTMLCanvasElement;
};
setCanvasRecycler((c) => {
  if (!resettable || c.width === 0) return;
  const k = `${c.width}x${c.height}`;
  const list = pool.get(k) ?? [];
  if (list.length < 8) list.push(c as unknown as OffscreenCanvas);
  pool.set(k, list);
});
/** A picture as pixels; its canvas goes back to the pool. */
function pixels(c: HTMLCanvasElement | null, tr: Transferable[]): ImageData | null {
  if (!c) return null;
  const d = (c.getContext("2d") as CanvasRenderingContext2D).getImageData(0, 0, c.width, c.height);
  freeCanvas(c);
  tr.push(d.data.buffer);
  return d;
}

type Task = { gen: number; frame: string; plain: boolean } | { gen: number; body: { id: number; key: string; look: ResolvedLook } };
const tasks: Task[] = [];
let running = false;

function run<T>(g: Generator<number, T, void>): T {
  let s = g.next();
  while (!s.done) s = g.next();
  return s.value;
}

function next(): void {
  const t = tasks.shift();
  if (!t) {
    running = false;
    return;
  }
  if ("body" in t) {
    const p = run(bodyBakeSteps(t.body.look, true, make));
    const q = run(bodyBakeSteps(t.body.look, false, make));
    const tr: Transferable[] = [];
    const pack = pixels(p.base, tr);
    const nopack = pixels(q.base, tr);
    const sheenPack = pixels(p.sheen, tr);
    const sheenNopack = pixels(q.sheen, tr);
    scope.postMessage({ gen: t.gen, kind: "body", id: t.body.id, pack, nopack, sheenPack, sheenNopack }, tr);
  } else {
    const a = charArt(t.frame);
    if (a) {
      const r = run(charFrameSteps(a, make, t.plain));
      const tr: Transferable[] = [];
      const base = pixels(r.base, tr);
      const glow = pixels(r.glow, tr);
      const sheen = pixels(r.sheen, tr);
      const veins = pixels(r.veins, tr);
      scope.postMessage({ gen: t.gen, kind: "frame", frame: t.frame, plain: t.plain, base, glow, sheen, veins, bloater: r.bloater }, tr);
    }
  }
  setTimeout(next, 0);
}

scope.onmessage = (e) => {
  const { gen, frames, bodies } = e.data;
  // a newer generation (a re-bake after a lost cache) drops what's left of the older one
  for (let i = tasks.length - 1; i >= 0; i--) if ((tasks[i] as Task).gen < gen) tasks.splice(i, 1);
  for (let i = bodies.length - 1; i >= 0; i--) {
    const b = bodies[i] as { id: number; key: string; look: ResolvedLook };
    for (let j = tasks.length - 1; j >= 0; j--) {
      const t = tasks[j] as Task;
      if ("body" in t && t.body.key === b.key) tasks.splice(j, 1); // an older request for the same body
    }
    tasks.unshift({ gen, body: b });
  }
  for (const f of frames) tasks.push({ gen, frame: f.frame, plain: f.plain });
  if (!running) {
    running = true;
    setTimeout(next, 0);
  }
};
