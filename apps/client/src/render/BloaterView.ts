import * as Phaser from "phaser";
import type { World } from "@topdown/shared";
import { ATLAS_FX, FX_BILE_SPLATS, FX_CLOTH_SCRAP, FX_EXPLOSION_BLOATER, FX_GAS_CLOUDS, FX_GLOW, ensureAtlases } from "./city/spriteAtlas";
import { BURST_DROP, BURST_FLASH_S, BURST_PUFF, BURST_RING_FADE_S, BURST_RING_S, BURST_SCRAP, BURST_SPLAT, type BloaterFx } from "./bloaterFx";
import type { ZombieView } from "./ZombieView";
import { aboveDarkness } from "./darkness/aboveDark";

/** Splats on the street (above blood trails, below puddles and bodies); the fog over the bodies (translucent); flying bits above all. */
const SPLAT_DEPTH = 1.58;
const CLOUD_DEPTH = 6.6;
const RING_DEPTH = 6.7;
const AIR_DEPTH = 11.6;
/** The fog's alpha at full (the round-C page: 0.42) and its second, slowly turning layer. */
const CLOUD_ALPHA = 0.42;
const CLOUD2_ALPHA = 0.22;
const CLOUD_SPIN = 0.05;
const PUFF_TINT = 0xb9c65e;
const PUFF_ALPHA = 0.26;
const SCRAP_TINTS = [0xc9cbbd, 0xb39b33, 0x4a4f58, 0x3c5d5e, 0xa9b455] as const;
/** Rings: the fuse (faint full circle + the bright arc that fills over the swell), the shock ring, the gas edge. */
const FUSE_FAINT = 0xcde178;
const FUSE_FAINT_ALPHA = 0.3;
const FUSE_ARC = 0xd8ec7a;
const FUSE_ARC_ALPHA = 0.85;
const SHOCK = 0xe4f0a0;
const GAS_EDGE = 0xcde178;
const GAS_EDGE_ALPHA = 0.45;
const LINE_M = 0.045;
const ARC_LINE_M = 0.07;

/**
 * Story 5.8 (AC 8b–d): draws the swelling Bloaters' fuse rings at the exact blast radius, and a
 * `BloaterFx`'s bursts and gas clouds: per cloud slot two fog discs and a flash (pooled, created
 * once: `blasts.maxGasClouds`), one image per particle slot (`fx.maxBloaterParticles`), one Graphics
 * for every ring (redrawn only while something swells or a cloud lives). Positions, alpha, tint
 * and size per frame: no allocation.
 */
export class BloaterView {
  private readonly clouds: Phaser.GameObjects.Image[] = [];
  private readonly clouds2: Phaser.GameObjects.Image[] = [];
  private readonly flashes: Phaser.GameObjects.Image[] = [];
  private readonly bits: Phaser.GameObjects.Image[] = [];
  /** The kind each particle image was last set up for (frame, tint, depth change only then); -1 = none. */
  private readonly shownKind: Int8Array;
  private readonly shownTone: Int8Array;
  private readonly rings: Phaser.GameObjects.Graphics;
  /** Story 6.3 (B3): gas ghosts above the darkness — 0 = none (no blackout), else their share of the look (0.1). */
  darkGhost = 0;
  private readonly ghosts: Phaser.GameObjects.Image[] = [];
  private readonly ghosts2: Phaser.GameObjects.Image[] = [];
  private readonly ghostRings: Phaser.GameObjects.Graphics;
  private ghostRingsDrawn = false;
  private ringsDrawn = false;
  private fuseCount = 0;
  private readonly drawFuse = (x: number, y: number, p: number): void => {
    if (this.fuseCount >= this.maxFuseRings) return;
    this.fuseCount++;
    const g = this.rings;
    g.lineStyle(LINE_M, FUSE_FAINT, FUSE_FAINT_ALPHA).strokeCircle(x, y, this.blastRadiusM);
    if (p > 0) {
      g.lineStyle(ARC_LINE_M, FUSE_ARC, FUSE_ARC_ALPHA);
      g.beginPath();
      g.arc(x, y, this.blastRadiusM, -Math.PI / 2, -Math.PI / 2 + Math.PI * 2 * p, false);
      g.strokePath();
    }
  };

