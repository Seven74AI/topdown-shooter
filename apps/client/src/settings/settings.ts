/**
 * Player settings (architecture › Configuration; Story 10.1 extends the 3-field store of 5.23 / the full-speed spec).
 *
 * - One schema in shared code (`playerSettingsSchema`, decision 10.1-B1). localStorage key `topdown-shooter.settings`
 *   (unchanged); every read and write is wrapped in try/catch, and storage that throws or holds junk gives the defaults.
 * - Only the fields the player CHANGED are stored (B1): `getSettings()` = defaults ⊕ stored, so Story 10.2 can lower the
 *   defaults per device class (`setSettingsDefaults`) without overwriting a choice.
 * - Readers call `getSettings()` when they need a value (cached object, no allocation) or `subscribeSettings` to react
 *   at once (volumes, the performance overlay). Every change applies without a reload (AC 4).
 * - Account sync (`net/settingsSync.ts`, B9): a change marks the settings pending; the sync clears the mark.
 */
import { PLAYER_SETTINGS_DEFAULTS, parseStoredSettings, type PlayerSettings, type StoredPlayerSettings } from "@topdown/shared";

export type { PlayerSettings, StoredPlayerSettings } from "@topdown/shared";

export const SETTINGS_KEY = "topdown-shooter.settings";
/** B9: "1" while a change has not reached the account yet. */
export const SETTINGS_PENDING_KEY = "topdown-shooter.settings.pending";

let defaults: PlayerSettings = { ...PLAYER_SETTINGS_DEFAULTS };
let stored: StoredPlayerSettings | null = null;
let cached: PlayerSettings | null = null;
let pendingMemory: boolean | null = null;
const listeners = new Set<(s: PlayerSettings) => void>();

function storage(): Storage | undefined {
  return globalThis.localStorage;
}

function readStored(): StoredPlayerSettings {
  if (stored) return stored;
  let raw: unknown = {};
  try {
    const text = storage()?.getItem(SETTINGS_KEY);
    if (text) raw = JSON.parse(text);
  } catch {
    raw = {};
  }
  stored = parseStoredSettings(raw);
  return stored;
}

function writeStored(next: StoredPlayerSettings): void {
  stored = next;
  cached = null;
  try {
    storage()?.setItem(SETTINGS_KEY, JSON.stringify(next));
  } catch {
    // storage unavailable: keep the in-memory value for this session
  }
  const s = getSettings();
  for (const l of listeners) l(s);
}

/** Current settings (defaults ⊕ what the player changed). The same object until something changes. */
export function getSettings(): PlayerSettings {
  if (cached) return cached;
  const next = { ...defaults, ...readStored() } as PlayerSettings; // parseStoredSettings never keeps an undefined field
  cached = next;
  return next;
}

/** Only the fields the player changed (what is stored and synced). */
export function getStoredSettings(): StoredPlayerSettings {
  return { ...readStored() };
}

/** The player changed `patch`: stored, applied at once, and marked pending for the account sync. */
export function saveSettings(patch: StoredPlayerSettings): void {
  const clean = parseStoredSettings(patch);
  writeStored({ ...readStored(), ...clean });
  setSettingsPending(true);
}

/** B9: the account's copy replaces this phone's (a session / login answer with no change pending here). */
export function replaceStoredSettings(next: StoredPlayerSettings): void {
  writeStored(parseStoredSettings(next));
}

/** Story 10.2 hook (B1): lower the defaults (per device class); a stored choice still wins. */
export function setSettingsDefaults(patch: Partial<PlayerSettings>): void {
  defaults = { ...defaults, ...(parseStoredSettings(patch) as Partial<PlayerSettings>) };
  cached = null;
  const s = getSettings();
  for (const l of listeners) l(s);
}

/** Called with the new settings after every change; returns the unsubscribe function. */
export function subscribeSettings(listener: (s: PlayerSettings) => void): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

export function settingsPending(): boolean {
  if (pendingMemory !== null) return pendingMemory;
  try {
    return storage()?.getItem(SETTINGS_PENDING_KEY) === "1";
  } catch {
    return false;
  }
}

export function setSettingsPending(on: boolean): void {
  pendingMemory = on;
  try {
    if (on) storage()?.setItem(SETTINGS_PENDING_KEY, "1");
    else storage()?.removeItem(SETTINGS_PENDING_KEY);
  } catch {
    // storage unavailable: the mark lives for this page
  }
}

/** Story 10.1 (AC 10, B15): Delete my progress clears the stored settings and the pending mark. */
export function clearSettings(): void {
  try {
    storage()?.removeItem(SETTINGS_KEY);
  } catch {
    // nothing stored
  }
  setSettingsPending(false);
  writeStored({});
  try {
    storage()?.removeItem(SETTINGS_KEY);
  } catch {
    // nothing stored
  }
}

/** Tests only. */
export function resetSettingsCache(): void {
  cached = null;
  stored = null;
  pendingMemory = null;
  defaults = { ...PLAYER_SETTINGS_DEFAULTS };
  listeners.clear();
}
