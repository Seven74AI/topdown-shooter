---
baseline_commit: d41add544890af0caad56a6ad0217eab6255ee83
---
# Story 6.2: Ruins

Status: review

## Story

As a player,
I want rubble to close an alley and new holes to open in the walls,
so that the map squeezes us as the city breaks.

> **EPIC 6 BRIEF** (`docs/epic-6-brief.md`), pasted verbatim. Every line applies; reviewers check each one.
>
> ```
> EPIC 6 BRIEF (from the Epic 4 retro's EPIC 5 BRIEF + Epic 6 specifics; reviewers: check each line)
> 1. Builders run in their own CLOUD SESSION (branch story-6-x, one container each; HANDOFF §3 Session 6 rules). Never `npm run dev` with fixed ports; assigned ports only; stop processes by PID. Before "done": git status clean; typecheck && lint && test && build on your branch merged with the current master. While building run only the touched areas' tests; ONE full gate at the end.
> 2. Every mechanic is shared sim code (packages/shared) used by server, solo (LocalSimHost), NetSimHost mirror and Predictor; list every copy touched (World → schema → syncState → stateView key lists → fakeRoom → mirror → Predictor → devThrottle → snapshotWorld). Boss, events, vote and light state are server truth; the client only draws.
> 3. FAIRNESS RULE FIRST: each mechanic's player-visible rule is written in the story ACs before building, and each rule is a test.
> 4. Reviewers: BEAT THE RULE. Try to exploit each mechanic as a player would (the story's "Beat the rule" list is the start, not the end) and list every attempt and its result.
> 5. Cover: bullets stop at map cover (cars, bus, buildings, pumps, parking wall, dumpster), at every barricade tier and at Ruins rubble. Lobbed rounds (launcher, hand grenade, molotov) fly over everything except real buildings (`building: true`); rubble is NOT `building: true`. Spit, flames, blasts, acid, gas and fire zones: cars, the bus, buildings and rubble stop or shield them (clear line from the centre). Sandbags, police barriers, turrets and floor buildings (traps, mines) stop bodies only. Melee is stopped by barricades, shot-blocking map cover and rubble. Behemoth slam and throw IGNORE cover ("the drawn zone is the promise"); the gas-leak blast uses the normal blast line of sight. Server and the client's cosmetic copy agree; rewound (2.12) hits for players' shots only.
> 6. Damage/area timing is per body (4.8 per-body burn clock), never a shared pulse tick that can be dodged. Boss hits resolve once, on the tick the telegraph ends.
> 7. Spatial code (rubble, breaches, the Behemoth body and charge, shoves, the survivor NPC, the helicopter pad, crate spots) gets a builder-written fuzz test: random layouts × every stage × variant × many ticks; no body inside a box, no stall, zombies and the boss reach a player, flow fields rebuild only at build start (the boss field is its own, on its own clock).
> 8. Randomness only from named seed streams (`decay` for variants/looks, `events` for event schedule/spots/weapons, `spawns`, `combat`); same seed + input log → same snapshotWorld digest, including boss and event state.
> 9. Liveness: every sim/replay/integration test asserts something really happened (all 10 waves played, the boss spawned/attacked/crashed/died, each event triggered, a vote resolved, ≥ 1 endless wave). Reviewers mutate each new test once and list which mutations failed.
> 10. Timers count ticks (1.2 s = 24 ticks); no per-tick/per-frame allocation (pool stamps, decals, markers, particles); every number in balance JSON (`waves.json`, `decay.json`, `boss.json`, `events.json`, …), no inline literals.
> 11. Bandwidth: telegraphs, event starts/ends and effects go out as reliable events (kind + start tick + fixed zone), not per-tick state; one boss record in the room state; report added B/s; total ≤ 30 KB/s per phone (horde ≤ 24).
> 12. PHONE FPS: new sprites/effects are atlased (category_name_variant, ≤ 2048²), pooled and capped (max live decals/particles in balance JSON). The reference low-end phone is the Xiaomi Mi 11i (designer 2026-11-24; the Honor 10 is not a test phone). Run ?stress=150 with the story's effects active; report headless FPS before/after with load; the latest recorded ?stress=150 baseline in docs/perf/ is the floor.
> 13. Readability: every new object must read at a glance and show whether it stops bullets (Dead City look, no outline aid); add it to the playtest readability sheet (`docs/playtests/milestone-1/readability-sheet.md`).
> 14. Lag/lifecycle: test under ?lag=150&jitter=20, after a hidden tab slept across a build start AND across a boss telegraph / event start / vote, on a late Game scene start and a reconnect; client shows server truth (pending until state agrees).
> 15. Balance: earnings stay as built until the Epic 5 balance pass settles them; prices and stats in balance JSON; bot survival is not difficulty evidence; run the 10-wave sim and assert all waves ended. Solo is "allowed, not tuned" and scales × 0.4 (Behemoth HP too).
> 16. Perf: tick asserts behind PERF_ASSERT=1, at load < 1, record the load; added server p99 ≤ 2 ms total budget for Epic 6 (boss field + events + vote).
> 17. Phaser 4 ≠ 3 (check node_modules/phaser/types); Colyseus: this.net.guard, ServerError(526) for joins only; the per-client guard drops > ~10 non-input msgs/s silently (votes and pings are inputs to budget for).
> 18. Dev overrides via switches (DEV_*, ?loadout, ?wallet, ?wavemix, ?seed, the decay-stage cheat, new: force blackout, start at wave N, force event X, spawn Behemoth), never hand-edited JSON; say plainly what you did not verify (headless Chromium ~8–26 fps).
> 19. Write "Notes for the merge" for each shared file. Every medium/high fix gets a re-review by a fresh agent before master. Each story goes to master as soon as its review (and re-reviews) is clean.
> 20. Every texture drawn in code is created through addGeneratedTexture with a redraw callback (Android Chrome wipes canvases while the app is in the background); test that it redraws after a simulated context loss (`tools/checks/noUnregisteredTextures.test.ts` must stay green). That includes the darkness texture, light stamps, boss atlas, decals, markers and dawn.
>
> EPIC 6 SPECIFICS
> 21. BOSS FAIRNESS (each is a test): (a) every danger zone (slam centre, charge lane + stop point, throw landing spot) is fixed when its telegraph starts; (b) the client draws the telegraph's progress from the server's start tick, never from when the message arrived, and the fill always ends on the hit; (c) edge grace 0.25 m: a hit lands only when the player's centre is 0.25 m inside the drawn edge; (d) boss hits use the player's newest server position, no rewind; (e) telegraph lengths never shorten (enrage, endless, player count); (f) one boss attack at a time, then recovery, then the per-player-count gap; (g) a downed player is never targeted or hit again.
> 22. CAP 110 WHILE THE BEHEMOTH LIVES: at most 110 zombies alive while it is alive (D6), back to 150 the tick it dies; the boss itself does not count; enrage Crawlers respect the cap; the stampede's +30 over-cap allowance is counted against the cap that applies.
> 23. EVENT FAIRNESS: every event announces itself (banner + sound + map marker above the darkness) before it can hurt anyone; the schedule comes only from the `events` stream (2 different events, 2 different waves of 3–8, never 5, never back-to-back); a lever (shoot the armed car, shoot the gas tank after 3 s) works the same for every player and credits whoever pulled it; only standing players take the crate or lead the survivor; the gas blast hurts every player in range in full (as Bloaters) and is shielded by the normal blast line of sight.
> 24. BLACKOUT READABILITY: darkness and fog vision can't be turned off (FR87); quality settings only change their look. Always above the darkness: teammates with rings, zombie eyes within 14 m (or the fog edge), the boss's outline and eyes, every boss telegraph, event markers, the crate, the survivor and the safe point, pings. Colour rule: red = boss danger only, amber = an event you can use, yellow-green = gas, white = pick-ups and people. No hot beam core, no lens flare; rain sparkles inside beams. Check at 568 × 320 and 800 × 360.
> 25. ENDLESS PERFORMANCE: nothing grows without a cap over 20+ endless waves (alive 150 / 110, wave size 600, Brutes ≤ 6 alive, decals, craters, markers, event records, kill logs); a 20-wave endless sim records server tick p99 and memory and asserts they stay flat; FPS recorded with blackout + fog + Behemoth + 150 zombies (`docs/perf/epic-6-blackout.md`).
> 26. LIGHT IS SERVER TRUTH: the light state (stage, blackout flag, power out, flicker seeds, build-phase half darkness) is part of the world and replays; a client that joins or wakes mid-wave draws the same darkness as everyone else; fog hides zombies only on the local screen, never in the sim (aim assist and turrets keep their own rules; aim assist never locks a target your screen hides).
> 27. DO NOT TOUCH EPIC 5 WORK IN PROGRESS: 5.13 card shop and 5.20–5.25 building UX are being built in other sessions (shop, build bar, carry/drag UI); Epic 6 changes there go through their balance flags (`inShop`) or a "Notes for the merge" line, not edits to their UI.
> 28. ONE RUN FLOW: the run phase machine (lobby → build → wave → … → vote → extract/endless → results) has one owner per change (6.1 removes the 6-wave ending, 6.11 adds the vote, 6.12 adds endless); every phase change is a tested transition, and Results always show (no stuck run).
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
     *(Random-city CCP 2026-11-24: keep the collapsed alley and the breaches as `pick N` decay groups, as written; Epic 11's generic stage-4 rules output the same shape.)*
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

- [x] **T0 Art (from the picks; no new pick).** `docs/epic-6-decisions.md` › section 1 Ruins: **all four** RU1–RU4, one material per run (decay stream), RU4 the endless look. Port `rubblePile`, `chunk`, `brick`, `rebarStick`, `beamPiece`, `dustSkirt`, `gravel`, `brokenRoof`, `breach`, `soot`, `dustFx`/`stepDust`/`drawDust`, `lampDark` and the `MATS` table from `docs/art/epic-6/src/main1.js` (+ helpers from `lib.js`) into game code: `apps/client/src/render/city/ruinsArt.ts` (pure canvas painters, seeded by object name hash: same pile looks the same every bake). Bake-time drawing goes into the city bake (registered as `city_static_*`, Story 4.13: covered by `invalidateBake`); the dust and lamp-out sprites are frames in the FX atlas (`ATLAS_FX`, `addGeneratedTexture` via `ensureAtlases`). Screenshot all four materials at 1240 and 390 px (like `docs/art/epic-6/ingame/ru-*.png`) for the designer's review.
- [x] **T1 Map data + loader** (AC 1–3)
  - [x] `map/districtMap.ts`: `DECAY_ACTIONS` += `"look"`; `SPAWN_KINDS` += `"breach"`.
  - [x] `map/loadTiledMap.ts`: `look` = a point with `variant`/`group`/`pick` (fail without), no target, no box; `breach` spawns need a `jitterAxis` (like windows).
  - [x] `map/obstacles.ts › fillObstacles`: skip `look` (it never adds/removes anything); `rubblePiles(o, out)` helper (AC 6).
  - [x] `tools/maps/buildDowntown.ts`: the objects of AC 1 appended after the 4.8 fires; update the header diagrams and the "Stages 4–5: none yet" comment; regenerate the three map files.
  - [x] `decay/decayState.ts`: `legalDecayMasks(map, { gameplayOnly })` (skip groups whose objects are all `look`), so the enclosure tests walk 45 × 3 = 135 gameplay combinations, not × 3 looks more.
  - [x] Tests: `loadTiledMap.test.ts` (+ `look` parsed, `look` without variant refused, `breach` kind), `downtown.test.ts` (+ the generated files agree; 2 breaches at `minStage` 4; 3 alley candidates, 1 picked), `decay.test.ts` DecayTimeline (+ **every old seed keeps its car and fire bits** (bits 0–8 equal before/after for seeds 1–256), exactly 1 alley and 1 look per run, each candidate occurs).
- [x] **T2 Buried spawns + breaches** (AC 3, 4; F5)
  - [x] `waves/spawnPick.ts`: buried cache keyed by `obstacles.version`; CLOSED for a buried point; `SPAWN_STATE` unchanged (CLOSED reused).
  - [x] Tests `spawnPick.test.ts` (+ `the collapsed alley's mouth is CLOSED at stages 4–5 and OPEN at 1–3`, `both breaches OPEN at 4, CLOSED at 1–3`, `breach sides W and S`, `no allocation per pick` (the 4.3 pattern)); `panic.test.ts` / `decay.test.ts` jitter-area and "nothing appears within spawnClearM of a spawn" tests exempt only a spawn that the appearing box buries (assert that exemption list is exactly the 3 alley mouths).
