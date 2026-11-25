import type * as Phaser from "phaser";
import type { ZombieTypeId } from "@topdown/shared";
import { packAtlas, type PlacedFrame } from "./atlasLayout";
import { addGeneratedTexture } from "./canvasTexture";
import { RebuildPhase, textureRegistry } from "../gfx/textureRegistry";
import { VEIN_STEPS, type BloaterFxData } from "./charBloaterFx";
import { SHEEN_STEPS, sheenSide } from "./charRelight";
import {
  CHAR_PX_PER_R,
  LOOP_FRAMES,
  bodyBakeSteps,
  charArt,
  charArts,
  charFrameSteps,
  charSheetSpecs,
  charSheets,
  drawCentred,
  frameSide,
  glowFrame,
  isLoopType,
  isWaveOneFrame,
  sheenFrame,
  sheetOf,
  veinFrame,
  veinSheetOf,
  walkFrame,
  type CharArt,
  type CharBaked,
  type LoopType,
} from "./charactersFrames";
import type { ResolvedLook } from "./survivorLook";

export * from "./charactersFrames";

/**
 * Story 9.13 (AC 3, B1, B10): the characters' relit pictures, baked at load in a Web Worker (`charactersBakeWorker.ts`,
 * OffscreenCanvas) like the 9.11 buildings: the sheets start with the plain drawings (copied from `atlas_characters`,
 * so the start costs no drawing), each relit picture lands into its own small sheet (one re-upload), the views switch
 * layers on as pictures land. Without a worker (no Worker/OffscreenCanvas, or one that failed or went silent) the main
 * thread bakes in resumable slices under `BAKE_MS_PER_FRAME`. Kept pictures are CPU-backed with a sentinel pixel: a
 * graphics restore repaints them, and re-bakes only if they were wiped. Survivor bodies (Story 7.9's per-player
 * pictures) go through the same worker, ahead of the atlas frames.
 */

/** Character sheets are packed at most this wide (B13: tighter sheets, smaller re-uploads than 2048-wide rows). */
export const CHAR_SHEET_PX = 512;
/** Small additive / sprite pictures the views pool (`CharacterFxView`, the drips and sacs). */
export const TEX_CHAR_FX = "chars_fx";
export const FX_SAC = "fx_sac_a";
export const FX_SAC_HALO = "fx_sachalo_a";
export const FX_BUBBLE = "fx_bubble_a";
export const FX_DRIP = "fx_drip_a";
/** px of the sac picture (a unit circle of radius `FX_SAC_PX / 2 − 1`). */
export const FX_SAC_PX = 48;
export const FX_SAC_HALO_PX = 64;
export const FX_BUBBLE_PX = 12;
export const FX_DRIP_PX = 16;

/** A landed picture, kept as pixels (CPU memory: a lost graphics context or an Android wipe can't empty it, B18). */
interface Kept {
  readonly base: ImageData;
  readonly glow: ImageData | null;
  readonly sheen: ImageData | null;
  readonly veins: ImageData | null;
  readonly sentinel: readonly [number, number] | null;
  readonly plain: boolean;
}
/** What a landed primary frame gives the views. */
export interface CharFx {
  readonly glow: boolean;
  readonly sheen: boolean;
  readonly bloater: BloaterFxData | null;
}
const kept = new Map<string, Kept>();
const FX = new Map<string, CharFx>();
/** Relit walk pictures landed per look (`sheet`): the loop plays once all `LOOP_FRAMES` are in (B10). */
const loopLanded = new Map<string, Set<number>>();
/** The animation data of a landed (relit) primary frame, or undefined (plain: no layers yet). */
export function charFx(frame: string): CharFx | undefined {
  return FX.get(frame);
}
/** Every relit picture of a loop look is in: the view may crossfade its 10 pictures. */
const LOOP_SHEETS: Readonly<Record<LoopType, readonly string[]>> = {
  walker: [0, 1, 2, 3].map((v) => sheetOf("walker", v)),
  runner: [0, 1].map((v) => sheetOf("runner", v)),
  crawler: [0, 1].map((v) => sheetOf("crawler", v)),
};
export function loopReady(type: LoopType, v: number): boolean {
  const sheets = LOOP_SHEETS[type];
  return (loopLanded.get(sheets[v % sheets.length] as string)?.size ?? 0) >= LOOP_FRAMES; // built once: no string per frame
}
/** How far the bake is (tests, the perf note). */
export function charBakeProgress(): { readonly landed: number; readonly total: number } {
  let landed = 0;
  for (const k of kept.values()) if (!k.plain) landed++;
  return { landed, total: charArts().length };
}

