/**
 * WebSocket Origin check (Story 2.2, architecture › Security and Operations). Origins are compared
 * as parsed URL origins: scheme, lower-case host and port must all match. A browser always sends
 * `Origin` on a WebSocket upgrade, so a missing or `null` one is refused whenever a list is set.
 */

/** Normalised origin (`https://host[:port]`), or null when the string is not an http(s) origin. */
function toOrigin(value: string): string | null {
  let url: URL;
  try {
    url = new URL(value);
  } catch {
    return null;
  }
  if (url.protocol !== "https:" && url.protocol !== "http:") return null;
  return url.origin;
}

/**
 * `PUBLIC_ORIGIN` (comma-separated, e.g. `https://hordes.sevend.io`) as normalised origins.
 * Unset or blank gives `[]` (dev: allow all). A bad entry throws, so a typo can't turn the check off.
 */
export function parseAllowedOrigins(env: string | undefined): string[] {
  const entries = (env ?? "")
    .split(",")
    .map((s) => s.trim())
    .filter((s) => s.length > 0);
  return entries.map((entry) => {
    const origin = toOrigin(entry);
    if (origin === null) throw new Error(`PUBLIC_ORIGIN: "${entry}" is not an http(s) origin`);
    return origin;
  });
}

/** True when `origin` is in `allowed` (already parsed). An empty list allows everything. */
export function originAllowed(origin: string | null | undefined, allowed: readonly string[]): boolean {
  if (allowed.length === 0) return true;
  if (!origin) return false;
  const parsed = toOrigin(origin);
  return parsed !== null && allowed.includes(parsed);
}
