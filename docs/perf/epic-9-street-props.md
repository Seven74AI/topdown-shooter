# Epic 9 photoreal street props: frame rate, city bake, download (Story 9.14)

Story 9.14 draws Downtown's cars, burnt cars, bus, dumpster, pump, block, sandbags and concrete barrier from a
pre-rendered image atlas (`apps/client/src/render/city/streetProps.webp`, made by `npm run art:street-props`) and
stands the sawhorse police lines up as pooled sprites (5 + 2 front pieces and drums on the lot line, 5 + 2 side
pieces and drums on the gas line: 14 sprites at stage 2–4). The street props are still baked into the ground tile,
so the per-frame cost is only the 14 police sprites and their silhouettes.

## Method

As `epic-9-characters.md` (from `epic-7-looks.md`). Solo dev build (Vite) on this builder's own port (branch :5311,
master `origin/master` 8d4380e from its own worktree on :5312). `?stress=150` (150 Walkers in view, god mode, waves
paused). Playwright Chromium (headless, SwiftShader) at 844 × 390, DPR 2. CPU throttle via CDP
`Emulation.setCPUThrottlingRate` at 1× and 4×. 8 s warm-up, then a 12 s `requestAnimationFrame` count, with frame-ms
p95 taken from the same frames. Load = 1-min load average (mean of start and end), 4 cores. Two rounds, the order
reversed in round 2. Script: `docs/art/9-14/perf.cjs`. Compare the columns, not the absolute numbers.

`?stress=150` runs at decay stage 1, where no police line exists. Each run was therefore repeated forced to
**stage 2** (`applyDecayStage` from the page): the police lines stand on the branch (14 sprites) and lie flat in the
bake on master. p95 is quantized by the 60 Hz rAF clock (66.7 / 83.3 / 100 / 116.7 ms).

## Frame rate (AC 6), 2026-11-25

| configuration | FPS r1 (load) | FPS r2 (load) | mean | vs. master | p95 ms r1 / r2 | vs. master |
| --- | --- | --- | --- | --- | --- | --- |
| master, 1×, stage 1 | 18.1 (3.71) | 17.0 (1.89) | 17.6 | — | 66.7 / 66.7 | — |
| branch, 1×, stage 1 | 17.8 (3.05) | 17.3 (1.57) | 17.6 | **0.0** | 66.7 / 66.7 | **0** |
| master, 1×, stage 2 | 17.9 (2.35) | 18.5 (1.56) | 18.2 | — | 66.7 / 66.7 | — |
| branch, 1×, stage 2 (14 police sprites) | 19.1 (1.96) | 17.6 (1.66) | 18.4 | **+0.2** | 66.7 / 66.7 | **0** |
| master, 4×, stage 1 | 12.3 (1.85) | 11.6 (1.60) | 12.0 | — | 100 / 116.7 | — |
| branch, 4×, stage 1 | 12.2 (1.62) | 11.2 (1.62) | 11.7 | **−0.3** | 100 / 100.1 | **≤ 0** |
| master, 4×, stage 2 | 12.7 (1.48) | 11.6 (2.44) | 12.2 | — | 100 / 116.6 | — |
| branch, 4×, stage 2 (14 police sprites) | 15.3 (1.75) | 11.8 (1.64) | 13.6 | +1.4 | 83.3 / 116.5 | ≤ 0 |

Within AC 6 (≤ 2 FPS, ≤ +1 ms p95, same bucket) at both throttles and both stages. Run-to-run noise on this box is
about ±2 FPS. Nothing is allocated per frame: the police sprites are placed once per bake (`PoliceLineView.show`),
and the silhouette list is joined into a reused array (`GameScene.joinWalls`). These FPS runs were taken before the
shadow-stamp cache below, which only changes bake code, never per-frame code.

## City bake (ms per stage change, `CityView.bakeMs`)

`?solo&startwave=1`, then stages 2 → 3 → 4 → 1 applied in the page, one bake each. 844 × 390 DPR 2, Downtown's single
2016 × 1344 tile.

First try (picture-shaped shadows drawn with canvas blur on every bake): 1× 60–144 ms vs master 39–82, 4× 296–489
vs 198–356. Too slow. The shadows are now cached as one blurred stamp per picture, facing, box and bake density
(`drawCity.ts › frameShadow`, dropped with the pattern tiles after a lost context). A stage change only copies them.
After that fix:

| tree | throttle | round 1 (2 / 3 / 4 / 1) | round 2 (2 / 3 / 4 / 1) | mean |
| --- | --- | --- | --- | --- |
| master | 1× | 48 / 49 / 81 / 49 | 45 / 46 / 82 / 45 | 56 |
| branch | 1× | 42 / 41 / 66 / 41 | 52 / 40 / 68 / 49 | 50 (**−6**) |
| master | 4× | 234 / 222 / 332 / 220 | 195 / 191 / 355 / 240 | 249 |
| branch | 4× | 206 / 210 / 309 / 205 | 193 / 265 / 366 / 257 | 251 (**+2**) |

A stage change bakes as fast as on master: the shadow stamps come back for free, and the flat sawhorse drawing has
left the bake. The **first** bake at load (stage 1), which also builds the stamps, costs a bit more:

| tree | 1× (r1 / r2) | 4× (r1 / r2) |
| --- | --- | --- |
| master | 104 / 99 | 522 / 511 |
| branch | 128 / 131 (+28) | 682 / 555 (+102) |

This runs once, behind the build phase's start (B20). The stamps take about 2–3 MB of canvas memory. The atlas
canvas is 2032 × 536 (4.4 MB, as before: the code atlas was a canvas of similar size). The decoded image stays
referenced for repaints (another 4.4 MB); the loader's GPU copy is removed.

## Download (AC 2)

| file | bytes |
| --- | --- |
| `streetProps.webp` (lossless, 2032 × 536, 26 frames) | 544 190 (531 KB) |
| alternatives not shipped | PNG 892 KB, WebP q90 129 KB (lossy: re-encodes the approved pixels) |

531 KB added to the first load, far under the 2 MB story cap and the 15 MB / 10 s first-load budget. The Boot scene
loads it behind the title (500 ms). The frame JSON (5 KB) is bundled into the JS.
