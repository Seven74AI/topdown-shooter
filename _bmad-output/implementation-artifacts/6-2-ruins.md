# Story 6.2: Ruins

Status: drafted (ready-for-dev once the designer confirms docs/epic-6-decisions.md › Story decisions to confirm)

## Story

As a player,
I want rubble to close an alley and new holes to open in the walls,
so that the map squeezes us as the city breaks.

> **EPIC 6 BRIEF** (`docs/epic-6-brief.md`), pasted verbatim. Every line applies; reviewers check each one.
>
> ```
@@BRIEF@@
> ```
>
> Most relevant here: 2 (rubble and breaches are map data applied by `applyDecayStage` on every copy: no new synced field), 3/4 (fairness rules, "Beat the rule"), 5 (rubble = hard cover; lobs fly over it), **7 (rubble, the closed alley and the breaches: the "no area is ever enclosed" test on every stage × variant, plus the fuzz)**, 8 (alley, look and flicker from the `decay` stream / the run seed only), 9 (liveness: an alley closed, a building refunded, a zombie from a breach), 10 (flicker numbers in `decay.json`), 12 (rubble in the bake, pooled lamp and dust sprites), 13 (rubble reads as solid cover), 14 (a tab asleep across the wave-7 build start), 18 (decay-stage cheat + `DEV_DECAY_STAGES=4`), 20 (every new texture registered), 24 (colour rule), 26 (flicker is the same on every phone).

## Acceptance Criteria

### Fairness rules (player-visible; brief line 3; each is tested)

- **F1 "Rubble only lands between waves, and you see it land."** Stage 4 is applied only at the build start before wave 7 (`decay.json › stageByWave[6] = 4`), never mid-wave. The "Ruins" banner shows, a rumble plays and a dust burst rises at the closed alley and each pile (D9). A survivor standing where rubble lands is moved out by the existing push-out (`relocateBodies`), never left inside.
- **F2 "Rubble is hard cover, like a car."** Every rubble box stops bullets (players', teammates', turrets'), bodies (players, every zombie incl. the Brute's wide body), melee, spit, flames, acid, gas and blasts (they are shielded behind it). Lobbed rounds (Grenade Launcher, hand grenade, molotov) fly over it, because rubble is not `building: true` (alignment Q8). It looks heavy and solid (brief 13).
- **F3 "You can't build on rubble, and you get half back if it lands on your building."** Placing on rubble is refused with the red reason line "Blocked by rubble" (Story 5.17). A building (incl. floor traps and mines) that rubble lands on is destroyed at that build start and its owner gets the usual `floor(price × 0.5)` back (FR53, `decay.json › buildingRefundShare`).
- **F4 "The map never traps anyone."** At every stage × every legal variant combination: every walkable cell is reachable from the team start, no slot is narrower than a body, every open spawn's jitter area is clear of solids, and the team start is clear (the 4.5/4.7 tests, extended). A collapsed alley is closed **wall to wall** (D1): nobody, player or zombie, can be inside it.
- **F5 "Zombies never come out of rubble."** The spawn point inside the collapsed alley is closed from stage 4 on (the "buried" rule, Decision 2). The two breaches open at stage 4 and follow every 4.3 rule (≥ 6 m + jitter from every living player, never inside a box, `spawnClearM` 2 m kept clear of buildings).
- **F6 "Flickering lamps are only a warning."** At stage 4 each streetlight drops out for 0.15–0.6 s every 4–10 s. It changes nothing in the game (no darkness layer at stage 4, zombies and aim assist unaffected) and it looks the same on every phone (keyed to the run seed and the server tick).
- **F7 "Falling debris never hurts."** Dust puffs and debris sounds are ambience only (designer D4): no damage, no slow, no collision.

### Behaviour

