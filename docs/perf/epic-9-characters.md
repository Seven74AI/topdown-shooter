# Epic 9 photoreal characters: frame rate, bake time, main thread (Story 9.13)

Story 9.13 draws the survivors and zombies with take 4's relit look (grey see-through outline kept), baked at load in
a Web Worker into small per-look sheets, and animated with capped, pooled layers: the nearest 12 zombies crossfade
their walk loop and pulse their glow, the nearest 6 of those also get the drifting sheen, up to 6 Bloaters show their
veins and acid sacs, up to 8 Spitters drip; every zombie breathes and sways (`controls.fx`: `maxCharacterAnim` 12,
`maxCharacterSheen` 6, `maxBloaterFx` 6, `maxSpitterDrips` 8; `?fx=low` halves them). Caps were 16 / 8 until the
review's re-run (D1, below) showed the 4× p95 one bucket up at steady state.

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

## Frame rate (AC 4) — after the review (head of the review fixes), shipped caps 12 / 6

**Steady state** (8 s warm-up after the bake landed; master warmed for the same session age), two rounds:

| configuration | FPS (r1 / r2) | mean | vs. master | p95 ms (r1 / r2) | vs. master | draw calls / frame |
| --- | --- | --- | --- | --- | --- | --- |
| master, 1× | 18.9 / 19.9 | 19.4 | — | 66.7 / 66.7 | — | 9 |
| branch 12 / 6, 1× | 18.7 / 18.9 | 18.8 | **−0.6** | 66.7 / 66.7 | **0** | 14.1 |
| master, 4× | 13.7 / 16.8 | 15.3 | — | 100 / 83.3 | — | 9 |
| branch 12 / 6, 4× | 13.9 / 14.7 | 14.3 | **−1.0** | 83.4 / 83.4 | **≤ 0** | 14.1 |

**Overlapped (the 7.9 method: 8 s warm-up from the start, so the bake runs during the warm-up and count)**, D1:

| configuration | FPS (r1 / r2) | mean | vs. master | p95 ms (r1 / r2) | vs. master |
| --- | --- | --- | --- | --- | --- |
| master, 1× | 19.8 / 19.0 | 19.4 | — | 66.6 / 66.7 | — |
| branch 12 / 6, 1× | 20.8 / 20.6 | 20.7 | +1.3 | 66.5 / 66.6 | 0 |
| master, 4× | 15.8 / 14.9 | 15.4 | — | 83.4 / 83.4 | — |
| branch 12 / 6, 4× | 15.3 / 14.3 | 14.8 | −0.6 | 83.3 / **99.9** | +16.6 in round 2 |
| branch 16 / 8, 1× (before the cut) | 17.8 / 19.0 | 18.4 vs 19.0 | −0.6 | 66.8 / 66.7 | 0 |
| branch 16 / 8, 4× (before the cut) | 14.3 / 12.1 | 13.2 vs 13.4 | −0.2 | 99.9 / 100.1 vs 83.4 / 100.1 | +8.2 mean |

Steady state is within AC 4 at both throttles with 12 / 6. The only over-budget figure is the 4× p95 of one
overlapped round, i.e. while the bake is still landing (it ends ~14 s after the start at 4×); the orchestrator's D1
accepts that window as B24 (in a real run the bake falls in the first build phase). The 16 / 8 steady-state re-run
that triggered the cut: 1× 16.9 vs 17.9 (−1.0, p95 equal), 4× 12.7 vs 14.4 (−1.7, p95 100 vs 83.4 in both rounds).

## Frame rate (AC 4) — before the review, caps 16 / 8


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

### Cost per layer and draw calls (orchestrator follow-up)

1× steady state, two rounds each, one layer hidden at a time (a temporary switch, not shipped); draw calls counted by
wrapping `drawElements` / `drawArrays` (all WebGL draws of the frame, the whole scene):

| configuration | FPS (r1 / r2) | mean | p95 ms | draw calls per frame |
| --- | --- | --- | --- | --- |
| master | 17.6 / 21.3 | 19.5 | 66.7 / 66.6 | 9 |
| branch, everything on (16 / 8) | 20.9 / 19.5 | 20.2 | 50.1 / 66.7 | 14.1 |
| branch, crossfade top hidden | 20.5 / 18.7 | 19.6 | 66.7 / 66.7 | 14.1 |
| branch, sheen hidden | 20.3 / 19.1 | 19.7 | 66.7 / 66.7 | 13.1 |
| branch, top and sheen hidden | 19.7 / 20.8 | 20.3 | 66.7 / 50.1 | 13.1 |