/** CPU-backed canvases for the bake and the kept pictures (B17: readbacks don't wait for the GPU; Android doesn't empty them). */
const makeCanvas = (w: number, h: number): HTMLCanvasElement => {
  const c = document.createElement("canvas");
  c.width = Math.max(1, w);
  c.height = Math.max(1, h);
  c.getContext("2d", { willReadFrequently: true });
  return c;
};
/** A picture from the bake: a canvas (main-thread bake) or pixels (the worker's, B17). */
export type Pic = CanvasImageSource | ImageData;
const isPixels = (p: Pic): p is ImageData => typeof ImageData !== "undefined" ? p instanceof ImageData : "data" in p && !("getContext" in p);
/** A CPU-backed canvas copy of a bake picture (tests and SurvivorLookTextures use it too). */
export function cpuCopy(src: Pic, w: number, h: number, make: (w: number, h: number) => HTMLCanvasElement): HTMLCanvasElement {
  const c = make(w, h);
  const g = c.getContext("2d", { willReadFrequently: true }) as CanvasRenderingContext2D;
  if (isPixels(src)) g.putImageData(src, 0, 0);
  else g.drawImage(src, 0, 0, w, h);
  return c;
}
/** A pixel known to be opaque (the restore check, as 9.11's sentinel). */
function sentinelOf(p: ImageData): readonly [number, number] | null {
  const y = Math.floor(p.height / 2);
  for (let x = 0; x < p.width; x++) if ((p.data[(y * p.width + x) * 4 + 3] as number) > 128) return [x, y];
  return null;
}
/** A bake picture as pixels (the worker's already are; others are read back once). */
export function picPixels(p: Pic, w: number, h: number): ImageData {
  return toPixels(p, w, h, makeCanvas);
}
/** A bake picture as pixels of `w × h` (the worker's are already; the main-thread bake's canvases are read back once). */
function toPixels(p: Pic, w: number, h: number, make: (w: number, h: number) => HTMLCanvasElement): ImageData {
  if (isPixels(p) && p.width === w && p.height === h) return p;
  const c = cpuCopy(p, w, h, make);
  const d = (c.getContext("2d", { willReadFrequently: true }) as CanvasRenderingContext2D).getImageData(0, 0, w, h);
  c.width = 0;
  return d;
}


/** A survivor body bake (Story 7.9's per-player picture), its answer back to `SurvivorLookTextures`. */
export interface BodyJob {
  /** Unique per request (a newer request for the same `key` replaces an older one). */
  readonly id: number;
  /** The caller's body (one per player). */
  readonly key: string;
  readonly look: ResolvedLook;
}
export interface BodyDone {
  readonly pack: Pic;
  readonly nopack: Pic;
  readonly sheenPack: Pic | null;
  readonly sheenNopack: Pic | null;
}
type BodyCb = (d: BodyDone) => void;

/** A finished picture (worker or main thread) on its way into its sheet. */
interface Done {
  readonly frame: string;
  readonly base: Pic;
  readonly glow: Pic | null;
  readonly sheen: Pic | null;
  readonly veins: Pic | null;
  readonly bloater: BloaterFxData | null;
  readonly plain: boolean;
}
interface Sheet {
  readonly key: string;
  readonly canvas: HTMLCanvasElement;
  readonly frames: ReadonlyMap<string, PlacedFrame>;
  tex: Phaser.Textures.CanvasTexture | null;
  dirty: boolean;
}
type Task = { readonly kind: "frame"; readonly frame: string; readonly plain: boolean } | { readonly kind: "body"; readonly body: BodyJob };

export interface CharBake {
  queue: Task[];
  job: { readonly task: Task; readonly steps: Generator<number, unknown, void> } | null;
  readonly make: (w: number, h: number) => HTMLCanvasElement;
  lastUnits: number;
  readonly sheets: Map<string, Sheet>;
  worker: Worker | null;
  inFlight: Task[];
  readonly arrived: Done[];
  readonly bodiesArrived: { readonly id: number; readonly d: BodyDone }[];
  readonly bodyCbs: Map<number, BodyCb>;
  gen: number;
  useWorker: boolean;
  workerDeadline: number;
  lastPump: number;
  /** Nothing in progress after the last pump (the next pump returns at once unless something new came in). */
  idle: boolean;
  /** Stats for the perf note (`window.__charBake`): main-thread max per pump, when the last picture landed. */
  readonly stats: { startMs: number; doneMs: number; maxPumpMs: number; landed: number; worker: boolean; fromWorker: number; onMain: number; waveOneMs: number; maxLandMs: number; maxRefreshMs: number; maxBodyMs: number; maxKeepMs: number };
}
let bake: CharBake | null = null;

/** A worker silent this long after a post (or its last picture) is given up on (as `buildingsAtlas.ts`). */
export const WORKER_TIMEOUT_MS = 20_000;
/** The main-thread fallback's budget per frame: the time guard (the work cap only bounds a frozen clock in tests). */
export const BAKE_UNITS_PER_FRAME = 400_000;
export const BAKE_MS_PER_FRAME = 4;

