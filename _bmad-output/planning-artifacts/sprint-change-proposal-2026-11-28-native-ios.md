# Sprint change proposal: native iOS app, browser kept (2026-11-28)

**Trigger:** a new requirement from the designer (2026-11-28): "I'd like to turn Top down shooter to a native App … The goal is to have an autonomous app development team that can ship alone", then "I'd like to also keep the browser version for desktop users. And people could try the game in their browser before they go for the real app."
**Mode:** batch. **Scope:** moderate (a new post-v1 epic, three standing rules now, one spike story now). **Status: APPROVED 2026-11-28.** The designer was shown "finish the browser version first, add native after v1, one cheap spike now plus three rules" with its costs and answered: "Yes I think that the right way to do it. Also do not forget to follow bmad gds methods."

## 1. Issue summary

The GDD says "No native app and no app store in v1" (gdd.md › Platform-Specific Details) and lists native apps as deferred. The designer now wants an iOS App Store app **after v1**, with the browser game kept as a first-class version: desktop players use it, and new players can try the game in a browser before installing the app.

Evidence from the code at `1664483` (what a native app would hit today):

| # | Finding | Where | Effect inside an iOS app |
| --- | --- | --- | --- |
| E1 | WebSocket upgrades are refused unless the `Origin` is in `PUBLIC_ORIGIN` | `apps/server/src/app.ts:32-81`, `net/origin.ts` | The app's origin is `capacitor://localhost`: **online play is refused** until it is allowed |
| E2 | The account is named by a `__Host-tdg` cookie, `SameSite=Lax`, and every account call uses `credentials: "same-origin"` | `auth/*` (test `accountRoutes.test.ts:89`), `apps/client/src/net/account.ts`, `settingsSync.ts`, `savedRuns.ts` | From `capacitor://localhost` to `hordes.sevend.io` the cookie is cross-site: **accounts, unlocks and saved runs break** (a guest token copy exists in `localStorage`, Epic 7 D9, so a header-based identity is close) |
| E3 | The API and share links are built from `location.origin` | `net/serverUrl.ts:8`, `ui/share.ts:5-29`, `main.ts:306` | `/api` resolves to the app itself; share links would read `capacitor://localhost/j/ABCD` |
| E4 | 29 direct `localStorage` / `sessionStorage` calls in 17 files | `apps/client/src/net/*Store.ts`, `settings/*`, `install/installHint.ts`, `ui/StartScreen.tsx`, `main.ts` | iOS may clear a web view's storage: a guest could lose their identity and progress |
| E5 | The server refuses any client whose `NET_PROTOCOL_VERSION` differs (`update_required`) | `apps/server/src/rooms/RunRoom.ts:336`, `packages/shared/src/net/messages.ts:182` | Fine for a website (a reload fixes it). An App Store build lags 1–3 days behind a deploy, so **every protocol bump would lock app players out** |
| E6 | Browser-only features: `beforeinstallprompt` install hint, `navigator.vibrate`, clipboard | `install/installHint.ts`, `ui/SettingsPanel.tsx:7`, `ui/AccountScreen.tsx:55` | The install hint makes no sense in an app; vibration doesn't exist on iOS (native haptics instead) |
| E7 | Account deletion inside the game already exists (Story 10.1, `auth/accountDelete.ts`) | — | Apple's rule 5.1.1(v) is already met. A privacy policy page is still needed for the store listing |

## 2. Impact analysis

- **Epic 10 (current):** no change. v1 is still shipped as the browser game. 10.8 and 10.9 come first.
- **New Epic 13, Native iOS app (post-v1):** 9 stories. Only **13.1 (a one-day spike)** runs now. Its code stays on a branch and is never merged, and its report lands on master. 13.2–13.9 start after the v1 gate below.
- **Epics 9 and 11:** no change. Builders follow the three native-readiness rules (§4.4) from now on.
- **GDD:** Platform-Specific Details and the "Not in v1" line say a native iOS app follows v1 (Epic 13), with the browser version kept.
- **Architecture:** new **ADR-07** (one web build, two shells; the browser stays first-class).
- **AGENTS.md:** new §7 "Native readiness" with rules NR-1…NR-3, so every builder and reviewer knows them.
- **Code:** none now. The spike writes code only on branch `spike-13-1`.
- **CI:** none on master now. The spike adds a macOS workflow on its own branch only, free on a public repo.

**Cost (designer-facing estimate, not measured):** native work would slow every story by about 15–25 % while the game still changes fast, and about 5–10 % once it is stable. Most of that is keeping old app versions playable (E5). Waiting until after v1 costs nothing extra, because the app wraps the same web build.

## 3. Recommended approach

**Direct adjustment, deferred:** finish v1 in the browser, then add native as Epic 13. Rejected alternatives:
- **Native now:** slows Epic 9 and 10.8/10.9 while the protocol still changes about daily (4 → 6 in two days).
- **A native rewrite** (Swift + SpriteKit): throws away 100+ done stories and loses the browser version.

**The wrapper is Capacitor** (the web build inside a native iOS shell that uses WebKit, the engine already covered by the browser smoke: `docs/qa/browsers.md`, WebKit 26.6 passes).

**Epic 13 start gate (all three):**
1. 10.9 v1 has shipped (the friend-group game nights have happened).
2. `NET_PROTOCOL_VERSION` has not changed for 14 days.
3. The designer has an Apple Developer Program membership (needed from 13.7 on; 13.2–13.6 run on the Simulator without one).

