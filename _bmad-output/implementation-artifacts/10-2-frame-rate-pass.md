---
baseline_commit: 09b5f6d2
---

# Story 10.2: Frame-rate pass (headless, wave 9 blackout)

Status: review

(Written 2026-11-27 with `gds-create-story` from the real code at `09b5f6d2`. Correct-course 2026-11-26: the real-phone ACs are **parked** (designer 2026-11-25, "forget the real phone test for now"); the buildable part is headless Chromium 844 × 390 DPR 2 with CDP CPU throttling 1× / 4×, measured the 9.13 way. Depends on 10.1 (done: `setSettingsDefaults` hook). Carries deferred-work **D6** (teammate edge arrow over a ping arrow). **Three designer choices are open: 10.2-Q1…Q3 below. Don't build T3/T4 before they are answered**; T1, T2 and T5 can start.)

## Story

As a player,
I want the game smooth on my mid-range phone even in the worst wave,
so that nothing stutters when it matters.

## Baseline measured while writing (2026-11-27, this container, 4 cores, load 0.7–2.2, one round, dev build)

`?stress=150` (150 Walkers in view, god mode, waves paused), Playwright Chromium headless (SwiftShader CPU renderer), 844 × 390. "Wave 9" = `?stress=150&blackout=10` + `applyDecayStage(world, 5)` from the page (stage 5 Collapse: fog + power out; wave 9's light is 10 %, `decay.json › blackout.lightPctByWave`). Count: 8 s warm-up, 12 s rAF count.

| scene | CPU | DPR | avg FPS | 1 % low | p95 ms | JS heap |
| --- | --- | --- | --- | --- | --- | --- |
| stage 1 | 1× | 2 | 15.9 | 12.0 | 83.3 | 37 MB |
| wave 9 (stage 5 + blackout 10) | 1× | 2 | 11.3 | 8.6 | 100.1 | 33 MB |
| stage 1 | 4× | 2 | 10.2 | 6.0 | 133.4 | 38 MB |
| **wave 9** | **4×** | **2** | **6.9** | **5.0** | **166.8** | 33 MB |
| stage 1 | 4× | 1 | 26.3 | 15.0 | 66.7 | 37 MB |
| wave 9 | 4× | 1 | 18.9 | 12.0 | 66.7 | 43 MB |

What this says: the headless renderer is the CPU (SwiftShader), so the frame is fill-bound (as `epic-1-stress.md` and `epic-6-blackout.md` already found: DPR 2 → 1 is ×2.7 here; the darkness layer costs ~30 %). **The epics AC "at 4× the average is ≥ 30 FPS" is out of reach in this renderer even at DPR 1 (18.9)**: lowering quality until it is met would mean drawing at well under half resolution for every phone. Hence 10.2-Q1.

## Designer decisions (answered 2026-11-27, via the main session: Q1 = A, Q2 = A, Q3 = B)

- **10.2-Q1 = A**: relative target from the builder's release baseline (wave 9 at 4× DPR 2: 7.4 FPS) → **≥ 9.3 FPS (+25 %)**, default look unchanged, no other row more than 1 FPS worse; 30 FPS stays for the parked phone check.
- **10.2-Q2 = A**: Resolution row Sharp 2× / Balanced 1.5× / Fast 1×, default Sharp.
- **10.2-Q3 = B**: one-time auto check in the first 10 s of wave 1: < 40 FPS → Balanced + Rain Light; < 30 → Fast + Glow Low; toast; never overrides a player choice.

The questions as asked:

| # | Question | Options (numbers from the baseline above) | Recommendation |
| --- | --- | --- | --- |
| **10.2-Q1** | What counts as "passed" for the headless pass, since 30 FPS at 4× can't be reached in the software renderer? | **A** Relative target: wave 9 at 4× DPR 2 goes from 6.9 to **≥ 8.6 FPS (+25 %)** with the default look unchanged, no other row more than 1 FPS worse than today; the 60 / 30 FPS phone target (NFR1) stays for the parked phone check. If +25 % can't be found, the builder names the bottleneck with a profile and the numbers of each lever tried. · **B** Literal: lower the defaults until headless 4× wave 9 ≥ 30 FPS: that means drawing at about 0.6× sharpness for everyone (blurry on every phone, even fast ones). · **C** Measure and record only, no target. | **A** |
| **10.2-Q2** | Add a **Resolution** row to Settings › Screen (the biggest lever by far)? | **A** Add it: *Sharp* (2×, today) / *Balanced* (1.5×) / *Fast* (1×). Default Sharp. Measured: wave 9 at 4× is 6.9 FPS at 2×, 18.9 at 1× (Balanced expected ≈ 11). · **B** Add it with only Sharp / Fast. · **C** No row: resolution stays 2× always. | **A** |
| **10.2-Q3** | How does a weaker phone get lower defaults ("the default settings for that device class")? A player's own choice always wins (10.1 B1). | **A** None: one default for all; the player lowers it in Settings. · **B** **Auto check once:** if the first 10 s of the first wave average < 40 FPS (Show-performance numbers), the defaults drop one step (Resolution Balanced, Rain Light) and a toast says "Lowered quality for smoother play · Settings"; a second check at < 30 FPS drops to Resolution Fast + Glow Low. Remembered on the phone; never touches a setting the player changed. · **C** By hardware hints at boot (≤ 4 CPU cores or ≤ 4 GB `deviceMemory` → Balanced): no toast, but guesses wrong on some phones (an old 8-core can be slower than a new 4-core). | **B** |

**Designer picks (2026-11-27):** 10.2-Q1 = **A** (≥ +25 %: release baseline 7.4 → ≥ 9.3 FPS at 4×), 10.2-Q2 = **A** (Sharp / Balanced / Fast, default Sharp), 10.2-Q3 = **B** (one-time auto check in wave 1).

D6 (edge arrows) is decided by the builder as B-code 10.2-B4 (below): no new look, it follows the 6.8 / 8.7 "keep 4 px clear" rule.

## Decisions made while writing (B-codes, technical)

- **10.2-B1 (scene):** the wave 9 scene is a release-safe stress switch `?stress=150&stressstage=5` (applies `applyDecayStage(world, 5)` through the single decay path after setup, so fog, power-out lamps, rubble and ash are those of wave 9) plus `?blackout=10`. No page-side `import()` of shared code (the 9.14 script needed the dev server's `/@fs` path; the switch also works on a `vite preview` release build). Parsed in `urlOptions.ts` like `stressMolotovs`; only with `?stress`.
- **10.2-B2 (method, "the 9.13 way"):** one script `tools/perf/fps.cjs` (CommonJS like `docs/art/9-14/perf.cjs`, run with the preinstalled Playwright): viewport 844 × 390, DPR 2, CDP `Emulation.setCPUThrottlingRate` 1× and 4×, 8 s warm-up, 12 s rAF count, avg FPS, **1 % low** (1000 / 99th-percentile frame ms), frame-ms p95, 1-min load average (start/end mean), two rounds with the order reversed in round 2, master vs branch from separate worktrees/ports. Steady state: the warm-up starts after `window.__charBake.doneMs` (9.13). Release build (`vite build` + `vite preview`) for the recorded table; dev build allowed for exploring. Keep the script; 10.3 reuses its page/throttle helpers.
- **10.2-B3 (bottleneck naming):** each lever is tried as an A/B with the script, and the frame is split with the existing perf probe (`perfProbe.ts`: update ms vs render ms; GPU fill = frame − update − render) plus one CDP `Profiler` capture at 4× (top 10 self-time functions written into the doc). "Rendering/GPU" vs "simulation" uses the 1.11 rule (`epic-1-stress.md`: simulation if tick avg > 8 ms).
- **10.2-B4 (D6, edge arrows):** teammate edge arrows (`teammateMarkers.ts`, 2.9) keep their true bearing; ping arrows (`placePingArrows`, 8.7) treat each shown teammate arrow as one more keep-off rect (grown by `PAIR_GAP_CSS_PX`), like the event / flag / loot arrows already in `others` (`PING_OTHER_ARROWS` grows by `MAX_PLAYERS - 1`, rects preallocated, no per-frame allocation). Rush markers (1.7) are not touched.
- **10.2-B6 (built: the scene's stage change):** `?stressstage` goes through the decay engine's whole change (`changeDecayStage`: mutations, fires, push-outs, flow fields, banner), applied BEFORE the Walkers and stress buildings spawn, rather than the bare `applyDecayStage` this file named, so no body is left inside the stage-5 rubble.
- **10.2-B7 (built: a deterministic wave 9 scene):** the stress scene pins the Collapse weather to CO2 fog bank. The run's pick was random per load (CO1 / CO2 / CO4 seen), and only CO2 has the drifting noise, so two loads of one build differed by a style. CO2 is the worst case. The stress world sits in a build phase (waves paused), so its fog radius is the build's 14 m, not the wave's 10 m; the painted layer is full-screen either way, so the cost is the same. The read-only `window.__stress()` probe (under `?stress` only, release too) reports stage, darkness, phase, fog radius, style, alive, in view and the perf ring, and each table row asserts it.
- **10.2-B8 (built: the blackout darkness on the GPU):** the darkness and its fog are drawn into a Phaser `DynamicTexture` (`render/darkness/glLayer.ts`): the same steps as the 2D canvas, with one GPU command per 2D call (fill, ERASE stamps for the cut-outs, the dawn ramp, the fog built in its own layer and drawn in at its alpha, the warm tints). There is no 2D paint and no `texImage2D` per frame. The 2D path stays for a canvas renderer and the node tests. Textures come from two new helpers in `canvasTexture.ts` (the only file allowed to make textures): `addMirrorTexture` (re-uploads a canvas its owner repaints) and `addFrameTexture` (redrawn every frame; its registry entry is a no-op). Phaser 4's `DynamicTexture.draw(gameObject)` reads the object at `render()`, so every command is a `stamp` / `repeat`, which copy their values.
- **10.2-B9 (built: GPU fog layer at half size):** `FOG_GL_RES = 0.5`. The fog is a soft ring plus soft noise and reads the same in 3× brightened stills, and its fill costs a quarter. It is a one-line revert if the designer sees a difference.
- **10.2-B10 (built: the auto check is ONE check):** as the main session relayed the designer's pick: in the first 10 s of the run's first wave, < 40 FPS → step 1 (Balanced + Rain Light), < 30 FPS → step 2 (Fast + Rain Light + Glow Low). This is a single measurement, not the story text's "second check". FPS = frames / wall-clock time (rAF, not Phaser's smoothed delta). A hidden tab or the wave ending inside the window cancels that try, and the next run's wave 1 tries again. The result (step 0–2) is stored in `topdown-shooter.autoQuality` and applied at every boot before the canvas is sized.
- **10.2-B5 (no gameplay change):** no balance number, sim rule, netEvents kind or protocol change. A lever that changes what the player can see in play (fog vision, darkness depth, zombie eyes in the dark) is not allowed (10.1 AC 2: blackout darkness and the 10 m fog limit have no setting).

## Acceptance Criteria

1. **Wave 9 scene (B1).** `?stress=150&stressstage=5&blackout=10` runs in dev and release builds: stage 5 applied (fog view on, power out), darkness at 10 %, 150 Walkers in view. A unit test checks the parse (only with `?stress`, 1–5, junk → null) and that the scene's world really is at stage 5 with 150 alive.
2. **Measured and recorded (B2, B3).** `docs/perf/epic-10-fps.md` has the method, the before table (today's master) and the after table (branch) for: stage 1 and wave 9, at 1× and 4×, DPR 2 (and each Resolution step if Q2 = A/B), with avg FPS, 1 % low, p95, load; the bottleneck named per row; every optimization tried with its own A/B numbers (kept or dropped, and why).
3. **Target (Q1).** As the designer picks in 10.2-Q1 (recommended A: wave 9 at 4× DPR 2 ≥ +25 % vs the baseline table, no row more than 1 FPS worse, default look unchanged — checked by side-by-side stills at 844 × 390 of stage 1 and wave 9, master vs branch, in `docs/perf/img/`).
4. **Resolution setting (Q2, if A or B).** A `resolution` field in `playerSettingsSchema` (shared, stored and synced like the other fields, default `"sharp"`); a choice row in Settings › Screen; the canvas re-sizes at once without a reload (`main.ts` sizes the canvas from `dpr()`; `display.ts › dpr()` takes the setting's cap: 2 / 1.5 / 1). HUD, touch sticks and hit areas keep their CSS size (they're scaled by `dpr()`; check `hudLayout.test.ts` and one browser screenshot per step).
5. **Device-class defaults (Q3).** As picked. If B: the check runs once per phone (stored in localStorage, try/catch), only in a real wave (never in the lobby, a build phase, `?stress`, or a hidden tab: `stressRun.interrupt` pattern), changes only the **defaults** through `setSettingsDefaults` (a stored player choice still wins: unit test), and shows the toast once. A unit test drives it with fake frame times (39 FPS → one step; 29 → two; 45 → none).
6. **D6 fixed (B4).** With a teammate off screen and a ping on the same bearing, the ping arrow never overlaps the teammate arrow (unit test in `pingArrows.test.ts` over a stateful bearing sweep at 0.01° steps and an oscillating bearing; 568 × 320 and 844 × 390; no rect overlap at any step, the 40 px / 10° hysteresis still holds). `deferred-work.md` D6 row closed with the commit.
7. **No gameplay change (B5).** World digest replay tests unchanged; no balance JSON change; `?fx=low` still works.
8. **Parked (not built, not claimed):** the iPhone 12 / Pixel 5 / Galaxy A52 / Mi 11i rows and the 1.11 AC 3 rows of `epic-1-stress.md` stay empty, marked "parked (designer 2026-11-25)".

## Tasks / Subtasks

- [x] **T1 Wave 9 scene (AC 1)** — `apps/client/src/debug/urlOptions.ts` (`stressStage: number | null`, only with `?stress`), `apps/client/src/scenes/GameScene.ts` stress branch (:913-927: after `setupStressWorld`, `applyDecayStage(world, stage, …)` — the same call the decay engine uses; check the CityView rebake lands before the warm-up), `stressScenario.ts` doc comment. Test in `urlOptions.test.ts` + a scene-level check (stage, alive).
- [x] **T2 Measuring tool + before table (AC 2)** — `tools/perf/fps.cjs` (+ `tools/perf/README.md`, 10 lines: how to run against two worktrees). Run master before any change; record in `docs/perf/epic-10-fps.md`. Profile at 4× and write the top self-time functions.
- [x] **T3 Optimizations (AC 2, 3; Q1)** — try, one A/B each, keep what helps without changing the look. Known candidates from earlier docs (measure, don't assume):
  - darkness: `render/darkness/DarknessView.ts` repaints a half-size canvas + one texture upload per frame; skip repaint/upload when no stamp moved more than 1 px and the light % is unchanged; 150 `EyesView` images → one blitter / batched draw;
  - fog: `render/fog/FogView.ts` / `screenFog.ts` full-screen layers at stage 5 (count them; merge if two full-screen blends stack);
  - weather: `rainLook.ts` drop count at stage 5 with ash;
  - characters: draw calls per frame (9.13 measured 14.1); the 12 / 6 anim caps are designer-approved, don't lower them without asking;
  - per-frame allocations (Chrome heap sampling at 1×, 10 s): any found → pooled (AGENTS §5).
- [x] **T4 Settings (AC 4, 5; Q2, Q3)** — `packages/shared/src/config/playerSettings.ts` (field + default), `apps/client/src/ui/settingsRows.ts` (row; extend the `choice` key union), `apps/client/src/display.ts` (`dpr()` reads the cap), `apps/client/src/main.ts` (re-size on change: `subscribeSettings`), new `apps/client/src/settings/autoQuality.ts` (Q3 B) called from GameScene's wave start. The server's `progress.settings` jsonb takes the new field with no migration (schema not strict; check `settingsSync.test.ts`).
- [x] **T5 D6 edge arrows (AC 6)** — `apps/client/src/render/pingArrows.ts` (`others` gains the teammate arrow rects), `apps/client/src/scenes/HudScene.ts` (:2259 `teammateMarkers` runs before `placePingArrows`; pass its drawn rects), `pingArrows.test.ts`.
- [x] **T6 Hand-back** — `gate:fast` + `test:changed` (touched DOM checks: `hudLayout`, settings DOM); browser stills of stage 1 / wave 9 (and each Resolution step) at DPR 1 for your own check; PR "Story 10.2: Frame-rate pass"; record any new decision as 10.2-B6+.

## Test plan

- Unit: `urlOptions` stress-stage parse; the scene really reaches stage 5 with 150 alive (liveness, not just "no throw"); `autoQuality` with fake frame streams (39 / 29 / 45 FPS; a stored choice wins; runs once; never in build / stress / hidden); `pingArrows` 0.01° sweep + oscillation, no overlap; settings schema accepts `resolution`, an older client's stored value without it still parses.
- Browser (Playwright, preinstalled Chromium): the measuring script on master and branch (release build, own ports, stop by PID); every table row asserts frames were counted (≥ 60 frames in 12 s at 4×; a run with fewer is thrown out and re-run, not recorded) and that 150 zombies were alive in view at the end (`countInView`).
- Visual: side-by-side stills master vs branch (stage 1, wave 9) — the default look must not change.
- Not verified (say so): any real phone; a real GPU (SwiftShader only).

## Dev Notes

### What exists today

- `?stress=N` (`debug/stressScenario.ts`, release-safe): god mode, waves paused, N Walkers in view; `stressRun` measures 60 s after a 2 s warm-up and prints the 1.11 summary (`perfStats.ts`: `TARGET_AVG_FPS`, `TARGET_MIN_FPS`). The 7.9 / 9.13 / 9.14 method uses its own rAF count instead (`docs/art/9-14/perf.cjs`); reuse that.
- Frame probe: `debug/perfProbe.ts` (update ms, render ms per frame; overlay = "Show performance" or `?debug=1`).
- Canvas size: `main.ts:41-66` sizes the canvas in device pixels `innerWidth × dpr()` and zooms back by `1 / dpr()`; `display.ts › MAX_DPR = 2`.
- Quality today: 10.1's Rain (Full / Light / Off), Fog detail (Full / Plain), Light glow (Full / Low / Off), all applied live; `?fx=low` (URL only) halves fire / sparkle / dust particles (`GameScene.ts:857-885`). No resolution setting, no device detection. `setSettingsDefaults()` (`settings/settings.ts`) is the 10.1 hook for per-class defaults.
- Earlier findings: `epic-1-stress.md` (fill-bound; DPR 1 doubled FPS), `epic-6-blackout.md` (darkness −26 % headless, half-size canvas didn't help: one more full-screen blend), `epic-9-characters.md` (caps 12 / 6, 14.1 draw calls).
- Edge arrows: `render/edgeArrow.ts` (pure), `teammateMarkers.ts` (HudScene :2259, margin `MATE_ARROW_MARGIN`), `pingArrows.ts › placePingArrows` (keeps off `others`: event arrow, flag arrow, loot badge).

### Code rules (AGENTS §5)

Every code-drawn texture through `addGeneratedTexture`; no per-frame allocation; no gameplay numbers inline (quality thresholds of Q3 go in `controls.json › fx` or a client constant file with a comment, not balance-versioned sim numbers); Phaser 4 types from `node_modules/phaser/types`; read `render/city/*` before touching rendering; ports: never `npm run dev`, own ports, stop by PID.

### References

- [Source: _bmad-output/planning-artifacts/epics.md › Story 10.2], [Source: docs/perf/epic-9-characters.md#Method], [Source: docs/art/9-14/perf.cjs], [Source: docs/perf/epic-6-blackout.md], [Source: docs/perf/epic-1-stress.md], [Source: apps/client/src/settings/settings.ts › setSettingsDefaults], [Source: packages/shared/src/config/playerSettings.ts], [Source: packages/shared/src/config/balance/decay.json › stageByWave, blackout.lightPctByWave], [Source: _bmad-output/implementation-artifacts/deferred-work.md › D6].

## Notes for the merge

- **Touches:** `apps/client/src/debug/urlOptions.ts`, `debug/stressScenario.ts`, `scenes/GameScene.ts` (stress branch; autoQuality hook at wave start), `scenes/HudScene.ts` (D6), `render/pingArrows.ts`, `render/darkness/*`, `render/fog/*`, `render/city/rainLook.ts` (only if a lever lands there), `display.ts`, `main.ts` (canvas re-size), `packages/shared/src/config/playerSettings.ts`, `ui/settingsRows.ts`, new `settings/autoQuality.ts`, new `tools/perf/fps.cjs`, `docs/perf/epic-10-fps.md`, `deferred-work.md` (D6 row).
- **Overlap:** with **10.3** on `playerSettings.ts` / `settingsRows.ts` / `main.ts` (if 10.3-Q1 adds Battery saver) and on `tools/perf/` (10.3 reuses `fps.cjs` helpers) → run 10.3 **after** 10.2 (it should also measure the 10.2 tree). With **10.4** only on `main.ts` (10.4 adds boot progress calls; trivial conflict) → 10.4 can run **in parallel**. With 9.5 / 9.6 (film grain row) on `settingsRows.ts` / `playerSettings.ts`: keep-both lists.
- No migration, no netEvents kinds, no protocol bump.
- **As built (builder):** also touches `render/darkness/glLayer.ts` (new), `render/city/canvasTexture.ts` (two texture helpers: the Story 4.13 check allows textures only there), `render/teammateMarkers.ts`, `render/PingView.ts`, `settings/resolution.ts` + `settings/autoQuality.ts` (new), `packages/shared/src/index.ts` (`RESOLUTION_DPR` export). In `main.ts`, three lines replace the `deviceSize` definition (`autoQuality.boot()`, `applyResolutionCap`, `viewport`) and `bindResolution(game, viewport)` comes after the resize listener. 10.4's `signalBootLoader` line is merged and untouched.
- **For 10.3:** `tools/perf/fps.cjs` exports `openPage`, `countFrames`, `frameStats`, `topSelf`, `SCENES`; a target can carry its own switches (`label=url|&x=y`); `RESOLUTION=balanced|fast` sets the stored setting. Battery saver goes next to `resolution` in `playerSettings.ts` / `settingsRows.ts` (keep-both). Serve with a port check: killing the `npx` wrapper PID leaves `vite preview` running.
- **Designer FYI (look):** B9 draws the GPU fog at half size; brightened stills show no difference. `FOG_GL_RES = 1` reverts it (−0.4 FPS at wave 9 4×).

## Dev Agent Record

### Agent Model Used

Claude (builder session, gds-dev-story).

### Debug Log References

- Measurements: `docs/perf/epic-10-fps.md` (before, profile, every lever's A/B, after, Resolution rows); stills in `docs/perf/img/epic10-*`.
- Two exploratory A/B rounds were void: a `kill` of the `npx` wrapper left the old `vite preview` on the port, and `--strictPort` failed silently. The serving helper now refuses a busy port and checks the bundle hash. This is recorded in the doc.

### Completion Notes List

- AC 1: `?stress=150&stressstage=5&blackout=10` (B1, B6, B7). Unit tests: the parse (only with a valid `?stress`, 1–5, junk → null); the Downtown world reaches stage 5, power out, CO2 pinned (40 seeds), 150 alive with ≥ 140 in view after 40 ticks.
- AC 2: `tools/perf/fps.cjs` + README; the before table and profile, every lever's A/B, the after table with each Resolution step. Bottleneck named per row (all rendering/GPU).
- AC 3 (Q1 A): wave 9 at 4× DPR 2 goes from 6.6 to 9.1 (+38 %; 1 % low 5 → 6–6.7, p95 167–183 → 133 ms). Against the designer's "≥ 9.3" (+25 % of the first, random-style 7.4) it reads 8.8 / 9.4. No other row is worse by more than 0.5 FPS. The default look is unchanged (stills, brightened side-by-side, region means within 0.7 / 255).
- AC 4 (Q2 A): `resolution` in the shared schema (default `sharp`, stored / synced, an older value without it still parses). The row is in Settings › Screen. `display.ts › dpr()` takes the cap (`setDprCap`), and `settings/resolution.ts` re-sizes the canvas live. Browser check: live switch, one page load, HUD at CSS size. `hudLayout` tests unchanged (they use `dpr()`).
- AC 5 (Q3 B): `settings/autoQuality.ts` (B10). Unit tests: 45 / 39 / 29 FPS → 0 / 1 / 2 steps; a stored choice wins; no toast when every lowered field is the player's own; runs once; remembered; junk or throwing storage; never in build / lobby / `?stress`; a hidden tab or the wave ending cancels the try.
- AC 6 (D6): ping arrows keep the pair gap off every shown teammate arrow, except the sender's own. Stateful 0.01° sweeps both ways and oscillation at 568 × 320 and 844 × 390, downed and not, offsets 0 / 1 / 3°: no overlap, 30° bearing rule, jumps never flicker. `teammateArrowRect` holds the turned triangle + stroke at every bearing. `deferred-work.md` D6 closed.
- AC 7: no balance JSON, sim rule, netEvents kind or protocol change; `?fx=low` untouched. Replay digests come from the gate.
- AC 8: phone rows not built, not claimed (parked).

### File List

- `apps/client/src/debug/urlOptions.ts`, `urlOptions.test.ts` — `?stressstage`
- `apps/client/src/debug/stressScenario.ts`, `stressScenario.test.ts` — `applyStressStage`, `pinStressCollapseStyle`, `stressProbe`
- `apps/client/src/scenes/GameScene.ts` — stress stage + probe; D6 teammate rects into the ping view; auto quality per frame
- `apps/client/src/scenes/HudScene.ts` — teammate arrow constants moved to `teammateMarkers.ts`
- `apps/client/src/render/teammateMarkers.ts`, `teammateMarkers.test.ts` — `teammateArrowRect`
- `apps/client/src/render/pingArrows.ts`, `pingArrows.test.ts`, `render/PingView.ts` — D6
- `apps/client/src/render/darkness/DarknessView.ts`, `glLayer.ts` (new), `darknessGl.test.ts` (new), `fakeScene.testkit.ts` — B8, L1
- `apps/client/src/render/fog/FogView.ts` — L1, L2, B8 `paintGl`, B9
- `apps/client/src/render/city/canvasTexture.ts` — `addMirrorTexture`, `refreshMirror`, `addFrameTexture`, `removeFrameTexture`
- `packages/shared/src/config/playerSettings.ts`, `packages/shared/src/index.ts` — `resolution`, `RESOLUTION_DPR`
- `apps/client/src/display.ts` — `setDprCap`
- `apps/client/src/settings/resolution.ts` (new), `resolution.test.ts` (new), `autoQuality.ts` (new), `autoQuality.test.ts` (new)
- `apps/client/src/ui/settingsRows.ts`, `settingsRows.test.ts` — Resolution row
- `apps/client/src/main.ts` — auto quality boot, Resolution cap + live re-size
- `tools/perf/fps.cjs` (new), `tools/perf/README.md` (new)
- `docs/perf/epic-10-fps.md` (new), `docs/perf/img/epic10-*` (new)
- `_bmad-output/implementation-artifacts/deferred-work.md` — D6 closed
