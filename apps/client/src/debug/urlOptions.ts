import { parseDevScale, parseDevWallet, parseRunSeed } from "@topdown/shared";
import { isTestScenario, type TestScenario } from "@topdown/shared";

/**
 * Every URL switch the client reads, parsed in one place (Story 1.11; Story 1.12 adds `?loadout`
 * and `?tune` here). Pure: takes the query string, so it is unit-tested without a browser.
 */
export interface UrlOptions {
  /** `?debug=1` (or `?debug`): the performance overlay is on from the start. */
  debug: boolean;
  /** `?stress=150`: number of Walkers for the fixed stress scenario, or null when absent/invalid. */
  stress: number | null;
  /**
   * `?loadout=pistol,machete` (Story 1.12, release-safe): the starting two weapons, or null. Ids are
   * only shape-checked here; the game keeps those that exist in balance.
   */
  loadout: readonly [string, string | null] | null;
  /** `?tune=1` (Story 1.12, release-safe): the live tuning panel for the controls playtest. */
  tune: boolean;
  /** `?solo` (Story 2.1): skip the start screen and play offline at once. */
  solo: boolean;
  /**
   * `?lag=<rttMs>&jitter=<ms>` (Story 2.6, release-safe): the dev network throttle on this device,
   * or null when off. `rttMs` is the simulated round trip, `jitterMs` the spread of each one-way delay.
   */
  throttle: { readonly rttMs: number; readonly jitterMs: number } | null;
  /**
   * `?zdmg=0.1` (Epic 2 retro A5, dev builds only, see `debug/clientBalance.ts`): zombie damage × this
   * for browser checks; the server must run with the same `DEV_ZOMBIE_DAMAGE_SCALE`. null when absent.
   */
  zombieDamageScale: number | null;
  /**
   * `?wallet=2000` (Story 3.3, dev builds only, like `?zdmg`): every starting wallet for shop checks;
   * the server must run with the same `DEV_STARTING_WALLET`. null when absent.
   */
  startingWallet: number | null;
  /**
   * `?scenario=net150` (Story 2.10, release-safe): the host's Create game asks the server for that
   * fixed test scenario (honoured only with `ALLOW_TEST_SCENARIOS=1`), or null.
   */
  scenario: TestScenario | null;
  /**
   * `?wavemix=walker,crawler` (Story 3.9, release-safe, solo only; Story 3.10 keeps it as an override
   * of the `waves.json` mix): the raw list; `parseWaveMix` keeps the types that exist in balance.
   */
  waveMix: string | null;
  /**
   * `?seed=<uint32>` (Story 4.4, dev builds only, like `?wallet`): the host's Create asks the server
   * for this run seed; honoured only by a dev server with `DEV_ALLOW_RUN_SEED=1`. null when absent.
   */
  runSeed: number | null;
}

/** Largest `?lag` / `?jitter` accepted (ms). */
export const MAX_THROTTLE_LAG_MS = 2000;
export const MAX_THROTTLE_JITTER_MS = 1000;

/** Walkers when `?stress` has no number. */
export const DEFAULT_STRESS_WALKERS = 150;
/** Most Walkers the stress scenario accepts (the zombie pool holds 256; 200 matches the cheat cap). */
export const MAX_STRESS_WALKERS = 200;

const TRUE_VALUES = new Set(["", "1", "true", "on", "yes"]);

export function parseUrlOptions(search: string): UrlOptions {
  const q = new URLSearchParams(search);
  const debugRaw = q.get("debug");
  const debug = debugRaw !== null && TRUE_VALUES.has(debugRaw.trim().toLowerCase());
  const tuneRaw = q.get("tune");
  const soloRaw = q.get("solo");
  return {
    debug,
    stress: parseStress(q.get("stress")),
    loadout: parseLoadout(q.get("loadout")),
    tune: tuneRaw !== null && TRUE_VALUES.has(tuneRaw.trim().toLowerCase()),
    solo: soloRaw !== null && TRUE_VALUES.has(soloRaw.trim().toLowerCase()),
    throttle: parseThrottle(q.get("lag"), q.get("jitter")),
    zombieDamageScale: parseDevScale(q.get("zdmg")),
    startingWallet: parseDevWallet(q.get("wallet")),
    scenario: parseScenario(q.get("scenario")),
    waveMix: q.get("wavemix"),
    runSeed: parseRunSeed(q.get("seed")),
  };
}

function parseScenario(raw: string | null): TestScenario | null {
  const v = raw?.trim().toLowerCase();
  return isTestScenario(v) ? v : null;
}

function parseMs(raw: string | null, max: number): number | null {
  if (raw === null || !/^\d+$/.test(raw.trim())) return null;
  return Math.min(max, Number(raw.trim()));
}

function parseThrottle(lagRaw: string | null, jitterRaw: string | null): UrlOptions["throttle"] {
  const rttMs = parseMs(lagRaw, MAX_THROTTLE_LAG_MS) ?? 0;
  const jitterMs = parseMs(jitterRaw, MAX_THROTTLE_JITTER_MS) ?? 0;
  return rttMs > 0 || jitterMs > 0 ? { rttMs, jitterMs } : null;
}

/** Options that start a solo run directly, skipping the start screen (Epic 1 playtest links keep working). */
export function skipsStartScreen(o: UrlOptions): boolean {
  return o.solo || o.stress !== null || o.loadout !== null || o.tune;
}

const WEAPON_ID = /^[a-z][a-z0-9_]*$/;

function parseLoadout(raw: string | null): readonly [string, string | null] | null {
  if (raw === null) return null;
  const ids = raw
    .split(",")
    .map((s) => s.trim().toLowerCase())
    .filter((s) => WEAPON_ID.test(s))
    .slice(0, 2);
  if (ids.length === 0) return null;
  return [ids[0] as string, ids[1] && ids[1] !== ids[0] ? ids[1] : null];
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
