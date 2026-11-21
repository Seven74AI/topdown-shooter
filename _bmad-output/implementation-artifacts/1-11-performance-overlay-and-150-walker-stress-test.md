---
baseline_commit: 4bf25f670c972bf9928565a6d007f3850e0c56d1
---

# Story 1.11: Performance overlay and 150-Walker stress test

Status: review

## Story

As the designer,
I want an on-screen readout of frame rate and load, and a way to spawn 150 Walkers in view,
so that we know early whether phones can handle the horde.

## Acceptance Criteria

1. **Overlay.** With `?debug=1` in the URL or a three-finger tap, the overlay shows FPS (current and 1-second minimum), zombies alive and in view, and simulation tick time.
2. **Dev cheats.** In a development build, the dev cheats let me spawn N zombies of a type around me, skip the wave, toggle god mode and set the run seed. These cheats are absent from the release build.
3. **Stress test (NFR1).** With god mode and 150 Walkers spawned inside the camera view, the scene runs for 60 s on the reference phones (iPhone 12 class, Pixel 5 class); average and minimum FPS are recorded in `docs/perf/epic-1-stress.md` against the target of 60 FPS and never below 30. If a phone misses the target, the note lists the measured bottleneck (rendering vs simulation) for follow-up.

## Tasks / Subtasks

