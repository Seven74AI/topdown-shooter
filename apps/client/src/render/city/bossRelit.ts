import type * as Phaser from "phaser";
import { addGeneratedTexture } from "./canvasTexture";
import { textureRegistry } from "../gfx/textureRegistry";
import { SHEEN_STEPS } from "./charRelight";
import { BOSS_SHEEN_SHEET, bossBakeSteps, bossJobId, bossJobs, bossSheetOf, bossSheetSpecs, jobFrames, type BossBaked, type BossJob, type BossSheetSpec } from "./bossFrames";

/**
 * Story 9.15 (AC 2, B1, B2): the Behemoth's relit pictures in the game, as the characters' (9.13 `charactersAtlas.ts`):
 * baked in a Web Worker (`bossBakeWorker.ts`; without one, or one that failed or went silent, the main thread bakes in
 * resumable slices under `BOSS_BAKE_MS_PER_FRAME`), each picture landing into its own small sheet (one re-upload a
 * frame, landing within half the frame's budget). Only ONE look is baked (the one in play, B1): asking for another
 * look starts a new generation and the view falls back to the plain atlas until the new pictures land. A picture is
 * "ready" (`bossRelitReady`) only once its sheet's pixels are on the GPU, so the view never shows a blank frame.
 *
 * Pixels are not kept (B7, unlike 9.13's B18): after a lost context or a wiped canvas the sheets come back empty, their
 * pictures are not ready any more (the plain atlas shows) and the bake runs again for them.
 */

/** Main-thread fallback budget per frame (9.13 B23) and the worker's silence limit (as `charactersAtlas.ts`). */
export const BOSS_BAKE_MS_PER_FRAME = 4;
export const BOSS_WORKER_TIMEOUT_MS = 20_000;

/** What the main thread posts: the jobs of one look. */
export interface BossWorkerJob {
  readonly gen: number;
  readonly look: number;
  readonly jobs: readonly BossJob[];
}
/** What the worker posts back for one job. */
export interface BossWorkerResult {
  readonly gen: number;
  readonly look: number;
  readonly id: string;
  readonly body: ImageData | null;
  readonly vein: ImageData | null;
  readonly sheen: ImageData | null;
}

type Pic = HTMLCanvasElement | ImageData;
interface Arrived {
  readonly job: BossJob;
  readonly body: Pic | null;
  readonly vein: Pic | null;
  readonly sheen: Pic | null;
}
export interface BossSheet {
  readonly spec: BossSheetSpec;
  readonly canvas: HTMLCanvasElement;
  tex: Phaser.Textures.CanvasTexture | null;
  dirty: boolean;
  /** Frames written since the last upload: ready once it is done. */
  readonly pending: string[];
  /** Review L1: the wipe check, set once the first picture lands (reads a known opaque pixel of the canvas). */
  probe: (() => boolean) | null;
}
export interface BossBake {
  /** The look baked (−1: none asked for yet). */
  look: number;
  gen: number;
  queue: BossJob[];
  job: { readonly job: BossJob; readonly steps: Generator<number, BossBaked, void> } | null;
  worker: Worker | null;
  useWorker: boolean;
  inFlight: BossJob[];
  readonly arrived: Arrived[];
  workerDeadline: number;
  lastPump: number;
  readonly sheets: Map<string, BossSheet>;
  /** Frames (bodies, veins, sheen strips) whose pixels are on the GPU. */
  readonly ready: Set<string>;
  /** Nothing left to do after the last pump (cleared by a new look or a wiped sheet). */
  idle: boolean;
  /** Each landed picture's opaque box (sheen: per step frame), for `setCrop`. */
  readonly crops: Map<string, readonly [number, number, number, number]>;
  readonly make: (w: number, h: number) => HTMLCanvasElement;
  /** Makes a sheet (the game's registers a texture; tests pass a plain one). */
  makeSheet: (spec: BossSheetSpec) => BossSheet;
  /** A sheet got its wipe check (the game's registers it with the texture registry). */
  onProbe?: (s: BossSheet) => void;
  readonly stats: { startMs: number; doneMs: number; landed: number; fromWorker: number; onMain: number; maxPumpMs: number; maxLandMs: number; maxSheetMs: number; maxUploadMs: number; worker: boolean };
}

const makeCanvas = (w: number, h: number): HTMLCanvasElement => {
  const c = document.createElement("canvas");
  c.width = Math.max(1, w);
  c.height = Math.max(1, h);
  c.getContext("2d", { willReadFrequently: true });
  return c;
};

