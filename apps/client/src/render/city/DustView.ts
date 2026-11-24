import type * as Phaser from "phaser";
import { isRubble, type MapBox, type World } from "@topdown/shared";
import { ATLAS_FX, FX_DUST, FX_GRIT } from "./spriteAtlas";
import { mulberry32, RUINS_MATS } from "./ruinsArt";
import { playSfx } from "../../audio/placeholderSfx";

/** Above the street and rubble, below characters (with the lamp drop-outs). */
const DUST_DEPTH = 4.34;
const PUFF_SMOKE = 3;
const PUFF_GRIT = 8;
/** Smoke puff size (m), life (s), drift (m/s); grit life, fall height (m), size (m). */
const SMOKE_M = 0.8;
const SMOKE_GROW = 1.4;
const SMOKE_LIFE_S = 1.8;
const SMOKE_ALPHA = 0.5;
const GRIT_LIFE_S = 1.1;
const GRIT_DROP_M = 2;
const GRIT_M = 0.06;
/** The collapse burst: puffs per second per spot while it lasts. */
const BURST_RATE_HZ = 6;

/**
 * Story 6.2 (D9, D10; F7): Ruins ambience. Every `dustGapMinS`–`dustGapMaxS` a dust puff (smoke +
 * falling grit, the lab's `dustFx`) at a random rubble box or a roof edge in view, with a panned
 * `debris_fall`; the stage-4 collapse moment (`burst`) puffs at the closed alley and each pile for
 * `collapseBurstS` with the `ruins_rumble`. Cosmetic only: no damage, no slow, no collision.
 * Pooled (`maxDustSmoke` + `maxDustGrit` images, halved with `?fx=low`); a local seeded random, no
 * sim stream; nothing allocated per frame.
 */
export class DustView {
  private readonly smoke: Phaser.GameObjects.Image[] = [];
  private readonly grit: Phaser.GameObjects.Image[] = [];
  private readonly sAge: Float32Array;
  private readonly sX: Float32Array;
  private readonly sY: Float32Array;
  private readonly sVx: Float32Array;
  private readonly gAge: Float32Array;
  private readonly gX: Float32Array;
  private readonly gY: Float32Array;
  private readonly gVx: Float32Array;
  private readonly rnd = mulberry32(0x6d2);
  private next = 0.4;
  private burstLeft = 0;
  private burstAcc = 0;
  private readonly spots: MapBox[] = [];
  private spotsVersion = -1;
  private tint = 0xb8b0a0;
  private lastLook = -1;
  /** Puffs started (tests). */
  puffs = 0;

  constructor(scene: Phaser.Scene, maxSmoke: number, maxGrit: number, lowFx: boolean) {
    const ns = lowFx ? Math.floor(maxSmoke / 2) : maxSmoke;
    const ng = lowFx ? Math.floor(maxGrit / 2) : maxGrit;
    for (let i = 0; i < ns; i++) this.smoke.push(scene.add.image(0, 0, ATLAS_FX, FX_DUST).setDepth(DUST_DEPTH).setVisible(false));
    for (let i = 0; i < ng; i++) this.grit.push(scene.add.image(0, 0, ATLAS_FX, FX_GRIT).setDisplaySize(GRIT_M, GRIT_M).setDepth(DUST_DEPTH).setVisible(false));
    this.sAge = new Float32Array(ns).fill(-1);
    this.sX = new Float32Array(ns);
    this.sY = new Float32Array(ns);
    this.sVx = new Float32Array(ns);
    this.gAge = new Float32Array(ng).fill(-1);
    this.gX = new Float32Array(ng);
    this.gY = new Float32Array(ng);
    this.gVx = new Float32Array(ng);
  }

  /** Story 6.2 (D9): the collapse moment (only on the live `decay.stage_changed` to 4; a woken tab skips it). */
  burst(world: World, burstS: number): void {
    this.refreshSpots(world);
    this.burstLeft = burstS;
    playSfx("ruins_rumble");
  }

  private refreshSpots(world: World): void {
    if (this.spotsVersion === world.obstacles.version) return;
    this.spotsVersion = world.obstacles.version;
    this.spots.length = 0;
    for (const w of world.obstacles.walls) if (isRubble(w)) this.spots.push(w);
  }

