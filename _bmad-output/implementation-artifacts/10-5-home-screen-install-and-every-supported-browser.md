---
baseline_commit: 09b5f6d2
---

# Story 10.5: Home-screen install and every supported browser

Status: ready-for-dev

(Written 2026-11-27 with `gds-create-story` from the real code at `09b5f6d2`. **Awaiting designer Q-codes 10.5-Q1…Q3.** Q1 is a new look (the icon), so it needs a code-drawn proposal page before the build. T1–T2 and T4–T6 can start before Q1 is picked, with a placeholder icon. Real-phone ACs are **parked** (designer 2026-11-25, HANDOFF §5.2). The buildable part is Playwright desktop browsers plus device emulation.)

## Story

As a player,
I want to add the game to my home screen and have it fit my phone's screen,
so that it feels like an app.

## Decision log

| # | Decision | Status |
| --- | --- | --- |
| 10.5-Q1 | **Home-screen icon** (a new look: code-drawn proposals, `dead-city-model` skill for the art, Lumen LF5 for the frame). Each option is drawn in code at 512 × 512 and 192 × 192, plus a maskable version with the subject inside the central 80 % circle. Each is shown as a phone home-screen still (iOS rounded square, Android circle and squircle masks) next to 3 real app icons, at 60 px and 180 px. **IC1** a survivor seen from above in a streetlight pool, wet asphalt, rifle aimed at the top right, amber rim light. **IC2** a horde silhouette (7–9 heads) at the edge of a streetlight pool, one amber survivor dot in the middle. **IC3** a Lumen emblem: a bevelled gunmetal frame, a charcoal face, an amber "H" (Hordes) or crosshair glyph, no scene. **IC4** the Behemoth's head in shadow, its eyes the only light. **Recommendation: IC1.** It says "top-down survivor in a dead city" at 60 px and matches the game's first second of play. IC3 is the safest at small sizes if IC1 turns to mush below 60 px. No videos: stills only. | **IC3** Lumen LF5 badge: gunmetal bevelled plate, amber H in a crosshair ring (designer 2026-11-27, from `docs/art/icon/stills/comparison.png`; source `docs/art/icon/icons.js`) |
| 10.5-Q2 | **Name under the icon** (`short_name`, which iOS and Android cut at about 12 characters) and the window title. **A** "Hordes" (matches hordes.sevend.io, 6 characters). **B** "Dead City" (the art direction, 9 characters). **C** "topdown-shooter" (today's `<title>`, 15 characters, cut to "topdown-sh…"). The `name` field (long name, shown by Android's install sheet) is the same word plus nothing else, until the real name is chosen (HANDOFF §5.7). **Recommendation: A.** | **A "Hordes"** (designer 2026-11-27, "All ok"; also the 10.4 loading-screen title) |
| 10.5-Q3 | **An install hint in the game.** **A** None: players use the browser's own menu, as today (no new screen). **B** A one-line Lumen hint on the start screen, on phones only, when the game is not already installed. Android shows an "Install" button through `beforeinstallprompt`. iOS Safari shows the text "Share → Add to Home Screen". It is dismissed for good with ✕ (stored in localStorage). **C** The same hint, shown only on the Results screen after a player's first finished run, at most once. B and C are a new look and need a Lumen proposal (2 stills each) before the build. **Recommendation: A** for this story (the AC doesn't ask for a hint). If you want one, **C** is the least intrusive. | **C** once, on Results after the first finished run (designer 2026-11-27); **no stills first**: the builder makes one simple Lumen line and the designer checks it in the finished game |
| 10.5-B1 | **No service worker.** Chrome has not needed one for "Install" since 2023 (manifest + HTTPS + icons are enough). A service worker would cache `index.html` and break "A new version is out. Please reload." (`index.html` is no-cache by design, Caddyfile). Offline play was dropped (epic-5 decisions). | auto (technical) |
| 10.5-B2 | **Manifest:** `display: "fullscreen"`, `display_override: ["fullscreen", "standalone"]`, `orientation: "landscape"`, `start_url: "/?source=homescreen"` (the query is ignored by `urlOptions`; a unit test proves it changes no option), `scope: "/"`, `background_color` and `theme_color` `#000000` (the same as `index.html` today, so there is no flash). iOS ignores `fullscreen` and opens standalone: `apple-mobile-web-app-capable=yes` plus `apple-mobile-web-app-status-bar-style=black-translucent` give the closest result (the game draws under the status bar, inside the safe-area insets it already handles). | auto (technical) |
| 10.5-B3 | **Icons as committed PNGs drawn by code.** A `tools/art/icons/drawIcon.ts` script draws the picked icon (node canvas, like the other `tools/art` bakers) into `apps/client/public/icons/` (`icon-192.png`, `icon-512.png`, `icon-maskable-512.png`, `apple-touch-icon-180.png`, `favicon-32.png`). The PNGs are committed, and a test re-runs the script and compares bytes (the same pattern as the atlas bakes). They are files, not `addGeneratedTexture` textures (the browser loads them, not Phaser), so the 4.13 rule does not apply. | auto (technical) |
| 10.5-B4 | **Browser matrix outside the `gate`.** A new workflow `.github/workflows/browsers.yml` (`workflow_dispatch` plus a weekly schedule) installs Playwright's Firefox, WebKit and `msedge` channel on `ubuntu-latest` and runs the smoke on all four. It is not a required check: it would add ~6 min to every PR, and the cloud container has only Chromium (`/opt/pw-browsers`). The Chromium leg also runs locally. Its results go into `docs/qa/browsers.md` by hand at hand-back (the builder triggers the workflow on its branch once). | auto (technical) |

## Acceptance Criteria

1. **Manifest and meta (B2).** `apps/client/public/manifest.webmanifest` holds the B2 fields, the Q2 name and the icons from B3 (`purpose: "any"` and a separate `purpose: "maskable"` entry). `index.html` links it (`<link rel="manifest">`). It also gets `apple-touch-icon`, `apple-mobile-web-app-capable`, `apple-mobile-web-app-status-bar-style`, `apple-mobile-web-app-title`, the favicon, and `<title>` set to the Q2 name. The release build copies them unhashed to `dist/`. Caddy serves `manifest.webmanifest` as `application/manifest+json`, with a short cache (`max-age=3600`, like other unhashed files), never the long immutable cache of `/assets/*`.
2. **Installable (headless check).** Chromium's installability check passes against a **production build** (`vite build` + `vite preview` on your own port): Playwright CDP `Page.getAppManifest` returns no errors, and `Page.getInstallabilityErrors` returns an empty list. A unit test validates the manifest's fields and checks that every icon file it names exists in `public/` with the stated pixel size.
3. *(parked, designer 2026-11-25)* "Add to Home Screen" on iOS and "Install" on Android open the game fullscreen in landscape from the icon. When phones are unparked, this joins the 10.9 game-night checklist (`docs/playtests/`).
4. **Top insets in the layout test (Q4 of the epic, designer "ok" 2026-11-26).** `apps/client/src/scenes/hudLayout.test.ts` gains cases with a **top inset of 47 px** (iPhone notch in landscape gives side insets; 47 px covers a top notch, status bar or iPad) at **568 × 320** and **844 × 390**. They combine it with the existing side and bottom insets 44 / 21, across every HUD mode the file already loops over. Nothing overlaps, everything is inside the safe rect, and text stays at 11 px or more. Today's top cases use 0 and 20 (`INSET` :48, :333, :937, :958). Any HUD element that fails gets fixed in the layout code, never by an allowance (the file's existing known-gap list stays as it is; adding to it needs a B-code and a reason).
5. **Device emulation run.** One Playwright run (preinstalled Chromium) against the production build, with `devices["iPhone 13"]` and `devices["Pixel 7"]` in landscape, forces safe-area insets. CSS `env()` can't be set through emulation, so inject them with the same test hook `display.ts › safeArea()` reads, or with a CDP `Emulation.setSafeAreaInsetsOverride` if this Chromium has it (check, and record which in a B-code). The run shows that the HUD (HP, wave line, ping, ☰) and the touch controls (both sticks, swap, Build button) sit inside the safe areas on the start screen, in a wave and in the build phase. It saves stills at deviceScaleFactor as emulated (`docs/qa/browsers/`).
6. *(parked)* On a real notched phone, HUD and controls stay inside the safe areas.
7. **Browser smoke (NFR8).** One smoke script (`tools/checks/browserSmoke.ts`, run with `npm run smoke:browsers -- --browser chromium|firefox|webkit|msedge`) drives a production build plus a test server on its own ports. It goes through: start screen → Create game → lobby → Start (solo online, a dev-allowed solo start on the test server) → one wave cleared (dev `DEV_*` env for a short first wave, keyboard and mouse input) → build phase → open the shop and buy one item → place one barricade → wave 2 starts. It **asserts** each step happened (phase names from the room state, wallet went down, a building exists: E8 "something actually happened"). Each step is limited to 30 s, and the whole run to under 3 min. It passes on Chromium locally and on all four browsers in the B4 workflow.
8. **Results recorded.** `docs/qa/browsers.md` (new) lists, for each browser: version, OS, date, commit, pass/fail per smoke step, the installability result (Chromium only), and the parked rows (Safari iOS 16+, Chrome Android 10+) marked "parked, not run".
9. **Nothing else changes.** No gameplay, net protocol, balance or server code. The rotate overlay (`RotateOverlay.tsx`) still shows in portrait in a browser tab. An installed app is locked to landscape by the manifest on Android, and iOS still relies on the overlay.