## 4. Detailed change proposals (all applied)

### 4.1 epics.md

- **Epic List:** an Epic 13 entry, and the order line gains "→ **13 Native iOS app (post-v1; 13.1 spike now)**".
- **New section "Epic 13: Native iOS app (post-v1)"** at the end, with stories 13.1–13.9 (full text in epics.md):

| Story | What | Closes | When |
| --- | --- | --- | --- |
| 13.1 | Native spike: wrap the build in Capacitor, run it in the iOS Simulator on a GitHub macOS runner, list what breaks. Branch only, report on master | measures E1–E6 | **now** |
| 13.2 | App shell and two builds: `apps/ios` Capacitor project, every PR builds the website and the iOS app (Simulator, unsigned) | — | post-v1 |
| 13.3 | Identity and storage in the app: one storage helper (native Preferences in the app, `localStorage` in the browser); the account by a token header as well as the cookie | E2, E4 | post-v1 |
| 13.4 | Server address, origins and links: the app's origin allowed, `serverUrl()` / `shareLink()` never from `location.origin` in the app, universal links for `/j/<code>` | E1, E3 | post-v1 |
| 13.5 | Version window: the server accepts protocol `MIN_SUPPORTED…CURRENT`; below it the app shows "Update the app"; decision on live web updates | E5 | post-v1 |
| 13.6 | Native touches: haptics, screen stays awake, audio session, no install hint in the app (App Review 4.2) | E6 | post-v1 |
| 13.7 | Signing and TestFlight: fastlane + App Store Connect API key, every master merge to TestFlight | — | post-v1, needs Apple account |
| 13.8 | From browser to app: Smart App Banner on iPhone Safari, "Get the app" on Results; the browser game stays complete | — | post-v1 |
| 13.9 | App Store release: listing, privacy page, age rating, screenshots; **the designer clicks Submit** | E7 | post-v1 |

### 4.2 GDD (`gdds/gdd-topdown-shooter-2026-11-21/gdd.md`)

OLD: `- **No native app** and no app store in v1.`
NEW: `- **No native app** and no app store in v1. **After v1: a native iOS app (Epic 13)** wraps the same web build; the browser game stays first-class (desktop players, and new players trying it before installing). Both play together in the same rooms (designer 2026-11-28).`

OLD (Not in v1): `… voice and text chat · native apps.`
NEW: `… voice and text chat · native apps (iOS follows v1 as Epic 13; Android not planned).`

### 4.3 Architecture (`game-architecture.md`)

Add **ADR-07** after ADR-06, and add it to the Key decisions line:

> **ADR-07 One web build, two shells (native iOS app, Epic 13; `sprint-change-proposal-2026-11-28-native-ios.md`).** The iOS app is the `apps/client` build inside a Capacitor shell (WebKit). The browser version stays first-class: the same build, the same server, the same rooms; app and browser players play together. Chosen over a native rewrite (loses 100+ stories and the browser) and over React Native / Flutter (a second codebase). Rules: no game code forks per platform (one `isNativeApp()` check gates only native extras: haptics, storage backend, links); the server serves a window of protocol versions once Epic 13 ships (13.5), because an App Store build can't be reloaded; identity works without third-party cookies (token header, 13.3). Cost: a macOS CI job, a version window, Apple's review delay on native releases.

### 4.4 AGENTS.md: new §7 "Native readiness" (applies to every story from 2026-11-28)

- **NR-1 Saved data:** new saved data goes through a `*Store.ts` module in `apps/client/src/net/` (or `settings/settings.ts`), never a direct `localStorage` call in UI, scenes or `main.ts`. Story 13.3 will put one storage helper under those modules.
- **NR-2 No new same-site assumptions:** new code builds server URLs with `serverUrl()` and share links with `shareLink()`, never from `location.origin`. Don't add a new identity path that works only with the cookie. New browser-only APIs (vibrate, install prompts, clipboard, fullscreen, orientation lock) need a no-op fallback.
- **NR-3 Protocol bumps are logged:** every `NET_PROTOCOL_VERSION` bump adds a row to `docs/native/protocol-log.md` (version, story, what changed, whether a client one version older could still play). This is the input for 13.5's version window, and the log shows when the "14 days without a bump" gate is met.

### 4.5 Other files

- `sprint-status.yaml`: an Epic 13 block, 13.1 `ready-for-dev`, the rest `backlog`.
- `HANDOFF.md`: an Epic 13 row in §2.
- `docs/native/protocol-log.md`: a new file with versions 2–6 back-filled from `messages.ts:174-182`.
- Story file `13-1-native-ios-spike.md` (written with `gds-create-story`).

## 5. Implementation handoff

- **Moderate scope.** The main session (acting as PO/SM) applies these docs-only edits straight to master (AGENTS.md §2) and writes the 13.1 story file.
- **13.1** goes to a builder in its own cloud session, branch `spike-13-1` (AGENTS.md §4). Its review is light: one checker that the report's claims match the CI logs and screenshots. Its PR is never opened against master for the code. Only `docs/native/spike-13-1*` lands, as a docs-only push.
- **13.2–13.9** wait for the gate in §3. When Epic 13 starts, run `gds-check-implementation-readiness` against the 13.1 report first, then `gds-create-story` per story.
- **Success:** the 13.1 report gives every check F1–F10 a pass / fix / blocker and names the 13.x story that owns each fix; every builder follows NR-1…NR-3 from today.
