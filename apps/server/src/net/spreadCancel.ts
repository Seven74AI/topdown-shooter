import { seqSpreadRoll } from "@topdown/shared";

/**
 * Story 2.12 review M1 (decided by the main session 2026-11-22): the online spread roll is
 * predictable (`seqSpreadRoll(playerId, seq)`), so a modified client could pre-rotate its aim by
 * −roll × half and cancel the spread. Accepted for co-op PvE; this is cheap telemetry, never a kick.
 *
 * For consecutive firing inputs with a spread weapon, the aim change from the previous input is
 * compared with what a pre-rotating client produces with a steady aim:
 * `expected = −(roll(seq) − roll(prevSeq)) × half`. Two signals per window of SPREAD_CANCEL_WINDOW
 * samples (only samples with |expected| ≥ SPREAD_CANCEL_MIN_EXPECTED_RAD count):
 * - the share of exact matches (|delta − expected| < SPREAD_CANCEL_EPS_RAD): a steady-aim cheat;
 * - a least-squares fit `delta ≈ c + k × expected` (the intercept absorbs a steady turn while
 *   tracking) with its t-statistic: a cheat that also tracks a moving target (k ≈ 1, large t).
 *   Honest aim is independent of the rolls: k ≈ 0, |t| ~ N(0, 1).
 * Allocation-free: plain numbers per player.
 */
export const SPREAD_CANCEL_WINDOW = 40;
export const SPREAD_CANCEL_EPS_RAD = (0.05 * Math.PI) / 180;
export const SPREAD_CANCEL_MIN_EXPECTED_RAD = 4 * SPREAD_CANCEL_EPS_RAD;
/** Flag when at least this share of a window matches exactly… */
export const SPREAD_CANCEL_MATCH_RATIO = 0.5;
/** …or the fit says k within [0.7, 1.3] with t ≥ 6 (an honest window: about 1 in 10⁹). */
export const SPREAD_CANCEL_K_MIN = 0.7;
export const SPREAD_CANCEL_K_MAX = 1.3;
export const SPREAD_CANCEL_T_MIN = 6;

const TWO_PI = 2 * Math.PI;
const wrap = (a: number): number => a - TWO_PI * Math.round(a / TWO_PI);

/** The result of a flagged window (one reused object per watch). */
export interface SpreadCancelSuspect {
  playerId: string;
  wave: number;
  matchRatio: number;
  k: number;
  t: number;
  samples: number;
}

export class SpreadCancelWatch {
  private prevSeq = -1;
  private prevAngle = 0;
  private n = 0;
  private matches = 0;
  private sx = 0;
  private sy = 0;
  private sxy = 0;
  private sxx = 0;
  private syy = 0;
  private loggedWave = -1;
  readonly suspect: SpreadCancelSuspect = { playerId: "", wave: 0, matchRatio: 0, k: 0, t: 0, samples: 0 };

  constructor(readonly playerId: string) {
    this.suspect.playerId = playerId;
  }

  /**
   * One newly applied input. `spreadDeg` is the active gun's spread (0 for none / melee). Returns
   * the suspect report when a window just closed flagged and this wave has no report yet, else null.
   */
  observe(seq: number, aimX: number, aimY: number, fire: boolean, spreadDeg: number, wave: number): SpreadCancelSuspect | null {
    if (aimX === 0 && aimY === 0) {
      this.prevSeq = -1;
      return null;
    }
    const angle = Math.atan2(aimY, aimX);
    const prevSeq = this.prevSeq;
    const prevAngle = this.prevAngle;
    this.prevSeq = seq;
    this.prevAngle = angle;
    if (prevSeq < 0 || seq !== prevSeq + 1 || !fire || spreadDeg <= 0) return null;
    const half = ((spreadDeg / 2) * Math.PI) / 180;
    const expected = -(seqSpreadRoll(this.playerId, seq) - seqSpreadRoll(this.playerId, prevSeq)) * half;
    if (Math.abs(expected) < SPREAD_CANCEL_MIN_EXPECTED_RAD) return null;
    const delta = wrap(angle - prevAngle);
    this.n++;
    if (Math.abs(delta - expected) < SPREAD_CANCEL_EPS_RAD) this.matches++;
    this.sx += expected;
    this.sy += delta;
    this.sxy += delta * expected;
    this.sxx += expected * expected;
    this.syy += delta * delta;
    if (this.n < SPREAD_CANCEL_WINDOW) return null;
    const n = this.n;
    const cxx = this.sxx - (this.sx * this.sx) / n;
    const cxy = this.sxy - (this.sx * this.sy) / n;
    const cyy = this.syy - (this.sy * this.sy) / n;
    const k = cxx > 0 ? cxy / cxx : 0;
    const rss = Math.max(0, cyy - k * cxy); // Σ(delta − c − k·expected)²
    const se = cxx > 0 ? Math.sqrt(rss / (n - 2) / cxx) : Number.POSITIVE_INFINITY;
    const t = se > 0 ? k / se : k > 0 ? Number.POSITIVE_INFINITY : 0;
    const matchRatio = this.matches / n;
    this.n = this.matches = 0;
    this.sx = this.sy = this.sxy = this.sxx = this.syy = 0;
    const flagged = matchRatio >= SPREAD_CANCEL_MATCH_RATIO || (k >= SPREAD_CANCEL_K_MIN && k <= SPREAD_CANCEL_K_MAX && t >= SPREAD_CANCEL_T_MIN);
    if (!flagged || wave === this.loggedWave) return null;
    this.loggedWave = wave;
    const s = this.suspect;
    s.wave = wave;
    s.matchRatio = matchRatio;
    s.k = k;
    s.t = t;
    s.samples = n;
    return s;
  }
}
