/**
 * Story 9.15 (AC 6, the action plan's "dust, debris" lane): the Behemoth's dust and grit, as a fixed pool of particles
 * (pure state here; `BossView` draws each slot with one pooled image of `ATLAS_FX › FX_DUST` / `FX_GRIT`, the Ruins
 * dust's code textures). Deterministic (a hash of an emission counter, no `Math.random`), nothing allocated after the
 * constructor. R5 "secondary follows": every burst starts on (or after) its cause, grit with a delay.
 */
export const DUST_PUFF = 0;
export const DUST_GRIT = 1;

/** The bursts (B5 visual config): count, life (s), start / end size (m), alpha, speed (m/s), delay spread (s). */
export const BOSS_DUST = {
  /** The slam hit: a puff from each fist, then grit falling off the shoulders. */
  slamPuff: { n: 5, lifeS: 0.55, s0: 0.5, s1: 1.6, alpha: 0.55, speed: 1.6, delayS: 0 },
  slamGrit: { n: 8, lifeS: 0.5, s0: 0.07, s1: 0.05, alpha: 0.9, speed: 0.9, delayS: 0.55 },
  /** The rush: a puff kicked up behind it every `everyS`. */
  rushTrail: { n: 1, lifeS: 0.6, s0: 0.7, s1: 1.8, alpha: 0.35, speed: 0.6, delayS: 0, everyS: 0.08 },
  /** The crash: a burst round the front. */
  crash: { n: 10, lifeS: 0.6, s0: 0.6, s1: 2.0, alpha: 0.55, speed: 2.4, delayS: 0.05 },
  /** The throw's lift: crumbs falling from the chunk (from `fromP` of the lift on), one every `everyS`. */
  throwCrumbs: { n: 1, lifeS: 0.45, s0: 0.08, s1: 0.06, alpha: 0.9, speed: 0.5, delayS: 0, everyS: 0.1, fromP: 0.3 },
  /** The roar: dust blown off round the body (at `enrage` 0.3 s). */
  roar: { n: 12, lifeS: 0.5, s0: 0.5, s1: 1.4, alpha: 0.4, speed: 4, delayS: 0.1 },
  /** Death: the big puff as it hits the ground (at `atShare` of the collapse). */
  death: { n: 10, lifeS: 0.9, s0: 0.8, s1: 2.4, alpha: 0.35, speed: 1.4, delayS: 0.15, atShare: 2 / 3 },
  /** Pool size (`?fx=low`: half). */
  pool: 40,
} as const;

export interface DustBurst {
  readonly n: number;
  readonly lifeS: number;
  readonly s0: number;
  readonly s1: number;
  readonly alpha: number;
  readonly speed: number;
  readonly delayS: number;
}

/** A stable 0–1 value per emission and channel. */
export function dustHash(i: number, ch: number): number {
  let h = Math.imul(i + 1, 2654435761) ^ Math.imul(ch + 7, 1597334677);
  h = Math.imul(h ^ (h >>> 15), 2246822519);
  return ((h ^ (h >>> 13)) >>> 0) / 4294967295;
}

export class BossDust {
  readonly n: number;
  /** Age (s); < 0 waiting for its delay; ≥ life: free. */
  readonly age: Float32Array;
  readonly life: Float32Array;
  readonly x: Float32Array;
  readonly y: Float32Array;
  readonly vx: Float32Array;
  readonly vy: Float32Array;
  readonly s0: Float32Array;
  readonly s1: Float32Array;
  readonly a0: Float32Array;
  readonly kind: Uint8Array;
  /** Particles emitted (the hash's counter; tests). */
  emitted = 0;

  constructor(n: number) {
    this.n = n;
    this.age = new Float32Array(n).fill(1);
    this.life = new Float32Array(n).fill(0);
    this.x = new Float32Array(n);
    this.y = new Float32Array(n);
    this.vx = new Float32Array(n);
    this.vy = new Float32Array(n);
    this.s0 = new Float32Array(n);
    this.s1 = new Float32Array(n);
    this.a0 = new Float32Array(n);
    this.kind = new Uint8Array(n);
  }

  /** A free slot, else the one nearest its end. */
  private slot(): number {
    let best = 0;
    let bestLeft = Number.POSITIVE_INFINITY;
    for (let i = 0; i < this.n; i++) {
      const a = this.age[i] as number;
      const l = this.life[i] as number;
      if (a >= l) return i;
      const left = l - a;
      if (left < bestLeft) {
        bestLeft = left;
        best = i;
      }
    }
    return best;
  }

  /**
   * `b.n` particles of `kind` round (x, y): each starts within `spread` m, moving away from (x, y) along `angle` ±
   * `cone` (radians; π = all round) at about `b.speed`, after up to `b.delayS`.
   */
  burst(kind: number, b: DustBurst, x: number, y: number, angle: number, cone: number, spread: number): void {
    if (this.n === 0) return;
    for (let k = 0; k < b.n; k++) {
      const e = this.emitted++;
      const i = this.slot();
      const a = angle + (dustHash(e, 1) * 2 - 1) * cone;
      const d = dustHash(e, 2) * spread;
      const v = b.speed * (0.6 + 0.8 * dustHash(e, 3));
      this.kind[i] = kind;
      this.x[i] = x + Math.cos(a) * d;
      this.y[i] = y + Math.sin(a) * d;
      this.vx[i] = Math.cos(a) * v;
      this.vy[i] = Math.sin(a) * v;
      this.life[i] = b.lifeS * (0.8 + 0.4 * dustHash(e, 4));
      this.age[i] = -b.delayS * dustHash(e, 5);
      this.s0[i] = b.s0;
      this.s1[i] = b.s1;
      this.a0[i] = b.alpha;
    }
  }

  /** Ages and moves every live particle (slowing down: dust drags in the air). */
  step(dtS: number): void {
    const drag = Math.max(0, 1 - 2.5 * dtS);
    for (let i = 0; i < this.n; i++) {
      const a = this.age[i] as number;
      if (a >= (this.life[i] as number)) continue;
      this.age[i] = a + dtS;
      if (a < 0) continue;
      this.x[i] = (this.x[i] as number) + (this.vx[i] as number) * dtS;
      this.y[i] = (this.y[i] as number) + (this.vy[i] as number) * dtS;
      this.vx[i] = (this.vx[i] as number) * drag;
      this.vy[i] = (this.vy[i] as number) * drag;
    }
  }

  /** Particle `i` is drawn now. */
  live(i: number): boolean {
    const a = this.age[i] as number;
    return a >= 0 && a < (this.life[i] as number);
  }
  /** 0–1 through its life. */
  t(i: number): number {
    return Math.min(1, Math.max(0, (this.age[i] as number) / Math.max(1e-6, this.life[i] as number)));
  }
  /** Size (m) and alpha now: puffs grow and fade, grit fades at the end. */
  size(i: number): number {
    const t = this.t(i);
    return (this.s0[i] as number) + ((this.s1[i] as number) - (this.s0[i] as number)) * (1 - (1 - t) * (1 - t));
  }
  alpha(i: number): number {
    const t = this.t(i);
    const a = this.a0[i] as number;
    return this.kind[i] === DUST_PUFF ? a * (t < 0.15 ? t / 0.15 : 1 - (t - 0.15) / 0.85) : a * (t < 0.7 ? 1 : (1 - t) / 0.3);
  }
  /** Nothing alive or waiting. */
  idle(): boolean {
    for (let i = 0; i < this.n; i++) if ((this.age[i] as number) < (this.life[i] as number)) return false;
    return true;
  }
  clear(): void {
    this.age.fill(1);
    this.life.fill(0);
  }
}
