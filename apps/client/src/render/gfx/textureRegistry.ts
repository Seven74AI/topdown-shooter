/**
 * Story 4.13: every texture the game draws in code, with a callback that draws it again.
 *
 * Why: when the browser loses the WebGL context (Android Chrome on every app switch), Phaser 4.2.1
 * restores it by re-uploading each texture from its source canvas (`WebGLTextureWrapper.createResource`).
 * Android may also have discarded those canvases' GPU-backed pixels in the background, so the
 * textures came back transparent: only the floor (or nothing) was left on screen. On a restore
 * (`graphicsGuard.ts`) the registry redraws every generated texture from game code and re-uploads it.
 *
 * Memory: only the callbacks are kept here, no extra canvas copies (the canvases are the ones Phaser
 * already references). Pure (no Phaser, no DOM types needed): unit-tested in node.
 */
import { clientLog } from "../../debug/clientLog";

/** Rebuild order: caches are dropped first, then the atlases are redrawn, then what is drawn FROM them. */
export const RebuildPhase = {
  /** Module caches of helper canvases (e.g. the bake's noise patterns). */
  cache: 0,
  /** The sprite atlases (characters, fx, downtown, buildings, fire particles, small marks). */
  atlas: 1,
  /** Textures drawn from the atlases (the city bake tiles). */
  bake: 2,
  /** Phaser `Text` canvases. */
  text: 3,
} as const;
export type RebuildPhase = (typeof RebuildPhase)[keyof typeof RebuildPhase];

interface Entry {
  readonly phase: RebuildPhase;
  readonly rebuild: () => void;
  /** false when the texture's source looks emptied by the browser (see `allIntact`). */
  readonly isIntact: (() => boolean) | undefined;
  /** Insertion order inside a phase. */
  readonly seq: number;
}

/** What a canvas needs for the 2D `contextrestored` hook (an `HTMLCanvasElement` in the browser). */
export interface RestorableCanvas {
  addEventListener(type: "contextrestored", listener: () => void): void;
  removeEventListener(type: "contextrestored", listener: () => void): void;
}

export interface RebuildReport {
  /** Entries whose callback ran without throwing. */
  rebuilt: number;
  /** Keys whose callback threw (the others still ran). */
  failed: string[];
}

export type Scheduler = (run: () => void) => void;

export class TextureRegistry {
  private readonly entries = new Map<string, Entry>();
  private readonly canvases = new Map<string, readonly RestorableCanvas[]>();
  private seq = 0;
  private pending = false;
  /** How many full rebuilds ran (debug overlay, browser checks). */
  rebuildCount = 0;
  /** The last rebuild's result. */
  lastReport: RebuildReport = { rebuilt: 0, failed: [] };

  /** `schedule` runs a coalesced rebuild later (default: the next macrotask). */
  constructor(private readonly schedule: Scheduler = (run) => void setTimeout(run, 0)) {}

  /**
   * Adds (or replaces) the rebuild callback of `key`. `canvases`: the 2D canvases the texture is drawn
   * on; a `contextrestored` event on any of them (Chrome's 2D canvas loss) asks for a rebuild.
   * `isIntact`: an optional cheap check that the source still holds its pixels (`allIntact`).
   * Returns the unregister function.
   */
  register(key: string, phase: RebuildPhase, rebuild: () => void, canvases: readonly RestorableCanvas[] = [], isIntact?: () => boolean): () => void {
    this.unregister(key);
    this.entries.set(key, { phase, rebuild, isIntact, seq: this.seq++ });
    if (canvases.length > 0) {
      for (const c of canvases) c.addEventListener("contextrestored", this.requestRebuild);
      this.canvases.set(key, canvases);
    }
    return () => this.unregister(key);
  }

  /**
   * Story 9.15 (review L1): gives a registered entry its `isIntact` check later, once its canvas holds a known pixel (a
   * texture registered while still empty has none). No-op for an unknown key.
   */
  setIntactCheck(key: string, isIntact: () => boolean): void {
    const e = this.entries.get(key);
    if (e) this.entries.set(key, { ...e, isIntact });
  }

  unregister(key: string): void {
    this.entries.delete(key);
    const cs = this.canvases.get(key);
    if (cs) {
      for (const c of cs) c.removeEventListener("contextrestored", this.requestRebuild);
      this.canvases.delete(key);
    }
  }

  has(key: string): boolean {
    return this.entries.has(key);
  }

  get size(): number {
    return this.entries.size;
  }

  /** Story 10.3 (B2): the 2D canvases registered for a `contextrestored` rebuild (the memory probe's "canvases"). */
  get canvasCount(): number {
    let n = 0;
    for (const list of this.canvases.values()) n += list.length;
    return n;
  }

  /** Keys in rebuild order. */
  keys(): string[] {
    return [...this.entries.entries()].sort(([, a], [, b]) => a.phase - b.phase || a.seq - b.seq).map(([k]) => k);
  }

  /**
   * false if any entry's `isIntact` check says its pixels are gone (the page came back from the
   * background and the browser emptied a canvas without any event). A throwing check counts as gone.
   */
  allIntact(): boolean {
    for (const e of this.entries.values()) {
      if (!e.isIntact) continue;
      try {
        if (!e.isIntact()) return false;
      } catch {
        return false;
      }
    }
    return true;
  }

  /**
   * Runs every callback now, phase by phase. One failing texture never stops the others (it is
   * reported and logged). Cancels a pending `requestRebuild`.
   */
  rebuildAll(): RebuildReport {
    this.pending = false;
    const report: RebuildReport = { rebuilt: 0, failed: [] };
    for (const key of this.keys()) {
      const e = this.entries.get(key);
      if (!e) continue; // a callback unregistered a later entry
      try {
        e.rebuild();
        report.rebuilt++;
      } catch (err) {
        report.failed.push(key);
        console.warn(`texture rebuild failed: ${key}`, err);
      }
    }
    this.rebuildCount++;
    this.lastReport = report;
    clientLog.note("texture.rebuild", { rebuilt: report.rebuilt, failed: report.failed.length }); // Story 10.6 (an event, not per frame)
    return report;
  }

  /** Asks for one rebuild soon; many requests in a row (each canvas's event) coalesce into one. */
  readonly requestRebuild = (): void => {
    if (this.pending) return;
    this.pending = true;
    this.schedule(() => {
      if (this.pending) this.rebuildAll();
    });
  };
}

/** The page's one registry (textures outlive scene restarts, like Phaser's texture manager). */
export const textureRegistry = new TextureRegistry();