  /** One frame: `look` = the Ruins material (dust colour); view in metres; `dtS` 0 while paused. */
  update(world: World, look: number, viewX: number, viewY: number, viewW: number, viewH: number, dtS: number): void {
    const active = world.decay.stage === 4;
    if (look !== this.lastLook) {
      this.lastLook = look;
      const d = (RUINS_MATS[look] ?? RUINS_MATS[0])?.dust.split(",").map(Number) ?? [184, 176, 160];
      this.tint = ((d[0] ?? 0) << 16) | ((d[1] ?? 0) << 8) | (d[2] ?? 0);
    }
    if (active && dtS > 0) {
      this.refreshSpots(world);
      const cfg = world.balance.decay.ruins;
      this.next -= dtS;
      if (this.next <= 0) {
        this.next = cfg.dustGapMinS + this.rnd() * (cfg.dustGapMaxS - cfg.dustGapMinS);
        this.puffInView(viewX, viewY, viewW, viewH);
      }
      if (this.burstLeft > 0) {
        this.burstLeft -= dtS;
        this.burstAcc += dtS * BURST_RATE_HZ;
        while (this.burstAcc >= 1) {
          this.burstAcc--;
          for (const s of this.spots) this.puffAt(s.minX + this.rnd() * (s.maxX - s.minX), s.minY + this.rnd() * (s.maxY - s.minY));
        }
      }
    } else if (!active) this.burstLeft = 0;
    this.step(dtS);
  }

  /** A puff at a rubble box in view (a random point on it), else nothing (no puff off screen). */
  private puffInView(vx: number, vy: number, vw: number, vh: number): void {
    const n = this.spots.length;
    if (n === 0) return;
    const start = Math.floor(this.rnd() * n);
    for (let k = 0; k < n; k++) {
      const s = this.spots[(start + k) % n] as MapBox;
      if (s.maxX < vx || s.minX > vx + vw || s.maxY < vy || s.minY > vy + vh) continue;
      const x = s.minX + this.rnd() * (s.maxX - s.minX);
      const y = s.minY + this.rnd() * (s.maxY - s.minY);
      this.puffAt(x, y);
      playSfx("debris_fall", Math.max(-1, Math.min(1, ((x - vx) / vw) * 2 - 1)));
      return;
    }
  }

  private puffAt(x: number, y: number): void {
    this.puffs++;
    let placed = 0;
    for (let i = 0; i < this.sAge.length && placed < PUFF_SMOKE; i++) {
      if ((this.sAge[i] as number) >= 0) continue;
      this.sAge[i] = 0;
      this.sX[i] = x + (this.rnd() - 0.5) * 0.6;
      this.sY[i] = y + (this.rnd() - 0.5) * 0.4;
      this.sVx[i] = (this.rnd() - 0.3) * 0.3;
      (this.smoke[i] as Phaser.GameObjects.Image).setTint(this.tint).setVisible(true);
      placed++;
    }
    placed = 0;
    for (let i = 0; i < this.gAge.length && placed < PUFF_GRIT; i++) {
      if ((this.gAge[i] as number) >= 0) continue;
      this.gAge[i] = 0;
      this.gX[i] = x + (this.rnd() - 0.5) * 0.5;
      this.gY[i] = y + (this.rnd() - 0.5) * 0.3;
      this.gVx[i] = (this.rnd() - 0.5) * 0.6;
      (this.grit[i] as Phaser.GameObjects.Image).setTint(this.tint).setVisible(true);
      placed++;
    }
  }

  private step(dtS: number): void {
    for (let i = 0; i < this.sAge.length; i++) {
      const age = this.sAge[i] as number;
      if (age < 0) continue;
      const a = age + dtS;
      const img = this.smoke[i] as Phaser.GameObjects.Image;
      if (a >= SMOKE_LIFE_S) {
        this.sAge[i] = -1;
        img.setVisible(false);
        continue;
      }
      this.sAge[i] = a;
      const u = a / SMOKE_LIFE_S;
      const size = SMOKE_M * (1 + SMOKE_GROW * u);
      img.setPosition((this.sX[i] as number) + (this.sVx[i] as number) * a, (this.sY[i] as number) + 0.15 * a).setDisplaySize(size, size).setAlpha(SMOKE_ALPHA * Math.sin(Math.PI * Math.min(1, u * 1.4)) * (1 - u));
    }
    for (let i = 0; i < this.gAge.length; i++) {
      const age = this.gAge[i] as number;
      if (age < 0) continue;
      const a = age + dtS;
      const img = this.grit[i] as Phaser.GameObjects.Image;
      if (a >= GRIT_LIFE_S) {
        this.gAge[i] = -1;
        img.setVisible(false);
        continue;
      }
      this.gAge[i] = a;
      const u = a / GRIT_LIFE_S;
      // A top-down fall: the chip drops toward its landing point "up the screen" and settles.
      const lift = GRIT_DROP_M * (1 - u) * (1 - u) * 0.3;
      img.setPosition((this.gX[i] as number) + (this.gVx[i] as number) * a * 0.3, (this.gY[i] as number) - lift).setRotation(a * 6).setAlpha(1 - u);
    }
  }

  /** Live particles (tests: the caps hold). */
  get live(): number {
    let n = 0;
    for (const a of this.sAge) if (a >= 0) n++;
    for (const a of this.gAge) if (a >= 0) n++;
    return n;
  }

  destroy(): void {
    for (const img of [...this.smoke, ...this.grit]) img.destroy();
    this.smoke.length = 0;
    this.grit.length = 0;
  }
}
