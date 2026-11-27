# Supported browsers: results (Story 10.5, NFR8)

How to run: `npm run smoke:browsers -- --browser chromium|firefox|webkit|msedge` (local: Chromium only, the cloud
containers have no other browser), or **Actions → Browsers → Run workflow** (all four on `ubuntu-latest`, plus every
Monday; decision 10.5-B4). The smoke drives a **release build** against a test server (a headless bot is the second
player, decision 10.5-B8). Steps: start screen → Create game → lobby → Start → Ready → wave 1 cleared → shop: buy one
item → place one barricade → wave 2 starts → rotate overlay in a portrait window. Each step is asserted from the room
state (phase, wave, wallet, a building I own) or the DOM; 30 s per step, 3 min per run.

## Smoke

Run: [Browsers #1](https://github.com/Seven74AI/topdown-shooter/actions/runs/45986350426), 2026-11-27, branch
`story-10-5`, commit `8f553cc`, `ubuntu-latest` (Linux x64), Playwright 1.63.0. Per browser: the step times in seconds;
every step passed. The bot did most of wave 1's killing (the browser player's sweep got 0–2 of the 24).

| Step | Chromium 153.0.8010.12 | Firefox 155.0 | WebKit 26.6 | Edge 158.0.4370.45 |
| --- | --- | --- | --- | --- |
| Start screen (title "Hordes") | pass 1.3 | pass 1.5 | pass 1.7 | pass 1.3 |
| Create game → lobby | pass 0.2 | pass 0.2 | pass 2.4 | pass 0.2 |
| Bot joins; Ready; Start (build) | pass 0.4 | pass 0.5 | pass 2.1 | pass 0.4 |
| Ready → wave 1 (24 zombies) | pass 1.7 | pass 1.6 | pass 4.0 | pass 1.7 |
| Wave 1 cleared | pass 20.8 | pass 20.1 | pass 15.6 | pass 20.0 |
| Shop: buy one item (wallet −60) | pass 1.9 | pass 0.4 | pass 2.7 | pass 2.1 |
| Place one barricade | pass 1.2 | pass 0.9 | pass 1.0 | pass 1.2 |
| Ready → wave 2 | pass 0.4 | pass 0.4 | pass 0.4 | pass 0.4 |
| Rotate overlay (portrait) | pass 0.4 | pass 0.4 | pass 0.4 | pass 0.4 |
| **Whole run** | **pass 39.5** | **pass 33.6** | **pass 73.4** | **pass 39.1** |

Local (cloud container, Chromium 158.0.8127.36, Linux, 2026-11-27, `3111858`+): pass, 9/9 in 34.1 s (load ~1.2).
WebKit's run is longer mostly from its slow WebGL screenshots between steps (not counted in the steps).

## Installability (Chromium only)

`tools/checks/safeAreaDomLayout.test.ts` (CI shard 1, every PR): a release build served like Caddy, CDP
`Page.getAppManifest` → no errors, `Page.getInstallabilityErrors` → `[]`. **Pass** (Chromium 158.0.8127.36, Linux,
2026-11-27, story-10-5).

## Safe areas (device emulation, Chromium)

Same file: `iPhone 13` (insets L/R 47, B 21) and `Pixel 7` (L 32) in landscape, insets forced with CDP
`Emulation.setSafeAreaInsetsOverride` (10.5-B7). HUD (HP, wave line, ☰) and controls (both sticks, swap, Build tiles,
Shop chip, Ready) are inside the safe area on the start screen, in a build phase and in wave 1. **Pass**. Stills (release
build, deviceScaleFactor as emulated): `browsers/safe-area-*.png`.

## Parked (designer 2026-11-25: real phones parked)

| Browser | OS | Result |
| --- | --- | --- |
| Safari (iOS 16+) | iPhone | parked, not run (Add to Home Screen, notch, fullscreen) |
| Chrome (Android 10+) | Android phone | parked, not run (Install, cutout, fullscreen landscape) |
