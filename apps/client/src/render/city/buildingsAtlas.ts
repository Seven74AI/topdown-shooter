import type * as Phaser from "phaser";
import { packAtlas, type PlacedFrame } from "./atlasLayout";
import { addGeneratedTexture } from "./canvasTexture";
import { RebuildPhase, textureRegistry } from "../gfx/textureRegistry";
import { drawInFrame } from "./buildingArt";
import { ART_SPECS, BUILDINGS_PX_PER_M, BUILDING_SHEETS, bakeSteps, buildingsAtlasSpecs, relitSpecs, sheetSpecs, type ArtSpec } from "./buildingsFrames";
import type { Relit } from "./relight";
import type { GlowKind } from "../buildingFx";

export * from "./buildingsFrames";

/**
 * Story 5.9: the canvas atlas of the new buildings (`atlas_buildings`), drawn ONCE per game from the code drawings
 * (`buildingsFrames.ts`). Photoreal group 3: the relit pictures are baked after the start (see `Bake`).
 */
/** Photoreal group 3: the relit frames' glow (bloom) layer, pulsed additively by the view. */
export const ATLAS_BUILDINGS_GLOW = "atlas_buildings_glow";
/** A glint star (drawn additively over steel highlights): white core, soft halo, a thin cross. */
export const TEX_GLINT = "fx_glint";
const GLINT_PX = 32;

/** What the view animates on a relit frame (frame px of the 96 px/m frame, from its top-left). */
export interface BuildingFx {
  readonly glow: GlowKind;
  /** The glow frame in `ATLAS_BUILDINGS_GLOW`, or null when nothing glows. */
  readonly glowFrame: string | null;
  readonly glowAt: readonly [number, number, number];
  readonly spots: readonly (readonly [number, number])[];
}
const FX = new Map<string, BuildingFx>();
/** The animation data of a frame (filled when the atlas is drawn), or undefined. */
export function buildingFx(frame: string): BuildingFx | undefined {
  return FX.get(frame);
}

/** A relit picture kept for the atlas: CPU-backed canvases (Android can't empty them) and a pixel known to be opaque. */
interface Kept {
  readonly base: HTMLCanvasElement;
  readonly bloom: HTMLCanvasElement | null;
  /** A source px of `base` with alpha > 0 when it was kept: a restore checks it (review R3). */
  readonly sentinel: readonly [number, number] | null;
}
const relitCache = new Map<string, Kept>();
const makeCanvas = (w: number, h: number): HTMLCanvasElement => {
  const c = document.createElement("canvas");
  c.width = w;
  c.height = h;
  return c;
};
/** A canvas kept in CPU memory (`willReadFrequently`): Android doesn't empty those in the background (review M3). */
function cpuCopy(src: CanvasImageSource, w: number, h: number, make: (w: number, h: number) => HTMLCanvasElement): HTMLCanvasElement {
  const c = make(w, h);
  const g = c.getContext("2d", { willReadFrequently: true }) as CanvasRenderingContext2D;
  g.drawImage(src, 0, 0, w, h);
  return c;
}
function findSentinel(c: HTMLCanvasElement): readonly [number, number] | null {
  const g = c.getContext("2d", { willReadFrequently: true }) as CanvasRenderingContext2D;
  const y = Math.floor(c.height / 2);
  const row = g.getImageData(0, y, c.width, 1).data;
  for (let x = 0; x < c.width; x++) if ((row[x * 4 + 3] as number) > 128) return [x, y];
  return null;
}

/** A finished picture (from the worker or the main-thread steps), on its way into the atlas. */
interface Done {
  readonly frame: string;
  readonly base: CanvasImageSource;
  readonly bloom: CanvasImageSource | null;
  readonly glowAt: readonly [number, number, number];
  readonly spots: readonly (readonly [number, number])[];
}

/**
 * The relit look costs about a second of work for the whole set (several on a phone), too long for the game's main
 * thread. Review R1/R2: where the browser can (`Worker` + `OffscreenCanvas`), a worker (`buildingsBakeWorker.ts`) bakes
 * every picture in the background and posts each one back; the main thread only copies it into the atlas (one texture
 * refresh per frame at most). Elsewhere the main thread bakes in resumable slices within a time budget per frame. The
 * atlas starts with the plain drawings either way, so the start is instant; a lost graphics context repaints what's kept.
 */
