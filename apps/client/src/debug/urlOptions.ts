import { parseDevScale, parseDevShopAll, parseDevWallet, parseRunSeed } from "@topdown/shared";
import { isTestScenario, type TestScenario } from "@topdown/shared";
import { ANIMATED_LAYERS, type AnimatedLayerId } from "@topdown/shared";
import { DEFAULT_STALL_MS, MAX_THROTTLE_JITTER_MS, MAX_THROTTLE_LAG_MS, MAX_THROTTLE_LOSS_PCT, MAX_THROTTLE_STALL_MS } from "../net/devThrottle";

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
   * `?stressfire=1` (Story 5.3, with `?stress`): the stress scenario's survivor holds fire at the
   * nearest zombie, with the `?loadout` weapon (e.g. `?stress=150&stressfire=1&loadout=shotgun`), so
   * the benchmark measures pellets, flashes and hits too.
   */
  stressFire: boolean;
  /**
   * `?loadout=pistol,machete` (Story 1.12, release-safe): the starting two weapons, or null. Ids are
   * only shape-checked here; the game keeps those that exist in balance. Story 5.1: each may carry
   * an upgrade level, `?loadout=smg:3,machete:2` (solo only; `validLoadout` maps a bad level to 1).
   */
  loadout: readonly [string, string | null] | null;
  /** `?tune=1` (Story 1.12, release-safe): the live tuning panel for the controls playtest. */
  tune: boolean;
  /** `?solo` (Story 2.1): skip the start screen and play offline at once. */
  solo: boolean;
  /**
   * `?lag=<rttMs>&jitter=<ms>` (Story 2.6, release-safe): the dev network throttle on this device,
   * or null when off. `rttMs` is the simulated round trip, `jitterMs` the spread of each one-way delay.
   * Story 8.8: `&loss=<pct>` (0–20, one decimal) per message and direction stalls that message and
   * everything behind it by `&stall=<ms>` (0–1000, default 200); `&loss` alone turns it on too.
   */
  throttle: { readonly rttMs: number; readonly jitterMs: number; readonly lossPct: number; readonly stallMs: number } | null;
  /**
   * `?zdmg=0.1` (Epic 2 retro A5, dev builds only, see `debug/clientBalance.ts`): zombie damage × this
   * for browser checks; the server must run with the same `DEV_ZOMBIE_DAMAGE_SCALE`. null when absent.
   */
  zombieDamageScale: number | null;
  /**
   * `?wallet=2000` (Story 3.3): every starting wallet for shop checks. Dev builds: solo and online
   * (the server must run with the same `DEV_STARTING_WALLET`). Release builds: SOLO runs only
   * (designer 2026-11-23, `soloBalance`); online ignores it. null when absent.
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
   * `?shopcards=flamethrower,revive_kit` (Story 5.13, dev builds only, solo; online the server's
   * `DEV_SHOP_CARDS`): every build-start offer starts with these card items. The raw list (null
   * when absent or in a release build); `parseDevShopCards` keeps it only if every id is a card item.
   */
  shopCards: string | null;
  /**
   * Story 6.5 (dev builds only, solo; online the server's `DEV_BOSS_WAVES`): `?bosswave=3` brings the
   * Behemoth in wave 3 (world.debug, never the JSON); `?bosshp=0.1` scales its HP (tests only). null
   * when absent, invalid or in a release build.
   */
  bossWaves: string | null;
  bossHpScale: number | null;
  /**
   * Story 6.8 (dev builds only, solo; online the server's `DEV_EVENTS`): `?events=car_alarm@1,stampede@2`
   * replaces the run's event schedule (world.debug, never the JSON). Raw; parsed by `parseDevEvents`.
   */
  events: string | null;
  /**
   * `?seed=<uint32>` (Story 4.4, dev builds only, like `?zdmg`): the host's Create asks the server
   * for this run seed; honoured only by a dev server with `DEV_ALLOW_RUN_SEED=1`. null when absent.
   */
  runSeed: number | null;
  /**
   * `?stressbuild=traps` (Story 5.9, release-safe, only with `?stress`): 24 spike traps and mines laid
   * round the survivor for the phone benchmark with the new floor buildings active; false otherwise.
   */
  stressBuild: boolean;
  /** `?stressbuild=lights` (Story 5.10, only with `?stress`): 8 floodlights and 4 med stations round the survivor. */
  stressLights: boolean;
  /** `?stressbuild=bear` (Story 5.14, only with `?stress`): 24 bear traps round the survivor (they catch the crowd). */
  stressBear: boolean;
  /**
   * `?stressbuild=molotov` (Story 5.12, release-safe, only with `?stress`): molotov fire zones kept
   * burning round the survivor (relit as they end) for the phone benchmark — 8 (the cap, the worst
   * case) or `molotov:N` (1–8; review: the common 1–2-zone case); 0 = off.
   */
  stressMolotovs: number;
  /**
   * `?fx=low` (Story 4.12, release-safe): the low-quality fire — half the particles of every burning
   * car and survivor (caps and spawn rates halved). false otherwise.
   */
  lowFx: boolean;
  /**
   * `?shopall=1` (Stories 5.10 + 5.11, ONE switch, dev builds only: a release build ignores it):
   * every `inShop: false` item (none in the bundled balance since Story 6.3) is listed,
   * placed and sold, through the dev balance (`loadDevBalance({ shopAll })`, same as the server's
   * `DEV_SHOP_ALL=1`; it changes `balance.version`, so both sides must have it on). false otherwise.
   */
  shopAll: boolean;
  /**
   * `?blackout=20|10|5` (Story 6.3, release-safe like `?fx=low`; solo only): the run is drawn at least
   * that dark (the dev `forcedPct`; it never lightens a darker wave, Results lit — review H1), so `?stress=150&blackout=5` measures the darkness's
   * cost. null otherwise (any other value too).
   */
  blackoutPct: number | null;
  /**
   * `?startwave=7` (Story 6.1 D4, dev builds only, solo; online the server's `DEV_START_WAVE`): the
   * solo run's first build leads into wave 7 (its decay stage applied). The raw text (null when absent
   * or in a release build); `parseStartWave` keeps 1 … `runWaves`. Combine with `?wallet=`.
   */
  startWave: string | null;
  /**
   * `?devlayer=propeller` (Story 7.8, dev builds only): every survivor wears that animated part layer (the spinning
   * propeller), to check the layer sprite in a run before Story 7.9 draws per-player looks. null when absent,
   * unknown or in a release build.
   */
  devLayer: AnimatedLayerId | null;
  /** Story 7.9 (AC 14): `?devlooks=N` (dev builds): N − 1 extra standing survivors with random starter looks next to mine (views only); 0 = off. */
  devLooks: number;
}