- [x] **T3 Rubble rules** (AC 5; F1–F4)
  - [x] Tests `decay/ruins.test.ts` (new): per pile and the alley: `bullet stops at the face`, `melee blocked`, `blast shielded` (`explode` behind a pile), `acid puddle and fire zone don't hurt across it`, `a Walker, a Runner and a Brute path round it` (flow field reaches the far side), `a grenade-launcher round flies over a pile`, `placement refused with cause solid`, `barricade / spike trap / mine / turret on the spot destroyed at the build start with 50 % refund (money.earned reason refund)`, `a player and a zombie standing in the alley at the build start are relocated, nobody left inside a box`.
  - [x] Extend the enclosure test (`decay.test.ts` "no enclosed area" and `panic.test.ts` "keeps the map fun") to stages 1–3 × the 45 old masks and stages 4–5 × the 135 gameplay masks (405 Worlds; record the run time with load; `testTimeout` 30 s).
  - [x] `apps/client/src/scenes/blockText.ts`: `rubble_*` → "rubble" (+ `blockText.test.ts`).
- [x] **T4 Flicker + shop glow** (AC 7, 8; F6)
  - [x] `decay.json › ruins` + `balanceSchema.ts` (strict object; min ≤ max; gaps > durations).
  - [x] `render/city/lampFlicker.ts › lampOutAt` (pure, no allocation) + test (windows, gaps 4–10 s, durations 0.15–0.6 s over 10 min of ticks, same seed → same pattern, two lamps differ).
  - [x] `CityView`: a pool of 11 `lampDark` images (MULTIPLY blend, depth `DYN_LIGHT_DEPTH`, below characters; check the Phaser 4 blend-mode constant in `node_modules/phaser/types`), positioned at `dressing.lamps`, visible only while `lampOutAt` is true at stage 4 with the power on and `!isBlackout(world)`. Tick source: the World's tick (the mirror follows the server's), so phones agree.
  - [x] `palette.ts`: stage-4 `spillK` 0.3; neon × 0.3 at stage 4 (`drawGlow`); `palette.test.ts` contrast test still passes for every stage.
- [x] **T5 Ruins look + ambience** (AC 9–11; T0)
  - [x] `shared`: `ruinsLookAt(world)` (`decay/ruinsLook.ts`, exported; pure).
  - [x] `drawCity.ts`: `blocks` branch draws rubble with the run's material (alley heap, piles); `PROP_DUMPSTER` stays for the dumpster; breaches from `breach` spawn points; diner roof corner at stage ≥ 4 (a dressing entry `ruinedRoofs`); RU4 soot/embers. `stageFilter.ts › staticKey` gains the look id, so the wave-11 switch to RU4 rebakes once.
  - [x] `CityView` / a small `DustView`: the pooled dust puffs + the stage-4 collapse burst (AC 11).
  - [x] `audio/ambience.ts`: `ruins` loop (synth placeholder) + `ambienceLoopForStage`; `placeholderSfx.ts`: `ruins_rumble`, `debris_fall`. Tests `ambience.test.ts` (+ stage 4 → ruins, crossfade from panic).
  - [x] Readability sheet (`docs/playtests/milestone-1/readability-sheet.md`): rubble pile ("does it stop bullets?" yes), collapsed alley, breach hole.