export interface Bake {
  queue: ArtSpec[];
  /** Main-thread fallback: the frame being relit (resumable) and its steps. */
  job: { readonly a: ArtSpec; readonly steps: Generator<number, Relit, void> } | null;
  readonly make: (w: number, h: number) => HTMLCanvasElement;
  /** Work units the last pump call did on the main thread (tests check the budget holds). */
  lastUnits: number;
  /** The sheets (one texture each): a relit picture marks only its own sheet for re-upload. */
  readonly sheets: Sheet[];
  readonly glowCanvas: HTMLCanvasElement;
  readonly glowFrames: readonly PlacedFrame[];
  glowTex: Phaser.Textures.CanvasTexture | null;
  /** Worker mode: the worker, the frames sent to it and not back yet, its results waiting for the next pump. */
  worker: Worker | null;
  inFlight: string[];
  readonly arrived: Done[];
  /** Bumped on a re-bake: results of an older generation are dropped. */
  gen: number;
}
let bake: Bake | null = null;
interface Sheet {
  readonly canvas: HTMLCanvasElement;
  readonly frames: readonly PlacedFrame[];
  tex: Phaser.Textures.CanvasTexture | null;
  dirty: boolean;
}

/** Review R2: the main-thread fallback's budget is the time guard (a work cap only bounds a frozen clock in tests). */
export const BAKE_UNITS_PER_FRAME = 400_000;
export const BAKE_MS_PER_FRAME = 6;

/** Keeps a finished picture (cache + animation data) and draws it into the atlas and its glow layer. */
function keep(b: Bake, d: Done): { dirty: boolean; glowDirty: boolean } {
  const a = ART_SPECS.find((x) => x.frame === d.frame);
  const sheet = b.sheets.find((sh) => sh.frames.some((x) => x.name === d.frame));
  const f = sheet?.frames.find((x) => x.name === d.frame);
  if (!a?.relit || !sheet || !f) return { dirty: false, glowDirty: false };
  const base = cpuCopy(d.base, f.w, f.h, b.make);
  const gf = b.glowFrames.find((x) => x.name === d.frame);
  const bloom = d.bloom && gf ? cpuCopy(d.bloom, gf.w, gf.h, b.make) : null;
  relitCache.set(d.frame, { base, bloom, sentinel: findSentinel(base) });
  FX.set(d.frame, { glow: a.relit.glow ?? "none", glowFrame: bloom ? d.frame : null, glowAt: d.glowAt, spots: d.spots });
  const g = sheet.canvas.getContext("2d") as CanvasRenderingContext2D;
  g.clearRect(f.x, f.y, f.w, f.h);
  g.drawImage(base, f.x, f.y, f.w, f.h);
  sheet.dirty = true;
  if (bloom && gf) (b.glowCanvas.getContext("2d") as CanvasRenderingContext2D).drawImage(bloom, gf.x, gf.y, gf.w, gf.h);
  return { dirty: true, glowDirty: bloom !== null };
}

/**
 * Advances the bake: takes in the worker's finished pictures, or (no worker) relights on the main thread in resumable
 * slices until `budgetUnits` of work or `budgetMs` have passed; refreshes the textures once. Returns true while
 * pictures are still coming. Call it every frame (BuildingView does). `now` is the clock (tests pass a fake one).
 */
export function pumpBake(b: Bake, budgetUnits: number, budgetMs: number, now: () => number = () => performance.now()): boolean {
  let dirty = false;
  let glowDirty = false;
  for (const d of b.arrived.splice(0)) {
    const k = keep(b, d);
    dirty ||= k.dirty;
    glowDirty ||= k.glowDirty;
    b.inFlight = b.inFlight.filter((n) => n !== d.frame);
    if ("close" in d.base) (d.base as ImageBitmap).close();
    if (d.bloom && "close" in d.bloom) (d.bloom as ImageBitmap).close();
  }
  let units = 0;
  if (!b.worker) {
    const t0 = now();
    while (b.job || b.queue.length > 0) {
      if (!b.job) {
        const a = b.queue.shift() as ArtSpec;
        b.job = { a, steps: bakeSteps(a, b.make) };
      }
      const st = b.job.steps.next();
      if (st.done) {
        const r = st.value;
        const frame = b.job.a.frame;
        b.job = null;
        const k = keep(b, { frame, base: r.base, bloom: r.bloom, glowAt: r.glowAt, spots: r.spots });
        dirty ||= k.dirty;
        glowDirty ||= k.glowDirty;
        r.base.width = 0; // the relight's own output canvases: copied into the cache, done with
        if (r.bloom) r.bloom.width = 0;
      } else units += st.value;
      if (units >= budgetUnits || now() - t0 >= budgetMs) break;
    }
  }
  b.lastUnits = units;
  if (dirty) {
    for (const sh of b.sheets) {
      if (!sh.dirty) continue;
      sh.dirty = false;
      sh.tex?.refresh();
    }
  }
  if (glowDirty) b.glowTex?.refresh();
  return b.job !== null || b.queue.length > 0 || b.inFlight.length > 0 || b.arrived.length > 0;
}
export function pumpBuildingsAtlas(budgetUnits = BAKE_UNITS_PER_FRAME, budgetMs = BAKE_MS_PER_FRAME): boolean {
  return bake ? pumpBake(bake, budgetUnits, budgetMs) : false;
}

