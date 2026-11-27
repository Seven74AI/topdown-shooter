# Epic 10 · Story 10.2 frame-rate pass (headless)

## Method (10.2 B2, B3)

- Script: `tools/perf/fps.cjs` (README next to it). Playwright Chromium headless (SwiftShader: the CPU draws), viewport
  844 × 390, DPR 2, CDP `Emulation.setCPUThrottlingRate` 1× and 4×. Release build (`vite build` + `vite preview`, own
  port). Per row: page load → wait for `window.__charBake.doneMs` (9.13 steady state) → 8 s warm-up → 12 s rAF count.
- Numbers: avg FPS, **1 % low** = 1000 / 99th-percentile frame ms, frame-ms p95, JS heap, 1-min load average (mean of
  start and end). Two rounds, order reversed in round 2 (with two targets: base and branch alternate).
- Scene check per row (`window.__stress()`, the read-only probe GameScene sets under `?stress` only, release too): stage
  and darkness as asked, 150 alive, ≥ 140 in view, ≥ 60 frames at 4× (≥ 100 at 1×); a failing row is re-run once.
- Scenes (10.2 B1): **stage 1** = `?stress=150`; **wave 9** = `?stress=150&stressstage=5&blackout=10` (the decay
  engine's `changeDecayStage(world, 5)` before the Walkers spawn: fog view, power out, rubble, ash; 10 % light =
  `decay.json › blackout.lightPctByWave[8]`).
- Split of the frame (B3): `update` and `render` ms from the perf probe (`perfProbe.ts`: PRE_STEP → POST_STEP →
  POST_RENDER, CPU side); **fill** = frame − update − render (SwiftShader fill + compositing, off the main thread).
  Bottleneck: "simulation" if tick avg > 8 ms (1.11 rule), else "rendering/GPU". One CDP `Profiler` capture of the
  12 s count at 4× per scene (top self-time functions, release-minified names).
- Container: 4 cores, load 1.2–1.7 during the runs. **Not verified:** any real phone (parked, designer 2026-11-25), any
  real GPU.

## Before (2026-11-27, `story-10-2` @ c18c589 = master 2338209 + the scene switch and D6 only; no render change)

| scene | CPU | DPR | avg FPS (r1 / r2) | 1 % low | p95 ms | update ms | render ms | fill ms | tick ms | bottleneck | heap | load |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| stage 1 | 1× | 2 | 17.5 / 18.5 | 12 / 15 | 66.7 | 1.6 / 1.2 | 1.0 / 0.7 | 54 / 52 | 0.6 | rendering/GPU | 58–65 MB | 1.2–1.5 |
| wave 9 | 1× | 2 | 11.7 / 13.0 | 8.6 / 10 | 100 / 83 | 12.1 / 9.0 | 1.5 / 1.8 | 72 / 66 | 0.7 | rendering/GPU | 61–65 MB | 1.2–1.4 |
| stage 1 | 4× | 2 | 12.8 / 12.8 | 10 / 10 | 100 | 8.6 / 7.7 | 4.7 / 4.8 | 65 / 65 | 2.8 | rendering/GPU | 54–65 MB | 1.6 |
| **wave 9** | **4×** | **2** | **7.4 / 7.5** | 6.0 / 5.5 | 167 / 150 | **41.3 / 41.7** | 7.6 / 7.5 | 87 / 84 | 2.6 | rendering/GPU | 51–82 MB | 1.7 |

(The story's dev-build table, one round: 15.9 / 11.3 / 10.2 / 6.9. The release build is ~10 % faster.)

### Profile at 4× (12 s count, self time on the main thread)

| stage 1 | ms | % | | wave 9 | ms | % |
| --- | --- | --- | --- | --- | --- | --- |
| (program: idle / waiting on the GPU process) | 10435 | 82.5 | | (program) | 7840 | 61.5 |
| Phaser batch (`qv`, `SD`, `uD`) | 534 | 4.2 | | **`texImage2D` (darkness texture upload)** | **1500** | **11.8** |
| `willRender` / `render` | 250 | 2.0 | | **`drawImage` (darkness canvas paint: stamps + fog)** | **1235** | **9.7** |
| GameScene `update` | 102 | 0.8 | | Phaser batch (`qv`, `SD`) | 479 | 3.8 |
| `texImage2D` | 70 | 0.6 | | `willRender`, `update`, `run` | 352 | 2.8 |

**Bottleneck named:** both scenes are rendering/GPU (tick ≤ 3 ms). Stage 1 is pure fill (the main thread is idle 82 %).
Wave 9 adds ~33 ms of main-thread work per frame at 4×, and ~21 % of the main thread is the **darkness canvas**: its
2D paint (fill + light stamps + the Collapse fog painted into it) and its full re-upload every frame
(`DarknessView.update`), plus one more full-screen layer for SwiftShader to fill (fill 85 vs 65 ms).

## Optimizations tried (A/B)

(T3: after the designer's 10.2-Q1.)

## After

(T3/T4.)