- [x] **T6 Fuzz, sims, perf** (brief 7, 9, 12, 16)
  - [x] `zombies/downtown.fuzz.test.ts` (extend): stages 4–5 × random gameplay masks × random barricade layouts × ≥ 3,000 ticks with Brutes: no body inside a box (rubble included), no stall, zombies from both breaches reach a player, flow fields rebuild walls only at build starts; liveness: ≥ 1 zombie from each breach, ≥ 1 building destroyed by rubble with a refund.
  - [x] Sim: the 10-wave sim (6.1) or `decayStageByWave` override reaches stage 4: assert the alley closed, a breach used.
  - [x] Bake time at stage 4 (record `CityView.bakeMs` before/after, headless + load) and `?stress=150` FPS with stage 4 forced (decay cheat), flicker and dust on.
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

Merged story **"Ruins and Collapse"** (designer 2026-11-24): Stories 6.2 and 6.4 built as one; this is the one record for both (6-4-collapse.md points here).

### Agent Model Used

Claude (cloud builder session, branch `story-6-2`).

### Debug Log References

- Whole-run sims (`sixWaveSim`, `tenWaveSim`, `bossRunSim`) stalled at wave 10 with the first pile layout: `rubble_pile_3` in the east street (33–35 × 12–13.5) left 1 m to the bus and closed the Behemoth's only ≥ 4 m way past the bus; the boss stood at (37, 12.5) at full HP, unreachable. Fix: P3 moved into the gas forecourt (37–39 × 3–4.5). Sims and the Downtown fuzz green after.
- The decay writer emitted rects before points, so appended stage-4 `block` rects would have taken variant bits 6–8 from the fires. Fix: the decay layer is written in declared order (`Layer.items`); verified: bits 0–8 of seeds 1–256 equal the pre-6.2 picks (pinned in `decay/ruins.test.ts`).
- Breach positions moved from the story's suggestion: `breach_apartments` (16.0, 10.6) → **(14.0, 10.6)** (at 16.0 `spawnSide` said N, and the 9 m team-start rule failed at 15.5); `breach_offices` (29.4, 26.0) → **(29.4, 29.5)** (at 26.0 the moved `curb_car_south` lands within `spawnClearM` and over its jitter area). Both still on the walls the designer picked (D3), sides W and S, ≥ 9 m from the team start.
- Alley 2 needed a second box `rubble_alley_2_corner` (10–10.5 × 22–24): the 0.5 m pocket between the heap, the parking wall and the lot's police line was a closed nav edge (an unreachable cell).

### Completion Notes List

**6.2 Ruins (stage 4)**
- Map (`tools/maps/buildDowntown.ts`, regenerated): the `ruins_alley` group (3 candidates, wall to wall; alley 3 removes the dumpster), 3 street piles (P1 west street 10–12 × 12–13.5 flush with the north curb car, P2 north street 26.5–28 × 2–4 flush with the forecourt police line, P3 gas forecourt 37–39 × 3–4.5), the `ruins_look` group (3 `look` points), breach spawns (kind `breach`, `minStage` 4), stage-4/5 visual props (loose debris, flat spills, the fallen streetlight).
- Loader: `look` action (a point that must carry variant/group/pick; box = the point), `breach` spawn kind (needs `jitterAxis`).
- `legalDecayMasks(map, { gameplayOnly })`: **default true** (look groups skipped: 135 Downtown masks), `{ gameplayOnly: false }` = every full mask; `gameplayVariantMask(map)`. Test-only `decay/masks.testkit.ts › masksForStage` walks 45 masks at stages 1–3 and 135 at 4–5.
- Buried rule (`waves/spawnPick.ts`): a spawn point inside an active solid is CLOSED; cached per obstacle list + `version` (`spawnPickCounters.buriedRebuilds` proves one rebuild per stage change, none per pick); `isSpawnBuried` exported.
- Rubble rules come from `block` (walls): `solids` + `shotBlockers`, never `lobBlockers`; `isRubble`, `rubblePiles(o, out)` (no allocation) exported for 6.6.
- `decay/ruinsLook.ts › ruinsLookAt` (RU1–RU3 from the bit, RU4 in endless = waves past `stageByWave`), `lookPick`, `isEndlessWave`.
- Client: bake painters ported from the picks (`render/city/ruinsArt.ts`: rubble pile, alley heap, flat spill, broken roof, breach hole, soot, loose debris; dead lamp head, fallen lamp, flood puddle), drawn in `drawCity.ts › drawOverlay` with the run's material; `staticKey` gains `lookKey` (material + style: one rebake per switch, verified in the browser: `bakeCount` 1 → 2); lamp flicker (`render/city/lampFlicker.ts › lampOutAt`, keyed to run seed + lamp + World tick; 11 MULTIPLY `FX_LAMP_DARK` discs in `CityView`, stage 4, power on, no blackout); shop glow `spillK` 0.3 and `neonK` 0.3 at stage 4; dust puffs + collapse burst (`render/city/DustView.ts`, pooled, `decay.json › ruins` caps, halved with `?fx=low`; the burst only on a live `decay.stage_changed` to 4: a frame > 250 ms or a hidden document skips it); ambience `ruins` loop; SFX `ruins_rumble`, `debris_fall`; "Blocked by rubble" (`blockText.ts`, prefix rule).

