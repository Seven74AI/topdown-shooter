/**
 * Story 9.15 (AC 2): the Behemoth's relit pictures, baked off the main thread (as `charactersBakeWorker.ts`). The main
 * thread (`bossRelit.ts › sendToWorker`) posts `{ gen, look, jobs }`; the worker runs each job's `bossBakeSteps` on
 * pooled OffscreenCanvases, one job per macrotask so a newer generation (another look) gets in, and posts the pictures
 * back as pixels (`ImageData`, buffers transferred: 9.13 B17). No Phaser, no DOM.
 */
import { bossBakeSteps, bossJobId, type BossJob } from "./bossFrames";
import { freeCanvas, setCanvasRecycler } from "./canvasRecycle";
import type { BossWorkerJob } from "./bossRelit";

interface WorkerScope {
  onmessage: ((e: MessageEvent<BossWorkerJob>) => void) | null;
  postMessage(message: unknown, transfer: Transferable[]): void;
}
const scope = self as unknown as WorkerScope;
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
  if (list.length < 6) list.push(c as unknown as OffscreenCanvas);
  pool.set(k, list);
});
function pixels(c: HTMLCanvasElement | null, tr: Transferable[]): ImageData | null {
  if (!c) return null;
  const d = (c.getContext("2d") as CanvasRenderingContext2D).getImageData(0, 0, c.width, c.height);
  freeCanvas(c);
  tr.push(d.data.buffer);
  return d;
}

const tasks: { gen: number; look: number; job: BossJob }[] = [];
let running = false;

function next(): void {
  const t = tasks.shift();
  if (!t) {
    running = false;
    return;
  }
  const g = bossBakeSteps(t.look, t.job, make);
  let s = g.next();
  while (!s.done) s = g.next();
  const tr: Transferable[] = [];
  const body = pixels(s.value.body, tr);
  const vein = pixels(s.value.vein, tr);
  const sheen = pixels(s.value.sheen, tr);
  scope.postMessage({ gen: t.gen, look: t.look, id: bossJobId(t.job), body, vein, sheen }, tr);
  setTimeout(next, 0);
}

scope.onmessage = (e) => {
  const { gen, look, jobs } = e.data;
  // a newer generation (another look, or a re-bake after a wipe) drops what's left of the older one
  for (let i = tasks.length - 1; i >= 0; i--) if ((tasks[i] as { gen: number }).gen < gen) tasks.splice(i, 1);
  for (const job of jobs) tasks.push({ gen, look, job });
  if (!running) {
    running = true;
    setTimeout(next, 0);
  }
};
