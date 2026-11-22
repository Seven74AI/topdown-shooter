# Story 4.6: Evening

Status: review

## Story

As a player,
I want the run to start on a normal evening with parked cars and lit shops,
so that I know the city before it falls.

> **EPIC 4 BRIEF** (§11 of `epic-3-retro-2026-11-22.md`) is this story's checklist. Most relevant: 2 (the same map data on every copy: server, solo, mirror, Predictor; list them), 3 (the Downtown fuzz test covers the new cover), 4 (cover joins the nav grid under the pinch rule), 7 (spawn clearance), 9 (liveness, mutation-proven tests), 10 (player-visible properties), 11 (late Game scene, hidden tab), 13 (no per-frame allocation, numbers as data), 18 (say what was not verified), 19 (notes for the merge). Built together with Story 4.7 on branch `story-4-6-7` (one map, one ambience module).

## Acceptance Criteria

1. **Parked cars along the curbs (FR59).** Stage 1 (waves 1–2) keeps the map open, and cars parked along the curbs are `car` cover from the start (4.2 rules: they stop bodies and shots, the flow field walls them off). Downtown gains curb cars in the west, north and south streets (`tools/maps/buildDowntown.ts` → regenerate `.tmx` / `.tmj` / shared copy), on the 0.5 m lattice, with no gap narrower than a body anywhere (no closed nav edge at stage 1), every free cell reachable, the team start and every spawn's jitter area (every stage) clear.
2. **Lit shop fronts mark good build spots (FR59).** Shop fronts are map data: rectangles of kind `shopfront` in a `stage1_shopfronts` layer of the `stage1_evening` group (the sidewalk strip in front of a lit shop). `shopfrontsOf(map)` (shared) returns them with the face that glows (the side touching the shop's collision box). Each one is a good build spot: a wood barricade fits inside it at stage 1 (placement legal: spawn clearance of every stage, map boxes, cover), and no decay mutation of any stage or variant ever lands on it (a building there is never destroyed by decay). Drawing the glow is Story 4.9's (CityView); this story only adds a placeholder tint in `StreetView` so the data can be seen.
3. **Placeholder ambience (Evening loop).** A procedural loop (traffic rumble with cars passing and distant muffled music; WebAudio, no audio files, a small synthesized buffer) plays during stage 1 on an ambience bus. It starts only after a user gesture (mobile autoplay), follows `world.decay.stage` (so a late join or a tab that slept across a build start converges to the right loop), mutes while the tab is hidden, allocates nothing per frame, and lives in a module (`apps/client/src/audio/ambience.ts`) that Epic 9 can swap for recorded loops without touching callers. Story 4.7 adds the Panic loop and the crossfade.
4. **Tests:** curb cars on the map (names, kinds, stage 1, nav walls); stage-1 openness (no closed edge, all reachable); shop fronts (data, face, buildable, never hit by decay); the ambience's pure part (loop per stage, start only when unlocked); the fuzz test with the new cover; liveness asserts; each new test fails under one mutation.

## Tasks / Subtasks

- [x] T1 Map: curb cars (cover), `stage1_shopfronts` layer; regenerate; fix data tests that list the cars (AC 1, 2)
- [x] T2 `map/shopfronts.ts` (`shopfrontsOf`, `SHOPFRONT_KIND`), export from the package; placeholder tint in `StreetView` (AC 2)
- [x] T3 `audio/ambience.ts`: pure loop choice + mixer state; synthesized Evening buffer; bus; GameScene hook (AC 3)
- [x] T4 Tests + mutations; browser check; gates; merge notes (AC 4)

## Dev Notes

### Decisions (non-interactive; the user delegated them)

- **D1 Curb cars.** Five new stage-1 `car` cover objects (2 × 4.5 m, along the curb lanes): `curb_car_west_far` (3–7.5, 18–20), `curb_car_west_n` (12–16.5, 12–14), `curb_car_west_s` (13.5–18, 18–20), `curb_car_north` (20–22, 0–4.5; flush with the map edge, so there is no 0.5 m dead strip behind it), `curb_car_south` (26–28, 24–28.5). The 4.1 cars stay (`street_car_west/east`, the 3 lot cars): `street_car_west` and `parked_car_2` are Story 4.8's fire targets, so they never move. The east street gets no new car: the bus already narrows it and its manhole/window spawns leave no room.
- **D2 Shop fronts are visual-layer data, not cover.** They do nothing in the sim (no collision, no shots), so they live in the `stage1_evening` group (the loader already reads any kind there; no schema change) as `kind: shopfront`. Five: corner shop, apartments' ground floor (both face the west street's north sidewalk), diner, offices (south sidewalks), gas kiosk (forecourt). The glowing face is derived (`shopfrontsOf`: the side of the strip that touches a collision box), so the renderer needs no extra property. Several shops have a broken-window spawn that opens at stage 2/3 (Story 4.3); the zones are kept as the whole frontage (the shop is lit in the evening, its window breaks later), and the "good build spot" property is that at least one legal barricade fits in each zone outside every spawn's clearance.
- **D3 Ambience module shape.** Pure part (`ambienceLoopForStage`, `ambienceStep`: what to do given the stage, whether audio is unlocked and what plays; testable without WebAudio) + a thin WebAudio player (`AmbiencePlayer`): one gain node per loop on an ambience bus (`AMBIENCE_GAIN`), looping `AudioBufferSourceNode`s over buffers synthesized once at unlock by pure `synthEveningLoop(rate)` / `synthPanicLoop(rate)` (Float32 arrays: testable; Epic 9 replaces them with decoded files). Per frame: two integer compares and a state read; WebAudio ramps do the fade. The AudioContext is the SFX module's (`placeholderSfx.ts` exports `audioContextIfRunning()`), so one gesture unlocks both. There is no volume/mute setting yet (`settings.ts` has only `screenShake`): the bus is the one place a future ambience volume (Story 10.1) plugs in.
- **D4 Hidden tab / late join.** The player reads `world.decay.stage` each frame (not only the event), so whatever stage the mirror World reaches after a hidden tab, a late Game scene or a late join is what plays; while `document.hidden` the bus is ramped to 0 (architecture › tab hidden stops audio), back on wake.

