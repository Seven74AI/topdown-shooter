import * as Phaser from "phaser";
import { BEAR_TRAP_STATE, MAX_PLAYERS, buildingStats, type Balance, type Building, type World } from "@topdown/shared";
import { ATLAS_FX, FX_GLOW } from "./city/spriteAtlas";
import { bearTrapPlateRadius, mineBlinkOn, mineRingRadii, rearmFraction } from "./mineLook";

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
/** Story 5.14: the bear trap's plate ring (steel white), and a sprung trap's "stand here" ring in a wave. */
const PLATE_COLOR = 0xe8ecef;
const PLATE_ALPHA = 0.5;
const SPRUNG_COLOR = 0xffd54a;
const SPRUNG_ALPHA = 0.35;
const REARM_DEPTH = 12;
const REARM_LINE_M = 0.07;
const REARM_RING_M = 0.55;

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
  /** Story 5.14: my re-arm progress arc (redrawn only while I stand on a sprung plate). */
  private readonly rearm: Phaser.GameObjects.Graphics;
  private rearmTrap = 0;
  private rearmMs = 0;

  constructor(scene: Phaser.Scene, balance?: Readonly<Balance>) {
    this.rings = scene.add.graphics().setDepth(RING_DEPTH);
    this.rearm = scene.add.graphics().setDepth(REARM_DEPTH);
    const pool = Math.max(1, (balance?.buildings.maxPerPlayer ?? 6) * MAX_PLAYERS);
    for (let i = 0; i < pool; i++) {
      this.lights.push(scene.add.image(0, 0, ATLAS_FX, FX_GLOW).setDepth(LIGHT_DEPTH).setTint(LIGHT_COLOR).setBlendMode(Phaser.BlendModes.ADD).setDisplaySize(LIGHT_M, LIGHT_M).setVisible(false));
      this.lightIds.push(0);
    }
  }

  /**
   * `me` (optional): my survivor as drawn (the predicted position online) for the Story 5.14 re-arm
   * ring; `dtMs` the frame time it fills by.
   */
  update(world: Readonly<World>, nowMs: number, me?: { readonly x: number; readonly y: number; readonly radiusM: number; readonly alive: boolean }, dtMs = 0): void {
    const phase = world.run.phase;
    if (world.buildings.version !== this.shownVersion || phase !== this.shownPhase) {
      this.shownVersion = world.buildings.version;
      this.shownPhase = phase;
      this.layout(world, phase === "build");
    }
    this.updateRearm(world, me, dtMs);
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
      const stats = buildingStats(world.balance, b.type);
      // Story 5.14 (F2): the plate ring at the sim radius: every trap in a build phase; in a wave only
      // sprung ones (where to stand to re-arm).
      const plate = bearTrapPlateRadius(stats);
      if (plate !== null) {
        const sprung = b.trapState === BEAR_TRAP_STATE.SPRUNG;
        if (build) g.lineStyle(RING_LINE_M, PLATE_COLOR, PLATE_ALPHA).strokeCircle((b.minX + b.maxX) / 2, (b.minY + b.maxY) / 2, plate);
        else if (sprung) g.lineStyle(RING_LINE_M, SPRUNG_COLOR, SPRUNG_ALPHA).strokeCircle((b.minX + b.maxX) / 2, (b.minY + b.maxY) / 2, plate);
        continue;
      }
      const rings = mineRingRadii(stats);
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

  /** Story 5.14: the sprung trap my body is on (same rule as the sim: strict overlap), its fill, or clear. */
  private updateRearm(world: Readonly<World>, me: { readonly x: number; readonly y: number; readonly radiusM: number; readonly alive: boolean } | undefined, dtMs: number): void {
    let on: Building | null = null;
    let rearmS = 0;
    let plateM = 0;
    const phase = world.run.phase;
    if (me && me.alive && (phase === "wave" || phase === "build")) {
      const list = world.buildings.list;
      for (let i = 0; i < list.length && !on; i++) {
        const b = list[i] as Building;
        if (b.trapState !== BEAR_TRAP_STATE.SPRUNG) continue;
        const bt = buildingStats(world.balance, b.type)?.bearTrap;
        if (!bt) continue;
        const dx = me.x - (b.minX + b.maxX) / 2;
        const dy = me.y - (b.minY + b.maxY) / 2;
        const reach = bt.plateRadiusM + me.radiusM;
        if (dx * dx + dy * dy < reach * reach) {
          on = b;
          rearmS = bt.rearmS;
          plateM = bt.plateRadiusM;
        }
      }
    }
    if (!on) {
      if (this.rearmTrap !== 0) this.rearm.clear();
      this.rearmTrap = 0;
      this.rearmMs = 0;
      return;
    }
    if (on.id !== this.rearmTrap) this.rearmMs = 0;
    this.rearmTrap = on.id;
    this.rearmMs += dtMs;
    const f = rearmFraction(this.rearmMs, rearmS);
    const cx = (on.minX + on.maxX) / 2;
    const cy = (on.minY + on.maxY) / 2;
    this.rearm.clear();
    this.rearm.lineStyle(REARM_LINE_M, 0x000000, 0.4).strokeCircle(cx, cy, Math.max(REARM_RING_M, plateM + 0.15));
    this.rearm.lineStyle(REARM_LINE_M, SPRUNG_COLOR, 0.95);
    this.rearm.beginPath();
    this.rearm.arc(cx, cy, Math.max(REARM_RING_M, plateM + 0.15), -Math.PI / 2, -Math.PI / 2 + f * Math.PI * 2, false);
    this.rearm.strokePath();
  }

  destroy(): void {
    this.rearm.destroy();
    this.rings.destroy();
    for (const l of this.lights) l.destroy();
    this.lights.length = 0;
  }
}
