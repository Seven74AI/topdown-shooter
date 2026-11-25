import type { ZombieTypeId } from "@topdown/shared";
import { fbm } from "./city/groundDamageArt";

/**
 * Story 9.13 (AC 2): take 4's animation parameters (`docs/art/photoreal-2/src/take4.ts › ZOMBIE, SURV, ROWS`) and the
 * per-frame curves the views apply as transforms and alphas (no canvas work per frame). Pure.
 */
export interface CharAnim {
  /** Breathing strength (body swell amplitude) and rate (breaths per second). */
  readonly breathe: number;
  readonly rate: number;
  /** Weight-shift sway (radians). */
  readonly sway: number;
  /** Glow pulse: base, swing, rate (per second). */
  readonly glowBase: number;
  readonly glowSwing: number;
  readonly glowRate: number;
  /** Acid drips from (x, y) in radii (the Spitter's mouth). */
  readonly drip?: readonly [number, number];
  /** Vibration (page px at 68 px per radius) for running engines. */
  readonly shake?: number;
  /** Flicker (pilot flames). */
  readonly flicker?: boolean;
}

const ZOMBIE: CharAnim = { breathe: 0.012, rate: 0.35, sway: 0.025, glowBase: 0.6, glowSwing: 0.4, glowRate: 1.2 };
export const SURV_ANIM: CharAnim = { breathe: 0.008, rate: 0.28, sway: 0.012, glowBase: 0.7, glowSwing: 0.3, glowRate: 6, flicker: true };
/** The running chainsaw shakes (take 4: 1.2 page px). */
export const SURV_SAW_ANIM: CharAnim = { ...SURV_ANIM, shake: 1.2 };

const WALKER: CharAnim = { ...ZOMBIE, sway: 0.02 };
const RUNNER: CharAnim = { ...ZOMBIE, rate: 0.9, breathe: 0.012, sway: 0 };
const CRAWLER: CharAnim = { ...ZOMBIE, sway: 0.015 };
const SPITTER: readonly CharAnim[] = [false, true].map((wu) => ({ ...ZOMBIE, glowBase: wu ? 0.9 : 0.6, glowSwing: wu ? 0.6 : 0.4, glowRate: wu ? 4 : 1.4, drip: [wu ? 0.85 : 1.15, 0] as const }));
const BRUTE: readonly CharAnim[] = [false, true].map((wu) => ({ ...ZOMBIE, breathe: wu ? 0.035 : 0.022, rate: wu ? 1.2 : 0.3, sway: 0.02 }));
const BLOATER: readonly CharAnim[] = [0, 1, 2, 3].map((st) => ({ ...ZOMBIE, breathe: 0.02 + st * 0.012, rate: 0.35 + st * 0.6, sway: 0.01, glowBase: 0.5 + st * 0.15, glowSwing: 0.3 + st * 0.2, glowRate: 1 + st * 1.5 }));

/** A zombie's animation now: `pose` is the windup (Spitter, Brute: 1) or the swell stage (Bloater: 0–3). */
export function zombieAnim(type: ZombieTypeId, pose: number): CharAnim {
  switch (type) {
    case "walker":
      return WALKER;
    case "runner":
      return RUNNER;
    case "crawler":
      return CRAWLER;
    case "spitter":
      return SPITTER[pose ? 1 : 0] as CharAnim;
    case "brute":
      return BRUTE[pose ? 1 : 0] as CharAnim;
    case "bloater":
      return BLOATER[Math.max(0, Math.min(3, pose))] as CharAnim;
  }
}

/** take 4 › loop lengths (s) of the walk loops, per variant. */
export function loopSeconds(type: ZombieTypeId, v: number): number {
  if (type === "walker") return 1.6 + v * 0.15;
  if (type === "runner") return 0.55;
  if (type === "crawler") return 1.9;
  return 0;
}

const TAU = Math.PI * 2;
/** The breathing swell: x (along the facing) × it, y × `1 + (it − 1) × 0.6` (take 4's non-uniform scale). */
export const breath = (a: CharAnim, t: number): number => 1 + a.breathe * Math.sin(t * a.rate * TAU);
/** The weight shift (radians, added to the facing). */
export const sway = (a: CharAnim, t: number): number => a.sway * Math.sin(t * a.rate * Math.PI * 0.7 + 1);
/** The glow pulse (an alpha, 0–1); survivors flicker (pilot flames). */
export function glowPulse(a: CharAnim, t: number): number {
  let k = a.glowBase + a.glowSwing * Math.sin(t * a.glowRate * TAU);
  if (a.flicker) k *= 0.8 + 0.2 * fbm(t * 9, 0.5, 3, 2) * 2;
  return Math.max(0, Math.min(1, k));
}
/** A per-character time offset (take 4 gives each card `i × 0.37`), from a slot number. */
export const phaseOffset = (slot: number): number => ((Math.imul(slot + 1, 2654435761) >>> 0) % 1000) / 100;
