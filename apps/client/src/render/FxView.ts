import type * as Phaser from "phaser";
import type { SimEvent } from "@topdown/shared";
import { playSfx } from "../audio/placeholderSfx";
import type { ZombieView } from "./ZombieView";

const SPLAT_CAP = 200;
const SPLAT_FADE_MS = 10_000;
const SPLAT_RADIUS_M = 0.35;
const PUFF_MS = 200;
const MUZZLE_MS = 50;
const SWING_MS = 120;
const SWING_COLOR = 0xe8eef2;
const SWING_ALPHA = 0.35;
const DEG_TO_RAD = Math.PI / 180;
const BLOOD = 0x5a0f0f;
/** Story 3.7: a green ring that grows from the repaired building's centre. */
const REPAIR_COLOR = 0x7cff8a;
const REPAIR_RING_M = 0.6;
const REPAIR_MS = 450;

/**
 * The client-side event dispatcher for effects: hit flashes, blood splats, death puffs, muzzle
 * flashes, melee swing arcs and placeholder sounds. GameScene drains events once per frame and passes each one here.
 */
export class FxView {
  private readonly splats: Phaser.GameObjects.Arc[] = [];
  private nextSplat = 0;
  private readonly puffs: Phaser.GameObjects.Arc[] = [];
  private readonly flashes: Phaser.GameObjects.Arc[] = [];
  private readonly swings: Phaser.GameObjects.Graphics[] = [];
  private readonly repairs: Phaser.GameObjects.Arc[] = [];

  constructor(
    private readonly scene: Phaser.Scene,
    private readonly zombies: ZombieView,
    private readonly localPlayerId: string,
  ) {}

  handle(e: SimEvent): void {
    switch (e.type) {
      case "zombie.hit":
        this.zombies.flash(e.zombieId);
        playSfx("zombie_hit");
        break;
      case "zombie.killed":
        this.splat(e.x, e.y);
        this.puff(e.x, e.y);
        break;
      case "weapon.fired":
        this.muzzle(e.x, e.y);
        if (e.playerId === this.localPlayerId) playSfx("weapon_pistol_fire");
        break;
      case "melee.swung":
        this.swing(e.x, e.y, e.dirX, e.dirY, e.arcDeg, e.rangeM);
        if (e.playerId === this.localPlayerId) playSfx("weapon_machete_swing");
        break;
      case "weapon.reload_started":
        if (e.playerId === this.localPlayerId) playSfx("weapon_reload_start");
        break;
      case "weapon.reloaded":
        if (e.playerId === this.localPlayerId) playSfx("weapon_reloaded");
        break;
      case "building.repaired":
        this.repaired(e.x, e.y);
        if (e.playerId === this.localPlayerId) playSfx("building_repaired");
        break;
      default:
        break;
    }
  }

  private splat(x: number, y: number): void {
    // Ring buffer of decals: the oldest is reused once the cap is reached (memory stays flat).
    let s = this.splats[this.nextSplat];
    if (!s) {
      s = this.scene.add.circle(0, 0, SPLAT_RADIUS_M, BLOOD).setDepth(1);
      this.splats[this.nextSplat] = s;
    }
    this.nextSplat = (this.nextSplat + 1) % SPLAT_CAP;
    this.scene.tweens.killTweensOf(s);
    s.setPosition(x, y).setAlpha(0.85).setVisible(true);
    this.scene.tweens.add({ targets: s, alpha: 0, duration: SPLAT_FADE_MS, onComplete: () => s.setVisible(false) });
  }

  private take(pool: Phaser.GameObjects.Arc[], radius: number, color: number, depth: number): Phaser.GameObjects.Arc {
    const free = pool.find((o) => !o.visible);
    if (free) return free;
    const o = this.scene.add.circle(0, 0, radius, color).setDepth(depth).setVisible(false);
    pool.push(o);
    return o;
  }

  private puff(x: number, y: number): void {
    const p = this.take(this.puffs, 0.3, 0x8a1c1c, 6);
    p.setPosition(x, y).setScale(0.5).setAlpha(0.8).setVisible(true);
    this.scene.tweens.add({ targets: p, scale: 1.4, alpha: 0, duration: PUFF_MS, onComplete: () => p.setVisible(false) });
  }

  private muzzle(x: number, y: number): void {
    const m = this.take(this.flashes, 0.18, 0xffe9a8, 9);
    m.setPosition(x, y).setAlpha(1).setVisible(true);
    this.scene.tweens.add({ targets: m, alpha: 0, duration: MUZZLE_MS, onComplete: () => m.setVisible(false) });
  }

  /** Story 3.7: a pooled green ring at a repaired building (stroke only, grows and fades). */
  private repaired(x: number, y: number): void {
    let r = this.repairs.find((o) => !o.visible);
    if (!r) {
      r = this.scene.add.circle(0, 0, REPAIR_RING_M).setStrokeStyle(0.1, REPAIR_COLOR, 1).setDepth(9).setVisible(false);
      this.repairs.push(r);
    }
    const ring = r;
    ring.setPosition(x, y).setScale(0.4).setAlpha(1).setVisible(true);
    this.scene.tweens.add({ targets: ring, scale: 2, alpha: 0, duration: REPAIR_MS, onComplete: () => ring.setVisible(false) });
  }

  /** Translucent arc wedge for a melee swing: a pooled Graphics, redrawn only on the swing, then hidden. */
  private swing(x: number, y: number, dirX: number, dirY: number, arcDeg: number, rangeM: number): void {
    let g = this.swings.find((o) => !o.visible);
    if (!g) {
      g = this.scene.add.graphics().setDepth(7).setVisible(false);
      this.swings.push(g);
    }
    const graphics = g;
    const facing = Math.atan2(dirY, dirX);
    const half = (arcDeg / 2) * DEG_TO_RAD;
    graphics.clear();
    graphics.fillStyle(SWING_COLOR, SWING_ALPHA);
    graphics.slice(0, 0, rangeM, facing - half, facing + half, false);
    graphics.fillPath();
    graphics.setPosition(x, y).setAlpha(1).setVisible(true);
    this.scene.tweens.add({ targets: graphics, alpha: 0, duration: SWING_MS, onComplete: () => graphics.setVisible(false) });
  }

  destroy(): void {
    for (const o of [...this.splats, ...this.puffs, ...this.flashes, ...this.swings, ...this.repairs]) o.destroy();
    this.splats.length = 0;
    this.puffs.length = 0;
    this.flashes.length = 0;
    this.swings.length = 0;
    this.repairs.length = 0;
  }
}
