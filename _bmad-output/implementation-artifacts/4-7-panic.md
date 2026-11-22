# Story 4.7: Panic

Status: done

## Story

As a player,
I want cars to end up in the road and police barriers to block streets,
so that the map gives new cover and new choke points.

> **EPIC 4 BRIEF** (§11 of `epic-3-retro-2026-11-22.md`) is this story's checklist. Most relevant: 3 (Downtown fuzz across the stage change with the real candidates), 4 (fields rebuilt at the build start), 5 (build-start order: mutations → destroy buildings on blocked cells, refund 50 % → push out players → rebuild fields; test a player and a building where a car moves), 6 (barriers stop only bodies), 7 (spawn clearance at every stage), 8 (picks only from `streams.decay`), 9 (liveness, mutation-proven tests), 10 (player-visible properties: "zombies reach us after Panic", "a path can still be closed"), 11 (hidden tab / late join for the ambience), 13, 18, 19. Built together with Story 4.6 on `story-4-6-7`.

## Acceptance Criteria

1. **Cars into the road (FR60).** At the build start before wave 3 (stage 2), 4 cars picked by the `decay` stream from candidates in the map move from the curb into the road: each candidate is a variation (`group: panic_cars_moved`, `pick: 4`) of a `remove` (the curb car) and an `add` (the same car slewed into the road, kind `car`), plus a `block` where a slot would otherwise be left. 6 candidates (15 combinations); same seed → same picks, different seeds → different picks. All through 4.5's engine (`applyDecayStage`, DecaySystem): nothing new on the wire.
2. **Police barriers (FR60).** Stage 2 adds `barrier` cover (bodies only; shots pass, 4.2) that closes some paths: the parking lot's north side and the gas forecourt's west side (with 4.2's `police_barrier_north` across the north street). Each closed path has another way round (choke points, never an enclosed area).
3. **Fun-safe layout (tests).** For every stage 1–5 × every legal variant combination: every walkable cell is reachable from the team start and no nav edge is closed (no slot narrower than a body); every spawn's jitter area (grown by the largest zombie) is clear; nothing that appears at a decay stage (adds, blocks, stage ≥ 2 cover) lands within `buildings.spawnClearM` of any spawn point or on the team start; moved cars overlap no other active obstacle and no shop front (4.6). Zombies from every spawn open at stage 2 reach the team after Panic, on the real map, for every combination.
4. **Flow fields** route around the new cars and barriers (they are nav walls from the build start: 4.5's `rebuildFlowFieldNow`).
5. **Build-start order** (4.5's DecaySystem): a barricade on a cell a moved car lands on is destroyed and refunded 50 %; a player standing there is moved out; tested with the real candidates.
6. **Panic ambience.** The sirens / car-alarm placeholder loop replaces the evening loop with a ~3 s crossfade when the stage becomes 2 — on `decay.stage_changed` and equally when the stage arrives late (hidden tab, late join, late Game scene). Stages ≥ 3 keep the Panic loop until Story 4.8's rain.
7. **Tests:** the above, plus barriers block bodies and not shots on the real map, the ambience state follows the stage (pure part), the Downtown fuzz test walks every combination, liveness asserts, each new test fails under one mutation; browser check of stage 1 and 2 with the dev collision view.

## Tasks / Subtasks

- [x] T1 Map: candidates (remove + add [+ block]), barriers; replace 4.5's abandoned-car group; regenerate (AC 1, 2)
- [x] T2 `legalDecayMasks(map)` (tests/fuzz); reachability / spawn-clearance / overlap tests over every combination (AC 3)
- [x] T3 Tests: picks per seed, barriers vs bodies and shots, zombies reach us after Panic, refund + push-out where a car lands, fuzz (AC 1–5)
- [x] T4 Ambience: Panic buffer, crossfade, stage → loop (AC 6)
- [x] T5 Update 4.5 tests that named the abandoned car; mutations; browser; gates; merge notes (AC 7)

## Dev Notes

### Decisions (non-interactive; the user delegated them)

- **D1 Candidates.** `panic_cars_moved`, pick 4 of 6: `curb_car_west_far` → (2.5–7, 16–18); `curb_car_west_n` → (14–18.5, 14.5–16.5) (rolled into the middle of the west street); `curb_car_west_s` → (15.5–17.5, 16.5–21) (slewed across the south lane); `curb_car_north` → (20.5–25, 8–10) (crashed into the north police line); `curb_car_south` → (24.5–29, 25.5–27.5) (across the south street); `street_car_east` → (36.5–41, 18–20) (under the bus: a 1 m squeeze). Each candidate's objects are `<car>_leaves_curb` (remove) and `<car>_in_road` (add). With every combination the west street keeps ≥ 2.5 m lanes, the bus passage keeps the 2 m sidewalk. No candidate needed a `block` (the all-combination test finds no closed edge and no unreached cell); the rule is recorded for later content.
- **D2 Replaces 4.5's placeholder set.** 4.5's `panic_abandoned_car` group (west / south car) is removed (superseded by the movers). Kept: `parked_car_3_driven_off` (a lot car leaves) and `dumpster_alley_3` (block). 4.5's stage-3 ignite group (`parked_car_2` / `street_car_west`) is untouched and its targets never move (4.8 builds on it).
- **D3 Barriers are fixed, not variants.** `police_line_lot` (10.5–20, 22–22.5): the lot's north side; the lot stays open to the south street, and a 1.5 m gap stays at its NW corner (between the line and the parking wall) — a choke point a barricade can close. `police_line_gas` (28–28.5, 0–10): separates the north street from the gas forecourt; the forecourt stays open along the east street. Fixed so every run has the same police lines (readable); the cars give the variety.
- **D4 Clearance rule for new boxes.** Everything that appears at a decay stage keeps the barricade rule's `buildings.spawnClearM` (2 m) from every spawn point of every stage (a moved car never lands on a spawn or its clearance), plus 4.3's jitter-area rule; stage-1 curb cars only need 4.3's jitter-area rule (they were there from the start).
- **D5 Ambience crossfade.** `AMBIENCE_CROSSFADE_S = 3`, equal-power-ish (linear ramps on two gains from their current values, `cancelScheduledValues` + `setValueAtTime(current)` first, so a stage change during a fade continues from where it is). Stage → loop: 1 → `evening`, ≥ 2 → `panic` (4.8 maps 3 → its rain loop). A first start (first unlock, late join) fades in from silence over the same time.

### Current state (read before changing)

- `decay/decayState.ts › pickDecayVariants` (partial Fisher–Yates per group, `streams.decay`), `applyDecayStage`, `decaySystem.ts › decayMutate` (destroy + refund, push-out), `runStateMachine.startBuild`.
- `map/loadTiledMap.ts › loadDecayLayer`: variation needs `variant`, `group`, `pick` on every member; `pick < candidates`; ≤ 32 variants (we have 8).
- `decay/decay.test.ts` (4.5) tests that use the abandoned car (`chosenCar` = the first chosen add, still valid), the Downtown data test (action counts, variant names), "every combination" (enumerated `1 << n` masks: too many with 8 variants → legal masks), DecayTimeline seed test (mask set {5,6,9,10}). `map/obstacles.test.ts` spawn check over `1 << n` masks.
- Client: `GameScene` handles `decay.stage_changed` (banner); the mirror's `world.decay.stage` follows the state (4.5 `mirrorDecay`).

### Must be preserved

4.5's engine and order, 4.5's tests' intent (dumpster tests unchanged), 4.8's ignite targets, prediction = server, no per-tick allocation, balance frozen (no number changes; only map content).

### Copies touched (brief line 2)

Map data only (bundled; `mapVersion` changes). The variant mask (uint32) already travels in `RunState.decayVariants`; with 8 variants it still fits. No schema, syncState, stateView, devThrottle or snapshot change.

### References

- `_bmad-output/planning-artifacts/epics.md` › Story 4.7 (FR60); GDD › Audio (Panic = sirens, car alarms, shouting); Story 4.5 file (engine, note for 4.6–4.8), 4.3 (spawn rules), 4.2 (barrier rules).

## Dev Agent Record

### Agent Model Used

Claude Opus 5.5 (claude-opus-5-5), builder, worktree `story-4-6-7` (Stories 4.6 + 4.7 together).

### Debug Log References

- Layout iterated with an ASCII render of the nav grid and a script over every stage × legal mask (outside the repo): the final set has 0 unreached cells and 0 closed edges in all 150 cases on the first try after 4.6's `curb_car_north` fix. Two candidates were changed before writing tests: `street_car_west` would have been a mover, but it is 4.8's fire target (dropped for `curb_car_west_far`); a lot-car mover was dropped because every road spot left a 0.5 m slot against the lot line or the parked cars.
- 4.5 tests updated for the new set: the Downtown data test (actions and variant names), "every combination" (legal masks + no closed edge, 5 × 30), the DecayTimeline seed test (4 of bits 0–5, 1 of bits 6–7; all 30 masks seen in 256 seeds). The dumpster tests are unchanged; `chosenCar` (first chosen add) now finds a moved car.

### Completion Notes List

- Ultimate context engine analysis completed - comprehensive developer guide created.
- **Stage 2 content** (`tools/maps/buildDowntown.ts`, regenerated): `panicCar(curb, box)` writes `<curb>_leaves_curb` (remove) + `<curb>_in_road` (add car), variant `panic_move_<curb>`, group `panic_cars_moved`, pick 4 (6 candidates, D1); `police_line_lot`, `police_line_gas` (fixed barrier adds, D3); 4.2's `police_barrier_north`; 4.5's `parked_car_3_driven_off` and `dumpster_alley_3`. 4.5's abandoned-car pair removed. 8 variants (mask bits 0–5 movers, 6–7 fires).
- **`legalDecayMasks(map)`** (shared, exported; tests and fuzz only): every mask `pickDecayVariants` can return (Downtown 30).
- **Tests added — `decay/panic.test.ts` (7):** 4 cars move (64 seeds: same seed = same lists; exactly 4 in the road = the 4 gone from the curb; car rules + nav walls; ≥ 10 of 15 sets and all 6 cars seen); barriers vs bodies/shots on the real map (shot over the lot line, stopped by a moved car, a survivor walking 3 s into the line stays ≥ its radius away); "a path can still be closed" (one barricade closes the lot's NW gap); every stage × combination: 0 unreached, 0 closed edges, spawn jitter areas and team starts clear (150 Worlds); new boxes ≥ `spawnClearM` from every spawn, off the shop fronts, never on another active obstacle; "zombies reach us after Panic" (all 30 combinations through the real `skipWave` build starts, a Walker from all 14 stage-2 spawns, every type for 3 combinations: 504 zombies, all reached); build-start order for every mover (a barricade where it lands destroyed + refunded floor(40 × 0.5) = 20 in the wallet, not earned; a survivor standing there moved out; nobody inside a box). Fuzz: each of the 36 layouts uses `MASKS[seed % 30]` (all 30 combinations ran; 54 barricades on moved cars / police lines; 107 destroyed + 107 refunded).
- **Mutations proven** (each fails its test, then restored): M1 picks ignore the stream → "exactly 4"; M2 movers' adds ignored → same; M3 barriers stop shots → barrier test; M5 a moved car 1.5 m from `manhole_west` → clearance test; M6 a moved car on the offices' shop front → clearance test; M7 a police line sealing alley 1 → "zombies reach us"; M8 build start checks walls only → "for every mover"; M15 `legalDecayMasks` off by one → 4.5's every-combination test; M16 fuzz not walking the masks → fuzz. (4.6's M4, M9–M14, M17 in its file.)
- **Ambience (Panic):** stage ≥ 2 → `panic` loop (wail siren 600–1300 Hz, hi-lo siren swelling, car-alarm beeps, low rumble), crossfade 3 s with ramps from the current value (a change mid-fade continues smoothly). Browser: gains 0.93/0.07 just after the build start, 0.42/0.58 at +1.5 s, 0/1 at +3.5 s.
- **Browser** (Playwright + Chromium, server :2661, Vite :5261, temp config deleted): solo, Skip wave ×2 through the real build starts → stage 2, banner "Wave 2 cleared / Panic", 4 cars in the road, 3 barriers, ambience `panic`; screenshots with the dev collision view `/tmp/s467pw/shots/solo-3-stage2-collision.png` (moved cars, police lines, dumpster) and `solo-4-stage2-plain.png`; hidden tab (forced `document.hidden` + event) → bus 0, visible → 0.16. Online (`DEV_DECAY_STAGES=2`, guest `?lag=150&jitter=20`, guest tab asleep across Start = late Game scene): both at stage 2 with the same variants (87) and the same 4 moved cars; the guest's ambience waited for its own click, then `panic` at gain 1. No page errors.
- **Not verified:** the sound itself (no audio device in headless Chromium; only context state and gain automation were read); real phones; walking into a moved car online in the browser (covered by the shared push-out tests and 4.5's netsim); a full online 5-wave run; the Dead City look of cars and barriers (4.9). Headless Chromium ran at 15–20 fps.
- **Perf / bandwidth:** 0 B/s added (bundled map; the variant mask already travels as uint32). Build-start spike (`PERF_ASSERT=1`, load 0.8): median 1.59 ms, max 3.86 ms over 12 runs (4.5: 1.55 / 3.40). Gates on `story-4-6-7`: typecheck, lint, test (180 files, 1,311 passed, 3 skipped; load 0.7–1.0), build green (the >1600 kB chunk warning is pre-existing: 1,745 kB vs 1,736 kB).

### Notes for the merge (Stories 4.6 + 4.7; brief line 19)

- **For Story 4.9 (CityView), new data to draw — all from `world.obstacles` / `world.map`, nothing new on the wire:**
  - **Shop-front glow:** `shopfrontsOf(world.map)` (`@topdown/shared`) → 5 strips with `face` (`n|s|e|w` = the side touching the shop; light falls away from it) and `shop` (the collision box). They are `stage1_evening` props of kind `shopfront` in layer `stage1_shopfronts`, so a renderer that walks `map.stages[0]` by kind sees them too. Placeholder: `StreetView.PROP_FILL.shopfront` (one line; drop it when CityView replaces StreetView). Whether shops stay lit at stage 2+ (night) is 4.9's call.
  - **Moved cars:** `world.obstacles.cover` entries named `<curb car>_in_road` (kind `car`, boxes axis-aligned: 2 × 4.5 m either way); the curb car of the same name prefix is gone from the list at stage 2. Draw cars from `world.obstacles.cover` (not `map.cover`), redraw on `obstacles.version`.
  - **Barrier art:** `world.obstacles.cover` with `kind: "barrier"`: `police_barrier_north` (4.2), `police_line_lot` (9.5 × 0.5 m), `police_line_gas` (0.5 × 10 m). Bodies only — art should read as low/see-through (shots pass).
  - **Curb cars:** 5 new stage-1 cars (`curb_car_*`) in `map.cover` / `world.obstacles.cover`.
- **`tools/maps/buildDowntown.ts`** (+ generated `.tmx`, `.tmj`, shared copy): Story 4.8 also edits this file (stage 3): take both sides in the source and **regenerate** (`npx tsx tools/maps/buildDowntown.ts`); never merge the generated files by hand. Constraints for 4.8: `street_car_west` and `parked_car_2` never move (the ignite group targets them); keep new stage-3 boxes ≥ `spawnClearM` from every spawn and off the shop fronts (`decay/panic.test.ts` checks every add/block of every stage); variant masks double per pick-1-of-2 group (the all-combination tests scale with `legalDecayMasks`).
- **`decay/decayState.ts`:** `legalDecayMasks` added (export in `index.ts`).
- **Tests other stories may collide with:** `map/obstacles.test.ts` (stage lists now include `CURB_CARS` and `POLICE_LINES`; 4.8's stage-3 adds append after them), `decay/decay.test.ts` (Downtown data test lists every stage-2/3 mutation and variant: 4.8 updates the stage-3 lines), `zombies/downtown.fuzz.test.ts` (`MASKS` round robin: with more variants keep LAYOUTS ≥ masks or relax the "every mask ran" assert).
- **Client:** `audio/ambience.ts` (new; Story 4.8 adds its rain loop id to `AMBIENCE_LOOPS`, a synth branch and `ambienceLoopForStage(3)`), `audio/placeholderSfx.ts` (`audioContextIfRunning`), `scenes/GameScene.ts` (3 lines: create / update / dispose next to DecayView — if 4.9 replaces DecayView, keep the `ambience` lines), `debug/collisionGridView.ts` (draws `world.obstacles` lists), `render/StreetView.ts` (one PROP_FILL line).
- **Schema / syncState / stateView / devThrottle / mirror / Predictor / snapshot:** untouched. `mapVersion` changes (bundled map): old tabs get "Please refresh".

### File List

- New: `packages/shared/src/map/shopfronts.ts`, `packages/shared/src/map/evening.test.ts`, `packages/shared/src/decay/panic.test.ts`, `apps/client/src/audio/ambience.ts`, `apps/client/src/audio/ambience.test.ts`, `_bmad-output/implementation-artifacts/4-6-evening.md`, this file.
- Modified (shared): `decay/decayState.ts`, `index.ts`, `map/data/downtown.tmj.json`; tests `decay/decay.test.ts`, `map/downtown.test.ts`, `map/obstacles.test.ts`, `zombies/downtown.fuzz.test.ts`.
- Modified (client): `audio/placeholderSfx.ts`, `debug/collisionGridView.ts`, `render/StreetView.ts`, `scenes/GameScene.ts`, `public/assets/maps/downtown.tmj`.
- Modified (server): test `rooms/schema/syncState.test.ts`.
- Modified (tools): `maps/buildDowntown.ts`, `maps/downtown.tmx`, test `netsim/coverShots.test.ts`.
- Tracking: `_bmad-output/implementation-artifacts/sprint-status.yaml`.

### Merge with the work branch (deb09ce, Story 4.9 Dead City look)

- `render/StreetView.ts` (deleted by 4.9, modify/delete): deleted; its one-line shop-front tint is replaced by the real thing — CityView's shop-window light (`drawLightmap` / `drawGlow`) now comes from `windowSpill(map, dressing)` (`render/city/drawCity.ts`): one facade segment per `shopfrontsOf(map)` strip, on its glowing face, shining across the strip; colour/strength from the new `Dressing.shopLight` (by shop-front name, the values of 4.9's hand-placed front spills); `Dressing.spill` keeps only the three side-facade lights. Test `render/city/windowSpill.test.ts`; 4.9's contrast test (roofs brighter than lit sidewalks, every stage) still passes, now with every candidate on (`ALL_VARIANTS = 0xff`).
- `scenes/GameScene.ts`: 4.9's CityView kept; the ambience player's create / update / dispose lines re-added next to it.
- Moved cars and barriers: CityView already draws `world.obstacles.cover` by kind (car sprites with a stable colour by name for `*_in_road`, `PROP_BARRIER` striped police barriers with a short low shadow; after the review every barrier has its two blinker lamps) — checked in the browser at stage 2.
- 4.9 tests updated for the 4.7 data: `stageFilter.test.ts` (fire bits are 6–7 now; the moved car replaces 4.5's abandoned car), `palette.test.ts` (the "night darkens" asphalt probe moved 2.5 m east, off the north street's moved car, whose lit top made stage 2 brighter there).
- Map files regenerated from the merged generator: no change. Dev collision view fix kept.
- Gates after the merge: typecheck, lint, test (185 files, 1,342 passed, 3 skipped; load 0.5–1.7), build green. Screenshots: `/home/claude/proto/s467/stage1-evening-deadcity.png`, `stage2-panic-deadcity.png` (+ `stage2-panic-collision.png`).

## Senior Developer Review (AI)

Fresh-agent review of c78e8ee (Stories 4.6 + 4.7 with the 4.9 merge): **approved with fixes**. All fixed on `story-4-6-7`:

| # | Severity | Finding | Fix |
| --- | --- | --- | --- |
| M | Medium | `AmbiencePlayer.build()` synthesized both 8 s loops on the main thread at the first update after the context ran (54–78 ms in Node, likely ≥ 200 ms on a mid-range Android), on the first tap in combat and again every run (dispose dropped the buffers). | The Float32 loop data is synthesized once per page and cached at module level (`ambienceLoopData`). `synthAmbienceSteps` is a generator that yields every 8,192 samples; `prewarmAmbience()` (called by the Boot scene: start screen / lobby) runs it from idle callbacks (`requestIdleCallback`, `setTimeout` fallback) while the deadline has > 2 ms left. The player never synthesizes: until the data is ready it waits as if audio were locked (and asks for the prewarm). Every later player / run / restart only copies the cached data into a new `AudioBuffer`. Tests: the player waits while the data is missing; the prewarm takes > 10 idle slices on a busy page; a second player (new context, new run) synthesizes nothing (`ambienceSynthStats.loops` unchanged) and plays the cached data; the sliced loop equals the one-shot one. |
| L | Low | `dispose()` left the sources running and the nodes connected; deleting `source.stop` passed all 5 ambience tests. | `dispose()` stops both sources and disconnects the sources, the voice gains and the bus. Test on the fake context: both sources stopped, each of the 5 nodes disconnected once. |
| L | Low | `unlockAudio` resumed only a `suspended` context (iOS reports `interrupted` after a call or Siri). | Resumes whenever the state is neither `running` nor `closed`. Test `audio/placeholderSfx.test.ts` (suspended, interrupted → resume; running, closed → none; `audioContextIfRunning` follows). |
| L | Low | `palette.test.ts` used `0xff` (every candidate at once, not a real run) with a stale comment. | The contrast test loops over `legalDecayMasks` (the 30 real combinations) at every stage; comment fixed. |
| L | Low | The two new police lines had no blinker lamps (the pool held 2). | Every barrier gets two lamps: `BARRIER_LAMPS` = 8 (in `drawCity.ts`, used by CityView), each barrier's pair alternates; lamps sit at both ends of the barrier's long side (`police_line_gas` runs north–south). Test: every barrier at every stage × combination gets 2 lamps ≥ 80 % of its length apart, within the pool. |
| L | Low | `coverShots.test.ts` depended on a hunted seed (423 → 425). | Seeds 421–425 all run; per seed the client and server stop the same shots, and the liveness is the sum over the five seeds (> 5; the rifle run keeps its own > 3). |
| L | Low | "A path can still be closed" checked only line tests. | (`segmentHitsBuildings` does include the World's obstacles — map boxes and cover — then buildings.) The test now also checks a body's radius fits through the gap before, and the zombies' flow field: from a target inside the lot, the field cost at alley 2's head goes 35 → 87 once the barricade closes the gap (asserted > 1.5×). |
| Flake | — | `RunRoom.buildings.test.ts` "refuses to the sender only" failed under load even with a 5 s wait. | **Cause: the per-client rate limiter, not slowness.** The host sent 14 "other" messages (2 in `startTwo` + 12 in the test) against a 10-token bucket refilled at 10/s by *arrival* time on the server; the last message needed ≥ 0.4 s of arrivals since the first. Instrumented: 0.85 tokens were left just before the final placement, which only succeeded because ~0.1 s had passed. Under load the socket delivers queued messages in a burst, arrivals bunch up, the final `building.place` is rate-dropped silently and no refusal ever arrives — no wait can fix that. Reproduced deterministically by freezing the guard's clock (old test fails at the cap step; new one passes). Fix: the 6 placements that only fill the cap go through `room.controller.placeBuilding` directly, so the host sends 8 messages, inside the bucket's capacity whatever the timing; the test asserts 0 rate drops for the host (a regression shows as that, not a timeout); the 5 s timeout is gone. |

Gates after the fixes: typecheck, lint, test (186 files, 1,346 passed, 3 skipped; load 0.4–1.1), build green.

**Mutations proven after the fixes** (each made its test fail, then restored): R1 `dispose` without `source.stop` → dispose test; R2 without the disconnects → dispose test; R3 `build()` synthesizes again → reuse test; R4 the idle work ignores the deadline → slices test; R5 the player synthesizes when the data is missing → 3 tests; R6 `unlockAudio` back to "suspended" only → unlock test; R7 two barrier lamps in all → lamps test; R8 a vertical barrier's lamps both at its middle → lamps test; R10 shop light ignoring the shop fronts → window-spill test; the lot-gap barricade left out → the flow-field check alone fails (35 vs > 52.5). The build's M1–M17 stand.

## Change Log

- 2026-11-22: Story file written (gds-create-story) and built together with 4.6 on `story-4-6-7`. Status review.
- 2026-11-22: Merged the work branch (deb09ce, Story 4.9); shop-front light from `shopfrontsOf` in CityView.
- 2026-11-22: Review (approved with fixes): M ambience synthesis once per page in idle time; L dispose, iOS "interrupted" unlock, palette over the real combinations, lamps on every barrier, coverShots seeds, lot-gap flow check; the RunRoom.buildings flake (rate-limiter race) fixed. Status done.