/** A bake (tests make it with a node canvas and plain sheets). */
export function newBossBake(make: (w: number, h: number) => HTMLCanvasElement, makeSheet?: (spec: BossSheetSpec) => BossSheet): BossBake {
  return {
    look: -1,
    gen: 0,
    queue: [],
    job: null,
    worker: null,
    useWorker: false,
    inFlight: [],
    arrived: [],
    workerDeadline: 0,
    lastPump: 0,
    sheets: new Map(),
    ready: new Set(),
    idle: false,
    crops: new Map(),
    make,
    makeSheet: makeSheet ?? ((spec) => plainSheet(spec, make)),
    stats: { startMs: 0, doneMs: 0, landed: 0, fromWorker: 0, onMain: 0, maxPumpMs: 0, maxLandMs: 0, maxSheetMs: 0, maxUploadMs: 0, worker: false },
  };
}
function plainSheet(spec: BossSheetSpec, make: (w: number, h: number) => HTMLCanvasElement): BossSheet {
  return { spec, canvas: make(spec.w, spec.h), tex: null, dirty: false, pending: [], probe: null };
}

/** Asks for `look`'s relit pictures. Another look than the one baked starts over (a new generation). */
export function requestBossLookIn(b: BossBake, look: number): void {
  if (look === b.look || look < 0) return;
  b.look = look;
  b.gen++;
  b.ready.clear();
  b.crops.clear();
  b.job?.steps.return({ body: null, vein: null, sheen: null });
  b.job = null;
  b.inFlight = [];
  b.arrived.length = 0;
  for (const s of b.sheets.values()) {
    s.pending.length = 0;
    s.probe = null; // re-review M1: the old look's pixel may be empty in the new one; the next landing sets a fresh one
  }
  b.queue = bossJobs();
  b.idle = false;
  b.stats.startMs = performance.now();
  b.stats.doneMs = 0;
  if (b.useWorker) sendToWorker(b);
}

/** A sheet came back empty (lost context, wiped canvas): its pictures are not ready; their jobs are baked again. */
export function sheetWiped(b: BossBake, key: string): number {
  const s = b.sheets.get(key);
  if (!s || b.look < 0) return 0;
  s.pending.length = 0;
  s.probe = null; // re-review M1: no stale check until its next picture lands
  let n = 0;
  for (const j of bossJobs()) {
    const f = jobFrames(j);
    const hit = [f.body, f.vein, f.sheen].some((x) => x !== null && s.spec.frames.has(x));
    if (!hit) continue;
    for (const x of [f.body, f.vein, f.sheen]) if (x) b.ready.delete(x);
    const id = bossJobId(j);
    if (b.queue.some((q) => bossJobId(q) === id) || b.inFlight.some((q) => bossJobId(q) === id)) continue;
    b.queue.push(j);
    n++;
  }
  if (n > 0) b.idle = false;
  if (n > 0 && b.useWorker) sendToWorker(b);
  return n;
}

function put(b: BossBake, s: BossSheet, name: string, img: ImageData): void {
  const f = s.spec.frames.get(name);
  if (!f) return;
  (s.canvas.getContext("2d") as CanvasRenderingContext2D).putImageData(img, f.x, f.y, 0, 0, Math.min(f.w, img.width), Math.min(f.h, img.height));
  s.dirty = true;
  s.pending.push(name);
  // the opaque box of each picture (a sheen strip: of each step), for the view's crop (B8: no fill of empty margins)
  if (s.spec.key === BOSS_SHEEN_SHEET) for (let k = 0; k < SHEEN_STEPS; k++) b.crops.set(`${name}${k}`, opaqueBox(img, k * f.h, f.h, f.h));
  else b.crops.set(name, opaqueBox(img, 0, f.w, f.h));
  if (!s.probe) setProbe(b, s, f.x, f.y, img);
}

/**
 * Review L1: once a sheet holds a picture, its wipe check reads its most opaque pixel (`textureRegistry.allIntact`:
 * a canvas the browser emptied in the background reads transparent there → the graphics guard rebuilds, `sheetWiped`
 * re-bakes, the plain atlas shows meanwhile). The sheets are registered while empty, so they get it now.
 */
