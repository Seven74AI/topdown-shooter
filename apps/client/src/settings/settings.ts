/** Player settings stored in localStorage (architecture › Configuration). Story 10.1 adds the screen. */
export interface PlayerSettings {
  screenShake: boolean;
}

const KEY = "topdown-shooter.settings";
const DEFAULTS: PlayerSettings = { screenShake: true };

let cached: PlayerSettings | null = null;

/** Current settings; storage failures (private mode, blocked storage) fall back to defaults. */
export function getSettings(): PlayerSettings {
  if (cached) return cached;
  let stored: Partial<PlayerSettings> = {};
  try {
    const raw = globalThis.localStorage?.getItem(KEY);
    if (raw) stored = JSON.parse(raw) as Partial<PlayerSettings>;
  } catch {
    stored = {};
  }
  cached = { ...DEFAULTS, ...(typeof stored === "object" && stored ? stored : {}) };
  return cached;
}

export function saveSettings(patch: Partial<PlayerSettings>): void {
  cached = { ...getSettings(), ...patch };
  try {
    globalThis.localStorage?.setItem(KEY, JSON.stringify(cached));
  } catch {
    // storage unavailable: keep the in-memory value for this session
  }
}

/** Tests only. */
export function resetSettingsCache(): void {
  cached = null;
}
