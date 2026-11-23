import * as Phaser from "phaser";
import { MUZZLE_OFFSET_M, shotBlockT, type Balance, type World } from "@topdown/shared";
import { ATLAS_FIREFX, FIRE_FLAME_FRAMES, FX_FIRE_LIGHT, ensureFireFxAtlas } from "./city/fireFxAtlas";
import { FLAME_TINTS, FLAME_STEPS, FLAME_VARIANTS } from "./city/fireSprites";
import { fireFlicker } from "./city/fireParticles";
import { FLAME_STYLE, FlameJets, type FlameStyle, type JetDraw } from "./flameJet";

/**
 * Story 5.4: the flame streams and the burning zombies (AC 7c/7d), pooled Phaser 4 images from the
 * 4.12 fire atlas (`atlas_firefx`, additive flames: no new texture). Per frame: `begin`, one
 * `flamer` per player who is flaming (`FlameCues`), `zombies`, `end`. No allocation per frame.
 *
 * - Streams: one shared particle pool (`combat.json › fx.maxFlameParticles`) + one ground glow per
 *   flamer stretched along the cone; each particle's ray is cut at the first shot blocker on the
 *   mirror World (the sim's `shotBlockT`), so cars visibly stop the fire where they stop the damage.
 * - Burning zombies: up to `fx.maxBurningZombieFx` (nearest the camera first), two flickering
 *   flames on each body (the burning-body look of 4.12, cheaper per body: no glow sprite).
 */
const FLAME_DEPTH = 10.25;
const GLOW_DEPTH = 4.6;
const ZFLAME_DEPTH = 6.2;
/** Flames per burning zombie, and their size (× the body radius). Two (no glow sprite): fill rate on phones (stress run). */
const ZFLAMES = 2;
const ZFLAME_R = 1.5;
/** The drawn nozzle sits this far past the sim's muzzle (the FT art's nozzle at 2.25 r). */
const NOZZLE_PAST_MUZZLE_M = 0.4;
/** Ground glow alpha under a stream. */
const STREAM_GLOW_ALPHA = 0.38;
const MAX_FLAMERS = 4;

export class FlameView {
  private readonly jets: FlameJets;
  private readonly imgs: Phaser.GameObjects.Image[] = [];
  private readonly shownFrame: Int8Array;
  private readonly glows: Phaser.GameObjects.Image[] = [];
  /** Burning-zombie slots drawn last frame (the rest are hidden). */
  private zShown = 0;
  private readonly zFlames: Phaser.GameObjects.Image[] = [];
  private readonly zPick: Int32Array;
  private readonly zD2: Float32Array;
  private flamers = 0;
  private dt = 0;
  private t = 0;
  private world: Readonly<World> | null = null;
  private readonly d: JetDraw = { x: 0, y: 0, w: 0, h: 0, rot: 0, alpha: 0, tint: 0, frame: 0 };
  private readonly rate: number;
  private readonly maxZ: number;
  private readonly clip = (x0: number, y0: number, x1: number, y1: number): number => (this.world ? shotBlockT(this.world, x0, y0, x1, y1) : -1);

  constructor(scene: Phaser.Scene, balance: Balance, low = false) {
    ensureFireFxAtlas(scene);
    const fx = balance.combat.fx;
    const cap = low ? fx.maxFlameParticles >> 1 : fx.maxFlameParticles;
    this.rate = low ? fx.flameParticlesPerS / 2 : fx.flameParticlesPerS;
    this.maxZ = fx.maxBurningZombieFx;
    this.jets = new FlameJets(cap);
    this.shownFrame = new Int8Array(cap).fill(-1);
    const img = (frame: string, depth: number): Phaser.GameObjects.Image =>
      scene.add.image(0, 0, ATLAS_FIREFX, frame).setDepth(depth).setVisible(false).setBlendMode(Phaser.BlendModes.ADD);
    for (let i = 0; i < cap; i++) this.imgs.push(img(FIRE_FLAME_FRAMES[0] as string, FLAME_DEPTH));
    for (let i = 0; i < MAX_FLAMERS; i++) this.glows.push(img(FX_FIRE_LIGHT, GLOW_DEPTH));
    for (let i = 0; i < this.maxZ; i++) {
      for (let k = 0; k < ZFLAMES; k++) this.zFlames.push(img(FIRE_FLAME_FRAMES[k % FLAME_VARIANTS] as string, ZFLAME_DEPTH));
    }
    this.zPick = new Int32Array(Math.max(1, this.maxZ));
    this.zD2 = new Float32Array(Math.max(1, this.maxZ));
  }

  /** Start of a frame (`dtS` 0 while paused; `tS` the view clock in s). */
  begin(dtS: number, tS: number, world: Readonly<World>): void {
    this.dt = dtS;
    this.t = tS;
    this.world = world;
    this.flamers = 0;
  }

