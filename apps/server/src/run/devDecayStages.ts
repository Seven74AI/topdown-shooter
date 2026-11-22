import { MAP_STAGE_COUNT } from "@topdown/shared";

/** Most waves a `DEV_DECAY_STAGES` table may name. */
export const MAX_DEV_DECAY_WAVES = 20;

/**
 * Story 4.5 dev switch `DEV_DECAY_STAGES=2,3` (server, dev only; the room ignores it in production):
 * the decay stage of wave 1, 2, … instead of `decay.json › stageByWave` (waves past the list keep its
 * last entry), so a browser check reaches stage 2 at the run's first build start. Integers 1–5, never
 * decreasing, at most `MAX_DEV_DECAY_WAVES`. null = absent or invalid (the bundled table is used).
 */
export function parseDevDecayStages(raw: string | undefined): readonly number[] | null {
  if (raw === undefined || raw.trim() === "") return null;
  const parts = raw.split(",").map((s) => s.trim());
  if (parts.length > MAX_DEV_DECAY_WAVES || !parts.every((s) => /^\d$/.test(s))) return null;
  const stages = parts.map(Number);
  if (!stages.every((s, i) => s >= 1 && s <= MAP_STAGE_COUNT && (i === 0 || s >= (stages[i - 1] as number)))) return null;
  return Object.freeze(stages);
}