/** Can this browser bake in a worker? */
function workerBakeAvailable(): boolean {
  return typeof Worker !== "undefined" && typeof OffscreenCanvas !== "undefined" && typeof OffscreenCanvas.prototype.transferToImageBitmap === "function";
}

interface WorkerResult {
  readonly gen: number;
  readonly frame: string;
  readonly base: ImageBitmap;
  readonly bloom: ImageBitmap | null;
  readonly glowAt: readonly [number, number, number];
  readonly spots: readonly (readonly [number, number])[];
}

/** Sends the queued frames to the worker (made on first use); on a worker error the main thread takes them back. */
function sendToWorker(b: Bake): void {
  if (b.queue.length === 0) return;
  if (!b.worker) {
    try {
      b.worker = new Worker(new URL("./buildingsBakeWorker.ts", import.meta.url), { type: "module" });
    } catch {
      b.worker = null;
      return;
    }
    b.worker.onmessage = (e: MessageEvent<WorkerResult>) => {
      const r = e.data;
      if (r.gen !== b.gen) {
        r.base.close();
        r.bloom?.close();
        return;
      }
      b.arrived.push({ frame: r.frame, base: r.base, bloom: r.bloom, glowAt: r.glowAt, spots: r.spots });
    };
    b.worker.onerror = () => {
      // fall back: the main thread bakes what the worker didn't send back
      b.worker?.terminate();
      b.worker = null;
      b.queue = [...b.inFlight.map((n) => ART_SPECS.find((a) => a.frame === n)).filter((a): a is ArtSpec => a !== undefined), ...b.queue];
      b.inFlight = [];
    };
  }
  const frames = b.queue.map((a) => a.frame);
  b.inFlight.push(...frames);
  b.queue = [];
  b.worker.postMessage({ gen: b.gen, frames });
}

/**
 * Review M3 / R3: on a graphics restore the registry calls this first (cache phase). The kept pictures live in
 * CPU-backed canvases, so normally they survive and nothing happens; if one was emptied anyway (its sentinel pixel is
 * gone), the cache and the animation data are dropped and every relit frame is baked again (the atlas repaint shows the
 * plain drawings meanwhile). A bake in progress is abandoned cleanly (review R4: its canvases are emptied). Returns how
 * many frames were queued again (0 = the cache was intact).
 */
export function rebakeAfterCacheLoss(b: Bake | null = bake): number {
  let intact = relitCache.size > 0;
  for (const k of relitCache.values()) {
    if (!k.sentinel) continue;
    const px = (k.base.getContext("2d", { willReadFrequently: true }) as CanvasRenderingContext2D).getImageData(k.sentinel[0], k.sentinel[1], 1, 1).data;
    if ((px[3] as number) === 0) intact = false;
  }
  if (intact) return 0;
  for (const k of relitCache.values()) {
    k.base.width = 0;
    if (k.bloom) k.bloom.width = 0;
  }
  relitCache.clear();
  FX.clear();
  if (!b) return 0;
  b.job?.steps.return(undefined as unknown as Relit);
  b.job = null;
  b.gen++;
  b.inFlight = [];
  b.arrived.length = 0;
  b.queue = [...relitSpecs()];
  const n = b.queue.length;
  if (b.worker) sendToWorker(b);
  return n;
}

/** A bake over `canvas` (the atlas) and `glowCanvas` (tests make one with a node canvas); main-thread until `sendToWorker`. */
export function newBake(canvas: HTMLCanvasElement, frames: readonly PlacedFrame[], glowCanvas: HTMLCanvasElement, glowFrames: readonly PlacedFrame[], make: (w: number, h: number) => HTMLCanvasElement, queue: ArtSpec[] = relitSpecs().filter((a) => !relitCache.has(a.frame))): Bake {
  return { queue, job: null, make, lastUnits: 0, sheets: [{ canvas, frames, tex: null, dirty: false }], glowCanvas, glowFrames, glowTex: null, worker: null, inFlight: [], arrived: [], gen: 0 };
}

