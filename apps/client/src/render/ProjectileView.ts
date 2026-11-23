import type * as Phaser from "phaser";
import type { ProjectilePool } from "@topdown/shared";

const STREAK_M = 0.6;
const STREAK_W_M = 0.07;
const COLOR = 0xffd27a;
/** Story 3.6: turret shots (a projectile with a building id) are cyan, shorter and thinner. */
const TURRET_COLOR = 0x6fe3ff;
const TURRET_STREAK_SCALE = 0.7;
/** Story 5.3: a pellet is a short, hotter streak (8 of them read as one spray). */
const PELLET_COLOR = 0xffe7b0;
const LOOK_GUN = 0;
const LOOK_TURRET = 1;
const LOOK_PELLET = 2;
const lerp = (a: number, b: number, t: number): number => a + (b - a) * t;

/**
 * Pooled bullet streaks, one per projectile slot, interpolated with alpha. Takes a projectile pool as
 * input (local mode reads the World; Epic 2 can feed a cosmetic pool spawned from `weapon.fired`).
 */
export class ProjectileView {
  private readonly streaks: (Phaser.GameObjects.Rectangle | undefined)[] = [];
  private readonly shownFrame: Int32Array;
  /**
   * Per slot: the look drawn (the look changes only when a slot's kind does): `LOOK_GUN`, `LOOK_TURRET`,
   * or `LOOK_PELLET` (Story 5.3: a pellet gun's short streak, same pool, no new object per pellet).
   */
  private readonly look: Uint8Array;
  private frame = 0;

  constructor(
    private readonly scene: Phaser.Scene,
    capacity: number,
    /** Story 5.3: streak length scale by weapon index (`streakScales`); absent = every gun shot full length. */
    private readonly weaponScale: Float32Array | null = null,
  ) {
    this.shownFrame = new Int32Array(capacity).fill(-1);
    this.look = new Uint8Array(capacity);
  }

  update(pool: ProjectilePool, alpha: number): void {
    const f = ++this.frame;
    for (let i = 0; i < pool.aliveCount; i++) {
      const id = pool.aliveIds[i] as number;
      let s = this.streaks[id];
      if (!s) {
        s = this.scene.add.rectangle(0, 0, STREAK_M, STREAK_W_M, COLOR).setOrigin(1, 0.5).setDepth(8);
        this.streaks[id] = s;
        this.look[id] = LOOK_GUN;
      }
      const scale = (pool.building[id] as number) > 0 ? -1 : (this.weaponScale?.[pool.weapon[id] as number] ?? 1);
      const look = scale < 0 ? LOOK_TURRET : scale < 1 ? LOOK_PELLET : LOOK_GUN;
      if (this.look[id] !== look) {
        this.look[id] = look;
        if (look === LOOK_TURRET) s.setFillStyle(TURRET_COLOR).setScale(TURRET_STREAK_SCALE);
        else if (look === LOOK_PELLET) s.setFillStyle(PELLET_COLOR).setScale(scale, 1);
        else s.setFillStyle(COLOR).setScale(1);
      }
      const dx = pool.dirX[id] as number;
      const dy = pool.dirY[id] as number;
      // Rotation every frame: a slot freed and refilled within one frame must not keep the old direction.
      s.setRotation(Math.atan2(dy, dx)).setVisible(true);
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