function setProbe(b: BossBake, s: BossSheet, fx: number, fy: number, img: ImageData): void {
  const d = img.data;
  let best = -1;
  let bestA = 0;
  for (let i = 3; i < d.length; i += 4) {
    if ((d[i] as number) <= bestA) continue;
    bestA = d[i] as number;
    best = i >> 2;
    if (bestA === 255) break;
  }
  if (best < 0) return; // an empty picture: the next one sets it
  const x = fx + (best % img.width);
  const y = fy + Math.floor(best / img.width);
  const g = s.canvas.getContext("2d", { willReadFrequently: true }) as CanvasRenderingContext2D;
  s.probe = () => s.canvas.width > 0 && (g.getImageData(x, y, 1, 1).data[3] as number) > 0;
  b.onProbe?.(s);
}
/** The box (x, y, w, h in the picture) of the pixels with any alpha in the `w × h` region at `x0` of `img`. */
export function opaqueBox(img: ImageData, x0: number, w: number, h: number): readonly [number, number, number, number] {
  let minX = w;
  let minY = h;
  let maxX = -1;
  let maxY = -1;
  const W = img.width;
  const d = img.data;
  for (let y = 0; y < h && y < img.height; y++) {
    for (let x = 0; x < w; x++) {
      if ((d[(y * W + x0 + x) * 4 + 3] as number) === 0) continue;
      if (x < minX) minX = x;
      if (x > maxX) maxX = x;
      if (y < minY) minY = y;
      if (y > maxY) maxY = y;
    }
  }
  if (maxX < 0) return [0, 0, 1, 1];
  return [minX, minY, maxX - minX + 1, maxY - minY + 1];
}
const isPixels = (p: Pic): p is ImageData => !("getContext" in p);
function toPixels(p: Pic): ImageData {
  if (isPixels(p)) return p;
  return (p.getContext("2d", { willReadFrequently: true }) as CanvasRenderingContext2D).getImageData(0, 0, p.width, p.height);
}

/** Sheets a landing needs that aren't made yet. */
function missingSheets(b: BossBake, a: Arrived): number {
  const f = jobFrames(a.job);
  let n = 0;
  for (const x of [f.body, f.vein, f.sheen]) {
    if (!x) continue;
    const spec = bossSheetOf(x);
    if (spec && !b.sheets.has(spec.key)) n++;
  }
  return n;
}

/** Writes a job's pictures into their sheets (made on demand). */
function land(b: BossBake, a: Arrived): number {
  const f = jobFrames(a.job);
  let made = 0;
  const pics: [string | null, Pic | null][] = [
    [f.body, a.body],
    [f.vein, a.vein],
    [f.sheen, a.sheen],
  ];
  for (const [name, pic] of pics) {
    if (!name || !pic) continue;
    const spec = bossSheetOf(name);
    if (!spec) continue;
    let s = b.sheets.get(spec.key);
    if (!s) {
      s = b.makeSheet(spec); // (made by the pump before any landing; kept for safety)
      b.sheets.set(spec.key, s);
      made++;
    }
    put(b, s, name, toPixels(pic));
  }
  for (const [, pic] of pics) if (pic && !isPixels(pic)) pic.width = 0;
  b.stats.landed++;
  return made;
}

/**
 * Advances the bake (once per frame): lands the pictures that arrived within half the budget (at least one), bakes on
 * the main thread without a worker, then uploads one dirty sheet and marks its pictures ready. True while busy.
 */
