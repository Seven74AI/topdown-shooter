import type { Balance } from "../config/balance";
import type { Rng } from "../core/rng";
import type { DecayMutation, DistrictMap } from "../map/districtMap";
import { FIRST_DECAY_STAGE } from "../map/decayStage";

/**
 * Story 4.5: a fire zone left by an `ignite` mutation (centre of its target). Story 4.8: it burns
 * (`decay/fire.ts`: 10 damage per second to everything inside, a flow-field cost) until it goes out
 * `decay.json › fire.durationWaves` waves after it was lit.
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
  /** Story 4.8: its bit in `DecayState.firesOut` (the map's ignites in map order). */
  readonly index: number;
}

/**
 * Story 4.5: the run's decay (architecture › Decay Stage Engine). `stage` is THE decay stage
 * (`map/decayStage.ts › currentDecayStage` reads it); `variants` the candidates `DecayTimeline` chose
 * at run start (bit i = `map.decayVariants[i]`); `fires` the burning fire zones. Changed only by
 * `applyDecayStage` (World creation, a build start, the solo dev cheat; the client mirror and
 * Predictor from the room state).
 */
export interface DecayState {
  stage: number;
  variants: number;
  /** The burning fires (a subset of `fireSlots`, map order). */
  readonly fires: FireRecord[];
  /** Story 4.8: bit i = the map's i-th ignite has burned out (synced on change: `decayFiresOut`). */
  firesOut: number;
  /** Story 4.8: one record per ignite mutation of the map (built once per World; `fires` points into it). */
  readonly fireSlots: readonly FireRecord[];
  /**
   * Story 4.8 (server / solo only, never synced): per ignite, the coming wave at whose build start it
   * goes out; 0 = not lit.
   */
  readonly fireEndWave: Int32Array;
  /** Story 4.8: ticks counted while a fire burns in a build or wave phase (the damage pulse clock). */
  burnTicks: number;
}

export function createDecayState(variants: number, map?: DistrictMap, defaultFireRadiusM = 0): DecayState {
  const fireSlots: FireRecord[] = [];
  if (map) for (const m of map.decay) if (m.action === "ignite") fireSlots.push(fireRecordOf(m, fireSlots.length, defaultFireRadiusM));
  return { stage: FIRST_DECAY_STAGE, variants: variants >>> 0, fires: [], firesOut: 0, fireSlots, fireEndWave: new Int32Array(fireSlots.length), burnTicks: 0 };
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

/**
 * Story 4.5: the fire record of an `ignite` mutation (Story 4.8: `index` = its bit in `firesOut`;
 * radius = the map's override or `defaultRadiusM`, the balance's `decay.fire.radiusM`). Allocates:
 * World creation and tests only.
 */
export function fireRecordOf(m: DecayMutation, index: number, defaultRadiusM: number): FireRecord {
  return Object.freeze({ name: m.name, target: m.target, x: (m.minX + m.maxX) / 2, y: (m.minY + m.maxY) / 2, radiusM: m.radiusM > 0 ? m.radiusM : defaultRadiusM, stage: m.stage, index });
}

/**
 * Story 6.2: the bits of `map.decayVariants` whose candidates change gameplay (a group with at least
 * one non-`look` object). The look groups (Ruins material, Collapse weather style) only change the
 * picture. Allocates nothing but is O(decay); tests and tools only.
 */
export function gameplayVariantMask(map: DistrictMap): number {
  let mask = 0;
  for (const m of map.decay) if (m.variant >= 0 && m.action !== "look") mask |= 1 << m.variant;
  // Every candidate of a group whose objects are not all looks counts (a candidate may be empty of
  // gameplay objects only if its group is a look group).
  const gameplayGroups = new Set<string>();
  map.decayVariants.forEach((v, i) => {
    if ((mask >>> i) & 1) gameplayGroups.add(v.group);
  });
  map.decayVariants.forEach((v, i) => {
    if (gameplayGroups.has(v.group)) mask |= 1 << i;
  });
  return mask >>> 0;
}

/**
 * Story 4.7: every variant mask `pickDecayVariants` can return for `map` (each group: every `pick`-
 * subset of its candidates; the product over groups), ascending. Tests and the fuzz walk them all.
 * Not for the sim (allocates).
 *
 * Story 6.2: `gameplayOnly` (default TRUE) skips the look groups (`gameplayVariantMask`), whose
 * objects are all `look`s: they never change obstacles, spawns or fires, so the gameplay tests walk
 * Downtown's C(6,4) × C(3,2) × 3 alleys = 135 masks, not × 3 materials × 4 weather styles more.
 * `{ gameplayOnly: false }` gives every full mask a run can pick.
 */
export function legalDecayMasks(map: DistrictMap, opts: { gameplayOnly?: boolean } = {}): number[] {
  const gameplayOnly = opts.gameplayOnly ?? true;
  const keep = gameplayOnly ? gameplayVariantMask(map) : 0xffffffff;
  const groups = new Map<string, { pick: number; bits: number[] }>();
  map.decayVariants.forEach((v, i) => {
    if (((keep >>> i) & 1) === 0) return;
    const g = groups.get(v.group) ?? { pick: v.pick, bits: [] };
    g.bits.push(i);
    groups.set(v.group, g);
  });
  let masks = [0];
  for (const g of groups.values()) {
    const subsets: number[] = [];
    const n = g.bits.length;
    for (let s = 0; s < 1 << n; s++) {
      let c = 0;
      let m = 0;
      for (let i = 0; i < n; i++) if ((s >> i) & 1) {
        c++;
        m |= 1 << (g.bits[i] as number);
      }
      if (c === g.pick) subsets.push(m);
    }
    const next: number[] = [];
    for (const a of masks) for (const b of subsets) next.push((a | b) >>> 0);
    masks = next;
  }
  return masks.sort((a, b) => a - b);
}

/**
 * Story 4.8: the body circle overlaps a burning zone (strict: centre closer than zone radius + body
 * radius; "your body touches the ring = you burn", D16). Lives here (no imports) so player placement
 * (`player/freeSpot.ts`) can use the same rule as the damage without an import cycle.
 */
export function circleInFire(fires: readonly FireRecord[], x: number, y: number, r: number): boolean {
  for (let i = 0; i < fires.length; i++) {
    const f = fires[i] as FireRecord;
    const dx = x - f.x;
    const dy = y - f.y;
    const rr = r + f.radiusM;
    if (dx * dx + dy * dy < rr * rr) return true;
  }
  return false;
}
