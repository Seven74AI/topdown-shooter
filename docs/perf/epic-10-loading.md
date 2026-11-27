# Epic 10: loading (Story 10.4)

Measured 2026-11-27 with `tools/perf/load.cjs` (headless Chromium, 844 × 390 DPR 2, CDP network + CPU throttling) on
the release build served like production by `tools/perf/serveDist.cjs` (the Caddyfile's cache rules + gzip). Three runs
per row, median shown. "Playable" (10.4-B1) = the start screen's Practice solo button is on screen and enabled; each
first-visit run then taps it and checks that the Game scene starts (liveness). Machine: 4-core cloud container, load
average 0.9–1.9 during the runs (only the measurement running).

- **Slow 4G** (judged): 562.5 ms latency, 1.44 Mbps down, 675 kbps up (DevTools "Slow 4G", the 9.14 profile).
- **Fast 4G** (recorded): 165 ms, 9 Mbps down, 1.8 Mbps up.
- **first** = new browser context (empty cache). **return** = new page in the same context (warm HTTP cache).
- **?solo** = `?solo` link in a new context: → the Game scene running (its `create` bakes the first city), → the
  character bake done (`window.__charBake.doneMs`). Recorded, not gated.

## Results

| build | network | CPU | first → playable (ms) | bytes (MB) | return → playable (ms) | return: /assets/ from | ?solo → run (ms) | ?solo → characters baked (ms) | ?solo bytes (MB) | loading screen |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| master `2338209` | Slow 4G | 4× | 7451 | 0.87 | 2225 | 6 cache / 0 net | 17406 | 24039 | 1.44 | none (black) |
| master | Slow 4G | 1× | 6758 | 0.87 | 1447 | 6 cache / 0 net | 9067 | 13589 | 1.44 | none |
| master | Fast 4G | 4× | 2730 | 1.41 | 1804 | 6 cache / 0 net | 12311 | 18829 | 1.44 | none |
| master | Fast 4G | 1× | 1948 | 0.87 | 1023 | 6 cache / 0 net | 4356 | 8852 | 1.44 | none |
| **branch `story-10-4`** | **Slow 4G** | **4×** | **7492** | **0.87** | **2308** | 7 cache / 0 net | 17330 | 24168 | 1.44 | ok |
| branch | Slow 4G | 1× | 6791 | 0.87 | 1402 | 7 cache / 0 net | 9263 | 13857 | 1.44 | ok |
| branch | Fast 4G | 4× | 2832 | 1.42 | 1887 | 7 cache / 0 net | 12141 | 18648 | 1.44 | ok |
| branch | Fast 4G | 1× | 1913 | 0.87 | 1000 | 7 cache / 0 net | 4199 | 8585 | 1.44 | ok |

- **AC 1 (first visit < 10 s, < 15 MB): met.** Slow 4G, 4× CPU: 7.5 s, 0.87 MB. (Fast 4G at 4× CPU: 1.42 MB because the
  street-props image (0.54 MB, started by Boot, nothing waits for it) finishes before the slower CPU reaches the start
  screen; it doesn't delay "playable".)
- **AC 3 (return visit < 3 s): met.** 2.3 s; every `/assets/` file from the HTTP cache, `index.html` revalidated (227 B
  answer). T5's levers (shorter title wait, earlier bake worker, deferring `urlOptions`) were not needed: no change.
- **AC 2 (loading screen):** every branch first visit: visible at ~1 s (first sample 0.2 s on Fast 4G, 0.6 s on Slow 4G
  = when the HTML lands), moving by 2 s, never backwards, gone right after the start screen mounted (within one frame or
  two of "playable"). Master: black until the JS ran.
- The loading screen doesn't make anything faster (same files, same bytes: the times match master within noise); it
  turns ~6 s of black into a title, a bar and "Downloading… x / 0.9 MB", then "Drawing the city…".
- `?solo` → run at Slow 4G 4× comes ~10 s after "playable" on the start-screen path: the 500 ms title, then the Game
  scene's create (city bake, character bake setup, HUD) on a CPU slowed 4×; at 1× the gap is ~2.5 s. Not gated (B1);
  recorded for 10.2 / 10.9.

## What loads (first visit, branch release build)

| file | raw | gzip | |
| --- | --- | --- | --- |
| `index.html` (with the loading screen: inline CSS + a 2.0 KB ES5 script + the file list) | 4.3 KB | 1.9 KB | `no-cache`, revalidated |
| `assets/main-*.js` (entry) | 721 KB | 237 KB | immutable |
| `assets/vendor-phaser-*.js` (**new**: Phaser alone, 10.4-B5) | 1 367 KB | 355 KB | immutable, survives deploys that don't change Phaser |
| `assets/consumableIcons-*.js` (Vite's chunk of app code shared with the gallery page; name is Vite's pick) | 832 KB | 258 KB | immutable |
| `assets/urlOptions-*.js` | 11 KB | 4 KB | immutable |
| CSS (2 files) | 56 KB | 12 KB | immutable |
| Oswald woff2 subsets (the ones the page uses) | ~25 KB | — | immutable |
| after the start screen / in a run: street-props WebP 544 KB, bake workers 396 KB, `connection-*.js` 182 KB (online only) | | | immutable |

Total before "playable": **0.87 MB over the wire**, far under the 15 MB budget (NFR6).

**Vendor chunk (B5):** before, Phaser sat inside Vite's shared chunk (`consumableIcons-*`, 617 KB gzip), whose hash
changes with any app-code change, so every deploy made a returning phone fetch Phaser again. Now a deploy that doesn't
change Phaser re-downloads ~0.51 MB (`main` + the shared app chunk + CSS) instead of ~0.87 MB on the next visit.

## Music (AC 5)

No music file exists: all sound is synthesized at run time (`audio/ambience.ts`, `audio/placeholderSfx.ts`). The guard
`tools/checks/noEagerAudio.test.ts` fails if an audio file is named in `index.html` or in any module the entry loads
statically; a later music track lives in a module loaded with `import()` and is fetched after the start screen.

## Cache headers (AC 4)

`tools/checks/caddyCacheHeaders.test.ts` checks the Caddyfile's two rules (`/assets/*` immutable for a year only on
existing files, no fallback; everything else `no-cache`) and that `serveDist.cjs` serves the same; CI's docker smoke
fetches a real hashed file named in `index.html` and checks `public, max-age=31536000, immutable`.

## Not verified

- A real phone on a real 4G network (phones parked, designer 2026-11-25): Slow 4G is CDP throttling in headless Chromium.
- Cloudflare's edge caching in front of Caddy: Hermes's check after each deploy (`docs/hermes-go-live.md` › Every later release).
- The resumed-seat path (a reload mid-run) in a browser: the loading screen hides at the first screen change, which that
  path makes too (unit test `tools/checks/bootLoader.test.ts`); not driven end to end here (needs the game server).

## Re-run

```
cd apps/client && npx vite build && cd ../..
node tools/perf/load.cjs --label branch            # --dir <dist> for another build, --runs, --profiles slow4g,fast4g, --cpu 4,1
node docs/art/loading-screen/stills.cjs docs/art/loading-screen   # the designer's stills (B, 844×390 and 568×320, DPR 2)
```