## Tasks / Subtasks

- [ ] **T1 Manifest + meta (AC 1, 2; B1, B2)**
  - [ ] `apps/client/public/manifest.webmanifest`, `index.html` links and meta, `<title>` (Q2; until it is picked, keep "topdown-shooter" and put a TODO in the PR).
  - [ ] `deploy/Caddyfile`: MIME type and cache for `/manifest.webmanifest` and `/icons/*` (read how `index.html` and `/assets/*` are handled first; keep `security_headers`).
  - [ ] Unit test `apps/client/src/install/manifest.test.ts`: fields, both icon purposes, every icon exists with its size (read the PNG header), and `start_url`'s query doesn't change `parseUrlOptions`.
- [ ] **T2 Icons (B3) — placeholder until Q1**
  - [ ] `tools/art/icons/drawIcon.ts` (+ `npm run art:icons`): draws the picked option, deterministically (no `Math.random`, seeded noise). Use a flat placeholder (amber crosshair on charcoal) until the designer picks, and say so in the PR.
  - [ ] Byte-compare test (the bake pattern used by the existing `*BakeWiring.test.ts`).
- [ ] **T3 Q1 proposal page (only if the main session asks the builder to make it; otherwise the main session does it before T2)**: follow `.claude/skills/dead-city-model/SKILL.md`. Show 4 options as stills on home-screen mock-ups at 60 and 180 px. No video.
- [ ] **T4 Top-inset layout cases (AC 4)**: add 47 px top cases at 568 × 320 and 844 × 390 to `hudLayout.test.ts`. Fix any element that fails in its layout function (`hudLayout` / `layoutBossBanner` / Build cluster). Note what moved.
- [ ] **T5 Emulation run (AC 5)**: `tools/checks/safeAreaEmulation.test.ts` (browser DOM check, runs in the CI test shard 1 like the other `*DomLayout` checks; under 30 s, split per device if needed). Production build + preview on your own port.
- [ ] **T6 Browser smoke + workflow (AC 7, 8; B4)**: `tools/checks/browserSmoke.ts`, the root `package.json` script, `.github/workflows/browsers.yml`. Run Chromium locally. Trigger the workflow once on the branch (`mcp__github__actions_run_trigger`) and record all four results in `docs/qa/browsers.md`.
- [ ] **T7 Hand-back**: `gate:fast` + `test:changed`. Branch `story-10-5`, PR "Story 10.5: Home-screen install and every supported browser". Record B-codes for anything you decided (inset hook, any layout fix).

