import { loadBalance, loadDevBalance, type Balance } from "@topdown/shared";
import { urlOptions } from "./urlOptions";

let cached: Balance | null = null;

/**
 * The balance this client plays and joins with. Release builds: the bundled one. Dev builds
 * (Epic 2 retro A5): `?zdmg=<scale>` applies the shared dev switch, matching a server started with
 * `DEV_ZOMBIE_DAMAGE_SCALE=<scale>` (same `balance.version`, so the join check passes).
 */
export function clientBalance(): Balance {
  if (!cached) {
    const scale = urlOptions().zombieDamageScale;
    cached = import.meta.env.DEV && scale !== null ? loadDevBalance({ zombieDamageScale: scale }) : loadBalance();
  }
  return cached;
}
