import { TICK_RATE_HZ } from "@topdown/shared";

/**
 * Story 6.2 (F6, D7): the Ruins streetlight flicker. Each lamp drops out for 0.15–0.6 s every
 * 4–10 s (`decay.json › ruins`), keyed ONLY to (run seed, lamp index, World tick): every phone
 * (the mirror follows the server's tick) shows the same lamp out on the same tick, a late joiner or
 * a woken tab included. Pure, no allocation, no stream draw, never in the sim: a warning, nothing more.
 *
 * Windows: lamp i's k-th drop-out starts at `phase_i + k × mean + jitter_k`, mean = (gapMin +
 * gapMax) / 2 and jitter_k ∈ ±(gapMax − gapMin) / 4, so consecutive starts are gapMin–gapMax apart;
 * it lasts lampOutMin–lampOutMax (whole ticks).
 */
export interface LampFlickerCfg {
  readonly lampOutMinS: number;
  readonly lampOutMaxS: number;
  readonly lampGapMinS: number;
  readonly lampGapMaxS: number;
}

/** 32-bit integer hash of three ints (deterministic on every engine). */
export function hash3(a: number, b: number, c: number): number {
  let h = Math.imul(a | 0, 0x9e3779b1) ^ Math.imul((b | 0) + 0x7f4a7c15, 0x85ebca6b) ^ Math.imul((c | 0) + 0x165667b1, 0xc2b2ae35);
  h ^= h >>> 16;
  h = Math.imul(h, 0x7feb352d);
  h ^= h >>> 15;
  h = Math.imul(h, 0x846ca68b);
  h ^= h >>> 16;
  return h >>> 0;
}
const unit = (h: number): number => h / 4294967296;

/** Start tick and length (ticks) of lamp `lamp`'s window `k` into `out`. */
function windowOf(seed: number, lamp: number, k: number, cfg: LampFlickerCfg, out: { start: number; len: number }): void {
  const mean = ((cfg.lampGapMinS + cfg.lampGapMaxS) / 2) * TICK_RATE_HZ;
  const jit = ((cfg.lampGapMaxS - cfg.lampGapMinS) / 4) * TICK_RATE_HZ;
  const phase = Math.floor(unit(hash3(seed, lamp, -1)) * mean);
  const j = Math.round((unit(hash3(seed, lamp, k * 2)) * 2 - 1) * jit);
  const lo = Math.ceil(cfg.lampOutMinS * TICK_RATE_HZ);
  const hi = Math.max(lo, Math.floor(cfg.lampOutMaxS * TICK_RATE_HZ));
  out.start = phase + Math.round(k * mean) + j;
  out.len = lo + Math.floor(unit(hash3(seed, lamp, k * 2 + 1)) * (hi - lo + 1));
}

const scratch = { start: 0, len: 0 };

/** Story 6.2: lamp `lamp` is out at World tick `tick` (run seed `seed`). */
export function lampOutAt(seed: number, lamp: number, tick: number, cfg: LampFlickerCfg): boolean {
  const mean = ((cfg.lampGapMinS + cfg.lampGapMaxS) / 2) * TICK_RATE_HZ;
  const k0 = Math.floor(tick / mean);
  for (let k = k0 - 2; k <= k0 + 1; k++) {
    windowOf(seed, lamp, k, cfg, scratch);
    if (tick >= scratch.start && tick < scratch.start + scratch.len) return true;
  }
  return false;
}

/** Tests: the window list of a lamp (allocates). */
export function lampWindows(seed: number, lamp: number, fromK: number, toK: number, cfg: LampFlickerCfg): { start: number; len: number }[] {
  const out: { start: number; len: number }[] = [];
  for (let k = fromK; k <= toK; k++) {
    const w = { start: 0, len: 0 };
    windowOf(seed, lamp, k, cfg, w);
    out.push(w);
  }
  return out;
}