export function pumpBossBakeIn(b: BossBake, budgetMs: number, now: () => number = () => performance.now()): boolean {
  if (b.look < 0) return false;
  // review N1: the bake is over and nothing came back: nothing to walk (no iterator per frame)
  if (b.idle && b.queue.length === 0 && b.job === null && b.inFlight.length === 0 && b.arrived.length === 0) return false;
  const t0 = now();
  // the sheets are made first, one a frame and nothing else that frame (making one is a GPU upload: 9.13 review M3);
  // the worker keeps baking meanwhile and its pictures wait in `arrived`
  if (b.sheets.size < bossSheetSpecs().length) {
    for (const spec of bossSheetSpecs()) {
      if (b.sheets.has(spec.key)) continue;
      b.sheets.set(spec.key, b.makeSheet(spec));
      break;
    }
    b.stats.maxSheetMs = Math.max(b.stats.maxSheetMs, now() - t0);
    if (b.useWorker && b.queue.length > 0) sendToWorker(b);
    return true;
  }
  let uploads = 0;
  let landedNow = 0;
  // at least one landing a frame, more within half the budget; one GPU upload a frame (a new sheet is one)
  while (b.arrived.length > 0 && (landedNow === 0 || now() - t0 < budgetMs / 2)) {
    const a = b.arrived[0] as Arrived;
    if (uploads > 0 && missingSheets(b, a) > 0) break;
    b.arrived.shift();
    uploads += land(b, a);
    landedNow++;
  }
  b.stats.maxLandMs = Math.max(b.stats.maxLandMs, now() - t0);
  if (b.lastPump > 0 && t0 - b.lastPump > 1000) b.workerDeadline += t0 - b.lastPump; // a frozen tab isn't a silent worker
  b.lastPump = t0;
  if (b.worker) {
    if (b.inFlight.length > 0 && t0 > b.workerDeadline) workerFailed(b);
    else if (b.inFlight.length === 0 && b.queue.length === 0) {
      b.worker.terminate();
      b.worker = null;
    } else if (b.queue.length > 0) sendToWorker(b);
  } else if (b.useWorker && b.queue.length > 0) sendToWorker(b);
  if (!b.worker && !(b.useWorker && b.inFlight.length > 0)) {
    const t1 = now();
    while (b.job || b.queue.length > 0) {
      if (!b.job) {
        const job = b.queue.shift() as BossJob;
        b.job = { job, steps: bossBakeSteps(b.look, job, b.make) };
      }
      const st = b.job.steps.next();
      if (st.done) {
        b.arrived.push({ job: b.job.job, ...st.value });
        b.job = null;
        b.stats.onMain++;
      }
      if (now() - t1 >= budgetMs) break;
    }
  }
  if (uploads === 0) {
    for (const s of b.sheets.values()) {
      if (!s.dirty) continue;
      s.dirty = false;
      const tu = now();
      s.tex?.refresh();
      b.stats.maxUploadMs = Math.max(b.stats.maxUploadMs, now() - tu);
      for (const n of s.pending.splice(0)) b.ready.add(n);
      break;
    }
  }
  let dirty = false;
  for (const s of b.sheets.values()) if (s.dirty || s.pending.length > 0) dirty = true;
  const busy = dirty || b.job !== null || b.queue.length > 0 || b.inFlight.length > 0 || b.arrived.length > 0;
  b.idle = !busy && b.worker === null;
  if (!busy && b.stats.doneMs === 0 && b.stats.landed > 0) b.stats.doneMs = now();
  b.stats.maxPumpMs = Math.max(b.stats.maxPumpMs, now() - t0);
  return busy;
}

function sendToWorker(b: BossBake): void {
  if (b.queue.length === 0) return;
  if (!b.worker) {
    try {
      b.worker = new Worker(new URL("./bossBakeWorker.ts", import.meta.url), { type: "module" });
    } catch {
      b.worker = null;
      b.useWorker = false;
      b.stats.worker = false;
      return;
    }
    b.worker.onmessage = (e: MessageEvent<BossWorkerResult>) => receiveBossWorkerResult(b, e.data);
    b.worker.onerror = () => workerFailed(b);
  }
  const jobs = b.queue;
  b.queue = [];
  b.inFlight.push(...jobs);
  b.workerDeadline = performance.now() + BOSS_WORKER_TIMEOUT_MS;
  const msg: BossWorkerJob = { gen: b.gen, look: b.look, jobs };
  b.worker.postMessage(msg);
}

/** A picture from the worker: kept for the next pump, or (an older generation's) dropped. */
export function receiveBossWorkerResult(b: BossBake, r: BossWorkerResult, now = performance.now()): void {
  b.workerDeadline = now + BOSS_WORKER_TIMEOUT_MS;
  b.stats.fromWorker++;
  if (r.gen !== b.gen || r.look !== b.look) return;
  const i = b.inFlight.findIndex((j) => bossJobId(j) === r.id);
  if (i < 0) return;
  const job = b.inFlight[i] as BossJob;
  b.inFlight.splice(i, 1);
  b.arrived.push({ job, body: r.body, vein: r.vein, sheen: r.sheen });
}

/** The worker failed or went silent: closed; the main thread bakes what it didn't send back. */
export function workerFailed(b: BossBake): void {
  if (b.worker) {
    b.worker.onmessage = null;
    b.worker.onerror = null;
    b.worker.terminate();
  }
  b.worker = null;
  b.useWorker = false;
  b.stats.worker = false;
  b.queue = [...b.inFlight, ...b.queue];
  b.inFlight = [];
}

/* ---------------- the game's bake (one per page; textures outlive scene restarts) ---------------- */

let bake: BossBake | null = null;
let lastPumpFrame = -1;

