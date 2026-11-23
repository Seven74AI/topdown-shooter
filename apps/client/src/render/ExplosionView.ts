import * as Phaser from "phaser";
import type { Balance, SimEvent } from "@topdown/shared";
import { ATLAS_BLASTFX, BLAST_FLAME_FRAMES, BLAST_SMOKE_FRAMES, FX_BLAST_EMBER, FX_BLAST_FLASH, FX_BLAST_GLOW, FX_DEBRIS, FX_SCORCH, ensureBlastFxAtlas } from "./city/blastFxAtlas";
import { FLAME_TINTS, SMOKE_PALETTES } from "./city/fireSprites";
import { BLAST_TIMES, BlastParticles, Explosions, P_DEBRIS, P_DUST, P_EMBER, P_FLAME, P_SMOKE, STALE_EXPLOSION_S, blastLookFor, type BlastLook, type ParticleDraw } from "./grenadeFx";

/**
 * Depths: the scorch on the asphalt (under blood 1 and every body); the ground glow with the other
 * animated lights; smoke and dust below zombies (4.5–5.5: they never hide an approaching zombie, the
 * 4.12 rule); flames, flash and debris over the bodies for their split second; sparks above, below the rain.
 */
const SCORCH_DEPTH = 0.95;
const GLOW_DEPTH = 4.33;
const SMOKE_DEPTH = 4.37;
const FLAME_DEPTH = 9.55;
const FLASH_DEPTH = 9.6;
const RING_DEPTH = 9.62;
const EMBER_DEPTH = 11.62;
const MIN_ALPHA = 0.01;
/** Dust tones (EX2's rolling ring) and debris greys. */
const DUST_TINTS = [0x968068, 0x786e62, 0x645e56, 0x58544e, 0x4c4945, 0x42403e] as const;
const DEBRIS_TINTS = [0x1b1c1f, 0x2a2b2f, 0x3a3c40, 0x111214, 0x4a4c50, 0x8a8e94] as const;
const EDGE_RING_FIREBALL = 0xffb060;
const EDGE_RING_SHOCK = 0xf2eee6;

/**
 * Story 5.5 (shared with 5.8 and 5.12; the 5.9 mine blast moved onto it): an explosion drawn in code
 * from `explosion.happened` (both looks of round C): a flash, a ground glow 2R wide, an edge ring
 * that ends exactly on the blast radius (the damage edge), capped pooled particles (flames, smoke,
 * sparks, debris; EX2's dust ring stops on the edge) and a pooled scorch decal that fades by the end
 * of the wave. Everything is atlased (`atlas_blastfx`) and pooled: ≤ `maxLiveExplosions` flashes and
 * glows, ≤ `maxExplosionParticles` particle images, ≤ `maxScorchDecals` decals; no allocation per frame.
 */
export class ExplosionView {
  readonly particles: BlastParticles;
  readonly explosions: Explosions;
  private readonly pImg: Phaser.GameObjects.Image[] = [];
  private readonly pKind: Uint8Array;
  private readonly flash: Phaser.GameObjects.Image[] = [];
  private readonly glow: Phaser.GameObjects.Image[] = [];
  private readonly scorch: Phaser.GameObjects.Image[] = [];
  private readonly rings: Phaser.GameObjects.Graphics;
  private readonly d: ParticleDraw = { x: 0, y: 0, w: 0, h: 0, rot: 0, alpha: 0, variant: 0, t: 0 };
  private readonly ringOut = { r: 0, alpha: 0 };

  constructor(scene: Phaser.Scene, balance: Balance) {
    ensureBlastFxAtlas(scene);
    const fx = balance.combat.explosion.fx;
    this.particles = new BlastParticles(fx.maxExplosionParticles);
    this.explosions = new Explosions(fx.maxLiveExplosions, fx.maxScorchDecals);
    this.pKind = new Uint8Array(fx.maxExplosionParticles);
    const img = (frame: string, depth: number, add: boolean): Phaser.GameObjects.Image => {
      const i = scene.add.image(0, 0, ATLAS_BLASTFX, frame).setDepth(depth).setVisible(false);
      if (add) i.setBlendMode(Phaser.BlendModes.ADD);
      return i;
    };
    for (let i = 0; i < fx.maxExplosionParticles; i++) this.pImg.push(img(BLAST_FLAME_FRAMES[0] as string, FLAME_DEPTH, true));
    for (let i = 0; i < fx.maxLiveExplosions; i++) {
      this.flash.push(img(FX_BLAST_FLASH, FLASH_DEPTH, true));
      this.glow.push(img(FX_BLAST_GLOW, GLOW_DEPTH, true));
    }
    for (let i = 0; i < fx.maxScorchDecals; i++) this.scorch.push(img(FX_SCORCH, SCORCH_DEPTH, false));
    this.rings = scene.add.graphics().setDepth(RING_DEPTH);
  }

  /** Routes one drained event. Returns true when it started an explosion. */
  handle(e: SimEvent, nowS: number): boolean {
    if (e.type === "build.started") {
      this.explosions.fadeScorches(nowS);
      return false;
    }
    if (e.type !== "explosion.happened") return false;
    if ((e.ageS ?? 0) > STALE_EXPLOSION_S) return false; // a woken tab: no late blasts
    this.blast(blastLookFor(e.kind), e.x, e.y, e.radiusM, nowS);
    return true;
  }

  /** One explosion of `look` (also the browser checks' entry point). */
  blast(look: BlastLook, x: number, y: number, r: number, nowS: number): void {
    const i = this.explosions.start(look, x, y, r, nowS);
    this.particles.burst(look, x, y, r, BLAST_FLAME_FRAMES.length, BLAST_SMOKE_FRAMES.length);
    (this.flash[i] as Phaser.GameObjects.Image).setPosition(x, y);
    (this.glow[i] as Phaser.GameObjects.Image).setPosition(x, y).setDisplaySize(2 * r, 2 * r);
  }

