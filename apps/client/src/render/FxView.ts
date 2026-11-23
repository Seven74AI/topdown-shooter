import type * as Phaser from "phaser";
import { buildingStats, footprint, type Balance, type Box, type SimEvent } from "@topdown/shared";
import { playSfx } from "../audio/placeholderSfx";
import type { ZombieView } from "./ZombieView";
import { blastLengthFor, fireSfxFor, muzzleScaleFor, swingLookFor, swingSfxFor } from "./weaponLook";
import { SPARK_BLOOD, SPARK_STEEL, SawClock, SparkPool } from "./meleeFx";

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
/** Story 3.7: a green ring that grows from the repaired building's centre. */
const REPAIR_COLOR = 0x7cff8a;
const REPAIR_RING_M = 0.6;
const REPAIR_MS = 450;
/** Story 5.9: the mine blast FX (sizes in m, times in ms). */
const BLAST_FLASH_M = 0.9;
const BLAST_FLASH_MS = 120;
const BLAST_FIRE_M = 1.2;
const BLAST_FIRE_MS = 380;
const BLAST_RING_MS = 320;
const BLAST_RING_CAP = 24;
const BLAST_SMOKE_PUFFS = 6;
const BLAST_SMOKE_MS = 900;
/** Story 5.3: the Shotgun's blast cone (warm outer cone, brighter core), fading quickly. */
const BLAST_OUTER = 0xffc46b;
const BLAST_INNER = 0xfff1c4;
const BLAST_MS = 110;
/** Story 5.2: the Fire Axe's heavy arc (wider fade, a warm smear on the leading edge). */
const AXE_SWING_MS = 200;
const AXE_FILL = 0xf2e6dc;
const AXE_FILL_ALPHA = 0.3;
const AXE_EDGE = 0xffd2b8;
const AXE_EDGE_M = 0.22;
/** Story 5.2: the Chainsaw's faint standing wedge (refreshed every 0.1 s while it cuts) and its sparks. */
const SAW_FILL = 0xffc98a;
const SAW_FILL_ALPHA = 0.16;
const SAW_SWING_MS = 140;
const SPARK_STEEL_COLOR = 0xffe2a0;
const SPARK_BLOOD_COLOR = 0x8a1010;
const SPARK_M = 0.1;

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
  /** Story 5.3: pooled blast cones (a few at most: 4 Shotguns × 1.2 shots/s × 0.11 s). */
  private readonly blasts: Phaser.GameObjects.Graphics[] = [];
  private readonly debrisPuffs: Phaser.GameObjects.Arc[] = [];
  private readonly box: Box = { minX: 0, minY: 0, maxX: 0, maxY: 0 };
  /** Story 3.5: for building footprints (set by GameScene with the host's World balance). */
  balance: Balance | null = null;
  private readonly repairs: Phaser.GameObjects.Arc[] = [];
  /** Story 5.9: mine blast pools (each grows only to the most blasts on screen at once) and the upgrade ring. */
  private readonly blastFlashes: Phaser.GameObjects.Arc[] = [];
  private readonly blastFires: Phaser.GameObjects.Arc[] = [];
  private readonly blastRings: Phaser.GameObjects.Arc[] = [];
  private readonly blastSmoke: Phaser.GameObjects.Arc[] = [];
  private readonly upgrades: Phaser.GameObjects.Arc[] = [];
  /** Story 5.2: next swing Graphics to reuse once the pool is at `fx.maxSwingArcs` (oldest first). */
  private nextSwing = 0;
  /** Story 5.2: the Chainsaw's sparks (fixed pool, drawn into one Graphics per frame). */
  private sparks: SparkPool | null = null;
  private sparkGfx: Phaser.GameObjects.Graphics | null = null;
  /** Story 5.2: when each player's Chainsaw last cut (running frame, my rev loop). */
  saw: SawClock | null = null;
  /**
   * Story 5.2: zombies in a swing's arc as drawn on this client (my own Chainsaw swings online are
   * local events without the server's hit count); set by GameScene.
   */
  cutCount: ((x: number, y: number, dirX: number, dirY: number, arcDeg: number, rangeM: number) => number) | null = null;

  constructor(
    private readonly scene: Phaser.Scene,
    private readonly zombies: ZombieView,
    private readonly localPlayerId: string,
    /** Story 3.6 review L2: the owner of a building id (the turret click plays only for mine or on screen). */
    private readonly buildingOwner: (buildingId: number) => string | undefined = () => undefined,
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
        this.muzzle(e.x, e.y, muzzleScaleFor(e.weapon)); // Story 5.3: flash size and sound by weapon
        if (blastLengthFor(e.weapon) > 0) this.blast(e.x, e.y, e.dirX, e.dirY, e.weapon);
        if (e.playerId === this.localPlayerId) playSfx(fireSfxFor(e.weapon));
        break;
      case "turret.fired": // Story 3.6 (online the host put the muzzle at its building; NaN = no building)
        if (Number.isFinite(e.x) && Number.isFinite(e.y)) {
          this.muzzle(e.x, e.y);
          // Review L2: the click only for my turrets or one in the camera's view.
          if (this.buildingOwner(e.buildingId) === this.localPlayerId || this.scene.cameras.main.worldView.contains(e.x, e.y)) playSfx("turret_fire");
        }
        break;
      case "melee.swung": {
        // Story 5.2: the swing's look by weapon; every look draws exactly the sim's sector (F1).
        const look = swingLookFor(e.weapon);
        if (look === "saw") this.sawCut(e.playerId, e.x, e.y, e.dirX, e.dirY, e.arcDeg, e.rangeM, e.hits);
        else this.swing(e.x, e.y, e.dirX, e.dirY, e.arcDeg, e.rangeM, look === "heavy");
        const sfx = swingSfxFor(e.weapon);
        if (sfx && e.playerId === this.localPlayerId) playSfx(sfx);
        break;
      }
      case "weapon.reload_started":
        if (e.playerId === this.localPlayerId) playSfx("weapon_reload_start");
        break;
      case "weapon.reloaded":
        if (e.playerId === this.localPlayerId) playSfx("weapon_reloaded");
        break;
      case "mine.exploded": // Story 5.9: flash + fireball + shock ring + smoke (pooled)
        this.mineBlast(e.x, e.y);
        playSfx("building_mine_blast");
        break;
      case "building.upgraded": // Story 5.9: a steel-blue ring and a clank
        this.upgraded(e.x, e.y);
        if (e.playerId === this.localPlayerId) playSfx("building_upgraded");
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

  private muzzle(x: number, y: number, scale = 1): void {
    const m = this.take(this.flashes, 0.18, 0xffe9a8, 9);
    m.setPosition(x, y).setScale(scale).setAlpha(1).setVisible(true);
    this.scene.tweens.add({ targets: m, alpha: 0, duration: MUZZLE_MS, onComplete: () => m.setVisible(false) });
  }

  /** Story 5.9: a mine blast: a white flash, an orange fireball, a ring to the blast radius, dark smoke puffs (all pooled). */
  private mineBlast(x: number, y: number): void {
    const flash = this.take(this.blastFlashes, BLAST_FLASH_M, 0xfff3d0, 9.5);
    flash.setPosition(x, y).setScale(0.6).setAlpha(1).setVisible(true);
    this.scene.tweens.add({ targets: flash, scale: 1.6, alpha: 0, duration: BLAST_FLASH_MS, onComplete: () => flash.setVisible(false) });
    const fire = this.take(this.blastFires, BLAST_FIRE_M, 0xff7a1a, 9.4);
    fire.setPosition(x, y).setScale(0.4).setAlpha(0.95).setVisible(true);
    this.scene.tweens.add({ targets: fire, scale: 1.2, alpha: 0, duration: BLAST_FIRE_MS, onComplete: () => fire.setVisible(false) });
    let r = this.blastRings.find((o) => !o.visible);
    if (!r) {
      if (this.blastRings.length >= BLAST_RING_CAP) r = this.blastRings[0] as Phaser.GameObjects.Arc;
      else {
        r = this.scene.add.circle(0, 0, 1).setStrokeStyle(0.12, 0xffd8a0, 1).setDepth(9.3).setVisible(false);
        this.blastRings.push(r);
      }
    }
    const ring = r;
    this.scene.tweens.killTweensOf(ring);
    const radius = this.mineBlastRadius();
    ring.setPosition(x, y).setScale(0.3).setAlpha(0.9).setVisible(true);
    this.scene.tweens.add({ targets: ring, scale: radius, alpha: 0, duration: BLAST_RING_MS, onComplete: () => ring.setVisible(false) });
    for (let k = 0; k < BLAST_SMOKE_PUFFS; k++) {
      const p = this.take(this.blastSmoke, 0.45, 0x2a2622, 9.2);
      const a = (k / BLAST_SMOKE_PUFFS) * Math.PI * 2;
      p.setPosition(x + Math.cos(a) * 0.3, y + Math.sin(a) * 0.3).setScale(0.6).setAlpha(0.75).setVisible(true);
      this.scene.tweens.add({ targets: p, x: x + Math.cos(a) * 1.4, y: y + Math.sin(a) * 1.4 - 0.4, scale: 1.8, alpha: 0, duration: BLAST_SMOKE_MS, onComplete: () => p.setVisible(false) });
    }
  }

  /** The mine's blast radius from balance (the ring grows exactly to it), 2.5 m without one. */
  private mineBlastRadius(): number {
    return (this.balance ? buildingStats(this.balance, "mine")?.mine?.blastRadiusM : undefined) ?? 2.5;
  }

  /** Story 5.9: a pooled steel-blue ring at an upgraded building. */
  private upgraded(x: number, y: number): void {
    let r = this.upgrades.find((o) => !o.visible);
    if (!r) {
      r = this.scene.add.circle(0, 0, REPAIR_RING_M).setStrokeStyle(0.12, 0x90caf9, 1).setDepth(9).setVisible(false);
      this.upgrades.push(r);
    }
    const ring = r;
    ring.setPosition(x, y).setScale(0.4).setAlpha(1).setVisible(true);
    this.scene.tweens.add({ targets: ring, scale: 2.4, alpha: 0, duration: REPAIR_MS, onComplete: () => ring.setVisible(false) });
  }

  /**
   * Story 5.3: a pellet gun's blast: a warm cone over the weapon's spread from the muzzle, fading in
   * `BLAST_MS` (the 8 pellet streaks live ~2 ticks; the cone makes the spray readable). Pooled Graphics.
   */
  private blast(x: number, y: number, dirX: number, dirY: number, weapon: string): void {
    const w = this.balance?.weapons[weapon];
    const spreadDeg = w?.kind === "gun" ? w.spreadDeg : 30;
    let g = this.blasts.find((o) => !o.visible);
    if (!g) {
      g = this.scene.add.graphics().setDepth(8.6).setVisible(false);
      this.blasts.push(g);
    }
    const graphics = g;
    const facing = Math.atan2(dirY, dirX);
    const half = (spreadDeg / 2) * DEG_TO_RAD;
    const len = blastLengthFor(weapon);
    graphics.clear();
    graphics.fillStyle(BLAST_OUTER, 0.18);
    graphics.slice(0, 0, len, facing - half, facing + half, false);
    graphics.fillPath();
    graphics.fillStyle(BLAST_INNER, 0.4);
    graphics.slice(0, 0, len * 0.45, facing - half * 0.7, facing + half * 0.7, false);
    graphics.fillPath();
    graphics.setPosition(x, y).setAlpha(1).setVisible(true);
    this.scene.tweens.add({ targets: graphics, alpha: 0, duration: BLAST_MS, onComplete: () => graphics.setVisible(false) });
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

  /**
   * A pooled swing Graphics: a hidden one, else a new one up to `controls.json › fx.maxSwingArcs`
   * (Story 5.2, brief line 12), else the oldest is reused.
   */
  private takeSwing(): Phaser.GameObjects.Graphics {
    const free = this.swings.find((o) => !o.visible);
    if (free) return free;
    const cap = this.balance?.controls.fx.maxSwingArcs ?? 1;
    if (this.swings.length < cap) {
      const g = this.scene.add.graphics().setDepth(7).setVisible(false);
      this.swings.push(g);
      return g;
    }
    const g = this.swings[this.nextSwing % this.swings.length] as Phaser.GameObjects.Graphics;
    this.nextSwing = (this.nextSwing + 1) % this.swings.length;
    this.scene.tweens.killTweensOf(g);
    return g;
  }

  /**
   * Translucent arc wedge for a melee swing: a pooled Graphics, redrawn only on the swing, then hidden.
   * Story 5.2: `heavy` (the Fire Axe): denser, slower to fade, with a warm smear along the arc's rim.
   */
  private swing(x: number, y: number, dirX: number, dirY: number, arcDeg: number, rangeM: number, heavy = false, fill = SWING_COLOR, alpha = SWING_ALPHA, ms = SWING_MS): void {
    const graphics = this.takeSwing();
    const facing = Math.atan2(dirY, dirX);
    const half = (arcDeg / 2) * DEG_TO_RAD;
    graphics.clear();
    graphics.fillStyle(heavy ? AXE_FILL : fill, heavy ? AXE_FILL_ALPHA : alpha);
    graphics.slice(0, 0, rangeM, facing - half, facing + half, false);
    graphics.fillPath();
    if (heavy) {
      graphics.lineStyle(AXE_EDGE_M, AXE_EDGE, 0.55);
      graphics.beginPath();
      graphics.arc(0, 0, rangeM - AXE_EDGE_M / 2, facing - half, facing + half, false);
      graphics.strokePath();
    }
    graphics.setPosition(x, y).setAlpha(1).setVisible(true);
    this.scene.tweens.add({ targets: graphics, alpha: 0, duration: heavy ? AXE_SWING_MS : ms, onComplete: () => graphics.setVisible(false) });
  }

  /**
   * Story 5.2: one Chainsaw tick: the faint 60° wedge (the sim's sector), sparks at the blade tip and
   * blood when it cut someone (`hits` from the server; my own online swings count the drawn zombies).
   */
  private sawCut(playerId: string, x: number, y: number, dirX: number, dirY: number, arcDeg: number, rangeM: number, hits: number | undefined): void {
    this.swing(x, y, dirX, dirY, arcDeg, rangeM, false, SAW_FILL, SAW_FILL_ALPHA, SAW_SWING_MS);
    this.saw?.swung(playerId, this.scene.time.now);
    const fx = this.balance?.controls.fx;
    if (!fx) return;
    if (!this.sparks) this.sparks = new SparkPool(fx.maxChainsawSparks, fx.chainsawSparkMs);
    const cut = hits ?? this.cutCount?.(x, y, dirX, dirY, arcDeg, rangeM) ?? 0;
    const tipM = rangeM * 0.75;
    const tx = x + dirX * tipM;
    const ty = y + dirY * tipM;
    this.sparks.spawn(tx, ty, dirX, dirY, cut > 0 ? fx.chainsawSparksPerHit : fx.chainsawSparksPerMiss, SPARK_STEEL);
    if (cut > 0) this.sparks.spawn(tx, ty, dirX, dirY, Math.ceil(fx.chainsawSparksPerHit / 2), SPARK_BLOOD);
  }

  /** Story 5.2: once per frame: moves the sparks and redraws them into one Graphics (no objects per spark). */
  update(deltaMs: number): void {
    const sp = this.sparks;
    if (!sp) return;
    const live = sp.update(deltaMs);
    if (!this.sparkGfx) this.sparkGfx = this.scene.add.graphics().setDepth(8.8);
    const g = this.sparkGfx;
    g.clear();
    if (live === 0) return;
    for (let k = 0; k < sp.cap; k++) {
      if ((sp.lifeMs[k] as number) <= 0) continue;
      g.fillStyle(sp.kind[k] === SPARK_BLOOD ? SPARK_BLOOD_COLOR : SPARK_STEEL_COLOR, sp.alpha(k));
      g.fillRect((sp.x[k] as number) - SPARK_M / 2, (sp.y[k] as number) - SPARK_M / 2, SPARK_M, SPARK_M);
    }
  }

  /** Story 5.2: live sparks (tests, the stress check). */
  get liveSparks(): number {
    const sp = this.sparks;
    if (!sp) return 0;
    let n = 0;
    for (let k = 0; k < sp.cap; k++) if ((sp.lifeMs[k] as number) > 0) n++;
    return n;
  }

  destroy(): void {
    this.sparkGfx?.destroy();
    this.sparkGfx = null;
    this.sparks = null;
    this.saw?.clear();
    for (const o of [...this.splats, ...this.puffs, ...this.flashes, ...this.swings, ...this.blasts, ...this.debrisPuffs, ...this.repairs, ...this.blastFlashes, ...this.blastFires, ...this.blastRings, ...this.blastSmoke, ...this.upgrades]) o.destroy();
    this.blasts.length = 0;
    this.debrisPuffs.length = 0;
    this.splats.length = 0;
    this.puffs.length = 0;
    this.flashes.length = 0;
    this.swings.length = 0;
    this.repairs.length = 0;
    this.blastFlashes.length = 0;
    this.blastFires.length = 0;
    this.blastRings.length = 0;
    this.blastSmoke.length = 0;
    this.upgrades.length = 0;
  }
}