/** Writes step `k` of `steps` side by side in `img` into frame `name` (raw pixels: no drawing, no new canvas). */
function put(sheet: Sheet, name: string, img: ImageData, k = 0, steps = 1): void {
  const f = sheet.frames.get(name);
  if (!f) return;
  const w = img.width / steps;
  (sheet.canvas.getContext("2d") as CanvasRenderingContext2D).putImageData(img, f.x - k * w, f.y, k * w, 0, Math.min(w, f.w), Math.min(img.height, f.h));
  sheet.dirty = true;
}
function paintKept(sheet: Sheet, frame: string, k: Kept, veinSheet?: Sheet): void {
  put(sheet, frame, k.base);
  if (k.glow) put(sheet, glowFrame(frame), k.glow);
  if (k.sheen) for (let s = 0; s < SHEEN_STEPS; s++) put(sheet, sheenFrame(frame, s), k.sheen, s, SHEEN_STEPS);
  if (k.veins && veinSheet) paintVeins(veinSheet, frame, k.veins);
}
function paintVeins(sheet: Sheet, frame: string, veins: ImageData): void {
  for (let s = 0; s < VEIN_STEPS; s++) put(sheet, veinFrame(frame, s), veins, s, VEIN_STEPS);
}

/** Keeps a finished picture (cache + animation data) and draws it into its sheet. */
function keep(b: CharBake, d: Done): void {
  const a = charArt(d.frame);
  const sheet = a ? b.sheets.get(a.sheet) : undefined;
  if (!a || !sheet) return;
  if (d.plain && kept.get(d.frame)?.plain === false) return; // a relit picture is already in
  const n = frameSide(a.extent);
  const h = sheenSide(n);
  const base = toPixels(d.base, n, n, b.make);
  const glow = d.glow && a.glows ? toPixels(d.glow, n, n, b.make) : null; // a glow the frame list doesn't expect is dropped (a test keeps them in step)
  const sheen = d.sheen ? toPixels(d.sheen, h * SHEEN_STEPS, h, b.make) : null;
  const veins = d.veins ? toPixels(d.veins, n * VEIN_STEPS, n, b.make) : null;
  const k: Kept = { base, glow, sheen, veins, sentinel: sentinelOf(base), plain: d.plain };
  kept.set(d.frame, k);
  paintKept(sheet, d.frame, k, a.bloater ? b.sheets.get(veinSheetOf(a.bloater.look)) : undefined);
  if (d.plain) return;
  if (a.primary) FX.set(d.frame, { glow: glow !== null, sheen: sheen !== null, bloater: d.bloater });
  const m = /^zombie_(walker|runner|crawler)_[a-z]_w(\d)$/.exec(d.frame);
  if (m) {
    const set = loopLanded.get(a.sheet) ?? new Set<number>();
    set.add(Number(m[2]));
    loopLanded.set(a.sheet, set);
  }
  b.stats.landed++;
  if (b.stats.waveOneMs === 0 && isWaveOneFrame(d.frame) && charArts().every((x) => !isWaveOneFrame(x.frame) || kept.get(x.frame)?.plain === false)) b.stats.waveOneMs = performance.now();
}
function closeAll(...s: (Pic | null)[]): void {
  for (const x of s) if (x && "close" in x) (x as ImageBitmap).close();
}

function startSteps(b: CharBake, t: Task): Generator<number, unknown, void> {
  if (t.kind === "body") return bodySteps(t.body.look, b.make);
  return charFrameSteps(charArt(t.frame) as CharArt, b.make, t.plain);
}
function* bodySteps(look: ResolvedLook, make: (w: number, h: number) => HTMLCanvasElement): Generator<number, BodyDone, void> {
  const p = yield* bodyBakeSteps(look, true, make);
  const q = yield* bodyBakeSteps(look, false, make);
  return { pack: p.base, nopack: q.base, sheenPack: p.sheen, sheenNopack: q.sheen };
}

/**
 * Advances the bake: takes in the worker's pictures, or (no worker) bakes on the main thread in resumable slices until
 * `budgetUnits` or `budgetMs`; then re-uploads each touched sheet once. Returns true while pictures are still coming.
 */
