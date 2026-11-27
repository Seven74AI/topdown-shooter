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

## Before (2026-11-27, first round, `story-10-2` @ c18c589 = master 2338209 + the scene switch and D6 only)

> These rows were measured before 10.2-B7 pinned the scene's fog style. Each load picked a random Collapse style
> (CO1 haze, CO2 fog bank, CO4 flood; only CO2 has the drifting noise), so wave 9 read 7.4 / 7.5 here. The designer's
> 10.2-Q1 target "≥ 9.3" is +25 % of that 7.4. With CO2 pinned (the worst case), the same tree reads 6.5–7.0
> (below), so +25 % of the pinned baseline is ≥ 8.3. Both are reported.

| scene | CPU | DPR | avg FPS (r1 / r2) | 1 % low | p95 ms | update ms | render ms | fill ms | tick ms | bottleneck | heap | load |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| stage 1 | 1× | 2 | 17.5 / 18.5 | 12 / 15 | 66.7 | 1.6 / 1.2 | 1.0 / 0.7 | 54 / 52 | 0.6 | rendering/GPU | 58–65 MB | 1.2–1.5 |
| wave 9 (random style) | 1× | 2 | 11.7 / 13.0 | 8.6 / 10 | 100 / 83 | 12.1 / 9.0 | 1.5 / 1.8 | 72 / 66 | 0.7 | rendering/GPU | 61–65 MB | 1.2–1.4 |
| stage 1 | 4× | 2 | 12.8 / 12.8 | 10 / 10 | 100 | 8.6 / 7.7 | 4.7 / 4.8 | 65 / 65 | 2.8 | rendering/GPU | 54–65 MB | 1.6 |
| wave 9 (random style) | 4× | 2 | 7.4 / 7.5 | 6.0 / 5.5 | 167 / 150 | 41.3 / 41.7 | 7.6 / 7.5 | 87 / 84 | 2.6 | rendering/GPU | 51–82 MB | 1.7 |

### Profile at 4× before (12 s count, self time on the main thread; wave 9 with CO2 pinned, from the final run)

| stage 1 | ms | % | | wave 9 | ms | % |
| --- | --- | --- | --- | --- | --- | --- |
| (program: idle / waiting on the GPU process) | 10337 | 82.3 | | (program) | 7000 | 54.5 |
| Phaser batch | 494 | 4.0 | | **`drawImage` (darkness canvas paint: stamps, fog ring, fog canvas → darkness)** | **2342** | **18.2** |
| `willRender` / `render` | 280 | 2.2 | | **`texImage2D` (darkness texture upload, every frame)** | **1372** | **10.7** |
| GameScene `update` | 92 | 0.7 | | Phaser batch | 450 | 3.5 |
| `texImage2D` | 73 | 0.6 | | `willRender`, `run`, `update` | 316 | 2.5 |

An unminified dev-build profile of the same scene names the same two: `drawImage` 15.8 %, `texImage2D` 11.5 %. The
simulation's top function, `flowField.settleOne`, is 2.7 %.

**Bottleneck named:** every row is rendering/GPU (tick ≤ 3 ms, the 1.11 rule). Stage 1 is pure fill (82 % idle main
thread). In wave 9 the main thread spends ~45 ms per frame at 4× painting the blackout darkness canvas (with the fog
painted into it) and re-uploading it every frame; then SwiftShader fills one more full-screen layer.

## Optimizations tried (A/B, wave 9 at 4× DPR 2, release builds, own ports)

| # | lever | A/B (avg FPS, base → lever) | kept? | why |
| --- | --- | --- | --- | --- |
| A1 | skip the darkness **paint** (upload only), probe | 7.0 → 9.0 | probe | measures the paint: ~2 FPS |
| A2 | skip the **upload** (paint only), probe | 7.0 → 7.8 | probe | the upload alone is smaller |
| A3 | paint + upload **once** (a static darkness), probe | 7.0 → 9.7 | probe | the ceiling of any 2D-canvas lever. A "skip when nothing moved" rule would only reach it on a still screen: the fog noise drifts every frame and the camera follows the survivor. Not built (it would flatter the benchmark only) |
| L1 | one-pass fill (`copy` instead of clear + fill); fog mask drawn in its colour (no `source-in` pass) | 6.5 → 6.7 / 6.8 | yes | exact same pixels (checked in Chromium: `copy` clears outside the source), two full passes less, also kept for the 2D fallback |
| L2 | fog noise tile pre-scaled to its on-screen size (translate-only pattern fills) | 6.5 → 7.1 / 6.6 | yes (2D fallback) | within noise; same look; it is the 2D fallback's path |
| L3 | darkness canvas at 0.4 / 0.35 of the game canvas (instead of 0.5) | void, see note | no | the first try's port reuse measured the wrong build (note below). Not re-run: the GPU path made it moot, and it softens the light edges |
| **B8** | **darkness + fog drawn on the GPU** (Phaser `DynamicTexture`: `fill`, `stamp` with ERASE for every cut-out, the fog built in its own layer and drawn in at its alpha; no 2D paint, no `texImage2D`) | 6.8 / 7.0 → **8.6 / 8.9** (+27 %) | **yes** | same drawing, one GPU command per 2D call (unit test `darknessGl.test.ts` checks place, scale, turn, alpha per cut-out). Brightened stills: region means within 0.1–0.7 / 255 of the 2D frame. Update ms 55 → 13 |
| **B9** | the GPU fog layer at half the darkness layer's size (stretched back) | 8.6 / 8.9 → **9.4 / 9.0** | **yes** | the fog is a soft ring + soft noise: identical in brightened stills; its GPU fill was the new cost (fill 98 → 85 ms) |

