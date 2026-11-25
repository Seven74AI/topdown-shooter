# Story 6.8: Special events, car alarm and stampede

Status: done

## Story

As a team,
I want surprises in the middle of the run,
so that no two runs play the same.

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

Most relevant here: 2 (the event record and the survivor/crate later live in schema: every copy), 3/4 (fairness rules, "Beat the rule"), 5 (the alarm car is shot like any car: `bulletBlockT`), 6 (stampede contact damage per body, once per Runner per player), 7 (stampede lanes, alarm lure fields: fuzz), 8 (the whole schedule and every spot from the `events` stream only), 9 (each event really triggered in the sims), 10 (ticks, `events.json`), 11 (events, not per-tick state), 12 (dust, chevrons, pins pooled and atlased), 14 (hidden tab across an event start; a late join sees the active event), 22 (stampede over-cap counted against the cap that applies), **23 (event fairness: the whole story)**, 24 (markers above the darkness, amber = usable event), 25 (the endless hook stays bounded), 27 (don't touch 5.13/5.20–5.25), 28 (an event can hold a wave's end, never forever).

## Acceptance Criteria

### Fairness rules (player-visible; brief lines 3 and 23; each is tested)

- **F1 "An event always announces itself before it can hurt you."** Every event starts with a banner, a sound and a map marker (with an edge arrow when off screen) on every phone on the same tick it starts (`event.triggered`). Nothing of the event can damage anyone or move any zombie until that tick has passed: the car alarm's pull starts ≥ 20 s or a shot later; the stampede's Runners appear only after its **3 s** warning (60 ticks).
- **F2 "Two different surprises per run, never back-to-back, never in wave 5."** At run start the `events` stream picks exactly **2 different events** for **2 different waves of 3–8**, never wave 5, never two neighbouring waves (allowed pairs: 3+6, 3+7, 3+8, 4+6, 4+7, 4+8, 6+8), each one respecting its gate. Same seed → same events, waves and start points (replay test).
- **F3 "An event starts in the middle of the fight, not in the opening burst or the last rush."** Each event starts when its wave has spawned a fraction of its zombies drawn at run start between **20 % and 60 %** (`events.json › startFractionMin/Max`), never during a build phase.
- **F4 "Shooting the armed car works for everyone the same way."** While a car is armed, the first bullet (any player's gun, pellets included) that reaches the car's body starts its alarm at once and is credited to that player in the event log; turret shots, melee, flames and blasts don't. A bullet stopped earlier (by a zombie it killed, a barricade, other cover) does not count.
- **F5 "The alarm pulls, it doesn't teleport or trap."** While the alarm sounds (**15 s**), every zombie within **15 m** of the car walks to it by the normal pathing (around cover, never through it) and crowds round it; a lured zombie still bites a standing player who comes within **2 m** of it. Zombies in the last-5 rush ignore the alarm (the wave always ends).
- **F6 "A stampede runs a lane you were shown."** The stampede's lane (**8 m** wide) is drawn with amber chevrons and dust at its start edge for the whole **3 s** warning; the Runners then run straight along that lane at **5 m/s** without chasing anyone, and never leave it except where cover pushes them aside.
- **F7 "A stampede Runner hurts you once."** A stampede Runner that touches a standing player deals **8** damage to that player once (per Runner per player, its own clock: never a shared pulse), then keeps running. They don't attack buildings; barricades and cover stop and deflect them like any body.
- **F8 "The stampede never makes the wave endless."** The 12 s crossing (6.8 B2) ends with every stampede Runner still on the map becoming a normal Runner of the wave (counted in "zombies remaining" and the last-5 rule); a Runner stuck for **1 s** (no progress along the lane) converts early. While the crossing runs, the wave cannot end.
- **F9 "Events only happen where they make sense."** Gates (checked at schedule time from the stage that wave will have, and again at trigger): car alarm only with at least one parked car still at its curb spot and not burning; gas leak (6.9) only at stage ≥ 2; power failure (6.10) only in waves 6–8; supply drop and survivor (6.9, 6.10) only with a reachable spot. An event that can't start at its trigger moment is skipped with `event.skipped` in the log (test: never happens on Downtown).

### Behaviour

1. **Framework (`packages/shared/src/events/`, FR37).** One module per event (`carAlarm.ts`, `stampede.ts`; 6.9 adds `gasLeak.ts`, `supplyDrop.ts`; 6.10 `powerFailure.ts`, `survivor.ts`), each an `EventModule { kind, fits(world, wave), start(world), update(world), end(world), holdsWave(world) }` registered in `events/registry.ts`. `EVENT_KINDS = ["car_alarm", "stampede", "gas_leak", "supply_drop", "power_failure", "survivor"]` (append-only: the index goes on the wire; this story registers the two it builds, the others are stubs whose `fits` returns false until their story lands). Data in `config/balance/events.json` (schema `eventsSchema` in `balanceSchema.ts`, `loadBalance` cross-checks).
2. **State.** `world.special: SpecialEventState` (not `world.events`: that is the EventBus) holds the run's `schedule` (2 entries `{ kind, wave, startFraction }`, fixed at run start), the `active` event (one at a time: kind index or −1, `phase`, `startTick`, `phaseTick`, `x`, `y`, a per-kind sub-record), `done` (bitmask of schedule entries finished) and `log` counters (triggered / skipped / alarmShotBy for tests). In `snapshotWorld`; reset by the run reset.
3. **Scheduler (`events/schedule.ts`).** `scheduleRunEvents(world)` at the run's first build start, from `world.streams.events` only: shuffle the registered kinds, take 2 whose `fits` holds for at least one allowed wave, then pick their waves from the allowed pairs (F2) whose gates hold (the stage per wave from `stageForWave`, honouring `world.debug.decayStageByWave`), then each `startFraction` from `[0.20, 0.60]`. Deterministic, no allocation after run start. `scheduleEndlessEvent(world, wave)` (for 6.12: one event that fits an even endless wave without a Behemoth; not the same kind as the previous endless event) is written and unit-tested here; 6.12 calls it.
4. **System.** `updateSpecialEvents` fills the existing `specialEvents` slot of `SYSTEM_ORDER` (today a no-op in `DEFAULT_SYSTEMS`; `NO_SYSTEMS`/`PREDICTION_SYSTEMS` keep the no-op). In a wave: trigger the scheduled entry when `size − queued ≥ round(size × startFraction)` (F3); tick the active module; at `wave.ended` call `end`. `updateRun` ends a cleared wave only when `!eventHoldsWave(world)` (F8; 6.9's gas countdown also holds). `skipWave` (dev) ends the active event first.
5. **Events on the bus and the wire.** `event.triggered { kind, wave, x, y, startTick }`, `event.phase_changed { kind, phase, tick, playerId? }` (armed → alarm with the shooter; warning → running), `event.ended { kind, outcome }` (`"done" | "failed" | "skipped" | "wave_end"`; `failed` = 6.10's survivor died), `event.skipped { kind, wave }`. New `NET_EVENT_KIND` numbers (next free at merge; never reuse), round-trip tests, global interest (team cues: not local).
6. **Room state (late join / woken tab, brief 14).** Schema `RunState` gains `eventKind` (uint8, 255 = none), `eventPhase` (uint8), `eventStartTick` / `eventPhaseTick` (uint32), `eventX` / `eventY` (uint16 cm), `eventLane` (uint8) — written by `syncState` on change only; `RUN_STATE_FIELDS`, `RunStateView`, `fakeRoom`, devThrottle key list. The client draws markers from these (an event that started while the tab slept still shows; its banner is skipped if older than `events.json › lateBannerS` 3 s, the 5.7 `ageS` pattern).
7. **Car alarm (FR38, D7).** Candidates = map `cover` objects of kind `car` that are active at the current stage (`world.obstacles.cover`), are original curb/lot cars (not a decay `add`) and are not a burning fire's target. Pick (stream `events`) among those **8–25 m** from the team centre (mean of standing players; none → the nearest beyond 8 m). Phase `armed` **20 s** (`armedS`): the car's hazard blink + the CA3 bell pin pulse; the first qualifying bullet (F4) or the timer → phase `alarm` **15 s** (`alarmS`): every zombie whose centre is within **15 m** (`pullRadiusM`) of the car centre at any tick of the alarm is marked lured (`pool.lureTicks`, cleared at the alarm's end) and steers by the **lure fields** (one on the nav grid, one on the wide grid for wide bodies), seeded from the free cells round the car and built during the 20 s armed phase inside the existing `rebuildCellsPerTick` budget (never rebuilt mid-alarm: the car doesn't move). A lured zombie with a standing player within `distractBreakM` **2 m** targets that player (F5). Rushing zombies are never lured. Players' alarm sound: a placeholder loop positioned at the car.
8. **Shot hook (`combat/firing.ts › updateProjectiles`).** For a player's projectile (`pool.building === 0`), while an event exposes a shootable box (`specialShotTarget(world)`: the armed car's box; 6.9 adds the gas tank), test the step's segment against that box with `segmentBoxEntryT`; it counts when its t is not after the shot's stop point (`stoppedAt`/`blockT`, a car being its own first blocker). One box test per projectile step only while armed; nothing otherwise. The client's cosmetic projectile already stops at the car.
9. **Stampede (FR41).** Lanes are map data (item 11). Pick (stream `events`) among lanes open at the stage whose centre line passes within `laneNearTeamM` **10 m** of the team centre, else the nearest lane. Phase `warning` **3 s** (`warningS`): rumble, ST1 dust cloud at the start edge, amber chevrons down the lane. Then `running` **12 s** (`runS`, 6.8 B2; was 10): **12 / 18 / 24 / 30** Runners (`countByPlayers`, by standing + downed players in the run) spawn in rows at the start edge across the 8 m width (`rowSize` 6, `rowGapS` 0.3 s), **not wave zombies** (`waveZombie = 0`), state `ZOMBIE_STATE.STAMPEDE` (new value 6, the horde nibble), speed `speedMps` **5.0**, moving along the lane direction with the normal separation, push-out and box collision (no flow field, no flanking, no target). Contact with a standing player: **8** damage (`contactDamage`, tag `zombie`), once per Runner per player (a 4-bit per-zombie mask). Runners leaving the far edge are removed (no reward, not counted). At the end of `runS`, or when a Runner made < `stuckProgressM` 0.5 m progress in `stuckS` **1 s**, it becomes a normal Runner (`waveZombie = 1`, state CHASE): it then counts in `remaining` (recomputed each tick) and the last-5 rule (F8). Kills pay the normal Runner reward.
10. **Alive cap during a stampede (brief 22).** Normal spawns pause while stampede Runners are alive (`updateWaves` room = 0), and the stampede may spawn up to `overCap` **30** above the alive cap that applies (6.5's `maxAliveNow(world)`, 150 today; 110 while a Behemoth lives) — so at most 180 alive (pool capacity 256). The Runners that don't fit wait for the next row tick; any still unspawned at the end of `runS` are dropped.
11. **Map data.** A new Tiled object layer `events` (generator `tools/maps/buildDowntown.ts`, loader `map/loadTiledMap.ts` + `tiledSchema.ts`, `DistrictMap.eventSpots` and `DistrictMap.stampedeLanes`): **4 stampede lanes** (2 east–west along the main street, 2 north–south along the cross streets; each a rect 8 m wide with `dir`, `minStage`, `maxStage`), and the spot lists 6.9 and 6.10 use (`crate` ×10, `survivor` ×8, `safe` ×6, each a point with `minStage`), all on open road. Built here once so 6.9 and 6.10 don't touch the map files. Tests: every spot is box-free and fire-free and reachable (the 4.5 reachability pattern) and every lane lets ≥ 90 % of a 30-Runner stampede cross or convert without a stall, at every stage × legal variant mask (`legalDecayMasks`), including 6.2's rubble once merged.
12. **Client.** `render/EventView.ts` (new): marker pins (the looks.html `pin`, disc + icon + pulse ring) and edge arrows (`render/edgeArrow.ts`) drawn above the darkness through 6.3's `aboveDarkness(obj, ABOVE_DARK.marker)` (`render/darkness/aboveDark.ts`, depth `DARKNESS_DEPTH` 11.7); car hazard blink + CA3 bell pin + a 20 s countdown arc on the pin; ST1 dust (pooled particles) + amber chevrons; banner via `GameScene.stackBanner`: "CAR ALARM · shoot it to set it off", "STAMPEDE!" (texts in `events.json › banners`). Sounds in `audio/placeholderSfx.ts`: `event_car_alarm_armed` (chirp), `event_car_alarm` (loop, positional), `event_stampede_rumble`. Art in `render/city/eventArt.ts` through `addGeneratedTexture`.
13. **Dev switches (brief 18).** Solo cheat "Force event ▸ kind" (next wave, at 20 %); server `DEV_EVENTS=car_alarm@3,stampede@4` (dev only, replaces the schedule); `?events=` solo URL switch with the same format. Never JSON edits.
14. **Bots.** `bots/botPolicy.ts`: bots step out of a stampede lane during the warning (keeps the 10-wave sim from dying to the first stampede); bots don't shoot the car (the timer sets it off).

## Tasks / Subtasks

- [x] **T0 Art (picks fixed; no new pick).** From `docs/epic-6-decisions.md` › section 5: **CA3** car alarm = a pulsing amber bell marker over the car (no sound rings; the 15 m pull is not drawn), plus the car's own hazard blink; **ST1** stampede = a dust cloud at the map edge + amber chevrons down the lane. Port `pin`, `IC.bell`, the chevron and the dust code from `docs/art/epic-6/looks.html` (`makeAlarmCard`, `makeStampedeCard`) into `render/city/eventArt.ts` (pin disc, bell, chevron frames in one small atlas `event_<name>_<variant>`) and `render/EventView.ts`; every texture through `addGeneratedTexture` with a redraw callback (brief 20). Colour rule: amber `#ffb648` for both. Add both to `docs/playtests/milestone-1/readability-sheet.md` (brief 13).
- [x] **T1 Balance + schema** (AC 1, 7, 9, 10): `config/balance/events.json` (below); `balanceSchema.ts › eventsSchema`; `balance.ts` loads it (`balance.events`) and cross-checks (waves list ⊂ 1..`runWaves`, excluded 5, fractions 0–1 min ≤ max, `countByPlayers` length 4, `overCap` + `maxAlive` ≤ `ZOMBIE_POOL_CAPACITY`); `config/balance.test.ts` cases.
- [x] **T2 Map layer** (AC 11): generator objects + `.tmx/.tmj` regenerated (`tools/maps/downtownFiles.test.ts`), loader + schema, `DistrictMap.eventSpots` / `stampedeLanes`, `PLACEHOLDER_MAP` gets empty lists; reachability + clearance tests (`map/downtown.test.ts`, new `events/spots.test.ts`).
- [x] **T3 Framework** (AC 1–6): `events/registry.ts`, `events/eventState.ts`, `events/schedule.ts` (`scheduleRunEvents`, `scheduleEndlessEvent`, `eventFits`), `events/specialEvents.ts` (`updateSpecialEvents`, `eventHoldsWave`, `forceEvent`), World field + `createWorld`, `DEFAULT_SYSTEMS.specialEvents`, `run/runStateMachine.ts › updateRun` hold, `skipWave`; `core/simEvents.ts` + `net/netEvents.ts` kinds; schema fields, `syncState` (+ reset), `RUN_STATE_FIELDS`, `RunStateView`, `fakeRoom`, devThrottle; `snapshotWorld`. Tests `events/schedule.test.ts` (F2 over 10,000 seeds: always 2, different, allowed pairs only, gates; 1 solo player and 4), `events/specialEvents.test.ts` (F3 start fraction; one active event; holds the wave; `skipWave`), `net/netEvents.test.ts` round trips, `syncState.test.ts` (fields + reset).
- [x] **T4 Car alarm** (AC 7, 8; F4, F5): `events/carAlarm.ts`, lure fields in `zombies/flowField.ts` (`PathingState.lure` + `lureWide`, seeded from the car's ring cells, built while armed, idle otherwise), `zombieAi.ts` pass 1 lure steering (+ `pool.lureTicks` in `zombiePool.ts`), the shot hook in `combat/firing.ts`. Tests `events/carAlarm.test.ts`: candidate filter per stage × mask (never a moved, removed or burning car; ≥ 1 at waves 3–8 on Downtown), 8–25 m pick, shot by pistol / shotgun pellet / AR starts it and credits the shooter, turret / melee / flame / grenade don't, a bullet stopped by a zombie or barricade before the car doesn't, the 20 s timer starts it, zombies within 15 m reach the car (around the bus), a player within 2 m of a lured zombie is bitten, rushing zombies ignore it, lure ends after 15 s.
- [x] **T5 Stampede** (AC 9, 10; F6–F8): `events/stampede.ts`, `ZOMBIE_STATE.STAMPEDE`, lane movement in `zombieAi.ts` (a branch before the target pick), per-Runner contact mask, conversion, over-cap in `waves/waveDirector.ts › updateWaves`. Tests `events/stampede.test.ts`: 12/18/24/30 by players; nothing spawns in the 3 s warning; contact = 8 once per Runner per player; no building damage; conversion at 10 s and when stuck; converted Runners counted in `remaining` and rushed in the last 5; a wave whose last normal zombie dies mid-crossing waits; never above cap + 30; stampede Runners don't flank.
- [x] **T6 Client** (AC 12): `EventView.ts`, `eventArt.ts`, `GameScene` (banners, handlers for the four event kinds, sounds), `NetSimHost` (decode, `ageS`, schema → view), `LocalSimHost` (solo runs the system), HUD nothing else. Tests: pure-function tests for the marker/countdown model (`eventMarkers.test.ts`), atlas ≤ 2048² (`atlasLayout.test.ts`), redraw after context loss.
- [x] **T7 Fuzz, sims, bandwidth, perf** (brief 7, 9, 11, 16): `zombies/downtown.fuzz.test.ts` + random layouts × stages 2–4 × masks with a forced alarm and a forced stampede each: no body in a box, no stall, lured zombies reach the car, stampede converts; 10-wave sim (6.1's, or `runWaves` override) asserts 2 events triggered per run over 8 seeds, both kinds of this story seen; bandwidth test (`decayBandwidth.test.ts` pattern); tick cost with 180 alive + 2 lure fields (`PERF_ASSERT=1`, record load).
- [x] **T8 Gates.** Mutations (e.g. wave 5 allowed → schedule test; back-to-back allowed; contact damage per tick → F7 test; lure through cover (straight line) → fuzz; conversion skipped → F8 wave-hold test; turret shot counted → F4 test) and which tests failed. Browser check (Playwright): solo `?events=car_alarm@1` and `?events=stampede@1` (+ `?wallet=` for a quick run), online two tabs with `?lag=150&jitter=20`: banner once, pin + edge arrow, shooting the car starts the alarm on both phones, chevrons for 3 s, a late tab (sleep/wake across the event start) still shows the marker without a late banner. `typecheck && lint && test && build`. Merge notes.

`events.json` (starting values):

```json
{
  "perRun": 2, "waves": [3, 4, 6, 7, 8], "startFractionMin": 0.2, "startFractionMax": 0.6, "lateBannerS": 3,
  "carAlarm": { "armedS": 20, "alarmS": 15, "pullRadiusM": 15, "distractBreakM": 2, "pickMinM": 8, "pickMaxM": 25 },
  "stampede": { "warningS": 3, "runS": 12, "laneWidthM": 8, "speedMps": 5, "contactDamage": 8, "countByPlayers": [12, 18, 24, 30], "overCap": 30, "rowSize": 6, "rowGapS": 0.3, "laneNearTeamM": 10, "stuckS": 1, "stuckProgressM": 0.5 },
  "fx": { "maxDustParticles": 64, "maxMarkers": 4 },
  "banners": { "car_alarm": "CAR ALARM · shoot it to set it off", "stampede": "STAMPEDE!" }
}
```

## Dev Notes

### Designer decisions to confirm (made non-interactively; recommended values)

- **6.8 D1 ★ Which car gets the alarm.** Recommended: **a random parked car 8–25 m from the team** (never one right next to you, never one across the map). Alternative: any parked car anywhere.
- **6.8 D2 ★ What sets the alarm off early.** Recommended: **any player's bullet that reaches the car** (pellets too), not turrets, melee, flames or blasts — it is a choice someone makes. Alternative: anything that damages the car.
- **6.8 D3 ★ What pulled zombies do.** Recommended: **every zombie within 15 m walks to the car and crowds round it for the 15 s; it still bites anyone who comes within 2 m; the last-5 rushers ignore it.** Alternative: pulled zombies ignore players completely.
- **6.8 D4 ★ Where the stampede runs.** Recommended: **one of 4 fixed lanes along the streets, chosen among those passing within 10 m of the team** (so it matters). Alternative: any lane at random.
- **6.8 D5 Stampede contact.** Recommended: **8 damage once per Runner per player, no shove; they don't hit buildings; barricades stop them.** Alternative: 8 damage per second of contact.
- **6.8 D6 ★ An event holds the wave open.** Recommended: **a wave can't end while a stampede is crossing (or, in 6.9, a gas tank is counting down)**; it ends right after. Alternative: the end of the wave cancels the event.
- **6.8 D7 Stuck stampede Runners.** Recommended: **a Runner that makes no progress for 1 s becomes a normal Runner early.**
- **6.8 D8 The schedule is secret.** Recommended: **no preview at the build phase; you find out when it starts** (banner + sound + marker). Alternative: show "Next wave: ???" at the build phase.
- **6.8 D9 Banner texts.** Recommended: "CAR ALARM · shoot it to set it off", "STAMPEDE!" (6.9/6.10 add theirs).
- **6.8 D10 Off-screen events.** Recommended: **every event marker gets an edge arrow when it's off screen** (like teammates).
- **6.8 D11 Stampede size counts downed players.** Recommended: **by everyone in the run (standing or downed)**, like wave sizes. Alternative: standing only.

### Decisions (developer guidance)

- **DD1 One active event at a time.** Two scheduled events are always in different waves; endless has one per even wave. So the state is one slot, the schema one record.
- **DD2 Gates at schedule time.** Stage per wave is known at run start (`stageForWave`), cars and fires follow from the map, stage and variants; so the schedule never needs a re-roll. Re-check at trigger only as a safety net (`event.skipped`).
- **DD3 Lure by fields, not straight lines.** Straight steering gets stuck at the bus; two extra fields (nav + wide) built once during the 20 s armed phase share the round-robin budget (6,144 cells per field ≈ 3 ticks at 2,048 cells/tick). Idle and dropped after the alarm (no per-tick cost).
- **DD4 Stampede without fields.** Lanes are chosen box-free; Runners move straight with push-out; the stuck rule is the safety net (F8). Cheaper and readable ("they run this way").
- **DD5 The shot hook reads the segment only** (no new blocker list): the car is already a shot blocker; the tank (6.9) is not (a floor cap).
- **DD6 `ZOMBIE_STATE.STAMPEDE = 6`** (≤ 7, bit 3 is "burning"). 6.5's boss is its own record, so no clash; renumber at merge only if another story took 6.
- **DD7 Team centre** = mean position of standing players (none standing: no event triggers that tick).

### Current state (read before changing)

- `core/systems.ts`: `SYSTEM_ORDER` already has a `specialEvents` slot after `waves`; `DEFAULT_SYSTEMS.specialEvents = noop`. `boss` slot too (6.5).
- `core/seedStreams.ts`: `STREAM_NAMES = ["decay", "events", "spawns", "combat"]`; `world.streams.events` exists and is unused today (draws from it change nothing else: `core/streamIndependence.test.ts`).
- `waves/waveDirector.ts`: `beginWave` (size, mix, fixed), `updateWaves` (spawn batches with `room = maxAlive − aliveCount`, `remaining = waveZombiesAlive + queued`, last-5 rush marks `waveZombie === 1` zombies), `spawnZombie(world, type, x, y, waveZombie)`.
- `run/runStateMachine.ts`: `updateRun` → `if (updateWaves(world)) endWave(world)`; `skipWave` (dev); `endWave` → build or Results at `runWaves`.
- `zombies/zombieAi.ts › updateZombies`: pass 1 picks `nearestAlivePlayer`, steers straight or by `chase` / `flank` / `wideChase` fields (`steerByField`), separation; pass 2 move; pass 3 overlaps; pass 4 contact (`damagePlayer` → `damagePlayerBy`, windups), push-out, building attacks.
- `zombies/zombieTypes.ts › ZOMBIE_STATE` 0–5 used; values ≤ 7.
- `zombies/flowField.ts`: `PathingState` (nav, wide, chase, flank, wideChase), `advanceFlowField` / `rebuildFlowFieldNow`, seeding from players (`seedPlayer` / `seedAround`), budget `pathing.rebuildCellsPerTick` 2048.
- `combat/firing.ts › updateProjectiles`: per projectile step `bulletBlockT`, zombie hits by t, `stoppedAt`; turret shots have `pool.building > 0`. `combat/cover.ts › segmentBoxEntryT`.
- `map/districtMap.ts`: `cover` (cars `parked_car_1–3`, `street_car_west/east`, `curb_car_*`), `decay` mutations (stage 2: 4 of 6 curb cars move into the road (`*_in_road` adds, `*_leaves_curb` removes), `parked_car_3` driven off; stage 3: 2 of {parked_car_1, parked_car_2, street_car_west} ignite), `hazards` (`gas_leak_zone`). `world.obstacles.cover` = the active cover.
- Client: `scenes/GameScene.ts › stackBanner`, event switch near `zombie.brute_spawned`; `sim/NetSimHost.ts` decodes events and copies schema; `render/edgeArrow.ts`, `render/teammateMarkers.ts` (edge arrow pattern); `render/bruteCue.ts` (`ageS` late-banner rule); `audio/placeholderSfx.ts › SfxName`, `playSfx(name, pan)`.
- `bots/botPolicy.ts`, `bots/headlessRun.ts` (sims), `economy/fiveWaveSim.test.ts`.

### Must be preserved

Waves without an event behave bit-for-bit as today (no stream draw changes `spawns`/`decay`/`combat`; snapshot digests of existing replays unchanged except the new empty `special` record — regenerate fixtures once, say so); the 4.3 spawn rules; the 3.5/3.8 field budget; the last-5 rule; 2.12 rewind; brute/spitter/bloater states; `NO_SYSTEMS` mirror does nothing.

### Copies touched (brief 2)

World (`special`, `pool.lureTicks`, `pool.stampedeHit` mask, `pathing.lure`/`lureWide`) → schema (`eventKind`, `eventPhase`, `eventStartTick`, `eventPhaseTick`, `eventX`, `eventY`, `eventLane`) → `syncState` (+ reset) → `RunStateView` / `RUN_STATE_FIELDS` → `fakeRoom` → devThrottle (key list) → mirror (`NetSimHost`: copies the event record into its World's `special.active` so `EventView` reads one source in solo and online) → Predictor (nothing: events never move the local player) → `snapshotWorld` (`special` incl. schedule; lure fields hashed in `snapshotPathing`).

### Beat the rule (for the reviewer; brief 4)

1. Read the schedule: is anything about the next event visible in the build phase (schema, events, HUD)? (Must not be, D8.)
2. Shoot the armed car through a barricade, a zombie, the bus, from behind a turret: which start it? Shoot it with a turret, melee, a grenade, a flame: none must.
3. Two players shoot the car on the same tick: one credit, one alarm, no double phase change.
4. Stand inside the 15 m ring as the alarm starts: are you still bitten by zombies more than 2 m away? (No.) Within 2 m? (Yes.)
5. Use the alarm to stop the wave: lure the last zombies and hide; does the wave still end (rush ignores it; 15 s limit)?
6. Stand in the stampede lane during the warning, then in the middle: count hits per Runner (1 each, 8 dmg). Hold a barricade line across the lane: do Runners stall forever, damage it, or convert at 1 s / 10 s?
7. Kill every normal zombie during the crossing: does the wave end before the stampede? (No.) After conversion: are the converted Runners in "remaining"?
8. Trigger a stampede at 150 alive: how many alive at most (≤ 180)? Do normal spawns resume after?
9. Sleep a tab across the event start, wake mid-event: marker shown, banner skipped, countdown correct from `eventPhaseTick`.
10. Replay a recorded run with events: same digest (events stream only).
11. Solo (× 0.4 waves of 48–128 zombies): does a 20–60 % start still land mid-fight; does the stampede (12) still convert in time?

### Bandwidth (brief 11)

**Network audit note (designer 2026-11-24, `docs/perf/network-audit-2026-11.md` F8):** the stampede's 180 alive can all be in one view. At today's 8 B per zombie per tick that is 6 + 8 × 180 = 1,446 B × 20 = **28.2 KB/s** of horde alone, over the brief's 24 KB/s (it already fails from 153 in view). The bandwidth test must assert this worst case (stampede + horde in one view) against 24 KB/s. If it fails, cap the zombies in any one view at 150 for the stampede's duration, or land after Story 8.10 (half-size horde stream). Record which.

Event messages ~15–25 B each, ≤ 4 per event; schema event record ≤ 20 B per change; stampede Runners are horde records (30 × 8 B × 20 Hz ≈ 4.8 KB/s at worst while in view, inside the 24 KB/s horde budget because normal spawns pause and the total stays ≤ 180 with most off screen). Assert in a bandwidth test and report.

### Phone FPS / Perf

Pins (≤ 4), chevrons (12 sprites), dust (≤ 64 pooled particles, `events.json › fx`); one small atlas. Run `?stress=150` with a forced stampede; report headless FPS before/after with load. Server: two lure fields built inside the existing budget, the stampede branch is O(n); added p99 recorded (`PERF_ASSERT=1`).

### Art

CA3 (pulsing amber bell pin over the car + the car's own hazard blink; no rings, the pull is not drawn) and ST1 (dust cloud at the lane's start edge + amber chevrons pointing down the lane) from `docs/art/epic-6/looks.html` (screenshots `docs/art/epic-6/ingame/ev-1240.png`, `ev-390.png`). All in game code via `addGeneratedTexture`; colour rule: amber = an event you can use.

### Dependencies

- **6.3 (blackout lighting)**: `render/darkness/aboveDark.ts` › `aboveDarkness(obj, ABOVE_DARK.marker)` for every event marker, edge arrow, chevron and dust (markers must draw above the darkness). Until 6.3 merges, draw markers at the top world depth; the merge swaps in the one call (Notes for the merge). 6.10's power failure writes 6.3's `world.lights.powerFailure` (see 6.10).
- **6.5**: `maxAliveNow(world)` (110 while the Behemoth lives). Until then, `balance.waves.maxAlive`.
- **6.1**: the 10-wave run (events in waves 7–8 need it to exist; the scheduler works on 6 waves with waves {3, 4, 6}). The 10-wave sim liveness asserts land with whichever merges second.
- **6.2**: rubble at stage 4 may block a lane or spot: the spot/lane tests over every stage × mask catch it; if a lane is blocked, set its `maxStage` 3.
- **Epic 5 in progress (5.13, 5.20–5.25)**: no overlap (no shop/build-bar UI touched).

### Notes for the merge (brief 19)

- `core/world.ts`: new `special` field next to `lights`; 6.5 adds `boss` — append both.
- `waves/waveDirector.ts › updateWaves`: the stampede pause/over-cap sits where `room` is computed; 6.5 replaces `b.maxAlive` with `maxAliveNow(world)` there — keep both. 6.1 changes `waves.json` only.
- `run/runStateMachine.ts › updateRun`: the event hold (`eventHoldsWave`); 6.11/6.12 change `endWave`'s branch — different lines.
- `zombies/zombieAi.ts`: the stampede branch and lure steering in pass 1; 6.5's boss is a separate system; 6.10's survivor adds itself to the target list in the same function (`collectAlivePlayers` / `nearestAlivePlayer`).
- `zombies/flowField.ts`: two lure fields; 6.5 adds a boss field; 6.10 seeds the chase field from the survivor — three separate additions to `PathingState`.
- `combat/firing.ts`: one hook call in `updateProjectiles`; 6.9 adds the tank box to `specialShotTarget`, no further edit here.
- `net/netEvents.ts`: next free kinds; 6.5/6.9/6.10/6.11 add theirs — renumber at merge, never reuse.
- Schema/`syncState`/`stateView`/`fakeRoom`: 6.9/6.10 append crate and survivor fields to the same event record.
- `map/loadTiledMap.ts`, `tiledSchema.ts`, `tools/maps/buildDowntown.ts`: the `events` layer; 6.2 adds rubble/breaches to `decay`/`spawns` — different layers.
- `render/EventView.ts`, `render/city/eventArt.ts`: 6.9/6.10 append their drawings.

### Suggested build round

**Round 2** (`docs/epic-6-decisions.md` › Build rounds): **6.8 first and alone among the event stories** (6.9 and 6.10 build on its framework, shot hook and map layer), best after 6.5 (`maxAliveNow`). It runs **in parallel with 6.4 (Collapse) and 6.6 (boss)** with merge care on `zombieAi.ts`, `flowField.ts` (6.6: merge one after the other) and `waveDirector.ts` (separate functions/blocks); 6.3's `aboveDark.ts` is on master by then (only the marker depth line). After it (round 3): **6.9 and 6.10 in parallel** (they touch different event modules; shared files only by appending).

### References

- `epics.md` › Story 6.8; GDD › Special events (always 2, table), Hazards, Downtown (parking lot = car alarm spot); FR37, FR38, FR41.
- `docs/ideas/epic-6/proposal.md` § 0 (D2, D7), § 6; `party-notes.md` › Round 9.
- `game-architecture.md` › Event System (`event.triggered` naming), Seeded PRNG (events stream), Sync (event entities in schema), System order (`updateSpecialEvents` after waves).
- Story files 3.5 / 3.8 (fields and budget), 4.3 (spawns), 4.4 (streams), 4.5 (decay apply, reachability), 4.7 (moved cars), 4.8 (fires), 5.7 (`ageS`, fixed zombies), 5.14 (stand-on-it pattern).

## Dev Agent Record

### Agent Model Used

Claude (Claude Code cloud builder session, branch `story-6-8`).

### Debug Log References

- Headless screenshots: `docs/art/6-8/`. Perf: `docs/perf/epic-6-events.md`. Gate result with load: the hand-back message.

### Completion Notes List

**What was built (all shared sim code; server, solo, mirror):**

- **Framework (AC 1–6, `packages/shared/src/events/`).** `eventState.ts` (`EVENT_KINDS` append-only, `EVENT_PHASE` NONE/ARMED/ALARM/WARNING/RUNNING, `EVENT_OUTCOMES`, `world.special`: schedule, one active slot, an `extra` entry for forced/endless, the car and stampede records, a log), `common.ts` (`EventModule`, team centre, phase change, player slot index), `registry.ts` (car alarm + stampede; the four 6.9/6.10 kinds are stubs whose `fits` is false; built lazily because the modules sit in an import cycle with the wave director and firing), `schedule.ts` (`scheduleRunEvents` from the `events` stream only, `eventFits`, `scheduleEndlessEvent` for 6.12), `specialEvents.ts` (`updateSpecialEvents` in the `specialEvents` slot; F3 trigger at `size − queued ≥ round(size × startFraction)`; skipped entries; `endSpecialEvent`; `eventHoldsWave`; `forceEvent`; the shot hook), `devEvents.ts` (`DEV_EVENTS` / `?events=` parser).
- **Car alarm (AC 7–8, D1–D3).** Candidates = map cover cars active at the stage with no applied `remove`/`ignite` on them (never moved, burning or a wreck); pick 8–25 m from the team (`events` stream), else the nearest beyond 8 m, else the farthest. ARMED 20 s → ALARM 15 s on the first PLAYER projectile step that enters the car's box no later than where the shot stopped (`combat/firing.ts`, one hook line; turrets, melee, flames and grenades never reach it), or the timer. Lure: every zombie within 15 m at any alarm tick (not rushing, not a stampede Runner) gets `pool.lureTicks` and walks by the two **lure fields** (`zombies/flowField.ts`: `PathingState.lure` + `lureWide`, seeded from the free cells within 0.75 m of the car box, built once while armed in a round-robin turn before the boss field, idle after); a standing player within 2 m breaks the lure for that zombie; a Spitter's windup still finishes.
- **Stampede (AC 9–10, D4, D5, D7, D11).** Lane pick among open lanes whose centre line is within 10 m of the team (else the nearest). WARNING 3 s (nothing spawns) → RUNNING 10 s: 12/18/24/30 Runners (players in the run, downed and out count) in rows of 6 every 0.3 s across the start edge, `ZOMBIE_STATE.STAMPEDE` (6), not wave zombies, 5 m/s along the lane with the normal separation and push-out; cover ahead (every box in a 4 m band, merged) is side-stepped to its nearer end that stays in the lane. Contact: 8 damage once per Runner per player (a per-zombie slot mask, `stampedeContact` in pass 4; no bites, no building hits). Far edge → removed (`removeZombie`: no `zombie.killed`, no reward). < 0.5 m progress in 1 s, or the 10 s end → a normal Runner of the wave (`waveZombie = 1`, CHASE, or RUSH when the last-5 rush already runs). Normal spawns pause while Runners run; the stampede may go 30 over `maxAliveNow` (150, or 110 while the Behemoth lives).
- **Run flow (D6, F8, brief 28).** `updateRun` ends a cleared wave only when `!eventHoldsWave` (a stampede warning or crossing); `skipWave` ends the active event first and removes its Runners; a wipe → Results ends it with `wave_end`. Each is a tested transition.
- **Wire (AC 5–6).** SimEvents `event.triggered` (kind, wave, x, y, startTick, phase, lane), `event.phase_changed` (kind, phase, tick, playerId), `event.ended` (kind, outcome), `event.skipped`; `NET_EVENT_KIND` 55–58 (global interest). Room state: `eventKind` (255 none), `eventPhase`, `eventStartTick`, `eventPhaseTick`, `eventX`/`eventY` (cm), `eventLane` (255 none) — on change only, never the schedule (D8). Copies: World → schema → `syncState` (+ reset) → `RunStateView`/`RUN_STATE_FIELDS` (compile-time key check) → `fakeRoom` → devThrottle (iterates the key list) → mirror (`net/mirrorEvent.ts`, which also finds the armed car's box from the map) → Predictor (nothing) → `snapshotWorld` (`special`, the pool's lure/stampede arrays, the lure fields in `snapshotPathing`).
- **Map (AC 11).** `events` layer (generator + loader + `DistrictMap.eventSpots`/`stampedeLanes`; `PLACEHOLDER_MAP` empty): 4 lanes (main street e/w at every stage; cross street s/n at **stages 1–3**: from stage 4, 6.2's `rubble_pile_2` seals the cross street's north end, so per the story's "set its maxStage 3"), crate ×10, survivor ×8, safe ×6 (picked by a clearance search: ≥ 1.2 m from every box any stage, variant or 6.2 rubble can put there, out of fire zones, ≥ 1.5 m from spawns).
- **Client (AC 12–13).** `render/city/eventArt.ts` (`event_atlas`: CA3 bell pin, ST1 "!" pin, pulse ring, edge-arrow discs + tip, amber chevron, 3 dust puffs, hazard glow; through `addGeneratedTexture`), `render/eventMarkers.ts` (pure marker/cue model, countdown from the server tick, late-banner rule), `render/EventView.ts` (pin + pulse ring + countdown arc, edge arrow, 4 hazard glows blinking 2/6 Hz, ≤ 12 chevrons spread down the lane, ≤ 64 pooled dust puffs; all in `ABOVE_DARK.marker`; the car-alarm loop follows the state), `GameScene` (3 small hooks; the banner in amber through 6.6's `showBanner(text, color)`), sounds (`event_car_alarm_armed`, `event_stampede_rumble`, the positional `startCarAlarmLoop`), `?events=` (dev builds, solo), cheats "Force car alarm" / "Force stampede".
- **Bots (AC 14).** Bots step out of an active stampede's lane (`laneOut`); they never shoot the car (the timer sets it off).

**Found while building (outside the story, fixed minimally — please review):**

- `bots/botPolicy.ts` rule 2c: "everything in range is behind cover → strafe left" now flips side every 64 input seqs. The 10-wave sim (3 bots, seed 1) stalled in wave 9 forever: all three bots pinned against the bus by their own left strafe, a Bloater behind a barricade, nobody could shoot. The events changed the run's path, which exposed it. Bots only (not the game).

**Fairness rules → tests (brief 3):** F1 `specialEvents.test.ts` / `stampede.test.ts` (the warning first, nothing spawns before it), `eventMarkers.test.ts` (banner + sound; none for a stale start); F2 `schedule.test.ts` (10,000 seeds × 1 and 4 players); F3 `specialEvents.test.ts`; F4 `carAlarm.test.ts` (pistol / shotgun / AR credit the shooter, two shooters → one credit, turret / melee / axe / flame / launcher don't, a zombie in the way doesn't, the timer at exactly 20 s); F5 `carAlarm.test.ts` (round the bus, never inside it; 15.6 m not lured; bitten within 2 m; rushers ignore it; 15 s end) + `events.fuzz.test.ts`; F6 `stampede.test.ts` (in the lane, 5 m/s, from the start edge); F7 `stampede.test.ts` (8 once per Runner per player, barricade untouched); F8 `stampede.test.ts` + `specialEvents.test.ts` (hold, conversion, remaining, rush, `skipWave`); F9 `schedule.test.ts` (candidates per stage × seed masks) + `eventRunSim.test.ts` (never skipped on Downtown, 8 seeds).

**Beat the rule (my attempts):** 1 the schedule in a build phase — not in the schema, events or HUD (only the active event). 2 shooting through a zombie: no; turret / melee / flame / grenade: no; at the car through the bus: the bus stops the shot first → no. 3 two shooters on one tick: one alarm, one credit. 4 inside 15 m but > 2 m from a lured zombie: not bitten (it walks to the car); within 2 m: bitten. 5 luring the last zombies: the rush ignores the alarm and its 15 s end it. 6 standing in the lane: one 8-damage hit per Runner; a barricade wall across the lane: Runners stall, convert after 1 s, the barricade keeps its HP. 7 killing every normal zombie mid-crossing: the wave waits; the converted Runners then count and rush. 8 a stampede at 150 / 170 alive: ≤ 180; with the Behemoth alive: ≤ 140. 9 a woken tab: marker from the state, no late banner (browser, online). 10 replay: same digest through both events. 11 solo (12 Runners, small waves): triggers mid-wave (the tests use solo sizes).

**Mutations (brief 9; each applied, its tests run, reverted):** killed — wave 5 allowed, back-to-back allowed, contact every tick (mask ignored), lure as a straight line (no field), conversion skipped, turret shot counted, wave hold removed, late banner shown, Runners during the warning, a stopped bullet counts, rushers lured, pull radius ignored, mirror drops the lane. Survived first, then killed by new tests: over-cap ignored and "cap ignores the boss" (150 + 30 was exactly the cap: added 170-alive and Behemoth-alive cases with 4 players), event phase not synced (added the `syncState` event-record test).

**Bandwidth (brief 11):** events + record ≤ 3 B/s per client. Worst stampede horde frame (180 in one view) = 28.2 KB/s > 24 KB/s: **decision 6.8 B1 = A** (designer 2026-11-24: accepted until Story 8.10; 150 in view = 23.6 KB/s).

**Perf (brief 12, 16):** headless `?stress=150` 16.0 fps → 15.4 with the stampede warning drawn (−3 %, run noise ±0.5), car alarm ≈ 0; server p99 +0.17 ms (stampede, 174 alive), ≈ 0 (alarm) at load 0.82 (`PERF_ASSERT=1` passes).

**Design observation (no change made):** the main-street lanes are 48 m; at 5 m/s a Runner needs 9.6 s, plus up to 1.5 s of row spawning, so with `runS` 10 most main-street Runners join the wave near the far end instead of leaving the map (on the 32 m cross street ~85 % cross). Keep (they join the wave), or `runS` 12 if the designer wants them gone.

### Notes for the merge (brief 19; every shared file touched)

- `core/world.ts`: `special` (after `boss`), `debug.events` (dev schedule). `core/systems.ts`: `specialEvents: updateSpecialEvents` (NO_SYSTEMS / PREDICTION keep the no-op). `core/worldSnapshot.ts`: `special` + 4 pool arrays.
- `run/runStateMachine.ts`: `updateRun` → `if (updateWaves(world) && !eventHoldsWave(world)) endWave(world)`; `skipWave` → `endSpecialEvent(world, "wave_end")` first. **6.11/6.12:** keep the hold on the wave-end line when adding the vote / endless branches; 6.12 calls `scheduleEndlessEvent(world, wave)` (writes `special.extra`; the trigger reads it like a scheduled entry).
- `waves/waveDirector.ts › updateWaves`: `room = stampedeRunnersAlive(world) > 0 ? 0 : maxAliveNow(world) − aliveCount` (one line).
- `zombies/zombieAi.ts` pass 1: the stampede branch (`stampedeSteer`) and lure steering (`lureSteer`, `standingWithin`) before the target pick; pass 4: `stampedeContact`, no swing / bite / building hit for STAMPEDE. **6.10's survivor** adds itself to the target list in `collectAlivePlayers` / `nearestAlivePlayer` — whether lured zombies go for it within 2 m is 6.10's call.
- `zombies/flowField.ts`: `FlowField.seedBox/seedBoxM`, `PathingState.lure/lureWide/lureBuild`, `requestLureFields` / `dropLureFields`, `updatePathing`'s turn order written as a list (chase, flank, wide, lure, boss — unchanged without the lure; the boss keeps its own clock); `snapshotPathing` + the lure fields.
- `zombies/zombiePool.ts`: `lureTicks`, `stampedeHit`, `stampedeAnchor`, `stampedeTick` (reset on spawn), `removeZombie` (no event, no reward). `zombies/zombieTypes.ts`: `ZOMBIE_STATE.STAMPEDE = 6` (horde nibble; the client draws it as a plain zombie).
- **6.9 supply crate:** the framework ends the active event at its wave's end unless `holdsWave` — a crate that outlives the wave needs `holdsWave` or must live outside `special.active`. `EventModule.update` returns `EventOutcome | null` (review API change).
- `apps/client/src/render/eventArrow.ts` (new) + `scenes/hudLayout.test.ts` (the arrow's block); `bots.json` (`laneMarginM`, `strafeFlipSeqs`), `events.json` (`runS` 12, `sidestepAlongFrac`).
- `apps/client/src/scenes/hudTopLayout.ts` (new, re-review R1: HudScene's top-HUD constants + `layoutHpBlock` / `layoutWaveLine`); `scenes/HudScene.ts` imports its constants from it (values unchanged).
- `combat/firing.ts`: one line after `stoppedAt` (`onSpecialShot` for `building === 0`). **6.9** adds the gas tank in `specialShotTarget` / `onSpecialShot` (`events/specialEvents.ts`), no edit here.
- `core/simEvents.ts`: four `event.*` events (after 6.6's). `net/netEvents.ts`: kinds **55–58** (6.8's block is 55–64: 59–64 free for 6.9/6.10). No money reason added.
- `net/stateView.ts`, `apps/server/src/rooms/schema/RunState.ts` (flat fields after `boss`), `syncState.ts` (+ reset), `apps/client/src/net/fakeRoom.ts`, `lobbyStore.test.ts`: the 7 `event*` fields. **6.9/6.10** append crate / survivor fields after `eventLane`.
- `config/balance.ts` (`EVENT_FORBIDDEN_WAVE`, `crossCheckEvents`), `balanceSchema.ts` (`eventsSchema`), `config/balance/events.json` (new; `deflectLookM` 4 and `lureSeedM` 0.75 added to the story's starting values). Tests that list the balance files by hand gained `events: eventsJson` (aimAssist, melee, firing, swap, balance, zombieAi, waveDirector, spawnPoints tests).
- `map/districtMap.ts` (`StampedeLane`, `EventSpot`, `LANE_DIRS`, `EVENT_SPOT_KINDS`), `loadTiledMap.ts` (optional `events` layer), `placeholderMap.ts`, `tools/maps/buildDowntown.ts` (`eventLanes`, `eventSpots`, the `events` top layer) + regenerated `.tmx` / `.tmj` / shared copy. **Regenerate, never hand-merge.** 6.11's pad is here: spot kind `evac_pad` (appended to `EVENT_SPOT_KINDS`), point `evac_pad` at (24, 15.9) — `HeliView.evacPadOf` finds it. **6.11's `run/endlessEvents.ts › endlessEventCandidates(world, wave)`** should return the kinds with `eventFits(world, kind, wave)`; or 6.12 calls `scheduleEndlessEvent(world, wave)` (never the previous endless kind) and the trigger runs it from `special.extra` — pick one at that merge.
- `bots/botPolicy.ts`: `laneOut` (rule 1b) and the strafe side flip (rule 2c, see "Found while building").
- Fuzz/spot tests use `gameplayDecayMasks` (6.2's rename).
- `waves/spawnPoints.test.ts`: its sims set `debug.events = []` (they test the wave director alone).
- `apps/server`: `RunController` (`events` option), `RunRoom` (`DEV_EVENTS`, ignored in production), `eventInterest.ts` (comment: `event.*` global). New tests `eventBandwidth.test.ts`, `tickCostEvents.test.ts`.
- `apps/client`: `GameScene.ts` (EventView create / update / destroy, the `event.*` branch, `?events=`), `NetSimHost.ts` (`ageS` for `event.triggered` / `phase_changed`, `mirrorSpecialEvent`), `audio/placeholderSfx.ts` (2 keys + the alarm loop), `debug/urlOptions.ts` (`events`), `debug/DevCheats.tsx` (2 buttons).
- `docs/playtests/milestone-1/readability-sheet.md`: items **70–74**.
- `render/darkness/aboveDark.ts` unchanged (the markers use the existing `ABOVE_DARK.marker`).

### Not verified

- A real phone (Mi 11i) FPS and readability; sound by ear (the alarm loop, chirp and rumble are placeholders).
- Online, the ARMED → ALARM change seen on both phones in a browser: the two-tab run (`?lag=150&jitter=20`) showed the marker on both, the woken tab without a late banner, and the end on both, but the idle team wiped before the 20 s timer; the phase change itself is covered by the `syncState` / `eventMarkers` / mirror tests.
- Shooting the car from a real browser (covered by `carAlarm.test.ts` through the real firing path).
- The brief-31 HUD layout test: the event edge arrow is drawn in world space at the view's edge (not a HUD control, nothing pressable), so it is not in that test; the event banner reuses the existing banner line.
- A late Game scene start mid-event in a browser (the marker comes from the room state, like the boss's).

### File List

- `_bmad-output/implementation-artifacts/6-8-special-events-car-alarm-and-stampede.md`
- `_bmad-output/implementation-artifacts/sprint-status.yaml`
- `apps/client/public/assets/maps/downtown.tmj`
- `apps/client/src/audio/placeholderSfx.ts`
- `apps/client/src/debug/DevCheats.tsx`
- `apps/client/src/debug/urlOptions.test.ts`
- `apps/client/src/debug/urlOptions.ts`
- `apps/client/src/net/fakeRoom.ts`
- `apps/client/src/net/lobbyStore.test.ts`
- `apps/client/src/net/mirrorEvent.ts`
- `apps/client/src/render/EventView.ts`
- `apps/client/src/render/city/atlasLayout.test.ts`
- `apps/client/src/render/city/eventArt.ts`
- `apps/client/src/render/eventMarkers.test.ts`
- `apps/client/src/render/eventMarkers.ts`
- `apps/client/src/scenes/GameScene.ts`
- `apps/client/src/sim/NetSimHost.ts`
- `apps/server/src/net/eventInterest.ts`
- `apps/server/src/rooms/RunRoom.ts`
- `apps/server/src/rooms/schema/RunState.ts`
- `apps/server/src/rooms/schema/syncState.test.ts`
- `apps/server/src/rooms/schema/syncState.ts`
- `apps/server/src/run/RunController.ts`
- `apps/server/src/run/eventBandwidth.test.ts`
- `apps/server/src/run/tickCostEvents.test.ts`
- `docs/art/6-8/6-8-568x320-blackout5-car_alarm-armed.png`
- `docs/art/6-8/6-8-568x320-blackout5-stampede-warning.png`
- `docs/art/6-8/6-8-568x320-car_alarm-armed.png`
- `docs/art/6-8/6-8-568x320-car_alarm-edge-arrow.png`
- `docs/art/6-8/6-8-568x320-car_alarm-sounding.png`
- `docs/art/6-8/6-8-568x320-stampede-warning.png`
- `docs/art/6-8/6-8-800x360-blackout5-car_alarm-armed.png`
- `docs/art/6-8/6-8-800x360-blackout5-car_alarm-edge-arrow.png`
- `docs/art/6-8/6-8-800x360-blackout5-car_alarm-sounding.png`
- `docs/art/6-8/6-8-800x360-blackout5-stampede-running.png`
- `docs/art/6-8/6-8-800x360-blackout5-stampede-warning.png`
- `docs/art/6-8/6-8-800x360-car_alarm-armed.png`
- `docs/art/6-8/6-8-800x360-car_alarm-edge-arrow.png`
- `docs/art/6-8/6-8-800x360-car_alarm-sounding.png`
- `docs/art/6-8/6-8-800x360-stampede-running.png`
- `docs/art/6-8/6-8-800x360-stampede-warning.png`
- `docs/perf/epic-6-events.md`
- `docs/playtests/milestone-1/readability-sheet.md`
- `packages/shared/src/bots/botPolicy.ts`
- `packages/shared/src/combat/aimAssist.test.ts`
- `packages/shared/src/combat/firing.test.ts`
- `packages/shared/src/combat/firing.ts`
- `packages/shared/src/combat/melee.test.ts`
- `packages/shared/src/combat/swap.test.ts`
- `packages/shared/src/config/balance.test.ts`
- `packages/shared/src/config/balance.ts`
- `packages/shared/src/config/balance/events.json`
- `packages/shared/src/config/balanceSchema.ts`
- `packages/shared/src/core/simEvents.ts`
- `packages/shared/src/core/systems.ts`
- `packages/shared/src/core/world.ts`
- `packages/shared/src/core/worldSnapshot.ts`
- `packages/shared/src/events/carAlarm.test.ts`
- `packages/shared/src/events/carAlarm.ts`
- `packages/shared/src/events/common.ts`
- `packages/shared/src/events/devEvents.test.ts`
- `packages/shared/src/events/devEvents.ts`
- `packages/shared/src/events/eventRunSim.test.ts`
- `packages/shared/src/events/eventState.ts`
- `packages/shared/src/events/events.fuzz.test.ts`
- `packages/shared/src/events/registry.ts`
- `packages/shared/src/events/schedule.test.ts`
- `packages/shared/src/events/schedule.ts`
- `packages/shared/src/events/specialEvents.test.ts`
- `packages/shared/src/events/specialEvents.ts`
- `packages/shared/src/events/spots.test.ts`
- `packages/shared/src/events/stampede.test.ts`
- `packages/shared/src/events/stampede.ts`
- `packages/shared/src/events/testEvents.ts`
- `packages/shared/src/index.ts`
- `packages/shared/src/map/data/downtown.tmj.json`
- `packages/shared/src/map/districtMap.ts`
- `packages/shared/src/map/loadTiledMap.test.ts`
- `packages/shared/src/map/loadTiledMap.ts`
- `packages/shared/src/map/placeholderMap.ts`
- `packages/shared/src/net/netEvents.test.ts`
- `packages/shared/src/net/netEvents.ts`
- `packages/shared/src/net/stateView.ts`
- `packages/shared/src/run/runStateMachine.ts`
- `packages/shared/src/waves/spawnPoints.test.ts`
- `packages/shared/src/waves/waveDirector.test.ts`
- `packages/shared/src/waves/waveDirector.ts`
- `packages/shared/src/zombies/flowField.ts`
- `packages/shared/src/zombies/zombieAi.test.ts`
- `packages/shared/src/zombies/zombieAi.ts`
- `packages/shared/src/zombies/zombiePool.ts`
- `packages/shared/src/zombies/zombieTypes.ts`
- `tools/maps/buildDowntown.ts`
- `tools/maps/downtown.tmx`

## Senior Developer Review (AI)

**Reviewer:** fresh-agent reviewer (own cloud session), 2026-11-24. **Commit reviewed:** `9743f51` (story-6-8 merged with master; diff `da82847...9743f51`). **Method:** gds-code-review layers (Blind Hunter on the diff, Edge Case Hunter on boundaries/hold/cap, Acceptance Auditor on F1–F9, AC 1–14, D1–D11, B1 and brief lines 1–32), plus beat-the-rule attempts and one mutation per new test. Code not changed; mutations and probe tests were local and reverted.

**Ran:** `npm run typecheck` (clean); `npx vitest run src/events src/bots src/zombies/zombieAi.test.ts` (11 files, 81 tests pass); server `src/run/eventBandwidth.test.ts`, `src/rooms/schema/syncState.test.ts` (23 pass); client `src/render/eventMarkers.test.ts`; shared `src/net/netEvents.test.ts`, `src/events/eventRunSim.test.ts` (under mutation); two probe sims (`runHeadless`, god and mortal bots × 1–4 players × seeds 1–8, with the 2c strafe flip reverted). The full gate was not run (designer speed-up).

**Outcome: Changes requested (0 high, 2 medium, 8 low).** The event core is sound: with no event active, zombieAi/flowField behave bit-for-bit as before (the new turn order matches the old one in every flank/wide/boss combination; the stampede and lure branches are gated by state/`lureTicks`). The hold always ends (≤ 13 s; ≤ 15 s with 6.8 B2 runS 12, re-review R4). The over-cap reads `maxAliveNow`. The schedule comes only from `events`. The shot hook is correct.

### Findings

| # | Sev | Title | Where | Failure scenario | Suggested fix |
| --- | --- | --- | --- | --- | --- |
| M1 | **medium** (pre-existing, masked) | The bot fix hides a real AI livelock: a rushing Bloater shuttles forever in a barricade pocket | `zombies/zombieAi.ts` pass 1 field steering + pass 4 H1 safety net (L447); `bots/botPolicy.ts:272` | Reproduced with the 2c flip reverted: 4 god bots, seed 4, wave 8, tick ≈ 9770. The last zombie, a Bloater in RUSH at (21.13, 21.25), moves ±0.09 m every 10 ticks (v = ±0.9 m/s) for > 100 s. It sits 0.84 m from the barricade at [21.5–23.5, 20–20.5], below a 0.5 m diagonal gap to the barricade at [19–21, 19.5–20]. It never touches a building, so the H1 net (`touchingBuilding`, needs contact) never fires and it never swells. The wave never ends while the team camps in the pocket (barricades west, south and north, their bullets stopped by the barricades). No event was active, so this is the pre-6.8 wide-field code. Real players can hit it (camp in a barricade box; the last Bloater never comes). They get out only by leaving cover, and a stuck "1 remaining" reads as a bug. The flip is fine as bot behaviour, but the 10-wave sim no longer catches the trap. | Separate story/fix (not 6.8 scope): give the wide field hysteresis (keep the chosen next cell until reached), or extend the H1 net to "following a field, < 0.25 m progress in 2 s → the field's next blocking building is the target" for wide bodies (5.7 review warned crowds look stuck, so key it to the field's next cell holding a building, not to touch). Add a regression test from this layout (barricades and positions above, Downtown, wave-8 stage/variants of seed 4). Keep the bot flip. |
| M2 | **medium** (brief 31) | Event edge arrows are not in the one HUD layout test | `render/EventView.ts`; story "Not verified" | Brief 31 names "markers' screen-edge arrows" explicitly. The arrow is drawn at the view's edge with a margin, where at 568×320 the move stick, fire button and action bar sit. Nobody checked that it doesn't sit under a control or within 48 px of the survivor. | Put the arrow's screen rect (the `eventMarkerLook` edge at each screen edge) into the layout test as a non-pressable item, or get a designer exemption in the decisions log (like 6.3 B1 / 6.11 B1). |
| L1 | low | No test that an event waits while nobody stands (DD7) | `events/specialEvents.ts:95` | Mutation M2 (drop `anyoneStanding`) survived. Without the guard, `start` → `teamCentre` false → the entry is **skipped** for the run (F9 log, `event.skipped`), not delayed. | A test: everyone downed at the trigger point → no trigger, no skip; one stands up → triggers. |
| L2 | low | D11 test downs the player after the size was fixed | `events/stampede.test.ts:81` | Mutation M7 (count standing players only) survived. `p2` is downed after `started()`, which already computed `toSpawn`. | Down `p2` before `startNext`/the first tick. |
| L3 | low | "Normal spawns pause while Runners run" is not asserted | `events/stampede.test.ts:147`; `waves/waveDirector.ts:350` | Mutation M8 (remove the pause) survived. The test fills 150 by hand with `queued` 0, so the wave director never had anything to spawn. | Give the wave `queued > 0`, then assert `queued` doesn't drop while `stampede.alive > 0`. |
| L4 | low | The WARNING-phase hold is untested | `events/stampede.ts:403` (`holdsWave`) | Mutation M9 (hold only while RUNNING) survived. Kill the last zombie during the 3 s warning and the wave would end (then `wave_end` cancels it). D6 says warning and crossing both hold. | Add the warning case to the "waits" test. |
| L5 | low | D1's 8 m minimum is untested | `events/carAlarm.test.ts:56` | Mutation M3 (`min2 = 0`) survived. No car in the tested team spots is closer than 8 m, so "never one right next to you" is unproven. | Put the team centre ≤ 8 m from a candidate car and assert it's never picked over 200 seeds (unless it's the only one). |
| L6 | low | "Lured at any tick, stays lured" is untested; a Runner held by a bear trap that hits a barricade (D5) is untested | `carAlarm.ts:136`; `zombieAi.ts:441` | Mutations M16 (lure drops when the zombie leaves 15 m) and M12 (remove `!stampede` from the held-building branch) survived. The code is right today. | Two small tests: push a lured zombie out of 15 m → still lured; a stampede Runner in a bear trap next to a barricade → barricade HP unchanged. |
| L7 | low | The lure fields take 14 ticks (0.7 s) to build; a shot in that window makes lured zombies walk straight at the car | `zombieAi.ts lureSteer` fallback; `flowField.ts advanceLure` | Measured: 4 active fields → lure ready 14 ticks after arming. A player who shoots the car at once sends zombies behind the bus into the bus (push-out holds them) for up to 0.7 s, against DD3 "never straight through cover". Short-lived and self-correcting. | Accept and note it, or while `lureBuild !== 3` steer by the chase field (they keep doing what they did) instead of straight. |
| L8 | low | An inserted log line steals an `else if` in RunRoom | `apps/server/src/rooms/RunRoom.ts:722-723` | `if (devEvents !== null) warn("dev_events")` sits between `if (bossPick.waves…)` and its `else if (bossPick.ignored…)`. With `DEV_EVENTS` set, a bad `DEV_BOSS_WAVES` is no longer reported (`dev_boss_waves_ignored`). Dev only. | Move the `dev_events` line after the boss `else if`. |

**Nits (no action needed):** `SIDESTEP_ALONG` 0.25 (stampede.ts), `EDGE_EPS_M`, `MERGE_GAP_M` and the bots' `LANE_MARGIN_M` / `STRAFE_FLIP_SEQS` are inline (brief 10). `SIDESTEP_ALONG` is a tuning number and could go in `events.json › stampede`. `bandBox` takes every box in the along-window across the whole map width, capped at `MAX_BAND` 64 and silently dropped beyond that. Filtering by the lane's lateral range ± `deflectLookM` would make it cheaper and safer. `mirrorSpecialEvent` runs `cover.find` (a closure) every frame if no car matches the marker; that never happens on Downtown.

### API notes for 6.9 / 6.10 (EventModule in `events/common.ts`) and 6.11 / 6.12

- `update()` returns only "over" → the framework ends with `"done"`. 6.10's survivor needs `"failed"`: it must call `endSpecialEvent(world, "failed")` from inside `update` and then return false (it works because `endSpecialEvent` clears the slot, but it's re-entrant and easy to get wrong). Suggest `update` return `EventOutcome | null`.
- The framework ends every active event at its wave's end (`wave_end`) unless `holdsWave`. 6.9's supply crate (taken by standing players) can't outlive the wave unless 6.9 holds the wave or keeps the crate outside `special.active`. Decide that in 6.9.
- `specialShotTarget` / `onSpecialShot` are hard-wired to the car (6.9 edits them; that's noted). `lureSteer` reads `special.carAlarm` directly, so any second "lure" event needs its own box.
- 6.11/6.12: keep `&& !eventHoldsWave(world)` on the `endWave` line of `updateRun` (the vote/endless branches live in `endWave`, no conflict). Endless uses the single `special.extra` slot, shared with the dev `forceEvent`.

### Beat the rule (attempts and results)

1. Schedule in the build phase (D8): not in the schema (`event*` = active only), no `event.*` before the trigger, mirror copies the active record only. Solo's own World holds it (dev tools only). **Holds.**
2. Shoot the armed car through a zombie / barricade / the bus: the hook takes `stoppedAt` (zombie hit or `blockT`), and the car's entry `t` must be ≤ it, so these don't count. Turret (`building > 0`), melee, flame, grenade/launcher never reach the projectile hook. A pellet or AR bullet counts and credits its owner (`phase_changed.playerId`, `log.alarmShotBy`). A piercing round that kills a zombie and flies on reaches the car and counts, which is consistent with F4 ("stopped earlier"). **Holds.**
3. Two shooters on one tick: the first projectile in pool order sets ALARM; `armedCarBox` is then false, so one credit and one phase change. **Holds.**
4. Inside 15 m, > 2 m from lured zombies: not chased. Brute `gapReachM` 1.8 < 2 m, Spitters don't spit while lure-walking, Bloaters only on touch. Within 2 m: bitten. **Holds.**
5. Lure the last zombies to stall the wave: rushers are never lured (cleared every alarm tick), the alarm never holds, 15 s limit. **Holds.**
6. Stand in the lane: one 8-damage hit per Runner per player (slot mask). A barricade line across it: Runners side-step, then convert after 1 s and become normal Runners (which then attack it as normal zombies). The barricade is untouched while they're STAMPEDE. **Holds.** Design note: Runners don't chase and pay the normal Runner reward, so a team beside the lane farms up to 30 safe kills. That's intended by AC 9.
7. Kill every normal zombie mid-crossing: held. The converted Runners count in `remaining` and rush at ≤ 5. **Holds.** (Warning-phase hold: correct but untested, L4.)
8. Make the hold last forever: stuck Runners (D7: 1 s), all Runners blocked at spawn (`spawnRow` skips them; the end at `runS` still comes), everyone downed (the director stops, the stampede still ends at 15 s; a wipe → Results ends it `wave_end`), boss wave (events never in 10; endless only without a Behemoth), `skipWave` (ends the event and removes the Runners first), dev pause (ticks still run). **Hold is always ≤ warning + run = 3 + 12 = 15 s** (re-review R4: `stampede.test` asserts exactly 300 ticks).
9. Over-cap: 150 → ≤ 180, 170 → ≤ 180, Behemoth 110 → ≤ 140 (`maxAliveNow` + 30). Normal spawns resume when `alive` = 0 and `room` > 0. **Holds** (pause untested, L3).
10. Bandwidth B1: the bound test really reaches the worst case. Mutating its 28.5 KB/s bound to 28.1 fails it, so ~180 in view and ≤ 28.5 KB/s are asserted. 150 in view ≤ 24 KB/s. **Holds (B1 = A).**
11. Replay/determinism: `special` (schedule, active, car, stampede, log) and the lure fields are in `snapshotWorld`/`snapshotPathing`. Same-seed digest test through both events. Player Map iteration is insertion-ordered. **Holds.**
12. Not attempted in a browser (woken tab, lag 150, late scene start). The builder's two-tab run and the mirror/`ageS` tests cover it.

### Mutation results (brief 9; each applied to production code, the named tests run, reverted)

Killed (good): M1 startFraction outside [0.2, 0.6] (schedule.test). M4 lure ignores the 2 m break (carAlarm.test). M5 no shooter credit on `phase_changed` (carAlarm.test). M6 no stuck conversion (stampede.test). M10 far-edge exits convert instead of leaving (stampede, spots). M11 no side-step (stampede, spots). M13 no conversion at the 10 s end (stampede.test). M14 burning cars stay candidates (schedule F9). M15 lanes ignore `maxStage` (spots.test). M17 `eventLane` not synced (syncState.test). M19 `phase_changed` credit dropped on decode (netEvents.test). M20 the dev parser accepts wave 0 (devEvents.test). M21 Runners spawn into boxes (events.fuzz, spots). M22 the stampede never triggers (eventRunSim). M23 bandwidth bound tightened to 28.1 KB/s (eventBandwidth: proves the 180 case is reached).

Survived (bad): M2 no standing check (L1). M3 8 m minimum dropped (L5). M7 D11 standing-only count (L2). M8 no spawn pause (L3). M9 the warning doesn't hold (L4). M12 a held Runner hits a building (L6). M16 lure drops outside 15 m (L6). Equivalent (not gaps): M18 countdown from `startTick` (the arc is drawn only in ARMED, where `phaseTick == startTick`); M24 over-cap +20 in the bandwidth test (4 players send only 30, so the cap is never reached there; stampede.test owns the cap).

### Brief lines 1–32 and the decisions

Lines 2 (every copy listed and touched), 3 (F1–F9 each tested), 5 (the car is cover; the hook uses `stoppedAt`), 6 (per-Runner mask), 7 (`events.fuzz` + `spots` lane/spot tests; lure/boss fields on their own turns), 8 (stream `events` only; digest), 9 (sims assert triggers; M22), 10 (ticks, JSON; nits above), 11 (reliable events + on-change record, B1), 14 (mirror from the state, `ageS`), 15 (10-wave sim all cleared), 18 (`DEV_EVENTS` / `?events=` / cheats), 19 (merge notes), 20 (`addGeneratedTexture`), 22 (`maxAliveNow` + 30), 23 (banner+sound+marker; schedule; lever), 24 (amber markers in `ABOVE_DARK.marker`; screenshots in `docs/art/6-8`), 25 (one slot, fixed arrays; endless hook bounded), 27 (no 5.x UI touched), 28 (hold, skip and wipe are tested transitions), 29–32 (hand-back, merged tree): OK. Line 31: M2 above. Lines 12/16 (FPS / p99) are recorded by the builder; not re-run. D1–D11 and 6.8 B1 match the code (D1 test gap L5; D11 test gap L2).


### Review fixes (builder, 2026-11-24, after merging `review-6-8` e0e56b1 and master b19eea7)

| # | Fix | Test / evidence |
| --- | --- | --- |
| **6.8 B2** (designer) [BEHAVIOUR] | `events.json stampede.runS` 10 → **12**: the stampede crosses and leaves. | `spots.test.ts` (stages 1–5 × gameplay masks): **main street 1622/1980 cross (81.9 %)**, **cross street 982/1020 (96.3 %)**, stuck-converted 46/3000 (1.5 %); asserted main > 75 %, cross > 80 %, stuck < 5 %. The B1 bandwidth bound test still passes (≤ 28.5 KB/s). |
| **API** [BEHAVIOUR for 6.9] | `EventModule.update(world): EventOutcome \| null` — null keeps going, an outcome ends it with that outcome (the framework calls `end` and emits `event.ended`); no re-entrant `endSpecialEvent`. Car alarm / stampede / stubs return `"done"`. Pushed at 2c5b072 and sent to the 6.9+6.10 builder directly. | `specialEvents.test.ts` ("a module returning failed ends with outcome failed"). |
| M1 | Not fixed here (pre-existing wide-body stall; main session: separate story after 6.8). The bot strafe flip stays. | — |
| M2 | The event edge arrow is placed in SCREEN px (`render/eventArrow.ts › placeEventArrow`): on the safe-area rectangle shrunk by half its size + 6 px, sliding along the edge off the wave controls (☰, swap, quick-use from the same layout functions HudScene uses); a fixed 34 CSS px size. Added to the one HUD layout test as non-pressable: at every 2° at 568 × 320 and 640 × 360 (insets 44/21) inside the safe area, off every wave control, ≥ 48 px from the survivor. | `hudLayout.test.ts` (new block; removing the slide fails it at both sizes). Browser check at 568 × 320: arrows at the edges, clear of ☰ and the buttons. |
| L1 | DD7: everyone downed at the trigger point → no trigger, not skipped; one stands → it starts. | `specialEvents.test.ts` (kills mutation M2). |
| L2 | D11 test downs p2 before the size is fixed. | `stampede.test.ts` (kills M7). |
| L3 | Spawns pause: `queued` holds while Runners run, then resumes. | `stampede.test.ts` (kills M8). |
| L4 | The warning holds the wave (last zombie dies in the 3 s warning). | `specialEvents.test.ts` (kills M9). |
| L5 | D1 8 m minimum: a car ≤ 8 m from the team is never armed (200 seeds). | `carAlarm.test.ts` (kills M3). |
| L6 | Lured stays lured outside 15 m; a held stampede Runner next to a barricade leaves it at full HP. | `carAlarm.test.ts`, `stampede.test.ts` (kill M16, M12). |
| L7 [BEHAVIOUR] | A lured zombie walks the lure only once both lure fields are built (`lureBuild === LURE_READY`, ≈ 0.7 s); until then it keeps chasing by the chase field (never straight into the bus). | `carAlarm.test.ts` (sounding before the fields: still chasing west, then to the car; the mutation fails it). |
| L8 | `dev_events` log line moved after the boss's `else if` in `RunRoom`. | read. |
| Nits | `sidestepAlongFrac` → `events.json`; `laneMarginM`, `strafeFlipSeqs` → `bots.json`; `EDGE_EPS_M` / `MERGE_GAP_M` documented geometry epsilons; `bandBox` skips boxes beside the lane's width; `mirrorSpecialEvent` looks the car up once per marker position (per mirror World). | tests above. |

### Re-review (AI) (fresh agent, 2026-11-25, narrow: the review-fix commits e0e56b1..5b307e0)

**Outcome: approve with notes (0 high, 1 medium, 3 low).** The fixes hold: B2, the update-outcome API, L1–L8. M2 keeps the arrow off every pressable control, but the arrow still covers the HP bar and the wave line (R1).

**Run:** `npm run typecheck` (clean). Unchanged: `spots` (main 81.9 %, cross 96.3 %, stuck 46/3000), `stampede`, `carAlarm`, `specialEvents` (36/36), `hudLayout` (7/7), server `eventBandwidth` (worst frame 28.2 KB/s, 150 in view 23.6 KB/s). Throw-away probe tests, deleted afterwards.

| # | Sev | Where | Scenario | Fix |
| --- | --- | --- | --- | --- |
| R1 | medium | `apps/client/src/render/eventArrow.ts:31` (`waveControlRects`), `render/EventView.ts:118` | The arrow avoids only ☰, swap and quick-use. Probe at 1° steps with HudScene's constants: the 34 px arrow overlaps the HP bar block (HudScene `drawHealth`, `HP_MARGIN` 16 + inset, 200 × 16 + the HP text) for **65°** of directions at 568 × 320 (52° at 640 × 360; 31° at 844 × 390; 14° at 1280 × 720). It overlaps the "Wave n · Zombies m" line (top centre, `WAVE_TOP_PX` 12, about 220 px wide) for **85°** (77° at 640 × 360). HudScene draws above GameScene, so the arrow sits under or across the HP readout and the wave line. For example, an event up-left of the survivor puts the arrow at (67, 23), right on the HP bar's left end. Brief 31 covers only pressable controls, so this breaks no rule, but it hurts the "readable" part of D10. | Export the HP-block and wave-line rects from HudScene's constants (or a small `layoutHpBlock` / `layoutWaveLine`), add them to `avoid`, and add them to the HUD layout test's arrow block as keep-off rects. |
| R2 | low | `render/eventArrow.ts:58` (`placeEventArrow` on-screen test) | The arrow now shows only when the event point is off the canvas. Before, it also showed within `EDGE_MARGIN_M` 1.2 m of the edge. An event point that is on the canvas but in the safe-area inset (for example sx = 20 with a 44 px notch inset) or under ☰ / HP gets no arrow, and its pin is hidden. | Count a point outside the safe rect (or inside an avoid rect) as off screen. |
| R3 | low | `scenes/hudLayout.test.ts:181` | The test box is 34 px (half 17). The drawn tip reaches about **20.7 px** from the arrow centre along the axes (disc 0.7 × 34, tip at 0.62 × disc, half-size 0.25 × disc). Placement is still safe because the 6 px pad gives half = 23, but the test asserts on a box smaller than what is drawn. A smaller pad would pass the test and still let the tip overlap a control. | Test with the drawn extent (size/2 + tip overhang), or make `EVENT_ARROW_CSS_PX` the true outer extent. |
| R4 | low (docs) | this file, AC 9 + the JSON block (`runS 10`); the review's "the hold always ends (≤ 13 s)"; decisions 6.8 B1 ("28.2 KB/s for ≤ 13 s") | With B2 the hold is 3 + 12 = **15.00 s** (probe: 300 ticks max over 20 seeds × 4 players), and the over-budget horde window is up to 12 s of crossing. The promise text is stale. Nothing tests the duration (eventBandwidth checks only the rate). | Update AC 9 / JSON to 12 and the hold to ≤ 15 s, and note in B1 that the window is now the 12 s crossing. |

**Exploit attempts:**

1. **B2 hold.** Measured the active stampede over 20 seeds × 4 players: exactly 300 ticks (15.00 s), never longer. The hold is `kind === STAMPEDE`, and update ends the event at `runS`. Worst horde frame unchanged (28.2 KB/s, 30 over-cap). Main-street crossing is 81.9 % against the 75 % bar (about 7 points of margin), so 18 % still join the wave. B2's "crosses and leaves" is mostly true. **Holds.**
2. **Double end.** The `EventBus` queues and delivers at flush, and `end()` does not re-enter. `endSpecialEvent` clears `kind` only after `end()`, but nothing inside `end()` reaches it. `skipWave` one tick before `runS` runs out gives a single `wave_end`; `skipWave` after a `done` gives no second `event.ended`. Car alarm and stampede each end once with `"done"`. **Holds.**
3. **L7.** Car sounded before the fields were built, 12 zombies (walkers + brutes) round `street_car_east`: no zombie entered a solid during the 10-tick build window or after. All 12 were lured and gathered within 5.7 m of the car. Same trace on two runs per seed (1, 3, 9). `lureBuild` is in `snapshotWorld`. **Holds.**
4. **M2.** At 1° steps, plus points just off every edge, at 568 × 320, 640 × 360, 844 × 390, 390 × 844 and 1280 × 720: the arrow never touched ☰, swap or quick-use. **Holds.** It does cover the HP bar and the wave line (R1). No per-frame allocation: `waveControlRects` reuses `this.controls` and the right-buttons scratch, and the insets are copied on create and resize only.

**Mutations (each applied, the named test run, reverted):**

- Killed: L1 drop `anyoneStanding`; L2 count standing only; L3 drop the spawn pause; L4 hold only while RUNNING; L5 `min2 = 0`; L6b drop `!stampede` in the held-building branch; L7 drop `lureBuild === LURE_READY`; M2 no slide pass; M2 pad −8 px.
- L6a in its first form (delete the sticky refresh branch) **survived, but it is equivalent**: zombieAi counts `lureTicks` down every tick, so the stale value ends with the alarm anyway. The real mutation ("drop the lure outside 15 m", `lureTicks = inside ? ticksLeft : 0`) is killed.

### Re-review fixes (builder, 2026-11-25, after merging `rereview-6-8` 8a580ff; master unchanged at the time)

| # | Fix | Test |
| --- | --- | --- |
| R1 [BEHAVIOUR, readability] | New `scenes/hudTopLayout.ts`: HudScene's top-HUD constants (values unchanged) plus `layoutHpBlock` / `layoutWaveLine`. HudScene imports them. `waveControlRects` now returns 5 rects (☰, swap, quick-use, HP block, wave line). The slide pass in `placeEventArrow` could oscillate between the HP block and the wave line at 640 × 360. It is replaced by a walk along the inner rect's perimeter, both ways from the ray's hit point in 1 px (× k) steps, to the nearest spot clear of every rect. This keeps the arrow as close as possible to the true direction. | `hudLayout.test`: at every 1° for each size, the drawn arrow stays off the HP block and the wave line (keep-off rects) as well as every wave control. |
| R2 | The point counts as on screen only if it is inside the safe rect (insets × k) and under no avoid rect. Otherwise it gets an arrow. | `hudLayout.test`: centre → no arrow; inside the left inset → arrow; under the HP block → arrow. |
| R3 | `EVENT_ARROW_DISC_FRAC` / `TIP_FRAC` / `TIP_OFFSET` and `eventArrowDrawnRect` are exported. EventView draws with the same constants. | `hudLayout.test` asserts on the drawn disc ∪ tip box, not the 34 px box. |
| R4 | AC 9, F8, the JSON block → `runS` 12; the hold is ≤ 3 + 12 = 15 s (review text, exploit list); decisions 6.8 B1 → "≤ 15 s (the over-budget window is the ≤ 12 s crossing)". | `stampede.test`: 5 seeds hold the wave for exactly `ticksFor(warningS) + ticksFor(runS)` = 300 ticks (≤ 15 s), then release. |

### Merge of 6.11 + 6.12 (master 739eb2c, 2026-11-25)

- Conflicts resolved by keeping both sides: RunState schema, `RUN_STATE_FIELDS` and the fixtures list 6.8's 7 `event*` fields, then `voteTicksLeft` / `endless`; `PlayerState.vote` stays last. NET_EVENT_KIND: 55–58 (6.8), then 65–67 (6.11). GameScene creates, updates and destroys EventView and HeliView/vote side by side. The readability sheet has 70–74, then 80–85.
- `updateRun` keeps `if (updateWaves(world) && !eventHoldsWave(world)) endWave(world)` after 6.11's vote branch. `skipWave` ends the event first.
- **One endless scheduler (6.12's).** `run/endlessEvents.ts › endlessEventCandidates` returns every kind whose `eventFits` passes for the wave (reused array). 6.8's `scheduleEndlessEvent` and `special.lastEndlessKind` are removed, so 6.12's `run.lastEndlessEvent` is the only no-repeat. `startBuild` calls 6.12's `scheduleEndlessEvent`, then the new `events/schedule.ts › armEndlessEvent`, which writes `run.endlessEvent` into `special.extra` for the coming wave with a start fraction (stream `events`). It then triggers like a scheduled entry.
- HeliView `evacPadOf` reads the typed `map.eventSpots` (`kind === "evac_pad"`: Downtown (24, 15.9)).
- Tests:
  - `schedule.test`: the candidates are the kinds that pass `eventFits`. Over 6 seeds through `startBuild` → wave 12 the picked car alarm or stampede triggers, the odd wave 13 gets none, and wave 14 triggers the other kind.
  - `endless.test`: the 6.12 hook test now expects a pick in wave 12.
  - `HeliView.test`: the pad is at (24, 15.9).

### Re-review 2 (AI) (fresh agent, 2026-11-25, narrow: re-review fixes 8a580ff..b12187c and the merge of master 739eb2c, at 9bb6e65)

**Outcome: approve with notes (0 high, 1 medium, 3 low, 1 nit).** No overlap anywhere, the merge holds, endless events behave. The perimeter walk, though, can put the arrow far from the event's direction for up-left events, and it can jump across the screen.

**Run:** `npm run typecheck` (clean); `hudLayout.test` (8/8), `schedule.test` endless blocks, `endless.test` (10/10); throw-away probes (deleted).

| # | Sev | Where | Scenario | Fix |
| --- | --- | --- | --- | --- |
| RR1 | medium | `apps/client/src/render/eventArrow.ts:85` (perimeter walk) | At 568 × 320 the inflated HP block and wave line block the whole top edge from L (67) to x ≈ 427, and the left edge down to y ≈ 102. Up-left events walk around them. Sweep at 0.1°: the error between the arrow's bearing from the centre and the true bearing is up to **75.6°** (568 × 320), 73.5° (640 × 360), 83° (800 × 360), 79.7° (844 × 390, also at k = 3), 32° (390 × 844). More than 30° off for **61.5° of directions** at 568 × 320 (55° at 640 × 360 and 844 × 390). At the walk's tie point it **teleports**: 240.6° → (67, 102) and 240.8° → (427, 23), a 369 px jump (404–501 px at the other landscape sizes). An event near that bearing, with the survivor moving, flips the arrow between the left edge and the top-right every frame. The tip still rotates to the true angle, so at (427, 23) it points down-left across the HUD. Nothing overlaps (0 overlaps, 0 outside the safe area, 0 within 48 px, at every size), so no brief-31 rule breaks, but the readability goal of D10 (and R1's own intent, "as close as possible to the true direction") does not hold. | Don't walk around the top HUD band. Lower the inner rect's top edge to the band's bottom + half over the band's x span (a notched perimeter), so the ray hits just under the HP block or wave line. Add hysteresis (keep the previous spot unless the new one is several px nearer). Test the bearing error (for example ≤ 30°) and the jump between neighbouring 1° steps. |
| RR2 | low | `apps/client/src/scenes/hudTopLayout.ts:15` (`WAVE_LINE_RESERVE_CSS_PX` 240) | The reserve was sized for "Wave 10 · Zombies 400" (195 px). The 6.12 endless line is wider: Chromium system-ui 16 px measures "Wave 13 · Endless · Zombies 300" at **248 px** and "Wave 25 · Endless · Zombies 1200" at 258 px, plus stroke. The arrow can cover about 4–9 px at each end of the line. | Reserve 280 px (or measure the text in HudScene and pass the width). |
| RR3 | low | `hudTopLayout.ts:37` (`layoutHpBlock`) | The block is 204 px wide: the bar only. The HP text's "Burning" / "Acid" suffix and the 5.11 gear icons (HudScene `drawGear`, beside the HP text, 24 + 4 px each, up to 5) go further right. With 5 gear items + "Burning" the row ends at x ≈ 306, against the block's right edge at 218. The arrow can sit on gear icons. | Widen the block to the widest HP row (text + 5 icons), or keep it in step with `drawGear`. |
| RR4 | low (dev) | `packages/shared/src/events/schedule.ts:112` (`armEndlessEvent`) | `forceEvent(stampede)` during endless wave 11 sets extra = stampede @ 12. `endWave` → `startBuild` → `armEndlessEvent` then overwrites it with the endless pick (car_alarm @ 12), so the forced event is lost. A force during the build works, as documented ("after this"). `run.lastEndlessEvent` also records the pick even when a force replaces it or it is skipped. | Don't arm over an un-done extra for the same wave, or document "force in the build only". |
| nit | — | `apps/client/src/net/fakeRoom.ts:76` | The fake room lists `voteTicksLeft` / `endless` before the `event*` fields. It is a plain object, so this doesn't affect the wire format, but it differs from RunState and `RUN_STATE_FIELDS`. | Reorder for consistency. |

**Exploit attempts:**

1. **Arrow (R1–R3).** 3600 directions × 9 layouts (568 × 320, 640 × 360, 800 × 360, 844 × 390 at k 1 and 3, no-inset 568 × 320, 390 × 844, 360 × 640, 1280 × 720): no overlap with ☰, swap, quick-use, the HP block or the wave line; never outside the safe rect; never within 48 px of the survivor. Bearing error and jumps: RR1. HudScene's values are unchanged (16 / 200 / 16 / 14 / 16 / 4 / 1.3 / 12 / 16, same draw formulas). No per-frame allocation (avoid rects and the scratch are reused). **Holds, except RR1–RR3.**
2. **Merge, updateRun.** The vote branch returns before the hold check. `endWave` → `openEvacVote` → `specialEvents` (after `waves`) sees phase "vote" and ends any active event with "wave_end" the same tick, so no event runs during the vote. Events stay off evac waves: the run schedule uses waves 3–8 only, and endless evac waves are Behemoth waves, which get no endless event. Only a dev `forceEvent` stampede on wave 10 can delay the vote, and by at most the 15 s hold. `skipWave` ends the event first. Schema order matches across RunState, `RUN_STATE_FIELDS`, syncState and stateView (event*, then voteTicksLeft / endless; `PlayerState.vote` last). NET_EVENT_KIND 55–58 and 65–67, no reuse. **Holds.**
3. **Endless events.** 3 seeds × 22 endless waves (11 → 32, Stay at each vote), stepped: triggers only on 12, 14, 16, 18, 22, 24, 26, 28, 32 (never 20 or 30, the Behemoth waves; never odd), car alarm / stampede alternating, never the same twice in a row. The same seed gives an identical event trace twice (determinism). The log stays fixed-size (Int32Array counters, triggered 9 / skipped 2). No candidate → "" (`pickEndlessEvent([])`). A wipe mid car alarm in wave 12 → Results "lost", event cleared. forceEvent: RR4. **Holds.**
4. **HeliView pad.** `evac_pad` = (24, 15.9) on the 48 × 32 m map, no solid within 3 m. **Holds.**

**Mutations (each applied, the named test run, reverted). All killed:**

- `endlessEventCandidates` ignores `eventFits` → schedule.test 7 failed.
- `pickEndlessEvent` ignores `previous` (no-repeat) → schedule.test 4 of 6 seeds failed.
- `scheduleEndlessEvent` gets empty candidates → endless.test wave-12 pick failed.
- `startBuild` without `armEndlessEvent` → schedule.test 6 failed.
- `isEndlessEventWave` without the boss check → endless.test 3 failed.
- `waveControlRects` with a zero-width HP block → hudLayout 2 failed; the same with the wave line → 2 failed.
- On-screen test without `underAny` (R2) → hudLayout 2 failed.

### Re-review 2 fixes (builder, 2026-11-25, after merging `rereview2-6-8` d136cb3 and master 5bdb847)

| # | Fix | Test / measured |
| --- | --- | --- |
| RR1 [BEHAVIOUR] | `placeEventArrow` no longer walks the perimeter. The arrow sits on the bearing's own ray, at its exit from a notched safe rect: wide HUD bands along an edge (the HP block, the wave line: span ≥ 2 × depth) are cut out as notches, chamfered so the region is star-shaped from the centre, and the exit is found by bisection. The compact controls (☰, swap, quick-use) are obstacles: an exit inside one is pulled back along the ray to where the ray enters it. When that point is within 48 px of the survivor (the swap / quick-use pair sits across the centre row), the arrow takes the nearest clear ray each way, at most 30° off. Hysteresis keeps whichever of the two is nearer last frame's spot (`EventArrowPlace.side`, kept by EventView). | `hudLayout.test`, every 0.1° both ways at 568×320, 640×360, 800×360 and 844×390, k 1 and 3; every keep-off assertion holds. Max bearing error: **30.0° at 568×320, 0.0° at 640×360 and wider**. Neighbouring steps move ≤ 4.4 CSS px, except ≤ 3 jumps per turn where the legal spots part. At 568×320 those are straight up (51 px: the HP row reserve reaches past the centre column), up-right (86 px: the HP block meets quick-use) and right (111 px, across the swap / quick-use pair). Wider screens have one, at a corner of the swap / quick-use pair (≤ 173 px). Max jump 173 CSS px (was 370–500). No jump > 40 px under ±0.1° jitter at any degree (hysteresis). |
| RR2 | `WAVE_LINE_RESERVE_CSS_PX` 240 → **280**: the widest line, "Wave 99 · Endless · Zombies 9999", measures 261.5 px at 16 px system-ui (Chromium canvas). | the layout tests above use it. |
| RR3 | New `HP_ROW_RESERVE_CSS_PX` **306**: "HP 175 / 175   Burning" measures 143.4 px at 14 px, plus 8 px and 5 gear icons × 28 px = 291.4 px, plus a margin. `layoutHpBlock` is 308 wide. | ditto |
| RR4 | `armEndlessEvent(world, previousLast)`: if an un-done forced extra is pending for the coming wave, it wins. The endless pick is dropped (`run.endlessEvent` ""), and `run.lastEndlessEvent` goes back to what was last really armed. A force during the build still replaces the pick. | `schedule.test` "RR4": forced in wave 11 for wave 12 → kept, no-repeat memory unchanged; forced after `startBuild` → replaces it. |
| nit | `fakeRoom` field order: event*, then voteTicksLeft / endless (schema order). | typecheck |

### Re-review 3 (AI) (fresh agent, 2026-11-25, narrow: re-review 2 fixes d136cb3..4c98ef2, at 185496d)

**Outcome: changes requested (0 high, 1 medium, 3 low, 1 nit).** No overlap, nothing outside the safe area, nothing within 48 px of the survivor, and the bearing error is 0° on every layout except 568 × 320. RR2–RR4 hold. But the hysteresis only protects the ≤ 30° fallback. Where the ray grazes a compact control's corner, the arrow flips about 170 px **every frame** under jitter.

**Run:** `npm run typecheck` (clean); `hudLayout.test` + `schedule.test` (29/29); throw-away probes (deleted): 0.01° sweeps, oscillation across every jump at ±0.01 / 0.1 / 0.5 / 1° with the state kept between frames, and a slow walk (the event point slides 0.5 px per frame across the jump with ±2 px noise, 400 frames). Sizes: 568×320, 640×360, 800×360 and 844×390 at k 1 and 3 (insets 44 / 0 / 44 / 21); 390×844 portrait (insets top 47, bottom 34) at k 1 and 3; 390×844 with landscape insets.

| # | Sev | Where | Scenario | Fix |
| --- | --- | --- | --- | --- |
| RR3-1 | medium | `apps/client/src/render/eventArrow.ts:147` (obstacle pull-back in `exitClear`) and `:107` (hysteresis only in the fallback branch) | A ray that hits swap / quick-use is pulled back to the point where it enters the obstacle. One that just misses the corner reaches the screen edge. That step is a jump of about 170 px: 640×360 at 13.77° and 349.26° (173 / 171 px), 800×360 at 10.55° / 351.80°, 844×390 at 12.24° / 354.69° (same at k 3), portrait 390×844 at 59.42° (128 px; 67.17° with landscape insets). The bearing's own ray is "clear" on both sides, so the side hysteresis never runs. Oscillating across the jump: **39 flips in 39 frames** at every amplitude from ±0.01° to ±1°. Slow walk with noise: 5 flips. A survivor strafing near the bearing of an event to the lower right (or upper right) makes the arrow strobe between "in front of quick-use" and "on the right edge". The story's claim "no jump > 40 px under ±0.1° jitter at any degree" doesn't hold. The test jitters only round whole degrees, and every jump sits at a fractional angle (13.77°…). | Hysteresis on the pull-back too. While last frame's spot was pulled back by obstacle i, inflate i by a few px × k more (or keep the pulled-back spot while the new ray still passes within that band), so the flip happens once. Or chamfer the obstacle's shadow out to the edge, as the notches do, so the exit stays continuous. Test: find every jump at 0.01° steps and oscillate across each with the state kept, expecting ≤ 1 jump. |
| RR3-2 | low | `apps/client/src/scenes/hudTopLayout.ts:41` (`layoutHpBlock`, one 308 × 65 box) and `eventArrow.ts:110` (30° fallback) | 568×320: the HP block is now 308 wide (RR3), and its notch runs the block's full depth down to the money line, inflated to y ≈ 102. That is only 58 px above the centre, so straight up fails the 48 px clearance and falls back. The error is 23.8° at 270° and up to **30.0°** in the upper half (> 10° over 39.6° of directions). Only the bar and HP row are wide; the money line under them is short. Measured: with the wide band ending at the HP row, the upper half has **0.0°** error, and the overall max drops to 17.5° (the right side, structural: the swap / quick-use pair straddles the centre row, and the 16 px gap can't hold the 34 px arrow). The tip always points at the true bearing, so a 30° offset on the 568 px screen is tolerable for D10. The 17.5° rule is still better and simpler. | Split the HP block into two rects: bar + HP row (308 wide), and the money line (its own short rect). The top edge's notch is then shallow, and straight up stays on its ray. |
| RR3-3 | low | `hudTopLayout.ts:15–25` (`WAVE_LINE_RESERVE_CSS_PX` 280, `HP_ROW_RESERVE_CSS_PX` 306) | Both are hand-measured constants (Chromium system-ui; "up to 5 gear icons"). Nothing ties them to HudScene's text formats, `drawGear`'s icon count, or the font. Mutation: 306 → 0 and 280 → 240 both survive every test. Another font (Android's Roboto), a new suffix, or a 6th gear item drifts silently. | Use the real widths: HudScene passes `hpText.width` + its gear extent and the wave text's width to the layout. Or add a check that the gear-icon maximum and the text templates match the constants' comments. |
| RR3-4 | low (dev) | `packages/shared/src/events/schedule.ts:118` (`x.wave === world.waves.number + 1`) | The wave check is untested: removing it survives `schedule.test`. Without it, an un-done extra left over from an earlier wave would drop every endless pick. In the other order (a force during the build), `run.lastEndlessEvent` keeps the replaced pick, so "only what really armed is remembered" holds for one order only. After a forced stampede on 12, the endless pick on 14 can be stampede too (dev only). Determinism holds (same seed + same force → same draws). The early return skips the `events` stream draw for startFraction, so a forced run's later stream differs from an unforced one. That's expected for a dev switch. | Add a case with a stale extra (wave ≠ next, !extraDone) that must not block the pick. Optionally let `forceEvent` set `lastEndlessEvent` to the forced kind in endless mode. |
| nit | — | `hudLayout.test.ts` RR1 block (jitter loop) | The jitter test starts a fresh state at each whole degree and nudges ±0.1°. It can't see a jump between whole degrees (RR3-1). | Jitter round each detected jump instead. |

**Measurements (0.01° sweep, CSS px):**

| Layout | Max bearing error | Jumps > 40 px (°: px) | Flicker across a jump (state kept) |
| --- | --- | --- | --- |
| 568×320 k1/k3 | 30.0° (> 10° over 39.6° of directions) | 276.46: 51, 332.24: 84 | none (fallback hysteresis holds) |
| 640×360 k1/k3 | 0.0° | 13.77: 173, 349.26: 171 | 39/39 at every amplitude ±0.01–1° |
| 800×360 k1/k3 | 0.0° | 10.55: 171, 351.80: 170 | 39/39 |
| 844×390 k1/k3 | 0.0° | 12.24: 172, 354.69: 169 | 39/39 |
| 390×844 portrait k1/k3 | 0.0° | 59.42: 128 | 39/39 |

Every layout: 0 overlaps with ☰, swap, quick-use, the HP block or the wave line; 0 drawn boxes outside the safe area; the smallest gap to the survivor is 48.0 px (568×320) to 160 px (portrait). No per-frame allocation in `placeEventArrow` (module scratch: `rg`, `notches`, `obstacles`, `drawnScratch`, `atScratch`; the caller's rects are reused). The RR2/RR3 reserves don't push any arrow off the safe area. Their one cost is RR3-2 (straight up at 568×320).

**Mutations (each applied, the named test run, reverted):** fallback hysteresis removed → hudLayout 2 failed; obstacle pull-back off → 2 failed; notch chamfers 0 → 2 failed; max error 30° → 60° → 2 failed; 30° → 20° → 2 failed; RR4 guard off → schedule 1 failed; `lastEndlessEvent` restore off → 1 failed; `startBuild` without `previousLast` → 1 failed. **Survived:** `HP_ROW_RESERVE_CSS_PX` 0, `WAVE_LINE_RESERVE_CSS_PX` 240 (RR3-3), and the RR4 wave check removed (RR3-4).

### Re-review 3 fixes (builder, 2026-11-25, after merging `rereview3-6-8` d26ac60)

| # | Fix | Test / measured |
| --- | --- | --- |
| RR3-1 [BEHAVIOUR] | Jump hysteresis in `placeEventArrow`. If the fresh placement would move the arrow more than 40 CSS px from last frame's spot, and that spot is still legal (inside the notched region, off every obstacle, clear of the survivor) and within 10° of the bearing (`EVENT_ARROW_HOLD_RAD`), the arrow stays there. This covers both the pull-back at a control's corner and the far side of a blocked fan. Crossing back and forth flips at most once. | `hudLayout.test` "RR3-1": 568×320, 640×360, 800×360, 844×390 and 390×844 at k 1 and 3. A 0.01° stateless sweep finds every jump > 40 px: 568×320 at 356.71°; 640×360 at 13.77° / 349.26°; 800×360 at 10.55° / 351.80°; 844×390 at 12.24° / 354.69°; 390×844 at 67.17°. Then 40 frames oscillating ±0.01 / 0.05 / 0.2 / 1° across each, and a ±3° walk each way with ±2 px noise: **0 flips everywhere** (bound 1). Stateless max bearing error: 14.25° at 568×320, 0° elsewhere. With the hold, the 0.1° sweep's max is 28.5° at 568×320 and 10° elsewhere. |
| RR3-2 | The HP block is split: `layoutHpBlock` is the bar and the HP row (wide); `layoutMoneyLine` is its own short rect under it. `waveControlRects` has 6 rects. Straight up at 568×320 now has a spot (its fresh jump is gone). | the keep-off checks include the money line. |
| RR3-3 | `hudTopLayout` builds the widest strings with HudScene's own functions: `WIDEST_WAVE_LINE = waveLine(wave 999, 9999, endless)`, `WIDEST_HP_TEXT = hpRowText(9999, 9999, Burning)` (HudScene now draws the HP text with `hpRowText`), and `WIDEST_MONEY_TEXT`. HudScene measures them with its own text styles at create and reports the widths (`reportHudTextWidths`). Each rect reserves max(fallback, measured), plus the 5 gear icons on the HP row. | `hudTopLayout.test`: every `waveLine` / `hpRowText` output is no longer than the widest string; a measured width wider than the fallback widens the rects. |
| RR3-4 | `forceEvent` in endless sets `run.endlessEvent` and `run.lastEndlessEvent` to the forced kind (dev). | `schedule.test`: forced in wave 11 → kept, last = forced; a pending forced entry for another wave, or a done one for the same wave, doesn't stop the pick; a force in the build replaces the pick, and wave 14 doesn't repeat it. |
| nit | The jitter test runs at fractional angles (+0.37°). | — |

### Re-review 4 (AI) (fresh agent, 2026-11-25, narrow: re-review 3 fixes d26ac60..26c2e53, at ac867a6)

**Outcome: approve — no medium/high findings.** `npm run typecheck` clean; `hudLayout.test`, `hudTopLayout.test` (29) and `schedule.test` (15) pass.

- **RR3-1 jump hysteresis — holds.** Probe at 568×320, 640×360, 800×360, 844×390, 390×844 (k 1 and 3), every fresh-placement jump of a 0.01° sweep (568×320: 356.71°; 640×360: 13.77°/349.26°; 800×360: 10.55°/351.8°; 844×390: 12.24°/354.69°; 390×844: 67.17°): oscillations of ±0.5° and ±2° each frame across a jump flip ≤ 1 time in 60 frames; 5 noisy random walks (±0.75°/frame) per jump stay quiet; slow sweeps (0.1 / 1°/frame, two turns) jump exactly once per jump per turn. Not stuck: the hold lets go once the old spot is > 10° off (worst held lag 100 frames at 0.1°/frame = the 10° window), so the arrow is never > 10° off on the hold (568×320's 28.5° is the ≤ 30° fresh fallback, as before). Larger per-frame swings (≥ ±5°/frame) move the arrow > 40 px every frame, but a perfect tracker does the same there (10° at the edge ≈ 55+ px), and such bearing rates don't happen with a following camera. Drawn arrow: 0 overlaps with ☰/swap/quick-use/HP block/money line/wave line or outside the safe area; ≥ 70.9 px from the survivor. No per-frame allocation in the hold path.
- **RR3-2/RR3-3 — fine.** `hpRowText` is the old expression verbatim. The HUD texts are `system-ui` (no web-font swap — Oswald is only the boss bar / boss art), so one measurement at create is right; the widths are stored in CSS px, so a DPR change (font sizes re-rounded) moves them by < 1 px. Nit: the `reportHudTextWidths` doc says "create, and on a DPR / font change", but only create calls it.
- **RR3-4 — fine (dev only).** A force during the wave (for the next one) sets `endlessEvent` early; the next `startBuild` re-picks it, and `armEndlessEvent` keeps the forced kind, with no-repeat memory = the forced kind.
- **Low (test gap, not player-visible):** removing `legalAt(prev…)` from the hold doesn't fail any test, since the region doesn't change between frames there. It matters on a resize/rotation: with it removed, a probe going 844×390 → 800×360 left 149 of 720 bearings off screen; with it, 0. A resize case in the RR3-1 test would pin it.
- **Mutations (each reverted):** hold radius 0 → killed (8); hold without `legalAt` → survived (see above); money line dropped from `waveControlRects` → killed; money rect at the fallback width only → killed; HP / wave measurement ignored → killed; `WIDEST_WAVE_LINE` from wave 99 → killed; `WIDEST_HP_TEXT` with Acid → killed; RR3-4 block removed → killed (3); only `lastEndlessEvent` removed → killed (3). Money width 0 survives `hudLayout.test` alone (the rect and the check share the layout function) but is killed by `hudTopLayout.test`.

## Change Log

- 2026-11-24: story drafted from the real code (gds-create-story)
- 2026-11-24: designer accepted every recommended decision ("ok, perfect"); status ready-for-dev.
- 2026-11-24: built (gds-dev-story): framework, car alarm, stampede, events map layer, wire, client; merged 6.6+6.7 and 6.2+6.4 from master; status review.
- 2026-11-24: Senior Developer Review (AI) by a fresh reviewer: changes requested (2 medium, 8 low)
- 2026-11-24: review fixes: 6.8 B2 (runS 12), the update-outcome API, M2 (edge arrow in the HUD layout test), L1–L8, nits; status review.
- 2026-11-25: Re-review (AI) of the review fixes: approve with notes (1 medium R1 edge arrow over the HP bar / wave line, 3 low).
- 2026-11-25: re-review fixes R1–R4 (arrow off the HP block and the wave line, safe-rect on-screen test, drawn-extent test, runS 12 / ≤ 15 s docs and the hold test).
- 2026-11-25: merged 6.11 + 6.12 from master: one endless scheduler (6.12) feeding the framework (`armEndlessEvent`); HeliView pad from `evac_pad`.
- 2026-11-25: Re-review 2 (AI) of R1–R4 + the 6.11/6.12 merge: approve with notes (1 medium RR1 arrow bearing / jump, 3 low).
- 2026-11-25: re-review 2 fixes: RR1 arrow on its ray (notched safe rect, obstacles, ≤ 30° fallback with hysteresis), RR2/RR3 wave-line and HP-row reserves, RR4 forced event wins over the endless pick, fakeRoom order.
- 2026-11-25: Re-review 3 (AI) of the re-review 2 fixes: changes requested (1 medium RR3-1 arrow flicker at obstacle corners, 3 low, 1 nit).
- 2026-11-25: re-review 3 fixes: RR3-1 arrow jump hysteresis (no strobe), RR3-2 money line split from the HP block, RR3-3 measured HUD reserves, RR3-4 forced endless kind remembered.

### Main session close-out (2026-11-25)

- Re-review 4 approved (0 high/medium). Follow-ups: resize/rotation case for the RR3-1 hold (`legalAt(prev…)` untested), `reportHudTextWidths` doc says DPR/font change but only create calls it; review M1 (pre-existing wide-body RUSH Bloater stall at a 0.5 m diagonal barricade gap) is its own small story; the bot strafe flip stays.
- Main-session full gate on story-6-8 ac867a6 (master 58ab0b7 merged): typecheck, lint, 385 files / 3,547 tests passed (3 skipped), build OK; load 0.29 → see gate log (4 cores). Story done.
