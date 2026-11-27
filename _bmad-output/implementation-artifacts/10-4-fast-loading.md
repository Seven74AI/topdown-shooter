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

- **Touches:** `apps/client/index.html`, `apps/client/vite.config.ts` (manualChunks + manifest plugin; keep 10.11's `chunkFileNames` / `assetFileNames`), `apps/client/src/main.ts` (one import + one `signalBootLoader(uiStore)` call, just before the Preact mount; BootScene.ts NOT touched, B11), new `apps/client/src/ui/bootLoaderSignal.ts`, new `apps/client/boot/bootLoader.js`, new `tools/perf/serveDist.cjs`, `tools/perf/load.cjs`, new `tools/checks/caddyCacheHeaders.test.ts`, `tools/checks/noEagerAudio.test.ts`, `.github/workflows/ci.yml` (one docker smoke line), `docs/perf/epic-10-loading.md`, `docs/hermes-go-live.md` (one check line). Possibly `noCheatsInRelease.test.ts` if a chunk name it relies on changes (it shouldn't).
- **Overlap:** with **10.2** only on `main.ts` (different hunks: 10.2 canvas re-size, 10.4 boot signal) → **parallel OK**. With **10.3**: `main.ts` (trivial). With **10.5** (manifest, icons, apple meta in `index.html`; new short-cache lines in `deploy/Caddyfile`; no service worker, 10.5-B1) on `index.html` → don't run 10.4 and 10.5 at the same time, or 10.5 rebases on 10.4 (keep-both `<head>` lines). 10.4's Caddyfile test must check only its two rules, so 10.5's extra lines don't break it. `tools/perf/` is shared with 10.2: 10.4's files are separate (`serveDist.cjs`, `load.cjs`); 10.2 owns `fps.cjs`.
- No migration, no netEvents kinds, no protocol bump.

## Dev Agent Record

### Agent Model Used

Claude (builder session for 10.4, gds-dev-story)

### Debug Log References

