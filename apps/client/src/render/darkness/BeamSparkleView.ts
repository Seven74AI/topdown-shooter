import * as Phaser from "phaser";
import { isBlackout, type Balance, type World } from "@topdown/shared";
import { ATLAS_FX, FX_RAIN } from "../city/spriteAtlas";
import { aboveDarkness } from "./aboveDark";
import { STAMP_CONE, type DarknessPlan } from "./darknessPlan";

/** Streak look (main2.js › rainInLight): pale blue-white, 0.42 m long, slanted like the rain. */
export const SPARKLE_COLOR = 0xebf0ff;
export const SPARKLE_LEN_M = 0.42;
export const SPARKLE_W_M = 0.035;
const SLANT = 0.22;
/** Streaks per m² of lit area (main2.js: a disc 2.4 per r², a cone 0.9 per range², i.e. per its area). */
export const SPARKLE_PER_M2_DISC = 2.4 / Math.PI;
export const SPARKLE_PER_M2_CONE = 0.9;
/** Cycles per second of a streak (a new spot each cycle). */
const RATE = 3;
const PEAK_ALPHA = 0.55;

/** Story 6.3: a cheap 0–1 hash (the looks page's `hash`). */
function hash(n: number): number {
  const s = Math.sin(n) * 43758.5453;
  return s - Math.floor(s);
}

/**
 * Story 6.3 (AC 7, D7; BL4 without the hot core and the lens flare): rain streaks sparkling inside
 * every drawn beam and floodlight pool, above the darkness (`ABOVE_DARK.sparkle`). Pooled additive
 * images (≤ `maxSparkles`, `?fx=low` halves them), shared over the lights by their lit area; spots
 * hashed per cycle inside each cone/pool, bright near the source and fading to its edge. Only while
 * `isBlackout` (hidden and idle otherwise: F9). Look only: never a light of its own.
 */
export class BeamSparkleView {
  private readonly pool: Phaser.GameObjects.Image[] = [];
  private shown = 0;
  readonly cap: number;

  constructor(scene: Phaser.Scene, balance: Balance, lowFx: boolean) {
    const max = balance.decay.blackout.maxSparkles;
    this.cap = lowFx ? Math.floor(max / 2) : max;
    for (let i = 0; i < this.cap; i++) {
      const img = scene.add.image(0, 0, ATLAS_FX, FX_RAIN).setDisplaySize(SPARKLE_W_M, SPARKLE_LEN_M).setRotation(-Math.atan(SLANT)).setBlendMode(Phaser.BlendModes.ADD).setTint(SPARKLE_COLOR).setVisible(false);
      this.pool.push(aboveDarkness(img, "sparkle"));
    }
  }

  /** Streaks drawn this frame (tests). */
  get drawn(): number {
    return this.shown;
  }

  /** One frame from this frame's darkness plan; `clockS` the paused-aware frame clock. */
  update(world: World, plan: DarknessPlan, clockS: number): void {
    let n = 0;
    if (isBlackout(world) && this.cap > 0) {
      let want = 0;
      for (let j = 0; j < plan.count; j++) if (plan.sparkle[j] === 1) want += this.wanted(plan, j);
      const k = want > this.cap ? this.cap / want : 1;
      for (let j = 0; j < plan.count && n < this.cap; j++) {
        if (plan.sparkle[j] !== 1) continue;
        const m = Math.floor(this.wanted(plan, j) * k);
        const cone = plan.kind[j] === STAMP_CONE;
        const R = plan.radius[j] as number;
        const x0 = plan.x[j] as number;
        const y0 = plan.y[j] as number;
        const face = plan.angle[j] as number;
        const half = ((plan.coneDeg[j] as number) * Math.PI) / 360;
        for (let i = 0; i < m && n < this.cap; i++) {
          const ph = hash(i * 1.37 + x0 * 7.1 + y0);
          const tt = clockS * RATE + ph;
          const cyc = Math.floor(tt);
          const u = tt - cyc;
          const a = cone ? face + (hash(cyc * 1.7 + i * 3.1) - 0.5) * 2 * half : hash(cyc * 1.7 + i * 3.1) * Math.PI * 2;
          const dd = Math.sqrt(hash(cyc * 2.3 + i * 5.7));
          const img = this.pool[n] as Phaser.GameObjects.Image;
          img.setPosition(x0 + Math.cos(a) * dd * R, y0 + Math.sin(a) * dd * R).setAlpha((1 - dd) * PEAK_ALPHA * (1 - u));
          if (!img.visible) img.setVisible(true);
          n++;
        }
      }
    }
    for (let i = n; i < this.shown; i++) (this.pool[i] as Phaser.GameObjects.Image).setVisible(false);
    this.shown = n;
  }

  private wanted(plan: DarknessPlan, j: number): number {
    const R = plan.radius[j] as number;
    if (plan.kind[j] === STAMP_CONE) return ((plan.coneDeg[j] as number) * Math.PI) / 360 * R * R * SPARKLE_PER_M2_CONE;
    return Math.PI * R * R * SPARKLE_PER_M2_DISC;
  }

  destroy(): void {
    for (const img of this.pool) img.destroy();
    this.pool.length = 0;
  }
}