  constructor(
    scene: Phaser.Scene,
    private readonly fx: BloaterFx,
    private readonly zombies: ZombieView,
    private readonly blastRadiusM: number,
    private readonly maxFuseRings: number,
  ) {
    ensureAtlases(scene);
    const d = 2 * fx.gasRadiusM;
    for (let i = 0; i < fx.maxClouds; i++) {
      this.clouds.push(scene.add.image(0, 0, ATLAS_FX, FX_GAS_CLOUDS[0] as string).setDisplaySize(d, d).setDepth(CLOUD_DEPTH).setVisible(false));
      this.clouds2.push(scene.add.image(0, 0, ATLAS_FX, FX_GAS_CLOUDS[1] as string).setDisplaySize(d, d).setDepth(CLOUD_DEPTH).setVisible(false));
      // Story 6.3 (designer B3): both cloud layers again above the darkness at `darkGhost` strength (blackout only).
      this.ghosts.push(aboveDarkness(scene.add.image(0, 0, ATLAS_FX, FX_GAS_CLOUDS[0] as string).setDisplaySize(d, d).setVisible(false), "hazard"));
      this.ghosts2.push(aboveDarkness(scene.add.image(0, 0, ATLAS_FX, FX_GAS_CLOUDS[1] as string).setDisplaySize(d, d).setVisible(false), "hazard"));
      this.flashes.push(scene.add.image(0, 0, ATLAS_FX, FX_EXPLOSION_BLOATER).setDisplaySize(d * 0.9, d * 0.9).setDepth(AIR_DEPTH).setBlendMode(Phaser.BlendModes.ADD).setVisible(false));
    }
    for (let i = 0; i < fx.maxParticles; i++) this.bits.push(scene.add.image(0, 0, ATLAS_FX, FX_GLOW).setVisible(false));
    this.shownKind = new Int8Array(fx.maxParticles).fill(-1);
    this.shownTone = new Int8Array(fx.maxParticles).fill(-1);
    this.rings = scene.add.graphics().setDepth(RING_DEPTH);
    this.ghostRings = aboveDarkness(scene.add.graphics(), "hazard");
  }

