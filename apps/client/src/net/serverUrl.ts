/**
 * The game server, always on the page's own origin under `/api` (the Vite proxy in dev, Caddy in
 * production, Story 2.2), so a phone on the same Wi-Fi works too. `VITE_SERVER_URL` overrides it.
 * Its own tiny module (Story 7.1) so the start screen's account call doesn't load the Colyseus SDK.
 */
export function serverUrl(): string {
  const override = import.meta.env.VITE_SERVER_URL as string | undefined;
  return override ?? `${location.origin}/api`;
}
