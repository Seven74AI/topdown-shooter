import * as Phaser from "phaser";
import { ZOMBIE_TYPES, type Balance, type World } from "@topdown/shared";

const TEX_PX = 64; // texture size; images are scaled to meters
const lerp = (a: number, b: number, t: number): number => a + (b - a) * t;
/** Drawn body is a bit wider than the collision radius (shoulders stick out). */
const BODY_SCALE = 1.25;
const MIN_TURN_MOVE_M = 1e-4;

/** Placeholder top-down person per type: shoulders, head. Faces +x. Named `zombie_<type>_body`. */
function makeTextures(scene: Phaser.Scene): void {
  for (const type of ZOMBIE_TYPES) {
    const key = `zombie_${type}_body`;
    if (scene.textures.exists(key)) continue;
    const g = scene.make.graphics({}, false);
    g.fillStyle(0x3d4a3a, 1).fillEllipse(TEX_PX / 2, TEX_PX / 2, TEX_PX * 0.45, TEX_PX * 0.9); // shoulders
    g.fillStyle(0x56604f, 1).fillCircle(TEX_PX / 2 + 4, TEX_PX / 2, TEX_PX * 0.2); // head
    g.fillStyle(0x2a3328, 1).fillCircle(TEX_PX * 0.72, TEX_PX * 0.22, 5).fillCircle(TEX_PX * 0.72, TEX_PX * 0.78, 5); // arms reaching
    g.generateTexture(key, TEX_PX, TEX_PX);
    g.destroy();
  }
}

/**
 * One pooled Image per zombie slot, created lazily and reused (never a Graphics redraw per zombie
 * per frame). Reads the pool only. Positions are interpolated with the host's alpha.
 */
export class ZombieView {
  private readonly images: (Phaser.GameObjects.Image | undefined)[] = [];
  private readonly shownFrame: Int32Array;
  private readonly lastAngle: Float32Array;
  private frame = 0;

  constructor(
    private readonly scene: Phaser.Scene,
    private readonly balance: Balance,
    capacity: number,
  ) {
    makeTextures(scene);
    this.shownFrame = new Int32Array(capacity).fill(-1);
    this.lastAngle = new Float32Array(capacity);
  }

  update(world: Readonly<World>, alpha: number): void {
    const z = world.zombies;
    const f = ++this.frame;
    for (let i = 0; i < z.aliveCount; i++) {
      const id = z.aliveIds[i] as number;
      const type = ZOMBIE_TYPES[z.type[id] as number] ?? "walker";
      let img = this.images[id];
      if (!img) {
        img = this.scene.add.image(0, 0, `zombie_${type}_body`).setDepth(5);
        this.images[id] = img;
      }
      if (this.shownFrame[id] !== f - 1) {
        // (Re)appearing: a new zombie in this slot, set its texture and size.
        const r = this.balance.zombies.types[type]?.radiusM ?? 0.35;
        img.setTexture(`zombie_${type}_body`).setDisplaySize(r * 2 * BODY_SCALE, r * 2 * BODY_SCALE).setVisible(true);
      }
      const px = z.prevX[id] as number;
      const py = z.prevY[id] as number;
      const cx = z.x[id] as number;
      const cy = z.y[id] as number;
      const mx = cx - px;
      const my = cy - py;
      if (mx * mx + my * my > MIN_TURN_MOVE_M * MIN_TURN_MOVE_M) this.lastAngle[id] = Math.atan2(my, mx);
      img.setPosition(lerp(px, cx, alpha), lerp(py, cy, alpha)).setRotation(this.lastAngle[id] as number);
      this.shownFrame[id] = f;
    }
    // Hide images whose zombie is gone.
    for (let id = 0; id < this.images.length; id++) {
      const img = this.images[id];
      if (img?.visible && this.shownFrame[id] !== f) img.setVisible(false);
    }
  }

  destroy(): void {
    for (const img of this.images) img?.destroy();
    this.images.length = 0;
  }
}