/** Largest `?lag` / `?jitter` accepted (ms); defined next to the throttle (Story 8.8 review N2: the bots share them). */
export { MAX_THROTTLE_JITTER_MS, MAX_THROTTLE_LAG_MS };

/** Walkers when `?stress` has no number. */
export const DEFAULT_STRESS_WALKERS = 150;
/** Most Walkers the stress scenario accepts (the zombie pool holds 256; 200 matches the cheat cap). */
export const MAX_STRESS_WALKERS = 200;

const TRUE_VALUES = new Set(["", "1", "true", "on", "yes"]);

/** Story 6.3: the forced blackout levels the URL and the cheat panel offer (the three looks). */
export const BLACKOUT_LEVELS = [20, 10, 5] as const;

/** `?blackout=` → 20 / 10 / 5, anything else null. */
export function parseBlackoutPct(raw: string | null): number | null {
  const n = Number(raw?.trim() ?? "");
  return (BLACKOUT_LEVELS as readonly number[]).includes(n) ? n : null;
}

/** Story 5.12: `molotov` → 8, `molotov:N` → N (1–8), anything else → 0. */
export function parseStressMolotovs(raw: string | null): number {
  const m = /^molotov(?::([1-8]))?$/.exec(raw?.trim().toLowerCase() ?? "");
  return m ? Number(m[1] ?? 8) : 0;
}

export function parseUrlOptions(search: string, dev: boolean = import.meta.env.DEV): UrlOptions {
  const q = new URLSearchParams(search);
  const debugRaw = q.get("debug");
  const debug = debugRaw !== null && TRUE_VALUES.has(debugRaw.trim().toLowerCase());
  const tuneRaw = q.get("tune");
  const soloRaw = q.get("solo");
  const stressFireRaw = q.get("stressfire");
  return {
    debug,
    stress: parseStress(q.get("stress")),
    stressFire: stressFireRaw !== null && TRUE_VALUES.has(stressFireRaw.trim().toLowerCase()),
    loadout: parseLoadout(q.get("loadout")),
    tune: tuneRaw !== null && TRUE_VALUES.has(tuneRaw.trim().toLowerCase()),
    solo: soloRaw !== null && TRUE_VALUES.has(soloRaw.trim().toLowerCase()),
    throttle: parseThrottle(q.get("lag"), q.get("jitter"), q.get("loss"), q.get("stall")),
    zombieDamageScale: parseDevScale(q.get("zdmg")),
    startingWallet: parseDevWallet(q.get("wallet")),
    scenario: parseScenario(q.get("scenario")),
    waveMix: q.get("wavemix"),
    shopCards: dev ? q.get("shopcards") : null, // Story 5.13: dev builds only
    bossWaves: dev ? q.get("bosswave") : null, // Story 6.5: dev builds only
    bossHpScale: dev ? parseBossHpScale(q.get("bosshp")) : null,
    events: dev ? q.get("events") : null, // Story 6.8: dev builds only
    runSeed: parseRunSeed(q.get("seed")),
    stressBuild: q.get("stressbuild")?.trim().toLowerCase() === "traps",
    stressMolotovs: parseStressMolotovs(q.get("stressbuild")),
    stressLights: q.get("stressbuild")?.trim().toLowerCase() === "lights",
    stressBear: q.get("stressbuild")?.trim().toLowerCase() === "bear",
    lowFx: q.get("fx")?.trim().toLowerCase() === "low",
    shopAll: dev && parseDevShopAll(q.get("shopall")?.trim().toLowerCase()), // dev builds only (review L3); one switch for hidden buildings and gear
    blackoutPct: parseBlackoutPct(q.get("blackout")), // Story 6.3
    startWave: dev ? q.get("startwave") : null, // Story 6.1: dev builds only
    devLayer: dev ? parseDevLayer(q.get("devlayer")) : null, // Story 7.8: dev builds only
    devLooks: dev ? parseDevLooks(q.get("devlooks")) : 0, // Story 7.9: dev builds only
  };
}

