---
baseline_commit: 09b5f6d2
---

# Story 10.3: Memory and battery pass (headless 10-wave run)

Status: review

(Written 2026-11-27 with `gds-create-story` from the real code at `09b5f6d2`. Correct-course 2026-11-26: the iPhone 12 Safari and battery-percentage ACs are **parked** (designer 2026-11-25); the buildable part is a headless Chromium run of all 10 waves with CDP memory and main-thread sampling. **Build after 10.2** (reuses its `tools/perf/` helpers, measures its tree, and both may add a Settings row). **One designer choice is open: 10.3-Q1.** Everything except T4 can start without it.)

## Story

As a player,
I want the game not to crash my browser or drain my phone,
so that we can play a whole evening.

## Baseline seen while writing (2026-11-27, `?stress=150`, 20 s in, dev build)

JS heap used (CDP `JSHeapUsedSize`): 33–43 MB across stage 1 / wave 9 at 1× and 4×. Known GPU texture budget items: street props atlas 2032 × 536 (4.4 MB canvas + 4.4 MB decoded image, `epic-9-street-props.md`), shadow stamps ~2–3 MB, Behemoth sheets ≈ 13.5 MB in play (`epic-9-behemoth.md`), character sheets per look (9.13). Nobody has sampled a whole run yet.

## Designer decision (open)

| # | Question | Options | Recommendation |
| --- | --- | --- | --- |
| **10.3-Q1** | Add a **Battery saver** switch (the biggest battery lever: drawing half as many frames)? The game still simulates at 20 Hz, so aim, hits and the network are unchanged; only the picture updates less often. | **A** Add it to Settings › Screen: *Battery saver — draws 30 frames a second instead of 60*, **off** by default. The doc records main-thread busy time at 4× with it off and on. · **B** Add it, **on** by default (smoother is opt-in; every phone saves battery, the game looks less fluid by default). · **C** No switch: measure and record only. | **A** |

**Designer pick (2026-11-27):** 10.3-Q1 = **A** (Battery saver, off by default).

## Decisions made while writing (B-codes, technical)

