---
baseline_commit: 09b5f6d2
---

# Story 10.4: Fast loading

Status: review

(Written 2026-11-27 with `gds-create-story` from the real code at `09b5f6d2`. Real phones are parked (designer 2026-11-25): "a phone on 4G" is measured as headless Chromium at 844 × 390 DPR 2 with CDP network throttling, empty cache and a return visit. **One designer choice is open: 10.4-Q1 (the loading screen's look).** T1, T2, T4 and T5 can start without it. Can run **in parallel with 10.2**.)

## Story

As a player,
I want the game to open in seconds from a link,
so that a game night starts right away.

## What loads today (release build at `09b5f6d2`, `vite build`)

| file (first load) | raw | gzip |
| --- | --- | --- |
| `index.html` | 1.0 KB | 0.5 KB |
| `assets/main-*.js` (entry) | 720 KB | 239 KB |
| `assets/consumableIcons-*.js` (Vite's shared chunk, modulepreloaded: Phaser + shared code, misleading name) | 2 200 KB | 617 KB |
| `assets/urlOptions-*.js` (modulepreloaded) | 11 KB | 4 KB |
| CSS (2 files) | ~10 KB | ~3 KB |
| Oswald fonts (browser fetches the subsets it needs, woff2) | ~25 KB used of 200 KB | — |
| `assets/streetProps-*.webp` (Boot starts it, nothing waits: 9.14 B26) | 544 KB | — |
| bake workers (characters 322 KB, buildings 45 KB, boss 29 KB) | 396 KB | (served compressed by Caddy `encode zstd gzip`) |
| lazy: `connection-*.js` (online, 182 KB / 57 KB gzip), `admin-tools-*` (admins only) | — | — |

Roughly **2 MB over the wire** for a first visit, far under the 15 MB budget. No music file exists: all sound is synthesized at run time (`audio/ambience.ts`, `audio/placeholderSfx.ts`, including the placeholder boss loop); 9.8 adds buses, not files.

Earlier measure (9.14, `docs/art/9-14/slow4g.cjs`, CDP 562.5 ms latency, 1.44 Mbps down): page load → title **6.0 / 6.1 s**; `?solo` → first city bake **8.8 / 8.6 s**. There is **no progress bar**: the page is black until the 960 KB gzip of JS has arrived and run, then the Boot title shows for 500 ms (`BootScene.ts › TITLE_SHOW_MS`), then the start screen.

Cache headers (`deploy/Caddyfile`): `/assets/*` (Vite's hashed files, workers and the WebP included) get `public, max-age=31536000, immutable`; everything else (`index.html`, `/j/<code>`) `no-cache`. CI's docker smoke checks the `no-cache` on `/` but not the immutable header on a real asset.

## Designer decision (picked 2026-11-27)

| # | Question | Options | Recommendation |
| --- | --- | --- | --- |
| **10.4-Q1** | What does the player see while the game loads (today: a black screen for ~6 s on slow 4G)? Drawn in plain HTML/CSS inside `index.html`, so it shows in the first 0.5 KB. Black background, white title as the Boot scene draws it now. | **A** Title + one thin bar (240 × 4 CSS px, LF5 Field Ops accent, fills as the files arrive), nothing else. · **B** Title + the bar + a short line under it that says what is happening: "Downloading… 1.2 / 2.0 MB", then "Drawing the city…". · **C** Title + a small spinner (no bar, no numbers). | **B** (the 4G wait is mostly the download; showing MB makes it feel shorter, and "Drawing the city…" covers the bake) · **Designer pick 2026-11-27 ("All ok"): B**, with the title **"Hordes"** (10.5-Q2; loading screen only, `<title>`/manifest are 10.5's) |

The builder shows a **still** of the picked option at 844 × 390 and 568 × 320 (no video) before merging, per AGENTS §1.

## Decisions made while writing (B-codes, technical)

- **10.4-B1 ("playable"):** the moment the start screen's buttons work (Practice / Create / Join respond to a tap), measured from navigation start. Also recorded, not gated: `?solo` → first city bake (the first frame of a run) and → character bake done (`window.__charBake.doneMs`).
- **10.4-B2 (network profiles):** headless Chromium, CDP `Network.emulateNetworkConditions`, two profiles: **Slow 4G** (562.5 ms latency, 1.44 Mbps down, 675 kbps up: the 9.14 profile, DevTools' "Slow 4G") is the one the < 10 s / < 3 s targets are judged on; **Fast 4G** (165 ms, 9 Mbps down, 1.8 Mbps up) recorded alongside. CPU at 4× (phone stand-in) and 1×. Three runs each, median reported.
- **10.4-B3 (served like production):** the measured build is the release build served by a small Node static server, `tools/perf/serveDist.cjs`, that copies the Caddyfile's rules (immutable on existing `/assets/*`, `no-cache` elsewhere, 404 for a missing asset, gzip) — `vite preview` doesn't send those headers. A unit test parses `deploy/Caddyfile` and checks both rules are still there (so the script and Caddy can't drift silently), and the CI docker smoke gains one line: a real hashed file under `/assets/` answers `cache-control: public, max-age=31536000, immutable`.
- **10.4-B4 (bytes):** bytes downloaded = Σ CDP `Network.loadingFinished.encodedDataLength` until "playable" (first visit) and until the first run's character bake is done; must be < 15 MB (it is ~2 MB today: recorded with the file list).
- **10.4-B5 (vendor chunk):** Phaser gets its own chunk (`build.rollupOptions.output.manualChunks`: `node_modules/phaser` → `vendor-phaser`), so a deploy that doesn't change Phaser keeps the phone's cached 1.4 MB; Vite's misleading `consumableIcons` shared chunk name goes away as a side effect. Keep the 10.11 `admin-tools-*` naming exactly; `noCheatsInRelease.test.ts` must stay green (it scans every built file).
- **10.4-B6 (progress source):** the bar fills from the files' known sizes: the build writes a tiny inline manifest of the first-load files and their gzip sizes into `index.html` (a Vite `transformIndexHtml` plugin), and an inline script sums `PerformanceObserver` resource entries' `encodedBodySize` for them; it switches to "Drawing the city…" when `main.ts` signals Boot and hides when the start screen mounts (or when a `?solo` run's first city bake lands). No dependency added. The inline script is plain ES5-safe, no `eval`, ≤ 2 KB.
- **10.4-B7 (music):** no music exists, so the AC "music streams after the game starts" is met by construction; a test in `tools/checks/` fails if any audio file (`.mp3 .ogg .m4a .wav .opus .webm` audio) is referenced from `index.html` or the entry's static imports (music must be lazy: `fetch` after the start screen). 9.8 / 9.10 read this rule.
- **10.4-B8 (no service worker here):** offline caching / a service worker belongs to 10.5 (home-screen install) if at all; 10.4 relies on HTTP caching only.

## Acceptance Criteria

1. **First visit < 10 s, < 15 MB (NFR6).** Slow 4G, empty cache, 4× CPU, 844 × 390 DPR 2: median "playable" (B1) < 10 s and bytes (B4) < 15 MB; recorded in `docs/perf/epic-10-loading.md` with Fast 4G and 1× rows, the file list and sizes, before (master) and after (branch).
2. **Progress shown (Q1).** From the first paint (≤ 1 s after navigation on Slow 4G) until the start screen, the picked loading screen is visible and moves (unit test of the progress maths; a browser check that it is visible at 1 s and gone after the start screen mounts, and that it never goes backwards).
3. **Return visit < 3 s.** Same profile, warm HTTP cache (same browser context, new page): median "playable" < 3 s, with the number of requests answered from cache vs network recorded (all `/assets/*` from cache: `Network.responseReceived.fromDiskCache`/`fromMemoryCache`; `index.html` revalidated).
4. **Cache headers kept (B3).** The Caddyfile check test and the CI docker smoke line for an immutable `/assets/` file.
5. **Music after start (B7).** The audio-file guard test passes; the doc says no music file exists.
6. **No regression.** `release:check` green (cheat scan over every file incl. the new vendor chunk); the gallery page still builds; 10.11's admin chunk name unchanged; the Boot `?solo` / `?stress` / resumed-seat paths still start (the loading screen never blocks or delays a start).

## Tasks / Subtasks

- [x] **T1 Measuring tool + before table (AC 1, 3)** — `tools/perf/serveDist.cjs` (B3), `tools/perf/load.cjs` (B1, B2, B4: first visit + return visit, 3 runs, median; liveness: the start screen really mounted — a Practice button exists and responds — else the run fails). Run on master first.
- [x] **T2 Bundle (B5)** — `apps/client/vite.config.ts` `manualChunks`; check the real `dist/` names; `noCheatsInRelease` green.
- [x] **T3 Loading screen (AC 2; Q1)** — `apps/client/index.html` (inline CSS/HTML for the picked option, inside `#ui`'s sibling so Preact's mount doesn't wipe it, or removed by `main.ts`), a Vite plugin in `vite.config.ts` for the size manifest (B6), `apps/client/src/main.ts` + `scenes/BootScene.ts` (signal "Drawing the city…" / hide). Stills for the designer's check.
- [x] **T4 Guards (AC 4, 5)** — `tools/checks/caddyCacheHeaders.test.ts`, `tools/checks/noEagerAudio.test.ts`; one line in `.github/workflows/ci.yml` docker smoke (`curl -sS -D - -o /dev/null "$base/assets/<a file from dist>"` → grep immutable; pick the file by listing `dist/assets` in the step, since the hash changes).
- [x] **T5 Return-visit levers (AC 3), only if the before table misses 3 s** — measure first; candidates: drop the 500 ms title wait on a warm visit (`TITLE_SHOW_MS`) is a look change → ask; start the character bake worker earlier; defer `urlOptions`'s modulepreload if unused. Each with its A/B numbers.
- [x] **T6 Hand-back** — `gate:fast` + `test:changed`; PR "Story 10.4: Fast loading"; new decisions as 10.4-B9+.

## Test plan

- Script liveness: each load run asserts the start screen mounted and a Practice tap opened the run's Boot → Game path (or, for `?solo` rows, `cityView.bakeCount > 0`); bytes > 0; a run that didn't reach "playable" in 60 s is a failure, not a number.
- Unit: progress maths (bytes → fraction, capped at 1, monotonic); manifest plugin output shape; Caddyfile rules test; eager-audio guard proven once to fail on a doctored `index.html` with an `<audio src=…mp3>`.
- Browser: the loading screen visible at ~1 s on Slow 4G and gone after mount (screenshot at DPR 1 for your own check; stills at DPR 2 for the designer).
- CI: the docker smoke immutable-header line.
- Not verified (say so): a real phone on a real 4G network; Cloudflare's edge caching in front of Caddy (the tunnel may add its own headers: one `curl -I` on hordes.sevend.io by Hermes after deploy is the check — add it to `docs/hermes-go-live.md` › Every later release).

## Dev Notes

### What exists today

- `apps/client/index.html`: black page, `#game` + `#ui`, inline base CSS; Vite injects the entry module, two modulepreloads and two stylesheets.
- `apps/client/src/main.ts`: builds the Phaser game (canvas `innerWidth × dpr()`), mounts the Preact UI into `#ui`; DEV block for `__game` / `__gfx` / panel; production admin gate (10.11).
- `scenes/BootScene.ts`: starts the street-props download (`loadStreetProps`, 9.14), prewarms ambience synthesis, shows the title 500 ms, then the start screen or a `?solo/?stress/?loadout/?tune` run (`skipsStartScreen`); a resumed seat can start Game during the title (8.1).
- Bakes after load: characters worker (~8 s at 1×, ~16 s at 4× headless, 9.13 B24: falls in the first build phase), city bake per stage (first ~100 ms at 1×, ~500 ms at 4×).
- `deploy/Caddyfile`: see above; `docs/deploy.md` for the stack; `.github/workflows/ci.yml` docker job (lines ~185-210) for the smoke.

### Code rules (AGENTS §5)

Exact version pins (no new dependency expected); every code-drawn texture through `addGeneratedTexture` (the loading screen is HTML, not a texture); own ports, stop processes by PID; never `npm run dev`.

### References

- [Source: _bmad-output/planning-artifacts/epics.md › Story 10.4], [Source: docs/perf/epic-9-street-props.md#Download], [Source: docs/art/9-14/slow4g.cjs], [Source: deploy/Caddyfile], [Source: apps/client/vite.config.ts], [Source: apps/client/index.html], [Source: apps/client/src/scenes/BootScene.ts], [Source: tools/checks/noCheatsInRelease.test.ts], [Source: .github/workflows/ci.yml › docker].

## Notes for the merge

- **Touches:** `apps/client/index.html`, `apps/client/vite.config.ts` (manualChunks + manifest plugin; keep 10.11's `chunkFileNames` / `assetFileNames`), `apps/client/src/main.ts` (signal / hide calls only), `apps/client/src/scenes/BootScene.ts` (signal), new `tools/perf/serveDist.cjs`, `tools/perf/load.cjs`, new `tools/checks/caddyCacheHeaders.test.ts`, `tools/checks/noEagerAudio.test.ts`, `.github/workflows/ci.yml` (one docker smoke line), `docs/perf/epic-10-loading.md`, `docs/hermes-go-live.md` (one check line). Possibly `noCheatsInRelease.test.ts` if a chunk name it relies on changes (it shouldn't).
- **Overlap:** with **10.2** only on `main.ts` (different hunks: 10.2 canvas re-size, 10.4 boot signal) → **parallel OK**. With **10.3**: `main.ts` (trivial). With **10.5** (manifest, icons, apple meta in `index.html`; new short-cache lines in `deploy/Caddyfile`; no service worker, 10.5-B1) on `index.html` → don't run 10.4 and 10.5 at the same time, or 10.5 rebases on 10.4 (keep-both `<head>` lines). 10.4's Caddyfile test must check only its two rules, so 10.5's extra lines don't break it. `tools/perf/` is shared with 10.2: 10.4's files are separate (`serveDist.cjs`, `load.cjs`); 10.2 owns `fps.cjs`.
- No migration, no netEvents kinds, no protocol bump.

## Dev Agent Record

### Agent Model Used

### Debug Log References

### Completion Notes List

### File List