1. **Stage 4 map data (FR62).** `tools/maps/buildDowntown.ts` gains the stage-4 `decay` objects, appended **after** every existing decay object (so `pickDecayVariants` draws the existing groups first and every existing seed keeps its cars and fires):
   - **Collapsed alley** (group `ruins_alley`, `pick 1`, stage 4): three candidates, each one `block` mutation filling the alley wall to wall: `rubble_alley_1` x 8–11, y 0–10; `rubble_alley_2` x 7–10, y 22–32; `rubble_alley_3` x 38–41, y 22–32. The alley-3 candidate also `remove`s `dumpster_alley_3` (same variant), so two walls never overlap.
   - **Three street piles** `rubble_pile_1..3` (`block`, stage 4, no variant: the same 3 spots every run, D4), each ≈ 2 × 1.5 m on the 0.5 m lattice. Zones: one in the west street, one in the north or south street, one in the east street. Each is ≥ `buildings.spawnClearM` (2 m) from every spawn point, off every lit shop front, off the 4 team-start slots, and either flush with or ≥ 1.0 m from every other solid it can meet at stage 4–5 under any variant (the closed-edge test).
   - **Two breach spawn points** (`spawns` layer, new kind `breach`, `minStage: 4`): `breach_apartments` (16.0, 10.6) on the apartments' south wall, jitter x; `breach_offices` (29.4, 26.0) on the offices' west wall, jitter y (D3). Each ≥ 9 m from the team start; jitter areas clear at every stage (test).
   - **Ruins look** (group `ruins_look`, `pick 1`, stage 4): three `look` objects `ruins_look_concrete`, `ruins_look_brick`, `ruins_look_slab` (RU1–RU3; RU4 is the endless look, D6).
   - Then `npx tsx tools/maps/buildDowntown.ts` regenerates `tools/maps/downtown.tmx`, `apps/client/public/assets/maps/downtown.tmj` and `packages/shared/src/map/data/downtown.tmj.json` (`downtown.test.ts` checks the three agree).
