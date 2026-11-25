# Epic 9 photoreal characters: frame rate, bake time, main thread (Story 9.13)

Story 9.13 draws the survivors and zombies with take 4's relit look (grey see-through outline kept), baked at load in
a Web Worker into small per-look sheets, and animated with capped, pooled layers: the nearest 16 zombies crossfade
their walk loop and pulse their glow, the nearest 8 of those also get the drifting sheen, up to 6 Bloaters show their
veins and acid sacs, up to 8 Spitters drip; every zombie breathes and sways (`controls.fx`: `maxCharacterAnim` 16,
`maxCharacterSheen` 8, `maxBloaterFx` 6, `maxSpitterDrips` 8; `?fx=low` halves them).

## Method

As `epic-7-looks.md`: solo dev build (Vite) on this builder's own port, `?stress=150` (150 Walkers in view, god
mode, waves paused), Playwright Chromium (headless, CPU renderer: SwiftShader) at 844 × 390, DPR 2; CPU throttle via
CDP `Emulation.setCPUThrottlingRate` (1× and 4×, the Mi 11i stand-in); 8 s warm-up, then a 12 s
`requestAnimationFrame` count; frame ms p95 from the same frames; load = 1-min load average (mean of start and end),
4 cores. "master" is `origin/master` 2a88929 served from its own worktree on another port. Two rounds, the order
reversed in round 2. Compare the columns, not the absolute numbers (headless CPU rendering).

`?stress=150` has no build phase, so the character bake (done ~8 s after the start at 1×, ~16 s at 4×) would overlap
the 8 s warm-up and the count; in headless the bake worker then competes with the CPU renderer. The AC 4 table is the
**steady state**: the branch's 8 s warm-up starts when the last relit picture has landed (`window.__charBake.doneMs`);
master is warmed for the same session age (8 s at 1×, 16 s at 4×, plus the 8 s). The overlapped run is listed below
it. p95 is quantized by the 60 Hz `requestAnimationFrame` clock (50.0 / 66.7 / 83.3 / 100 / 116.7 ms): "+1 ms" means
the same bucket.

## Frame rate (AC 4)

2026-11-25, branch `story-9-13`, caps 16 / 8:

| configuration | round 1 FPS (load) | round 2 FPS (load) | mean FPS | vs. master | p95 ms (r1 / r2) | vs. master |
| --- | --- | --- | --- | --- | --- | --- |
| master, 1× | 18.1 (0.74) | 19.4 (1.36) | 18.8 | — | 66.7 / 66.7 | — |
| branch, 1× | 16.9 (0.93) | 17.7 (1.46) | 17.3 | **−1.5** | 66.8 / 66.7 | **+0.1** |
| master, 4× CPU | 12.4 (1.27) | 13.1 (1.67) | 12.8 | — | 100 / 100 | — |
| branch, 4× CPU | 12.4 (1.54) | 12.6 (1.48) | 12.5 | **−0.3** | 100 / 100 | **0** |

Within AC 4 (≤ 2 FPS, ≤ +1 ms p95) at both throttles. **All six 1× steady-state runs of the shipped caps together**
(the table above plus the two earlier pairs below): master 19.9 FPS, branch 18.1 FPS (**−1.8**); p95 66.7 ms in every
branch run and in five of six master runs (one 50.1). All four 4× runs: master 13.3, branch 13.0 (−0.3), p95 equal.
The margin at 1× is thin: one pair of the three came out at −2.8 (a 16.5 FPS branch run).

Run-to-run noise on this box is about ±2 FPS (the same configuration gave 16.5–19.6 FPS at 1× across runs), so the
caps were chosen on several runs, not one:

