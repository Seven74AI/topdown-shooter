/**
 * Story 8.6 (AC 11, D13): this device's resumable saved runs, from `POST /api/saved-runs` (the cookie, else the
 * `localStorage` device token, names the account; the server never trusts an account id from here). `null` = the
 * save server couldn't answer ("Couldn't load saved games" + Retry); `[]` = none (or no account).
 */
import { districtName, type SavedRunSummary } from "@topdown/shared";
import { serverUrl } from "./serverUrl";
import { guestTokens, type GuestTokenStore } from "./guestToken";

export const SAVED_RUNS_TIMEOUT_MS = 3000;

export interface SavedRunsDeps {
  fetch: typeof fetch;
  url: () => string;
  tokens: GuestTokenStore;
  timeoutMs: number;
}

const defaults = (): SavedRunsDeps => ({ fetch: (...a) => globalThis.fetch(...a), url: () => `${serverUrl()}/saved-runs`, tokens: guestTokens, timeoutMs: SAVED_RUNS_TIMEOUT_MS });

const str = (v: unknown, max: number): string => (typeof v === "string" ? v.slice(0, max) : "");
/** A row as sent, shape-checked (anything malformed is dropped). */
function row(v: unknown): SavedRunSummary | null {
  if (typeof v !== "object" || v === null) return null;
  const r = v as Record<string, unknown>;
  if (typeof r.id !== "string" || typeof r.wave !== "number" || !Array.isArray(r.names)) return null;
  const names = r.names.filter((n): n is { name: string; slot: number } => typeof n === "object" && n !== null && typeof (n as { name?: unknown }).name === "string").map((n) => ({ name: str(n.name, 24), slot: Number(n.slot) || 0 }));
  return { id: r.id.slice(0, 36), district: str(r.district, 32), wave: Math.max(0, Math.floor(r.wave)), names, savedAt: str(r.savedAt, 40), expiresAt: str(r.expiresAt, 40) };
}

export async function loadSavedRuns(over: Partial<SavedRunsDeps> = {}): Promise<SavedRunSummary[] | null> {
  const deps = { ...defaults(), ...over };
  const abort = new AbortController();
  const timer = setTimeout(() => abort.abort(), deps.timeoutMs);
  try {
    const token = deps.tokens.get();
    const res = await deps.fetch(deps.url(), { method: "POST", credentials: "same-origin", headers: { "content-type": "application/json" }, body: JSON.stringify(token ? { deviceToken: token } : {}), signal: abort.signal });
    if (!res.ok) return null;
    const body: unknown = await res.json();
    if (!Array.isArray(body)) return null;
    return body.map(row).filter((r): r is SavedRunSummary => r !== null).slice(0, 3);
  } catch {
    return null;
  } finally {
    clearTimeout(timer);
  }
}

/** "saved 2 days ago" (minutes, hours, days; "saved just now" under a minute). */
export function savedAgo(savedAtIso: string, nowMs = Date.now()): string {
  const t = Date.parse(savedAtIso);
  if (!Number.isFinite(t)) return "saved";
  const min = Math.max(0, Math.floor((nowMs - t) / 60_000));
  if (min < 1) return "saved just now";
  if (min < 60) return `saved ${min} min ago`;
  const h = Math.floor(min / 60);
  if (h < 24) return `saved ${h} ${h === 1 ? "hour" : "hours"} ago`;
  const d = Math.floor(h / 24);
  return `saved ${d} ${d === 1 ? "day" : "days"} ago`;
}

/** "Downtown · Wave 6 · Ana, Bo, Theo" (names in slot order). */
export function savedRunTitle(r: SavedRunSummary): string {
  const names = [...r.names].sort((a, b) => a.slot - b.slot).map((n) => n.name);
  return [districtName(r.district) || "Downtown", `Wave ${r.wave}`, names.join(", ")].filter((x) => x !== "").join(" · ");
}