export function pumpCharBake(b: CharBake, budgetUnits: number, budgetMs: number, now: () => number = () => performance.now()): boolean {
  // finished and nothing new asked for: nothing to do (no sheet walk per frame once the bake is over)
  if (b.idle && b.queue.length === 0 && b.arrived.length === 0 && b.bodiesArrived.length === 0 && b.inFlight.length === 0 && b.job === null && b.worker === null) return false;
  b.idle = false;
  // pictures that arrived land within the frame's budget (at least one per frame): a burst from the worker is spread
  const tLand = now();
  let landedNow = 0;
  const landMs = budgetMs / 2;
  while (b.bodiesArrived.length > 0 && (landedNow === 0 || now() - tLand < landMs)) {
    const r = b.bodiesArrived.shift() as { readonly id: number; readonly d: BodyDone };
    b.inFlight = b.inFlight.filter((t) => t.kind !== "body" || t.body.id !== r.id);
    const cb = b.bodyCbs.get(r.id);
    b.bodyCbs.delete(r.id);
    const t0 = now();
    cb?.(r.d);
    b.stats.maxBodyMs = Math.max(b.stats.maxBodyMs, now() - t0);
    closeAll(r.d.pack, r.d.nopack, r.d.sheenPack, r.d.sheenNopack);
    landedNow++;
  }
  while (b.arrived.length > 0 && (landedNow === 0 || now() - tLand < landMs)) {
    const d = b.arrived.shift() as Done;
    const t0 = now();
    keep(b, d);
    b.stats.maxKeepMs = Math.max(b.stats.maxKeepMs, now() - t0);
    b.inFlight = b.inFlight.filter((t) => t.kind !== "frame" || t.frame !== d.frame || t.plain !== d.plain);
    closeAll(d.base, d.glow, d.sheen, d.veins);
    landedNow++;
  }
  b.stats.maxLandMs = Math.max(b.stats.maxLandMs, now() - tLand);
  const tPump = now();
  if (b.lastPump > 0 && tPump - b.lastPump > 1000) b.workerDeadline += tPump - b.lastPump; // a frozen tab isn't a silent worker
  b.lastPump = tPump;
  if (b.worker) {
    if (b.inFlight.length > 0 && tPump > b.workerDeadline) workerFailed(b);
    else if (b.inFlight.length === 0 && b.queue.length === 0) {
      b.worker.terminate();
      b.worker = null;
    } else if (b.queue.length > 0) sendToWorker(b);
  } else if (b.useWorker && b.queue.length > 0) sendToWorker(b);
  let units = 0;
  if (!b.worker && !(b.useWorker && b.inFlight.length > 0)) {
    const t0 = now();
    while (b.job || b.queue.length > 0) {
      if (!b.job) {
        const task = b.queue.shift() as Task;
        b.job = { task, steps: startSteps(b, task) };
      }
      const st = b.job.steps.next();
      if (st.done) {
        const t = b.job.task;
        b.job = null;
        b.stats.onMain++;
        if (t.kind === "body") {
          const r = st.value as BodyDone;
          const cb = b.bodyCbs.get(t.body.id);
          b.bodyCbs.delete(t.body.id);
          cb?.(r);
          for (const c of [r.pack, r.nopack, r.sheenPack, r.sheenNopack]) if (c) (c as HTMLCanvasElement).width = 0;
        } else {
          const r = st.value as CharBaked;
          keep(b, { frame: t.frame, base: r.base, glow: r.glow, sheen: r.sheen, veins: r.veins, bloater: r.bloater, plain: r.plain });
          for (const c of [r.base, r.glow, r.sheen, r.veins]) if (c) c.width = 0;
        }
      } else units += st.value;
      if (units >= budgetUnits || now() - t0 >= budgetMs) break;
    }
  }
  b.lastUnits = units;
  const tRef = now();
  // one sheet upload per frame (the others stay dirty for the next frames): a burst never stacks uploads
  for (const sh of b.sheets.values()) {
    if (!sh.dirty) continue;
    sh.dirty = false;
    sh.tex?.refresh();
    break;
  }
  b.stats.maxRefreshMs = Math.max(b.stats.maxRefreshMs, now() - tRef);
  let anyDirty = false;
  for (const sh of b.sheets.values()) if (sh.dirty) anyDirty = true;
  const busy = anyDirty || b.job !== null || b.queue.length > 0 || b.worker !== null || b.inFlight.length > 0 || b.arrived.length > 0 || b.bodiesArrived.length > 0;
  if (!busy && b.stats.doneMs === 0 && b.stats.landed > 0) b.stats.doneMs = now();
  b.idle = !busy;
  return busy;
}

/** The views' per-frame call (`ZombieView.update`, `SurvivorLookTextures.beginFrame`): once per frame at most. */
let lastPumpFrame = -1;
export function pumpCharacters(budgetUnits = BAKE_UNITS_PER_FRAME, budgetMs = BAKE_MS_PER_FRAME, frame = -2): boolean {
  if (!bake) return false;
  if (frame >= 0) {
    if (frame === lastPumpFrame) return true;
    lastPumpFrame = frame;
  }
  const t0 = performance.now();
  const busy = pumpCharBake(bake, budgetUnits, budgetMs);
  const dt = performance.now() - t0;
  if (dt > bake.stats.maxPumpMs) bake.stats.maxPumpMs = dt;
  return busy;
}

