import * as Phaser from "phaser";
import type { ZombiePool } from "@topdown/shared";
import { MultiTapDetector } from "./multiTap";
import { countInView, perf } from "./perfStats";
import { stressRun } from "./stressScenario";
import type { SimStepStats } from "../sim/LocalSimHost";

/** A gap longer than this is a hidden tab or a debugger pause, not a frame: not recorded. */
const MAX_FRAME_MS = 1000;

/**
 * Hooks the Phaser game loop to time every frame (Story 1.11): frame interval (PRE_STEP to PRE_STEP),
 * update time (PRE_STEP → POST_STEP: input, scenes, simulation steps) and render time (POST_STEP →
 * POST_RENDER, CPU side; with WebGL the GPU work runs later and shows up as frame time). Also listens
 * for the three-finger tap that toggles the overlay. Installed once per page; works in release.
 */
export function installPerfProbe(game: Phaser.Game, overlayOnAtStart: boolean): void {
  perf.overlayOn = perf.overlayOn || overlayOnAtStart;
  let frameStart = Number.NaN;
  let frameMs = 0;
  let updateStart = 0;
  let updateMs = 0;
  let renderStart = 0;
  game.events.on(Phaser.Core.Events.PRE_STEP, () => {
    const now = performance.now();
    frameMs = Number.isNaN(frameStart) ? 0 : now - frameStart;
    frameStart = now;
    updateStart = now;
  });
  game.events.on(Phaser.Core.Events.POST_STEP, () => {
    const now = performance.now();
    updateMs = now - updateStart;
    renderStart = now;
  });
  game.events.on(Phaser.Core.Events.POST_RENDER, () => {
    const now = performance.now();
    if (frameMs > 0 && frameMs < MAX_FRAME_MS) perf.recordFrame(now, frameMs, now - renderStart, updateMs);
    stressRun.frame(now);
  });

  const tap = new MultiTapDetector(3, 300);
  window.addEventListener(
    "touchstart",
    (e: TouchEvent) => {
      for (let i = 0; i < e.changedTouches.length; i++) {
        if (tap.touchStart(e.timeStamp, e.touches.length)) perf.overlayOn = !perf.overlayOn;
      }
    },
    { passive: true, capture: true },
  );
}

/**
 * The GameScene's per-frame report: this frame's simulation step times and the zombie counts.
 * "In view" (alive zombies inside the camera's view rectangle) is only counted while someone looks.
 */
export function recordSimFrame(
  stats: SimStepStats,
  zombies: ZombiePool,
  viewX: number,
  viewY: number,
  viewW: number,
  viewH: number,
): void {
  const now = performance.now();
  for (let i = 0; i < stats.lastUpdateSteps; i++) perf.recordTick(now, stats.stepMs[i] as number);
  perf.alive = zombies.aliveCount;
  if (perf.overlayOn || perf.summary) {
    perf.inView = countInView(zombies.x, zombies.y, zombies.aliveIds, zombies.aliveCount, viewX, viewY, viewW, viewH);
  }
}
