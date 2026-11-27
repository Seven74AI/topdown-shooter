# Epic 10 · Story 10.3 memory and battery pass (headless 10-wave run)

## Method (10.3 B1–B5)

- Script: `tools/perf/memoryRun.cjs` (README next to it). Playwright Chromium headless (SwiftShader: the CPU draws),
  844 × 390, DPR 2. A solo **dev** build: Vite runs in the script's own process on a port the OS picks, with no file
  watching and no HMR (an edit to the tree once reloaded a measuring page in wave 10). The run is driven through the
  dev-only `window.__memRun` (`apps/client/src/debug/memProbe.ts`, never in a release bundle: `noCheatsInRelease`
  lists `__mem`).
- **The run (B1):** `?solo&loadout=assault_rifle:4,shotgun:4`, run seed pinned (1003), god mode, the stress fire input
  (holds fire at the nearest zombie, `stressFireInput`), Ready in every build phase, Extract in the vote. A wave still
  running after 240 s is skipped once (dev "skip wave") and logged. Liveness asserts: 10 waves started, the Behemoth
  spawned, the vote, Extract, Results; every sample has a non-zero heap and texture count. A run that misses one exits
  non-zero and is not recorded.
- **Samples (B2):** at the start of every build phase and at Results: CDP `HeapProfiler.collectGarbage` (twice), then
  `Performance.getMetrics` (`JSHeapUsedSize`, `JSHeapTotalSize`, `Nodes`, `JSEventListeners`) and `__mem()`: Phaser's
  textures (count; **texture estimate** = Σ width × height × 4 over every texture source) and the 2D canvases registered
  in `textureRegistry`. Headless Chromium has no GPU memory metric: "GPU texture memory" in this doc is that estimate.
  Then a heap snapshot splits the heap: **JS objects** (`jsMB`) = heap used − V8's compiled code (snapshot nodes of
  type "code": machine code, bytecode, feedback vectors).
- **Why the split:** V8 keeps compiling and optimising functions as later waves and restarts exercise them. That code
  lives in the JS heap and only grows: +1.7 MB over Restart × 3 and +2.3 MB from wave 2 to wave 9 while the game's
  objects stay flat. A JIT warm-up isn't a leak, so the growth rules below use JS objects. The whole heap is in every
  table too.
- **Growth rule (B3):** for every build phase after wave 2, JS objects and the texture estimate stay within 5 % of the
  first build phase of the same decay stage (wave 2's build for its own stage). A stage change may add (rubble, fog,
  Behemoth sheets, new zombie types); each jump is named below, and a stage must not climb wave after wave.
- **Battery proxy (B4):** waves 1, 5 and 9 (`?startwave=`), each with Battery saver off and on: 20 s after the wave
  starts, a 60 s window of CDP `TaskDuration` / `ScriptDuration` / `LayoutDuration` deltas → main-thread busy seconds
  per minute, plus the frames Phaser drew (a `postrender` counter) and the sim ticks. The survivor holds no fire in the
  windows, so the wave's horde stays on screen for the whole window (with fire, wave 1 ends in ~10 s). This is a proxy
  for battery use, not a battery %.
