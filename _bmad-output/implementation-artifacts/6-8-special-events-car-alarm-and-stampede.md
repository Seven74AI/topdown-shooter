# Story 6.8: Special events, car alarm and stampede

Status: drafted (ready-for-dev once the designer confirms docs/epic-6-decisions.md › Story decisions to confirm)

## Story

As a team,
I want surprises in the middle of the run,
so that no two runs play the same.

{{BRIEF}}

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
- **F8 "The stampede never makes the wave endless."** The 10 s crossing ends with every stampede Runner still on the map becoming a normal Runner of the wave (counted in "zombies remaining" and the last-5 rule); a Runner stuck for **1 s** (no progress along the lane) converts early. While the crossing runs, the wave cannot end.
- **F9 "Events only happen where they make sense."** Gates (checked at schedule time from the stage that wave will have, and again at trigger): car alarm only with at least one parked car still at its curb spot and not burning; gas leak (6.9) only at stage ≥ 2; power failure (6.10) only in waves 6–8; supply drop and survivor (6.9, 6.10) only with a reachable spot. An event that can't start at its trigger moment is skipped with `event.skipped` in the log (test: never happens on Downtown).

### Behaviour

1. **Framework (`packages/shared/src/events/`, FR37).** One module per event (`carAlarm.ts`, `stampede.ts`; 6.9 adds `gasLeak.ts`, `supplyDrop.ts`; 6.10 `powerFailure.ts`, `survivor.ts`), each an `EventModule { kind, fits(world, wave), start(world), update(world), end(world), holdsWave(world) }` registered in `events/registry.ts`. `EVENT_KINDS = ["car_alarm", "stampede", "gas_leak", "supply_drop", "power_failure", "survivor"]` (append-only: the index goes on the wire; this story registers the two it builds, the others are stubs whose `fits` returns false until their story lands). Data in `config/balance/events.json` (schema `eventsSchema` in `balanceSchema.ts`, `loadBalance` cross-checks).
2. **State.** `world.special: SpecialEventState` (not `world.events`: that is the EventBus) holds the run's `schedule` (2 entries `{ kind, wave, startFraction }`, fixed at run start), the `active` event (one at a time: kind index or −1, `phase`, `startTick`, `phaseTick`, `x`, `y`, a per-kind sub-record), `done` (bitmask of schedule entries finished) and `log` counters (triggered / skipped / alarmShotBy for tests). In `snapshotWorld`; reset by the run reset.
3. **Scheduler (`events/schedule.ts`).** `scheduleRunEvents(world)` at the run's first build start, from `world.streams.events` only: shuffle the registered kinds, take 2 whose `fits` holds for at least one allowed wave, then pick their waves from the allowed pairs (F2) whose gates hold (the stage per wave from `stageForWave`, honouring `world.debug.decayStageByWave`), then each `startFraction` from `[0.20, 0.60]`. Deterministic, no allocation after run start. `scheduleEndlessEvent(world, wave)` (for 6.12: one event that fits an even endless wave without a Behemoth; not the same kind as the previous endless event) is written and unit-tested here; 6.12 calls it.
4. **System.** `updateSpecialEvents` fills the existing `specialEvents` slot of `SYSTEM_ORDER` (today a no-op in `DEFAULT_SYSTEMS`; `NO_SYSTEMS`/`PREDICTION_SYSTEMS` keep the no-op). In a wave: trigger the scheduled entry when `size − queued ≥ round(size × startFraction)` (F3); tick the active module; at `wave.ended` call `end`. `updateRun` ends a cleared wave only when `!eventHoldsWave(world)` (F8; 6.9's gas countdown also holds). `skipWave` (dev) ends the active event first.
5. **Events on the bus and the wire.** `event.triggered { kind, wave, x, y, startTick }`, `event.phase_changed { kind, phase, tick, playerId? }` (armed → alarm with the shooter; warning → running), `event.ended { kind, outcome }` (`"done" | "skipped" | "wave_end"`), `event.skipped { kind, wave }`. New `NET_EVENT_KIND` numbers (next free at merge; never reuse), round-trip tests, global interest (team cues: not local).
6. **Room state (late join / woken tab, brief 14).** Schema `RunState` gains `eventKind` (uint8, 255 = none), `eventPhase` (uint8), `eventStartTick` / `eventPhaseTick` (uint32), `eventX` / `eventY` (uint16 cm), `eventLane` (uint8) — written by `syncState` on change only; `RUN_STATE_FIELDS`, `RunStateView`, `fakeRoom`, devThrottle key list. The client draws markers from these (an event that started while the tab slept still shows; its banner is skipped if older than `events.json › lateBannerS` 3 s, the 5.7 `ageS` pattern).
7. **Car alarm (FR38, D7).** Candidates = map `cover` objects of kind `car` that are active at the current stage (`world.obstacles.cover`), are original curb/lot cars (not a decay `add`) and are not a burning fire's target. Pick (stream `events`) among those **8–25 m** from the team centre (mean of standing players; none → the nearest beyond 8 m). Phase `armed` **20 s** (`armedS`): the car's hazard blink + the CA3 bell pin pulse; the first qualifying bullet (F4) or the timer → phase `alarm` **15 s** (`alarmS`): every zombie whose centre is within **15 m** (`pullRadiusM`) of the car centre at any tick of the alarm is marked lured (`pool.lureTicks`, cleared at the alarm's end) and steers by the **lure fields** (one on the nav grid, one on the wide grid for wide bodies), seeded from the free cells round the car and built during the 20 s armed phase inside the existing `rebuildCellsPerTick` budget (never rebuilt mid-alarm: the car doesn't move). A lured zombie with a standing player within `distractBreakM` **2 m** targets that player (F5). Rushing zombies are never lured. Players' alarm sound: a placeholder loop positioned at the car.
8. **Shot hook (`combat/firing.ts › updateProjectiles`).** For a player's projectile (`pool.building === 0`), while an event exposes a shootable box (`specialShotTarget(world)`: the armed car's box; 6.9 adds the gas tank), test the step's segment against that box with `segmentBoxEntryT`; it counts when its t is not after the shot's stop point (`stoppedAt`/`blockT`, a car being its own first blocker). One box test per projectile step only while armed; nothing otherwise. The client's cosmetic projectile already stops at the car.
9. **Stampede (FR41).** Lanes are map data (item 11). Pick (stream `events`) among lanes open at the stage whose centre line passes within `laneNearTeamM` **10 m** of the team centre, else the nearest lane. Phase `warning` **3 s** (`warningS`): rumble, ST1 dust cloud at the start edge, amber chevrons down the lane. Then `running` **10 s** (`runS`): **12 / 18 / 24 / 30** Runners (`countByPlayers`, by standing + downed players in the run) spawn in rows at the start edge across the 8 m width (`rowSize` 6, `rowGapS` 0.3 s), **not wave zombies** (`waveZombie = 0`), state `ZOMBIE_STATE.STAMPEDE` (new value 6, the horde nibble), speed `speedMps` **5.0**, moving along the lane direction with the normal separation, push-out and box collision (no flow field, no flanking, no target). Contact with a standing player: **8** damage (`contactDamage`, tag `zombie`), once per Runner per player (a 4-bit per-zombie mask). Runners leaving the far edge are removed (no reward, not counted). At the end of `runS`, or when a Runner made < `stuckProgressM` 0.5 m progress in `stuckS` **1 s**, it becomes a normal Runner (`waveZombie = 1`, state CHASE): it then counts in `remaining` (recomputed each tick) and the last-5 rule (F8). Kills pay the normal Runner reward.
10. **Alive cap during a stampede (brief 22).** Normal spawns pause while stampede Runners are alive (`updateWaves` room = 0), and the stampede may spawn up to `overCap` **30** above the alive cap that applies (6.5's `aliveCapOf(world)`, 150 today; 110 while a Behemoth lives) — so at most 180 alive (pool capacity 256). The Runners that don't fit wait for the next row tick; any still unspawned at the end of `runS` are dropped.
11. **Map data.** A new Tiled object layer `events` (generator `tools/maps/buildDowntown.ts`, loader `map/loadTiledMap.ts` + `tiledSchema.ts`, `DistrictMap.eventSpots` and `DistrictMap.stampedeLanes`): **4 stampede lanes** (2 east–west along the main street, 2 north–south along the cross streets; each a rect 8 m wide with `dir`, `minStage`, `maxStage`), and the spot lists 6.9 and 6.10 use (`crate` ×10, `survivor` ×8, `safe` ×6, each a point with `minStage`), all on open road. Built here once so 6.9 and 6.10 don't touch the map files. Tests: every spot is box-free and fire-free and reachable (the 4.5 reachability pattern) and every lane lets ≥ 90 % of a 30-Runner stampede cross or convert without a stall, at every stage × legal variant mask (`legalDecayMasks`), including 6.2's rubble once merged.
12. **Client.** `render/EventView.ts` (new): marker pins (the looks.html `pin`, disc + icon + pulse ring) and edge arrows (`render/edgeArrow.ts`) drawn on 6.3's above-the-darkness layer; car hazard blink + CA3 bell pin + a 20 s countdown arc on the pin; ST1 dust (pooled particles) + amber chevrons; banner via `GameScene.stackBanner`: "CAR ALARM · shoot it to set it off", "STAMPEDE!" (texts in `events.json › banners`). Sounds in `audio/placeholderSfx.ts`: `event_car_alarm_armed` (chirp), `event_car_alarm` (loop, positional), `event_stampede_rumble`. Art in `render/city/eventArt.ts` through `addGeneratedTexture`.
13. **Dev switches (brief 18).** Solo cheat "Force event ▸ kind" (next wave, at 20 %); server `DEV_EVENTS=car_alarm@3,stampede@4` (dev only, replaces the schedule); `?events=` solo URL switch with the same format. Never JSON edits.
14. **Bots.** `bots/botPolicy.ts`: bots step out of a stampede lane during the warning (keeps the 10-wave sim from dying to the first stampede); bots don't shoot the car (the timer sets it off).

## Tasks / Subtasks

- [ ] **T0 Art (picks fixed; no new pick).** From `docs/epic-6-decisions.md` › section 5: **CA3** car alarm = a pulsing amber bell marker over the car (no sound rings; the 15 m pull is not drawn), plus the car's own hazard blink; **ST1** stampede = a dust cloud at the map edge + amber chevrons down the lane. Port `pin`, `IC.bell`, the chevron and the dust code from `docs/art/epic-6/looks.html` (`makeAlarmCard`, `makeStampedeCard`) into `render/city/eventArt.ts` (pin disc, bell, chevron frames in one small atlas `event_<name>_<variant>`) and `render/EventView.ts`; every texture through `addGeneratedTexture` with a redraw callback (brief 20). Colour rule: amber `#ffb648` for both. Add both to `docs/playtests/milestone-1/readability-sheet.md` (brief 13).
- [ ] **T1 Balance + schema** (AC 1, 7, 9, 10): `config/balance/events.json` (below); `balanceSchema.ts › eventsSchema`; `balance.ts` loads it (`balance.events`) and cross-checks (waves list ⊂ 1..`runWaves`, excluded 5, fractions 0–1 min ≤ max, `countByPlayers` length 4, `overCap` + `maxAlive` ≤ `ZOMBIE_POOL_CAPACITY`); `config/balance.test.ts` cases.
- [ ] **T2 Map layer** (AC 11): generator objects + `.tmx/.tmj` regenerated (`tools/maps/downtownFiles.test.ts`), loader + schema, `DistrictMap.eventSpots` / `stampedeLanes`, `PLACEHOLDER_MAP` gets empty lists; reachability + clearance tests (`map/downtown.test.ts`, new `events/spots.test.ts`).
- [ ] **T3 Framework** (AC 1–6): `events/registry.ts`, `events/eventState.ts`, `events/schedule.ts` (`scheduleRunEvents`, `scheduleEndlessEvent`, `eventFits`), `events/specialEvents.ts` (`updateSpecialEvents`, `eventHoldsWave`, `forceEvent`), World field + `createWorld`, `DEFAULT_SYSTEMS.specialEvents`, `run/runStateMachine.ts › updateRun` hold, `skipWave`; `core/simEvents.ts` + `net/netEvents.ts` kinds; schema fields, `syncState` (+ reset), `RUN_STATE_FIELDS`, `RunStateView`, `fakeRoom`, devThrottle; `snapshotWorld`. Tests `events/schedule.test.ts` (F2 over 10,000 seeds: always 2, different, allowed pairs only, gates; 1 solo player and 4), `events/specialEvents.test.ts` (F3 start fraction; one active event; holds the wave; `skipWave`), `net/netEvents.test.ts` round trips, `syncState.test.ts` (fields + reset).
- [ ] **T4 Car alarm** (AC 7, 8; F4, F5): `events/carAlarm.ts`, lure fields in `zombies/flowField.ts` (`PathingState.lure` + `lureWide`, seeded from the car's ring cells, built while armed, idle otherwise), `zombieAi.ts` pass 1 lure steering (+ `pool.lureTicks` in `zombiePool.ts`), the shot hook in `combat/firing.ts`. Tests `events/carAlarm.test.ts`: candidate filter per stage × mask (never a moved, removed or burning car; ≥ 1 at waves 3–8 on Downtown), 8–25 m pick, shot by pistol / shotgun pellet / AR starts it and credits the shooter, turret / melee / flame / grenade don't, a bullet stopped by a zombie or barricade before the car doesn't, the 20 s timer starts it, zombies within 15 m reach the car (around the bus), a player within 2 m of a lured zombie is bitten, rushing zombies ignore it, lure ends after 15 s.
- [ ] **T5 Stampede** (AC 9, 10; F6–F8): `events/stampede.ts`, `ZOMBIE_STATE.STAMPEDE`, lane movement in `zombieAi.ts` (a branch before the target pick), per-Runner contact mask, conversion, over-cap in `waves/waveDirector.ts › updateWaves`. Tests `events/stampede.test.ts`: 12/18/24/30 by players; nothing spawns in the 3 s warning; contact = 8 once per Runner per player; no building damage; conversion at 10 s and when stuck; converted Runners counted in `remaining` and rushed in the last 5; a wave whose last normal zombie dies mid-crossing waits; never above cap + 30; stampede Runners don't flank.
- [ ] **T6 Client** (AC 12): `EventView.ts`, `eventArt.ts`, `GameScene` (banners, handlers for the four event kinds, sounds), `NetSimHost` (decode, `ageS`, schema → view), `LocalSimHost` (solo runs the system), HUD nothing else. Tests: pure-function tests for the marker/countdown model (`eventMarkers.test.ts`), atlas ≤ 2048² (`atlasLayout.test.ts`), redraw after context loss.
- [ ] **T7 Fuzz, sims, bandwidth, perf** (brief 7, 9, 11, 16): `zombies/downtown.fuzz.test.ts` + random layouts × stages 2–4 × masks with a forced alarm and a forced stampede each: no body in a box, no stall, lured zombies reach the car, stampede converts; 10-wave sim (6.1's, or `runWaves` override) asserts 2 events triggered per run over 8 seeds, both kinds of this story seen; bandwidth test (`decayBandwidth.test.ts` pattern); tick cost with 180 alive + 2 lure fields (`PERF_ASSERT=1`, record load).
- [ ] **T8 Gates.** Mutations (e.g. wave 5 allowed → schedule test; back-to-back allowed; contact damage per tick → F7 test; lure through cover (straight line) → fuzz; conversion skipped → F8 wave-hold test; turret shot counted → F4 test) and which tests failed. Browser check (Playwright): solo `?events=car_alarm@1` and `?events=stampede@1` (+ `?wallet=` for a quick run), online two tabs with `?lag=150&jitter=20`: banner once, pin + edge arrow, shooting the car starts the alarm on both phones, chevrons for 3 s, a late tab (sleep/wake across the event start) still shows the marker without a late banner. `typecheck && lint && test && build`. Merge notes.

`events.json` (starting values):

```json
{
  "perRun": 2, "waves": [3, 4, 6, 7, 8], "startFractionMin": 0.2, "startFractionMax": 0.6, "lateBannerS": 3,
  "carAlarm": { "armedS": 20, "alarmS": 15, "pullRadiusM": 15, "distractBreakM": 2, "pickMinM": 8, "pickMaxM": 25 },
  "stampede": { "warningS": 3, "runS": 10, "laneWidthM": 8, "speedMps": 5, "contactDamage": 8, "countByPlayers": [12, 18, 24, 30], "overCap": 30, "rowSize": 6, "rowGapS": 0.3, "laneNearTeamM": 10, "stuckS": 1, "stuckProgressM": 0.5 },
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

Event messages ~15–25 B each, ≤ 4 per event; schema event record ≤ 20 B per change; stampede Runners are horde records (30 × 8 B × 20 Hz ≈ 4.8 KB/s at worst while in view, inside the 24 KB/s horde budget because normal spawns pause and the total stays ≤ 180 with most off screen). Assert in a bandwidth test and report.

### Phone FPS / Perf

Pins (≤ 4), chevrons (12 sprites), dust (≤ 64 pooled particles, `events.json › fx`); one small atlas. Run `?stress=150` with a forced stampede; report headless FPS before/after with load. Server: two lure fields built inside the existing budget, the stampede branch is O(n); added p99 recorded (`PERF_ASSERT=1`).

### Art

CA3 (pulsing amber bell pin over the car + the car's own hazard blink; no rings, the pull is not drawn) and ST1 (dust cloud at the lane's start edge + amber chevrons pointing down the lane) from `docs/art/epic-6/looks.html` (screenshots `docs/art/epic-6/ingame/ev-1240.png`, `ev-390.png`). All in game code via `addGeneratedTexture`; colour rule: amber = an event you can use.

### Dependencies

- **6.3 (blackout lighting)**: its above-the-darkness layer (markers must draw above the darkness). Until 6.3 merges, draw markers at the top world depth; the merge moves them onto the layer (Notes for the merge).
- **6.5**: `aliveCapOf(world)` (110 while the Behemoth lives). Until then, `balance.waves.maxAlive`.
- **6.1**: the 10-wave run (events in waves 7–8 need it to exist; the scheduler works on 6 waves with waves {3, 4, 6}). The 10-wave sim liveness asserts land with whichever merges second.
- **6.2**: rubble at stage 4 may block a lane or spot: the spot/lane tests over every stage × mask catch it; if a lane is blocked, set its `maxStage` 3.
- **Epic 5 in progress (5.13, 5.20–5.25)**: no overlap (no shop/build-bar UI touched).

### Notes for the merge (brief 19)

- `core/world.ts`: new `special` field next to `lights`; 6.5 adds `boss` — append both.
- `waves/waveDirector.ts › updateWaves`: the stampede pause/over-cap sits where `room` is computed; 6.5 replaces `b.maxAlive` with `aliveCapOf(world)` there — keep both. 6.1 changes `waves.json` only.
- `run/runStateMachine.ts › updateRun`: the event hold (`eventHoldsWave`); 6.11/6.12 change `endWave`'s branch — different lines.
- `zombies/zombieAi.ts`: the stampede branch and lure steering in pass 1; 6.5's boss is a separate system; 6.10's survivor adds itself to the target list in the same function (`collectAlivePlayers` / `nearestAlivePlayer`).
- `zombies/flowField.ts`: two lure fields; 6.5 adds a boss field; 6.10 seeds the chase field from the survivor — three separate additions to `PathingState`.
- `combat/firing.ts`: one hook call in `updateProjectiles`; 6.9 adds the tank box to `specialShotTarget`, no further edit here.
- `net/netEvents.ts`: next free kinds; 6.5/6.9/6.10/6.11 add theirs — renumber at merge, never reuse.
- Schema/`syncState`/`stateView`/`fakeRoom`: 6.9/6.10 append crate and survivor fields to the same event record.
- `map/loadTiledMap.ts`, `tiledSchema.ts`, `tools/maps/buildDowntown.ts`: the `events` layer; 6.2 adds rubble/breaches to `decay`/`spawns` — different layers.
- `render/EventView.ts`, `render/city/eventArt.ts`: 6.9/6.10 append their drawings.

### Suggested build round

Round "events-1": **6.8 first and alone among the event stories** (6.9 and 6.10 build on its framework, shot hook and map layer). It can run **in parallel with 6.2 / 6.4 (decay) and 6.5 (boss)** with merge care on `zombieAi.ts`, `flowField.ts`, `waveDirector.ts` (separate functions/blocks), and with 6.3 (client darkness; only the marker depth line overlaps). After it: **6.9 and 6.10 in parallel** (they touch different event modules; shared files only by appending).

### References

- `epics.md` › Story 6.8; GDD › Special events (always 2, table), Hazards, Downtown (parking lot = car alarm spot); FR37, FR38, FR41.
- `docs/ideas/epic-6/proposal.md` § 0 (D2, D7), § 6; `party-notes.md` › Round 9.
- `game-architecture.md` › Event System (`event.triggered` naming), Seeded PRNG (events stream), Sync (event entities in schema), System order (`updateSpecialEvents` after waves).
- Story files 3.5 / 3.8 (fields and budget), 4.3 (spawns), 4.4 (streams), 4.5 (decay apply, reachability), 4.7 (moved cars), 4.8 (fires), 5.7 (`ageS`, fixed zombies), 5.14 (stand-on-it pattern).

## Dev Agent Record

### Agent Model Used

### Debug Log References

### Completion Notes List

### File List

## Change Log

- 2026-11-24: story drafted from the real code (gds-create-story)
