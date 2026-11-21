/**
 * Seeded PRNG for the simulation (NFR10). sfc32, seeded from a uint32 by splitmix32.
 * Never use Math.random() in packages/shared.
 */
export type RngState = readonly [number, number, number, number];

export interface Rng {
  /** Uniform float in [0, 1). */
  next(): number;
  /** Uniform integer in [minIncl, maxIncl]. */
  int(minIncl: number, maxIncl: number): number;
  /** Uniform float in [min, max). */
  range(min: number, max: number): number;
  /** Uniform element of a non-empty array. */
  pick<T>(items: readonly T[]): T;
  /** Current state, for snapshots (Story 8.4). */
  getState(): RngState;
}

const WARM_UP_DRAWS = 12;
const UINT32 = 4294967296;

class Sfc32 implements Rng {
  private a: number;
  private b: number;
  private c: number;
  private d: number;

  constructor(state: RngState) {
    [this.a, this.b, this.c, this.d] = state;
  }

  private nextUint32(): number {
    const t0 = (this.a + this.b) | 0;
    this.a = this.b ^ (this.b >>> 9);
    this.b = (this.c + (this.c << 3)) | 0;
    this.c = (this.c << 21) | (this.c >>> 11);
    this.d = (this.d + 1) | 0;
    const t = (t0 + this.d) | 0;
    this.c = (this.c + t) | 0;
    return t >>> 0;
  }

  next(): number {
    return this.nextUint32() / UINT32;
  }

  int(minIncl: number, maxIncl: number): number {
    return minIncl + Math.floor(this.next() * (maxIncl - minIncl + 1));
  }

  range(min: number, max: number): number {
    return min + this.next() * (max - min);
  }

  pick<T>(items: readonly T[]): T {
    if (items.length === 0) throw new Error("Rng.pick: empty array");
    return items[Math.floor(this.next() * items.length)] as T;
  }

  getState(): RngState {
    return [this.a >>> 0, this.b >>> 0, this.c >>> 0, this.d >>> 0];
  }
}

/** splitmix32: expands one 32-bit seed into well-mixed state words. */
function splitmix32(seed: number): () => number {
  let s = seed | 0;
  return () => {
    s = (s + 0x9e3779b9) | 0;
    let t = s ^ (s >>> 16);
    t = Math.imul(t, 0x21f0aaad);
    t ^= t >>> 15;
    t = Math.imul(t, 0x735a2d97);
    return (t ^ (t >>> 15)) >>> 0;
  };
}

export function createRng(seed: number): Rng {
  const mix = splitmix32(seed >>> 0);
  const rng = new Sfc32([mix(), mix(), mix(), mix()]);
  for (let i = 0; i < WARM_UP_DRAWS; i++) rng.next();
  return rng;
}

export function createRngFromState(state: RngState): Rng {
  return new Sfc32(state);
}
