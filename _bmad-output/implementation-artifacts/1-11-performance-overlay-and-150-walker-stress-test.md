# Story 1.11: Performance overlay and 150-Walker stress test

Status: ready-for-dev

## Story

As the designer,
I want an on-screen readout of frame rate and load, and a way to spawn 150 Walkers in view,
so that we know early whether phones can handle the horde.

## Acceptance Criteria

1. **Overlay.** With `?debug=1` in the URL or a three-finger tap, the overlay shows FPS (current and 1-second minimum), zombies alive and in view, and simulation tick time.
2. **Dev cheats.** In a development build, the dev cheats let me spawn N zombies of a type around me, skip the wave, toggle god mode and set the run seed. These cheats are absent from the release build.
3. **Stress test (NFR1).** With god mode and 150 Walkers spawned inside the camera view, the scene runs for 60 s on the reference phones (iPhone 12 class, Pixel 5 class); average and minimum FPS are recorded in `docs/perf/epic-1-stress.md` against the target of 60 FPS and never below 30. If a phone misses the target, the note lists the measured bottleneck (rendering vs simulation) for follow-up.

## Tasks / Subtasks

- [ ] **Task 1: Overlay** (AC 1) — `apps/client/src/debug/PerfOverlay.ts`, drawn in `HudScene` (top-right, monospace ≥ 12 px × dpr, semi-transparent black box): `FPS 58 (min 41)`, `alive 150 · in view 132`, `tick 1.8 ms (max 4.1)`, `render 6.2 ms`, `draws N` if Phaser exposes a draw-call count. Toggle: `?debug=1` on load, or a three-finger tap (3 simultaneous touches within 300 ms) toggles it. Available in **release** builds too (architecture: friends report lag with numbers; Story 10.1 adds "Show performance" in Settings)
- [ ] **Task 2: Measurement** (AC 1, 3) — `apps/client/src/debug/perfStats.ts`: ring buffers (no allocation per frame) for frame times and sim step times; "1-second minimum FPS" = lowest instantaneous FPS among frames in the last 1 s; tick time measured around each `step()` inside `LocalSimHost` with `performance.now()` (client code, allowed; shared stays clock-free) and exposed as `host.stats`. "In view" = alive zombies whose position is inside the camera's `worldView` rectangle
- [ ] **Task 3: Dev cheats** (AC 2) — `apps/client/src/debug/DevCheats.tsx` (Preact panel, toggled by a `⚙` dev button through `HudButtons`, or backtick on desktop): spawn N (1–200) of a type (types from `balance.zombies.types`) in a ring around me (Story 1.4's `spawnRing`), or **inside the camera view** (random points in `worldView`, seeded); skip wave (kills every alive wave zombie and clears the queue through a shared `skipWave(world)` in `waves/`); god mode toggle (`world.debug.godMode` → player takes no damage; shared reads it in contact damage); set run seed (restarts the run with the typed uint32). The 1.8 dev loadout picker stays as is (Story 3.3 moves it here)
- [ ] **Task 4: Strip cheats from release** (AC 2) — load cheats with `if (import.meta.env.DEV) { const { mountDevCheats } = await import("./debug/DevCheats"); … }` so Vite drops the module from production. Shared helpers (`skipWave`, `godMode`) are harmless data paths, but make sure no UI or key binding reaches them in release. Add a CI-runnable check `tools/checks/noCheatsInRelease.test.ts` that runs only if `apps/client/dist` exists, or a small script run after `npm run build` in CI, asserting the built JS contains none of the strings `DevCheats`, `godMode toggle`, `Spawn zombies` (pick strings unique to the cheat UI)
- [ ] **Task 5: Stress scene** (AC 3) — `?stress=150` (dev and release, because phones test the published link): starts a run with god mode on, the Pistol, no waves (director paused via `world.debug.pauseWaves`), and 150 Walkers placed inside the view around the survivor, and the overlay on. After 60 s the overlay shows a summary (avg FPS, min FPS, % frames under 30 FPS, avg/max tick ms, avg render ms) and a **Copy results** button (clipboard) so the designer can paste phone numbers into the doc. Note: the stress mode needs god mode in release, so `?stress` bypasses the "no cheats in release" rule only through this fixed scenario (no free-form cheats)
- [ ] **Task 6: Perf doc** (AC 3) — create `docs/perf/epic-1-stress.md` with the method, the targets (NFR1), a results table (device, browser, avg FPS, min FPS, % < 30, tick ms, render ms, bottleneck), and **the desktop headless numbers you can measure here** as a first row (clearly labelled "headless desktop, not a reference phone"). The phone rows are filled in by the designer (human step: see Completion Notes); the story is done when the doc and tooling exist and the designer's numbers are recorded, or the designer accepts deferring them to Story 1.12
- [ ] **Task 7: Bottleneck hint** (AC 3) — the summary labels the bottleneck: if avg tick ms > 8 → "simulation"; else if frame time ≫ tick + render budget → "rendering/GPU"; print both numbers so the call can be checked

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

### Debug Log References

### Completion Notes List

- Ultimate context engine analysis completed - comprehensive developer guide created
- Human step: the reference-phone runs (iPhone 12 class, Pixel 5 class) are done by the designer with `?stress=150` on the published link.

### File List
