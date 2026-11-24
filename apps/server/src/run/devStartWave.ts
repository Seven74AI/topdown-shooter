import { parseStartWave, type Balance } from "@topdown/shared";

/**
 * Story 6.1 (D4) dev switch `DEV_START_WAVE=7` (server, dev only; refused in production, like
 * `DEV_DECAY_STAGES`): the run's first build phase leads into wave 7 (and applies its decay stage).
 * Pure (the environment is passed in, so the production case is tested): production ignores it
 * (`ignored: "production"`), an invalid value too (`ignored: "invalid"`); the room logs either.
 */
export function pickDevStartWave(
  env: { readonly NODE_ENV?: string | undefined; readonly DEV_START_WAVE?: string | undefined },
  balance: Balance,
): { readonly wave: number | null; readonly ignored: null | "production" | "invalid" } {
  const raw = env.DEV_START_WAVE;
  if (raw === undefined || raw.trim() === "") return { wave: null, ignored: null };
  if (env.NODE_ENV === "production") return { wave: null, ignored: "production" };
  const wave = parseStartWave(raw, balance);
  return wave === null ? { wave: null, ignored: "invalid" } : { wave, ignored: null };
}