2. **New decay action `look`** (`map/districtMap.ts › DECAY_ACTIONS`): a point object that only carries a variant (no box, no gameplay). `loadTiledMap` accepts it (needs `variant`/`group`/`pick`), `fillObstacles` and `applyDecayStage` skip it. Variant bits after this story: 9 (cars, fires) + 3 (alleys) + 3 (looks) = 15 ≤ `MAX_DECAY_VARIANTS` 32 (6.4 adds 4 more).
3. **Spawn kind `breach`** (`SPAWN_KINDS`): spawns like a `window` (jitter along the wall). `spawnSide` puts `breach_apartments` on W and `breach_offices` on S (check in a test; the side weighting stays fair).
4. **Buried spawns** (`waves/spawnPick.ts › classify`): a spawn point whose position lies inside an active solid (`world.obstacles.solids`) is CLOSED. Cached per `world.obstacles.version` in a `Uint8Array` (no per-pick box loop, no allocation). The dev spawn view shows it as closed.
5. **Rubble rules** come for free from `block` (= a wall: `solids`, `shotBlockers`, not `lobBlockers`), so `shotBlockT`, `meleeLineClear`, `shotLineClear` (blasts, acid, gas, fire zones), `placementError` (`cause: "solid"`), `destroyBlockedBuildings` and `relocateBodies` need no change. Tests assert each one against a rubble box (F2, F3). `apps/client/src/scenes/blockText.ts › SOLID_NAMES`: every `rubble_*` name → "rubble" (a prefix rule, not 6 entries).
6. **Shared helper for the boss** (6.6): `map/obstacles.ts › rubblePiles(o, out)` fills `out` with the active `rubble_pile_*` and `rubble_alley_*` boxes (no allocation). The Behemoth's throw lifts a chunk from the nearest one within 6 m (visual only).
7. **Streetlight flicker** (client, cosmetic): `decay.json › ruins: { "lampOutMinS": 0.15, "lampOutMaxS": 0.6, "lampGapMinS": 4, "lampGapMaxS": 10 }`. Pure `apps/client/src/render/city/lampFlicker.ts › lampOutAt(seed, lamp, tick, cfg): boolean` (jittered windows of `(gapMin + gapMax) / 2` = 7 s with ± 3 s jitter on each start, so consecutive gaps are 4–10 s; duration 3–12 ticks). Active at stage 4 in every phase (build and wave) while the power is on and `isBlackout(world)` (6.3, `decay/lightState.ts`) is false (stage 5: the power is out, 6.4; a power-failure blackout: lamps are off, 6.10). The existing broken lamp (`DOWNTOWN_DRESSING.flickerLamp`, index 4) keeps its fast flicker.
8. **Shop glow 30 %.** `palette.ts › NIGHT_BY_STAGE[3].spillK` 0.6 → **0.3** (30 % of the night level, which is 1.0); neon signs × 0.3 at stage 4 (D8). Stage 5 (6.4) turns both off.
9. **Ruins look (art).** The run's material comes from the `ruins_look` bit (RU1 concrete + rebar, RU2 brick, RU3 wall slabs); waves 11+ use RU4 fire-gutted (`ruinsLookAt(world)`: pure, shared, reads `world.decay.variants` and `world.waves.number`). Drawn at bake time (`drawCity.ts` `blocks` branch, today the generic `PROP_BLOCK`): the alley heap wall to wall (biggest pile at the street end), the three piles, the sidewalk spill, the diner's caved-in roof corner (visual only), breach holes on the two walls (drawn from the `breach` spawn points once the stage reaches their `minStage`, so they show at stages 4 and 5 without duplicating props), loose debris (visual props in `stage4_props` and `stage5_props`). RU4 adds soot fans and glowing embers.
10. **Ambience (D10).** `audio/ambience.ts`: a new loop `ruins` (wind + creaks + distant falls), `ambienceLoopForStage(4) = "ruins"` (stage 5 = 6.4's `collapse`). Dust puffs: a pooled client effect (≤ 40 smoke + 60 grit particles, halved with `?fx=low`) at a random pile, roof edge or the alley every 0.6–1.6 s within the view, with a `debris_fall` placeholder SFX (panned).
11. **Collapse moment (D9).** On `decay.stage_changed` with `stage === 4`: one 2 s dust burst at the closed alley and each pile, and a low rumble SFX (`ruins_rumble`), next to the existing "Ruins" banner (`GameScene` › `stackBanner`). A hidden tab that wakes after the build start shows the stage without the burst (the burst is a one-off cue; the bake is the truth).
12. **Tests** (each fairness rule is one): enclosure/slot/jitter/team-start over the new combinations; buried spawn closed; breach spawns open at 4 and never NEAR/inside a box; rubble stops a bullet, melee, a blast, acid and a body; a lob flies over a pile; placement refused + reason text; a barricade, a spike trap and a mine on a pile spot are destroyed + refunded; a player on the alley is relocated; flicker windows 4–10 s / 0.15–0.6 s and seed-stable; `ruinsLookAt` (bit → RU1–3, wave ≥ 11 → RU4); old seeds keep their car/fire picks; 10-wave sim reaches stage 4 with ≥ 1 zombie spawned from a breach (needs 6.1; until then `decayStageByWave` override).

## Tasks / Subtasks

- [ ] **T0 Art (from the picks; no new pick).** `docs/epic-6-decisions.md` › section 1 Ruins: **all four** RU1–RU4, one material per run (decay stream), RU4 the endless look. Port `rubblePile`, `chunk`, `brick`, `rebarStick`, `beamPiece`, `dustSkirt`, `gravel`, `brokenRoof`, `breach`, `soot`, `dustFx`/`stepDust`/`drawDust`, `lampDark` and the `MATS` table from `docs/art/epic-6/src/main1.js` (+ helpers from `lib.js`) into game code: `apps/client/src/render/city/ruinsArt.ts` (pure canvas painters, seeded by object name hash: same pile looks the same every bake). Bake-time drawing goes into the city bake (registered as `city_static_*`, Story 4.13: covered by `invalidateBake`); the dust and lamp-out sprites are frames in the FX atlas (`ATLAS_FX`, `addGeneratedTexture` via `ensureAtlases`). Screenshot all four materials at 1240 and 390 px (like `docs/art/epic-6/ingame/ru-*.png`) for the designer's review.
- [ ] **T1 Map data + loader** (AC 1–3)
  - [ ] `map/districtMap.ts`: `DECAY_ACTIONS` += `"look"`; `SPAWN_KINDS` += `"breach"`.
  - [ ] `map/loadTiledMap.ts`: `look` = a point with `variant`/`group`/`pick` (fail without), no target, no box; `breach` spawns need a `jitterAxis` (like windows).
  - [ ] `map/obstacles.ts › fillObstacles`: skip `look` (it never adds/removes anything); `rubblePiles(o, out)` helper (AC 6).
  - [ ] `tools/maps/buildDowntown.ts`: the objects of AC 1 appended after the 4.8 fires; update the header diagrams and the "Stages 4–5: none yet" comment; regenerate the three map files.
  - [ ] `decay/decayState.ts`: `legalDecayMasks(map, { gameplayOnly })` (skip groups whose objects are all `look`), so the enclosure tests walk 45 × 3 = 135 gameplay combinations, not × 3 looks more.
  - [ ] Tests: `loadTiledMap.test.ts` (+ `look` parsed, `look` without variant refused, `breach` kind), `downtown.test.ts` (+ the generated files agree; 2 breaches at `minStage` 4; 3 alley candidates, 1 picked), `decay.test.ts` DecayTimeline (+ **every old seed keeps its car and fire bits** (bits 0–8 equal before/after for seeds 1–256), exactly 1 alley and 1 look per run, each candidate occurs).
- [ ] **T2 Buried spawns + breaches** (AC 3, 4; F5)
  - [ ] `waves/spawnPick.ts`: buried cache keyed by `obstacles.version`; CLOSED for a buried point; `SPAWN_STATE` unchanged (CLOSED reused).
  - [ ] Tests `spawnPick.test.ts` (+ `the collapsed alley's mouth is CLOSED at stages 4–5 and OPEN at 1–3`, `both breaches OPEN at 4, CLOSED at 1–3`, `breach sides W and S`, `no allocation per pick` (the 4.3 pattern)); `panic.test.ts` / `decay.test.ts` jitter-area and "nothing appears within spawnClearM of a spawn" tests exempt only a spawn that the appearing box buries (assert that exemption list is exactly the 3 alley mouths).
- [ ] **T3 Rubble rules** (AC 5; F1–F4)
  - [ ] Tests `decay/ruins.test.ts` (new): per pile and the alley: `bullet stops at the face`, `melee blocked`, `blast shielded` (`explode` behind a pile), `acid puddle and fire zone don't hurt across it`, `a Walker, a Runner and a Brute path round it` (flow field reaches the far side), `a grenade-launcher round flies over a pile`, `placement refused with cause solid`, `barricade / spike trap / mine / turret on the spot destroyed at the build start with 50 % refund (money.earned reason refund)`, `a player and a zombie standing in the alley at the build start are relocated, nobody left inside a box`.
  - [ ] Extend the enclosure test (`decay.test.ts` "no enclosed area" and `panic.test.ts` "keeps the map fun") to stages 1–3 × the 45 old masks and stages 4–5 × the 135 gameplay masks (405 Worlds; record the run time with load; `testTimeout` 30 s).
  - [ ] `apps/client/src/scenes/blockText.ts`: `rubble_*` → "rubble" (+ `blockText.test.ts`).
- [ ] **T4 Flicker + shop glow** (AC 7, 8; F6)
  - [ ] `decay.json › ruins` + `balanceSchema.ts` (strict object; min ≤ max; gaps > durations).
  - [ ] `render/city/lampFlicker.ts › lampOutAt` (pure, no allocation) + test (windows, gaps 4–10 s, durations 0.15–0.6 s over 10 min of ticks, same seed → same pattern, two lamps differ).
  - [ ] `CityView`: a pool of 11 `lampDark` images (MULTIPLY blend, depth `DYN_LIGHT_DEPTH`, below characters; check the Phaser 4 blend-mode constant in `node_modules/phaser/types`), positioned at `dressing.lamps`, visible only while `lampOutAt` is true at stage 4 with the power on and `!isBlackout(world)`. Tick source: the World's tick (the mirror follows the server's), so phones agree.
  - [ ] `palette.ts`: stage-4 `spillK` 0.3; neon × 0.3 at stage 4 (`drawGlow`); `palette.test.ts` contrast test still passes for every stage.