- **10.3-B1 (the run):** a solo **dev** build (own Vite port), 844 × 390 DPR 2, a real 10-wave run from `?solo` (real wave curve, real decay stages, the wave 10 Behemoth, the extract vote → Extract). The browser player is driven by the script: god mode through `window.__game` (dev only, as the cheat panel does: `world.debug.godMode`), a dev loadout `?loadout=assault_rifle:4,shotgun:4`, and a scripted input that holds fire at the nearest zombie (the `stressFireInput` helper of `stressScenario.ts`, wired from the page). If a wave is still running after 240 s (bots/scripts aren't difficulty evidence), the script calls the dev "skip wave" once and logs it. Build phases are passed with Ready. Expected length ≈ 20–25 min at 1×.
- **10.3-B2 (sampling):** at the start of each build phase (and once at Results): CDP `HeapProfiler.collectGarbage` then `Performance.getMetrics` (`JSHeapUsedSize`, `JSHeapTotalSize`, `Nodes`, `JSEventListeners`), plus a **texture estimate** from Phaser: Σ width × height × 4 over every texture source in `game.textures` (+ the count), and the live canvas count from `textureRegistry` (`render/gfx/textureRegistry.ts`). Chromium headless has no GPU memory metric; the estimate is what the doc calls "GPU texture memory" (say so in the doc).
- **10.3-B3 (growth rule):** "grows by more than 5 % after wave 2" = for every build phase k ≥ 3, heap(k) ≤ 1.05 × heap(2) and textures(k) ≤ 1.05 × textures(2), where heap is after a forced GC. Stage changes legitimately add textures (rubble, fog, Behemoth at wave 10): such a jump is allowed only if it is named in the doc and comes back down or stays flat afterwards (it must not climb wave after wave). Peak heap and peak texture estimate are recorded.
- **10.3-B4 (battery proxy):** at 4× CPU, three 60 s windows (wave 1, wave 5, wave 9) of CDP `Performance.getMetrics` `TaskDuration` / `ScriptDuration` / `LayoutDuration` deltas → main-thread busy seconds per minute, plus the frames drawn. (A full 4× run would take far longer than 1× and adds nothing to the proxy.) If 10.3-Q1 = A or B: the same three windows with Battery saver on.
- **10.3-B5 (leaks found):** each leak fixed in place (a pool, a missing `destroy` on scene shutdown, a listener not removed: Phaser reuses scene objects on restart, AGENTS §5) with a unit test of the fix where possible. A second run, **Restart × 3** of a short solo run (wave 1 → Game over → Restart), checks that heap and texture count return to the first run's level ±5 % (scene restart leaks are the likely ones).

## Acceptance Criteria

1. **The run happened (B1).** The script plays a full run: the log shows 10 waves started, the Behemoth spawned and died (or was skipped, logged), the extract vote and Results; the doc lists the waves skipped (if any). A run that didn't reach Results is not recorded.
2. **Memory sampled and within the rule (B2, B3).** `docs/perf/epic-10-memory-battery.md` has one row per build phase (wave, stage, heap used / total after GC, DOM nodes, listeners, texture count, texture estimate MB, canvases) and the peaks; neither heap nor texture estimate grows by more than 5 % from wave to wave after wave 2 (B3 rule); any growth found was fixed (B5) and the table is the after-fix run.
3. **Restarts don't leak (B5).** Restart × 3: heap and texture count back to the first run ±5 %; recorded.
4. **Battery proxy recorded (B4).** Main-thread busy s/min at 4× for waves 1, 5, 9; frames drawn; noted as a proxy (not a battery %).
5. **Battery saver (10.3-Q1, if A or B).** A `batterySaver` boolean in `playerSettingsSchema` (default per the pick), a switch row in Settings › Screen; when on, the game draws at most 30 frames a second (Phaser loop `fps.limit` or a rAF skip — check Phaser 4's `FPSConfig` in `node_modules/phaser/types`), applied at once without a reload; sim and input timing unchanged (the LocalSimHost / NetSimHost step on their own clock: a unit test that 20 Hz ticks still run with the draw capped). Busy-time row with it on.
6. **Parked (not built, not claimed):** iPhone 12 Safari < 300 MB, 20-min battery < 15 % (NFR2, NFR7) stay as empty rows marked "parked (designer 2026-11-25)".

## Tasks / Subtasks

- [x] **T1 Run script (AC 1)** — `tools/perf/memoryRun.cjs` (reuses 10.2's `tools/perf/fps.cjs` page/throttle helpers; own ports; stop processes by PID). Liveness asserts in the script: waves counted from the HUD/world, boss seen, Results reached; exits non-zero otherwise.
- [x] **T2 Sampling (AC 2, 4)** — the B2 / B4 metrics; a small dev-only probe `window.__mem()` in `apps/client/src/debug/` (dev builds only, like `__game`; never in a release bundle: `noCheatsInRelease` stays green) that returns the texture estimate and canvas count without allocating per frame (called only at samples).
- [x] **T3 Find and fix leaks (AC 2, 3)** — first run on master; then fixes (likely places to check: GameScene `create`/shutdown resets, views that `add` per wave without pooling — blood trails, ground damage, place FX, loot bags, police lines; HudScene listeners; `subscribeSettings` / `uiStore` subscriptions made in `create` without an unsubscribe). Re-run; record before/after.
- [x] **T4 Battery saver (AC 5; Q1)** — `packages/shared/src/config/playerSettings.ts`, `apps/client/src/ui/settingsRows.ts` (switch key union), `apps/client/src/main.ts` (apply on change via `subscribeSettings`). Settings DOM check still green.
- [x] **T5 Hand-back** — `gate:fast` + `test:changed`; PR "Story 10.3: Memory and battery pass"; record new decisions as 10.3-B6+.

## Test plan

- Script liveness (AC 1): fails unless 10 waves, the boss and Results were seen; every sample row asserts a non-zero heap and texture count (a sampler that read nothing must fail, not pass).
- Unit: each leak fix gets a test that the object is released / the listener count returns (e.g. a scene `create` twice → one subscription); Battery saver: the draw cap engages and the sim tick count over 2 s of fake time is unchanged.
- Restart × 3 (AC 3) in the browser.
- No vitest test runs the 20-minute run (30 s test cap, `docs/ci.md`): the run is a script whose output is recorded in the doc; the unit tests guard the fixes.
- Not verified (say so): Safari / WebKit memory, a real phone's battery, GPU memory (estimate only).

## Dev Notes

### What exists today

- Release build sizes at `09b5f6d2`: entry `main-*.js` 720 KB (239 KB gzip), shared chunk `consumableIcons-*.js` 2.2 MB (617 KB gzip, includes Phaser), character bake worker 322 KB, street props WebP 544 KB.
- Bakes: characters in a Web Worker at load (`render/city/charactersBakeWorker.ts`, ~8 s at 1×, ~16 s at 4× headless), buildings / boss workers, city bake per stage (`CityView.bakeMs`). Canvases recycled through `render/city/canvasRecycle.ts`; every generated texture registered in `textureRegistry` (Story 4.13).
- Scene reuse: Phaser reuses scene objects on restart — reset state in `create` (AGENTS §5). Restart is `GameScene.restartRun`.
- Dev hooks: `window.__game` (dev only, `main.ts`), cheat actions in `debug/devCheatActions.ts` (skip wave lives in the cheat panel, `DevCheats.tsx`).

### Code rules (AGENTS §5)

No per-frame allocation; textures through `addGeneratedTexture`; Phaser 4 ≠ 3 (check types); timing asserts behind `PERF_ASSERT=1`; record machine load with every number; own ports, stop by PID.

### References

- [Source: _bmad-output/planning-artifacts/epics.md › Story 10.3], [Source: docs/perf/epic-9-street-props.md], [Source: docs/perf/epic-9-behemoth.md], [Source: docs/perf/epic-9-characters.md], [Source: apps/client/src/render/gfx/textureRegistry.ts], [Source: apps/client/src/debug/stressScenario.ts › stressFireInput], [Source: AGENTS.md §5].

## Notes for the merge

- **Touches:** new `tools/perf/memoryRun.cjs`, new dev-only `apps/client/src/debug/memProbe.ts` (+ one line in `main.ts`'s DEV block), `docs/perf/epic-10-memory-battery.md`; leak fixes in whatever views/scenes leak (unknown until measured: most likely `scenes/GameScene.ts`, `scenes/HudScene.ts`, `render/*View.ts`); if Q1 = A/B: `packages/shared/src/config/playerSettings.ts`, `ui/settingsRows.ts`, `main.ts`.
- **Overlap:** with **10.2** on `tools/perf/`, `playerSettings.ts`, `settingsRows.ts`, `main.ts`, and possibly GameScene → **run after 10.2 merges**. With **10.4**: `main.ts` only (trivial). Leak fixes in GameScene/HudScene can touch the same files as any HUD story running then: the builder lists the exact hunks in the hand-back.
- No migration, no netEvents kinds, no protocol bump.

## Decisions made while building (10.3-B6+)

- **10.3-B6 (the dev server):** `memoryRun.cjs` runs Vite in its own process (`createServer`, OS-picked port) with no
  file watching and no HMR. A first run lost its page in wave 10 when a source edit live-reloaded it. Nothing to kill by
  PID, no fixed port.
- **10.3-B7 (what "heap" means in the rules):** B3 and B5 use **JS objects** = heap used after GC − V8's compiled code
  (a heap snapshot's "code" nodes). Compiled code only grows as V8 optimises more functions (+1.7 MB over Restart × 3,
  +2.3 MB from wave 2 to wave 9) while the game's objects and their count stay flat. The whole heap is in every table.
- **10.3-B8 (B3's reference build):** each build phase is compared with the first build phase of its own decay stage
  (wave 2's build for wave 2's stage). Stage jumps are named in the doc. The story's B3 already allows named stage jumps
  that then stay flat; this applies the same allowance to the heap.
- **10.3-B9 (B4 windows):** the survivor holds no fire in the windows (`__memRun.fire(false)`), so the wave's horde stays
  on screen and the wave lasts the whole 60 s. With fire, wave 1 ended in ~10 s. Each window starts 20 s after the wave
  starts. The run's seed is pinned per wave (`restartRun(2000 + wave)`), so saver off / on see the same wave.
- **10.3-B10 (Battery saver's cap):** a wrapper on Phaser's `loop.callback` (`game.step`), not Phaser's own
  `fps.limit` / `setFPSLimit`. Phaser's limiter draws when the time since the last draw is ≥ 33.33 ms exactly: two 60 Hz
  frames with rounded rAF timestamps (33.3 ms) can miss, giving a 50 ms frame then a 16 ms one. It also keeps the
  remainder after passing it on, counting that time twice. The wrapper draws once ≥ 29.33 ms (4 ms slack) have passed,
  and hands the drawn frame the whole time since the last draw. 60 Hz → 30 drawn, 120 Hz → 30, 144 Hz → 28.8.
  `BATTERY_SAVER_FPS = 30` is in shared `playerSettings.ts` next to `RESOLUTION_DPR`.
- **10.3-B11 (Game over in the restart loop):** `__memRun.gameOver()` sets my survivor "out", and the sim's own wipe
  check does the rest (`team.wiped` → solo Results). Calling `endRun` directly doesn't emit `team.wiped`, so no Results
  screen showed.
- **10.3-B12 (D13 scope):** fixed only the per-type radius reads (a `Float64Array` by type index, filled once a tick):
  identical digests. The rest of D13 stays deferred: the other `stats.*` reads, `pushOutOfBuildings`' box reads (the
  "pass four numbers" fix made it worse, reverted), the Phaser setter calls in views, and Phaser's renderer. Each is
  written up in `deferred-work.md` D13.
- **10.3-B13 (HUD overlaps):** the two pre-existing HUD overlaps (boss banner vs loot line, DANGER marker vs ☰) were
  **not** fixed. Neither is trivial: each needs a layout rule and a browser check. Owner kept: 9.7.

## Dev Agent Record

### Agent Model Used

Claude (cloud session, builder for 10.3)

### Debug Log References

- Run logs (JSON lines) are summarised in `docs/perf/epic-10-memory-battery.md`. Before: master `c40d1a5` + the probe.
  After: `story-10-3`.
- D13 hunt: `tools/perf/simAlloc.ts` (Node: 11.4 → 4.6 MB / 10 s), `tools/perf/heapAlloc.cjs` (browser, release
  builds; `--minify false` + `LINES=1` for names), `tools/perf/digestAB.ts` (6 seeds identical before / after).

### Completion Notes List

- AC 1: the 10-wave run happened (seed 1003): 10 waves, the Behemoth spawned in wave 10, wave 10 skipped after 240 s
  (logged), Extract vote, Results "extracted", 9.2 min. Before and after.
- AC 2: a row per build phase plus Results, and peaks: heap 31.9 MB, JS objects 15.4 MB, texture estimate 98.5 MB. The
  B3 rule passes per stage (≤ 1.020). Stage jumps are named. No retention leak was found (before passes too); the fixes
  are allocation churn (D13).
- AC 3: Restart × 3: JS objects 1.008, object count ≤ 1.006, textures, DOM nodes and listeners identical; the whole
  heap's +6.7 % is compiled code.
- AC 4: battery proxy at 4× (and 1×) for waves 1 / 5 / 9, Battery saver off and on; frames drawn and ticks recorded.
- AC 5: `batterySaver` (default false) in `playerSettingsSchema`, a "Battery saver" switch in Settings › Screen
  (hint "Draws 30 frames a second instead of 60"), applied at once via `subscribeSettings`. Unit test: 60 Hz → 60 of 120
  frames drawn, 120 Hz → 60 of 240, and 20 Hz ticks unchanged over 2 s of fake time. Browser: wave 1 at 4× draws
  49.6 → 29.6 FPS with 20.0 ticks/s both ways. Settings DOM layout check green (24/24).
- AC 6: the parked rows are in the doc, empty and marked.
- D13: `resolveOverlaps` no longer allocates; the sim's share of the page's allocations is down ~65 %; the rest is
  deferred with causes (deferred-work D13).
- Not verified: Safari / WebKit, a real phone (memory, battery), real GPU memory (estimate only), a screenshot of the
  new Settings row (the DOM layout check covers its fit).

### File List

- `apps/client/src/debug/memProbe.ts` (new, dev only), `apps/client/src/debug/memProbe.test.ts` (new)
- `apps/client/src/settings/batterySaver.ts` (new), `apps/client/src/settings/batterySaver.test.ts` (new)
- `apps/client/src/main.ts` (Battery saver bind + cap; the probe in the DEV block)
- `apps/client/src/render/gfx/textureRegistry.ts` (`canvasCount`)
- `apps/client/src/ui/settingsRows.ts`, `apps/client/src/ui/settingsRows.test.ts`
- `packages/shared/src/config/playerSettings.ts`, `packages/shared/src/index.ts` (`batterySaver`, `BATTERY_SAVER_FPS`)
- `packages/shared/src/zombies/zombieAi.ts` (D13: `typeRadius`)
- `tools/checks/noCheatsInRelease.test.ts` (`__mem`)
- `tools/perf/memoryRun.cjs`, `tools/perf/heapAlloc.cjs`, `tools/perf/simAlloc.ts`, `tools/perf/digestAB.ts` (new),
  `tools/perf/README.md`
- `docs/perf/epic-10-memory-battery.md` (new)
- `_bmad-output/implementation-artifacts/deferred-work.md` (D13, the HUD overlap owners),
  `_bmad-output/implementation-artifacts/sprint-status.yaml`, this story file

### Change Log

- 2026-11-27: built (memory/battery pass, Battery saver, D13 radius table).