**6.4 Collapse (stage 5)**
- `decay.json`: `blackout.lightPctByWave` waves 9/10 = 10/5, `halfDarkInBuild: true` (6.3's `refreshBlackout` already handled the build case: no code change there), new `collapse` block (`powerOutFromStage`, `fog` radii, growl gap, ash cap) and `ruins` block; strict schemas with defaults.
- `decay/collapse.ts`: `isPowerOut`, `fogRadiiOf` (wave 9/10, build 13/14, Infinity below stage 5 and outside build/wave), `fogVisibility` (beams via `inFlashlightCone`), `collapseStyleAt` (run pick ≤ wave 10, endless rotation), `createFogRadii/createFogBeam`.
- Aim assist (`combat/aimAssist.ts`): optional `shooter` argument (x, y, gear); a candidate with `fogVisibility` 0 from the shooter (own beam along the aim) is skipped; the Behemoth is never fogged. Passed by `combat/firing.ts` (server/solo) and `NetSimHost.localAttack` (my prediction).
- Client: `render/fog/screenFog.ts` (my screen's fog: viewer = camera's survivor, spectated teammate when out; every STANDING survivor's beam at its drawn pose), `ZombieView` (alpha × visibility, hidden at 0 → no eyes, BossView's dim rule sees it as not drawn), `EyesView` (eye alpha follows), `AcidView` (spit globs hidden in fog; puddles never), `render/fog/FogView.ts` (painted into 6.3's darkness canvas via `DarknessView.fog` after the stamps, before the tints, beams cut out; CO2 noise thins the mask; geometry bands beyond `clearM` only when no darkness is drawn), power-out bake (`dressing.ts › powerOff`, dead lamp heads, broken lamp hidden), CO3 ash in the rain pool, CO4 heavier rain + baked puddles, CO3 orange sky glow; ambience `collapse` / `collapse_ash`.

**Tests added**: `decay/ruins.test.ts` (F1–F5 + old seeds + looks are no-ops), `decay/collapse.test.ts` (F1–F4, D7, blackout run 8→9→10), `zombies/ruins.fuzz.test.ts` (12 layouts × 3,000 ticks, stages 4–5, both breaches, rubble refunds), loader cases in `decay/decay.test.ts`; client `lampFlicker.test.ts`, `ruinsLook.test.ts`, `render/fog/fog.test.ts`, ambience and blockText cases. Updated for the new map: decay, panic, fireSafety, obstacles, evening, downtown, loadTiledMap, spawnPoints, lightState, downtown.fuzz (stages 1–3: 45 masks), palette, NetSimHost move/repair/sell (their barricade spot sat within the new breach's 2 m clearance).

**Browser (Playwright, headless Chromium, solo dev build on port 5391)**: stage 4 via `?startwave=7` (no console errors; rubble, breach holes, caved diner roof, all four materials RU1–RU4 by bake dump; lamps out counted 2; collapse burst puffs), stage 5 via `?startwave=9` (power out, fallen lamp, half dark in the build, wave 9 fog edge at 9–10 m with ~40–55 zombies hidden, all four styles; a style switch rebaked once). Screenshots: `docs/art/epic-6/ingame/build/` (ru1–ru4 bake at 1240, ru build 844 × 390, co1–co4 wave 9 at 1240, co2 at 844 × 390).

**Perf**: `docs/perf/epic-6-blackout.md` › "Stories 6.2 + 6.4": stage 4 ≈ baseline (16.1 vs 16.5 fps), fog −7 % on top of the blackout (12.1 → 11.2 fps), load 0.8–2.2; stage-4 bake 180–220 ms headless.

**Mutations** (brief 9): all 11 caught (each mutation applied alone, its tests run, restored): buried rule removed → ruins.test (2 failing); rubble in `lobBlockers` → ruins.test (2); flicker gap max 12 s → lampFlicker.test (1); `look` treated as `block` → ruins/decay tests (2); fog wave clear 9 → 9.5 → collapse.test (2); teammates' beams ignored → fog.test (1); aim-assist fog filter removed → collapse.test (2); `halfDarkInBuild` false → collapse.test (1); power out from stage 4 → collapse.test (1); fog geometry drawn while the darkness is on → fog.test (1); alley-2 corner box removed (map regenerated) → decay + panic enclosure tests (2); Not mutated: alley box 0.5 m short of a wall (the corner-box mutation covers the closed-edge test the same way).

**Gate** (branch merged with `origin/master` eb3b991, after `npm ci` for master's new `@napi-rs/canvas`): `npm run typecheck && npm run lint && npm test && npm run build` green — 354 test files passed (1 skipped), 3,266 tests passed (3 skipped), 399 s; build OK. Load 0.74 at the start, 4.39 at the end (1-min; this builder only, the test run itself).

### Notes for the merge (every shared file touched)

- `tools/maps/buildDowntown.ts` + the three generated maps (`tools/maps/downtown.tmx`, `apps/client/public/assets/maps/downtown.tmj`, `packages/shared/src/map/data/downtown.tmj.json`): regenerate (`npx tsx tools/maps/buildDowntown.ts`), never hand-merge. The decay layer is now written in **declared order** (`Layer.items`); new decay objects must be appended at the end of `decay`. Map version hash changed (any fixture pinning it or a stage-4+ digest changes).
- **Rubble for 6.6 (charge crash, D1):** rubble boxes are `block` walls named `rubble_*`. They are already in `world.obstacles.solids` (bodies, the nav / wide / boss grids via `applyDecayStage`), `world.obstacles.walls` and `world.obstacles.shotBlockers`; NOT in `lobBlockers`, no `building` flag. A charge that tests `world.obstacles.solids` (or walls) crashes into rubble with no special case. `isRubble(box)` and `rubblePiles(world.obstacles, out)` (from `@topdown/shared`, no allocation) give the active rubble for the throw's chunk. Rubble appears only at the stage-4 build start, never mid-wave.
- **Behemoth corridor:** P3 was moved out of the east street because it closed the boss's only ≥ 4 m way past the bus (whole-run sims stalled). If 6.6 changes the boss body or paths, re-run `bossRunSim`, `tenWaveSim`, `sixWaveSim` at stages 4–5.
- `map/districtMap.ts`: `DECAY_ACTIONS` += `look`, `SPAWN_KINDS` += `breach` (append-only). `map/loadTiledMap.ts`: `look` parsing, breach needs `jitterAxis`; `loadDecayLayer` takes `mPerPx`.
- `map/obstacles.ts`: `RUBBLE_PREFIX`, `isRubble`, `rubblePiles` appended; `fillObstacles` unchanged (looks are never read).
- `decay/decayState.ts` (after review L3): `legalDecayMasks(map)` = every run mask, looks included (default `gameplayOnly: false`); NEW `gameplayDecayMasks(map)` = the 135 gameplay layouts (what fuzzes and spatial tests walk; every existing caller renamed); `gameplayVariantMask` added. A branch that still calls `legalDecayMasks` in a fuzz now gets 1,620 masks: switch it to `gameplayDecayMasks` (6.6's charge/throw fuzzes probably need this on merge).
- `waves/spawnPick.ts`: buried rule in `classify` (CLOSED reused), `isSpawnBuried`, `spawnPickCounters`. 6.5/6.8 side readers unaffected.
- `combat/aimAssist.ts`: new optional last argument `shooter: AimShooter | null` (fog filter); `combat/firing.ts` passes the player. 6.6 needn't change it (the boss branch is untouched and never fogged).
- `config/balance/decay.json` + `config/balanceSchema.ts`: `blackout.lightPctByWave` [.., 10, 5], `blackout.halfDarkInBuild: true`; new `ruins` and `collapse` blocks (strict, defaults). 6.10 / 6.12 add their own keys/blocks.
- `decay/decaySystem.ts` (review L4): decay refunds = `floor(paid × buildingRefundShare)` (same numbers with the shipped balance: tier price = total paid).
- `render/BloodTrailView.ts` (review L5): `fog` field; GameScene sets it.
- `boss/behemoth.fuzz.test.ts` (review M2): stages 1–5, 15 layouts — 6.6 edits this file too: keep both (6.6's checks inside the 1–5 loop).
- `decay/lightState.ts`: **not touched** (refreshBlackout already did the build half-dark case); `lightState.test.ts` updated for the new values.
- `index.ts` (shared): exports appended (ruinsLook, collapse, obstacles helpers, `gameplayVariantMask`, `isSpawnBuried`).
- Client `render/city/CityView.ts` (constructor gains `runSeed`; lamp-dark pool; ash; looks into the bake), `drawCity.ts` (`CityScene` optional `ruinsLook`, `collapseStyle`, `powerOut`, `lowFx`; overlay rubble/props/breaches/roofs; lightmap/glow via `powerOff`; neonK), `dressing.ts` (`ruinedRoofs`, `floodPuddles`, `powerOff`), `palette.ts` (`neonK`; stage-4 `spillK` 0.3), `stageFilter.ts` (`staticKey` 4th arg, `lookKey`), `spriteAtlas.ts` (FX frames `lampdark`, `dust`, `grit`, `ash` appended).
- Client `render/darkness/DarknessView.ts`: a `fog` hook called inside `paint` after the stamps, before the tints (6.10 / 6.12 / 6.11 dawn: keep it). `EyesView.ts`: eye alpha × the zombie's alpha. `fakeScene.testkit.ts`: `createImageData`, `putImageData`, `createPattern` added.
- Client `render/ZombieView.ts` (`fog` field, `fogHidden`), `render/AcidView.ts` (`fog` field), `scenes/GameScene.ts` (ScreenFog/FogView/DustView create/destroy, `updateScreenFog` before the zombie view, fog before the darkness paint, collapse burst on `decay.stage_changed`, ambience style), `sim/NetSimHost.ts` (aim-assist shooter), `scenes/blockText.ts` (rubble word), `audio/ambience.ts` (`AMBIENCE_LOOPS` append-only: ruins, collapse, collapse_ash; `ambienceLoopForStage(stage, style)`, `update(stage, style)`), `audio/placeholderSfx.ts` (`ruins_rumble`, `debris_fall`).
- Docs: `docs/perf/epic-6-blackout.md` (new section), `docs/playtests/milestone-1/readability-sheet.md` (#50–54, renumbered after master's #49), screenshots in `docs/art/epic-6/ingame/build/`.

### Not verified

- Online: two tabs with `DEV_DECAY_STAGES=4/5`, `?lag=150&jitter=20` (same alley / look / style / darkness, lamps flickering in step, a teammate's beam revealing on both), a hidden tab across the wave-7 / wave-9 build start, a late join mid-wave 10 — not run (no server session in this container run); the design makes them follow server truth (stage, variants, wave, tick, blackoutPct are synced; flicker keys on the server's tick and run seed), but this is unproven in a browser.
- The collapse-burst skip on a woken tab is a heuristic (frame > 250 ms or `document.hidden`), not browser-tested.
- Aim-assist parity server = Predictor at stage 5 has no dedicated client test (the shared rule is tested on the server path; `NetSimHost.localAttack` passes the same shooter shape).
- `?fx=low` fog look and CO4 reflections off: not screenshotted (the visibility-equality test covers the rule).
- Phone FPS (Mi 11i) not measured; headless only. 568 × 320 / 800 × 360 readability shots of fog not taken (844 × 390 and 1240 wide were).
- Designer review of the ported looks (rubble reads darker/browner under the stage-4 light than the lab cards; the alley heap is a chain of mounds).

### File List

- M `_bmad-output/implementation-artifacts/6-2-ruins.md`
- M `_bmad-output/implementation-artifacts/6-4-collapse.md`
- M `_bmad-output/implementation-artifacts/sprint-status.yaml`
- M `apps/client/public/assets/maps/downtown.tmj`
- M `apps/client/src/audio/ambience.test.ts`
- M `apps/client/src/audio/ambience.ts`
- M `apps/client/src/audio/placeholderSfx.ts`
- M `apps/client/src/render/AcidView.ts`
- M `apps/client/src/render/ZombieView.ts`
- M `apps/client/src/render/city/CityView.ts`
- A `apps/client/src/render/city/DustView.ts`
- M `apps/client/src/render/city/drawCity.ts`
- M `apps/client/src/render/city/dressing.ts`
- A `apps/client/src/render/city/lampFlicker.test.ts`
- A `apps/client/src/render/city/lampFlicker.ts`
- M `apps/client/src/render/city/palette.test.ts`
- M `apps/client/src/render/city/palette.ts`
- A `apps/client/src/render/city/ruinsArt.ts`
- A `apps/client/src/render/city/ruinsLook.test.ts`
- M `apps/client/src/render/city/spriteAtlas.ts`
- M `apps/client/src/render/city/stageFilter.test.ts`
- M `apps/client/src/render/city/stageFilter.ts`
- M `apps/client/src/render/darkness/DarknessView.ts`
- M `apps/client/src/render/darkness/EyesView.ts`
- M `apps/client/src/render/darkness/fakeScene.testkit.ts`
- A `apps/client/src/render/fog/FogView.ts`
- A `apps/client/src/render/fog/fog.test.ts`
- A `apps/client/src/render/fog/screenFog.ts`
- M `apps/client/src/scenes/GameScene.ts`
- M `apps/client/src/scenes/blockText.test.ts`
- M `apps/client/src/scenes/blockText.ts`
- M `apps/client/src/sim/NetSimHost.move.test.ts`
- M `apps/client/src/sim/NetSimHost.repair.test.ts`
- M `apps/client/src/sim/NetSimHost.sell.test.ts`
- M `apps/client/src/sim/NetSimHost.ts`
- M `apps/server/src/rooms/RunRoom.buildings.test.ts`
- M `apps/server/src/run/devStartWave.test.ts`
- A `docs/art/epic-6/ingame/build/co1-wave9-1240.png`
- A `docs/art/epic-6/ingame/build/co2-wave9-1240.png`
- A `docs/art/epic-6/ingame/build/co2-wave9-390.png`
- A `docs/art/epic-6/ingame/build/co3-wave9-1240.png`
- A `docs/art/epic-6/ingame/build/co4-wave9-1240.png`
- A `docs/art/epic-6/ingame/build/ru-build7-390.png`
- A `docs/art/epic-6/ingame/build/ru1-bake-1240.png`
- A `docs/art/epic-6/ingame/build/ru2-bake-1240.png`
- A `docs/art/epic-6/ingame/build/ru3-bake-1240.png`
- A `docs/art/epic-6/ingame/build/ru4-bake-1240.png`
- M `docs/perf/epic-6-blackout.md`
- M `docs/playtests/milestone-1/readability-sheet.md`
- M `packages/shared/src/combat/aimAssist.ts`
- M `packages/shared/src/combat/firing.ts`
- M `packages/shared/src/config/balance/decay.json`
- M `packages/shared/src/config/balanceSchema.ts`
- A `packages/shared/src/decay/collapse.test.ts`
- A `packages/shared/src/decay/collapse.ts`
- M `packages/shared/src/decay/decay.test.ts`
- M `packages/shared/src/decay/decayState.ts`
- M `packages/shared/src/decay/fireSafety.test.ts`
- M `packages/shared/src/decay/lightState.test.ts`
- A `packages/shared/src/decay/masks.testkit.ts`
- M `packages/shared/src/decay/panic.test.ts`
- A `packages/shared/src/decay/ruins.test.ts`
- A `packages/shared/src/decay/ruinsLook.ts`
- M `packages/shared/src/index.ts`
- M `packages/shared/src/map/data/downtown.tmj.json`
- M `packages/shared/src/map/districtMap.ts`
- M `packages/shared/src/map/downtown.test.ts`
- M `packages/shared/src/map/evening.test.ts`
- M `packages/shared/src/map/loadTiledMap.test.ts`
- M `packages/shared/src/map/loadTiledMap.ts`
- M `packages/shared/src/map/obstacles.test.ts`
- M `packages/shared/src/map/obstacles.ts`
- M `packages/shared/src/waves/spawnPick.ts`
- M `packages/shared/src/waves/spawnPoints.test.ts`
- M `packages/shared/src/zombies/downtown.fuzz.test.ts`
- A `packages/shared/src/zombies/ruins.fuzz.test.ts`
- M `tools/maps/buildDowntown.ts`
- M `tools/maps/downtown.tmx`

## Change Log

- 2026-11-24: story drafted from the real code (gds-create-story)
- 2026-11-24: designer accepted every recommended decision ("ok, perfect"); status ready-for-dev.
- 2026-11-24: built together with 6.4 as the merged story "Ruins and Collapse" (branch story-6-2); status review.
- 2026-11-24: Senior Developer Review (AI), fresh agent, on e84ab07 (story-6-2 merged with master eb3b991): changes requested (3 medium, 6 low; no high).

## Senior Developer Review (AI)

**Reviewer:** fresh-agent reviewer (own cloud session), 2026-11-24. **Commit reviewed:** `e84ab07` (story-6-2 = d1f6d5f merged with master eb3b991 at bd9068b), diff `eb3b991...e84ab07`. Covers the merged story "Ruins and Collapse" (6.2 + 6.4). Method: gds-code-review (Blind Hunter, Edge Case Hunter, Acceptance Auditor) + beat the rule + mutations + my own probes (scratch tests, deleted before commit).

**Outcome: Changes requested** — no high finding; the rubble, buried-spawn, refund, fog and aim-assist rules hold in the sim. The three mediums are missing tests that the story's tasks mark done (brief 3, 7, 9). They are test-only fixes; no game code needs to change.

### Gate

`npm run typecheck && npm run lint && npm test && npm run build` on `e84ab07` after `npm ci`: **green**. 354 test files passed (1 skipped), 3,266 tests passed (3 skipped), 469 s; build OK. Load (1-min) 0.25 at the start, 2.76 at the end. My own probe runs overlapped the last minutes of the gate, so the end load is not this run's alone. 22:06 after all work: 0.22.

### Findings

| # | Sev | Title | Where | Failure scenario | Suggested fix |
|---|-----|-------|-------|------------------|---------------|
| M1 | medium | Aim-assist fog parity between server and Predictor is untested, and the net-parity tools still use the old rule | `apps/client/src/sim/NetSimHost.ts:815-821`; `tools/netsim/hitsSim.ts:413`; `tools/netaudit/hitsLossSim.ts:424`; story T3 "server and Predictor give the same assisted aim at stage 5" is marked [x] | Mutation M19 (NetSimHost passes `null` instead of `aimShooter`) **survives** the whole client `sim/` suite (156 tests). A later refactor of `localAttack` could drop the shooter: my phone would then bend a shot toward a zombie 11.5 m away in the fog while the server keeps the raw aim. The cosmetic tracer and the hit would disagree, and brief 26 ("aim assist never locks a target your screen hides") would be broken on the client without any test failing. The netsim/netaudit hit-parity tools call `assistAim` without a shooter, so at stage 5 they measure a different rule from the real client and the real server. | Add a NetSimHost test at stage 5: touch Hunting Rifle, zombie hidden at 11.5 m, with and without a Tactical flashlight; assert the predicted `dir` equals the server's `tryFire` dir. Pass `{x, y, gear}` in both tools. |
| M2 | medium | The Behemoth fuzz was never extended to stages 4–5 | `packages/shared/src/boss/behemoth.fuzz.test.ts:21,86-91` (its comment says "6.2 adds 4–5 and re-runs this"); brief 7 ("zombies and the boss reach a player … every stage × variant") | The pile that trapped the boss (old P3) was caught only because the whole-run sims stalled. Any later pile or alley change can trap the boss again for some alley × car mask, and no spatial test would catch it. | Walk stages 1–5 with `masksForStage(map, stage)`. **Probe:** I copied the fuzz to stages 4–5 × `masksForStage(…, 4)` (18 layouts, all 3 alleys). It passes on e84ab07. With story-6-6 (194d1d8) trial-merged, 6.6's version also passes: the walk fuzz on 18 layouts and the charge/throw/enrage fuzz on 36 layouts. A flood-fill probe found the team start reachable on the boss grid for all 135 stage-4/5 masks. The boss region shrinks from 776–974 cells to 666–837. |
| M3 | medium | The ten-wave sim doesn't prove stage-4 liveness (alley closed, breach used) | `packages/shared/src/economy/tenWaveSim.test.ts` (untouched); story T6 "Sim: … assert the alley closed, a breach used" is marked [x]; AC 12 last item | Whole-run liveness for Ruins rests only on the hand-made fuzz, which spawns from the breaches itself. Suppose a change made the wave director never pick a breach (for example a side-weighting bug). The breaches would then only show in the fuzz, and the 10-wave run would still pass. | In `runHeadless` `onTick`, from wave 7 assert one `alley_k_mouth` is buried (`isSpawnBuried`) and that at least one zombie spawned from `breach_*`. A counter on `pickSpawnPoint` results is enough. |
| L1 | low | The client fog hookups are not tested | `apps/client/src/render/ZombieView.ts:207-215`, `darkness/EyesView.ts:74`, `AcidView.ts:76-85` | Mutations M16 (ZombieView ignores the fog), M17 (eyes ignore zombie alpha) and M18 (spit ignores the fog) all **survive**: 695, 24 and 695 tests pass. F3 and F6 are tested only at the `ScreenFog` level, so a dropped `zombieView.fog = …` line in GameScene would show every zombie again. | Add a fake-scene test: ZombieView with a `{visibility}` stub hides at 0, sets alpha at 0.5 and gives no `drawnImage` when hidden; EyesView alpha follows; AcidView hides a glob. |
| L2 | low | The wave-10 boundary of the Ruins material is untested | `packages/shared/src/decay/collapse.test.ts:180-188` | Mutation M7 (`isEndlessWave` with `>=`) **survives**: wave 10 would already draw RU4 and the bake would switch one wave early. | Assert `waves.number = 10` → the run's pick (and `collapseStyleAt` at 10 = the pick). |
| L3 | low | The new default of `legalDecayMasks` returns masks a run can never pick | `packages/shared/src/decay/decayState.ts:133-135`; callers `apps/client/src/render/fog/fog.test.ts:26`, `scenes/blockText.test.ts:57`, `render/city/palette.test.ts:17`, `render/city/windowSpill.test.ts:41` | With `gameplayOnly` defaulting to true, the look and style bits are all 0. This is not a bug today: every caller is a test, and every gameplay caller (fuzzes, panic, blockReason, behemoth) needs only gameplay bits. But the client look tests now always bake RU1 / CO1 haze, and the name says "legal". A future caller that checks membership or bakes looks gets masks no run produces. | Rename the default (for example `gameplayDecayMasks`) or say in the doc that the masks are not run masks; use `{ gameplayOnly: false }` where a test draws looks. |
| L4 | low | Rubble refunds the base price, not what was paid | `packages/shared/src/decay/decaySystem.ts:63-64` (pre-existing 4.5 rule, newly reachable on known fixed pile spots) | An upgraded metal barricade on a pile spot (built in waves 1–6) is destroyed at the wave-7 build start and refunds `floor(base × 0.5)`. A sell refunds `paid × sellShare` (5.20), so the player loses the upgrade money they would have got back by selling. The piles are the same 3 spots every run (D4), so this hits players who don't know about the piles. | Refund `floor(b.paid × buildingRefundShare)` (5.20 bookkeeping), or confirm with the designer that this is intended. |
| L5 | low | Crawler blood trails show fog-hidden Crawlers | `apps/client/src/render/BloodTrailView.ts:91-108` | At stage 5, a Crawler hidden beyond 10 m still drops trail marks, so a lit patch (fire, half-dark build phase) shows its path. That is a small break of "fog hides zombies" (D3). | Skip `drop` when `fog.visibility(x, y) <= 0` (the same stub as ZombieView). |
| L6 | low | The Ruins fuzz never stands players on the coming rubble | `packages/shared/src/zombies/ruins.fuzz.test.ts:58-61` (players only at the team start) | Relocation off rubble is covered once per alley centre (`ruins.test.ts:163`). **Probe:** 4 players (1 downed) crowded on every 0.5 m spot of every rubble box, ringed by 4 metal barricades, for 27 of the 135 masks: 4,248 stage changes, 0 stuck, 0 inside a solid or building, 0 on a nav wall cell. So it holds, but nothing guards it. | Put 1–2 fuzz players on a random spot of the coming rubble before `changeDecayStage`. |

Withdrawn after checking: a 0.5 m pocket between `rubble_alley_2` and `police_line_lot` (filled by `rubble_alley_2_corner`, flush); fog look clears beams of downed players (the darkness plan also stamps only `alive` cones); spit from hidden Spitters (range 6 m < 9 m clear radius); fire zones burning across rubble (nearest fire edge is 0.5 m from `rubble_alley_2`, no overlap); molotov and acid zones across rubble (`molotovZoneAt` uses `shotBlockT`).

### Beat the rule (brief 4)

1. **Stand in the collapsing alley (with barricades) at the wave-7 build start:** relocated, never inside a box (see the L6 probe: 4,248 placements across every rubble box, players downed and standing, barricade rings). Barricades on rubble are destroyed and refunded once (ruins.test F3; the fuzz asserts refunds = destroyed). **Held.**
2. **A gap between a pile and a car that a Walker fits through but a Brute doesn't, or a pinning 0.5 m slot:** gap probe over all 270 stage-4/5 masks. Rubble-to-solid gaps are flush or ≥ 1.5 m (P1 ↔ `street_car_west` 1.5, alley 2 ↔ `parked_car_1` 1.5). The only 0.5 m gap is closed by the corner box. **Held.**
3. **Shoot, swing, lob, molotov, Bloater pop across a pile:** a bullet stops at the face; melee is blocked; a grenade-launcher round flies over (`lobBlockT` −1) and its blast is shielded; molotov zones are shielded through `shotBlockT`; Bloater gas and blasts are shielded through `shotLineClear`. Checked against the code and ruins.test. **Held.**
4. **Camp a breach / wall it off:** NEAR while you stand there (test). You can't build within `spawnClearM` of any stage's spawn (pre-existing placement rule). **Held.**
5. **Use the old alley mouth:** buried, so CLOSED at stages 4–5 for each alley (probe: exactly the 3 mouths are ever buried, only at 4–5, across every full mask). Nobody can get inside the alley. **Held.**
6. **Lamps flicker differently on another phone:** the key is (run seed, lamp, World tick), and the mirror's tick is the server's (`NetSimHost.ts:744`). Online, a 3-tick drop-out can be shortened or skipped between patches (cosmetic). Not browser-tested here. **Held (in code).**
7. **A mine or spike trap on a pile during build 7 / build 6:** refused (`cause: solid`, "Blocked by rubble") / destroyed and refunded at 50 % of the base price (see L4 for upgrades). **Held (L4 note).**
8. **Hide behind a pile from the Behemoth / trap its pathing:** M2 probes, stages 4–5 including 6.6's charge into rubble through `world.obstacles.solids`: no stall, no box overlap, team start reachable on every mask. **Held.**
9. **Extra: aim-assist into the fog.** A zombie at 11.5 m is not assisted without a beam; the shooter's own Tactical beam allows it; the raw aim on a hidden zombie is kept, never bent. Teammates' beams reveal on screen but don't unlock assist (assist ⊂ visible, so conservative). Server and screen differ only by prediction/interpolation noise at the 10 m edge (no lock beyond it). Bots also pass `isMouse: false`, so they get the fog filter, but they aim straight at their target (raw hit kept), so it has no effect. **Held** (parity untested: M1).
10. **Extra: switch off fog or darkness:** `?blackout=` accepts only 20/10/5 (`parseBlackoutPct`); `?fx=low` changes only the FogView look (`lowFx` gates the noise layer only); `ScreenFog` reads no setting. **Held.**
11. **Extra: an out player inside the collapsing alley:** skipped by `relocateBodies` but moved by `returnOutPlayers` to a free spot by the spectate target in the same build start. **Held.**
12. **Extra: replay determinism (brief 8).** Two `runHeadless` 10-wave runs (seed 4, 3 god bots) gave identical `worldDigest` sequences at every stage change, every 2,000 ticks and at the end (stage 5, variants include look bits). The looks come only from `streams.decay` (`pickDecayVariants`); client cosmetics (dust, art) use no sim stream. **Held.**

### Mutations (brief 9; each applied alone, its tests run, restored)

Killed (good): M1 aim-assist fog filter `<= 0` → `< 0` (collapse.test 2 failing) · M2 beams only inside the fog radius (collapse 2) · M3 downed survivors' beams reveal (fog.test 1) · M4 buried cache never rebuilt after first (ruins.test 1) · M5 `isRubble` = `rubble_pile*` only (ruins + blockText 2) · M6 `legalDecayMasks` default false (decay 2) · M8 endless style rotation off by one (collapse 1) · M9 build phase uses wave radii (collapse/fog 1) · M10 flicker duration max +1 tick (lampFlicker 1) · M11 rubble word removed (blockText 1) · M12 ambience stage 4 → panic (ambience 2) · M13 breach without jitterAxis accepted (decay 1) · M14 stage-4 neonK 1 (ruinsLook 2) · M15 powerOff keeps neon (ruinsLook 1) · M20 server firing without shooter (collapse 1) · M21 `destroyBlockedBuildings` removed (ruins.fuzz 1) · M22 `gameplayVariantMask` counts looks (decay 2).

Survived (bad): M7 `isEndlessWave` `>=` (L2) · M16 ZombieView ignores fog · M17 EyesView ignores alpha · M18 AcidView ignores fog (L1) · M19 NetSimHost without shooter (M1).

### Brief lines 1–32

1 ✓ (own session; gate on the merged commit is green). 2 ✓ the shared sim is used by server/solo/mirror/Predictor (`applyDecayStage`, `assistAim`); no schema change needed (stage and variants already synced); parity of the Predictor is untested (M1). 3 partly: rules are tests, except the client hookups (L1) and Predictor parity (M1). 4 ✓ see above. 5 ✓ rubble = `block` wall in `solids` + `shotBlockers`, not `lobBlockers`, no `building` flag; slam/throw ignore cover is untouched. 6 ✓ no new damage clock (fire/acid per-body unchanged). 7 partly: Ruins fuzz ✓; boss at 4–5 not in a committed fuzz (M2; probe passes). 8 ✓ (probe: replay digest stable; looks only from `decay`). 9 partly: liveness asserted in the fuzz and ruins tests; ten-wave sim lacks Ruins liveness (M3); 5 mutations survive. 10 ✓ numbers in `decay.json` (ruins, collapse, blackout); flicker/fog/dust pooled, no per-frame allocation seen (ScreenFog/fogVisibility scratch only; `FogView.paintInto` reuses its canvas). 11 ✓ 0 B/s added (claimed; nothing new synced). 12 headless only (−7 % fog on blackout, recorded); Mi 11i not measured (stated). 13 ✓ readability sheet #50–54. 14 not verified (online two-tab, lag, hidden-tab: stated as not verified by the builder; also not run here). 15 ✓ no balance change beyond the data. 16 not measured here (no PERF_ASSERT run; rubble adds ~6 boxes). 17 n/a. 18 ✓ `?startwave`, `DEV_DECAY_STAGES`; "Not verified" list present. 19 ✓ Notes for the merge cover every shared file (incl. the `legalDecayMasks` default and rubble in `solids` for 6.6). 20 ✓ fog noise/ring canvases registered (`fx_fog_noise`), FX frames appended; `noUnregisteredTextures` green. 21–23 n/a. 24 ✓ fog/darkness not switchable; boss/teammates/markers never fogged (only ZombieView/Eyes/Acid read the fog); the colour rule for rubble is checked by a test; the CO3 orange sky glow is baked scenery (designer look pick); 568×320 not shot (stated). 25 n/a here (looks rotate, nothing grows). 26 ✓ fog only on the local screen; the sim reads it only in aim assist (own beam); light state unchanged (`refreshBlackout` stays the only writer). 27 ✓ placement UI untouched except the reason word. 28 ✓ no phase change added. 29 ✓ hand-back sent. 30–31 n/a (no new edge input, no new HUD control). 32 ✓ decision logs read (6.3 B1–B3, 6.5 B1–B3 newer; nothing contradicts); reviewed the merged commit.

### Action items

- [x] [Medium] M1: Predictor/server aim-assist parity test at stage 5; shooter passed in `tools/netsim/hitsSim.ts`, `tools/netaudit/hitsLossSim.ts`.
- [x] [Medium] M2: `behemoth.fuzz.test.ts` walks stages 4–5 with `masksForStage` (keep 6.6's charge fuzz in the same loop after merge).
- [x] [Medium] M3: ten-wave sim asserts alley buried + ≥ 1 breach spawn from wave 7.
- [x] [Low] L1–L6 as in the table.

### Review fixes (builder, 2026-11-24)

Every finding fixed; each fix is checked by the mutation the reviewer named (applied alone, test run, restored).

- **M1** — new `apps/client/src/sim/NetSimHost.fog.test.ts`: Downtown at stage 5, wave 9, 10 % blackout, a touch Hunting Rifle (spread 0) and a zombie streamed through the horde stream 11.5 m west, 4° off. Without a Tactical flashlight both sides keep the raw aim; with it both bend (≈ 4.18°; within 0.05°, the horde stream's position quantization). Mutations "NetSimHost passes `null` instead of `aimShooter`" (M19) and "shooter gear forced to 0" → caught. `tools/netsim/hitsSim.ts` and `tools/netaudit/hitsLossSim.ts` pass `{ x, y, gear }` (predicted centre, the mirror's gear).
- **M2** — `boss/behemoth.fuzz.test.ts` walks stages 1–5 with `masksForStage(map, stage)`; 15 layouts (3 per stage), and it asserts that all three collapsed alleys ran at stages 4–5. Green in 27 s.
- **M3** — `economy/tenWaveSim.test.ts` (a): from stage 4, exactly one `alley_k_mouth` is `isSpawnBuried`, the buried mouth is never picked, and ≥ 1 `breach_*` is picked. It reads the wave director's recent-pick ring, only the picks made since the last tick. Mutations "buried rule removed" and "breaches never picked" → caught.
- **L1** — new `apps/client/src/render/fog/fogViews.test.ts` (fake scene): ZombieView draws at 1, half alpha at 0.5, and gives no `drawnImage` at 0; EyesView puts no eyes on the hidden zombie, and the fading zombie's eyes are at 0.9 × 0.5; AcidView hides the fogged glob. Mutations M16, M17, M18 → caught.
- **L2** — `decay/collapse.test.ts`: wave 10 keeps the run's material and style, `isEndlessWave(10)` is false and `(11)` is true. Mutation M7 (`>=`) → caught.
- **L3** — `legalDecayMasks(map)` now really is every mask a run can pick (default `gameplayOnly: false`; Downtown 1,620). The new `gameplayDecayMasks(map)` returns the 135 gameplay layouts (looks at 0; its doc says these are not run masks). Every gameplay caller was renamed. `decay.test` asserts that every mask picked over 256 seeds is in `legalDecayMasks`, and checks the sizes 1,620 and 135. The client look tests (palette, windowSpill, blockText, fog) bake no look-dependent output from the mask bits (material and style reach the bake through `CityScene`, not the mask), so they use `gameplayDecayMasks`.
- **L4 [behaviour, same numbers today]** — `decaySystem.ts › destroyBlockedBuildings` refunds `floor(b.paid × buildingRefundShare)` (5.20's `paid`: price + every upgrade step) for every decay-destroyed building (rubble, cars, police lines, fires), not the tier's base price. **Finding:** the balance cross-check already forces an upgraded tier's price to equal everything paid to reach it ("reinforced_barricade's price must be 40 + 50 = 90"), so with the shipped balance both rules give the same refund. The upgrade money was never lost, and the change only matters if a building's `paid` ever differs from its tier price (for example a future discount). Test in `decay/ruins.test.ts`: a really upgraded barricade on P1 refunds `floor(90 × 0.5)`, and a building with `paid` 30 (tier price 80) refunds 15. Mutation "back to the tier price" → caught.
- **L5 [behaviour]** — `BloodTrailView` gets a `fog` field (set by GameScene to the ScreenFog): a fog-hidden Crawler drops no new mark. Test in `fogViews.test.ts`; mutation → caught.
- **L6** — `zombies/ruins.fuzz.test.ts`: 1–2 extra players start on a random spot of the coming rubble (one of them downed now and then). After the stage change nobody is inside a box, and the test asserts `relocated.players` ≥ the layout count.

**Gate after the fixes** (story-6-2 merged with `origin/master` efbe4ad, Story 6.6+6.7 included, after `npm ci`): `npm run typecheck && npm run lint && npm test && npm run build` green — 360 test files passed (1 skipped), 3,363 tests passed (3 skipped), 429 s; build OK. Load (1-min) 0.99 at the start, 2.05 at the end (this builder only). Merge conflicts with 6.6+6.7 resolved: `placeholderSfx.ts` (both SFX unions), readability sheet (both blocks; 6.2+6.4 at #50–54, 6.6+6.7 at #60–64), `behemoth.fuzz.test.ts` (6.6's `layoutWorld` now walks stages 1–5 with `masksForStage`; both its walk fuzz and its charge/throw/enrage fuzz pass, 74 s).

### Re-review (AI) of the review fixes

**Reviewer:** fresh agent (own cloud session), 2026-11-24. **Commit reviewed:** `1e1f037` (fix commit `6c88186`, merge of master `efbe4ad` at `c0945e2`), diff `df48a5a..1e1f037` without `*.md`. Narrow re-review (designer speed-up): only the fix commits; `npm ci`, `npm run typecheck` (green) and the touched tests only (no full gate).

**Outcome: Approve** — no high or medium finding; 1 low, 1 nit. Every fix holds and every new test kills its mutation.

**Tests run (unmutated, green):** `NetSimHost.fog.test`, `fogViews.test`, `collapse.test`, `ruins.test`, `decay.test`, `ruins.fuzz.test`, `behemoth.fuzz.test`, `tenWaveSim.test` — 8 files, 57 tests, 94 s. Plus `apps/client/src/scenes` + `apps/client/src/render` (80 files, 940 tests) for the wiring mutation.

#### Exploit attempts

1. **L4 refund by `paid` — farm money?** `paid` is written only by `placeBuilding` (= tier price), `upgradeBuilding` (+ step price) and `addBuildingAt` (= tier price; mirror/debug). Repairs (`repair.ts`) and moves (`move.ts`: free, keeps `paid`) never touch it; sell removes the building. Refund = `floor(paid × 0.5)` < `paid` always, so build-then-collapse is a loss in every case; moving a building onto a future pile spot in build 6 gives the same 50 % as before. The `paid ≤ 0 / NaN` fallback (tier price) is unreachable server-side (every price > 0). Probe over every shipped upgrade chain: wood → reinforced paid 90 = price 90 (refund 45 old and new), wood → reinforced → metal paid 160 = price 160 (80 / 80). **Same numbers today; no farm. Held.**
2. **L5 trail fog.** `ScreenFog.visibility` returns 1 when the fog is off (stages < 5, lobby), so trails are unchanged there; `updateScreenFog` runs before `trailView.update` in the frame (`GameScene.ts` ~1968–1971), so the trail reads this frame's fog. One method call, no allocation per frame. `lastX/lastY` still advance while hidden, so no long mark appears when the Crawler comes out of the fog. **Held.**
3. **L3 rename.** No production code calls `legalDecayMasks` or `gameplayDecayMasks` (shared, server, client and tools: tests and `masks.testkit` only). Every gameplay caller (11 fuzz/tests, `masksForStage`, client look tests) now calls `gameplayDecayMasks` (135); the only `legalDecayMasks` caller left is `collapse.test.ts:165`, which wanted the full masks before (`{ gameplayOnly: false }`) and gets the same 1,620 now. No fuzz walks 1,620. **Held.**
4. **Merge resolution.** `behemoth.fuzz.test.ts`: 6.6's `layoutWorld` walks stages 1–5 with `masksForStage`; test 1 still asserts reach (`reachedAt` < 600 ticks per layout, counting 6.6's charge/throw hits) and that all three alleys ran (bits 9/10/11 checked: they are `ruins_alley_1..3`); 6.6's charge/throw/enrage fuzz keeps its no-attack-for-30-s stall check. `placeholderSfx.ts`: the union has 6.2's `ruins_rumble`, `debris_fall` and all 8 of 6.6/6.7's names, each with a `case`; typecheck green. **Held.**

#### Mutations (each applied alone, its test run, restored)

All killed: M1 NetSimHost passes `null` shooter · M1 shooter gear forced 0 (`NetSimHost.fog`) · L1 M16 ZombieView ignores fog (2 failing) · L1 M17 eyes ignore alpha · L1 M18 AcidView ignores fog · L5 trail drops while hidden (`fogViews`) · L2 M7 `isEndlessWave` `>=` (`collapse`) · L4 back to the tier price (`ruins`) · M3 buried rule removed from `classify` · M3 breaches always CLOSED (`tenWaveSim` (a)) · L6 `relocatePlayer` skipped (`ruins.fuzz`) · M2 fuzz back to stages 1–3 (`behemoth.fuzz`, the alley assertion).

Survived: GameScene drops `this.zombieView.fog = this.screenFog` (R1).

#### Findings

| # | Sev | Title | Where | Scenario | Fix |
|---|-----|-------|-------|----------|-----|
| R1 | low | The GameScene fog hookups are still untested (the part of L1's scenario that named GameScene) | `apps/client/src/scenes/GameScene.ts:670-671` (and `acidView.fog` in `updateScreenFog`) | Deleting line 670 passes all 940 tests in `scenes/` + `render/`: every zombie would show through the fog at stage 5, and only a playtest would catch it. Same for line 671 (trails, L5). `fogViews.test` checks the views with a stub, not the wiring. | A small test that builds the views the way GameScene does (or extract a `wireFog(views, screenFog)` helper and test it), or a browser smoke at `?startwave=9` asserting `zombieView.fogHidden > 0`. |
| R2 | nit | The M3 ring reading assumes fewer than `recentPicks` (6) picks per tick | `packages/shared/src/economy/tenWaveSim.test.ts:41-44` | If one tick picks ≥ 6 spawns, the head comes back to `prevHead` and the loop reads 0 picks, so "the buried mouth is never picked" checks nothing. Shipped balance: `spawnPerInterval` 2 every 0.25 s, so it cannot happen today. | Count picks with a counter or a spawn event, or assert `spawnPerInterval < recentPicks` in the test. |

**Reviewed commit:** `1e1f037`. Branch `rereview-6-2` (this note only; no code changed).

### Main session close-out (2026-11-24)

- Re-review approved (0 high/medium). R1 (GameScene fog hookups untested; deleting the zombieView.fog line passes every test) and R2 (tenWaveSim ring-read nit) are follow-ups, to be picked up by the next story that touches GameScene fog (6.9+6.10 power failure) or the Epic 6 retro.
- Designer decisions 6.2 B1–B3 (look kept, P3 on the forecourt, breach spots) in `docs/epic-6-decisions.md`.
- Main-session full gate on story-6-2 1e1f037 + master efbe4ad + decisions: typecheck, lint, 360 files / 3,363 tests passed (3 skipped), build OK; load → 2.26 (4 cores). Story done.
