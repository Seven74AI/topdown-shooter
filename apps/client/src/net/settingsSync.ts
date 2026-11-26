/**
 * Story 10.1 (AC 6; decision 10.1-B9): this phone's settings ↔ the logged-in account's `progress.settings`.
 *
 * - `changeSettings(patch)`: what the Settings screen calls. Stored and applied at once (`saveSettings`, which marks
 *   them pending); on a logged-in phone the changed fields are sent to `POST /api/account/settings` after
 *   `SETTINGS_SYNC_DEBOUNCE_MS` without further changes. Success clears the pending mark; a failure keeps it (the next
 *   session answer sends them again). A guest never calls (the AC: "when I'm logged in").
 * - `acceptSessionSettings(username, server)`: every session / login / reset / logout answer. Logged in and a change is
 *   pending → send mine; else the account has settings → adopt them (applied at once); else, if I changed anything →
 *   send mine (the account gets this phone's choices). A guest answer changes nothing here.
 *
 * Never throws; the cookie names the account (`credentials: "same-origin"`).
 */
import { ACCOUNT_SETTINGS_PATH, settingsSaveResponseSchema, type StoredPlayerSettings } from "@topdown/shared";
import { getStoredSettings, replaceStoredSettings, saveSettings, setSettingsPending, settingsPending } from "../settings/settings";
import { accountStore } from "./accountStore";
import { serverUrl } from "./serverUrl";

export const SETTINGS_SYNC_DEBOUNCE_MS = 1000;
export const SETTINGS_SYNC_TIMEOUT_MS = 3000;

export interface SettingsSyncDeps {
  fetch: typeof fetch;
  url: () => string;
  loggedIn: () => boolean;
  setTimeout: (fn: () => void, ms: number) => unknown;
  clearTimeout: (h: unknown) => void;
}

const real = (): SettingsSyncDeps => ({
  fetch: (...a) => globalThis.fetch(...a),
  url: () => `${serverUrl()}${ACCOUNT_SETTINGS_PATH}`,
  loggedIn: () => accountStore.get().username !== null,
  setTimeout: (fn, ms) => globalThis.setTimeout(fn, ms),
  clearTimeout: (h) => globalThis.clearTimeout(h as ReturnType<typeof setTimeout>),
});

let deps: SettingsSyncDeps | null = null;
let timer: unknown = null;
const d = (): SettingsSyncDeps => (deps ??= real());

/** Tests only: replace the dependencies (null = the real ones) and drop a scheduled send. */
export function setSettingsSyncDeps(over: Partial<SettingsSyncDeps> | null): void {
  if (timer !== null) d().clearTimeout(timer);
  timer = null;
  deps = over === null ? null : { ...real(), ...over };
}

/** Sends this phone's stored settings now. True when the server stored them. */
export async function pushSettings(): Promise<boolean> {
  const x = d();
  if (!x.loggedIn()) return false;
  const sent = getStoredSettings();
  const abort = new AbortController();
  const t = globalThis.setTimeout(() => abort.abort(), SETTINGS_SYNC_TIMEOUT_MS);
  try {
    const res = await x.fetch(x.url(), {
      method: "POST",
      credentials: "same-origin",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ settings: sent }),
      signal: abort.signal,
    });
    if (!res.ok) return false;
    if (!settingsSaveResponseSchema.safeParse(await res.json()).success) return false;
    // A change made while this call was in flight stays pending (its own send follows).
    if (JSON.stringify(getStoredSettings()) === JSON.stringify(sent)) setSettingsPending(false);
    return true;
  } catch {
    return false;
  } finally {
    globalThis.clearTimeout(t);
  }
}

/** The Settings screen's change: stored, applied at once, and (logged in) sent after the debounce. */
export function changeSettings(patch: StoredPlayerSettings): void {
  saveSettings(patch);
  const x = d();
  if (!x.loggedIn()) return;
  if (timer !== null) x.clearTimeout(timer);
  timer = x.setTimeout(() => {
    timer = null;
    void pushSettings();
  }, SETTINGS_SYNC_DEBOUNCE_MS);
}

/** A session / login answer: see the file comment. Returns what it did (tests). */
export function acceptSessionSettings(username: string | null, server: StoredPlayerSettings | null | undefined): "none" | "push" | "adopt" {
  if (username === null) return "none";
  if (settingsPending()) {
    void pushSettings();
    return "push";
  }
  if (server !== null && server !== undefined) {
    replaceStoredSettings(server);
    return "adopt";
  }
  if (Object.keys(getStoredSettings()).length > 0) {
    void pushSettings();
    return "push";
  }
  return "none";
}
