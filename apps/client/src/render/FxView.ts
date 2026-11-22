import type * as Phaser from "phaser";
import { buildingStats, footprint, type Balance, type Box, type SimEvent } from "@topdown/shared";
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
/** Story 3.5: building debris. */
const DEBRIS = 0x8b5a2b;
const DEBRIS_PUFFS = 6;
const DEBRIS_MS = 450;

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
  private readonly debrisPuffs: Phaser.GameObjects.Arc[] = [];
  private readonly box: Box = { minX: 0, minY: 0, maxX: 0, maxY: 0 };
  /** Story 3.5: for building footprints (set by GameScene with the host's World balance). */
  balance: Balance | null = null;

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
      case "building.destroyed":
        this.debris(e.buildingId, e.buildingType, e.gx, e.gy, e.rot);
        playSfx("zombie_hit"); // placeholder thud until Story 9's sounds
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

  /** Story 3.5: a building broke: a few wood-coloured puffs around its centre (pooled). */
  private debris(id: number, type: string, gx: number, gy: number, rot: number): void {
    const stats = this.balance ? buildingStats(this.balance, type) : undefined;
    if (!stats) return;
    const b = footprint(stats, gx, gy, rot, this.box); // grid → metres: the one shared helper
    const x = (b.minX + b.maxX) / 2;
    const y = (b.minY + b.maxY) / 2;
    for (let k = 0; k < DEBRIS_PUFFS; k++) {
      const p = this.take(this.debrisPuffs, 0.22, DEBRIS, 6);
      const a = (k / DEBRIS_PUFFS) * Math.PI * 2 + id;
      p.setPosition(x + Math.cos(a) * 0.5, y + Math.sin(a) * 0.3).setScale(0.6).setAlpha(0.9).setVisible(true);
      this.scene.tweens.add({ targets: p, x: x + Math.cos(a) * 1.3, y: y + Math.sin(a) * 0.9, scale: 1.3, alpha: 0, duration: DEBRIS_MS, onComplete: () => p.setVisible(false) });
    }
  }

  private muzzle(x: number, y: number): void {
    const m = this.take(this.flashes, 0.18, 0xffe9a8, 9);
    m.setPosition(x, y).setAlpha(1).setVisible(true);
    this.scene.tweens.add({ targets: m, alpha: 0, duration: MUZZLE_MS, onComplete: () => m.setVisible(false) });
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
    for (const o of [...this.splats, ...this.puffs, ...this.flashes, ...this.swings, ...this.debrisPuffs]) o.destroy();
    this.debrisPuffs.length = 0;
    this.splats.length = 0;
    this.puffs.length = 0;
    this.flashes.length = 0;
    this.swings.length = 0;
  }
}