Note: while exploring, two A/B rounds measured the wrong build. `kill` of the `npx` wrapper PID left the `vite preview`
child holding the port, and the next `--strictPort` server failed silently. Both rounds are discarded. The serving
helper now refuses a busy port and checks the served bundle hash before every run.

## After (2026-11-27, release builds, before = `story-10-2` @ cba43a3: master + the scene switch, D6 and B7 pinning, no render change, built before the 10.4 merge; after = branch @ dd00c06, which has 10.4 merged)

| scene | CPU | DPR / Resolution | before avg FPS (r1 / r2) | after avg FPS (r1 / r2) | before 1 % low | after 1 % low | before p95 | after p95 | after update / render / fill ms | bottleneck | load |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| stage 1 | 1× | 2 Sharp | 18.0 / 18.6 | 18.0 / 18.7 | 15 | 15 | 66.7 | 66.7 | 1.5 / 0.9 / 52 | rendering/GPU | 1.3–1.5 |
| wave 9 | 1× | 2 Sharp | 12.9 / 12.4 | 12.4 / 12.7 | 10 | 10 | 83.4 | 83.4 | 2.4 / 1.5 / 76 | rendering/GPU | 1.2–1.8 |
| stage 1 | 4× | 2 Sharp | 12.5 / 13.1 | 13.1 / 13.0 | 10 | 10 | 100 | 100 | 7.4 / 3.9 / 65 | rendering/GPU | 1.6–1.9 |
| **wave 9** | **4×** | **2 Sharp** | **6.7 / 6.5** | **8.8 / 9.4** | 5 | 6 / 6.7 | 167 / 183 | 133 | 13.7 / 7.8 / 89 | rendering/GPU | 1.7–2.0 |
| stage 1 | 1× | Balanced (1.5) | — | 30.3 / 32.0 | — | 20 | — | 33.5 | 0.9 / 0.7 / 31 | rendering/GPU | 1.8 |
| wave 9 | 1× | Balanced | — | 20.7 / 21.8 | — | 15 | — | 66.6 / 50.1 | 1.6 / 1.2 / 44 | rendering/GPU | 1.7–1.9 |
| stage 1 | 4× | Balanced | — | 20.2 / 20.6 | — | 15 | — | 66.7 | 5.9 / 4.6 / 39 | rendering/GPU | 1.5–2.0 |
| wave 9 | 4× | Balanced | — | 13.5 / 14.4 | — | 10 | — | 99.9 / 83.4 | 10 / 6.8 / 55 | rendering/GPU | 1.5–1.9 |
| stage 1 | 1× | Fast (1) | — | 59.4 / 59.6 | — | 59.5 | — | 16.7 | 0.5 / 0.6 / 16 | (vsync) | 1.6–1.7 |
| wave 9 | 1× | Fast | — | 39.1 / 41.2 | — | 29.9 | — | 33.4 | 1.1 / 1.2 / 23 | rendering/GPU | 1.5–1.7 |
| stage 1 | 4× | Fast | — | 41.8 / 42.6 | — | 29.9 | — | 33.4 | 2.5 / 2.8 / 18 | rendering/GPU | 1.7–2.0 |
| wave 9 | 4× | Fast | — | 25.6 / 26.1 | — | 20 / 15 | — | 50 | 6.2 / 6.2 / 26 | rendering/GPU | 1.8–1.9 |

Every row: 150 alive, ≥ 140 in view (150 in every row), the stage and darkness asked for, enough frames, canvas width
1688 / 1266 / 844 px for Sharp / Balanced / Fast (checked per row). Heap 45–82 MB in every row, before and after.

**Target (10.2-Q1 A):** wave 9 at 4× DPR 2 goes from 6.6 to **9.1** (mean of the rounds, **+38 %**). The 1 % low goes
from 5 to 6–6.7 and the p95 from 167–183 ms to 133 ms. Against the first round's random-style 7.4 (the designer's
"≥ 9.3"): 8.8 / 9.4, so one round over and one under. No other row is worse by more than 0.5 FPS. The default look is
unchanged: compare `img/epic10-stage1-{before,after}.png`, `img/epic10-wave9-{before,after}.png`, and the 3×
brightened side-by-side `img/epic10-wave9-before-after-x3.png`. The parked car on the left differs only because each
load's run seed picks different street variants.

**After profile, wave 9 at 4×:** `drawImage` and `texImage2D` (18.2 % + 10.7 % before) are gone from the top 10
(`texImage2D` 0.7 %, the usual uploads). The main thread is idle 78 % of the time: the frame is SwiftShader fill now,
like stage 1.

**Resolution (10.2-Q2 A):** Balanced roughly doubles every row at 4× (wave 9: 9.1 → 14), Fast roughly triples it
(wave 9: 26). Live change checked in a browser: in a solo run, ☰ → Settings → Resolution Balanced → Fast → Sharp
re-sizes the canvas each time (1688 → 1266 → 844 → 1688 px wide, CSS 844 × 390 kept). There was one page load (no
reload) and no page errors. The HUD keeps its CSS size and places (`img/epic10-resolution-{sharp,balanced,fast}.jpg`,
DPR 2).

**Not verified:** any real phone (parked, designer 2026-11-25), any real GPU. On a real phone the old path's per-frame
canvas → texture upload is also a known cost, so B8 should help there too; that is not measured.
