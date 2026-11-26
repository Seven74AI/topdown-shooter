import { loadBalance, loadDevBalance, type Balance } from "@topdown/shared";
import { soloDevAllowed, soloUrlOptions } from "./soloDevSwitches";
import { urlOptions } from "./urlOptions";

let cached: Balance | null = null;

/**
 * The balance this client plays and joins with. Release builds: the bundled one. Dev builds
 * (Epic 2 retro A5): `?zdmg=<scale>` applies the shared dev switch, matching a server started with
 * `DEV_ZOMBIE_DAMAGE_SCALE=<scale>` (same `balance.version`, so the join check passes). Story 3.3:
 * `?wallet=<n>` likewise matches `DEV_STARTING_WALLET=<n>`; Story 5.11: `?shopall=1` matches `DEV_SHOP_ALL=1`.
 */
export function clientBalance(): Balance {
  if (!cached) {
    const { zombieDamageScale, startingWallet, shopAll } = urlOptions();
    const dev = import.meta.env.DEV && (zombieDamageScale !== null || startingWallet !== null || shopAll);
    cached = dev ? loadDevBalance({ zombieDamageScale, startingWallet, shopAll }) : loadBalance();
  }
  return cached;
}

/**
 * Which dev overrides a SOLO run uses (pure, for tests). Designer, 2026-11-23: `?wallet=<n>` also
 * works in release builds, but only for solo runs (testing the shop on the live site); online keeps
 * the bundled balance, so the server's join check never sees it and friends' runs can't be cheated.
 * `?zdmg` stays dev-only.
 */
export function soloOverrides(dev: boolean, o: { zombieDamageScale: number | null; startingWallet: number | null; shopAll?: boolean }) {
  return dev ? { ...o, shopAll: o.shopAll ?? false } : { zombieDamageScale: null, startingWallet: o.startingWallet, shopAll: false }; // Story 5.11: ?shopall dev-only
}

/** Story 10.11: one cache per `dev` value (an admin's mark can arrive or go between two solo starts). */
const soloCached = new Map<boolean, Balance>();

/**
 * The balance a solo (offline) run plays: `clientBalance()` plus the release-safe `?wallet`. Story 10.11 (AD-4): `dev`
 * = the dev switches are on for this solo run (a dev build, or an admin's production build: `soloDevAllowed()`).
 */
export function soloBalance(dev: boolean = soloDevAllowed()): Balance {
  let b = soloCached.get(dev);
  if (!b) {
    const { zombieDamageScale, startingWallet, shopAll } = soloUrlOptions(dev);
    const o = soloOverrides(dev, { zombieDamageScale, startingWallet, shopAll });
    b = o.zombieDamageScale === null && o.startingWallet === null && !o.shopAll ? clientBalance() : loadDevBalance(o);
    soloCached.set(dev, b);
  }
  return b;
}