function workerBakeAvailable(): boolean {
  return typeof Worker !== "undefined" && typeof OffscreenCanvas !== "undefined" && typeof OffscreenCanvas.prototype.transferToImageBitmap === "function";
}

/** What the worker posts back. */
export type CharWorkerResult =
  | { readonly gen: number; readonly kind: "frame"; readonly frame: string; readonly plain: boolean; readonly base: ImageData; readonly glow: ImageData | null; readonly sheen: ImageData | null; readonly veins: ImageData | null; readonly bloater: BloaterFxData | null }
  | { readonly gen: number; readonly kind: "body"; readonly id: number; readonly pack: ImageData; readonly nopack: ImageData; readonly sheenPack: ImageData | null; readonly sheenNopack: ImageData | null };
/** What the main thread posts: frames to bake (in order), bodies first. */
export interface CharWorkerJob {
  readonly gen: number;
  readonly frames: readonly { readonly frame: string; readonly plain: boolean }[];
  readonly bodies: readonly BodyJob[];
}

function sendToWorker(b: CharBake): void {
  if (b.queue.length === 0) return;
  if (!b.worker) {
    try {
      b.worker = new Worker(new URL("./charactersBakeWorker.ts", import.meta.url), { type: "module" });
    } catch {
      b.worker = null;
      b.useWorker = false;
      b.stats.worker = false;
      return;
    }
    b.worker.onmessage = (e: MessageEvent<CharWorkerResult>) => receiveCharWorkerResult(b, e.data);
    b.worker.onerror = () => workerFailed(b);
  }
  const tasks = b.queue;
  b.queue = [];
  b.inFlight.push(...tasks);
  b.workerDeadline = performance.now() + WORKER_TIMEOUT_MS;
  const job: CharWorkerJob = {
    gen: b.gen,
    frames: tasks.flatMap((t) => (t.kind === "frame" ? [{ frame: t.frame, plain: t.plain }] : [])),
    bodies: tasks.flatMap((t) => (t.kind === "body" ? [t.body] : [])),
  };
  b.worker.postMessage(job);
}

/** A picture from the worker: kept for the next pump, or (an older generation's) dropped and freed. */
export function receiveCharWorkerResult(b: CharBake, r: CharWorkerResult, now = performance.now()): void {
  b.workerDeadline = now + WORKER_TIMEOUT_MS; // any answer shows the worker is alive
  b.stats.fromWorker++;
  if (r.gen !== b.gen) {
    if (r.kind === "frame") closeAll(r.base, r.glow, r.sheen, r.veins);
    else closeAll(r.pack, r.nopack, r.sheenPack, r.sheenNopack);
    return;
  }
  if (r.kind === "frame") b.arrived.push({ frame: r.frame, base: r.base, glow: r.glow, sheen: r.sheen, veins: r.veins, bloater: r.bloater, plain: r.plain });
  else b.bodiesArrived.push({ id: r.id, d: { pack: r.pack, nopack: r.nopack, sheenPack: r.sheenPack, sheenNopack: r.sheenNopack } });
}

/** The worker failed or went silent: closed; the main thread bakes what it didn't send back (and the rest). */
export function workerFailed(b: CharBake): void {
  if (b.worker) {
    b.worker.onmessage = null;
    b.worker.onerror = null;
    b.worker.terminate();
  }
  b.worker = null;
  b.useWorker = false;
  b.stats.worker = false;
  // bodies first, as the worker would have; plain pictures already landed are not baked again
  const back = b.inFlight.filter((t) => !(t.kind === "frame" && t.plain && kept.has(t.frame)));
  b.queue = [...back.filter((t) => t.kind === "body"), ...back.filter((t) => t.kind !== "body"), ...b.queue];
  b.inFlight = [];
}

/** The tasks of a full bake: B10's plain first pictures of the new designs, bodies, then every relit frame. */
export function allTasks(): Task[] {
  const plain: Task[] = charArts().filter((a) => a.plainFirst && !kept.has(a.frame)).map((a) => ({ kind: "frame", frame: a.frame, plain: true }));
  const relit: Task[] = charArts().filter((a) => kept.get(a.frame)?.plain !== false).map((a) => ({ kind: "frame", frame: a.frame, plain: false }));
  return [...plain, ...relit];
}

/**
 * Review M3 / R3 pattern (9.11): on a graphics restore (cache phase) the kept pictures are checked; CPU-backed, they
 * normally survive (nothing to do: the sheets' repaint draws them). If one was emptied (its sentinel is gone), the
 * cache is dropped and everything is baked again (the repaint shows the plain drawings meanwhile). Returns how many
 * tasks were queued again (0 = intact).
 */
