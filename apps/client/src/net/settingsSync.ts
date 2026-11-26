/**
 * Story 10.1 (AC 6; decision 10.1-B9): this phone's settings ↔ the logged-in account's `progress.settings`.
 *
 * - `changeSettings(patch)`: what the Settings screen calls. Stored and applied at once (`saveSettings`). On a logged-in
 *   phone the change is marked pending FOR THAT USERNAME (review M1) and the stored fields are sent to
 *   `POST /api/account/settings` after `SETTINGS_SYNC_DEBOUNCE_MS` without further changes. Success clears the mark; a
 *   failure keeps it (the next session answer sends again). A guest's change is never marked (the AC: "when I'm logged in").
 * - One send at a time (review L2): a send asked for while one is in flight runs once after it, with what is stored then.
 *   Across phones the last send wins (each send replaces the account's copy).
 * - `acceptSessionSettings(username, server)`: every session / login / reset / logout answer. A guest answer changes
 *   nothing. A mark for ANOTHER username (a guest → A login, an A → B switch) is dropped, never sent to this account.
 *   Then: my own mark → send mine; else the account has settings → adopt them (applied at once); else, if this phone
 *   changed anything → send mine (the upgrade path: the account gets the phone's choices).
 *
 * Never throws; the cookie names the account (`credentials: "same-origin"`).
 */
import { ACCOUNT_SETTINGS_PATH, settingsSaveResponseSchema, type StoredPlayerSettings } from "@topdown/shared";
import { getStoredSettings, replaceStoredSettings, saveSettings, setSettingsPending, settingsPendingFor } from "../settings/settings";
import { accountStore } from "./accountStore";
import { serverUrl } from "./serverUrl";

export const SETTINGS_SYNC_DEBOUNCE_MS = 1000;
export const SETTINGS_SYNC_TIMEOUT_MS = 3000;

export interface SettingsSyncDeps {
  fetch: typeof fetch;
  url: () => string;
  /** The logged-in username, or null (a guest, or not known yet). */
  username: () => string | null;
  setTimeout: (fn: () => void, ms: number) => unknown;
  clearTimeout: (h: unknown) => void;
}

const real = (): SettingsSyncDeps => ({
  fetch: (...a) => globalThis.fetch(...a),
  url: () => `${serverUrl()}${ACCOUNT_SETTINGS_PATH}`,
  username: () => accountStore.get().username,
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
  inFlight = null;
  again = false;
  deps = over === null ? null : { ...real(), ...over };
}

let inFlight: Promise<boolean> | null = null;
let again = false;

/** Sends this phone's stored settings now (one send at a time, review L2). True when the server stored them. */
export function pushSettings(): Promise<boolean> {
  if (inFlight) {
    again = true;
    return inFlight;
  }
  const run = sendOnce().finally(() => {
    inFlight = null;
    if (again) {
      again = false;
      if (settingsPendingFor() !== null) void pushSettings();
    }
  });
  inFlight = run;
  return run;
}

async function sendOnce(): Promise<boolean> {
  const x = d();
  const user = x.username();
  if (user === null) return false;
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
    if (JSON.stringify(getStoredSettings()) === JSON.stringify(sent) && settingsPendingFor() === user) setSettingsPending(null);
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
  const user = x.username();
  if (user === null) return; // review M1: a guest's change is never marked for an account
  setSettingsPending(user);
  if (timer !== null) x.clearTimeout(timer);
  timer = x.setTimeout(() => {
    timer = null;
    void pushSettings();
  }, SETTINGS_SYNC_DEBOUNCE_MS);
}

/** A session / login answer: see the file comment. Returns what it did (tests). */
export function acceptSessionSettings(username: string | null, server: StoredPlayerSettings | null | undefined): "none" | "push" | "adopt" {
  if (username === null) return "none";
  const owner = settingsPendingFor();
  if (owner !== null && owner !== username) setSettingsPending(null); // review M1: another account's (or a guest's) mark
  if (owner === username) {
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
