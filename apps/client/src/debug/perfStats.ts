/**
 * Frame and simulation timing for the performance overlay and the stress test (Story 1.11).
 * Pure (no Phaser, no DOM): times are passed in, so it is unit-tested. Ring buffers are allocated
 * once; recording a frame or a tick never allocates.
 */

/** Frames kept for the rolling window (≥ 1 s even at 240 Hz). */
export const FRAME_RING = 256;
/** Simulation steps kept (20 Hz → 64 steps ≈ 3 s). */
export const TICK_RING = 64;
/** Rolling window of the overlay, ms. */
export const WINDOW_MS = 1000;
/** A frame longer than this is "under 30 FPS". */
export const FRAME_30FPS_MS = 1000 / 30;
/** Average simulation step above this means the simulation is the bottleneck (Task 7). */
export const SIM_BOTTLENECK_MS = 8;
/** NFR1 targets. */
export const TARGET_AVG_FPS = 60;
export const TARGET_MIN_FPS = 30;
/** A 60 Hz display averages a little under 60 (vsync jitter): 58+ counts as meeting the average. */
const AVG_FPS_TOLERANCE = 2;

/** Rolling numbers over the last second, filled into a caller-owned object (no allocation). */
export interface PerfSnapshot {
  /** Average FPS over the window. */
  fps: number;
  /** Lowest instantaneous FPS (1000 / longest frame) in the window. */
  minFps: number;
  /** Average and longest simulation step in the window, ms. */
  tickAvgMs: number;
  tickMaxMs: number;
  /** Average render time (Phaser render pass, CPU side), ms. */
  renderAvgMs: number;
  /** Average update time (input + scenes + simulation steps), ms. */
  updateAvgMs: number;
}

export const createPerfSnapshot = (): PerfSnapshot => ({
  fps: 0,
  minFps: 0,
  tickAvgMs: 0,
  tickMaxMs: 0,
  renderAvgMs: 0,
  updateAvgMs: 0,
});

export type Bottleneck = "none" | "simulation" | "rendering/GPU";

export interface PerfSummaryResult {
  durationS: number;
  frames: number;
  avgFps: number;
  /** Lowest instantaneous FPS over the run (1000 / longest frame). */
  minFps: number;
  /** Lowest FPS of any whole second of the run. */
  worstSecondFps: number;
  /** Percentage of frames longer than 1/30 s. */
  pctUnder30: number;
  frameAvgMs: number;
  tickAvgMs: number;
  tickMaxMs: number;
  renderAvgMs: number;
  updateAvgMs: number;
  bottleneck: Bottleneck;
  /** NFR1: average ≈ 60 FPS and never below 30. */
  targetMet: boolean;
}

/**
 * "none" when the target is met; otherwise the simulation when the average step exceeds 8 ms,
 * else rendering/GPU. Both numbers are in the report so the call can be checked.
 */
export function bottleneckOf(tickAvgMs: number, targetMet = false): Bottleneck {
  if (targetMet) return "none";
  return tickAvgMs > SIM_BOTTLENECK_MS ? "simulation" : "rendering/GPU";
}

/** Whole-run accumulator for the stress test summary. */
export class PerfSummary {
  private frames = 0;
  private frameMsSum = 0;
  private frameMsMax = 0;
  private under30 = 0;
  private renderMsSum = 0;
  private updateMsSum = 0;
  private ticks = 0;
  private tickMsSum = 0;
  private tickMsMax = 0;
  private startMs = Number.NaN;
  private lastMs = Number.NaN;
  private secondStartMs = Number.NaN;
  private secondFrames = 0;
  private worstSecondFps = Infinity;

  addFrame(nowMs: number, frameMs: number, renderMs: number, updateMs: number): void {
    if (Number.isNaN(this.startMs)) {
      this.startMs = nowMs - frameMs;
      this.secondStartMs = this.startMs;
    }
    this.lastMs = nowMs;
    this.frames++;
    this.frameMsSum += frameMs;
    if (frameMs > this.frameMsMax) this.frameMsMax = frameMs;
    if (frameMs > FRAME_30FPS_MS) this.under30++;
    this.renderMsSum += renderMs;
    this.updateMsSum += updateMs;
    this.secondFrames++;
    while (nowMs - this.secondStartMs >= 1000) {
      // A whole second ended: its frame count is that second's FPS.
      this.worstSecondFps = Math.min(this.worstSecondFps, this.secondFrames);
      this.secondFrames = 0;
      this.secondStartMs += 1000;
    }
  }

  addTick(ms: number): void {
    this.ticks++;
    this.tickMsSum += ms;
    if (ms > this.tickMsMax) this.tickMsMax = ms;
  }

  /** Elapsed ms since the first frame (0 before any frame). */
  elapsedMs(): number {
    return Number.isNaN(this.startMs) ? 0 : this.lastMs - this.startMs;
  }

