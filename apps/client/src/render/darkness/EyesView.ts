import type * as Phaser from "phaser";
import { ZOMBIE_TYPES, isBlackout, type Balance, type World } from "@topdown/shared";
import { ATLAS_FX, EYES_PX_PER_M, FX_EYES, FX_EYES_BRUTE } from "../city/spriteAtlas";
import { aboveDarkness } from "./aboveDark";

/** Eye alpha (D5, main2.js › eyes: rgba(236,226,150,0.9)). */
export const EYES_ALPHA = 0.9;
/** How far ahead of the body centre the eyes sit, as a share of the body radius (0.13 m on a 0.35 m Walker). */
export const EYES_FORWARD_K = 0.13 / 0.35;
const BRUTE = ZOMBIE_TYPES.indexOf("brute");

/** Reads the zombies' drawn images (ZombieView). */
export interface DrawnZombies {
  drawnImage(id: number): { x: number; y: number; rotation: number; alpha?: number } | undefined;
}

/**
 * Story 6.3 (AC 8, F4, D5): two pale eyes above the darkness on every drawn zombie within `eyesM`
 * of my survivor (6.4 may pass a smaller fog radius), lit or not, at its head along its drawn
 * facing; bigger on a Brute. Pooled images (≤ `maxEyes`, one FX-atlas frame each), depth
 * `ABOVE_DARK.eyes`, only while `isBlackout` (hidden and idle otherwise: F9). A zombie beyond the
 * radius gets no eyes (it stays under the darkness).
 */
export class EyesView {
  private readonly pool: Phaser.GameObjects.Image[] = [];
  private readonly isBrute: Uint8Array;
  private shown = 0;
  private readonly radius: Float32Array;

  constructor(scene: Phaser.Scene, balance: Balance) {
    const max = balance.decay.blackout.maxEyes;
    this.isBrute = new Uint8Array(max);
    this.radius = new Float32Array(ZOMBIE_TYPES.length);
    ZOMBIE_TYPES.forEach((t, i) => (this.radius[i] = balance.zombies.types[t]?.radiusM ?? 0.35));
    for (let i = 0; i < max; i++) {
      const img = scene.add.image(0, 0, ATLAS_FX, FX_EYES).setAlpha(EYES_ALPHA).setVisible(false);
      img.setDisplaySize(16 / EYES_PX_PER_M, 40 / EYES_PX_PER_M);
      this.pool.push(aboveDarkness(img, "eyes"));
    }
  }

  /** Eyes drawn this frame (tests, the perf overlay). */
  get drawn(): number {
    return this.shown;
  }

  /** One frame: my survivor's drawn position; `radiusM` = `eyesM` (or 6.4's fog edge). */
  update(world: World, zombies: DrawnZombies, meX: number, meY: number, radiusM: number): void {
    let n = 0;
    if (isBlackout(world)) {
      const z = world.zombies;
      const r2 = radiusM * radiusM;
      const max = this.pool.length;
      for (let i = 0; i < z.aliveCount && n < max; i++) {
        const id = z.aliveIds[i] as number;
        const d = zombies.drawnImage(id);
        if (!d) continue;
        const dx = d.x - meX;
        const dy = d.y - meY;
        if (dx * dx + dy * dy > r2) continue;
        const type = z.type[id] as number;
        const fwd = (this.radius[type] ?? 0.35) * EYES_FORWARD_K;
        const img = this.pool[n] as Phaser.GameObjects.Image;
        const brute = type === BRUTE ? 1 : 0;
        if (this.isBrute[n] !== brute || !img.visible) {
          this.isBrute[n] = brute;
          img.setFrame(brute ? FX_EYES_BRUTE : FX_EYES);
          if (brute) img.setDisplaySize(24 / EYES_PX_PER_M, 64 / EYES_PX_PER_M);
          else img.setDisplaySize(16 / EYES_PX_PER_M, 40 / EYES_PX_PER_M);
          img.setVisible(true);
        }
        const a = d.rotation;
        // Story 6.4: the eyes fade with their zombie at the fog edge (a hidden zombie is not drawn: no eyes).
        const fade = EYES_ALPHA * (d.alpha ?? 1);
        if (img.alpha !== fade) img.setAlpha(fade);
        img.setPosition(d.x + Math.cos(a) * fwd, d.y + Math.sin(a) * fwd).setRotation(a);
        n++;
      }
    }
    for (let i = n; i < this.shown; i++) (this.pool[i] as Phaser.GameObjects.Image).setVisible(false);
    this.shown = n;
  }

  destroy(): void {
    for (const img of this.pool) img.destroy();
    this.pool.length = 0;
  }
}