- [ ] **T5 Ruins look + ambience** (AC 9–11; T0)
  - [ ] `shared`: `ruinsLookAt(world)` (`decay/ruinsLook.ts`, exported; pure).
  - [ ] `drawCity.ts`: `blocks` branch draws rubble with the run's material (alley heap, piles); `PROP_DUMPSTER` stays for the dumpster; breaches from `breach` spawn points; diner roof corner at stage ≥ 4 (a dressing entry `ruinedRoofs`); RU4 soot/embers. `stageFilter.ts › staticKey` gains the look id, so the wave-11 switch to RU4 rebakes once.
  - [ ] `CityView` / a small `DustView`: the pooled dust puffs + the stage-4 collapse burst (AC 11).
  - [ ] `audio/ambience.ts`: `ruins` loop (synth placeholder) + `ambienceLoopForStage`; `placeholderSfx.ts`: `ruins_rumble`, `debris_fall`. Tests `ambience.test.ts` (+ stage 4 → ruins, crossfade from panic).
  - [ ] Readability sheet (`docs/playtests/milestone-1/readability-sheet.md`): rubble pile ("does it stop bullets?" yes), collapsed alley, breach hole.
- [ ] **T6 Fuzz, sims, perf** (brief 7, 9, 12, 16)
  - [ ] `zombies/downtown.fuzz.test.ts` (extend): stages 4–5 × random gameplay masks × random barricade layouts × ≥ 3,000 ticks with Brutes: no body inside a box (rubble included), no stall, zombies from both breaches reach a player, flow fields rebuild walls only at build starts; liveness: ≥ 1 zombie from each breach, ≥ 1 building destroyed by rubble with a refund.
  - [ ] Sim: the 10-wave sim (6.1) or `decayStageByWave` override reaches stage 4: assert the alley closed, a breach used.
  - [ ] Bake time at stage 4 (record `CityView.bakeMs` before/after, headless + load) and `?stress=150` FPS with stage 4 forced (decay cheat), flicker and dust on.
