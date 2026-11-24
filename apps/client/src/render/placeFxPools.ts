import {
  DOT_DIAMETER_M,
  DUST_ALPHA,
  DUST_LIFE_S,
  DUST_PER_PUFF,
  DUST_SIZE_FROM_M,
  DUST_SIZE_TO_M,
  DUST_SPEED_MPS,
  TAB_LIFE_MS,
  dropOffsetM,
  tabAlpha,
  DROP_MS,
} from "./placeFeel";

/**
 * Story 5.23 (AC 2, 4, 5; brief lines 10, 12): the placement feel's pools, Phaser-free so they are
 * unit-tested. Fixed-size typed arrays made once (caps from `controls.json › fx`); the oldest entry
 * is reused when full; nothing allocates per frame. `PlaceFxView` draws them.
 */

/** Dust puffs: `DUST_PER_PUFF` particles each, flying out from a footprint's edge and fading over `DUST_LIFE_S`. */
export class DustPool {
  readonly cap: number;
  /** Per particle: x, y (m), vx, vy (m/s), age (s); age ≥ life = dead. */
  readonly x: Float32Array;
  readonly y: Float32Array;
  private readonly vx: Float32Array;
  private readonly vy: Float32Array;
  readonly age: Float32Array;
  private next = 0;
  live = 0;

  constructor(maxParticles: number) {
    this.cap = Math.max(DUST_PER_PUFF, Math.floor(maxParticles / DUST_PER_PUFF) * DUST_PER_PUFF);
    this.x = new Float32Array(this.cap);
    this.y = new Float32Array(this.cap);
    this.vx = new Float32Array(this.cap);
    this.vy = new Float32Array(this.cap);
    this.age = new Float32Array(this.cap).fill(DUST_LIFE_S);
  }

  /** One puff round the box (m): particles spread round its edge (fixed angles, a seeded spin per building: no Math.random). */
  puff(minX: number, minY: number, maxX: number, maxY: number, seed: number): void {
    const cx = (minX + maxX) / 2;
    const cy = (minY + maxY) / 2;
    const hw = (maxX - minX) / 2;
    const hh = (maxY - minY) / 2;
    const spin = ((seed * 0.618034) % 1) * ((2 * Math.PI) / DUST_PER_PUFF);
    for (let k = 0; k < DUST_PER_PUFF; k++) {
      const i = this.next;
      this.next = (this.next + 1) % this.cap;
      if ((this.age[i] as number) >= DUST_LIFE_S) this.live++;
      const a = spin + (k * 2 * Math.PI) / DUST_PER_PUFF;
      const dx = Math.cos(a);
      const dy = Math.sin(a);
      // the point where the ray from the centre leaves the box: dust rises from the footprint's edge
      const s = Math.min(Math.abs(dx) > 1e-6 ? hw / Math.abs(dx) : Number.POSITIVE_INFINITY, Math.abs(dy) > 1e-6 ? hh / Math.abs(dy) : Number.POSITIVE_INFINITY);
      this.x[i] = cx + dx * s;
      this.y[i] = cy + dy * s;
      this.vx[i] = dx * DUST_SPEED_MPS;
      this.vy[i] = dy * DUST_SPEED_MPS;
      this.age[i] = 0;
    }
  }

  /** Advances every live particle by `dtS` (they slow as they fade). Returns how many are alive. */
  step(dtS: number): number {
    if (this.live === 0) return 0;
    let live = 0;
    for (let i = 0; i < this.cap; i++) {
      const a = this.age[i] as number;
      if (a >= DUST_LIFE_S) continue;
      const slow = 1 - a / DUST_LIFE_S;
      this.x[i] = (this.x[i] as number) + (this.vx[i] as number) * slow * dtS;
      this.y[i] = (this.y[i] as number) + (this.vy[i] as number) * slow * dtS;
      this.age[i] = a + dtS;
      if (a + dtS < DUST_LIFE_S) live++;
    }
    this.live = live;
    return live;
  }

  /** A particle's size (m) and alpha now (both from its age). */
  size(i: number): number {
    const t = Math.min(1, (this.age[i] as number) / DUST_LIFE_S);
    return DUST_SIZE_FROM_M + (DUST_SIZE_TO_M - DUST_SIZE_FROM_M) * t;
  }