### Current state (read before changing)

- `tools/maps/buildDowntown.ts`: cover list (bus, 3 lot cars, 2 street cars, `police_barrier_north` stage 2, `sandbags_south` stage 3); stage groups `stage1_evening` (layer `stage1_ground`), … Regenerate with `npx tsx tools/maps/buildDowntown.ts`; `tools/maps/downtownFiles.test.ts` pins the files to the generator.
- `map/loadTiledMap.ts`: stage groups → `DistrictMap.stages[i]` as `VisualProp { name, box, kind, layer }`.
- `map/obstacles.ts › fillObstacles`: cover with `minStage ≤ stage` joins `solids` (and `shotBlockers` for cars).
- Tests that list Downtown's cars: `map/downtown.test.ts` (named objects, free-cell count), `map/obstacles.test.ts` (stage lists).
- Client audio: `audio/placeholderSfx.ts` (lazy AudioContext, `MASTER_GAIN` 0.25, `unlockAudio()` from HudScene pointer down/up). `render/StreetView.ts › PROP_FILL` draws stage-1 props by kind (unknown kinds skipped).

### Must be preserved

All 4.1–4.5 data rules (lattice, spawn jitter areas, reachability, pinch rule), push-out determinism, prediction = server, the SFX behaviour, no per-frame allocation.

### Copies touched (brief line 2)

