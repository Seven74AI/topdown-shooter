---
baseline_commit: 1664483
---

# Story 13.1: Native spike (iOS Simulator, branch only)

Status: ready-for-dev

(Written 2026-11-28 with `gds-create-story` from the real code at `1664483`, after `sprint-change-proposal-2026-11-28-native-ios.md` (approved by the designer 2026-11-28). **A spike:** its code lives on branch `spike-13-1` and is **never merged**. Only the report and its screenshots land on master (docs-only push, AGENTS.md §2). Time box: **one builder day**. If a check can't be done in the box, record it as "not run" with the reason; don't stretch the box. **No Apple account is needed:** the app is built unsigned for the iOS Simulator.)

## Story

As the designer,
I want the current game wrapped as an iOS app and run in the iOS Simulator on a cloud Mac, with a list of what breaks,
so that I know the real cost of the app before Epic 13 starts, and nothing built before v1 makes it harder.

## Decision log

| # | Decision | Status |
| --- | --- | --- |
| 13.1-B1 | **Wrapper: Capacitor** (ADR-07), current stable major, **exact pins** (`npm i -E`, `.npmrc save-exact`): `@capacitor/core`, `@capacitor/cli`, `@capacitor/ios`, plus `@capacitor/preferences` for F4. Check the version with `npm view @capacitor/ios version` on the day and write it in the report. Use Capacitor's default iOS dependency manager (Swift Package Manager in current majors); fall back to CocoaPods only if SPM fails, and record why. | fixed |
| 13.1-B2 | **Where the Capacitor project lives:** `apps/ios/` (a new npm workspace, `"private": true`), `webDir` pointing at `../client/dist`. Nothing under `apps/client`, `apps/server` or `packages/shared` changes except throwaway spike hooks (B4), each marked `// SPIKE-13-1`. | fixed |
| 13.1-B3 | **CI:** a new `.github/workflows/ios-spike.yml`, triggered **only** by `push` to `spike-13-1` (plus `workflow_dispatch`, which works only once the file is on master, and it never will be). `runs-on: macos-15` or the newest macOS image GitHub offers (record it). Node from `.nvmrc` (26). The repo is public, so macOS minutes are free. `timeout-minutes: 45`. | fixed |
| 13.1-B4 | **Driving the app without taps:** `xcrun simctl` can't tap. The spike adds a build-time switch `VITE_SPIKE=<script>` read in `main.ts` (`// SPIKE-13-1`) that runs a scripted path (e.g. `stress`: open Practice solo with `?stress=150`; `online`: Create game with the server URL from `VITE_SERVER_URL`). Results go to `console.log` lines prefixed `SPIKE13 ` (captured with `xcrun simctl spawn booted log stream --predicate 'eventMessage CONTAINS "SPIKE13"'`) and screenshots (`xcrun simctl io booted screenshot`). Another way (Safari Web Inspector protocol, Appium) is fine if it is faster; say which. | fixed |
| 13.1-B5 | **Game server: a local test server on the runner, never production** (`hordes.sevend.io` must not be touched). Start it the way `tools/checks/browserSmoke.ts:123-126` does: `node --import tsx src/index.ts` in `apps/server` with `PORT`, `HOST=127.0.0.1`, `PGLITE_DIR` (temp), `NODE_ENV=development`. The Simulator reaches the Mac's `127.0.0.1`. The second player is a bot (`tools/bots/botClient.ts`, as the smoke uses it). | fixed |
| 13.1-B6 | **Simulator device:** an iPhone in **landscape** (`xcrun simctl` plus a rotate step, or the app locked to landscape in `Info.plist`, which the real app will do anyway). Record the device and the iOS version. The Simulator is **not** a phone: frame rate and memory numbers are indicative only, and the report says so next to every number. | fixed |

## Acceptance Criteria

1. **The app builds and launches (B1–B3, B6).** On a push to `spike-13-1`, the workflow builds the client (`npm run build`, with the spike env), copies it into `apps/ios` (`npx cap sync ios`), builds it for the Simulator unsigned (`xcodebuild … -sdk iphonesimulator CODE_SIGNING_ALLOWED=NO`), boots a Simulator, installs and launches the app, and uploads a landscape screenshot of the start screen as a workflow artifact. A red step fails the job.
2. **Every check is recorded.** Each check F1–F10 below gets **pass**, **fix** (what to change and which story owns it: 13.2–13.9, or a new one) or **blocker** (what would stop the app shipping), with evidence: a log line, a screenshot or a measured number. Anything not run says "not run" and why.
3. **Production untouched (B5).** No request goes to `hordes.sevend.io` (`grep` the workflow log for the host; the report quotes the result). No secret is added to the repo or to GitHub.
4. **Report on master.** `docs/native/spike-13-1.md` (the template is below) and `docs/native/spike-13-1/*.png` land on master as a **docs-only** push. The report links the green workflow run and the head commit of `spike-13-1`. The branch is pushed and left in place, and **no PR is opened** for its code.
5. **The plan is corrected.** The report ends with a revised size for each of 13.2–13.9 (S / M / L) and lists every change Epic 13 needs: a new story, an AC change, or a check of the gate. The main session applies these to `epics.md` as a docs-only edit after the review.

