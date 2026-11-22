import type * as Phaser from "phaser";
import type { CoverKind, CoverObject, World } from "@topdown/shared";

/**
 * Story 4.2: the cover active at the current decay stage (`world.obstacles.cover`), placeholder look
 * (Story 4.9 does the Dead City one): cars and the bus as solid bodies (they stop bullets), barriers
 * and sandbags lighter with a stripe (bodies only: bullets fly over them). Redrawn only when
 * `obstacles.version` changes (one compare per frame); the bus is drawn by the street as its
 * collision box, so it is skipped here.
 */
const LOOK: Readonly<Record<CoverKind, { fill: number; edge: number; stripe: number | null }>> = {
  car: { fill: 0x4d5a6b, edge: 0x1b2027, stripe: null },
  bus: { fill: 0x8a6a1e, edge: 0x3a2c0a, stripe: null },
  barrier: { fill: 0xb8b8b8, edge: 0x3a3a3a, stripe: 0xc0392b },
  sandbags: { fill: 0x9c8455, edge: 0x4a3d22, stripe: 0x7d6a42 },
};
const EDGE_M = 0.1;
const STRIPE_M = 0.08;
const STRIPE_STEP_M = 0.6;
/** Above the street (0), below blood/trails and buildings (3). */
const COVER_DEPTH = 1;

export class CoverView {
  private readonly g: Phaser.GameObjects.Graphics;
  private shownVersion = -1;
  private shownWorld: World | null = null;

  constructor(scene: Phaser.Scene) {
    this.g = scene.add.graphics().setDepth(COVER_DEPTH);
  }

  update(world: World): void {
    const o = world.obstacles;
    if (o.version === this.shownVersion && world === this.shownWorld) return;
    this.shownVersion = o.version;
    this.shownWorld = world;
    const g = this.g;
    g.clear();
    for (const c of o.cover) if (c.kind !== "bus") this.drawOne(c);
  }

  destroy(): void {
    this.g.destroy();
  }

  private drawOne(c: CoverObject): void {
    const g = this.g;
    const look = LOOK[c.kind];
    const w = c.maxX - c.minX;
    const h = c.maxY - c.minY;
    g.fillStyle(look.fill, 1).fillRect(c.minX, c.minY, w, h);
    if (look.stripe !== null) {
      g.lineStyle(STRIPE_M, look.stripe, 1);
      const long = w >= h;
      const len = long ? w : h;
      for (let s = STRIPE_STEP_M / 2; s < len; s += STRIPE_STEP_M) {
        if (long) g.lineBetween(c.minX + s, c.minY, c.minX + s, c.maxY);
        else g.lineBetween(c.minX, c.minY + s, c.maxX, c.minY + s);
      }
    }
    g.lineStyle(EDGE_M, look.edge, 1).strokeRect(c.minX + EDGE_M / 2, c.minY + EDGE_M / 2, w - EDGE_M, h - EDGE_M);
  }
}
