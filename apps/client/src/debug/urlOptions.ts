/**
 * Every URL switch the client reads, parsed in one place (Story 1.11; Story 1.12 adds `?loadout`
 * and `?tune` here). Pure: takes the query string, so it is unit-tested without a browser.
 */
export interface UrlOptions {
  /** `?debug=1` (or `?debug`): the performance overlay is on from the start. */
  debug: boolean;
  /** `?stress=150`: number of Walkers for the fixed stress scenario, or null when absent/invalid. */
  stress: number | null;
}

/** Walkers when `?stress` has no number. */
export const DEFAULT_STRESS_WALKERS = 150;
/** Most Walkers the stress scenario accepts (the zombie pool holds 256; 200 matches the cheat cap). */
export const MAX_STRESS_WALKERS = 200;

const TRUE_VALUES = new Set(["", "1", "true", "on", "yes"]);

export function parseUrlOptions(search: string): UrlOptions {
  const q = new URLSearchParams(search);
  const debugRaw = q.get("debug");
  const debug = debugRaw !== null && TRUE_VALUES.has(debugRaw.trim().toLowerCase());
  return { debug, stress: parseStress(q.get("stress")) };
}

function parseStress(raw: string | null): number | null {
  if (raw === null) return null;
  const t = raw.trim();
  if (t === "") return DEFAULT_STRESS_WALKERS;
  if (!/^\d+$/.test(t)) return null;
  const n = Number(t);
  if (n < 1) return null;
  return Math.min(MAX_STRESS_WALKERS, n);
}

let cached: UrlOptions | null = null;

/** Options of the page's own URL (read once; the client never changes its query string). */
export function urlOptions(): UrlOptions {
  if (!cached) cached = parseUrlOptions(typeof location === "undefined" ? "" : location.search);
  return cached;
}
