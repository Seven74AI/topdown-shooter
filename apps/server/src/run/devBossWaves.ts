/** Most waves a `DEV_BOSS_WAVES` list may name. */
export const MAX_DEV_BOSS_WAVES = 10;

/**
 * Story 6.5 dev switch `DEV_BOSS_WAVES=3` (server, dev only; the room ignores it in production): the
 * Behemoth's waves instead of `boss.json › bossWaves` (world.debug, never the JSON), so a browser check
 * meets it in the 6-wave run. Comma-separated wave numbers 1–255. Pure (the environment is passed in).
 */
export function pickDevBossWaves(env: { readonly NODE_ENV?: string | undefined; readonly DEV_BOSS_WAVES?: string | undefined }): {
  readonly waves: readonly number[] | null;
  readonly ignored: null | "production" | "invalid";
} {
  const raw = env.DEV_BOSS_WAVES;
  if (raw === undefined || raw.trim() === "") return { waves: null, ignored: null };
  if (env.NODE_ENV === "production") return { waves: null, ignored: "production" };
  const waves = parseDevBossWaves(raw);
  return waves === null ? { waves: null, ignored: "invalid" } : { waves, ignored: null };
}

/** … or `none` (re-review N1): no Behemoth at all, endless included (`[]`). */
export function parseDevBossWaves(raw: string | null | undefined): readonly number[] | null {
  if (raw === null || raw === undefined || raw.trim() === "") return null;
  if (raw.trim().toLowerCase() === "none") return Object.freeze([]);
  const parts = raw.split(",").map((s) => s.trim());
  if (parts.length > MAX_DEV_BOSS_WAVES || !parts.every((s) => /^\d{1,3}$/.test(s))) return null;
  const waves = parts.map(Number);
  if (!waves.every((w) => w >= 1 && w <= 255)) return null;
  return Object.freeze(waves);
}
