import { bundledBalanceFiles, loadBalance, withOverrides, type Balance, type BalanceOverride } from "./balance";

/**
 * Dev/test balance switches for browser checks (Epic 2 retro A5): so nobody hand-edits a balance
 * JSON to make a check possible. The server reads them from env (`DEV_ZOMBIE_DAMAGE_SCALE`), dev
 * client builds from the URL (`?zdmg=`); both build the balance through this one function, so the
 * client's `balance.version` matches the server's and the join check keeps working.
 */
export interface DevBalanceOptions {
  /** Every zombie type's damage × this (0 = harmless zombies). null / 1 = the bundled balance. */
  zombieDamageScale: number | null;
  /**
   * Story 3.3: every player's starting wallet (`economy.startingWallet`) for shop checks
   * (`DEV_STARTING_WALLET` / `?wallet=`). null / absent = the bundled value.
   */
  startingWallet?: number | null;
  /**
   * Story 5.11 (the minimal form of Story 5.10's switch): every `inShop: false` item is listed and
   * sold (`DEV_SHOP_ALL=1` / `?shopall=1`), e.g. the tactical flashlight. Changes `balance.version`
   * like every switch, so client and server must both have it on.
   */
  shopAll?: boolean;
}

/** `"1"` / `"true"` → true; anything else (absent included) → false. */
export function parseDevShopAll(raw: string | null | undefined): boolean {
  return raw === "1" || raw === "true";
}

/** Largest dev starting wallet accepted. */
export const MAX_DEV_STARTING_WALLET = 100_000;

/** A wallet from text ("2000"), or null when absent or invalid (then nothing changes). */
export function parseDevWallet(raw: string | null | undefined): number | null {
  if (raw === null || raw === undefined || !/^\d+$/.test(raw.trim())) return null;
  const n = Number(raw.trim());
  return n <= MAX_DEV_STARTING_WALLET ? n : null;
}

/** Largest scale accepted (a check might want stronger zombies, but not absurd ones). */
export const MAX_DEV_ZOMBIE_DAMAGE_SCALE = 10;

/** A scale from text ("0.1"), or null when absent or invalid (then nothing changes). */
export function parseDevScale(raw: string | null | undefined): number | null {
  if (raw === null || raw === undefined || !/^\d+(\.\d+)?$/.test(raw.trim())) return null;
  const n = Number(raw.trim());
  return n >= 0 && n <= MAX_DEV_ZOMBIE_DAMAGE_SCALE ? n : null;
}

/** The overrides the options stand for (empty when nothing changes). */
export function devBalanceOverrides(opts: DevBalanceOptions): BalanceOverride[] {
  const out: BalanceOverride[] = [];
  const scale = opts.zombieDamageScale;
  if (scale !== null && scale !== 1) {
    const raw = bundledBalanceFiles();
    const types = (raw.zombies as { types: Record<string, { damage: number }> }).types;
    for (const id of Object.keys(types)) out.push(["zombies", `types.${id}.damage`, (types[id] as { damage: number }).damage * scale]);
  }
  const wallet = opts.startingWallet ?? null;
  if (wallet !== null) out.push(["economy", "startingWallet", wallet]);
  return out;
}

/** The bundled balance with the dev switches applied (validated like any balance). */
export function loadDevBalance(opts: DevBalanceOptions): Balance {
  const overrides = devBalanceOverrides(opts);
  if (overrides.length === 0 && !opts.shopAll) return loadBalance();
  const raw = withOverrides(bundledBalanceFiles(), overrides);
  if (opts.shopAll) {
    // Story 5.11: overrides are numbers only, so the boolean `inShop` is set here.
    for (const g of Object.values((raw.gear as { items: Record<string, { inShop?: boolean }> }).items)) g.inShop = true;
  }
  return loadBalance(raw);
}
