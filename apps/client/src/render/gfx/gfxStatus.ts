/**
 * Story 4.13: what the page knows about its graphics — which renderer Phaser picked, how often the
 * WebGL context was lost / restored — and the one graphics notice. Pure (no Phaser import): the
 * debug overlay and the Copy results reports read it, and node tests use it.
 */

/** Phaser's renderer type constants (`Phaser.CANVAS` = 1, `Phaser.WEBGL` = 2, `Phaser.HEADLESS` = 3, 4.2.1). */
const PHASER_CANVAS = 1;
const PHASER_WEBGL = 2;
const PHASER_HEADLESS = 3;

export type RendererKind = "WebGL" | "Canvas" | "Headless" | "unknown";

/** The renderer's name for people (`game.renderer.type` or `game.config.renderType`). */
export function rendererKind(type: number | undefined): RendererKind {
  if (type === PHASER_WEBGL) return "WebGL";
  if (type === PHASER_CANVAS) return "Canvas";
  if (type === PHASER_HEADLESS) return "Headless";
  return "unknown";
}

/** Shown when Phaser had to fall back to the Canvas renderer (no WebGL). */
export const CANVAS_MODE_TEXT =
  "Graphics acceleration is off — the game may look wrong or run slowly. Fully close and reopen your browser, or try another browser.";
/** Shown when the WebGL context stays lost (the browser never gave it back). */
export const GFX_RESET_TEXT = "Graphics were reset — tap to reload.";
/** Online, rejoining a run isn't built yet (Story 8.1). */
export const GFX_RESET_ONLINE_TEXT = "Graphics were reset — tap to reload. Your online run may be lost (rejoining a run isn't built yet).";

/** How long a lost context may stay lost, while the page is visible, before the reload notice. */
export const RESTORE_WAIT_MS = 5000;

export interface GfxNotice {
  readonly text: string;
  /** "reload": the button reloads the page; "dismiss": the button only closes the notice. */
  readonly action: "reload" | "dismiss";
}

type Listener = (n: GfxNotice | null) => void;

class GfxStatus {
  renderer: RendererKind = "unknown";
  lost = false;
  lostCount = 0;
  restoreCount = 0;
  private notice: GfxNotice | null = null;
  private readonly listeners = new Set<Listener>();

  /** One line for the debug overlay and the reports, e.g. "renderer WebGL · context lost 1 · restored 1". */
  line(): string {
    const parts = [`renderer ${this.renderer}`];
    if (this.lostCount > 0 || this.restoreCount > 0) parts.push(`context lost ${this.lostCount} · restored ${this.restoreCount}`);
    if (this.lost) parts.push("LOST NOW");
    return parts.join(" · ");
  }

  getNotice(): GfxNotice | null {
    return this.notice;
  }

  showNotice(n: GfxNotice | null): void {
    this.notice = n;
    for (const l of this.listeners) l(n);
  }

  subscribe(l: Listener): () => void {
    this.listeners.add(l);
    return () => this.listeners.delete(l);
  }
}

/** The page's one status. */
export const gfxStatus = new GfxStatus();

/**
 * Decides when a lost context has been lost "too long": `RESTORE_WAIT_MS` of the page being VISIBLE
 * while lost (time in the background doesn't count: Android only gives the context back once the
 * page is shown again). Pure: the guard feeds it times.
 */
export class LostWatchdog {
  private lostAtMs = Number.NaN;
  private visibleSinceMs = Number.NaN;

  constructor(private readonly waitMs = RESTORE_WAIT_MS) {}

  lost(nowMs: number, visible: boolean): void {
    this.lostAtMs = nowMs;
    this.visibleSinceMs = visible ? nowMs : Number.NaN;
  }

  restored(): void {
    this.lostAtMs = Number.NaN;
  }

  visibility(nowMs: number, visible: boolean): void {
    this.visibleSinceMs = visible ? nowMs : Number.NaN;
  }

  get isLost(): boolean {
    return !Number.isNaN(this.lostAtMs);
  }

  /** true once the context has stayed lost for `waitMs` of visible time. */
  expired(nowMs: number): boolean {
    if (!this.isLost || Number.isNaN(this.visibleSinceMs)) return false;
    return nowMs - Math.max(this.lostAtMs, this.visibleSinceMs) >= this.waitMs;
  }
}
