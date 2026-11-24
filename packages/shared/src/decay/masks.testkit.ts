import type { DistrictMap } from "../map/districtMap";
import { gameplayVariantMask, gameplayDecayMasks } from "./decayState";

/**
 * Story 6.2 (tests only): the gameplay masks worth walking at `stage`. A stage-4+ variant group
 * (6.2's collapsed alley) changes nothing before its stage, so stages below it walk one candidate
 * of it only: Downtown stages 1–3 = the 45 old masks (cars × fires),
 * stages 4–5 = all 135 (× 3 alleys). Looks are never walked (`gameplayDecayMasks`).
 */
export function masksForStage(map: DistrictMap, stage: number): number[] {
  const all = gameplayDecayMasks(map);
  // Bits of groups whose stage is above `stage`, and the lowest bit of each such group.
  let later = 0;
  let keep = 0;
  const firstOf = new Map<string, number>();
  const gameplay = gameplayVariantMask(map);
  map.decayVariants.forEach((v, i) => {
    // Only Epic 6's groups (stage 4+) collapse; stages 1–3 keep walking every Epic 4 combination.
    if (v.stage <= Math.max(stage, 3) || ((gameplay >>> i) & 1) === 0) return;
    later |= 1 << i;
    if (!firstOf.has(v.group)) {
      firstOf.set(v.group, i);
      keep |= 1 << i;
    }
  });
  later >>>= 0;
  keep >>>= 0;
  if (later === 0) return all;
  return all.filter((m) => ((m & later) >>> 0) === keep);
}

/** Story 6.2: the variant bit of candidate `name` (−1 if none). */
export const variantBit = (map: DistrictMap, name: string): number => map.decayVariants.findIndex((v) => v.name === name);
