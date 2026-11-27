import type { PlayerSettings, StoredPlayerSettings } from "@topdown/shared";
import { urlOptions } from "../debug/urlOptions";
import { getStoredSettings, setSettingsDefaults } from "./settings";

/**
 * Story 10.2-Q3 B (AC 5; designer 2026-11-27): the one-time quality check per phone. In the first
 * `AUTO_QUALITY_WINDOW_MS` of a run's FIRST wave, the average frame rate (frames / their wall-clock time, like the
 * "Show performance" number) picks the device class: below `AUTO_QUALITY_STEP1_FPS` the defaults drop one step (Resolution Balanced,
 * Rain Light), below `AUTO_QUALITY_STEP2_FPS` two (Resolution Fast, Rain Light, Glow Low). Only the DEFAULTS move
 * (`setSettingsDefaults`): a choice the player made always wins (10.1 B1). The result is remembered on the phone
 * (localStorage, try/catch) and applied at every boot; the check never runs again once it finished. Never in the
 * lobby or a build phase (only `phase === "wave"` of wave 1), never under `?stress`, and a hidden tab during the
 * window cancels that try (the `stressRun.interrupt` pattern: the next run's wave 1 tries again).
 *
 * Client-only thresholds (not balance: they never reach the simulation).
 */
export const AUTO_QUALITY_KEY = "topdown-shooter.autoQuality";
export const AUTO_QUALITY_WINDOW_MS = 10_000;
export const AUTO_QUALITY_STEP1_FPS = 40;
export const AUTO_QUALITY_STEP2_FPS = 30;
/**
 * Review H2 / re-review R1-L1, R1-L2: a frame gap longer than this (ms) is a paused page (an app switch, a lock, a
 * hidden tab whose loop Phaser stopped), not a slow phone, so the try is cancelled (nothing stored). A frame up to it
 * is a slow frame and counts: a phone under 4 FPS, or a 6–12 FPS phone with an occasional hitch of a few hundred ms,
 * is still measured (and lowered).
 */
export const AUTO_QUALITY_MAX_GAP_MS = 1000;
/** The toast the lowering shows once (10.2-Q3 B). */
export const AUTO_QUALITY_TOAST = "Lowered quality for smoother play · Settings";

export type AutoQualityStep = 0 | 1 | 2;

/** The lowered defaults of each step (step 0: none). */
export const AUTO_QUALITY_DEFAULTS: Readonly<Record<AutoQualityStep, Partial<PlayerSettings>>> = Object.freeze({
  0: {},
  1: { resolution: "balanced", rain: "light" },
  2: { resolution: "fast", rain: "light", glow: "low" },
});

/** The step an average FPS calls for. */
export function stepForFps(fps: number): AutoQualityStep {
  return fps < AUTO_QUALITY_STEP2_FPS ? 2 : fps < AUTO_QUALITY_STEP1_FPS ? 1 : 0;
}

/** What the check needs this frame. */
export interface AutoQualityFrame {
  /** A real wave is on: `run.phase === "wave"` and it is the run's first wave. */
  firstWave: boolean;
  /** `document.hidden` (or the page was just hidden: a frame-clock gap). */
  hidden: boolean;
  /**
   * Story 10.3 review H: Battery saver caps the draw at 30 frames a second (`frameCap.on`), so the frame rate says
   * nothing about the phone: while it is on the check doesn't start, and a running try is cancelled (nothing stored;
   * a later first wave with the saver off tries again).
   */
  capped?: boolean;
}

/** Storage as the check sees it (tests pass a fake). */
export interface AutoQualityStore {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
}

interface Stored {
  step: AutoQualityStep;
}

/** Review H1: the storage getter itself can throw (`localStorage` blocked: SecurityError), so it is called inside the try. */
function readStored(store: () => AutoQualityStore | undefined): Stored | null {
  try {
    const raw = store()?.getItem(AUTO_QUALITY_KEY);
    if (!raw) return null;
    const v = JSON.parse(raw) as { step?: unknown };
    return v.step === 0 || v.step === 1 || v.step === 2 ? { step: v.step } : null;
  } catch {
    return null;
  }
}