/** Story 7.8: an animated layer id (`propeller`), else null. */
export function parseDevLayer(raw: string | null): AnimatedLayerId | null {
  const v = raw?.trim().toLowerCase() ?? "";
  return (ANIMATED_LAYERS as readonly string[]).includes(v) ? (v as AnimatedLayerId) : null;
}

/** Story 7.9: `?devlooks=N`, 1–4 survivors in all (a lobby's worth); anything else is off (0). */
export const MAX_DEV_LOOKS = 4;
export function parseDevLooks(raw: string | null): number {
  if (raw === null || !/^\d{1,2}$/.test(raw.trim())) return 0;
  const n = Number(raw.trim());
  return n >= 1 && n <= MAX_DEV_LOOKS ? n : 0;
}

function parseScenario(raw: string | null): TestScenario | null {
  const v = raw?.trim().toLowerCase();
  return isTestScenario(v) ? v : null;
}

function parseMs(raw: string | null, max: number): number | null {
  if (raw === null || !/^\d+$/.test(raw.trim())) return null;
  return Math.min(max, Number(raw.trim()));
}

/** Story 8.8: `&loss=<pct>`, 0–20 with at most one decimal (`0.5`); anything else is off (0). */
export function parseLossPct(raw: string | null): number {
  const v = raw?.trim() ?? "";
  if (!/^\d{1,3}(\.\d)?$/.test(v)) return 0;
  return Math.min(MAX_THROTTLE_LOSS_PCT, Number(v));
}

/**
 * `?lag=&jitter=` (Story 2.6) and Story 8.8's `&loss=<pct>&stall=<ms>` (the lossy line; release
 * builds too, decision 8.8 D4: it only hurts the device that turns it on). `&loss` without `&lag`
 * works (lag 0 + stalls); `&stall` alone turns nothing on.
 */
export function parseThrottle(lagRaw: string | null, jitterRaw: string | null, lossRaw: string | null = null, stallRaw: string | null = null): UrlOptions["throttle"] {
  const rttMs = parseMs(lagRaw, MAX_THROTTLE_LAG_MS) ?? 0;
  const jitterMs = parseMs(jitterRaw, MAX_THROTTLE_JITTER_MS) ?? 0;
  const lossPct = parseLossPct(lossRaw);
  const stallMs = parseMs(stallRaw, MAX_THROTTLE_STALL_MS) ?? DEFAULT_STALL_MS;
  return rttMs > 0 || jitterMs > 0 || lossPct > 0 ? { rttMs, jitterMs, lossPct, stallMs } : null;
}

/** Options that start a solo run directly, skipping the start screen (Epic 1 playtest links keep working). */
export function skipsStartScreen(o: UrlOptions): boolean {
  return o.solo || o.stress !== null || o.loadout !== null || o.tune;
}

/** A weapon id, optionally with Story 5.1's `:level` (`smg:3`; the level is checked by `validLoadout`). */
const WEAPON_ID = /^[a-z][a-z0-9_]*(:[a-z0-9]{1,3})?$/;

function parseLoadout(raw: string | null): readonly [string, string | null] | null {
  if (raw === null) return null;
  const ids = raw
    .split(",")
    .map((s) => s.trim().toLowerCase())
    .filter((s) => WEAPON_ID.test(s))
    .slice(0, 2);
  if (ids.length === 0) return null;
  const id = (s: string): string => s.split(":")[0] as string;
  return [ids[0] as string, ids[1] && id(ids[1]) !== id(ids[0] as string) ? ids[1] : null];
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

/** Story 6.5: `?bosshp=0.1` → 0.1 (0 < scale ≤ 10), else null. */
export function parseBossHpScale(raw: string | null | undefined): number | null {
  if (raw === null || raw === undefined || !/^\d+(\.\d+)?$/.test(raw.trim())) return null;
  const n = Number(raw.trim());
  return n > 0 && n <= 10 ? n : null;
}

/** Story 6.5: `?bosswave=3` / `1,4` → the wave list (1–255 each); `none` → [] (no Behemoth, endless included; re-review N1); else null. */
export function parseBossWaves(raw: string | null | undefined): readonly number[] | null {
  if (raw === null || raw === undefined || raw.trim() === "") return null;
  if (raw.trim().toLowerCase() === "none") return [];
  const parts = raw.split(",").map((t) => t.trim());
  if (parts.length > 10 || !parts.every((t) => /^\d{1,3}$/.test(t))) return null;
  const waves = parts.map(Number);
  return waves.every((w) => w >= 1 && w <= 255) ? waves : null;
}
