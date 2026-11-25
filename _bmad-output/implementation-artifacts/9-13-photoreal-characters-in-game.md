---
baseline_commit: 2a889297
---
# Story 9.13: Photoreal characters in the game

Status: done

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
8. **Gameplay unchanged.** No change to simulation, balance numbers, net messages or the world digest (`LocalSimHost.look.test.ts` green); collision radii and display sizes unchanged (`setDisplaySize(2·r·CHAR_EXTENT_R)`).
9. **Follow-up check (readiness check 2026-11-25, added after the story was built in PR #16; not part of its review).** Memory: measured in `docs/perf/epic-9-characters.md` › Memory (JS heap 83–111 MB on `?stress=150`, headless); the NFR2 check on a real iPhone 12 stays with Story 10.3. Check on the built game that the screenshot set includes a blackout wave (EyesView eyes within 14 m) and a bear-trap hold. Out of scope, owned elsewhere: the Behemoth's look (9.4), per-weapon holding poses (9.3), dismemberment pieces (9.5).

## Tasks / Subtasks

- [x] T1 Port the renderer (AC 1, 3)
  - [x] `render/city/charRelight.ts`: take4 `relight4` as a resumable generator like `relight.ts › relightSteps` (yield per row / band, `MakeCanvas` injected, no `document`, bloom pre-blurred with `boxBlur` instead of `ctx.filter`), outputs base / glow / bloom / gloss, KEEP_OUTLINE behaviour hard-wired on. Copy `hash2` / `vnoise` / `fbm` from `docs/art/asset-fixes-1/src/lib.ts` (or reuse `groundDamageArt.ts › fbm/hash2` if identical). Rescale every fixed-px constant (blur radii, texture periods, bloom 6 px, drips, vein step/spacing/speed, sac min radius) from the page's 68 px/r to the game resolution (B3).
  - [x] `render/city/commonzArt.ts`: port `drawWalker2 / drawRunner2 / drawCrawler2` (game code only: bruteArt `artKit`). Fix the clipping the survey found (crawler blood smear ~1.83 r vs extent 1.75; walker fingertips ~1.58 r vs 1.55) by trimming the drawing, not by growing the frame (display size must not change).
- [x] T2 Character bake (AC 3, 7)
  - [x] `render/city/charactersFrames.ts` (pure, worker-safe: frame list + `bakeSteps`), `charactersBakeWorker.ts`, and the kept-cache / pump / worker / restore logic in `spriteAtlas.ts` (or a sibling `charactersAtlas.ts`) mirroring `buildingsAtlas.ts`. Separate sheets so a landing picture re-uploads only its sheet; glow+bloom sheet, gloss sheet; all ≤ 2048² (architecture budget).
  - [x] New frames: walk-loop frames `zombie_<walker|runner|crawler>_<v>_w<0..9>` (keep today's `ZOMBIE_FRAMES` names valid as the plain fallback / frame 0). Keep every existing frame name.
  - [x] Pump from `ZombieView.update()` (like `BuildingView.update` → `pumpBuildingsAtlas`), not from GameScene.
- [x] T3 Views (AC 2, 4, 6)
  - [x] `ZombieView`: two stacked pooled images per zombie for the crossfade (only within the cap), walk phase advanced by distance moved (B8), breathing/sway as scale/rotation offsets, glow/bloom as ADD images on their own depth band (batching), sheen as one ADD image stepping through baked sheen positions (B5), a cap-selection pass every N frames (not every frame), hit flash / windup / swell / fog alpha applied to every layer; keep `shownImages`, `drawnImage`, `forEachSwell` contracts (wall silhouettes, EyesView, BloaterView).
  - [x] `render/CharacterFxView.ts` (new): Bloater veins + sacs (B6) and Spitter drips (B7), pooled and capped.
  - [x] `PlayerView` / `SurvivorLookTextures`: relit body per player (worker; repaint budget kept), relit gun frames, SURV breathing/sway/glow flicker, chainsaw shake while cutting.
  - [x] Caps in `packages/shared/src/config/balance/controls.json` › `fx` + `balanceSchema.ts` (both), e.g. `maxCharacterAnim`, `maxCharacterSheen`, `maxBloaterFx`, `maxSpitterDrips`; `?fx=low` halves them.
- [x] T4 Gallery + docs (AC 6, 7)
  - [x] `gallery/collect.ts`: synchronous bake; relit frames + walk loops cut. `npm run gallery:export`; commit `tools/gallery/manifest.json`; update `SUPERSEDED` / approved sections per `docs/art/asset-review.md` (do NOT republish the review artifact — the orchestrator does).
  - [x] Readability sheet items 134+ with screenshots in `docs/art/9-13/` (DPR 2: 844×390, 568×320, desktop 1280×720): horde at night, horde in rain stage 3, blackout, survivors with 4 looks, Brute + Spitter windup, Bloater swell, a zombie behind a fort wall (silhouette).
- [x] T5 Tests + perf (AC 3, 4, 8)
  - [x] `charRelight.raster.test.ts`: KEEP_OUTLINE pass-through (outline pixels unchanged), no step > one readback band, a pinned digest of one relit Walker frame, emissive detection on a Bloater.
  - [x] Bake housekeeping tests copied from `buildingsBake.raster.test.ts` (stale gen, failure hands frames back, deadline, idle close, frozen tab, restore keeps/re-bakes).
  - [x] Wiring check `tools/checks/charactersBakeWiring.test.ts` (pump in `ZombieView.update`, gallery bake, restore registration).
  - [x] Cap tests: never more than the cap animated; `?fx=low` halves; no allocation in `update` (pool sizes stable over 600 frames).
  - [x] Perf table in `docs/perf/epic-9-characters.md` (before/after, 1× and 4×, load) + bake times (7 reps, median, min–max) + main-thread max long task.

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

Claude (builder session, gds-dev-story), 2026-11-25.

### Debug Log References

- Headless finding (B17): in a running game, a NEW OffscreenCanvas's first readback and every `transferToImageBitmap` in the worker wait ~60 ms for the GPU process (SwiftShader, busy drawing the game); the bake took 31 s at 1× under `?stress=150` (2.4 s for the same worker on an idle page). Fixed: pooled, reset canvases and pixels (`ImageData`) posted back → ~7.5 s.
- Main-thread landing: per-landing canvases (copies + sentinel readback) cost 6–17 ms; fixed with pixels written by `putImageData` (B18), a landing budget of half the frame budget, one sheet upload per frame, 512-wide sheets.
- Caps: 40/40 cost −2.5 FPS at 1×; 24/12 −2.2; caps 0 was +2 (the per-look sheets batch better than the one atlas); 20/10 with the half-step crossfade −0.4 at 1× (p95 equal) but −1.5 at 4× with p95 100 → 116.7 in one round; 16/8 → see `docs/perf/epic-9-characters.md`. The main-thread profile at steady state is ~95 % waiting on the software GPU in both master and branch (the JS the story adds is < 0.2 % of samples), so the gap is draw / fill cost of the extra layers.
- Removed a per-frame string build (`loopReady → sheetOf`) found in the profile; the pump returns at once when the bake is idle.
- `tools/gallery/manifest.json`: master's own export already shows 36 `atlas_characters` zombie frames as changed (the committed manifest was stale before this story); this story's plain drawings are unchanged (`survivorParts.raster` pin green, node digest check before/after the new designs).

### Decisions taken while building (B11+)

- **B11 Plain first pictures.** At the start the sheets are copies of `atlas_characters` (no drawing on the main thread); the walk loop's first picture is today's design until the worker's plain new design lands (the first tasks, a few ms each), then the relit one. The view shows the first picture until all 10 relit pictures of a look are in, then crossfades.
- **B12 One glow picture.** Take 4 draws the glowing pixels at 0.5 × the pulse and the bloom twice at the pulse; baked into one premultiplied picture (0.5 glow + 2 bloom, clamped) drawn additively at the pulse. The bloom is a two-pass box blur (σ ≈ the page's 6 px at the game scale), no `ctx.filter`.
- **B13 Sheets.** One texture per look (type + variant: every walk phase / windup / swell, its glow and 8 sheen steps), one per gun frame, the Bloater veins on their own sheet per look; packed ≤ 512 px wide (tighter: 6.2 M px in all instead of 7.6 M); at most one sheet re-upload per frame.
- **B14 Survivors.** The per-player body (Story 7.9) is relit in the worker (bodies jump the queue), no glow layer on bodies (the pilot flames are on the gun frames, which glow); the unused one-piece 7.8 survivor frames stay plain (kept only for the digest pin); portraits stay plain (B9).
- **B15 Look / stage change.** A relit body stays until the new look's (or decay stage's) relit body lands; the plain body is painted only when there is no relit one yet.
- **B16 Crop + row blur.** Each relight works on the drawing's bounding box plus the widest blur's reach (same result as the whole frame: edge clamping meets clear pixels, noise in frame coordinates) and the vertical blur walks rows (same sums in the same order); tested equal to `relight.ts › boxBlur`.
- **B17 Worker canvases.** CPU-backed (`willReadFrequently`), pooled per size and reset; results posted as `ImageData` (transferred buffers), not ImageBitmaps (see Debug Log).
- **B18 Kept cache = pixels.** Landed pictures are kept as `ImageData` (CPU memory: a lost context or an Android wipe can't empty them) and written into the sheets with `putImageData`; the restore check (sentinel pixel) stays and re-bakes only if pixels are gone.
- **B19 Caps (measured).** `maxCharacterAnim` 12, `maxCharacterSheen` 6 (review D1: 16 / 8 re-measured at steady state put the 4× p95 one rAF bucket up in both rounds; 20 / 10 in one round), `maxBloaterFx` 6, `maxSpitterDrips` 8 (`?fx=low` halves all four); the cap pass runs every 8 frames, nearest the camera centre first; the walk crossfade runs over the middle half of each step (the picture alone at either end), so a top layer exists half the time.
- **B20 Depth bands.** Glow and sheen (additive) sit on one band (5.9) above every zombie type, so they batch; where a Brute overlaps a Spitter the Spitter's glow can show over the Brute. Veins, sacs and drips use the body's own band.
- **B21 Cast shadow left out** (B2's option): the measured budget went to the animation caps.
- **B22 BR2 glows.** BR2's hi-vis orange is detected as glowing, as on the approved page (it pulses there too); kept to match the page. `CharArt.glows` lists the glowing looks (Spitters, BR2, flamethrower, gas torch); a test keeps it in step with the detection.
- **B23 Character bake budget** `BAKE_MS_PER_FRAME = 4` ms (landing gets half).
- **B24 Perf measurement** (accepted by the orchestrator, D1: the bake window counts as build-phase work). `?stress=150` has no build phase, so the bake (done ~8 s after the start at 1×, ~16 s at 4× in headless) overlaps the story's 8 s warm-up + 12 s count; in headless the worker competes with the CPU renderer. The AC 4 table is the steady state (8 s warm-up after the bake landed, master warmed for the same session age); the overlapped run is reported too (`docs/perf/epic-9-characters.md`).
- **B25 Bake order** (orchestrator): Walkers, then the gun frames (bodies jump the queue on their own), Runners, Crawlers, then Spitters, Brutes, Bloaters (later waves); the bake reports "wave-1 set done" (every Walker walk picture and gun frame) and "all done": 4× CPU with 150 Walkers 9.8 s / 13.9 s (≤ 15 s).
- **B26 Memory and setup** (review M3): the sheen and vein pictures are written into their sheets and not kept (kept cache 19.9 → 7.8 MB); after a lost graphics context the frames that had them are baked again (a few seconds in the worker; until then those layers are blank, the bodies are not). The sheets are made by the pump in chunks of ≤ `SHEET_MS_PER_FRAME` (12 ms) before any picture lands, or on demand by a view; at most one GPU upload (a sheet made or refreshed) per landing frame. The 51–59 ms setup task at 1× became ~1–4 ms + 5–6 chunks of ≤ 13–15 ms (4×: 224–297 ms → 13–16 chunks of ≤ 22–28 ms); the bake's per-frame max (setup chunks reported apart) is 3.6 ms median at 1×.
- **B27 Hit flash and swell tint on the body only** (review L5): the additive layers (glow, sheen, Bloater veins and sacs, drips) are not tinted — an additive layer flashed white would read wrong; the crossfade's top picture is part of the body and flashes with it.
- **B28 balance.version** (review L10): the four new `controls.fx` keys change `balance.version`: a tab still open on an older build gets `balance_mismatch` on joining, and a saved run made before resumes with `digestChecked=false`. No gameplay number changed. The same reason re-pins master's new `carCorner.test.ts` golden `worldDigest` (it includes `balance.version`): 1728716985 → 3587910981 after merging master (0fb2aa3); the shared package's only changes are `controls.json` and `balanceSchema.ts`.
- **B3 measured:** relighting all frames in node takes 1.6 s at ss 2 vs 3.8 s at ss 4 (2.4×); the ss 2 output differs from ss 4 by a mean of 3–10 levels (of 255) per channel, 4–20 % of the figure's pixels by more than 16 — mostly the fine grain and weave at a different source resolution (shapes, palette, outline identical). At the game's display size (a 106 px Walker frame shown ~60–70 device px) the difference is below what the frame shows.
- **Tests changed on purpose:** `SurvivorLookTextures.test.ts` — the gun frame's texture is its relit sheet (`gunSheetOf`), and the body's rotation includes take 4's sway (≤ 0.012 rad).

### Review fixes (2026-11-25, review of PR #16 @ 94f8d66)

- M1 `charactersAtlas.ts` keep / pump: a look's FX and loop readiness are queued on their sheet (`Sheet.pending`) and published right after that sheet's upload; the upload picks a sheet with readiness waiting first. Test: `charactersBake.raster.test.ts` › "review M1".
- M2 `charactersAtlas.ts` idle return: `lastPump` reset to 0, so an idle gap is never taken for a frozen tab. Test: "review M2" (5 min idle, body request, silent worker given up on ≤ 21 s later).
- M3 memory and setup: B26 (numbers in `docs/perf/epic-9-characters.md`). Tests: "review M3" (setup in chunks before any landing), restore re-bakes the frames whose layers were dropped; the cap pass returns layers of zombies that left the cap to the pools before newcomers take theirs.
- D1: overlapped and steady-state tables in the perf doc; caps cut to 12 / 6 (16 / 8 put the 4× steady p95 one bucket up); the 4× p95 bucket in one overlapped round (bake still landing) is B24, accepted.
- L1 `ZombieView.ts`: a new image starts on look 0's frame on look 0's sheet. L2 `workerFailed`: answers already received are not baked again (test). L3 restore comment / parity fixed, an interrupted body job is queued again. L4 `PlayerView.ts`: relit layers after the blink. L5 B27. L6 `CharacterFxView.ts`: a Spitter slot's drips reset when its owner changes. L7 `charactersFrames.ts`: a non-primary frame's glow canvas is freed. L8 `ZombieView.ts`: the reappear branch releases only the layer images. L9 docs (item 134 → 16, 568×320 shots for 135, 136, 137, 141; B3 numbers). L10 B28.

### Re-review round 1 follow-ups (clean re-review of 2b55fa5)

- NEW-1 `charactersAtlas.ts` (non-intact restore): the sheets' waiting readiness is cleared with the cache, so a wiped picture's loop / FX readiness can't come back. Test: "re-review NEW-1" (fails without the fix).
- NEW-2 `ZombieView.ts` (drip call): the drip owner is the zombie's slot + generation, so a new Spitter in the same slot starts dry.
- Nit `charactersAtlas.ts` keep: a Bloater's FX is published once both its sheet and its vein sheet are uploaded.

### Completion Notes List

- T1: `charRelight.ts` (take 4 `relight4` as `relightCharSteps`, KEEP_OUTLINE hard-wired, constants rescaled by source px per page px, slope ×6u), `commonzArt.ts` (Walker fingertips 1.54 r ≤ 1.55, Crawler smear 1.68 r ≤ 1.75 by trimming the drawing).
- T2: `charactersFrames.ts` (123 frames, take 4 row seeds), `charactersBakeWorker.ts`, `charactersAtlas.ts` (sheets, kept cache, pump, worker timeout / idle close / frozen tab / stale generation, restore registration); pumped from `ZombieView.update` and `SurvivorLookTextures.beginFrame` (once per game frame).
- T3: `ZombieView` (crossfade, distance-driven walk phase, breathing / sway on every zombie, glow / sheen within the cap, FX slots), `CharacterFxView` (veins crossfade, sacs with halo and bubbles, deterministic drips with world-space puddles), `PlayerView` (breathing / sway, chainsaw shake, body + gun sheen, gun glow flicker), `SurvivorLookTextures` (relit bodies via the worker), caps in `controls.json` + `balanceSchema.ts`. No simulation, server, net, HUD or GameScene change.
- T4: gallery bakes on the spot; `tools/gallery/export.ts` groups the sheets as `characters_relit` and no longer adds take 4 as "approved, not in game"; review page text; readability items 134–141; screenshots in `docs/art/9-13/`.
- T5: `charRelight.raster.test.ts`, `charactersBake.raster.test.ts`, `zombieCaps.test.ts`, `characterFx.test.ts`, `tools/checks/charactersBakeWiring.test.ts`; perf in `docs/perf/epic-9-characters.md`.

### File List

- apps/client/src/render/city/charRelight.ts (new)
- apps/client/src/render/city/charBloaterFx.ts (new)
- apps/client/src/render/city/charactersFrames.ts (new)
- apps/client/src/render/city/charactersAtlas.ts (new)
- apps/client/src/render/city/charactersBakeWorker.ts (new)
- apps/client/src/render/city/canvasRecycle.ts (new)
- apps/client/src/render/city/commonzArt.ts (new)
- apps/client/src/render/charAnim.ts (new)
- apps/client/src/render/CharacterFxView.ts (new)
- apps/client/src/render/ZombieView.ts
- apps/client/src/render/PlayerView.ts
- apps/client/src/render/SurvivorLookTextures.ts
- apps/client/src/gallery/collect.ts
- packages/shared/src/config/balance/controls.json
- packages/shared/src/config/balanceSchema.ts
- apps/client/src/render/city/charRelight.raster.test.ts (new)
- apps/client/src/render/city/charactersBake.raster.test.ts (new)
- apps/client/src/render/zombieCaps.test.ts (new)
- apps/client/src/render/characterFx.test.ts (new)
- apps/client/src/render/SurvivorLookTextures.test.ts
- tools/checks/charactersBakeWiring.test.ts (new)
- tools/gallery/export.ts, tools/gallery/review-page.html, tools/gallery/manifest.json
- docs/art/9-13/*.png (new), docs/art/asset-review.md, docs/art/photoreal-decisions.md
- docs/playtests/milestone-1/readability-sheet.md, docs/perf/epic-9-characters.md (new)

### Change Log

- 2026-11-25: Story 9.13 built (photoreal characters in the game); status → review.
