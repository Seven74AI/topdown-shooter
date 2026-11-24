/**
 * Story 6.3 dev switch `DEV_FORCE_BLACKOUT=5` (server, dev only; read per run like
 * `DEV_DECAY_STAGES`): the run is drawn at least this dark (`forcedPct` in `refreshBlackout`: it never
 * lightens a darker wave, review H1; Results stay lit), so two browser tabs check the darkness online.
 * 20 / 10 / 5 (the look levels) or any 1–99 (100 % light would be no darkness). Production ignores it (`ignored: "production"`, the room logs it); an invalid
 * value is ignored too (`ignored: "invalid"`).
 */
export function pickDevForceBlackout(env: { readonly NODE_ENV?: string | undefined; readonly DEV_FORCE_BLACKOUT?: string | undefined }): {
  readonly pct: number | null;
  readonly ignored: null | "production" | "invalid";
} {
  const raw = env.DEV_FORCE_BLACKOUT;
  if (raw === undefined || raw.trim() === "") return { pct: null, ignored: null };
  if (env.NODE_ENV === "production") return { pct: null, ignored: "production" };
  const pct = parseDevForceBlackout(raw);
  return pct === null ? { pct: null, ignored: "invalid" } : { pct, ignored: null };
}

/** An integer 1–99 from text ("5"), or null (review: 100 % light is no blackout). */
export function parseDevForceBlackout(raw: string | undefined): number | null {
  if (raw === undefined || !/^\d{1,3}$/.test(raw.trim())) return null;
  const n = Number(raw.trim());
  return n >= 1 && n <= 99 ? n : null;
}