- **Restarts (B5):** one page, 4 runs: wave 1 for 20 s → Game over (my survivor out: the sim's own wipe → Results) →
  Restart. A sample at each Results. Runs 2–4 within 5 % of run 1 (JS objects, object count, textures).
- Container: 4 cores (Xeon 2.3 GHz), load average 1.2–3.8 during the runs (the snapshots and a parallel probe).
  **Not verified:** Safari / WebKit memory, any real phone's memory or battery, real GPU memory (estimate only).

## The run (after the fixes: `story-10-3`, 2026-11-27)

10 waves in 9.2 min. The Behemoth spawned in wave 10. **Wave 10 was skipped after 240 s** (the scripted fire with the
Assault Rifle IV doesn't kill the Behemoth in time). Then the vote, Extract, Results "extracted". The stage is the one in
force at that build phase (the decay engine applies the next wave's stage at the build start).

| sample | stage | heap used / total MB | of which code MB | JS objects MB | DOM nodes | listeners | textures | texture estimate MB | canvases | load |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| build 0 (before wave 1) | 1 | 25.6 / 26.8 | 12.7 | 12.9 | 314 | 178 | 169 | 97.8 | 93 | 2.0 |
| build after wave 1 | 1 | 26.9 / 30.0 | 13.9 | 13.0 | 328 | 174 | 169 | 97.4 | 93 | 3.4 |
| build after wave 2 | 2 | 28.0 / 30.3 | 14.5 | 13.5 | 332 | 174 | 169 | 97.4 | 93 | 3.8 |
| build after wave 3 | 2 | 28.2 / 30.5 | 14.9 | 13.3 | 332 | 174 | 169 | 97.4 | 93 | 3.0 |
| build after wave 4 | 3 | 29.6 / 31.0 | 15.2 | 14.4 | 335 | 174 | 169 | 97.4 | 93 | 2.4 |
| build after wave 5 | 3 | 29.9 / 31.5 | 15.4 | 14.5 | 335 | 174 | 169 | 97.4 | 93 | 1.9 |
| build after wave 6 | 4 | 31.5 / 34.3 | 16.1 | 15.4 | 335 | 174 | 175 | 98.1 | 93 | 1.9 |
| build after wave 7 | 4 | 31.6 / 33.3 | 16.3 | 15.3 | 335 | 174 | 175 | 98.1 | 93 | 1.9 |
| build after wave 8 | 5 | 31.4 / 33.8 | 16.6 | 14.8 | 335 | 174 | 178 | 98.5 | 93 | 1.5 |
| build after wave 9 | 5 | 31.9 / 33.8 | 16.8 | 15.1 | 335 | 174 | 178 | 98.5 | 93 | 1.3 |
| Results (extracted) | 5 | 31.0 / 33.5 | 15.8 | 15.2 | 412 | 173 | 177 | 97.7 | 91 | 1.2 |

**Peaks:** heap 31.9 MB used (34.3 MB total), JS objects 15.4 MB, texture estimate 98.5 MB (178 textures).

**B3 check (passes):** within each stage, JS objects vs the stage's first build: stage 2 0.985, stage 3 1.007,
stage 4 0.994, stage 5 1.020; textures 1.000 everywhere. The named stage jumps:

- **Stage 2 → 3 (build after wave 4), JS objects +1.1 MB:** stage 3's heavy rain and burning cars, plus the views'
  per-slot objects as more pool slots and zombie types come into play. The heap-snapshot diff between the builds after
  waves 3 and 4 shows +868 Phaser game objects (`EventEmitter`s), +378 images, +586 arrays and +14 k numbers held in
  plain arrays. The zombie views keep their objects per pool slot, and the pool has 256 slots, so that part stops at the
  pool's size. Flat afterwards (14.4 → 14.5).
- **Stage 3 → 4 (build after wave 6), JS objects +0.9 MB, textures +6 (+0.7 MB):** stage 4 and wave 6's new arrivals.
  Not itemised beyond the same kinds of entries (game objects, arrays). Flat afterwards (15.4 → 15.3).
- **Stage 4 → 5 (build after wave 8), textures +3 (+0.4 MB):** stage 5 (fog, collapse). JS objects back down (14.8).
  Flat afterwards (15.1).
- **Whole heap:** 28.0 → 31.9 MB from wave 2 to wave 9 (+14 %): +2.3 MB is compiled code, +1.6 MB is the named stage jumps.
- **The Behemoth's sheets** (≈ 13.5 MB, `epic-9-behemoth.md`) are baked at load (the 169 textures of build 0 include
  them), so wave 10 adds no texture.

### Before the fixes (master `c40d1a5` + the probe, same script, seed and run)

The same shape: 10 waves, wave 10 skipped after 240 s, extracted, 9.2 min. Heap 25.2 → 32.0 MB (peak), JS objects
12.5 → 15.2 MB, the same textures (169 → 178, 98.5 MB peak). By stage: stage 2 1.03, stage 3 1.01, stage 4 1.03,
stage 5 1.01. **No memory retention was found to fix** (the fixes below are allocation churn: garbage made every tick,
which costs GC time and battery, not memory held).

## Restart × 3 (B5, passes)

| run | heap used MB | of which code MB | JS objects MB | object count | DOM nodes | listeners | textures | texture estimate MB | canvases |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| 1 (first) | 26.8 | 13.9 | 12.9 | 469,735 | 401 | 175 | 169 | 97.4 | 93 |
| 2 | 27.7 | 14.7 | 13.0 | 472,210 | 401 | 175 | 169 | 94.2 | 93 |
| 3 | 28.1 | 15.1 | 13.0 | 472,321 | 401 | 175 | 169 | 94.2 | 93 |
| 4 | 28.6 | 15.6 | 13.0 | 472,331 | 401 | 175 | 169 | 94.2 | 93 |

Runs 2–4 vs run 1: JS objects 1.008, object count 1.005–1.006, textures, DOM nodes and listeners identical. The whole
heap is +3.4 / +4.9 / +6.7 %, and all of it is compiled code (+0.8 / +1.2 / +1.7 MB). A snapshot diff between restarts 2
and 5 found only code entries (`InstructionStream`, `FeedbackVector`, bytecode) and no game objects. No scene-restart
leak: neither DOM listeners nor JS objects build up per restart. (CDP counts only DOM listeners. A `uiStore` /
`subscribeSettings` subscription kept per restart would hold a closure and the scene's objects, and the flat object
count rules that out.)

## Battery proxy (B4)

Per 60 s window (60.3–61.1 s each), 20 s into the wave, the survivor holding no fire. "Busy" = CDP `TaskDuration`
(every main-thread task), in seconds per minute; 60 = never idle. Frames = what Phaser drew (`postrender`).

| CPU | wave (stage, alive) | Battery saver | busy s/min | of which script s/min | layout s/min | frames drawn / s | sim ticks / s | load |
| --- | --- | --- | --- | --- | --- | --- | --- | --- |
| 4× | 1 (stage 1, 14) | off | 59.5 | 17.0 | 0 | 49.6 | 20.0 | 2.1 |
| 4× | 1 (stage 1, 14) | **on** | **41.8** | 14.5 | 0 | **29.6** | 20.0 | 1.5 |
| 4× | 5 (stage 3, 70) | off | 59.9 | 13.8 | 0 | 11.8 | 20.0 | 1.9 |
| 4× | 5 (stage 3, 70) | on | 59.9 | 13.9 | 0 | 11.8 | 20.0 | 1.6 |
| 4× | 9 (stage 5, 126) | off | 60.0 | 12.7 | 0 | 7.3 | 19.9 | 2.0 |
| 4× | 9 (stage 5, 126) | on | 60.0 | 12.1 | 0 | 7.5 | 20.0 | 2.0 |
| 1× | 1 (stage 1, 14) | off | 45.2 | 4.8 | 0 | 59.9 | 20.0 | 1.3 |
| 1× | 1 (stage 1, 14) | **on** | **26.0** | 3.5 | 0 | **30.0** | 20.0 | 0.9 |
| 1× | 5 (stage 3, 70) | off | 60.0 | 4.0 | 0 | 18.3 | 20.0 | 1.0 |
| 1× | 5 (stage 3, 70) | on | 60.0 | 3.8 | 0 | 18.8 | 20.0 | 1.0 |
| 1× | 9 (stage 5, 126) | off | 60.1 | 3.4 | 0 | 10.6 | 20.0 | 1.1 |
| 1× | 9 (stage 5, 126) | on | 60.0 | 3.2 | 0 | 10.7 | 20.0 | 1.4 |

- **Where Battery saver engages it saves a lot:** wave 1 draws half the frames and the main thread is busy 30 % less at
  4× (59.5 → 41.8 s/min) and 42 % less at 1× (45.2 → 26.0 s/min).
- **Waves 5 and 9:** headless SwiftShader (the CPU draws) gets only 7–19 frames a second there, under the cap, so
  Battery saver changes nothing and the main thread is busy the whole minute either way. On a phone with a real GPU
  these waves draw near 60 FPS (the 10.2 target), so the cap would engage. That is not measured here (no phone,
  parked).
- **The sim is unchanged:** 20 ticks a second in every window, saver on or off (and the unit test: 20 Hz ticks over
  2 s of fake time, the same with the draw capped). The network and prediction are unchanged too. The input is read once
  per drawn frame, so with the cap it is sampled and sent up to one display frame later (≤ 16.7 ms on 60 Hz; review L2).
- While Battery saver is on, the 10.2 one-time quality check doesn't run (it would read the 30 drawn frames as a slow
  phone; review H). It runs on a later first wave with the saver off.
- Script time per minute is small next to busy time: most of a busy minute is the draw (SwiftShader rasterising on
  the CPU, and the GPU-process wait), and that part scales with frames drawn.

## D13: what the shared sim allocated per tick (deferred-work D13)

Measured with `tools/perf/heapAlloc.cjs` (CDP sampling of every allocation in 10 s of the 10.2 stress scenes,
`?stress=150`, 150 Walkers, release builds, 1×) and `tools/perf/simAlloc.ts` (the sim alone in Node).

| | before (master) | after (`story-10-3`) |
| --- | --- | --- |
| stage 1 page, all allocations | 45.5 MB / 10 s | 39.4 MB / 10 s |
| stage 1, the sim (`resolveOverlaps` + `updateZombies`) | 4.8 + 2.9 = 7.7 MB | 0 + 2.6 = 2.6 MB |
| wave 9 page, all allocations | 104.8 MB / 10 s | 99.8 MB / 10 s |
| wave 9, the sim | 5.4 + 4.2 = 9.6 MB | 0 + 3.6 = 3.6 MB |
| Node, the sim alone (150 Walkers, the survivor firing) | 11.4 MB / 10 s | 4.6 MB / 10 s |

- **Cause:** the six zombie types' balance objects have different shapes (optional `spit`, `explodes`, …). A property
  read like `types[type].radiusM` at one code site sees all six, which makes it megamorphic, and V8 answers a
  megamorphic read of a fractional number by boxing a fresh copy each time. `resolveOverlaps` did it twice per
  neighbour pair, twice per tick.
- **Fix:** `zombieAi.ts › typeRadius`, a `Float64Array` of each type's radius by type index, filled once at the top of
  `updateZombies` (6 reads a tick). Pass 2 and `resolveOverlaps` read it. Same numbers, so the same positions:
  `tools/perf/digestAB.ts` folds the World digest every 100 ticks of six whole 4-bot runs (10 waves, the Behemoth,
  every zombie type) into one number per seed, and before and after are identical (seeds 1–6).
- **Left (in deferred-work D13):** `updateZombies` still allocates 2.6–3.6 MB / 10 s, from the same kind of reads of its
  other `stats.*` fields and from `pushOutOfBuildings` reading map solids and buildings through one site. Passing the box
  as four numbers instead made it worse (16.6 MB: number arguments to a call V8 doesn't inline are boxed too), so it was
  reverted. The clean fix is one shape for every zombie type object (normalise in `loadBalance`); that touches the
  balance loader, so it waits for the next story there.
- **`ZombieView` / `FireView` (~1.8 MB / 10 s each in wave 9):** number arguments to Phaser setters (`setPosition`,
  `setDisplaySize`, `setRotation`) every frame. Not changed.
- **The renderer itself:** Phaser's WebGL batching (`SubmitterQuad.run` → `batch(…)`, ~20 number arguments per sprite)
  makes ~85–90 % of all the page's allocations: 40 MB / 10 s at stage 1, 100 MB at wave 9. That's in Phaser, not our
  code. It scales with frames drawn, so Battery saver halves it where it engages.

## Parked (designer 2026-11-25: not built, not claimed)

| target | result |
| --- | --- |
| iPhone 12 Safari < 300 MB (NFR2) | parked (designer 2026-11-25) |
| 20-minute session uses < 15 % battery (NFR7) | parked (designer 2026-11-25) |
