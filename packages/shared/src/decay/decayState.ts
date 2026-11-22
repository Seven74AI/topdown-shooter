import type { Balance } from "../config/balance";
import type { Rng } from "../core/rng";
import type { DecayMutation, DistrictMap } from "../map/districtMap";
import { FIRST_DECAY_STAGE } from "../map/decayStage";

/**
 * Story 4.5: a fire record left by an `ignite` mutation (centre of its target, `radiusM`). Data only
 * in this story: Story 4.8 gives it damage (10/s), the flow-field cost and its 2-wave expiry.
 */
export interface FireRecord {
  /** The mutation's name. */
  readonly name: string;
  /** The burning object's name. */
  readonly target: string;
  readonly x: number;
  readonly y: number;
  readonly radiusM: number;
  /** The stage it started in. */
  readonly stage: number;
}

/**
 * Story 4.5: the run's decay (architecture › Decay Stage Engine). `stage` is THE decay stage
 * (`map/decayStage.ts › currentDecayStage` reads it); `variants` the candidates `DecayTimeline` chose
 * at run start (bit i = `map.decayVariants[i]`); `fires` the active fire records. Changed only by
 * `applyDecayStage` (World creation, a build start, the solo dev cheat; the client mirror and
 * Predictor from the room state).
 */
export interface DecayState {
  stage: number;
  variants: number;
  readonly fires: FireRecord[];
}

export function createDecayState(variants: number): DecayState {
  return { stage: FIRST_DECAY_STAGE, variants: variants >>> 0, fires: [] };
}

/**
 * Story 4.5 `DecayTimeline`: the stage of wave `wave` (1-based) from `decay.json › stageByWave`
 * (waves past the table keep its last stage; wave ≤ 0 = the first entry), or from a dev override table.
 */
export function stageForWave(balance: Balance, wave: number, override: readonly number[] | null = null): number {
  const table = override !== null && override.length > 0 ? override : balance.decay.stageByWave;
  const i = Math.min(table.length - 1, Math.max(0, wave - 1));
  return table[i] as number;
}

/**
 * Story 4.5 `DecayTimeline`: picks the run's variation candidates once, from the `decay` stream
 * only (brief line 8). Groups in first-appearance order; in each, `pick` of its candidates by a
 * partial Fisher–Yates (`pick` draws). Returns the chosen set as a bitmask (bit i = candidate i).
 * A map without variants draws nothing.
 */
export function pickDecayVariants(map: DistrictMap, rng: Rng): number {
  const vs = map.decayVariants;
  if (vs.length === 0) return 0;
  let mask = 0;
  const done = new Set<string>();
  for (const v of vs) {
    if (done.has(v.group)) continue;
    done.add(v.group);
    const members: number[] = [];
    for (let i = 0; i < vs.length; i++) if ((vs[i] as { group: string }).group === v.group) members.push(i);
    const n = members.length;
    for (let k = 0; k < v.pick && k < n; k++) {
      const j = rng.int(k, n - 1);
      const t = members[k] as number;
      members[k] = members[j] as number;
      members[j] = t;
      mask |= 1 << (members[k] as number);
    }
  }
  return mask >>> 0;
}

/** Story 4.5: the fire record of an `ignite` mutation (cached: the same object every rebuild). */
const fireOf = new WeakMap<DecayMutation, FireRecord>();
export function fireRecordOf(m: DecayMutation): FireRecord {
  let f = fireOf.get(m);
  if (!f) {
    f = Object.freeze({ name: m.name, target: m.target, x: (m.minX + m.maxX) / 2, y: (m.minY + m.maxY) / 2, radiusM: m.radiusM, stage: m.stage });
    fireOf.set(m, f);
  }
  return f;
}