### Checks (F1–F10)

Expected outcomes are from reading the code at `1664483` (proposal §1, E1–E7). The spike's job is to confirm or correct them.

| # | Check | How | Expected |
| --- | --- | --- | --- |
| F1 | Boot and WebGL | Launch; screenshot the start screen; log `renderer.type` and `gl.getParameter(gl.VERSION)` | Pass (WebKit already passes `docs/qa/browsers.md`). Watch the 10.4 loading screen (`boot/bootLoader.js`) and font loading (`@fontsource/oswald`) from `capacitor://` |
| F2 | Practice solo + `?stress=150` | `VITE_SPIKE=stress`; log 30 s of FPS and tick ms from the debug overlay's numbers (`?debug=1`) | Runs; numbers indicative only (B6) |
| F3 | Audio | Log `AudioContext.state` before and after the first scripted input; does the ambience start (`audio/ambience.ts` waits for unlocked audio)? | WKWebView may need a user gesture: record what unlocks it. Can't be heard in CI |
| F4 | Storage kept across a relaunch | Write a guest token (`net/guestToken.ts`) and a setting; `xcrun simctl terminate` + `launch`; read them back. Also write and read once through `@capacitor/preferences` | `localStorage` survives a relaunch in the Simulator; iOS may still clear it under storage pressure (13.3 moves it to Preferences either way) |
| F5 | Account session | Call the session endpoint the way `net/account.ts:72` does; log the status and whether the `__Host-tdg` cookie came back | **Fix (13.3):** `credentials: "same-origin"` plus a `SameSite=Lax` `__Host-` cookie from `capacitor://localhost` to another origin should fail. Record exactly what fails (CORS, cookie not stored, cookie not sent) |
| F6 | Online join with a bot | `VITE_SPIKE=online`, `VITE_SERVER_URL=http://127.0.0.1:<port>/api`; Create game; the bot joins; Ready; wave 1 starts; log `phase`/`wave` | **Run it twice:** (a) `PUBLIC_ORIGIN` unset (dev: every origin allowed) → expected pass; (b) `PUBLIC_ORIGIN=https://hordes.sevend.io` → expected refusal at the WebSocket upgrade (`apps/server/src/app.ts:32-81`, `net/origin.ts`) = **fix (13.4)**. Log the `Origin` header the app sends |
| F7 | Server URL and share links | Log `serverUrl()` (`net/serverUrl.ts:8`) without the override, and `shareLink("ABCD")` (`ui/share.ts:5`) | **Fix (13.4):** both are built from `location.origin` (`capacitor://localhost`). Also log what `parseJoinPath(location.pathname)` sees (`main.ts:306`) |
| F8 | Browser-only APIs | Log `typeof navigator.vibrate`, `navigator.clipboard` (and one `writeText` result), whether `beforeinstallprompt` fires and whether the 10.5 iOS install hint shows (`install/installHint.ts`), `navigator.share`, `screen.orientation.lock`, fullscreen | Install hint: should be hidden in the app (13.6). Vibrate: absent on iOS (13.6 haptics) |
| F9 | Safe areas and landscape | Landscape screenshots of the start screen, the HUD in a run and the shop on a notched iPhone; compare with the 10.5 safe-area layout (`tools/checks/safeAreaDomLayout.test.ts`) | Pass, or a list of what is clipped. Note `viewport-fit=cover` and `env(safe-area-inset-*)` inside WKWebView |
| F10 | App size, build time, app switch | The `.app` size (`du -sh`), the workflow's step times; background and foreground via `xcrun simctl launch` of another app, then back: does the game resume (`loop.sleep()/wake()` path, Story 4.13 texture redraw)? | Record the numbers. Textures must survive (Story 4.13's `addGeneratedTexture` path) |

## Tasks / Subtasks