| caps (anim / sheen), steady state | 1× FPS vs. master | 1× p95 | 4× FPS vs. master | 4× p95 |
| --- | --- | --- | --- | --- |
| 0 / 0 (breathing and stepped walk only) | +2.0 (1 round) | 50.1 vs 66.7 | — | — |
| 40 / 40, full-step crossfade (first try) | −2.5 (1 round, overlapped) | 83.3 vs 66.7 | — | — |
| 24 / 12, full-step crossfade | −2.2 (1 round) | equal | — | — |
| 20 / 10, half-step crossfade (B19) | −0.4 (2 rounds) / −0.3 (2 rounds) | equal | −1.5 (2 rounds) | 100 vs 100, **116.7 vs 100** |
| **16 / 8, half-step crossfade (shipped)** | −1.1 / −2.8 / −1.5 (3 × 2 rounds; one branch run at 16.5) | equal (one master run at 50.1) | −0.4 / −0.3 (2 × 2 rounds) | equal |

The bake overlapping the count (the story's 8 s warm-up from the start; caps 20 / 10, before the landing fixes):
1× 15.3 vs 18.4 FPS (p95 83.3 vs 66.7), 4× 10.7 vs 12.3 FPS (p95 116.7 vs 100) — the worker and the landings
during the first ~8 s (1×) / ~16 s (4×); in a real run they fall in the first build phase.

Steady-state profile (CDP Profiler, 6 s, 1×): ~95 % of the main thread's samples wait on the GPU in both master and
the branch; the JavaScript the story adds (`ZombieView.update`, the cap pass, the layers) is < 0.2 %. The cost of the
animated layers is draw / fill on the (software) GPU, which is why the caps, not code, set the budget.

## Bake time (AC 3)

From the sheets' creation to the last relit picture landed (`window.__charBake`: 123 frames — 8 walk loops × 10, 4
Spitter, 10 Brute, 20 Bloater pictures with their veins, 9 gun frames — plus the survivor's body), worker on,
7 repetitions, median (min–max):

| CPU | `?stress=150` (150 Walkers drawing) | load | `?stress=1` (empty street, as the first build phase) | load |
| --- | --- | --- | --- | --- |
| headless, no throttle | 7.8 s (7.3–8.2) | 1.98 | — | — |
| headless, 4× CPU throttle | 16.0 s (14.6–16.7) | 2.34 | **13.7 s (13.0–14.7)** | 1.99 |

AC 3's "within 15 s at 4× CPU (inside the first build phase)": met on an empty street (13.7 s); with 150 Walkers
drawing at the same time it takes 16 s. The same worker on an idle page bakes everything in ~2.4 s; in a running game,
headless, every canvas readback and `transferToImageBitmap` used to wait for the busy GPU process (~60 ms each, 31 s in
all) until the worker reused its canvases and posted pixels instead (B17).

## Main thread (AC 3)

The longest pump of the bake per frame (taking in the worker's pictures, writing them into their sheet, at most one
sheet upload per frame), `window.__charBake.maxPumpMs`, 7 repetitions, median (min–max):

| CPU | `?stress=150` | `?stress=1` |
| --- | --- | --- |
| headless, no throttle | **4.0 ms (2.8–6.4)** | — |
| headless, 4× CPU throttle | 14.7 ms (10.5–26.1) | 13.2 ms (10.2–15.2) |

AC 3's ≤ 6 ms at 1×: met at the median and in 6 of 7 runs (one 6.4 ms outlier: a sheet upload). The perf runs above
logged 4.4 and 5.5 ms. At 4× the main thread's share is the sheet uploads (≤ 254 k px each) and the pixel writes; 9.11's
building bake measured 3.6 ms (1×) / 16.5 ms (4×) the same way.

## Not verified here

- The Xiaomi Mi 11i itself (frame rate, bake time, main-thread hitches) — the designer's check; headless renders on
  the CPU, so on a phone the GPU work moves off the CPU and the bake competes less.
- iOS Safari: OffscreenCanvas in workers (Safari ≥ 16.4) and `OffscreenCanvasRenderingContext2D.reset()` (canvas
  pooling falls back to a new canvas per use without it); the main-thread sliced fallback is covered by tests only.
- Online (the networked host): the views are the same; not measured separately.