  /** Live explosion particles (browser checks). */
  liveParticles(): number {
    return this.particles.live();
  }

  /** One frame: `dtS` 0 while paused. */
  update(dtS: number, nowS: number): void {
    const ex = this.explosions;
    ex.update(nowS);
    this.particles.step(dtS);
    // flashes, glows, edge rings
    this.rings.clear();
    for (let i = 0; i < ex.capacity; i++) {
      const f = this.flash[i] as Phaser.GameObjects.Image;
      const g = this.glow[i] as Phaser.GameObjects.Image;
      if (ex.active[i] !== 1) {
        if (f.visible) f.setVisible(false);
        if (g.visible) g.setVisible(false);
        continue;
      }
      const look = ex.lookOf(i);
      const t = BLAST_TIMES[look];
      const age = nowS - (ex.startS[i] as number);
      const R = ex.r[i] as number;
      const fa = age < t.flashS ? 1 - age / t.flashS : 0;
      if (fa > 0) {
        const size = (look === "fireball" ? 2.2 : 2.6) * R * (0.7 + 0.3 * (age / t.flashS));
        f.setDisplaySize(size, size).setAlpha(fa).setVisible(true);
      } else if (f.visible) f.setVisible(false);
      const ga = age < 0.05 ? 1 : Math.max(0, 1 - (age - 0.05) / t.glowS);
      if (ga > 0) g.setAlpha(0.55 * ga).setVisible(true);
      else if (g.visible) g.setVisible(false);
      const ring = ex.ring(i, nowS, this.ringOut);
      if (ring.alpha > MIN_ALPHA && ring.r > 0) {
        this.rings.lineStyle(look === "fireball" ? 0.05 : 0.08, look === "fireball" ? EDGE_RING_FIREBALL : EDGE_RING_SHOCK, ring.alpha);
        this.rings.strokeCircle(ex.x[i] as number, ex.y[i] as number, ring.r);
      }
    }
    // scorch decals
    for (let s = 0; s < ex.scorchCapacity; s++) {
      const img = this.scorch[s] as Phaser.GameObjects.Image;
      if (ex.scorchOn[s] !== 1) {
        if (img.visible) img.setVisible(false);
        continue;
      }
      const a = ex.scorchAlpha(s, nowS);
      const R = ex.scorchR[s] as number;
      img.setPosition(ex.scorchX[s] as number, ex.scorchY[s] as number).setDisplaySize(2 * R, 2 * R).setRotation(ex.scorchRot[s] as number).setAlpha(a).setVisible(a > MIN_ALPHA);
    }
    // particles
    const p = this.particles;
    const d = this.d;
    for (let i = 0; i < p.capacity; i++) {
      const img = this.pImg[i] as Phaser.GameObjects.Image;
      if (!p.draw(i, d) || d.alpha < MIN_ALPHA) {
        if (img.visible) img.setVisible(false);
        continue;
      }
      const kind = p.kind[i] as number;
      if (this.pKind[i] !== kind) this.setKind(img, i, kind);
      if (kind === P_FLAME) img.setFrame(BLAST_FLAME_FRAMES[d.variant % BLAST_FLAME_FRAMES.length] as string).setTint(FLAME_TINTS[Math.min(FLAME_TINTS.length - 1, Math.floor(d.t * FLAME_TINTS.length))] as number);
      else if (kind === P_SMOKE) img.setFrame(BLAST_SMOKE_FRAMES[d.variant % BLAST_SMOKE_FRAMES.length] as string).setTint(SMOKE_PALETTES.black[Math.min(5, Math.floor(d.t * 6))] as number);
      else if (kind === P_DUST) img.setFrame(BLAST_SMOKE_FRAMES[d.variant % BLAST_SMOKE_FRAMES.length] as string).setTint(DUST_TINTS[Math.min(5, Math.floor(d.t * 6))] as number);
      else if (kind === P_DEBRIS) img.setTint(DEBRIS_TINTS[i % DEBRIS_TINTS.length] as number);
      img.setPosition(d.x, d.y).setDisplaySize(d.w, d.h).setRotation(d.rot).setAlpha(d.alpha);
      if (!img.visible) img.setVisible(true);
    }
  }

  /** A slot changed kind: its frame, blend and depth (only when a new blast takes the slot). */
  private setKind(img: Phaser.GameObjects.Image, i: number, kind: number): void {
    this.pKind[i] = kind;
    if (kind === P_FLAME) img.setFrame(BLAST_FLAME_FRAMES[0] as string).setBlendMode(Phaser.BlendModes.ADD).setDepth(FLAME_DEPTH);
    else if (kind === P_EMBER) img.setFrame(FX_BLAST_EMBER).setBlendMode(Phaser.BlendModes.ADD).setDepth(EMBER_DEPTH).clearTint();
    else if (kind === P_DEBRIS) img.setFrame(FX_DEBRIS).setBlendMode(Phaser.BlendModes.NORMAL).setDepth(FLAME_DEPTH);
    else img.setFrame(BLAST_SMOKE_FRAMES[0] as string).setBlendMode(Phaser.BlendModes.NORMAL).setDepth(SMOKE_DEPTH); // smoke, dust
  }

  destroy(): void {
    for (const i of this.pImg) i.destroy();
    for (const i of this.flash) i.destroy();
    for (const i of this.glow) i.destroy();
    for (const i of this.scorch) i.destroy();
    this.rings.destroy();
    this.pImg.length = 0;
  }
}