/** Empties the kept pictures (tests start from a clean cache). */
export function clearRelitCacheForTests(): void {
  relitCache.clear();
  FX.clear();
}

/**
 * Draws every frame into one canvas and registers it (idempotent). The relit pictures follow: in a worker when the
 * browser can, unless `opts.worker` is false (the asset gallery bakes on the spot, `pumpBuildingsAtlas(Infinity, Infinity)`).
 */
export function ensureBuildingsAtlas(scene: Phaser.Scene, opts: { readonly worker?: boolean } = {}): void {
  if (scene.textures.exists(BUILDING_SHEETS[0] as string)) return;
  // Story 4.13: each sheet is redrawn in place after a lost graphics context (texture registry).
  const sheets: Sheet[] = BUILDING_SHEETS.map((key) => {
    const layout = packAtlas(sheetSpecs(key));
    const canvas = document.createElement("canvas");
    canvas.width = layout.width;
    canvas.height = layout.height;
    const tex = addGeneratedTexture(
      scene,
      key,
      canvas,
      (g) => {
        for (const f of layout.frames) drawFrame(g, f);
      },
      (t) => {
        for (const f of layout.frames) t.add(f.name, 0, f.x, f.y, f.w, f.h);
      },
    );
    return { canvas, frames: layout.frames, tex, dirty: false };
  });
  const sc = document.createElement("canvas");
  sc.width = GLINT_PX;
  sc.height = GLINT_PX;
  addGeneratedTexture(scene, TEX_GLINT, sc, (g) => {
    const c = GLINT_PX / 2;
    const rg = g.createRadialGradient(c, c, 0, c, c, c * 0.6);
    rg.addColorStop(0, "rgba(255,255,255,0.95)");
    rg.addColorStop(0.35, "rgba(210,228,255,0.35)");
    rg.addColorStop(1, "rgba(210,228,255,0)");
    g.fillStyle = rg;
    g.fillRect(0, 0, GLINT_PX, GLINT_PX);
    g.fillStyle = "rgba(255,255,255,0.7)";
    g.fillRect(0, c - 0.5, GLINT_PX, 1);
    g.fillRect(c - 0.5, 0, 1, GLINT_PX);
  });
  // the glow layer of the frames that have one (lamps, the med cross, the mine's LED)
  const glowSpecs = buildingsAtlasSpecs().filter((sp) => {
    const a = ART_SPECS.find((x) => x.frame === sp.name);
    return a?.relit?.emissive !== undefined;
  });
  const gl = packAtlas(glowSpecs);
  const gc = document.createElement("canvas");
  gc.width = gl.width;
  gc.height = gl.height;
  const glowTex = addGeneratedTexture(
    scene,
    ATLAS_BUILDINGS_GLOW,
    gc,
    (g) => {
      for (const f of gl.frames) {
        const bloom = relitCache.get(f.name)?.bloom;
        if (bloom) g.drawImage(bloom, f.x, f.y, f.w, f.h);
      }
    },
    (tex) => {
      for (const f of gl.frames) tex.add(f.name, 0, f.x, f.y, f.w, f.h);
    },
  );
  bake = { ...newBake(sheets[0]?.canvas as HTMLCanvasElement, [], gc, gl.frames, makeCanvas), sheets };
  bake.glowTex = glowTex;
  if (opts.worker !== false && workerBakeAvailable()) sendToWorker(bake);
  textureRegistry.register("atlas_buildings_relit", RebuildPhase.cache, () => {
    rebakeAfterCacheLoss();
  });
}

function drawFrame(g: CanvasRenderingContext2D, f: PlacedFrame): void {
  const a = ART_SPECS.find((s) => s.frame === f.name);
  if (!a) return;
  g.save();
  g.beginPath();
  g.rect(f.x, f.y, f.w, f.h);
  g.clip();
  const ready = relitCache.get(a.frame);
  if (ready) g.drawImage(ready.base, f.x, f.y, f.w, f.h);
  else (a.inFrame ?? drawInFrame)(g, f.x, f.y, f.w, f.h, BUILDINGS_PX_PER_M, (c) => a.draw(c, a.wM, a.hM));
  g.restore();
}