- [x] **Task 1: Overlay** (AC 1) — `apps/client/src/debug/PerfOverlay.ts`, drawn in `HudScene` (top-right, monospace ≥ 12 px × dpr, semi-transparent black box): `FPS 58 (min 41)`, `alive 150 · in view 132`, `tick 1.8 ms (max 4.1)`, `render 6.2 ms`, `draws N` if Phaser exposes a draw-call count. Toggle: `?debug=1` on load, or a three-finger tap (3 simultaneous touches within 300 ms) toggles it. Available in **release** builds too (architecture: friends report lag with numbers; Story 10.1 adds "Show performance" in Settings)
- [x] **Task 2: Measurement** (AC 1, 3) — `apps/client/src/debug/perfStats.ts`: ring buffers (no allocation per frame) for frame times and sim step times; "1-second minimum FPS" = lowest instantaneous FPS among frames in the last 1 s; tick time measured around each `step()` inside `LocalSimHost` with `performance.now()` (client code, allowed; shared stays clock-free) and exposed as `host.stats`. "In view" = alive zombies whose position is inside the camera's `worldView` rectangle
- [x] **Task 3: Dev cheats** (AC 2) — `apps/client/src/debug/DevCheats.tsx` (Preact panel, toggled by a `⚙` dev button through `HudButtons`, or backtick on desktop): spawn N (1–200) of a type (types from `balance.zombies.types`) in a ring around me (Story 1.4's `spawnRing`), or **inside the camera view** (random points in `worldView`, seeded); skip wave (kills every alive wave zombie and clears the queue through a shared `skipWave(world)` in `waves/`); god mode toggle (`world.debug.godMode` → player takes no damage; shared reads it in contact damage); set run seed (restarts the run with the typed uint32). The 1.8 dev loadout picker stays as is (Story 3.3 moves it here)
- [x] **Task 4: Strip cheats from release** (AC 2) — load cheats with `if (import.meta.env.DEV) { const { mountDevCheats } = await import("./debug/DevCheats"); … }` so Vite drops the module from production. Shared helpers (`skipWave`, `godMode`) are harmless data paths, but make sure no UI or key binding reaches them in release. Add a CI-runnable check `tools/checks/noCheatsInRelease.test.ts` that runs only if `apps/client/dist` exists, or a small script run after `npm run build` in CI, asserting the built JS contains none of the strings `DevCheats`, `godMode toggle`, `Spawn zombies` (pick strings unique to the cheat UI)
- [x] **Task 5: Stress scene** (AC 3) — `?stress=150` (dev and release, because phones test the published link): starts a run with god mode on, the Pistol, no waves (director paused via `world.debug.pauseWaves`), and 150 Walkers placed inside the view around the survivor, and the overlay on. After 60 s the overlay shows a summary (avg FPS, min FPS, % frames under 30 FPS, avg/max tick ms, avg render ms) and a **Copy results** button (clipboard) so the designer can paste phone numbers into the doc. Note: the stress mode needs god mode in release, so `?stress` bypasses the "no cheats in release" rule only through this fixed scenario (no free-form cheats)
- [x] **Task 6: Perf doc** (AC 3) — create `docs/perf/epic-1-stress.md` with the method, the targets (NFR1), a results table (device, browser, avg FPS, min FPS, % < 30, tick ms, render ms, bottleneck), and **the desktop headless numbers you can measure here** as a first row (clearly labelled "headless desktop, not a reference phone"). The phone rows are filled in by the designer (human step: see Completion Notes); the story is done when the doc and tooling exist and the designer's numbers are recorded, or the designer accepts deferring them to Story 1.12
- [x] **Task 7: Bottleneck hint** (AC 3) — the summary labels the bottleneck: if avg tick ms > 8 → "simulation"; else if frame time ≫ tick + render budget → "rendering/GPU"; print both numbers so the call can be checked

## Dev Notes

- Builds on everything before it, especially 1.4 (`ZombieView`, `spawnRing`), 1.7 (wave director), `LocalSimHost` (1.2), `HudButtons` (1.8). Read their records and code.
- Architecture › Debug Tools: overlay also in release; cheats dev-only and compiled out (boundary 7). The `?stress` scenario is a deliberate, fixed exception for phone testing; record it as a variance.
- Rendering cost is the expected bottleneck. If the headless desktop run shows trouble, check first: one `Image` per zombie from a shared texture (1.4), no `Graphics` redraws per frame, no allocation in `update()`, DPR capped at 2 (1.1). Don't optimise further in this story; record findings for Epic 10.
- Network numbers (ping, bandwidth) join the overlay in Story 2.10; leave room for two more lines.

### Project Structure Notes

New: `apps/client/src/debug/{PerfOverlay.ts, perfStats.ts, perfStats.test.ts, DevCheats.tsx, stressScenario.ts}`, `packages/shared/src/waves/skipWave.ts` (or a function in `waveDirector.ts`), `docs/perf/epic-1-stress.md`, a release check under `tools/checks/`.
Modified: `LocalSimHost.ts` (`stats`), `core/world.ts` (`debug: { godMode, pauseWaves }`), `zombies/zombieAi.ts` (god mode), `waves/waveDirector.ts` (pause), `HudScene.ts`, `GameScene.ts`, `.github/workflows/ci.yml` (if the release check runs as a step).

### References

- [Source: epics.md#Story 1.11: Performance overlay and 150-Walker stress test]
- [Source: game-architecture.md#Debug Tools], [#Architectural Boundaries] (7), [#Client Platform Budgets]
- NFR1: [Source: epics.md#NonFunctional Requirements]; [gdd.md#Performance Requirements]

## Dev Agent Record

### Agent Model Used

claude-opus-5-5 (Claude Opus 5.5), via gds-dev-story

### Debug Log References

- **Phaser 4 checks**, verified in `node_modules/phaser`:
  - The game loop emits `Core.Events.PRE_STEP` / `POST_STEP` / `POST_RENDER`, used for frame, update and render timing.
  - The WebGL renderer has no draw-call counter (`drawCount` exists only on the CanvasRenderer), so the optional `draws N` line was left out.
  - `Systems.start(data)` keeps the previous `settings.data` when `data` is undefined. A plain `scene.restart()` after "Restart with seed" would therefore have reused that seed. Every restart now passes an object (`{}` = new random seed).
- **First test run:** the whole-run "worst second" test expected exactly 60. Float frame times (1000/60) straddle the second boundary and gave 59, so the assertion is now ≥ 59.
- **Release strip check.** After `npm run build`, the bundle is a single JS chunk. It contains none of: `Dev cheats`, `Spawn zombies`, `God mode`, `Restart with seed`, `Leave last 5`, `dev-gear`, `Dev loadout`, `DevCheats`, `__game`. It does contain `Copy results` and `Stress test results`, because the stress tooling ships in release on purpose. Negative control: with `Dev cheats` appended to a copy of the bundle, `CHEAT_SCAN_DIR=<copy> REQUIRE_DIST=1` fails the check.
- **Stress measurement:** headless Chromium 157 through Playwright, release build (`vite preview`), 844×390 landscape, touch emulation, SwiftShader software GL, 4 vCPU Xeon. Results are in the Completion Notes and `docs/perf/epic-1-stress.md`.
- **Rush-marker check** (deferred from Stories 1.4 and 1.7). Dev server, 844×390 @ DPR 2, `window.__game` probing every 2 s.
  - Steps: pick Pistol + SMG, ⚙ → God mode, then wait out the intro plus 2.5 s of spawning. At that point: wave 1, 28 alive, 12 queued. Then ⚙ → Leave last 5.
  - **Arrows:** right after, `rushing: true`, remaining 5, all 5 off screen. Five red edge arrows sat 28 CSS px inside the edge, each on the ray from the screen center toward its zombie. Example: a zombie at (42.5, 20.6) m got an arrow at (1632, 584) px, 14°; a zombie at (5.5, 20.1) m got (56, 563) px, 168°. Five chevrons sat 0.7 m above the five zombies.
  - **Hand-over:** at +6 s all 5 were in view. Five chevrons, zero arrows: each arrow disappears when its zombie enters the view.
  - **Clean-up:** Skip wave → phase `pause`; zero chevrons, zero arrows, "Wave 1 cleared".
  - Screenshots: `rush-1-arrows.png`, `rush-2-mixed.png` (in-view zombies with chevrons plus an arrow for one just past the top edge), `rush-3-chevrons.png`, `rush-4-cleared.png`.
  - **No rendering bug found** in `GameScene.updateRushMarkers` or `HudScene.drawRushArrows`. Two cosmetic notes, left as they are:
    - Two rushers close together get overlapping arrows.
    - A chevron (depth 12) above a zombie just south of the survivor draws over the survivor sprite.
- **Restart check** (deferred from Story 1.4):
  1. ⚙ → seed `12345` → Restart with seed. The picker shows again, `world.seed` is 12345, wave 0, 0 alive, god mode off.
  2. Start, then spawn 200 around me without god mode. Game over appears.
  3. Restart: the picker again, then a **new random seed** (509890392), HP 100, no markers, no stale state.
  4. Start: wave 1 runs normally.

  No console errors. Screenshots: `restart-1-gameover.png`, `restart-2-new-run.png`.
- **Overlay checks** (release build):
  - `?debug=1` shows the overlay from load.
  - Without it, a CDP three-finger tap (3 touch starts 40 ms apart) turns it on, and a second tap turns it off. Screenshots: `overlay-debug1.png`, `overlay-tap-1-on.png`, `overlay-tap-2-off.png`.
- All screenshots are in the session scratchpad `shots/` folder; they are not committed.

### Completion Notes List

- Ultimate context engine analysis completed - comprehensive developer guide created
- **Implemented:**
  - **Shared (minimal):**
    - `World.debug = { godMode }`, included in `snapshotWorld`.
    - `damagePlayer` returns early in god mode, with no event and no HP loss.
    - Waves are paused through the existing `WaveState.paused`, and skipping uses the existing `skipWave(world)`. No `world.debug.pauseWaves` was added (see Deviations).
    - Tests: god mode blocks contact damage and switching it off restores damage; a paused director starts no wave and resumes when unpaused.
  - **`LocalSimHost.stats`:** the step count and per-step `performance.now()` durations of the last `update()`, in a preallocated `Float64Array`.
  - **`debug/perfStats.ts` (pure):**
    - `PerfStats`: ring buffers of 256 frames and 64 ticks, with no allocation per frame. Rolling 1-s snapshot: FPS, 1-s minimum (1000 / longest frame), tick average/max, render and update averages.
    - `PerfSummary`: whole-run average and minimum FPS, worst second, % of frames under 30 FPS, tick average/max, render/update averages, the target verdict and the bottleneck (`tick avg > 8 ms` → simulation, otherwise rendering/GPU).
    - `countInView`.
  - **`debug/perfProbe.ts`:**
    - Times each frame from Phaser game events.
    - Detects the three-finger tap from window `touchstart` (pure `MultiTapDetector`: 3 starts within 300 ms, fires once per tap).
    - `recordSimFrame()`, called once per frame from GameScene, records the tick times and the alive / in-view counts. "In view" uses this frame's camera rectangle, the same one the rush arrows use, and is counted only while the overlay or a stress run is active.
  - **`debug/PerfOverlay.ts`:** drawn in HudScene, top-right inside the safe area. Monospace at 13 CSS px × dpr on a black box at 60 % opacity. The text is rebuilt 4 times a second. Lines: `FPS 58 (min 41)`, `alive 150 · in view 132`, `tick 1.8 ms (max 4.1)`, `render 0.4 ms · upd 0.2`, plus a stress status line. Room is left for the network lines of Story 2.10. Available in release.
  - **`debug/urlOptions.ts`:** one parser for `?debug` and `?stress=N`. A bare `?stress` means 150; the value is capped at 200; invalid values are ignored. Story 1.12 adds `?loadout` and `?tune` here.
  - **`debug/stressScenario.ts`** (release on purpose):
    - `setupStressWorld` turns god mode on, pauses the waves and calls `spawnInView`, which places zombies at seeded points (World RNG) inside the view, at least 2.5 m from the survivor.
    - The `StressRun` state machine runs a 2-s warm-up, then 60 s of measurement, then a report.
    - `formatStressReport` produces text plus a ready-made row for the doc table.
    - With `?stress`, GameScene skips the dev picker, keeps the Pistol and starts the run. The run is cancelled on scene shutdown.
  - **`debug/StressResults.tsx`:** a summary dialog with **Copy results** (Clipboard API, with a textarea and `execCommand` fallback for insecure LAN origins) and Close.
  - **Dev cheats** (`debug/DevCheats.tsx` + `DevCheats.css` + pure `devCheatActions.ts`):
    - Opened with the ⚙ button or the backtick key.
    - Spawn N (1–200) of a type from `ZOMBIE_TYPES` that has balance: in a ring around me (`spawnRing`, 8 m) or inside the view (`spawnInView`).
    - Skip wave; Leave last 5 (empties the queue and kills wave zombies until 5 remain, so the rush starts on the next tick).
    - God mode and overlay toggles.
    - Restart with a typed uint32 seed (decimal or 0x hex) through `GameScene.restartRun(seed)` → `scene.restart({ seed })`.
    - A live readout of seed, wave and alive count.
    - Loaded only by `if (import.meta.env.DEV) import("./debug/DevCheats")` in `main.ts`, which also sets `window.__game` in dev builds only.
  - **Release check:** `tools/checks/noCheatsInRelease.test.ts`. It skips without a dist during `npm test`. CI runs it after the build with `REQUIRE_DIST=1`, so a missing dist fails.
  - **GameScene / HudScene changes** are small, to ease the Story 1.10 merge:
    - GameScene: `create(data?: GameSceneData)` takes the seed; restart passes `{}`; a stress branch; the dev accessors `debugWorld`, `debugView()` and `restartRun()`; one `recordSimFrame` line in `update`.
    - HudScene: one field, one line in `create`, one line in `update`.
    - The input-building block and the pointer handlers are untouched.
- **Measured** (headless desktop, **not a reference phone**; `docs/perf/epic-1-stress.md`):

  | Run | avg FPS | min FPS | worst second | frames < 30 FPS | tick avg / max | render |
  |---|---|---|---|---|---|---|
  | `?stress=150` @ DPR 2 | 27.1 | 16.9 | 23 | 92.7 % | 0.19 / 1.80 ms | 0.23 ms |
  | DPR 1 | 58.4 | 22.3 | — | 0.11 % | 0.16 ms avg | — |
  | 1 Walker @ DPR 2 | 43.3 | — | — | — | — | — |

  Bottleneck: rendering/GPU. The software rasterizer is fill-bound, and the simulation is about 40× under the 8-ms line. No optimisation was done in this story (Dev Notes); levers for Epic 10 are listed in the doc.
- **Deviations / variances:**
  1. **`?stress` in release:** it enables god mode and pauses waves in release builds. This is the architecture variance the story asks to record: a fixed scenario, with no free-form cheat reachable.
  2. **No `world.debug.pauseWaves`:** wave pausing reuses the existing `WaveState.paused`, which Story 1.7 added for this purpose. `World.debug` holds only `godMode`.
  3. **The ⚙ toggle is a DOM button** in the dev cheat panel, not a `HudButtons` entry. A touch on it never reaches the canvas, so no stick spawns, and it leaves HudScene untouched for the 1.10 merge. Having it all in the dev-only module also means release has no ⚙ hit area at all.
  4. **No `draws N` line:** Phaser 4's WebGL renderer exposes no draw-call count.
  5. **Two minimum-FPS readings in the summary:** min FPS (worst single frame, the strict reading of "never below 30") and the worst whole second. % of frames under 30 is also reported.
  6. **Extra cheat:** "Leave last 5", added to verify the rush markers.
  7. **Stress HUD text:** during `?stress` the wave line reads "Get ready", because the director is paused before wave 1. This is cosmetic.
- **Human step:** the designer runs `?stress=150` on the published link on an iPhone 12-class phone (Safari) and a Pixel 5-class phone (Chrome), presses **Copy results**, and fills the two phone rows in `docs/perf/epic-1-stress.md`, or accepts deferring them to Story 1.12.
- **Tests:** 223 passing (+32):
  - perfStats 9, stressScenario 6, urlOptions 4, multiTap 4, devCheatActions 3, release check 3 (run when a dist exists), LocalSimHost stats 1, shared 2.
- **Verification:**
  - typecheck: 0 errors;
  - lint: 0 problems;
  - `npm test`: 223/223;
  - `npm run build`: ok;
  - `REQUIRE_DIST=1` release check: 3/3.

### File List

- `packages/shared/src/core/world.ts` (modified: `World.debug`, `WorldDebug`)
- `packages/shared/src/core/worldSnapshot.ts` (modified: `debug`)
- `packages/shared/src/zombies/zombieAi.ts` (modified: god mode in `damagePlayer`)
- `packages/shared/src/zombies/zombieAi.test.ts` (modified)
- `packages/shared/src/waves/waveDirector.test.ts` (modified)
- `packages/shared/src/index.ts` (modified)
- `apps/client/src/sim/LocalSimHost.ts` (modified: `stats`)
- `apps/client/src/sim/LocalSimHost.test.ts` (modified)
- `apps/client/src/debug/urlOptions.ts` (new)
- `apps/client/src/debug/urlOptions.test.ts` (new)
- `apps/client/src/debug/perfStats.ts` (new)
- `apps/client/src/debug/perfStats.test.ts` (new)
- `apps/client/src/debug/multiTap.ts` (new)
- `apps/client/src/debug/multiTap.test.ts` (new)
- `apps/client/src/debug/perfProbe.ts` (new)
- `apps/client/src/debug/PerfOverlay.ts` (new)
- `apps/client/src/debug/stressScenario.ts` (new)
- `apps/client/src/debug/stressScenario.test.ts` (new)
- `apps/client/src/debug/StressResults.tsx` (new)
- `apps/client/src/debug/DevCheats.tsx` (new, dev only)
- `apps/client/src/debug/DevCheats.css` (new, dev only)
- `apps/client/src/debug/devCheatActions.ts` (new, dev only)
- `apps/client/src/debug/devCheatActions.test.ts` (new)
- `apps/client/src/scenes/GameScene.ts` (modified: seed through restart data, stress branch, dev accessors, `recordSimFrame`)
- `apps/client/src/scenes/HudScene.ts` (modified: `PerfOverlay`)
- `apps/client/src/main.ts` (modified: perf probe, dev cheats dynamic import, `window.__game` in dev)
- `apps/client/src/ui/App.tsx` (modified: `StressResults`)
- `apps/client/src/ui/overlay.css` (modified: stress results)
- `tools/checks/noCheatsInRelease.test.ts` (new)
- `.github/workflows/ci.yml` (modified: release check after build)
- `docs/perf/epic-1-stress.md` (new)
- `_bmad-output/implementation-artifacts/1-11-performance-overlay-and-150-walker-stress-test.md` (modified)
- `_bmad-output/implementation-artifacts/sprint-status.yaml` (modified)

## Change Log

- 2026-11-21: Story 1.11 implemented: performance overlay (`?debug=1` / three-finger tap, release too), sim step timing in `LocalSimHost.stats`, dev cheats (spawn, skip wave, leave last 5, god mode, seed restart; stripped from release with a CI check), fixed `?stress=150` scenario with a 60-s summary and Copy results, perf doc with headless desktop numbers. Rush markers and restart checked in the browser with god mode. 223 tests passing.