/**
 * One check per phone. `boot()` applies a remembered result; `frame()` once per rendered frame (GameScene) runs the
 * window and returns the toast text the frame it lowers anything that shows ("" otherwise). No allocation per frame.
 */
export class AutoQuality {
  /** "idle" (waiting for wave 1), "running", "done" (finished now or before: never again). */
  phase: "idle" | "running" | "done" = "idle";
  step: AutoQualityStep = 0;
  private startMs = 0;
  private frames = 0;
  /** Review H2: the previous frame's time; a gap over `AUTO_QUALITY_MAX_GAP_MS` cancels the try. */
  private lastMs = 0;

  constructor(
    private readonly store: () => AutoQualityStore | undefined,
    private readonly setDefaults: (patch: Partial<PlayerSettings>) => void,
    private readonly stored: () => StoredPlayerSettings,
    /** `?stress` (or any benchmark): never checks. */
    private readonly disabled = false,
  ) {}

  /** At boot: a remembered result lowers the defaults again; the check is then done for good. */
  boot(): void {
    if (this.disabled) return; // review N4: a `?stress` benchmark keeps the shipped defaults (a stored step too)
    const s = readStored(this.store);
    if (!s) return;
    this.step = s.step;
    this.phase = "done";
    if (s.step > 0) this.setDefaults(AUTO_QUALITY_DEFAULTS[s.step]);
  }

  /** One rendered frame at `nowMs` (performance.now). Returns the toast text when this frame lowered the look. */
  frame(nowMs: number, f: AutoQualityFrame): string {
    if (this.phase === "done" || this.disabled) return "";
    if (f.capped) {
      this.phase = "idle"; // review H (10.3): Battery saver on: no try now
      return "";
    }
    if (this.phase === "idle") {
      if (!f.firstWave || f.hidden) return "";
      this.phase = "running";
      this.startMs = nowMs;
      this.lastMs = nowMs;
      this.frames = 0;
      return "";
    }
    // Review H2: Phaser stops its loop while the tab is hidden, so `hidden` is rarely seen here; the first frame back
    // after an app switch shows as one long gap. Any gap over the limit cancels this try (nothing stored).
    const gap = nowMs - this.lastMs;
    this.lastMs = nowMs;
    if (gap > AUTO_QUALITY_MAX_GAP_MS) {
      this.phase = "idle";
      return "";
    }
    // running
    if (f.hidden || !f.firstWave) {
      this.phase = "idle"; // cancelled (hidden tab, the wave ended, a restart): the next first wave tries again
      return "";
    }
    this.frames++;
    const elapsed = nowMs - this.startMs;
    if (elapsed < AUTO_QUALITY_WINDOW_MS) return "";
    const fps = (this.frames * 1000) / elapsed; // frames after the first one, over their time
    return this.finish(stepForFps(fps));
  }

  private finish(step: AutoQualityStep): string {
    this.phase = "done";
    this.step = step;
    try {
      this.store()?.setItem(AUTO_QUALITY_KEY, JSON.stringify({ step }));
    } catch {
      // storage unavailable: this page keeps the result, the next one checks again
    }
    if (step === 0) return "";
    const patch = AUTO_QUALITY_DEFAULTS[step];
    this.setDefaults(patch);
    // the toast only when something the player sees changed (every lowered field already chosen by the player: none)
    const mine = this.stored();
    const shows = (Object.keys(patch) as (keyof PlayerSettings)[]).some((k) => mine[k] === undefined);
    return shows ? AUTO_QUALITY_TOAST : "";
  }
}

/** The page's check (main.ts boots it before the game is made; GameScene feeds it frames). Off under `?stress`. */
export const autoQuality = new AutoQuality(() => globalThis.localStorage, setSettingsDefaults, getStoredSettings, typeof location !== "undefined" && urlOptions().stress !== null);