export function rebakeCharsAfterCacheLoss(b: CharBake | null = bake): number {
  if (kept.size === 0) return 0;
  let intact = true;
  for (const k of kept.values()) {
    if (!k.sentinel) continue;
    if ((k.base.data[(k.sentinel[1] * k.base.width + k.sentinel[0]) * 4 + 3] as number) === 0) intact = false;
  }
  if (intact) return 0;
  kept.clear();
  FX.clear();
  loopLanded.clear();
  if (!b) return 0;
  b.job?.steps.return(undefined);
  b.job = null;
  b.gen++;
  const bodies = [...b.inFlight, ...b.queue].filter((t) => t.kind === "body");
  b.inFlight = [];
  b.arrived.length = 0;
  b.bodiesArrived.length = 0;
  b.stats.doneMs = 0;
  b.queue = [...bodies, ...allTasks()];
  if (b.worker) {
    b.worker.onmessage = null;
    b.worker.onerror = null;
    b.worker.terminate();
    b.worker = null;
  }
  if (b.useWorker) sendToWorker(b);
  return b.queue.length + b.inFlight.length;
}

/** A bake over `sheets` (tests make them with a node canvas); main-thread until `useWorker`. */
export function newCharBake(sheets: Map<string, Sheet>, make: (w: number, h: number) => HTMLCanvasElement, queue: Task[] = allTasks()): CharBake {
  return { queue, job: null, make, lastUnits: 0, sheets, worker: null, inFlight: [], arrived: [], bodiesArrived: [], bodyCbs: new Map(), gen: 0, useWorker: false, workerDeadline: 0, lastPump: 0, idle: false, stats: { startMs: 0, doneMs: 0, maxPumpMs: 0, landed: 0, worker: false, fromWorker: 0, onMain: 0, waveOneMs: 0, maxLandMs: 0, maxRefreshMs: 0, maxBodyMs: 0, maxKeepMs: 0 } };
}
/** A sheet over a canvas (tests). */
export function newSheet(key: string, canvas: HTMLCanvasElement): Sheet {
  const layout = packAtlas(charSheetSpecs(key), CHAR_SHEET_PX);
  canvas.width = layout.width;
  canvas.height = layout.height;
  return { key, canvas, frames: new Map(layout.frames.map((f) => [f.name, f])), tex: null, dirty: false };
}
export function clearCharCacheForTests(): void {
  kept.clear();
  FX.clear();
  loopLanded.clear();
  bake = null;
  lastPumpFrame = -1;
  bodyIdOf.clear();
}
/** Tests (views without a bake): a frame's animation data as if its relit picture had landed; a loop look as fully landed. */
export function setCharFxForTests(frame: string, fx: CharFx): void {
  FX.set(frame, fx);
}
export function setLoopReadyForTests(type: LoopType, v: number): void {
  loopLanded.set(sheetOf(type, v), new Set(Array.from({ length: LOOP_FRAMES }, (_, k) => k)));
}
/** Tests: empties every kept picture's pixels (what a wipe would do to a canvas). */
export function wipeKeptForTests(): void {
  for (const k of kept.values()) k.base.data.fill(0);
}
/** Tests: the bake made by `ensureCharacterSheets` (or set by `setCharBakeForTests`). */
export function charBakeForTests(): CharBake | null {
  return bake;
}
export function setCharBakeForTests(b: CharBake | null): void {
  bake = b;
}

let nextBodyId = 1;
const bodyIdOf = new Map<string, number>();
/**
 * Story 7.9 bodies: asks for `look` relit for body `key` (one per player; a newer request replaces the older one,
 * whose answer is then dropped). `cb` runs from a pump with the pictures (valid only during the call). Returns false
 * when there is no bake (the caller keeps its plain body).
 */
export function requestBodyRelight(key: string, look: ResolvedLook, cb: BodyCb): boolean {
  const b = bake;
  if (!b) return false;
  cancelBodyRelight(key);
  const id = nextBodyId++;
  bodyIdOf.set(key, id);
  b.bodyCbs.set(id, cb);
  b.queue.unshift({ kind: "body", body: { id, key, look } });
  if (b.useWorker) sendToWorker(b);
  return true;
}
/** A body request is no longer wanted (the player left or changed look): its answer is dropped. */
export function cancelBodyRelight(key: string): void {
  const b = bake;
  const id = bodyIdOf.get(key);
  if (!b || id === undefined) return;
  bodyIdOf.delete(key);
  b.bodyCbs.delete(id);
  const mine = (t: Task): boolean => t.kind === "body" && t.body.id === id;
  b.queue = b.queue.filter((t) => !mine(t));
  b.inFlight = b.inFlight.filter((t) => !mine(t)); // the worker drops it too (same key), or its late answer is ignored
  if (b.job && mine(b.job.task)) {
    b.job.steps.return(undefined);
    b.job = null;
  }
}

