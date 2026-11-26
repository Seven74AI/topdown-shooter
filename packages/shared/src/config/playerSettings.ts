/**
 * Story 10.1 (AC 3, 5, 6; decisions 10.1-B1, B2): the player settings, ONE schema for the client store, the
 * `POST /account/settings` body and the `progress.settings` jsonb column. This story owns the shape (retro E7-A5).
 *
 * Every field is optional: a stored value holds only what the player CHANGED (B1); `PLAYER_SETTINGS_DEFAULTS` fills the
 * rest at read time, so Story 10.2 can lower the defaults per device class without overwriting a choice. Fields whose
 * feature does not exist yet are defined and stored but not shown (B2): `gore` (Story 9.5), `filmGrain` (9.6),
 * `musicVolume` (9.8). A later story adds its row to the client's `SETTINGS_ROWS`.
 *
 * Not strict: an unknown key (a newer client) is dropped, never a refused save.
 */
import { z } from "zod";

const volume = z.number().int().min(0).max(100);

export const playerSettingsSchema = z.object({
  /** Story 1.x: camera shake on hits and blasts. */
  screenShake: z.boolean().optional(),
  /** Story 5.23 (D9): placement haptics (Android; every haptic has a visual twin). */
  haptics: z.boolean().optional(),
  /** Touch: any move-stick drag past the dead zone moves at full speed (FR2). */
  alwaysFullSpeed: z.boolean().optional(),
  /** FR4 touch aim assist (B6: off = the input's "no assist" bit). */
  aimAssist: z.boolean().optional(),
  /** Story 1.11's performance overlay at start (B7). */
  showPerformance: z.boolean().optional(),
  /** B3: rain, splashes and ash flakes × 1 / 0.5 / 0. */
  rain: z.enum(["full", "light", "off"]).optional(),
  /** B4: the drifting fog texture (never the fog vision limit: AC 2). */
  fog: z.enum(["full", "plain"]).optional(),
  /** B5: light glow × 1 / 0.5 / 0. */
  glow: z.enum(["full", "low", "off"]).optional(),
  /** Story 9.6 (not built: stored, hidden). */
  filmGrain: z.enum(["full", "low", "off"]).optional(),
  /** Story 9.5 (not built: stored, hidden): "bloodOnly" = no dismemberment pieces. */
  gore: z.enum(["full", "bloodOnly"]).optional(),
  /** B8: the effects (SFX) volume, 0–100. */
  sfxVolume: volume.optional(),
  /** B8: the ambience volume, 0–100. */
  ambienceVolume: volume.optional(),
  /** Story 9.8 (no music bus yet: stored, hidden). */
  musicVolume: volume.optional(),
});

/** What is stored / synced: only the changed fields. */
export type StoredPlayerSettings = z.infer<typeof playerSettingsSchema>;
/** What the game reads: every field. */
export type PlayerSettings = { [K in keyof StoredPlayerSettings]-?: Exclude<StoredPlayerSettings[K], undefined> };
export type PlayerSettingKey = keyof PlayerSettings;

export const PLAYER_SETTINGS_DEFAULTS: Readonly<PlayerSettings> = Object.freeze({
  screenShake: true,
  haptics: true,
  alwaysFullSpeed: false,
  aimAssist: true,
  showPerformance: false,
  rain: "full",
  fog: "full",
  glow: "full",
  filmGrain: "full",
  gore: "full",
  sfxVolume: 100,
  ambienceVolume: 100,
  musicVolume: 100,
});

/** B3 / B5: the multipliers the renderer applies. */
export const RAIN_LEVEL_K: Readonly<Record<"full" | "light" | "off", number>> = Object.freeze({ full: 1, light: 0.5, off: 0 });
export const GLOW_LEVEL_K: Readonly<Record<"full" | "low" | "off", number>> = Object.freeze({ full: 1, low: 0.5, off: 0 });

/** B10: the largest `/account/settings` body the route reads (bytes); a larger one is refused with 413. */
export const SETTINGS_MAX_BODY_BYTES = 1024;

/**
 * A stored value read back (localStorage or the jsonb column): only the fields that pass the schema, one by one, so a
 * single bad field (an older build's, a hand edit) never throws away the others. Anything that isn't an object → {}.
 */
export function parseStoredSettings(raw: unknown): StoredPlayerSettings {
  if (raw === null || typeof raw !== "object" || Array.isArray(raw)) return {};
  const out: Record<string, unknown> = {};
  const shape = playerSettingsSchema.shape as Record<string, z.ZodType>;
  for (const [k, v] of Object.entries(raw as Record<string, unknown>)) {
    const field = shape[k];
    if (field === undefined || v === undefined) continue;
    const r = field.safeParse(v);
    if (r.success && r.data !== undefined) out[k] = r.data;
  }
  return out as StoredPlayerSettings;
}