  result(): PerfSummaryResult {
    const frameAvgMs = this.frames > 0 ? this.frameMsSum / this.frames : 0;
    const avgFps = frameAvgMs > 0 ? 1000 / frameAvgMs : 0;
    const minFps = this.frameMsMax > 0 ? 1000 / this.frameMsMax : 0;
    const tickAvgMs = this.ticks > 0 ? this.tickMsSum / this.ticks : 0;
    const worstSecondFps = Number.isFinite(this.worstSecondFps) ? this.worstSecondFps : avgFps;
    // NFR1: ~60 FPS average and never below 30 — neither a single frame nor a whole second.
    const targetMet = avgFps >= TARGET_AVG_FPS - AVG_FPS_TOLERANCE && minFps >= TARGET_MIN_FPS && worstSecondFps >= TARGET_MIN_FPS;
    return {
      durationS: this.elapsedMs() / 1000,
      frames: this.frames,
      avgFps,
      minFps,
      worstSecondFps,
      pctUnder30: this.frames > 0 ? (this.under30 / this.frames) * 100 : 0,
      frameAvgMs,
      tickAvgMs,
      tickMaxMs: this.tickMsMax,
      renderAvgMs: this.frames > 0 ? this.renderMsSum / this.frames : 0,
      updateAvgMs: this.frames > 0 ? this.updateMsSum / this.frames : 0,
      bottleneck: bottleneckOf(tickAvgMs, targetMet),
      targetMet,
    };
  }
}

/** Rolling frame/tick timing plus the zombie counts the overlay shows. */
export class PerfStats {
  private readonly frameAt = new Float64Array(FRAME_RING);
  private readonly frameMs = new Float32Array(FRAME_RING);
  private readonly renderMs = new Float32Array(FRAME_RING);
  private readonly updateMs = new Float32Array(FRAME_RING);
  private frameHead = 0;
  private frameCount = 0;
  private readonly tickAt = new Float64Array(TICK_RING);
  private readonly tickMs = new Float32Array(TICK_RING);
  private tickHead = 0;
  private tickCount = 0;
  /** Alive zombies, and alive zombies inside the camera view (set by the GameScene each frame). */
  alive = 0;
  inView = 0;
  /** The overlay is shown (`?debug=1`, three-finger tap, or the stress scenario). */
  overlayOn = false;
  /** Whole-run accumulator while a stress test runs. */
  summary: PerfSummary | null = null;

  recordFrame(nowMs: number, frameMs: number, renderMs: number, updateMs: number): void {
    const i = this.frameHead;
    this.frameAt[i] = nowMs;
    this.frameMs[i] = frameMs;
    this.renderMs[i] = renderMs;
    this.updateMs[i] = updateMs;
    this.frameHead = (i + 1) % FRAME_RING;
    if (this.frameCount < FRAME_RING) this.frameCount++;
    this.summary?.addFrame(nowMs, frameMs, renderMs, updateMs);
  }

  recordTick(nowMs: number, ms: number): void {
    const i = this.tickHead;
    this.tickAt[i] = nowMs;
    this.tickMs[i] = ms;
    this.tickHead = (i + 1) % TICK_RING;
    if (this.tickCount < TICK_RING) this.tickCount++;
    this.summary?.addTick(ms);
  }

  /** Fills `out` with the numbers of the last `windowMs` ending at `nowMs`. */
  snapshot(nowMs: number, out: PerfSnapshot, windowMs = WINDOW_MS): PerfSnapshot {
    let n = 0;
    let sum = 0;
    let max = 0;
    let render = 0;
    let update = 0;
    for (let k = 0; k < this.frameCount; k++) {
      const i = (this.frameHead - 1 - k + FRAME_RING) % FRAME_RING;
      if (nowMs - (this.frameAt[i] as number) > windowMs) break; // newest first: the rest are older
      const f = this.frameMs[i] as number;
      n++;
      sum += f;
      if (f > max) max = f;
      render += this.renderMs[i] as number;
      update += this.updateMs[i] as number;
    }
    out.fps = sum > 0 ? (n * 1000) / sum : 0;
    out.minFps = max > 0 ? 1000 / max : 0;
    out.renderAvgMs = n > 0 ? render / n : 0;
    out.updateAvgMs = n > 0 ? update / n : 0;
    let tn = 0;
    let tsum = 0;
    let tmax = 0;
    for (let k = 0; k < this.tickCount; k++) {
      const i = (this.tickHead - 1 - k + TICK_RING) % TICK_RING;
      if (nowMs - (this.tickAt[i] as number) > windowMs) break;
      const t = this.tickMs[i] as number;
      tn++;
      tsum += t;
      if (t > tmax) tmax = t;
    }
    out.tickAvgMs = tn > 0 ? tsum / tn : 0;
    out.tickMaxMs = tmax;
    return out;
  }

  /** Returns this instance to its just-constructed state (used to isolate tests that share `perf`). */
  reset(): void {
    this.frameAt.fill(0);
    this.frameMs.fill(0);
    this.renderMs.fill(0);
    this.updateMs.fill(0);
    this.frameHead = 0;
    this.frameCount = 0;
    this.tickAt.fill(0);
    this.tickMs.fill(0);
    this.tickHead = 0;
    this.tickCount = 0;
    this.alive = 0;
    this.inView = 0;
    this.overlayOn = false;
    this.summary = null;
  }
}

/** Counts alive zombies whose position is inside the view rectangle (world meters). */
export function countInView(
  xs: ArrayLike<number>,
  ys: ArrayLike<number>,
  aliveIds: ArrayLike<number>,
  aliveCount: number,
  viewX: number,
  viewY: number,
  viewW: number,
  viewH: number,
): number {
  let n = 0;
  const x1 = viewX + viewW;
  const y1 = viewY + viewH;
  for (let i = 0; i < aliveCount; i++) {
    const id = aliveIds[i] as number;
    const x = xs[id] as number;
    const y = ys[id] as number;
    if (x >= viewX && x <= x1 && y >= viewY && y <= y1) n++;
  }
  return n;
}

/** The one instance the probe, the GameScene and the overlay share. */
export const perf = new PerfStats();