/** Plain picture of an atlas frame: copied from `atlas_characters` at the start (B10: no drawing on the main thread). */
const ATLAS_NAME_OF_LOOP = (frame: string): string | null => {
  const m = /^(zombie_(?:walker|runner|crawler)_[a-z])_w0$/.exec(frame);
  return m ? (m[1] as string) : null;
};

/**
 * Creates every character sheet and the small FX pictures (idempotent), then starts the bake: in a worker when the
 * browser can, unless `opts.worker` is false (the asset gallery bakes on the spot: `pumpCharacters(Infinity, Infinity)`).
 * `atlas` is `atlas_characters` (already made by `ensureAtlases`): the sheets start as copies of its plain frames.
 */
export function ensureCharacterSheets(scene: Phaser.Scene, opts: { readonly worker?: boolean } = {}): void {
  if (typeof document === "undefined" || scene.textures.exists(charSheets()[0] as string)) return; // no DOM (view tests): the views keep their frame names

  const t0 = performance.now();
  const atlasTex = scene.textures.exists("atlas_characters") ? scene.textures.get("atlas_characters") : null;
  const atlasImg = atlasTex ? (atlasTex.getSourceImage() as HTMLCanvasElement) : null;
  const sheets = new Map<string, Sheet>();
  for (const key of charSheets()) {
    const layout = packAtlas(charSheetSpecs(key), CHAR_SHEET_PX);
    const canvas = makeCanvas(layout.width, layout.height); // CPU-backed (B17)
    const frames = new Map(layout.frames.map((f) => [f.name, f]));
    let first = true;
    const sheet: Sheet = { key, canvas, frames, tex: null, dirty: false };
    sheet.tex = addGeneratedTexture(
      scene,
      key,
      canvas,
      (g) => {
        for (const a of charArts()) {
          if (a.bloater && veinSheetOf(a.bloater.look) === key) {
            const kv = kept.get(a.frame);
            if (kv?.veins) paintVeins(sheet, a.frame, kv.veins);
          }
          if (a.sheet !== key) continue;
          const k = kept.get(a.frame);
          if (k) {
            paintKept(sheet, a.frame, k);
            continue;
          }
          const f = frames.get(a.frame) as PlacedFrame;
          const atlasName = ATLAS_NAME_OF_LOOP(a.frame) ?? (/_w\d$/.test(a.frame) ? null : a.frame);
          if (first && atlasImg && atlasTex && atlasName && atlasTex.has(atlasName)) {
            // the start: the plain frame copied from atlas_characters (the walk loop's first picture: today's design until B10's plain new design lands)
            const af = atlasTex.get(atlasName);
            g.drawImage(atlasImg, af.cutX, af.cutY, af.cutWidth, af.cutHeight, f.x, f.y, f.w, f.h);
          } else if (!first && (a.primary || a.plainFirst)) {
            // a graphics restore before the picture landed: drawn plain (rare)
            const c = drawCentred(makeCanvas, f.w, CHAR_PX_PER_R, a.draw);
            g.drawImage(c, f.x, f.y);
            c.width = 0;
          }
        }
        first = false;
      },
      (t) => {
        for (const f of layout.frames) t.add(f.name, 0, f.x, f.y, f.w, f.h);
      },
    );
    sheets.set(key, sheet);
  }
  ensureCharFxTexture(scene);
  bake = newCharBake(sheets, makeCanvas);
  bake.stats.startMs = t0;
  (globalThis as { __charBake?: unknown }).__charBake = bake.stats;
  if (opts.worker !== false && workerBakeAvailable()) {
    bake.useWorker = true;
    bake.stats.worker = true;
    sendToWorker(bake);
  }
  textureRegistry.register("chars_relit", RebuildPhase.cache, () => {
    rebakeCharsAfterCacheLoss();
  });
}

/** The sheet (texture key) of a zombie look. */
const ZOMBIE_SHEETS = new Map<string, string>();
export function zombieSheet(type: ZombieTypeId, v: number): string {
  const k = type + v;
  let s = ZOMBIE_SHEETS.get(k);
  if (s === undefined) {
    s = sheetOf(type, v);
    ZOMBIE_SHEETS.set(k, s);
  }
  return s;
}
/** The walk picture `k` of a loop look (built once). */
const WALK: Readonly<Record<LoopType, readonly (readonly string[])[]>> = {
  walker: Array.from({ length: 4 }, (_, v) => Array.from({ length: LOOP_FRAMES }, (_, k) => walkFrame("walker", v, k))),
  runner: Array.from({ length: 2 }, (_, v) => Array.from({ length: LOOP_FRAMES }, (_, k) => walkFrame("runner", v, k))),
  crawler: Array.from({ length: 2 }, (_, v) => Array.from({ length: LOOP_FRAMES }, (_, k) => walkFrame("crawler", v, k))),
};
export function walkFrames(type: ZombieTypeId, v: number): readonly string[] | null {
  return isLoopType(type) ? ((WALK[type][v % WALK[type].length] as readonly string[]) ?? null) : null;
}