function workerBakeAvailable(): boolean {
  return typeof Worker !== "undefined" && typeof OffscreenCanvas !== "undefined";
}

/** Makes the game's bake (idempotent). `opts.worker` false: the gallery bakes on the main thread. */
export function ensureBossRelit(scene: Phaser.Scene, opts: { readonly worker?: boolean } = {}): void {
  if (typeof document === "undefined") return; // view tests: no relit pictures (the plain atlas shows)
  if (bake) {
    if (opts.worker === false && bake.useWorker && bake.inFlight.length === 0) bake.useWorker = false;
    return;
  }
  const b = newBossBake(makeCanvas, (spec) => gameSheet(scene, spec, b));
  bake = b;
  if (opts.worker !== false && workerBakeAvailable()) {
    b.useWorker = true;
    b.stats.worker = true;
  }
  (globalThis as { __bossBake?: unknown }).__bossBake = b.stats;
}

/** A relit sheet registered for restores: a repaint after a loss leaves it empty and re-bakes its pictures (B7). */
function gameSheet(scene: Phaser.Scene, spec: BossSheetSpec, b: BossBake): BossSheet {
  const canvas = makeCanvas(spec.w, spec.h);
  let first = true;
  const s: BossSheet = { spec, canvas, tex: null, dirty: false, pending: [], probe: null };
  const existing = scene.textures.exists(spec.key);
  s.tex = existing
    ? null
    : addGeneratedTexture(
        scene,
        spec.key,
        canvas,
        () => {
          if (first) {
            first = false;
            return;
          }
          sheetWiped(b, spec.key);
        },
        (tex) => {
          for (const [name, f] of spec.frames) {
            // a sheen strip: one frame per step (`relitSheenName`)
            if (spec.key === BOSS_SHEEN_SHEET) for (let st = 0; st < SHEEN_STEPS; st++) tex.add(`${name}${st}`, 0, f.x + st * f.h, f.y, f.h, f.h);
            else tex.add(name, 0, f.x, f.y, f.w, f.h);
          }
        },
      );
  // review L1 / re-review M1: one check per sheet, reading whatever probe the sheet has now (none: nothing to check)
  if (s.tex) textureRegistry.setIntactCheck(spec.key, () => s.probe?.() ?? true);
  return s;
}

/** Asks for `look`'s pictures in the game's bake. */
export function requestBossLook(look: number): void {
  if (bake) requestBossLookIn(bake, look);
}
/** The look the game's bake holds (−1: none). */
export function bossRelitLook(): number {
  return bake?.look ?? -1;
}
/** Once per game frame (`BossView.update`). */
export function pumpBossRelit(frame: number): boolean {
  if (!bake || frame === lastPumpFrame) return false;
  lastPumpFrame = frame;
  return pumpBossBakeIn(bake, BOSS_BAKE_MS_PER_FRAME);
}
/** The gallery: bakes everything now. */
export function finishBossRelitNow(): void {
  if (!bake) return;
  bake.useWorker = false;
  for (let i = 0; i < 1000 && pumpBossBakeIn(bake, Number.POSITIVE_INFINITY); i++);
}
/** Frame `name` of the look in play is relit and on the GPU. */
export function bossRelitReady(name: string): boolean {
  return bake?.ready.has(name) ?? false;
}
/** Relit frame `name`'s opaque box (x, y, w, h in the frame), or undefined. */
export function bossRelitCrop(name: string): readonly [number, number, number, number] | undefined {
  return bake?.crops.get(name);
}
/** The texture key holding relit frame `name` (for `setTexture`). */
export function bossRelitKey(name: string): string {
  return bossSheetOf(name)?.key ?? (SHEEN_STEP.test(name) ? BOSS_SHEEN_SHEET : "");
}
/** A sheen step frame (`relitSheenName`: the strip's name + the step) lives in the sheen sheet. */
const SHEEN_STEP = /_sheen\d+$/;
/** The bake's progress (tests, the perf note): ready pictures of all. */
export function bossRelitProgress(): { readonly ready: number; readonly total: number } {
  let total = 0;
  for (const j of bossJobs()) {
    const f = jobFrames(j);
    total += (f.body ? 1 : 0) + (f.vein ? 1 : 0) + (f.sheen ? 1 : 0);
  }
  return { ready: bake?.ready.size ?? 0, total };
}
export function setBossBakeForTests(b: BossBake | null): void {
  bake = b;
  lastPumpFrame = -1;
}
export function bossBakeForTests(): BossBake | null {
  return bake;
}