  /**
   * A player flaming with `weapon` this frame, drawn at (x, y) aiming along the unit (dirX, dirY).
   * The cone's apex is the sim's muzzle (radius + 0.1 m), its reach and angle the weapon's balance.
   */
  flamer(balance: Balance, weapon: string, x: number, y: number, radiusM: number, dirX: number, dirY: number): void {
    const w = balance.weapons[weapon];
    if (!w || w.kind !== "flame" || this.flamers >= MAX_FLAMERS) return;
    const k = this.flamers++;
    const ox = x + dirX * (radiusM + MUZZLE_OFFSET_M);
    const oy = y + dirY * (radiusM + MUZZLE_OFFSET_M);
    const half = ((w.coneDeg / 2) * Math.PI) / 180;
    const style: FlameStyle = w.coneDeg >= 40 ? FLAME_STYLE.TORCH : FLAME_STYLE.JET; // FS2 wide torch, FS1 narrow jet
    this.jets.emit(k, this.dt, this.rate, style, ox, oy, dirX, dirY, w.rangeM, half, NOZZLE_PAST_MUZZLE_M, this.clip);
    // the floor glow along the cone, stopped at a car on the axis (as the flames are)
    const t = this.clip(ox, oy, ox + dirX * w.rangeM, oy + dirY * w.rangeM);
    const len = t >= 0 ? t * w.rangeM : w.rangeM;
    const g = this.glows[k] as Phaser.GameObjects.Image;
    const wide = Math.max(0.8, 2 * len * Math.tan(half));
    g.setPosition(ox + dirX * len * 0.55, oy + dirY * len * 0.55)
      .setDisplaySize(len * 1.15, wide * 1.1)
      .setRotation(Math.atan2(dirY, dirX))
      .setTint(0xff9a40)
      .setAlpha(STREAM_GLOW_ALPHA * fireFlicker(this.t, k * 1.7))
      .setVisible(true);
  }

  /** Burning zombies (the pool's `igniteTicks` > 0; online the horde's burning bit), nearest (cx, cy) first. */
  zombies(world: Readonly<World>, alpha: number, cx: number, cy: number): void {
    const z = world.zombies;
    const cap = this.maxZ;
    let n = 0;
    for (let k = 0; k < z.aliveCount; k++) {
      const id = z.aliveIds[k] as number;
      if (!z.igniteTicks[id]) continue;
      const dx = (z.x[id] as number) - cx;
      const dy = (z.y[id] as number) - cy;
      const d2 = dx * dx + dy * dy;
      if (n < cap) {
        this.zPick[n] = id;
        this.zD2[n++] = d2;
        continue;
      }
      // replace the farthest picked one (cap is small)
      let far = 0;
      for (let j = 1; j < n; j++) if ((this.zD2[j] as number) > (this.zD2[far] as number)) far = j;
      if (d2 < (this.zD2[far] as number)) {
        this.zPick[far] = id;
        this.zD2[far] = d2;
      }
    }
    const radius = world.balance.zombies.types.walker?.radiusM ?? 0.35;
    for (let j = n; j < this.zShown; j++) for (let f = 0; f < ZFLAMES; f++) (this.zFlames[j * ZFLAMES + f] as Phaser.GameObjects.Image).setVisible(false);
    this.zShown = n;
    for (let j = 0; j < n; j++) {
      const id = this.zPick[j] as number;
      const x = (z.prevX[id] as number) + ((z.x[id] as number) - (z.prevX[id] as number)) * alpha;
      const y = (z.prevY[id] as number) + ((z.y[id] as number) - (z.prevY[id] as number)) * alpha;
      const ph = id * 2.399;
      for (let f = 0; f < ZFLAMES; f++) {
        const img = this.zFlames[j * ZFLAMES + f] as Phaser.GameObjects.Image;
        const a = ph + f * 2.1;
        const fl = fireFlicker(this.t * 1.3, a);
        const s = radius * ZFLAME_R * (0.75 + 0.35 * fl);
        const step = Math.floor(((this.t * 2.2 + f * 0.31 + id * 0.07) % 1) * (FLAME_STEPS - 4)) + 2;
        img
          .setPosition(x + Math.cos(a + this.t * 1.7) * radius * 0.45, y + Math.sin(a + this.t * 1.7) * radius * 0.45 - s * 0.25)
          .setDisplaySize(s, s * 0.7)
          .setRotation(-Math.PI / 2 + Math.sin(this.t * 6 + a) * 0.25)
          .setTint(FLAME_TINTS[step] as number)
          .setAlpha(0.85 * fl)
          .setVisible(true);
      }
    }
  }

  /** End of a frame: ages the particles, draws them, hides the unused flamer glows. */
  end(): void {
    for (let k = this.flamers; k < MAX_FLAMERS; k++) {
      const g = this.glows[k] as Phaser.GameObjects.Image;
      if (g.visible) g.setVisible(false);
    }
    const J = this.jets;
    J.step(this.dt);
    const d = this.d;
    for (let i = 0; i < J.cap; i++) {
      const img = this.imgs[i] as Phaser.GameObjects.Image;
      if (!J.draw(i, this.t, d)) {
        if (img.visible) img.setVisible(false);
        continue;
      }
      if (this.shownFrame[i] !== d.frame) {
        this.shownFrame[i] = d.frame;
        img.setFrame(FIRE_FLAME_FRAMES[d.frame] as string);
      }
      img.setPosition(d.x, d.y).setDisplaySize(d.w, d.h).setRotation(d.rot).setAlpha(d.alpha).setTint(d.tint);
      if (!img.visible) img.setVisible(true);
    }
    this.world = null;
  }

  /** Live stream particles (browser checks and the stress run read it). */
  particleCount(): number {
    return this.jets.n;
  }

  destroy(): void {
    for (const i of this.imgs) i.destroy();
    for (const i of this.glows) i.destroy();
    for (const i of this.zFlames) i.destroy();
    this.imgs.length = 0;
  }
}
