import type * as Phaser from "phaser";
import { BOSS_STATE, castVote, setBuildReady, skipWave } from "@topdown/shared";
import { textureRegistry } from "../render/gfx/textureRegistry";
import { uiStore } from "../ui/uiState";

/**
 * Story 10.3 (T2, B1, B2): the dev-only memory probe and run driver of `tools/perf/memoryRun.cjs`. Dev builds only:
 * `main.ts` imports this module inside its `import.meta.env.DEV` block (never in a release bundle:
 * `tools/checks/noCheatsInRelease.test.ts` lists `__mem`). Nothing here runs per frame: every function is called by
 * the script at a sample, so it may allocate.
 *
 * - `__mem()`: Phaser's textures (count, Σ width × height × 4 over every source = the "GPU texture memory" estimate,
 *   headless Chromium has no GPU memory metric) and the 2D canvases in `textureRegistry`.
 * - `__memRun`: drives the solo run as the cheat panel would (god mode, the stress fire input, Ready, the Extract
 *   vote, skip wave, Game over, Restart) and reads where the run is.
 */

interface SoloScene {
  /** GameScene's private fields, read and set from the dev tools only (like DevCheats). */
  localHost: { world: import("@topdown/shared").World; localPlayerId: string } | null;
  stressFire: boolean;
  restartRun(seed?: number): void;
}

export interface MemSample {
  textures: number;
  textureMB: number;
  canvases: number;
  registered: number;
}

export function memSample(game: Phaser.Game): MemSample {
  let bytes = 0;
  let textures = 0;
  const list = game.textures.list as Record<string, Phaser.Textures.Texture>;
  for (const key of Object.keys(list)) {
    const t = list[key];
    if (!t) continue;
    textures++;
    for (const s of t.source) bytes += s.width * s.height * 4;
  }
  return { textures, textureMB: +(bytes / 1048576).toFixed(1), canvases: textureRegistry.canvasCount, registered: textureRegistry.size };
}

export function installMemProbe(game: Phaser.Game): void {
  // B4: the frames Phaser actually drew (with Battery saver on, rAF still runs at the display rate; the draw skips).
  let drawn = 0;
  game.events.on("postrender", () => {
    drawn++;
  });
  const scene = (): SoloScene | null => (game.scene.isActive("Game") ? (game.scene.getScene("Game") as unknown as SoloScene) : null);
  const world = () => scene()?.localHost?.world ?? null;
  const me = () => scene()?.localHost?.localPlayerId ?? "";
  const run = {
    /** God mode + the stress scenario's fire input (holds fire at the nearest zombie). */
    setup(): boolean {
      const s = scene();
      const w = world();
      if (!s || !w) return false;
      w.debug.godMode = true;
      s.stressFire = true;
      return true;
    },
    /** B4 windows: the stress fire input on / off (off: the wave's horde stays on screen for the whole window). */
    fire(on: boolean): void {
      const s = scene();
      if (s) s.stressFire = on;
    },
    state() {
      const w = world();
      const ui = uiStore.get().kind;
      if (!w) return { ui, phase: null, wave: 0, stage: 0, boss: false, bossDead: false, alive: 0, ending: null, tick: 0 };
      return {
        ui,
        phase: w.run.phase,
        wave: w.waves.number,
        stage: w.decay.stage,
        boss: w.boss.state !== BOSS_STATE.NONE,
        bossDead: w.boss.state === BOSS_STATE.DEAD,
        alive: w.zombies.aliveCount,
        ending: w.run.ending,
        tick: w.tick,
      };
    },
    ready(): void {
      const w = world();
      if (w && w.run.phase === "build") setBuildReady(w, me(), true);
    },
    voteExtract(): void {
      const w = world();
      if (w) castVote(w, me(), "extract");
    },
    skipWave(): void {
      const w = world();
      if (w) skipWave(w);
    },
    /** Game over (the B5 restart loop: wave 1 → Game over → Restart): my survivor is out, the sim's own wipe follows. */
    gameOver(): void {
      const p = world()?.players.get(me());
      if (p) p.status = "out";
    },
    restart(): void {
      uiStore.request("restart");
    },
    /** A run on a pinned seed (the B4 windows compare Battery saver off / on on the same run). */
    seed(seed: number): void {
      scene()?.restartRun(seed);
    },
    drawn: () => drawn,
  };
  Object.assign(window, { __mem: () => memSample(game), __memRun: run });
}
