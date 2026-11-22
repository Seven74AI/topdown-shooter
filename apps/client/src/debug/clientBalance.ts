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