  update(world: Readonly<World>, nowS: number): void {
    const fx = this.fx;
    fx.update(nowS);
    // fuse rings and gas edges
    const g = this.rings;
    if (this.ringsDrawn) {
      g.clear();
      this.ringsDrawn = false;
    }
    if (this.ghostRingsDrawn) {
      this.ghostRings.clear();
      this.ghostRingsDrawn = false;
    }
    const k = this.darkGhost;
    this.fuseCount = 0;
    this.zombies.forEachSwell(world, this.drawFuse);
    if (this.fuseCount > 0) this.ringsDrawn = true;
    for (let c = 0; c < fx.maxClouds; c++) {
      const cl = this.clouds[c] as Phaser.GameObjects.Image;
      const cl2 = this.clouds2[c] as Phaser.GameObjects.Image;
      const fl = this.flashes[c] as Phaser.GameObjects.Image;
      const a = fx.cloudAlpha(c, nowS);
      const gh = this.ghosts[c] as Phaser.GameObjects.Image;
      const gh2 = this.ghosts2[c] as Phaser.GameObjects.Image;
      if (a <= 0 || k <= 0) {
        if (gh.visible) {
          gh.setVisible(false);
          gh2.setVisible(false);
        }
      }
      if (a <= 0) {
        if (cl.visible) {
          cl.setVisible(false);
          cl2.setVisible(false);
          fl.setVisible(false);
        }
        continue;
      }
      const x = fx.cloudX[c] as number;
      const y = fx.cloudY[c] as number;
      const t = fx.cloudAge(c, nowS);
      cl.setPosition(x, y).setRotation(c * 1.7 + t * CLOUD_SPIN).setAlpha(CLOUD_ALPHA * a).setVisible(true);
      cl2.setPosition(x, y).setRotation(c * 0.9 - t * CLOUD_SPIN * 1.6).setAlpha(CLOUD2_ALPHA * a).setVisible(true);
      if (t < BURST_FLASH_S) {
        const f = 1 - t / BURST_FLASH_S;
        fl.setPosition(x, y).setAlpha(f * f).setVisible(true);
      } else if (fl.visible) fl.setVisible(false);
      g.lineStyle(LINE_M, GAS_EDGE, GAS_EDGE_ALPHA * a).strokeCircle(x, y, fx.gasRadiusM);
      if (k > 0) {
        gh.setPosition(x, y).setRotation(cl.rotation).setAlpha(CLOUD_ALPHA * a * k).setVisible(true);
        gh2.setPosition(x, y).setRotation(cl2.rotation).setAlpha(CLOUD2_ALPHA * a * k).setVisible(true);
        this.ghostRings.lineStyle(LINE_M, GAS_EDGE, GAS_EDGE_ALPHA * a * k).strokeCircle(x, y, fx.gasRadiusM);
        this.ghostRingsDrawn = true;
      }
      const ra = t < BURST_RING_S ? 0.85 : Math.max(0, 0.85 - (t - BURST_RING_S) / BURST_RING_FADE_S);
      if (ra > 0) g.lineStyle(ARC_LINE_M, SHOCK, ra).strokeCircle(x, y, this.blastRadiusM * Math.min(1, t / BURST_RING_S));
      this.ringsDrawn = true;
    }
    // particles
    for (let i = 0; i < fx.maxParticles; i++) {
      const img = this.bits[i] as Phaser.GameObjects.Image;
      if (fx.on[i] !== 1) {
        if (img.visible) img.setVisible(false);
        continue;
      }
      const k = fx.kind[i] as number;
      const owner = fx.owner[i] as number;
      const ca = owner >= 0 ? fx.cloudAlpha(owner, nowS) : 1;
      const s = fx.size[i] as number;
      const z = fx.z[i] as number;
      const x = fx.x[i] as number;
      const y = fx.y[i] as number;
      const tone = fx.tone[i] as number;
      if (this.shownKind[i] !== k || this.shownTone[i] !== tone) {
        this.shownKind[i] = k;
        this.shownTone[i] = tone;
        if (k === BURST_PUFF) img.setFrame(FX_GLOW).setTint(PUFF_TINT).setDepth(CLOUD_DEPTH).setRotation(0);
        else if (k === BURST_SCRAP) img.setFrame(FX_CLOTH_SCRAP).setTint(SCRAP_TINTS[tone % SCRAP_TINTS.length] as number);
        else img.setFrame(FX_BILE_SPLATS[tone & 3] as string).clearTint().setDepth(k === BURST_SPLAT ? SPLAT_DEPTH : AIR_DEPTH);
      }
      if (k === BURST_PUFF) {
        const grow = 1 + Math.min(1, (fx.age[i] as number) / 1.5) * 0.25;
        img.setDisplaySize(s * grow * 2, s * grow * 2).setPosition(x, y).setAlpha(PUFF_ALPHA * ca).setVisible(true);
      } else if (k === BURST_SPLAT) {
        img.setDisplaySize(s, s * 0.8).setRotation(fx.rot[i] as number).setPosition(x, y).setAlpha(0.9 * ca).setVisible(true);
      } else if (k === BURST_DROP) {
        const sp = Math.hypot(fx.vx[i] as number, fx.vy[i] as number);
        const st = 1 + Math.min(1.5, sp * 0.25);
        img.setDisplaySize(s * (1.6 + z * 0.4) * st, s * (1.6 + z * 0.4)).setRotation(Math.atan2(fx.vy[i] as number, fx.vx[i] as number)).setPosition(x, y - z * 0.15).setAlpha(0.95).setVisible(true);
      } else if (k === BURST_SCRAP) {
        img.setDepth(z > 0 ? AIR_DEPTH : SPLAT_DEPTH).setDisplaySize(s * 1.6, s).setRotation(fx.rot[i] as number).setPosition(x, y - z * 0.15).setAlpha(ca).setVisible(true);
      }
    }
  }

  destroy(): void {
    for (const g of this.ghosts) g.destroy();
    for (const g of this.ghosts2) g.destroy();
    this.ghostRings.destroy();
    for (const img of [...this.clouds, ...this.clouds2, ...this.flashes, ...this.bits]) img.destroy();
    this.clouds.length = 0;
    this.clouds2.length = 0;
    this.flashes.length = 0;
    this.bits.length = 0;
    this.rings.destroy();
  }
}