- [ ] T1 Branch and workspace (B2): `git switch -c spike-13-1` from master; `apps/ios/package.json`; `capacitor.config.ts` (`appId: "io.sevend.hordes.spike"`, `appName: "Hordes"`, `webDir: "../client/dist"`); `npx cap add ios`; landscape only in `Info.plist`. Commit the generated `apps/ios/ios/` project (it is small; CI needs it).
- [ ] T2 Workflow (B3, AC 1): `.github/workflows/ios-spike.yml`: checkout, setup-node from `.nvmrc`, `npm ci`, build, `cap sync`, `xcodebuild`, Simulator boot / install / launch / screenshot, artifacts (screenshots, log stream, `.app` size). Get it green with F1 alone before adding the scripted checks.
- [ ] T3 Spike hooks (B4): `VITE_SPIKE` script runner in `main.ts`, every line marked `// SPIKE-13-1`, `SPIKE13 ` log lines. Keep it out of the release cheat scan's way: the spike build is not a release (`release:check` is not part of this workflow).
- [ ] T4 Test server and bot (B5): start the server and the bot in the workflow (reuse `browserSmoke.ts`'s boot code if it is quicker to import than to copy); F6 runs (a) and (b).
- [ ] T5 Checks F1–F10 (AC 2): one workflow run can do all of them; a second run for F6 (b) is fine.
- [ ] T6 Report (AC 4, 5): write `docs/native/spike-13-1.md` from the template, copy the screenshots, and push docs-only to master. Push the branch. Then `send_message` to `@parent` with the report link, the workflow run link and the branch head.

## Dev Notes

### What this is not
- Not a story that merges: **no `gate:fast` and no PR are needed for the branch.** Don't fix the problems the checks find. Record them; Epic 13 fixes them.
- Not signing, TestFlight or App Store work (13.7, 13.9). No Apple ID, certificates or secrets.
- No change to `hordes.sevend.io`, `deploy/` or the Caddyfile.

### Facts from the code (read before T3)
- `apps/client` is Vite 8 + Phaser 4.2.1 + Preact 11.2 (`apps/client/package.json`). `vite.config.ts` has the 10.4 loading-screen plugin (`bootLoaderPlugin`, inline script with first-load sizes) and the `vendor-phaser` chunk; `base` comes from `BASE_PATH`, so keep it `/` (or `./` if `capacitor://` paths fail: record which).
- The server URL: `net/serverUrl.ts` uses `VITE_SERVER_URL` when set, else `${location.origin}/api`.
- Identity: guest token in a 1-year `__Host-tdg` cookie (HttpOnly, Secure, `SameSite=Lax`) plus a `localStorage` copy (architecture › Accounts, Epic 7 D9). Account calls use `credentials: "same-origin"` (`net/account.ts`, `settingsSync.ts`, `savedRuns.ts`).
- The WebSocket origin check: `apps/server/src/app.ts` with `allowedOrigins` from `PUBLIC_ORIGIN`; empty = every origin allowed plus an `origin_check_disabled` warning.
- Join: `net/connection.ts:41` sends `netProtocolVersion: NET_PROTOCOL_VERSION` (6); the server refuses any other value (`RunRoom.ts:336`, `update_required`).
- 29 direct `localStorage` / `sessionStorage` calls in 17 client files (list them in the report under F4; 13.3 migrates them).
- Account deletion exists (Story 10.1, `apps/server/src/auth/accountDelete.ts`): Apple's in-app deletion rule is met. Note in the report whether it works from the app (it uses the same cookie, so expect it to fail like F5).
- A release client can't start a game alone (`LobbyScreen`, decision 10.5-B8). That's why F6 needs the bot.
- AGENTS.md §6 gotchas apply: never `npm run dev` (fixed ports); stop processes by PID.

### Report template (`docs/native/spike-13-1.md`)

```
# Native spike 13.1: results (YYYY-MM-DD)
Run: <workflow run link> · branch spike-13-1 @ <sha> · macOS image <x> · Xcode <x> · Simulator <device>, iOS <x> · Capacitor <x>
Simulator numbers are indicative only (not a phone).

## Summary (for the designer, 5 lines max)
## Checks
| # | Check | Result (pass / fix / blocker / not run) | Evidence | Fix and owner story |
## Storage calls (F4)
## Production untouched (AC 3)
## Epic 13 changes
| Story | Size S/M/L | Change (new AC, new story, gate) |
```

### References
- [Source: _bmad-output/planning-artifacts/sprint-change-proposal-2026-11-28-native-ios.md#1-issue-summary] E1–E7
- [Source: _bmad-output/planning-artifacts/epics.md#epic-13-native-ios-app-post-v1] Story 13.1 ACs, 13.2–13.9
- [Source: _bmad-output/planning-artifacts/game-architecture.md] ADR-07; Accounts row; Networking
- [Source: AGENTS.md] §2 docs-only pushes, §4 cloud sessions and `@parent`, §6 ports, §7 NR-1…NR-3
- [Source: docs/qa/browsers.md] WebKit 26.6 smoke pass
- [Source: tools/checks/browserSmoke.ts:1-130] test server + bot boot

### Review
Light review (one checker, AGENTS.md §3): every result in the report matches the workflow logs or screenshots (E8-A3: a citation per claim), AC 3's grep is real, and nothing landed on master except `docs/native/spike-13-1*`.

## Dev Agent Record

### Agent Model Used

### Debug Log References

### Completion Notes List

### File List
