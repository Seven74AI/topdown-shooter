import { loadBalance, loadDevBalance, type Balance } from "@topdown/shared";
import { urlOptions } from "./urlOptions";

let cached: Balance | null = null;

/**
 * The balance this client plays and joins with. Release builds: the bundled one. Dev builds
 * (Epic 2 retro A5): `?zdmg=<scale>` applies the shared dev switch, matching a server started with
 * `DEV_ZOMBIE_DAMAGE_SCALE=<scale>` (same `balance.version`, so the join check passes). Story 3.3:
 * `?wallet=<n>` likewise matches `DEV_STARTING_WALLET=<n>`.
 */
export function clientBalance(): Balance {
  if (!cached) {
    const { zombieDamageScale, startingWallet } = urlOptions();
    const dev = import.meta.env.DEV && (zombieDamageScale !== null || startingWallet !== null);
    cached = dev ? loadDevBalance({ zombieDamageScale, startingWallet }) : loadBalance();
  }
  return cached;
}

/**
 * Which dev overrides a SOLO run uses (pure, for tests). Designer, 2026-11-23: `?wallet=<n>` also
 * works in release builds, but only for solo runs (testing the shop on the live site); online keeps
 * the bundled balance, so the server's join check never sees it and friends' runs can't be cheated.
 * `?zdmg` stays dev-only.
 */
export function soloOverrides(dev: boolean, o: { zombieDamageScale: number | null; startingWallet: number | null }) {
  return dev ? o : { zombieDamageScale: null, startingWallet: o.startingWallet };
}

let soloCached: Balance | null = null;

/** The balance a solo (offline) run plays: `clientBalance()` plus the release-safe `?wallet`. */
export function soloBalance(): Balance {
  if (!soloCached) {
    const { zombieDamageScale, startingWallet } = urlOptions();
    const o = soloOverrides(import.meta.env.DEV, { zombieDamageScale, startingWallet });
    soloCached = o.zombieDamageScale === null && o.startingWallet === null ? clientBalance() : loadDevBalance(o);
  }
  return soloCached;
}
