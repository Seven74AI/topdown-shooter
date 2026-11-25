# Story 9.13: Photoreal characters in the game

Status: ready-for-dev

## Story

As a player,
I want the approved photoreal survivors and zombies in the game, animated,
so that the characters match the premium look of the rest.

Approved look: **take 4 with today's grey see-through outline** (designer 2026-11-25, "the new gray outline version is perfect"). Page `docs/art/photoreal-2/take4-grey.html`; source `docs/art/photoreal-2/src/take4.ts` (built with `KEEP_OUTLINE = true` by `src/build4grey.mjs` + `src/page-4grey.html`), `src/commonz.ts` (new Walker / Runner / Crawler designs); Meshy refs `docs/art/photoreal-2/refs/` (references only). Declined: takes 1, 2, 3 — **never rebuild the bodies; keep today's drawings and every detail, raise the rendering.** Decisions: `docs/art/photoreal-decisions.md` (Zombies and survivors row), `docs/art/visual-direction.md`.

## Acceptance Criteria

1. **The look.** Survivors (every weapon frame, the running chainsaw, every Story 7.8 look), Walkers A–D, Runners A–B, Crawlers A–B, Spitters A–B (normal + windup), Brutes BR1–BR5 (normal + windup) and Bloaters BL1–BL5 (base + swell 1–3) are drawn in the game with take 4's relit look (rounded volumes, cool key light, cloth weave, skin mottle, gloss, separate emissive layer) **with the outline kept exactly as today** (KEEP_OUTLINE rule: pixels with lum < 0.09 pass through unlit). Walkers, Runners and Crawlers use the new `commonz.ts` designs. A side-by-side still at 844×390 (DPR 2) next to the approved page reads as the same look (same palette, details, outline).
2. **The animations**, per take 4's `animated()` parameters (`ROWS`, `ZOMBIE`, `SURV`): breathing (non-uniform scale) and sway; the glow pulse with bloom (survivor flicker); the sheen drifting over glossy parts; the running chainsaw's shake; Spitter acid drips; Bloater glowing veins with travelling pulses (faster and brighter with swell, BL4 and BL5 too) and glossy throbbing acid sacs with bubbles; the Walker / Runner / Crawler 10-frame crossfaded walk loops (loop lengths from `ROWS`).
3. **No stalls (prepared like 9.11).** The relit pictures are baked in a Web Worker (OffscreenCanvas), with the 9.11 main-thread sliced fallback (`BAKE_MS_PER_FRAME`-style time guard); plain drawings show until each relit picture lands; a graphics restore keeps CPU-backed pictures (sentinel) and re-bakes only if wiped; worker timeout, idle close, frozen-tab deadline, stale-generation drop — the same housekeeping as `buildingsAtlas.ts`. Main-thread max long task from the bake ≤ 6 ms at 1× CPU (report 1× and 4×). The full character bake completes within 15 s at 4× CPU (inside the first build phase).
4. **Performance (hard).** With `?stress=150` at 844×390 DPR 2: average FPS within **2 FPS** of master and frame-time p95 within **+1 ms** of master, measured the 7.9 way (`docs/perf/epic-7-looks.md`: own ports, 8 s warm-up, 12 s count, two rounds in reversed order, 1-min load recorded), at 1× and 4× CPU throttle (Mi 11i stand-in). Animated extras (crossfade, sheen, glow/bloom, Bloater veins/sacs, drips) are **capped and pooled**: new `controls.fx` caps (schema + JSON), nearest-to-camera first, beyond the cap a zombie shows a stepped single frame with breathing only; `?fx=low` halves the caps. No per-frame allocation; no per-frame canvas drawing for zombies beyond the caps.
5. **Survivor looks keep working** (Stories 7.8 / 7.9): each player's body picture (`SurvivorLookTextures`, per look code and decay stage) is relit (worker, one body per frame landing budget kept), the gun frames are relit in the atlas, the propeller layer still rides the head; lobby / results portraits and the editor may stay plain (B9). `survivorParts.raster.test.ts` digest pin stays green (the plain drawings do not change).
6. **Readability.** Zombies vs survivors vs pick-ups read at a glance at 568×320 and 844×390; the grey see-through outline is kept; slot rings, downed / slowed tints, hit flash, spawn-protection blink, Brute / Spitter windups, Bloater swell cue, the 9.12 wall silhouettes (red zombies, slot-colour survivors) and EyesView all still work on the new sprites. New readability items appended to `docs/playtests/milestone-1/readability-sheet.md` from **134** up (130–133 are Story 8.7's).
7. **Coverage.** Every new `ensure…()` builder is called by `apps/client/src/gallery/collect.ts` (baked synchronously there, like `ensureBuildingsAtlas(this,{worker:false})` + `pumpBuildingsAtlas(Infinity,Infinity)`); `tools/checks/galleryCoversAllArt.test.ts` green; every texture through `addGeneratedTexture` (`noUnregisteredTextures` green); `tools/gallery/manifest.json` updated by `npm run gallery:export`; the characters entry moved out of "approved, not in game" per `docs/art/asset-review.md`.
9. **Memory and scope (readiness check 2026-11-25).** The baked character frames' texture memory is measured and recorded in the perf note, and the tab stays inside NFR2 (< 300 MB on iPhone 12) on the stress scene; the screenshot set includes a blackout wave (EyesView eyes within 14 m) and a bear-trap hold. Out of scope, owned elsewhere: the Behemoth's look (9.4), per-weapon holding poses (9.3), dismemberment pieces (9.5).
8. **Gameplay unchanged.** No change to simulation, balance numbers, net messages or the world digest (`LocalSimHost.look.test.ts` green); collision radii and display sizes unchanged (`setDisplaySize(2·r·CHAR_EXTENT_R)`).

## Tasks / Subtasks

- [ ] T1 Port the renderer (AC 1, 3)
  - [ ] `render/city/charRelight.ts`: take4 `relight4` as a resumable generator like `relight.ts › relightSteps` (yield per row / band, `MakeCanvas` injected, no `document`, bloom pre-blurred with `boxBlur` instead of `ctx.filter`), outputs base / glow / bloom / gloss, KEEP_OUTLINE behaviour hard-wired on. Copy `hash2` / `vnoise` / `fbm` from `docs/art/asset-fixes-1/src/lib.ts` (or reuse `groundDamageArt.ts › fbm/hash2` if identical). Rescale every fixed-px constant (blur radii, texture periods, bloom 6 px, drips, vein step/spacing/speed, sac min radius) from the page's 68 px/r to the game resolution (B3).
  - [ ] `render/city/commonzArt.ts`: port `drawWalker2 / drawRunner2 / drawCrawler2` (game code only: bruteArt `artKit`). Fix the clipping the survey found (crawler blood smear ~1.83 r vs extent 1.75; walker fingertips ~1.58 r vs 1.55) by trimming the drawing, not by growing the frame (display size must not change).
- [ ] T2 Character bake (AC 3, 7)
  - [ ] `render/city/charactersFrames.ts` (pure, worker-safe: frame list + `bakeSteps`), `charactersBakeWorker.ts`, and the kept-cache / pump / worker / restore logic in `spriteAtlas.ts` (or a sibling `charactersAtlas.ts`) mirroring `buildingsAtlas.ts`. Separate sheets so a landing picture re-uploads only its sheet; glow+bloom sheet, gloss sheet; all ≤ 2048² (architecture budget).
  - [ ] New frames: walk-loop frames `zombie_<walker|runner|crawler>_<v>_w<0..9>` (keep today's `ZOMBIE_FRAMES` names valid as the plain fallback / frame 0). Keep every existing frame name.
  - [ ] Pump from `ZombieView.update()` (like `BuildingView.update` → `pumpBuildingsAtlas`), not from GameScene.
- [ ] T3 Views (AC 2, 4, 6)
  - [ ] `ZombieView`: two stacked pooled images per zombie for the crossfade (only within the cap), walk phase advanced by distance moved (B8), breathing/sway as scale/rotation offsets, glow/bloom as ADD images on their own depth band (batching), sheen as one ADD image stepping through baked sheen positions (B5), a cap-selection pass every N frames (not every frame), hit flash / windup / swell / fog alpha applied to every layer; keep `shownImages`, `drawnImage`, `forEachSwell` contracts (wall silhouettes, EyesView, BloaterView).
  - [ ] `render/CharacterFxView.ts` (new): Bloater veins + sacs (B6) and Spitter drips (B7), pooled and capped.
  - [ ] `PlayerView` / `SurvivorLookTextures`: relit body per player (worker; repaint budget kept), relit gun frames, SURV breathing/sway/glow flicker, chainsaw shake while cutting.
  - [ ] Caps in `packages/shared/src/config/balance/controls.json` › `fx` + `balanceSchema.ts` (both), e.g. `maxCharacterAnim`, `maxCharacterSheen`, `maxBloaterFx`, `maxSpitterDrips`; `?fx=low` halves them.
- [ ] T4 Gallery + docs (AC 6, 7)
  - [ ] `gallery/collect.ts`: synchronous bake; relit frames + walk loops cut. `npm run gallery:export`; commit `tools/gallery/manifest.json`; update `SUPERSEDED` / approved sections per `docs/art/asset-review.md` (do NOT republish the review artifact — the orchestrator does).
  - [ ] Readability sheet items 134+ with screenshots in `docs/art/9-13/` (DPR 2: 844×390, 568×320, desktop 1280×720): horde at night, horde in rain stage 3, blackout, survivors with 4 looks, Brute + Spitter windup, Bloater swell, a zombie behind a fort wall (silhouette).
- [ ] T5 Tests + perf (AC 3, 4, 8)
  - [ ] `charRelight.raster.test.ts`: KEEP_OUTLINE pass-through (outline pixels unchanged), no step > one readback band, a pinned digest of one relit Walker frame, emissive detection on a Bloater.
  - [ ] Bake housekeeping tests copied from `buildingsBake.raster.test.ts` (stale gen, failure hands frames back, deadline, idle close, frozen tab, restore keeps/re-bakes).
  - [ ] Wiring check `tools/checks/charactersBakeWiring.test.ts` (pump in `ZombieView.update`, gallery bake, restore registration).
  - [ ] Cap tests: never more than the cap animated; `?fx=low` halves; no allocation in `update` (pool sizes stable over 600 frames).
  - [ ] Perf table in `docs/perf/epic-9-characters.md` (before/after, 1× and 4×, load) + bake times (7 reps, median, min–max) + main-thread max long task.

## Dev Notes

### Decisions taken for you (B-codes; log any new ones in the Dev Agent Record)

- **B1 Runtime worker bake, not image files.** The AC says "prepared like 9.11"; the architecture says art atlases are generated in code at load, no character PNGs (`game-architecture.md` asset loading / project tree), and survivors are per-player composed bodies that cannot be pre-made. (Image files are 9.14's question for street props, not this story's.)
- **B2 The baked key light turns with the body.** Top-down sprites rotate with their heading (`ZombieView` `setRotation(atan2)`); today's Spitter / Brute art already bakes its light the same way. No per-rotation bakes. Take 4 has a soft cast shadow but the game draws none for characters today: add it only if it fits the perf budget, as ONE pre-baked blurred black frame per type in world space (offset along `palette.ts › LIGHT_DIR`, not rotating), capped with the anim cap; otherwise leave it out and say so.
- **B3 Resolution.** Output at the game's `CHAR_R_PX = 34` px per radius (frame sizes unchanged), source supersampled so details match the page (page: drawing at 136 px/r, output 68). Choose ss by bake time vs a side-by-side still; record the choice and the numbers.
- **B4 Caps.** Full animation (crossfade, glow, sheen, FX) only for the nearest `maxCharacterAnim` zombies (suggest 40); others step their walk frames without crossfade and breathe only. Survivors always full.
- **B5 Sheen** = an ADD image of the gloss mask × gradient baked at ~8 positions (`sx = sin(0.4t)` is the only parameter), not per-frame canvas work.
- **B6 Bloater veins:** baked pulse frames per look × swell stage (period = spacing / speed), or a capped per-frame Graphics if memory says so; sacs = pooled sprites (body, highlight, halo, bubbles). Cap `maxBloaterFx` (suggest 6).
- **B7 Spitter drips:** pooled; deterministic per zombie id (no `Math.random`); puddles in world space (not rotating with the body); cap.
- **B8 Walk-loop phase follows distance moved** (feet don't slide; a standing zombie stops its loop and only breathes). Loop length in metres = page `loopS` × that type's walk speed.
- **B9 Portraits** (lobby / results / editor tiles, `survivorPortrait.ts`, `partTiles.ts`, `editorPreview.ts`) stay plain in this story unless trivially cheap; note it.
- **B10 Plain fallback:** until a relit picture lands, the plain drawing shows (new designs: their unlit frame 0). No blank frames ever.

### Today's pipeline (read before changing; file:line from the 2026-11-25 survey)

- `render/city/spriteAtlas.ts`: `ATLAS_CHARACTERS` (:19), `CHAR_R_PX = 34` (:24), `ZOMBIE_VARIANTS` (:26), `characterSpecs()` (:172–192), `drawCharacterFrame` (:245–269, faces +x), `ensureAtlases` (:410–433). 60 frames: 20 base zombies, 2 Spitter windups, 5 Brute windups, 15 Bloater swells, 9 one-piece survivor frames (unused, kept for the 7.8 digest pin), 9 gun-only frames (7.9).
- Frame sides from `CHAR_EXTENT_R` (`spriteArt.ts:94–102`): walker 106, runner 102, crawler 119, spitter 160, brute 102, bloater 123, survivor 184 px. Take 4's extents match exactly.
- Outline today: `CHAR.outline = rgba(6,6,6,0.7)` (`spriteArt.ts:81`); kit art (Brute, commonz) uses `rgba(4,4,6,0.95)`. KEEP_OUTLINE passes lum < 0.09 through unlit — that is what reads as the grey see-through line. Do not "fix" it.
- `ZombieView.ts`: one pooled Image per slot, frame from `variantOf` (:49), display size, MULTIPLY tint mode; per frame lerp + rotation (:195–213), fog alpha (:215–222), windup frame + `windupScale` (:229–248), Bloater swell frames + `swellTint` (:270–297), hit flash FILL 80/160 ms (:145–148, :250–254). Hooks `shownImages` (:159), `drawnImage` (:303), `forEachSwell` (:132), `drawn` (:67).
- `PlayerView.ts`: body image → `survivorlook_<id>` frames `pack`/`nopack` (:117), gun under it (`survivorGunFrameFor`, `weaponHidesPack`), tints, blink, propeller via `layerPose`, `bodyImage` getter (:137) for silhouettes.
- `SurvivorLookTextures.ts`: per-player canvas 2×184 × 184, `paintBodies` → `drawSurvivorBody(…, layers=false)` (:138), repaint on code/stage change, `repaintBudget = 1`/frame (:56), `beginFrame()` from GameScene :1844. 7.9 bake was 1.9 ms (1×) / 9.1 ms (4×) for 4 bodies × 2 frames; relighting adds a lot more → it MUST go to the worker.
- `addGeneratedTexture` (`canvasTexture.ts:37–70`) + `textureRegistry` (`render/gfx/textureRegistry.ts`); `noUnregisteredTextures.test.ts` forbids other texture creation.
- 9.11 bake to mirror: `relight.ts` (`relightSteps` :121, `READ_BAND_ROWS` :17), `buildingsFrames.ts › bakeSteps` (:161), `buildingsAtlas.ts` (kept cache :36–63, `WORKER_TIMEOUT_MS` :119, `BAKE_MS_PER_FRAME = 6` :123, `keep` :126, `pumpBake` :149, `sendToWorker` :224, `workerFailed` :256, `rebakeAfterCacheLoss` :276, restore registration :391), `buildingsBakeWorker.ts`. Lessons from 9.11 (`docs/overnight-run-log-2026-11-25.md` :89–101): whole-frame steps caused 150–500 ms hitches; unsplittable draw/readback steps were 123–167 ms at 4×; the worker brought main-thread max to 3.6 ms (1×) / 16.5 ms (4×). **Split the source drawing step too** (draw in bands or per part) if it is the long pole.
- Take 4 internals (`take4.ts`): `relight4` 73–194 (≈17 full sweeps + ~20 hash calls per pixel; emissive by hue/sat/val 95–100; KEEP_OUTLINE 161–165), `animated` 473–555, `prepareBloater` 276–387, `drawBloaterFx` 390–470, `ROWS` 236–246 with seeds `900+i*7` / `1300+i*17`. Page cost ≈ 29.5 M source px for all 131 relights. The page wastes one relight per animated row (old `drawZombie` drawing) — don't copy that. On the page glow / gloss of animated rows come from phase 0 only: in the game use phase-0 glow too (cheaper, same look).
- Wall silhouettes (`WallSilhouetteView.ts`, `wallSilhouette.ts`) copy the body image's texture + frame: point them at the top crossfade layer (or frame 0). No mask filters (cost ~25 % FPS in 9.12).
- Files that Story 8.7 (PR #8, in review) is changing — **do not touch**: `render/PingView.ts`, `render/pingArrows.ts`, `render/eventArrow.ts`, `render/LootBagView.ts`, `scenes/HudScene.ts`. `scenes/GameScene.ts` is also in #8: avoid it; if a hook there is unavoidable keep it to a few lines and list it in the hand-back.

### Performance method

- Solo dev build on your own ports (never `npm run dev`'s fixed ports), `?stress=150`, Playwright viewport 844×390 DPR 2; CPU throttle 4× via CDP `Emulation.setCPUThrottlingRate` (Mi 11i stand-in). Master served from its own worktree on another port. Table as `docs/perf/epic-7-looks.md`. Headless Chromium renders on the CPU: compare columns, not absolutes. The real Mi 11i check is the designer's (say so).
- `?debug=1` overlay and `stressScenario.ts › formatStressReport` give FPS / frame ms / bottleneck.

### Testing standards

- `npm run gate:fast` while working and at hand-back; plus the slow areas you touch: the DOM checks (`*DomLayout.test.ts`, Playwright — CI shard 1 requires them to PASS, not skip), the gallery coverage test, the raster tests, `npm run test:changed`. Do NOT run the full `npm run gate` locally; the PR's CI `gate` is the gate. 2–3 vitest workers.
- Every sim/replay test asserts something happened. Timing asserts behind `PERF_ASSERT=1`.

### Project Context Rules (HANDOFF §3 lessons the reviews keep finding)

- Every texture via `addGeneratedTexture`; no per-frame / per-tick allocation; Phaser 4 ≠ Phaser 3 (check `node_modules/phaser/types`, e.g. `setTint` + `setTintMode`, blend modes); Phaser reuses scene objects on restart (reset state in `create`); exact version pins; no gameplay numbers inline (balance JSON); stop processes by PID only.
- Colour rule: red = danger in play (boss danger and zombies); zombie silhouettes stay red; survivors keep slot colours.
- Never use `bmad-build` (broken here); use `gds-dev-story`.

### References

- `_bmad-output/planning-artifacts/epics.md` › Epic 9 › Story 9.13
- `docs/art/photoreal-decisions.md`, `docs/art/visual-direction.md`, `docs/art/asset-review.md`
- `_bmad-output/implementation-artifacts/9-11-photoreal-things-you-build.md`, `9-12-bodies-behind-walls.md`
- `_bmad-output/planning-artifacts/game-architecture.md` › Client Platform Budgets (atlases ≤ 2048², no per-frame allocation, pools), NFR 60 FPS / never below 30 with 150 zombies
- `docs/perf/epic-7-looks.md` (method), `docs/overnight-run-log-2026-11-25.md` :89–101 (9.11 bake numbers)

## Dev Agent Record

### Agent Model Used

### Debug Log References

### Completion Notes List

### File List
