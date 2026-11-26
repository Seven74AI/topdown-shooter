/**
 * Story 9.15 (AC 6, the action plan's "dust, debris" lane): the Behemoth's dust, as a fixed pool of puffs (pure state
 * here; `BossView` draws each slot with one pooled image of `ATLAS_FX › FX_DUST`, the Ruins dust's soft code texture).
 * The spec is the approved page's `boss4.ts › puffsFor`: soft grey discs that start at radius r, grow to 2.6 r and fade
 * linearly over their life, moving at a constant speed. Deterministic (a hash of an emission counter, no
 * `Math.random`); nothing allocated after the constructor. R5 "secondary follows": every burst starts on its cause.
 */

/** A burst (B5 visual config, from `puffsFor`): count, speed (m/s), start radius (m), life (s). */
export interface DustBurst {
  readonly n: number;
  readonly speed: number;
  readonly r: number;
  readonly lifeS: number;
}
export const BOSS_DUST = {
  /** The slam hit: a burst from each fist (`fistAhead` × r ahead of the centre, ± `fistSide` × r). */
  slamFists: { n: 9, speed: 2.2, r: 0.35, lifeS: 0.5 },
  fistAhead: 1.12,
  fistSide: 0.5,
  /** Grit off the shoulders after the hit: `n` per shoulder, one every `everyS` from `delayS`, drifting outward. */
  slamGrit: { n: 6, everyS: 0.07, delayS: 0.05, r: 0.08, lifeS: 0.5, outMin: 0.6, outMax: 1.1, ahead: 0.2, side: 0.72 },
  /** The rush: a puff kicked up behind it every `everyS` (26 over the 1 s rush), backward at `backMin…backMax`. */
  rushTrail: { everyS: 1 / 26, behind: 1.1, across: 1.4, r0: 0.3, rSpread: 0.25, lifeS: 0.6, backMin: 1.5, backMax: 2.5 },
  /** The crash: a burst at its front (`crashAhead` × r). */
  crash: { n: 16, speed: 3, r: 0.4, lifeS: 0.6 },
  crashAhead: 1.3,
  /** The throw's lift: `n` crumbs from the chunk, one every `everyS` from `fromP` of the lift. */
  throwCrumbs: { n: 8, everyS: 0.08, fromP: 0.3, r: 0.07, lifeS: 0.4 },
  /** The chunk's landing. */
  throwLanding: { n: 12, speed: 2, r: 0.4, lifeS: 0.5 },
  /** The roar: dust blown off (at the roar's 0.3 s). */
  roar: { n: 22, speed: 4.5, r: 0.3, lifeS: 0.5 },
  /** Death: it hits the ground (at `atShare` of the collapse). */
  death: { n: 24, speed: 2.2, r: 0.55, lifeS: 0.7, atShare: 2 / 3 },
  /** A puff's peak alpha, its growth (radius × 1 → 1 + `grow`), the spread of a burst's start (s). */
  alpha: 0.5,
  grow: 1.6,
  jitterS: 0.08,
  /** Pool size (the charge's trail + crash is 42; `?fx=low`: half). */
  pool: 48,
} as const;

/** A stable 0–1 value per emission and channel. */
export function dustHash(i: number, ch: number): number {
  let h = Math.imul(i + 1, 2654435761) ^ Math.imul(ch + 7, 1597334677);
  h = Math.imul(h ^ (h >>> 15), 2246822519);
  return ((h ^ (h >>> 13)) >>> 0) / 4294967295;
}

export class BossDust {
  readonly n: number;
  /** Age (s); < 0 waiting for its start; ≥ life: free. */
  readonly age: Float32Array;
  readonly life: Float32Array;
  readonly x: Float32Array;
  readonly y: Float32Array;
  readonly vx: Float32Array;
  readonly vy: Float32Array;
  readonly r: Float32Array;
  /** Puffs emitted (the hash's counter; tests). */
  emitted = 0;

  constructor(n: number) {
    this.n = n;
    this.age = new Float32Array(n).fill(1);
    this.life = new Float32Array(n).fill(0);
    this.x = new Float32Array(n);
    this.y = new Float32Array(n);
    this.vx = new Float32Array(n);
    this.vy = new Float32Array(n);
    this.r = new Float32Array(n);
  }

  /** A free slot, else the one nearest its end. */
  private slot(): number {
    let best = 0;
    let bestLeft = Number.POSITIVE_INFINITY;
    for (let i = 0; i < this.n; i++) {
      const a = this.age[i] as number;
      const l = this.life[i] as number;
      if (a >= l) return i;
      if (l - a < bestLeft) {
        bestLeft = l - a;
        best = i;
      }
    }
    return best;
  }

  /** One puff at (x, y) moving (vx, vy), start radius r, life (s), starting `delayS` from now. */
  emit(x: number, y: number, vx: number, vy: number, r: number, lifeS: number, delayS: number): void {
    if (this.n === 0) return;
    this.emitted++;
    const i = this.slot();
    this.x[i] = x;
    this.y[i] = y;
    this.vx[i] = vx;
    this.vy[i] = vy;
    this.r[i] = r;
    this.life[i] = lifeS;
    this.age[i] = -delayS;
  }

  /** `puffsFor`'s burst: `b.n` puffs round (x, y), every direction, speed × 0.4–1, radius × 0.6–1.2, life × 0.7–1.2, start within 0.08 s. */
  burst(b: DustBurst, x: number, y: number): void {
    for (let k = 0; k < b.n; k++) {
      const e = this.emitted;
      const a = dustHash(e, 1) * Math.PI * 2;
      const s = b.speed * (0.4 + 0.6 * dustHash(e, 2));
      this.emit(x, y, Math.cos(a) * s, Math.sin(a) * s, b.r * (0.6 + 0.6 * dustHash(e, 3)), b.lifeS * (0.7 + 0.5 * dustHash(e, 4)), BOSS_DUST.jitterS * dustHash(e, 5));
    }
  }

  /** A 0–1 hash for the next emission (emitters that place their own puffs). */
  next(ch: number): number {
    return dustHash(this.emitted, ch);
  }

  /** Ages and moves every live puff (constant speed, as the page). */
  step(dtS: number): void {
    for (let i = 0; i < this.n; i++) {
      const a = this.age[i] as number;
      if (a >= (this.life[i] as number)) continue;
      this.age[i] = a + dtS;
      if (a < 0) continue;
      this.x[i] = (this.x[i] as number) + (this.vx[i] as number) * dtS;
      this.y[i] = (this.y[i] as number) + (this.vy[i] as number) * dtS;
    }
  }

  /** Puff `i` is drawn now. */
  live(i: number): boolean {
    const a = this.age[i] as number;
    return a >= 0 && a < (this.life[i] as number);
  }
  /** 0–1 through its life. */
  t(i: number): number {
    return Math.min(1, Math.max(0, (this.age[i] as number) / Math.max(1e-6, this.life[i] as number)));
  }
  /** Diameter (m) now: radius r × (1 + grow × t). */
  size(i: number): number {
    return 2 * (this.r[i] as number) * (1 + BOSS_DUST.grow * this.t(i));
  }
  /** Alpha now: fading linearly. */
  alpha(i: number): number {
    return BOSS_DUST.alpha * (1 - this.t(i));
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