## Dev Notes

### What exists today (read before changing)

- **Safe areas are built.** `index.html` has `viewport-fit=cover`. `apps/client/src/display.ts:22 safeArea()` reads `env(safe-area-inset-*)` through a probe element, and the HUD and overlays use it (`overlay.css` uses `env()` directly). `hudLayout.test.ts` loops 568 × 320 and 640 × 360 (plus Story 10.10's sizes up to 1920 × 1080) with `INSET = { left: 44, right: 44, top: 0, bottom: 21 }` (:48). Top-inset cases exist only at 20 px (:333 boss banner, :937 wheel, :958 Build cluster).
- **No manifest, icon, apple meta or service worker.** `apps/client/public/` has only `assets/`. `index.html` has `theme-color #000000` and title "topdown-shooter".
- **Caddy** (`deploy/Caddyfile`): `index.html` no-cache, hashed `/assets/*` long cache, `/api/*` stripped to the server (8 KB body cap). New unhashed files need their own short cache line.
- **Browsers in this container:** only Chromium (`/opt/pw-browsers`, Playwright 1.63.0 pinned in the root `package.json`). Do **not** run `playwright install` here (AGENTS: the preinstalled browser would no longer be found). Firefox, WebKit and Edge run only in the B4 workflow.
- **Existing browser checks:** `tools/checks/*DomLayout.test.ts` (Chromium, CI shard 1). Copy their production-build + preview + port setup. Never use `npm run dev` (AGENTS §6). Stop processes by PID.
- **Solo online start** needs the server's dev solo start (`allowSoloStart`, `ALLOW_SOLO_START`) and a client dev path. For a **production** client build against a test server, use 2 browser contexts (host + joiner) if the solo start is dev-only in the client (`LobbyScreen.tsx:18`). Check which is simpler and record it as a B-code.
- **Rotate overlay** `apps/client/src/ui/RotateOverlay.tsx`: keep it. iOS ignores manifest orientation.

### Code rules (AGENTS §5)

Exact version pins (no new dependency expected: node canvas for `tools/art` is already used by the bakers; check `package.json` before adding anything). No gameplay numbers inline. Every texture drawn in code that **Phaser** uses goes through `addGeneratedTexture`. The icons are PNG files the browser loads, not Phaser textures. Tests stay under 30 s each (split per browser and per device). Record machine load with any timing.

### Testing standards

`gate:fast` + `test:changed`. The DOM and emulation checks join CI shard 1. The browser smoke is NOT in `gate` (B4). Verify visually in a real browser and say plainly what wasn't verified (real iOS and Android: parked).

### Project Structure Notes

- New: `apps/client/public/manifest.webmanifest`, `apps/client/public/icons/*.png`, `tools/art/icons/drawIcon.ts`, `apps/client/src/install/manifest.test.ts`, `tools/checks/safeAreaEmulation.test.ts`, `tools/checks/browserSmoke.ts`, `.github/workflows/browsers.yml`, `docs/qa/browsers.md` (+ `docs/qa/browsers/*.png` stills).
- Changed: `apps/client/index.html`, `deploy/Caddyfile`, `apps/client/src/scenes/hudLayout.test.ts` (+ any HUD layout file a 47 px case breaks), root `package.json` (scripts only).

## Notes for the merge (files this story touches)

- **Client shell:** `apps/client/index.html`, `apps/client/public/**`. These **overlap 10.4 (fast loading)**, which is likely to touch `index.html` (preload, inline CSS) and maybe `vite.config.ts`. Run 10.5 after 10.4, or merge `index.html` by hand (keep-both of `<head>` lines is trivial).
- **`deploy/Caddyfile`:** also touched by **10.6** (`/api` body size for the report path) and maybe **10.4** (cache headers). They touch different blocks, so the conflict is trivial.
- **`hudLayout.test.ts`** (+ HUD layout code if a 47 px case fails): overlaps **10.2** if 10.2 moves HUD elements, and the deferred-work **D6** (edge arrows) if it is folded into 10.2.
- **CI:** new workflow file only; `.github/workflows/ci.yml` unchanged.
- No server, DB, shared or netEvents changes: runs in parallel with 10.6 and 10.7.

## Test plan

| What | How | Where |
| --- | --- | --- |
| Manifest fields, icon files and sizes, `start_url` harmless | unit (vitest) | `install/manifest.test.ts` |
| Icons reproduce byte for byte | bake check | `tools/art/icons` test |
| Installable | CDP `Page.getInstallabilityErrors` = [] on the production build | emulation check or smoke (Chromium) |
| 47 px top inset at 568 × 320 and 844 × 390, every HUD mode | layout unit test | `hudLayout.test.ts` |
| HUD and controls inside the safe areas, iPhone 13 and Pixel 7 landscape | Playwright emulation + stills | `safeAreaEmulation.test.ts` |
| Lobby → wave → shop → build → wave 2 asserted per step | Playwright smoke, 4 browsers | `browserSmoke.ts`, B4 workflow |
| Rotate overlay still shows in portrait in a tab | the smoke at 390 × 844 portrait for one step | `browserSmoke.ts` |
| *(parked)* real iOS / Android install and notch | 10.9 game night | `docs/playtests/` |

### References

- epics.md › Story 10.5 (:3634); Epic 10 header (real-phone testing parked, :3529).
- [Source: apps/client/index.html], [Source: apps/client/src/display.ts#22], [Source: apps/client/src/scenes/hudLayout.test.ts#23-48,333,937,958], [Source: deploy/Caddyfile#30-42], [Source: apps/client/src/ui/RotateOverlay.tsx], [Source: tools/checks/*DomLayout.test.ts], [Source: AGENTS.md §1 (looks need a pick), §5, §6].

## Dev Agent Record

### Agent Model Used

### Debug Log References

### Implementation Plan / decisions (B-codes)

### Completion Notes List

- Story context created with `gds-create-story` (story writer session, 2026-11-27).

### File List

### Change Log

- 2026-11-27: story file written (ready-for-dev, awaiting 10.5-Q1…Q3).
