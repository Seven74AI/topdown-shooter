import * as Phaser from "phaser";
import { MAX_PLAYERS, buildingStats, type Balance, type Building, type World } from "@topdown/shared";
import { ATLAS_FX, FX_GLOW } from "./city/spriteAtlas";
import { mineBlinkOn, mineRingRadii } from "./mineLook";

/** Above the floor and the walls, under bodies (zombies 5). */
const RING_DEPTH = 3.1;
const LIGHT_DEPTH = 4.9;
const RING_LINE_M = 0.04;
const TRIGGER_COLOR = 0xff5a46;
const BLAST_COLOR = 0xffb74d;
const TRIGGER_ALPHA = 0.45;
const BLAST_ALPHA = 0.28;
const LIGHT_COLOR = 0xff2a1a;
/** The glow's display size (m) and alpha when lit; a dim ember when off. */
const LIGHT_M = 0.4;
const LIGHT_ON_ALPHA = 0.95;
const LIGHT_OFF_ALPHA = 0.12;
/** The light sits in the middle of the pressure plate (designer pick N6). */
const LIGHT_OFFSET_Y_M = 0;

/**
 * Story 5.9 (F4): every placed mine's two circles (trigger 1 m, blast 2.5 m: the balance radii, the
 * shared `mineRingRadii`) faintly in a build phase, for every player; during a wave a small red light
 * blinking on each mine. The rings are one Graphics redrawn only when the buildings or the phase
 * change; the lights are pooled glow images (≤ every player's whole allowance), only their alpha
 * changes per frame. No allocation per frame.
 */
export class MineView {
  private readonly rings: Phaser.GameObjects.Graphics;
  private readonly lights: Phaser.GameObjects.Image[] = [];
  private readonly lightIds: number[] = [];
  private lightCount = 0;
  private shownVersion = -1;
  private shownPhase = "";

  constructor(scene: Phaser.Scene, balance?: Readonly<Balance>) {
    this.rings = scene.add.graphics().setDepth(RING_DEPTH);
    const pool = Math.max(1, (balance?.buildings.maxPerPlayer ?? 6) * MAX_PLAYERS);
    for (let i = 0; i < pool; i++) {
      this.lights.push(scene.add.image(0, 0, ATLAS_FX, FX_GLOW).setDepth(LIGHT_DEPTH).setTint(LIGHT_COLOR).setBlendMode(Phaser.BlendModes.ADD).setDisplaySize(LIGHT_M, LIGHT_M).setVisible(false));
      this.lightIds.push(0);
    }
  }

  update(world: Readonly<World>, nowMs: number): void {
    const phase = world.run.phase;
    if (world.buildings.version !== this.shownVersion || phase !== this.shownPhase) {
      this.shownVersion = world.buildings.version;
      this.shownPhase = phase;
      this.layout(world, phase === "build");
    }
    if (phase !== "wave") return;
    for (let i = 0; i < this.lightCount; i++) {
      (this.lights[i] as Phaser.GameObjects.Image).setAlpha(mineBlinkOn(nowMs, this.lightIds[i] as number) ? LIGHT_ON_ALPHA : LIGHT_OFF_ALPHA);
    }
  }

  private layout(world: Readonly<World>, build: boolean): void {
    const g = this.rings;
    g.clear();
    const list = world.buildings.list;
    let n = 0;
    for (let i = 0; i < list.length; i++) {
      const b = list[i] as Building;
      if (b.solid) continue;
      const rings = mineRingRadii(buildingStats(world.balance, b.type));
      if (!rings) continue;
      const cx = (b.minX + b.maxX) / 2;
      const cy = (b.minY + b.maxY) / 2;
      if (build) {
        g.lineStyle(RING_LINE_M, TRIGGER_COLOR, TRIGGER_ALPHA).strokeCircle(cx, cy, rings.triggerM);
        g.lineStyle(RING_LINE_M, BLAST_COLOR, BLAST_ALPHA).strokeCircle(cx, cy, rings.blastM);
      }
      if (n < this.lights.length) {
        this.lightIds[n] = b.id;
        (this.lights[n] as Phaser.GameObjects.Image).setPosition(cx, cy + LIGHT_OFFSET_Y_M).setAlpha(LIGHT_OFF_ALPHA).setVisible(true);
        n++;
      }
    }
    for (let i = n; i < this.lightCount; i++) (this.lights[i] as Phaser.GameObjects.Image).setVisible(false);
    this.lightCount = n;
  }

  destroy(): void {
    this.rings.destroy();
    for (const l of this.lights) l.destroy();
    this.lights.length = 0;
  }
}