/** A primary frame's layer frame names (built once: views never build strings per frame). */
export interface LayerNames {
  readonly glow: string;
  readonly sheen: readonly string[];
  /** A Bloater's vein steps (empty for the others). */
  readonly veins: readonly string[];
}
const LAYER_NAMES = new Map<string, LayerNames>();
export function layerNames(frame: string): LayerNames {
  let l = LAYER_NAMES.get(frame);
  if (!l) {
    const veins = charArt(frame)?.bloater ? Array.from({ length: VEIN_STEPS }, (_, k) => veinFrame(frame, k)) : [];
    l = { glow: glowFrame(frame), sheen: Array.from({ length: SHEEN_STEPS }, (_, k) => sheenFrame(frame, k)), veins };
    LAYER_NAMES.set(frame, l);
  }
  return l;
}
for (const a of charArts()) if (a.primary) layerNames(a.frame);

/** The pooled FX pictures: the acid sac (body, rim, wet highlight), its halo, a bubble, a drip. */
function ensureCharFxTexture(scene: Phaser.Scene): void {
  const specs = [
    { name: FX_SAC, w: FX_SAC_PX, h: FX_SAC_PX },
    { name: FX_SAC_HALO, w: FX_SAC_HALO_PX, h: FX_SAC_HALO_PX },
    { name: FX_BUBBLE, w: FX_BUBBLE_PX, h: FX_BUBBLE_PX },
    { name: FX_DRIP, w: FX_DRIP_PX, h: FX_DRIP_PX },
  ];
  const layout = packAtlas(specs);
  const canvas = document.createElement("canvas");
  canvas.width = layout.width;
  canvas.height = layout.height;
  addGeneratedTexture(
    scene,
    TEX_CHAR_FX,
    canvas,
    (g) => {
      for (const f of layout.frames) {
        g.save();
        g.translate(f.x + f.w / 2, f.y + f.h / 2);
        drawCharFxPicture(g, f.name, f.w / 2 - 1);
        g.restore();
      }
    },
    (t) => {
      for (const f of layout.frames) t.add(f.name, 0, f.x, f.y, f.w, f.h);
    },
  );
}

/** take 4 › drawBloaterFx / the drips, one picture each, radius `r` around the origin. */
export function drawCharFxPicture(g: CanvasRenderingContext2D, name: string, r: number): void {
  if (name === FX_SAC) {
    // a translucent glossy blister: glowing core, dark rim, wet highlight (the light turns with the body, B2)
    const body = g.createRadialGradient(-r * 0.25, -r * 0.3, r * 0.1, 0, 0, r);
    body.addColorStop(0, "rgba(230,255,150,0.95)");
    body.addColorStop(0.45, "rgba(150,220,50,0.9)");
    body.addColorStop(0.85, "rgba(60,110,20,0.92)");
    body.addColorStop(1, "rgba(30,50,10,0.9)");
    g.fillStyle = body;
    g.beginPath();
    g.arc(0, 0, r - 1, 0, Math.PI * 2);
    g.fill();
    g.strokeStyle = "rgba(20,40,10,0.7)";
    g.lineWidth = Math.max(1, r / 12);
    g.stroke();
    g.fillStyle = "rgba(255,255,255,0.75)";
    g.beginPath();
    g.ellipse(-r * 0.35, -r * 0.4, r * 0.28, r * 0.16, -0.6, 0, Math.PI * 2);
    g.fill();
  } else if (name === FX_SAC_HALO) {
    // white: tinted acid green and faded by the view (its glow on the skin, 0.6 r → 1.8 r of the sac)
    const halo = g.createRadialGradient(0, 0, (r * 0.6) / 1.8, 0, 0, r);
    halo.addColorStop(0, "rgba(150,255,60,1)");
    halo.addColorStop(1, "rgba(150,255,60,0)");
    g.fillStyle = halo;
    g.fillRect(-r, -r, 2 * r, 2 * r);
  } else if (name === FX_BUBBLE) {
    g.fillStyle = "rgba(240,255,200,1)";
    g.beginPath();
    g.arc(0, 0, r, 0, Math.PI * 2);
    g.fill();
  } else if (name === FX_DRIP) {
    g.fillStyle = "rgba(160,240,60,1)";
    g.beginPath();
    g.arc(0, 0, r, 0, Math.PI * 2);
    g.fill();
  }
}