- [ ] **T7 Gates.** Mutations (e.g. buried rule removed → spawn test; alley box 0.5 m short of a wall → closed-edge/enclosure test; rubble given `building: true` → lob test; flicker gap max 12 s → flicker test; `look` not skipped in `fillObstacles` → obstacle count test) and which tests failed. Browser check (Playwright): solo with the decay-stage cheat at 4 (each alley via `?seed=`), online two tabs with `DEV_DECAY_STAGES=4` and `?lag=150&jitter=20`: same alley, same look, lamps flicker in step on both, "Blocked by rubble", a hidden tab across the build start converges. `typecheck && lint && test && build`. Merge notes.

## Dev Notes

### Designer decisions to confirm (made non-interactively; recommended values)

1. **6.2 D1 How the alley closes:** the whole alley fills with rubble **wall to wall** (nobody can enter; its edge spawn closes). Alternative: a heap only at the street end (would leave a dead-end pocket with a live spawn inside, which the "nothing is ever enclosed" rule forbids). Recommended: whole alley.
2. **6.2 D2 Which alley:** any of alleys 1, 2, 3, one per run at random (the GDD's "which alley collapses"). Alternative: always alley 2 (the one on the look page). Recommended: random of 3.
3. **6.2 D3 Where the two breaches open:** apartments' south wall (16.0, 10.6) and offices' west wall (29.4, 26.0), both facing the intersection, one each side. Alternative: the diner's north wall as drawn on the look page (it sits 1.1 m from the diner's existing window spawn, so it adds little). Recommended: apartments + offices.
4. **6.2 D4 Street piles:** the same 3 spots every run (one west street, one north or south street, one east street). Alternative: 3 of 5 spots per run (more variety, 10× more map combinations to test). Recommended: fixed 3.
5. **6.2 D5 Rubble as cover:** stops bullets, bodies, melee, spit, blasts and gas like a car; lobbed rounds fly over it; "Blocked by rubble" when you try to build on it. (Confirms alignment Q8.) Recommended: yes.
6. **6.2 D6 Ruins look per run:** waves 7–10 use RU1 concrete, RU2 brick or RU3 slabs (one at random per run); endless (wave 11+) always switches to RU4 fire-gutted. Alternative: all four random in waves 7–10, RU4 again in endless. Recommended: RU1–RU3, then RU4 in endless.
7. **6.2 D7 Flicker:** each streetlight goes out for 0.15–0.6 s every 4–10 s at stage 4, in waves and build phases. Alternative: only in waves. Recommended: always at stage 4.
8. **6.2 D8 Shop glow at stage 4:** 30 % of normal, neon signs too. Alternative: 50 % (the look page's prototype value). Recommended: 30 % (the epic's number).
9. **6.2 D9 The collapse moment:** when Ruins starts, a 2 s rumble and a dust burst at the closed alley and each pile, with the "Ruins" banner. Alternative: banner only. Recommended: rumble + dust.
10. **6.2 D10 Falling debris:** a dust puff with a debris sound somewhere on screen every 0.6–1.6 s; never damage (D4). Recommended: yes.

