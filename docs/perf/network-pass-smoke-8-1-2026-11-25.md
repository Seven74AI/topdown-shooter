# Network pass smoke, Story 8.1 reconnect (2026-11-25)

Brief line 34 (from the Epic 6 retro): one Playwright run with two tabs on a real server through a reconnect. Script: `tools/netaudit/smokeReconnect.cjs` (steps in its header). Two headless Chromium tabs (640 × 360) at `?lag=150&jitter=20&debug=1` (built before Story 8.8's `&loss` reached master), host creates the god-mode `net150` run (a tab alone can't wipe while the other is held), mid-wave 4. Server on port 2812, client (Vite) on 5811, builder's cloud session, load < 1.

## Result (third run, after the fixes below)

| Fault on tab B | B shows "Connection lost, reconnecting…" | A shows "TabB · reconnecting 2:00" | B back after the fault ended | A shows "TabB is back" |
| --- | --- | --- | --- | --- |
| Silent cut 8 s (nothing in or out, no close) | after 3122 ms (watchdog) | after 3239 ms | 12 ms | missed by the probe (the seat was back on the server during the cut: see below) |
| Hidden tab (game loop asleep) | not shown (by design: the tab can't see it) | server held B as quiet 3 s in | 36 ms | 393 ms after |
| Offline (context.setOffline) 8 s | after 34 ms (the browser's `offline` event) | after 3426 ms | 399 ms | 625 ms after |
| Reload mid-wave | — | — | back in the run 1909 ms after the reload (sessionStorage seat, token reconnect) | — |

Server log of the run (relative s): cut — `player_held drop` 0.0, `player_returned via token` 0.5, `seat_taken_over` 2.2; hidden — `player_held quiet` 31.0, `player_returned via input` 40.1; offline — `quiet` 46.7, `drop` 51.5, `player_returned via guest` 51.9; reload — `drop` 55.2, `player_returned via token` 55.9. No false drop after a recovery.

Screens: `img/8-1-reconnecting-panel.png` (B during the cut), `img/8-1-held-chip.png` (A during B's offline).

## What the smoke found (fixed on story-8-1 before this run)

1. **First run:** the takeover join hung forever when its handshake never arrived (the script's first cut dropped bytes instead of holding them; a real phone socket can hang the same way, WebKit 308073): an attempt now times out after 10 s and a late success is adopted (D5: the newest connection holds the seat).
2. **Second run:** the watchdog fired falsely right after the Game scene restarted onto the recovered room (a 3 s main-thread stall looked like 3 s of silence): a watchdog check that comes > 1 s late now re-arms instead of firing (also covers throttled hidden-tab timers).
3. **Second run:** a reload took the seat back on the server but stayed on the start screen: the Boot scene registered `startOnline` only after the title delay. It now listens from its first frame.

## Limits

- The silent cut is emulated in the page (a WebSocket wrapper that holds traffic both ways); the server's socket stays alive, so the server can see B back (token reconnect) before B's page does. The bots' cut line (`tools/netaudit/cutLine.ts`) cuts real TCP; see `network-pass-2026-11.md` § 8.1.
- No `&loss=1` in this run (8.8 was not on master yet when it was written); the lossy line was covered by the bots (§ 8.1).
- Not the full brief-34 route (boss telegraph, stage 4/5 build start, event, vote): 8.8's `smoke2tab.cjs` covers those; this one adds the reconnect.
- iPhone Safari / real 4G: not testable here (brief 23); see the Story 2.10 playtest plan checks.
