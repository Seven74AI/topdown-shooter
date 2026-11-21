import type * as Phaser from "phaser";
import type { ProjectilePool } from "@topdown/shared";

const STREAK_M = 0.6;
const STREAK_W_M = 0.07;
const COLOR = 0xffd27a;
const lerp = (a: number, b: number, t: number): number => a + (b - a) * t;

/**
 * Pooled bullet streaks, one per projectile slot, interpolated with alpha. Takes a projectile pool as
 * input (local mode reads the World; Epic 2 can feed a cosmetic pool spawned from `weapon.fired`).
 */
export class ProjectileView {
  private readonly streaks: (Phaser.GameObjects.Rectangle | undefined)[] = [];
  private readonly shownFrame: Int32Array;
  private frame = 0;

  constructor(
    private readonly scene: Phaser.Scene,
    capacity: number,
  ) {
    this.shownFrame = new Int32Array(capacity).fill(-1);
  }

  update(pool: ProjectilePool, alpha: number): void {
    const f = ++this.frame;
    for (let i = 0; i < pool.aliveCount; i++) {
      const id = pool.aliveIds[i] as number;
      let s = this.streaks[id];
      if (!s) {
        s = this.scene.add.rectangle(0, 0, STREAK_M, STREAK_W_M, COLOR).setOrigin(1, 0.5).setDepth(8);
        this.streaks[id] = s;
      }
      const dx = pool.dirX[id] as number;
      const dy = pool.dirY[id] as number;
      if (this.shownFrame[id] !== f - 1) s.setRotation(Math.atan2(dy, dx)).setVisible(true);
      s.setPosition(lerp(pool.prevX[id] as number, pool.x[id] as number, alpha), lerp(pool.prevY[id] as number, pool.y[id] as number, alpha));
      this.shownFrame[id] = f;
    }
    for (let id = 0; id < this.streaks.length; id++) {
      const s = this.streaks[id];
      if (s?.visible && this.shownFrame[id] !== f) s.setVisible(false);
    }
  }

  destroy(): void {
    for (const s of this.streaks) s?.destroy();
    this.streaks.length = 0;
  }
}