### Decisions (developer guidance)

- **Rubble is a `block` mutation.** A `block` box is a wall: `solids` + `shotBlockers`, not `lobBlockers` (it has no `building` flag). That gives F2/F3 with zero rule code; tests prove it. Do not add a new cover kind.
- **Buried rule, not per-variant spawn data.** "A spawn point inside an active solid is closed" is generic, data-free and covers any later map. Cache by `obstacles.version`.
- **Looks are variants.** The run's material rides on the existing synced `decayVariants` mask (no new schema field, replays and late joins get it for free). `look` objects are no-ops for the sim.
- **Append, never insert,** stage-4 decay objects: `pickDecayVariants` walks groups in first-appearance order; appending keeps every recorded seed's cars and fires (and replays). The snapshot digests of seeds that reach stage 4 change (expected; update fixtures that pin them, say which).
- **Flicker is cosmetic and client-side**, keyed to (run seed, lamp index, World tick): no stream draw, no sync, not in `snapshotWorld`. It must not write the shared light state (`world.lights`, `decay/lightState.ts`; `refreshBlackout` is its only writer, 6.3); it only reads `isBlackout(world)`.
- **Rubble drawn at bake time**, not as atlas frames: big irregular heaps are cheaper baked once per stage; the bake is already registered for Android redraws (`city_static_*`).
- **Neon × 0.3 lives in the client** (palette/drawGlow); the flicker numbers live in `decay.json` (designer-tunable).

### Current state (read before changing)