The layers batch: the 150 zombies on their per-look sheets plus the crossfade tops (same sheets, normal blend) cost +4
draw calls over master's one atlas, the additive band (sheen, glow) +1. With these caps no layer's cost stands out of
the ±2 FPS noise; the caps stay at 16 / 8 because 20 / 10 put the 4× p95 one bucket up in one of two rounds (above).

Steady-state profile (CDP Profiler, 6 s, 1×): ~95 % of the main thread's samples wait on the GPU in both master and
the branch; the JavaScript the story adds (`ZombieView.update`, the cap pass, the layers) is < 0.2 %. The cost of the
animated layers is draw / fill on the (software) GPU, which is why the caps, not code, set the budget.

## Memory and the setup (review M3)

Measured in the page after the bake (`window.__charBake`; heap with `--enable-precise-memory-info`, after a GC), 3 runs:

| | before the review fix | after (B26) |
| --- | --- | --- |
| kept pictures (JS heap, ImageData) | 19.9 MB (base + glow + sheen + veins) | **7.8 MB** (base + glow; sheen and veins re-baked after a lost context) |
| character sheets (CPU-backed canvases; the GPU holds the same again as textures) | 24.9 MB | 24.9 MB |
| JS heap, whole game, `?stress=150` | 105–108 MB (master 72.5) | 83–111 MB (GC timing varies) |
| `ensureCharacterSheets` synchronous part, 1× | 51–59 ms (one task) | **0.8–3.7 ms**, then the sheets in 5–6 chunks of ≤ 13–15 ms (≤ 12 ms budget + the last sheet) |
| same, 4× CPU | 224–297 ms (one task) | 4–17 ms, then 13–16 chunks of ≤ 22–28 ms |

The sheets are made before any picture lands (the worker's pictures wait meanwhile), so a frame never pays for a
sheet and a landing together; a view that needs a sheet earlier makes it on demand (one sheet, ~2–7 ms).

## Bake time (AC 3)

From the sheets' creation to the last relit picture landed (`window.__charBake`: 123 frames — 8 walk loops × 10, 9 gun
frames, 4 Spitter, 10 Brute, 20 Bloater pictures with their veins — plus the survivor's body), worker on, 7
repetitions, median (min–max). B25 orders the queue for the first build phase: Walkers, the gun frames (the bodies
jump the queue on their own), Runners, Crawlers, then the later waves' Spitters, Brutes, Bloaters; "wave-1 set" = every
Walker walk picture and every gun frame relit.

| CPU | wave-1 set done | all done | load |
| --- | --- | --- | --- |
| headless, no throttle, `?stress=150` (final build) | 3.8 s (3.7–4.1) | 7.0 s (6.7–7.3) | 1.20 |
| headless, 4× CPU, `?stress=150` (final build) | 9.6 s (9.1–10.2) | **13.7 s (12.9–14.3)** | 1.65 |
| headless, 4× CPU, `?stress=150` (before the review fixes) | 9.8 s (9.4–10.5) | 13.9 s (13.6–14.6) | 1.82 |
| headless, 4× CPU, `?stress=1` (empty street; before B25) | — | 13.7 s (13.0–14.7) | 1.99 |

AC 3's "within 15 s at 4× CPU": met, with 150 Walkers drawing at the same time (before B25 and the last landing fixes
it was 16.0 s, 14.6–16.7). The same worker on an idle page bakes everything in ~2.4 s; in a running game, headless,
every canvas readback and `transferToImageBitmap` used to wait for the busy GPU process (~60 ms each, 31 s in all)
until the worker reused its canvases and posted pixels instead (B17).

## Main thread (AC 3)

The longest pump of the bake per frame (taking in the worker's pictures, writing them into their sheet, at most one
GPU upload per frame), `window.__charBake.maxPumpMs`, 7 repetitions, median (min–max), final build; the sheets'
setup chunks are listed apart (above):

| CPU | `?stress=150` |
| --- | --- |
| headless, no throttle | **3.6 ms (2.3–5.7)** |
| headless, 4× CPU throttle | 10.5 ms (8.1–15.1) |

AC 3's ≤ 6 ms at 1×: met in all 7 runs. Before the review fixes: 3.1 ms (2.6–5.9) at 1×, 13.3 ms at 4×, with the
51–59 ms setup task. 9.11's building bake measured 3.6 ms (1×) / 16.5 ms (4×) the same way.

## Not verified here

- The Xiaomi Mi 11i itself (frame rate, bake time, main-thread hitches) — the designer's check; headless renders on
  the CPU, so on a phone the GPU work moves off the CPU and the bake competes less.
- iOS Safari: OffscreenCanvas in workers (Safari ≥ 16.4) and `OffscreenCanvasRenderingContext2D.reset()` (canvas
  pooling falls back to a new canvas per use without it); the main-thread sliced fallback is covered by tests only.
- Online (the networked host): the views are the same; not measured separately.