- Measures: `docs/perf/epic-10-loading.md` (raw JSON lines in the builder's scratchpad: `load-results.txt` = master + first branch run, `load-branch-final.txt` = final branch build).
- The minifier Vite exposes (oxc `minifySync`) emits ES2015+ (`catch {}`, template strings), so the inline script is the hand-written ES5 source with comments/indentation stripped (B10).

### Completion Notes List

- **10.4-Q1 = B** (designer 2026-11-27, "All ok"), title **"Hordes"** (10.5-Q2; loading screen + stills only). Options A/C removed from the code; stills of B (download + "Drawing the city…") at 844×390 and 568×320 DPR 2 in `docs/art/loading-screen/` (`stills.cjs` re-shoots them).
- **AC 1 met:** Slow 4G, 4× CPU, first visit → playable 7.5 s median, 0.87 MB (master 7.5 s, 0.87 MB). **AC 3 met:** return visit 2.3 s, all `/assets/` from the cache, `index.html` revalidated. T5 levers not needed (no change made).
- **AC 2:** the loading screen (plain HTML/CSS in `index.html` + inline 2.0 KB ES5 script `apps/client/boot/bootLoader.js`) fills from the build's first-load file list with gzip sizes (Vite plugin `bootLoaderPlugin`, B6) summed from `PerformanceObserver` resource entries, with a rate guess in between (180 KB/s until 10 % has landed, then the measured rate; capped at 98 % until the files finish; never backwards). `main.ts` signals "Drawing the city…" when its code runs and hides it two frames after the first screen change (start screen, lobby, or a `?solo` run). Browser check in every load run: visible at ~1 s, moving by 2 s, never backwards, gone after the start screen (12/12 branch runs ok). Unit tests: `tools/checks/bootLoader.test.ts`.
- **AC 4:** `tools/checks/caddyCacheHeaders.test.ts` (the Caddyfile's two rules + serveDist serving the same, doctored-file proof); CI docker smoke checks a real hashed `/assets/*.js` named in `index.html` for the immutable header. Hermes's post-deploy curl check added to `docs/hermes-go-live.md`.
- **AC 5:** `tools/checks/noEagerAudio.test.ts` (index.html + the entry's static import closure, with liveness and a doctored-input proof). No music file exists (doc says so).
- **AC 6:** `release:check` green (cheat scan covers `vendor-phaser-*`); gallery builds (no loader in it: the plugin only touches pages with the placeholder); `admin-tools-*` names unchanged; `?solo` starts in every load run; the loading screen takes no touches (`pointer-events: none`) and never waits for anything.
- **Decisions made while building:**
  - **10.4-B9:** Vite's shared app chunk keeps its own name (`consumableIcons-*`): it is app code shared with the gallery page and changes every deploy anyway; renaming it adds a rule for no gain. B5's "the name goes away" was only true for Phaser.
  - **10.4-B10:** the inline script is hand-written ES5, comment/indent-stripped by the plugin (no minifier: Vite 8's emits newer syntax). A test pins ≤ 2 KB and no ES2015 syntax.
  - **10.4-B11:** only `main.ts` signals (one call, `signalBootLoader(uiStore)`); `BootScene.ts` is untouched. The first `uiStore.set` is the first screen on every path (start, lobby, resumed seat, `?solo`/`?stress` run).
  - **10.4-B12:** "playable" in the tool = the Practice solo button visible and enabled (its handler is registered in the same Boot step); the `?solo` "run" mark is `window.__charBake` appearing (set in the Game scene's create, where the first city bake also runs), since release builds have no `__game` hook.
  - **10.4-B13:** the loading-screen bar total is the first-load JS + CSS only (0.87 MB gzip): the line reads "x / 0.9 MB", not the story's "2.0 MB" (that counted the WebP and workers, which load after the start screen).
- Not verified: a real phone on real 4G; Cloudflare edge headers (Hermes check); the resumed-seat path in a browser (needs the game server; covered by the unit test of the signal).
- sprint-status not touched (the main session owns it).

### File List

- `apps/client/index.html` (loading screen markup + CSS, script placeholder)
- `apps/client/boot/bootLoader.js` (new: the loading screen's script)
- `apps/client/vite.config.ts` (`manualChunks` → `vendor-phaser`; `bootLoaderPlugin`; `firstLoadPaths`, `loaderScript`)
- `apps/client/src/main.ts` (one import + one call)
- `apps/client/src/ui/bootLoaderSignal.ts` (new)
- `tools/perf/serveDist.cjs`, `tools/perf/load.cjs` (new)
- `tools/checks/bootLoader.test.ts`, `tools/checks/caddyCacheHeaders.test.ts`, `tools/checks/noEagerAudio.test.ts` (new)
- `.github/workflows/ci.yml` (docker smoke: immutable header on a real asset)
- `docs/perf/epic-10-loading.md` (new), `docs/hermes-go-live.md` (cache check line)
- `docs/art/loading-screen/` (new: `stills.cjs`, 4 PNG stills of B)
- `_bmad-output/implementation-artifacts/10-4-fast-loading.md`
- `tools/bots/lateJoin.test.ts` (E8-A1 repro + test-only fix of the shard-4 red, see Debug Log)
- `_bmad-output/implementation-artifacts/deferred-work.md` (the lateJoin item resolved)
- Review fixes: `tools/maps/downtown.tmj` (moved from `apps/client/public/assets/maps/`), `tools/maps/buildDowntown.ts`, `tools/maps/downtownFiles.test.ts`, `packages/shared/src/map/downtown.ts` (path only)

### Change Log

- 2026-11-27: review fixes M1, L1, N1 (see Senior Developer Review).
- 2026-11-27: Story 10.4 built: vendor-phaser chunk, loading screen B ("Hordes") with a size manifest, measuring tools, cache + eager-audio guards, CI smoke line, before/after measures.

## Senior Developer Review (AI)

**2026-11-27, light review by a fresh agent (main session relay): APPROVED with 1 medium.**

| # | Sev | Finding | Fix |
| --- | --- | --- | --- |
| M1 | medium | `bootLoaderSignal.ts`: with no `window.__bootLoader` (inline script blocked, e.g. a CSP `script-src 'self'`) the black overlay stayed forever over a working start screen (probed in Chromium). | Fallback: remove `#boot-loader` at the first screen when the inline script never ran. Unit case added (`bootLoader.test.ts` › review M1); re-probed in Chromium with `script-src 'self'` on index.html: inline script blocked, overlay gone at the start screen. |
| L1 | low | `bootLoader.js`: before 10 % landed the bar follows the 180 KB/s guess, so on a slow line the text could read "0.9 / 0.9 MB" while still downloading. | The text shows only the bytes that landed; the guess drives only the bar. Test asserts both. |
| N1 | note (pre-existing) | `apps/client/public/assets/maps/downtown.tmj` is unhashed under `/assets` (would get the 1-year immutable header); the game never fetches it (the sim imports its JSON copy). | Not unused: the map pipeline writes/reads it (`maps:build`, `maps:sync`, `downtownFiles.test.ts`). Moved out of the served folder to `tools/maps/downtown.tmj`, next to the Tiled source; three path strings updated. The build no longer ships it. |
| L2 | low | lateJoin hold ordering | Accepted as is (reviewer). |


**Re-review round 1 (2026-11-27): APPROVED**, two last changes checked by the main session (no further re-review):

| # | Sev | Finding | Fix |
| --- | --- | --- | --- |
| RR1-L1 | low | On Slow 4G the text read "Downloading… 0.0 / 0.9 MB" for ~3 s while the bar moved (looks stalled). | Plain "Downloading…" until the first file lands, then "Downloading… x / 0.9 MB" (`bootLoader.js › text`); test updated. |
| RR1-N1 | nit | `bootLoaderSignal.ts`: a script that threw partway could leave the overlay up. | After calling the script's `hide`, `#boot-loader` is always removed too (try/finally); unit case for a missing and a throwing `hide`. |