- `packages/shared/src/decay/applyDecayStage.ts › applyDecayStage(world, stage, variants, firesOut)`: THE shared apply: `fillObstacles` → `setNavWalls` (nav + wide) → fires → `updateLightState`. Idempotent, never per tick.
- `packages/shared/src/map/obstacles.ts › fillObstacles`: walls = map solids not removed + applied `block`s; solids = walls + active cover; shotBlockers = walls + car/bus cover; lobBlockers = walls with `building: true`. `mutationApplies(m, stage, variants)`.
- `packages/shared/src/map/districtMap.ts`: `DECAY_ACTIONS = ["add", "remove", "ignite", "block"]`, `SPAWN_KINDS = ["street", "alley", "manhole", "window"]`, `MAX_DECAY_VARIANTS = 32`, `MapBox.building`.
- `packages/shared/src/map/loadTiledMap.ts` (~l. 300–425): decay layer parsing, `variant`/`group`/`pick` validation ("pick < candidates", one stage per group, ≤ 32 variants).
- `packages/shared/src/decay/decayState.ts`: `pickDecayVariants` (groups in first-appearance order, partial Fisher–Yates from `streams.decay`), `legalDecayMasks` (Downtown today: C(6,4) × C(3,2) = 45), `stageForWave`.
- `packages/shared/src/decay/decaySystem.ts`: `destroyBlockedBuildings` (overlap with any solid → destroyed, `refundMoney(floor(price × buildingRefundShare))`), `relocateBodies` (players: push-out, free-spot rings, team starts; zombies: push-out or removed), `decayFinish` rebuilds the fields and emits `decay.stage_changed`.
- `packages/shared/src/waves/spawnPick.ts › classify`: CLOSED (`minStage > stage`) → BLOCKED (building within `spawnClearM`) → NEAR → OPEN; scratch arrays, no allocation.
- `tools/maps/buildDowntown.ts`: collision, cover, 19 spawns, `gas_leak_zone`, decay (4.5 driven-off car, dumpster, police lines, 6 panic movers, 3 fire candidates), stage groups (`stage4_ruins`/`stage5_collapse` are empty layers). Alleys: 1 = x 8–11, y 0–10 (mouth spawn 9.5, 0.5); 2 = x 7–10, y 22–32 (8.5, 31.5); 3 = x 38–41, y 22–32 (39.5, 31.5; `dumpster_alley_3` 38–39.5 × 26–27.5 from stage 2).
- `packages/shared/src/config/balance/decay.json`: `stageByWave [1,1,2,2,3,3,4,4,5,5]` (already 10 waves), `stageNames` (… "Ruins", "Collapse"), `buildingRefundShare 0.5`, `fire {…}`.
- Tests that walk every stage × mask: `decay/decay.test.ts` ("note for 4.6–4.8 … no enclosed area", 5 × 45), `decay/panic.test.ts` ("keeps the map fun": closed edges, spawn jitter areas, team start; "nothing that appears lands within spawnClearM of a spawn").
- Client: `render/city/CityView.ts` (bake per `staticKey`, pooled flicker pool/core for `flickerLamp`, rain, splashes, vignette; `textureRegistry.register(city_static_*)`), `render/city/drawCity.ts` (`classify` → `blocks` drawn as `PROP_DUMPSTER`/`PROP_BLOCK`; `drawLightmap`/`drawGlow` bake lamps, spill, neon, canopy, headlights from `dressing.ts` and `nightAt(stage)`), `render/city/palette.ts › NIGHT_BY_STAGE` (stage 4 "late night": spillK 0.6), `render/city/dressing.ts › DOWNTOWN_DRESSING` (11 lamps, `flickerLamp: 4`), `render/city/stageFilter.ts` (`blockNames`, `staticKey`, swap model: stage N shows only `stageN_*` props).
- `apps/client/src/audio/ambience.ts`: only `evening` and `panic` loops (stage ≥ 2 = panic; the stage-3 rain loop of Story 4.8 was never added: not this story's scope, note it).
- `apps/client/src/scenes/blockText.ts › SOLID_NAMES` (5.17 reason words).
- `apps/client/src/scenes/GameScene.ts` (~l. 1390): `decay.stage_changed` → `stackBanner(stageNames[stage − 1])`.

### Must be preserved

Every stage 1–3 layout and every existing seed's car/fire picks; 4.3 spawn rules and side weighting; 4.5 order (mutations → destroy + refund → relocate → fields → banner); 4.7 "no enclosed area / no narrow slot" at stages 1–3; 4.8 fires; the 5.7 wide grid (rubble grown on it too, automatic); 5.17 reason lines for every other solid; Story 4.13 redraws; `?fx=low`.

### Copies touched (brief 2)

World: none new (rubble = obstacles from `applyDecayStage`; looks = `decay.variants` bits; buried cache = scratch, derived). Schema / `syncState` / stateView / fakeRoom / devThrottle: **none** (`decayStage`, `decayVariants` already synced). Mirror and Predictor: `applyDecayStage` already runs there (rubble collides in prediction automatically: test one predicted walk into a pile, 0 corrections). `snapshotWorld`: obstacles already hashed; digests of runs reaching stage 4 change (fixtures listed in the Completion Notes).

### Beat the rule (for the reviewer; brief 4)

1. Stand in the alley that will collapse at the wave-7 build start (with a barricade there): where do you end up? Inside rubble? Refund paid once?
2. Find a gap between a pile and a car/curb car (every panic mask) that a Walker fits but a Brute doesn't, or a 0.5 m slot that pins bodies.
3. Shoot, swing, throw a grenade, drop a molotov and let a Bloater pop on the far side of a pile: which ones get through? (Only lobs fly over; their blast is shielded.)
4. Camp a breach: do zombies still come out of it while you stand on it? (No: NEAR rule.) Wall it off with barricades (`spawnClearM`)?
5. Use the collapsed alley's old mouth: can any zombie ever spawn there or get stuck in the alley?
6. Find a phone where the lamps flicker differently (late join, hidden tab, `?lag=150`).
7. Try to place a mine or spike trap on a pile spot during the wave-7 build (refused), or the build before (destroyed at the stage change, refunded).
8. Hide behind a pile from the Behemoth's slam (6.5: the slam ignores cover; only check the pile doesn't break its pathing).

### Bandwidth (brief 11)

0 B/s added: rubble, breaches and the look are in the already-synced stage + variants; flicker and dust are client-only. One `decay.stage_changed` per run as today.

### Phone FPS / Perf (brief 12, 16)

Server: nothing per tick (rubble adds ~6 boxes to `solids`/`shotBlockers`: every swept test loops a few more boxes; measure `tickCost` p99 at stage 4 with 150 zombies, `PERF_ASSERT=1`, record load). Client: rubble is baked (one bake per stage; record `bakeMs`), ≤ 11 `lampDark` images (only visible ones drawn), ≤ 100 dust particles (≤ 50 at `?fx=low`). Run `?stress=150` at stage 4 before/after and report headless FPS with load; the latest `docs/perf/` baseline is the floor.