Map data only (bundled, identical on server, solo, mirror, Predictor; `mapVersion` changes, so old tabs are refused with "Please refresh"). Schema / syncState / stateView / devThrottle / snapshot: none (the stage is 4.5's field).

### References

- `_bmad-output/planning-artifacts/epics.md` › Story 4.6 (FR59), 4.7, 4.9; GDD › Audio ("Ambience follows decay: Evening = traffic, distant music and voices"); architecture › Audio (three buses), Decay Stage Engine (client swaps visuals and audio), tab hidden stops audio.
- Story files 4.1–4.5 (D-rules, merge notes, 4.5's note for 4.6–4.8).

## Dev Agent Record

### Agent Model Used

Claude Opus 5.5 (claude-opus-5-5), builder, worktree `story-4-6-7` (Stories 4.6 + 4.7 together).

### Debug Log References

- Baseline (5d661f3): 1,295 passed / 3 skipped. After 4.6 + 4.7: 1,311 passed / 3 skipped (180 files).
- `node_modules` copied from the main checkout (`cp -a`); `@topdown/shared` resolves to this worktree (`readlink -f`).
- First map run: 4 unreached cells at stage 1 — `curb_car_north` at y 0.5 left a 0.5 m strip against the map edge; moved flush to the edge (y 0–4.5). (This is mutation M4 now.)
- Existing tests that changed (data only): `map/downtown.test.ts` (car list, free-cell count + 5 × 36), `map/obstacles.test.ts` (stage lists with the curb cars and police lines; spawn check over the legal masks instead of `1 << n`), `server rooms/schema/syncState.test.ts` (a barricade at (4, 18) now sits on `curb_car_west_far`: moved to y 17), `tools/netsim/coverShots.test.ts` (seed 423 drew no shot into the bus once the curb cars changed the zombies' routes: seed 425; liveness per seed kept).
- Found while browser-checking: the dev collision view drew the frozen `map.cover` (removed cars outlined, moved cars missing; a 4.5 gap) → it draws `world.obstacles.walls/cover` now (dev-only file).

### Completion Notes List

- Ultimate context engine analysis completed - comprehensive developer guide created.
- **Curb cars:** 5 stage-1 `car` cover objects (D1); stage 1 has no closed nav edge and every free cell is reachable (4.1's test, now with 10 cars); the reachability / jitter-area / team-start checks run for every stage × every combination (4.7's test).
- **Shop fronts:** `stage1_shopfronts` layer, 5 strips `kind: shopfront`; `shopfrontsOf(map)` (shared, exported) → `{ name, box, face, shop }`, cached. Placeholder tint in `StreetView` (`PROP_FILL.shopfront`). Test: for every one of the 30 variant combinations a wood barricade is placed fully inside each strip at stage 1 (legal placement) and survives the DecaySystem through stages 2–5 (150 placements, 0 destroyed).
- **Ambience:** `apps/client/src/audio/ambience.ts` — pure `ambienceLoopForStage` / `ambienceStep` / `synthAmbienceLoop`, `AmbiencePlayer` (bus `AMBIENCE_GAIN` 0.16 → destination; two looping buffer sources synthesized once at the first unlock, 8 s at 22.05 kHz, tail crossfaded into the head; WebAudio ramps for every fade). `placeholderSfx.ts` exports `audioContextIfRunning()` (never creates a context). `GameScene` creates the player in `create`, calls `update(world.decay.stage)` each frame, disposes on shutdown (and before a reused scene's new one). `visibilitychange` ducks the bus at once.
- **Tests added:** `map/evening.test.ts` (4), `apps/client/src/audio/ambience.test.ts` (5: loop per stage, gesture gate + once per change, late join + hidden tab catch-up, synthesis (length, finite, normalized, seamless, panic ≠ evening), the player on a fake WebAudio: 5 nodes once, 0 per frame over 600 frames, 3 s crossfade, bus duck/restore).
- **Mutations proven** (script outside the repo; each fails, then `git checkout`): M4 dead strip behind `curb_car_north` → reachability; M9 every stage plays evening → 4 ambience tests; M10 instant switch → player test; M11 no gesture gate → state test; M12 hidden ignored → 2 tests; M13 face n↔s → shop-front test; M14 a curb car from stage 2 only → curb-car test; M17 a shop strip 0.5 m off its shop → "touch their shop". (4.7's list in its file.)
- **Browser** (Python Playwright + Chromium headless 1280 × 720, server :2661, Vite :5261 with a temporary config outside the repo, deleted after): solo, before any input `ambience = null`, AudioContext not created; after one click the context is `running` and the evening loop is at gain 1 (bus 0.16). Screenshots `/tmp/s467pw/shots/solo-1-stage1-collision.png` (dev collision view: the curb cars, the faint stage-2 police barrier), `solo-2-stage1-plain.png` (shop-front tint). No page errors; the only console lines are SwiftShader "GPU stall due to ReadPixels" warnings.
- **Not verified:** the actual sound (headless Chromium has no audio output: only the context state and gain values were read) — whether the loops sound like traffic / music / sirens is for the designer's ears; real phones (iOS unlock path is the existing `unlockAudio` on touchend, unchanged); the glow look (Story 4.9); Tiled itself (generator-written files).
- **Perf / bandwidth:** map data only: 0 B/s added. Tick cost with the extra cover (`PERF_ASSERT=1`, load 0.77–0.87): 4.2 cover test added p99 0.066 ms (20 shot blockers at stage 3, 135 ns per projectile sweep); 4.1 Downtown vs open street +0.010 ms p99. Client per frame: one context check + integer compares.

### Notes for the merge (brief line 19)

See Story 4.7's file (one section for both stories).

### File List

See Story 4.7's file (one list for both stories).

## Change Log

- 2026-11-22: Story file written (gds-create-story) and built together with 4.7 on `story-4-6-7`. Status review.