  alpha(i: number): number {
    const t = Math.min(1, (this.age[i] as number) / DUST_LIFE_S);
    return DUST_ALPHA * (1 - t);
  }

  clear(): void {
    this.age.fill(DUST_LIFE_S);
    this.live = 0;
  }
}

/** Owner corner tabs (3 s) and the art drops (120 ms), keyed by building id; the oldest is reused when full. */
export class TabPool {
  readonly cap: number;
  readonly id: Int32Array;
  readonly minX: Float32Array;
  readonly minY: Float32Array;
  readonly color: Uint32Array;
  /** Scene clock (ms) of the placement. */
  readonly at: Float64Array;
  /** Whether this entry still drops its art (a stale event shows a tab but no drop). */
  readonly drops: Uint8Array;
  /** Review L3: the building has been seen in the World (online the event can come before the schema). */
  private readonly seen: Uint8Array;
  private next = 0;

  constructor(cap: number) {
    this.cap = Math.max(1, Math.floor(cap));
    this.id = new Int32Array(this.cap).fill(-1);
    this.minX = new Float32Array(this.cap);
    this.minY = new Float32Array(this.cap);
    this.color = new Uint32Array(this.cap);
    this.at = new Float64Array(this.cap);
    this.drops = new Uint8Array(this.cap);
    this.seen = new Uint8Array(this.cap);
  }

  /** A building placed `ageMs` before `nowMs` (its tab runs only for what is left of 3 s; a stale one doesn't drop). */
  add(id: number, minX: number, minY: number, color: number, nowMs: number, ageMs: number, drop: boolean): void {
    if (ageMs >= TAB_LIFE_MS) return;
    let i = this.indexOf(id);
    if (i < 0) {
      i = this.next;
      this.next = (this.next + 1) % this.cap;
    }
    this.id[i] = id;
    this.minX[i] = minX;
    this.minY[i] = minY;
    this.color[i] = color;
    this.at[i] = nowMs - Math.max(0, ageMs);
    this.drops[i] = drop ? 1 : 0;
    this.seen[i] = 0;
  }

  /**
   * Review L3: frees the tab of a building that was in the World and is gone (sold, taken back,
   * destroyed); a tab whose building hasn't arrived yet (online: the event before the schema) stays.
   */
  dropMissing(has: (id: number) => boolean): void {
    for (let i = 0; i < this.cap; i++) {
      const id = this.id[i] as number;
      if (id < 0) continue;
      if (has(id)) this.seen[i] = 1;
      else if (this.seen[i] === 1) this.id[i] = -1;
    }
  }

  indexOf(id: number): number {
    for (let i = 0; i < this.cap; i++) if (this.id[i] === id) return i;
    return -1;
  }

  /** The tab's alpha at `nowMs` (0 when gone or never placed). */
  alphaOf(i: number, nowMs: number): number {
    return (this.id[i] as number) < 0 ? 0 : tabAlpha(nowMs - (this.at[i] as number));
  }

  /** The art's drop offset (m) for building `id` at `nowMs` (0 when it isn't dropping). */
  dropOf(id: number, nowMs: number): number {
    const i = this.indexOf(id);
    if (i < 0 || this.drops[i] === 0) return 0;
    return dropOffsetM(nowMs - (this.at[i] as number));
  }

  /** Any drop still running at `nowMs`. */
  dropping(nowMs: number): boolean {
    for (let i = 0; i < this.cap; i++) if ((this.id[i] as number) >= 0 && this.drops[i] === 1 && nowMs - (this.at[i] as number) < DROP_MS) return true;
    return false;
  }

  /** Frees entries whose tab is over; returns how many tabs are still showing. */
  prune(nowMs: number): number {
    let n = 0;
    for (let i = 0; i < this.cap; i++) {
      if ((this.id[i] as number) < 0) continue;
      if (nowMs - (this.at[i] as number) >= TAB_LIFE_MS) this.id[i] = -1;
      else n++;
    }
    return n;
  }

  /** A wave starts (AC 4: tabs hidden in waves) or the run ends. */
  clear(): void {
    this.id.fill(-1);
  }
}

/** The owner dot's radius (m). */
export const DOT_RADIUS_M = DOT_DIAMETER_M / 2;