### Art

From `docs/epic-6-decisions.md` § 1 Ruins (designer, 2026-11-24): all four RU1–RU4, one material per run by the `decay` stream, RU4 the endless look. Reference code: `docs/art/epic-6/src/main1.js` (`RUS`, `ruinsExtra`, `rubblePile`, `brokenRoof`, `breach`, `soot`, `lampOut`, `lampDark`, `dustFx`), screenshots `docs/art/epic-6/ingame/ru-1240.png` / `ru-390.png`, page claude.ai/artifact/7ikXRSUD7ZURpADLAtEPSJ. Colour rule (brief 24): rubble stays in the street's greys/browns (no red, no amber). All of it is game code; every texture through `addGeneratedTexture` (the FX atlas) or the registered city bake.

### Dependencies

- **None hard.** Stage 4 already exists in `decay.json` (`stageByWave[6] = 4`); before 6.1 the run ends at wave 6, so test with the decay-stage cheat, `DEV_DECAY_STAGES=4` or the `decayStageByWave` override.
- **6.4 Collapse** builds on this story's files (map data, `look` action, palette, ambience, `drawCity`): run 6.4 after 6.2 (or give both to one builder).
- **6.6 throw** reads `rubblePiles` (AC 6). **6.10 power failure** reuses the `lampDark` pool for its 2 s "all lamps flicker" warning.
- **Epic 5 in progress** (brief 27): 5.20–5.25 may edit `blockText.ts`/`buildBar.ts`; this story only adds the `rubble_*` word (merge note).

### Notes for the merge (brief 19)

- `tools/maps/buildDowntown.ts` + the three generated map files: 6.4 appends stage-5 objects after this story's; 6.9 may read `gas_leak_zone` (unchanged). Regenerate, never hand-merge the `.tmj`.
- `map/districtMap.ts` `DECAY_ACTIONS` / `SPAWN_KINDS`: append-only.
- `decay.json`: this story adds `ruins`; 6.4 adds `collapse`; 6.3/6.10/6.12 may add blackout keys: one strict schema object per block.
- `waves/spawnPick.ts`: 6.5 (boss entry side) and 6.8 (stampede edge) may read spawn sides; the buried rule is in `classify` only.
- `palette.ts`, `drawCity.ts`, `CityView.ts`, `stageFilter.ts`: 6.4 (power out, Collapse look, fog), 6.3 (darkness layer) and 6.11 (dawn) touch the same files: keep each change behind its stage/flag and append to tables.
- `audio/ambience.ts`: 6.4 adds `collapse`; keep `AMBIENCE_LOOPS` append-only.
- `scenes/blockText.ts`: one prefix rule; 5.20–5.25 may touch the hint text nearby.

### Suggested build round

**Round 1**, alongside 6.1 (waves), 6.3 (blackout lighting) and 6.5 (Behemoth): no shared files except `decay.json` (different blocks) and, with 6.3, `CityView.ts` (6.3 adds a separate darkness layer at `DARKNESS_DEPTH` 11.7, `render/darkness/aboveDark.ts`; lamps/dust stay at `DYN_LIGHT_DEPTH` 4.32, below it). **6.4 waits for 6.2 and 6.3.**

### References

- `epics.md` › Story 6.2 (FR53, FR62); GDD › Difficulty curve (W7–8 "Squeeze"), Decay table (Ruins row), Spawns ("collapsed walls"), Audio ("Ruins = wind, falling debris"), Readability.
- `docs/ideas/epic-6/proposal.md` § 3 Ruins, D4; `docs/epic-5-decisions.md` › Alignment answers Q8; `docs/epic-6-decisions.md` § 1 Ruins.
- `game-architecture.md` › Decay Stage Engine, Map loading (Tiled), Rendering.
- Story files 4.3 (spawn rules), 4.5 (decay engine, order), 4.7 (variants, "keeps the map fun"), 4.8 (fires, refunds), 4.9 (Dead City bake, palette), 4.12/4.13 (game-code art, texture registry), 5.7 (wide grid), 5.17 (reason lines).

## Dev Agent Record

### Agent Model Used

### Debug Log References

### Completion Notes List

### File List

## Change Log

- 2026-11-24: story drafted from the real code (gds-create-story)
