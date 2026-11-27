/**
 * Story 10.11 (AC 6, AD-4): the dev link switches (`?startwave`, `?bosswave`, `?bosshp`, `?events`, `?shopcards`,
 * `?loot`, `?shopall`, `?zdmg`, `?unlocks`, `?training`, `?devlayer`, `?devlooks`) for a SOLO (Practice) run: dev builds,
 * and an admin's production build. Read at each solo start (the account is known only after boot). Online paths keep
 * `urlOptions()` / `clientBalance()`, gated on `import.meta.env.DEV` alone (they need matching server env).
 */
import { accountStore } from "../net/accountStore";
import { parseUrlOptions, urlOptions, type UrlOptions } from "./urlOptions";

/** A solo run may use the dev link switches: a dev build, or the server says this phone's account is an admin. */
export function soloDevAllowed(): boolean {
  return import.meta.env.DEV || accountStore.get().admin;
}

let adminCached: UrlOptions | null = null;

/** The URL options a solo run reads (`dev` = `soloDevAllowed()` at this start). */
export function soloUrlOptions(dev: boolean = soloDevAllowed()): UrlOptions {
  if (import.meta.env.DEV || !dev) return urlOptions();
  return (adminCached ??= parseUrlOptions(typeof location === "undefined" ? "" : location.search, true));
}

/** The AD-4 switches by query key (`?zdmg` and `?shopall` included: they change the solo balance). */
export const DEV_SWITCH_KEYS = ["startwave", "bosswave", "bosshp", "events", "shopcards", "loot", "shopall", "zdmg", "unlocks", "training", "devlayer", "devlooks"] as const;

/** The page's query names at least one dev switch (then a production direct solo link waits for the session). */
export function urlHasDevSwitch(search: string): boolean {
  const q = new URLSearchParams(search);
  return DEV_SWITCH_KEYS.some((k) => q.has(k));
}
