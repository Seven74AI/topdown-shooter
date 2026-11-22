import { MAP_STAGE_COUNT } from "@topdown/shared";

/** Most waves a `DEV_DECAY_STAGES` table may name. */
export const MAX_DEV_DECAY_WAVES = 20;

/**
 * Story 4.5 dev switch `DEV_DECAY_STAGES=2,3` (server, dev only; the room ignores it in production):
 * the decay stage of wave 1, 2, … instead of `decay.json › stageByWave` (waves past the list keep its
 * last entry), so a browser check reaches stage 2 at the run's first build start. Integers 1–5, never
 * decreasing, at most `MAX_DEV_DECAY_WAVES`. null = absent or invalid (the bundled table is used).
 */
/**
 * Review L4: the switch as the room reads it, pure (the environment is passed in, so the production
 * case is tested): production ignores it (`ignored: "production"`, the room logs it), an invalid value
 * is ignored too (`ignored: "invalid"`).
 */
export function pickDevDecayStages(env: { readonly NODE_ENV?: string | undefined; readonly DEV_DECAY_STAGES?: string | undefined }): {
  readonly stages: readonly number[] | null;
  readonly ignored: null | "production" | "invalid";
} {
  const raw = env.DEV_DECAY_STAGES;
  if (raw === undefined || raw.trim() === "") return { stages: null, ignored: null };
  if (env.NODE_ENV === "production") return { stages: null, ignored: "production" };
  const stages = parseDevDecayStages(raw);
  return stages === null ? { stages: null, ignored: "invalid" } : { stages, ignored: null };
}

export function parseDevDecayStages(raw: string | undefined): readonly number[] | null {
  if (raw === undefined || raw.trim() === "") return null;
  const parts = raw.split(",").map((s) => s.trim());
  if (parts.length > MAX_DEV_DECAY_WAVES || !parts.every((s) => /^\d$/.test(s))) return null;
  const stages = parts.map(Number);
  if (!stages.every((s, i) => s >= 1 && s <= MAP_STAGE_COUNT && (i === 0 || s >= (stages[i - 1] as number)))) return null;
  return Object.freeze(stages);
}
