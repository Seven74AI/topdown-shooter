import { parseRunSeed } from "@topdown/shared";

/**
 * Story 4.4: the online "set run seed" dev switch. The host's Create may carry `devRunSeed` (client
 * `?seed=<uint32>`, dev builds only); the room's runs use it only when the server runs with
 * `DEV_ALLOW_RUN_SEED=1` and not with `NODE_ENV=production` (like every other `DEV_*` switch).
 * Otherwise the option is ignored (the caller logs why) and each run gets a random seed. Pure: the
 * environment is passed in, so the production case is unit-tested.
 */
export type DevRunSeedPick =
  | { readonly seed: number; readonly ignored: null }
  | { readonly seed: null; readonly ignored: null | "production" | "switch_off" };

export function pickDevRunSeed(requested: unknown, env: { readonly NODE_ENV?: string | undefined; readonly DEV_ALLOW_RUN_SEED?: string | undefined }): DevRunSeedPick {
  const seed = typeof requested === "number" ? parseRunSeed(String(requested)) : null;
  if (seed === null) return { seed: null, ignored: null }; // none asked (onAuth refused anything malformed)
  if (env.NODE_ENV === "production") return { seed: null, ignored: "production" };
  if (env.DEV_ALLOW_RUN_SEED !== "1") return { seed: null, ignored: "switch_off" };
  return { seed, ignored: null };
}
