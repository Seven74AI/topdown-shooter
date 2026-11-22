import type * as Phaser from "phaser";
import { buildingCentreX, buildingCentreY, turretStats, type Building, type World } from "@topdown/shared";

/** Placeholder turret look (Story 9 replaces it): a metal plate over the base, a round head with a barrel. */
const PLATE = 0x4a5560;
const PLATE_EDGE = 0x22282e;
const PLATE_INSET_M = 0.12;
const HEAD = 0x7d8a96;
const HEAD_EDGE = 0x1b1f24;
const HEAD_R_M = 0.28;
const BARREL = 0x2b3138;
const BARREL_LEN_M = 0.7;
const BARREL_W_M = 0.14;
const LINE_M = 0.05;
/** Above the building base (3), below zombies (≥ 5). */
const PLATE_DEPTH = 3.5;
const HEAD_DEPTH = 4;
/** The head turns toward the last shot's aim with this rate (1/s, exponential: frame-rate independent). */
const TURN_RATE = 25;
const TWO_PI = Math.PI * 2;

/**
 * Story 3.6: auto-turrets drawn on top of `BuildingView`'s base (so Story 3.5's damaged look and
 * health bar still show). The plates are one Graphics, redrawn only when the building list changes
 * (`version`); each turret has a pooled head Graphics drawn once (barrel along +x) and turned with
 * `setRotation` toward `Building.aimX/aimY` (solo: the World's; online: set from `turret.fired`),
 * never synced per tick. No allocation per frame.
 */
export class TurretView {
  private readonly plates: Phaser.GameObjects.Graphics;
  private readonly heads: Phaser.GameObjects.Graphics[] = [];
  /** The drawn angle of each head (index = head), and which building id it shows (-1 = none). */
  private angles = new Float64Array(8);
  private headOf = new Int32Array(8).fill(-1);
  private shownVersion = -1;

  constructor(private readonly scene: Phaser.Scene) {
    this.plates = scene.add.graphics().setDepth(PLATE_DEPTH);
  }

  update(world: Readonly<World>, frameDtS: number): void {
    const list = world.buildings.list;
    const relayout = world.buildings.version !== this.shownVersion;
    if (relayout) {
      this.shownVersion = world.buildings.version;
      this.plates.clear();
    }
    const k = 1 - Math.exp(-TURN_RATE * Math.max(0, frameDtS));
    let n = 0;
    for (let i = 0; i < list.length; i++) {
      const b = list[i] as Building;
      if (!turretStats(world.balance, b.type)) continue;
      const head = this.head(n);
      const target = Math.atan2(b.aimY, b.aimX);
      if (this.headOf[n] !== b.id) {
        // A new turret on this head (or the list changed): start at its aim.
        this.headOf[n] = b.id;
        this.angles[n] = target;
      } else {
        let d = (target - (this.angles[n] as number)) % TWO_PI;
        if (d > Math.PI) d -= TWO_PI;
        else if (d < -Math.PI) d += TWO_PI;
        this.angles[n] = (this.angles[n] as number) + d * k;
      }
      const cx = buildingCentreX(b);
      const cy = buildingCentreY(b);
      if (relayout) {
        head.setPosition(cx, cy);
        const g = this.plates;
        g.fillStyle(PLATE, 1).fillRect(b.minX + PLATE_INSET_M, b.minY + PLATE_INSET_M, b.maxX - b.minX - 2 * PLATE_INSET_M, b.maxY - b.minY - 2 * PLATE_INSET_M);
        g.lineStyle(LINE_M, PLATE_EDGE, 1).strokeRect(b.minX + PLATE_INSET_M, b.minY + PLATE_INSET_M, b.maxX - b.minX - 2 * PLATE_INSET_M, b.maxY - b.minY - 2 * PLATE_INSET_M);
      }
      if (!head.visible) head.setVisible(true);
      head.setRotation(this.angles[n] as number);
      n++;
    }
    for (let i = n; i < this.heads.length; i++) {
      const h = this.heads[i] as Phaser.GameObjects.Graphics;
      if (h.visible) h.setVisible(false);
      this.headOf[i] = -1;
    }
  }

  /** Head `i` (created and drawn once, on first use). */
  private head(i: number): Phaser.GameObjects.Graphics {
    let h = this.heads[i];
    if (h) return h;
    h = this.scene.add.graphics().setDepth(HEAD_DEPTH);
    h.fillStyle(BARREL, 1).fillRect(0, -BARREL_W_M / 2, BARREL_LEN_M, BARREL_W_M);
    h.fillStyle(HEAD, 1).fillCircle(0, 0, HEAD_R_M);
    h.lineStyle(LINE_M, HEAD_EDGE, 1).strokeCircle(0, 0, HEAD_R_M);
    this.heads.push(h);
    if (this.headOf.length < this.heads.length) {
      const a = new Float64Array(this.heads.length * 2);
      a.set(this.angles);
      this.angles = a;
      const o = new Int32Array(this.heads.length * 2).fill(-1);
      o.set(this.headOf);
      this.headOf = o;
    }
    return h;
  }

  destroy(): void {
    this.plates.destroy();
    for (const h of this.heads) h.destroy();
    this.heads.length = 0;
  }
}
