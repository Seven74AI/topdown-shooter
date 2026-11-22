# Story 4.2: Cover and bullet rules

Status: done

## Story

As a player,
I want cars and the bus to stop bullets while barriers and sandbags only stop bodies,
so that cover works the way it looks.

> **EPIC 4 BRIEF** (§11 of `epic-3-retro-2026-11-22.md`) is this story's checklist. Lines 2 (same obstacles on every copy, list them), 3 (builder-written fuzz test), 4 (cover joins the nav grid under the 3.5 pinch rule), 6 (car/bus stop player, turret and rewound shots on the server AND the client's cosmetic projectile; barrier/sandbags only stop bodies; melee ignores cover), 9 (liveness, mutation-proven tests), 10 (player-visible properties as tests), 11 (lag check), 13 (no per-tick allocation, no inline numbers), 15 (perf with load), 18 (say what was not verified) and 19 (notes for the merge) apply most.

## Acceptance Criteria

1. **Movement (FR56).** Every active cover object of the `cover` layer (`car`, `bus`, `barrier`, `sandbags`) blocks players and zombies exactly like a map collision box: the same push-out (server, solo, the client's prediction), zombie line of sight, free-spot search (`spotBlocked`, returns), barricade placement (`footprintBlocked`), and the flow field treats its cells as walls (never entered, never attacked; wall-only pinches closed, Story 3.5/4.1 rule, zombie radius ≤ `MAX_PATHING_ZOMBIE_RADIUS_M`).
2. **Stage.** A cover object with `minStage` above the current decay stage is inactive (blocks nothing, stops nothing, not drawn as solid). The stage is read through ONE accessor, `currentDecayStage(world)` in `packages/shared/src/map/decayStage.ts`; until Story 4.5 it is 1 (a dev-only override in solo). Changing the stage (the dev cheat; Story 4.5 later) rebuilds the World's obstacle lists and the nav grid walls through one function, `applyCoverStage(world)`.
3. **Projectiles.** A projectile whose swept segment this tick enters a shot-blocking box stops at the entry point: active `car` and `bus` cover, and the map's collision boxes (buildings of the city; decision D3). Zombies are hit only before that point along the segment (a car between shooter and zombie means no hit), for player shots, turret shots (3.6) and rewound shots (2.12) alike. `barrier` and `sandbags` let shots pass (like player barricades). Swept, so a fast bullet can't tunnel through a thin box between ticks.
4. **Melee** ignores cover (a swing hits a zombie behind a car within reach).
5. **Client agrees.** The client's cosmetic projectile (own shots from the local fire clock, others' from `weapon.fired`, turret shots from `turret.fired`) stops at the same box with the same function on the mirror World; it never reports an apparent hit behind a car. No hit flash or kill FX behind a car (those only come from the server's `zombie.hit` / `zombie.killed`, which no longer happen there). Aim assist (server and client, same function) never bends a shot toward a zombie behind a shot blocker and treats the raw aim as "already hits" only if the zombie is before the blocker. Turrets target the nearest zombie they have a clear shot at.
6. **Client draws it:** active cover as solid blocks by kind (car, bus, barrier, sandbags), redrawn when the stage changes; inactive cover not drawn.
7. **Tests:** each kind against movement and projectiles; player-visible properties ("you can't shoot a zombie through the bus", "zombies path around cars and still reach you", "bullets fly over sandbags"); the Downtown fuzz test counts cover as solid (random stages, firing players: no projectile inside a shot blocker); prediction = server walking into a car; a netsim lag check near the bus (client local shots vs server); liveness asserts; each new test proven to fail under one mutation; `PERF_ASSERT=1` added tick cost with load.

## Tasks / Subtasks

- [x] T1 `map/decayStage.ts` (`currentDecayStage`, `FIRST_DECAY_STAGE`), `map/obstacles.ts` (`ObstacleState`, `createObstacles`, `applyCoverStage`), `COVER_STOPS_SHOTS` per kind; `World.obstacles`; `WorldDebug.decayStage` (AC 1, 2)
- [x] T2 Collision: `buildings/collision.ts`, `buildings/buildings.ts › footprintBlocked` read `world.obstacles.solids` instead of `world.map.solids`; nav grid walls from it (`createPathingState`), `setNavWalls` for a stage change (AC 1, 2)
- [x] T3 Shots: `combat/cover.ts` `shotBlockT` (swept slab entry, earliest box); `updateProjectiles` clips hits and stops; aim assist and turret target choice respect it (AC 3, 5)
- [x] T4 Client: `CosmeticProjectiles.update` stops at the same box; `CoverView` draws active cover; StreetView stops drawing cover outlines; dev cheat "Decay stage" (solo only; online disabled with a hint) (AC 5, 6)
- [x] T5 Snapshot digest: `obstacles` stage + version (AC 2)
- [x] T6 Tests + mutations; fuzz extension; netsim near-cover; prediction vs server into a car; perf with load (AC 7)
- [x] T7 Browser check (Playwright): bullets stop at a car, pass over sandbags (stage 3 via the cheat); gates; merge notes

## Dev Notes

### Decisions (non-interactive; the user delegated them)

- **D1 One World-owned obstacle list.** `World.obstacles` = `{ stage, version, solids, shotBlockers, cover }`, built from the frozen map for a stage: `solids` = the map's collision boxes, then every active cover object (all four kinds) that is not an exact duplicate of a collision box (the bus: it is both `city_bus` in `collision` and `bus_hull` in `cover`, same rect; kept in the map data as 4.1 wrote it, deduplicated here); `shotBlockers` = the map's collision boxes, then active `car`/`bus` cover (deduplicated the same way); `cover` = active cover objects (drawing, tests). Every body test that read `world.map.solids` reads `world.obstacles.solids` (same order: map boxes, then cover, then buildings). Story 4.5 mutates through this (it copies, never edits the frozen map).
- **D2 The stage accessor.** `currentDecayStage(world)` (`map/decayStage.ts`) returns `world.debug.decayStage ?? FIRST_DECAY_STAGE` (1). `world.debug.decayStage` is a dev override (null by default; set by the solo cheat only). Story 4.5 replaces the body with its real stage (and may keep the override). `applyCoverStage(world)` rebuilds the lists for the accessor's stage, bumps `obstacles.version`, rewrites the nav grid's walls (`setNavWalls`) and forces a re-rasterize. Not called per tick: only at World creation and on a stage change (brief line 4: no mid-wave rebuilds once 4.5 drives it at the build start). Bodies inside cover that appears (cheat only) leave through the normal push-out next tick; the brief line 5 order is Story 4.5's.
- **D3 City buildings stop shots too.** Story 4.1 (D6) left bullets flying over map collision boxes and recorded "buildings' walls should stop shots too" as 4.2's open item. A shot through an apartment block looks wrong, so map collision boxes are shot blockers (with cars and the bus). Barricades, barriers and sandbags still let shots pass.
- **D4 Swept entry test.** `shotBlockT(world, x0, y0, x1, y1)` = the smallest t ∈ [0, 1] at which the segment enters a shot blocker's interior (slab test; a start inside or on a face moving in = 0; grazing along a face is not a hit), or -1. Zombie hits with t ≥ tBlock are dropped; the projectile is placed at the entry point and freed. Every shot-blocking box is ≥ 0.5 m thick and a body can poke its muzzle (radius 0.4 + 0.1 m) at most 0.1 m into a box, so a shot can never start beyond a box (a data test pins the thickness).
- **D5 No broadphase grid.** Downtown has 10 collision boxes + 5 active cars/bus = 15 shot blockers (the bus deduplicated: 14). Each projectile step tests them with a slab test that rejects on the segment's bounding box first. Measured cost in Completion Notes; a grid would only pay off at hundreds of boxes (recorded for later districts).
- **D6 Aim assist and turrets.** Both run on the server, and aim assist on the client's mirror too, with the same function and the same obstacles: candidates whose centre line from the muzzle is blocked are skipped, and the "raw aim already hits" check counts a zombie only before the blocker. Turrets pick the nearest zombie in range with a clear line from the turret centre (they don't waste shots into a car). Bots are unchanged (aim at the nearest zombie; their sims are not difficulty evidence, brief line 16).
- **D7 Kinds' rules are data.** `COVER_STOPS_SHOTS: Record<CoverKind, boolean>` in `map/districtMap.ts` (car, bus: true; barrier, sandbags: false), next to `COVER_KINDS`. No new balance numbers.
- **D8 Nothing on the wire.** The stage is 1 everywhere in this story (the override is solo-only: online the cheat is disabled with a hint, like "Restart with seed"), the map is bundled data, so the server, the mirror and the Predictor build identical obstacle lists in `createWorld`. Bandwidth added: 0 B/s.
- **D9 Client look.** A new `render/CoverView.ts` draws the active cover as filled blocks by kind (placeholder look; Story 4.9 does the real one) and redraws only when `obstacles.version` changes (one compare per frame). StreetView keeps the collision boxes and stops drawing cover outlines.

### Current state (read before changing)

- `map/districtMap.ts`: `COVER_KINDS`, `CoverObject { kind, minStage }`; `DistrictMap.solids` (collision layer), `cover` (data only since 4.1). Downtown cover: `bus_hull` (= `city_bus` solid), `parked_car_1..3`, `street_car_west/east` (stage 1), `police_barrier_north` (barrier, stage 2), `sandbags_south` (stage 3). All on the 0.5 m lattice (loader).
- `buildings/collision.ts`: `hasObstacles`, `circleHitsBuilding`, `settle`/`pushOutOfBuildings`, `segmentHitsBuildings`, `segmentHitsBox` iterate `world.map.solids` then buildings. `buildings.ts › footprintBlocked` the same. `player/freeSpot.ts` goes through `circleHitsBuilding`. `movement.ts`/`zombieAi.ts` gate on `hasObstacles`.
- `zombies/flowField.ts`: `createNavGrid(map)` writes `wallAt = mapCollisionCells(map)` once; `rasterizeBuildings` (on `buildings.version` change) derives near-wall costs, free vertices, pinches and `closedE/S` from `wallAt` + buildings. `createPathingState(map, …)` is called by `createWorld`.
- `combat/firing.ts › updateProjectiles`: one loop for player, turret (3.6, `building > 0`) and rewound (2.12, `rewindTicks`) shots; per step a swept segment vs zombie circles (`segmentCircleT`), hits sorted by t, pierce. Projectiles fly over everything but the map edge.
- `combat/aimAssist.ts`: server (`tryFire`) and client (`NetSimHost.localAttack`, netsim harness) on the same World data.
- `buildings/turret.ts › nearestZombieInRange`: nearest centre within range, no line check.
- `combat/melee.ts`: sector test, "ignores cover" already documented.
- Client `net/cosmeticProjectiles.ts`: the mirror World's pool; same sweep vs mirror zombies, `onApparentHit` for the reversed-hit counter. `render/StreetView.ts` draws cover outlines.
- `core/worldSnapshot.ts`: `map: {name, version}`, `debug: {...}`; `snapshotPathing` hashes nav arrays (not `wallAt`).

### Copies touched (brief line 2)

World (`obstacles`, built in `createWorld` from the map + `currentDecayStage`) → schema: none → syncState: none → stateView key lists: none → mirror (`NetSimHost` createWorld: same lists) → Predictor (createWorld: same lists) → devThrottle: none → `snapshotWorld` (`obstacles.stage/version`).

### Must be preserved

Push-out determinism (fixed order, only + − × ÷ sqrt min max), no per-tick allocation, Story 3.5 pinch rule, prediction = server, 2.12 rewound hit behaviour on the open street (the kiting netsim is pinned to `PLACEHOLDER_MAP`, which has no cover and no solids: unchanged), all existing tests.

### Testing

`map/obstacles.test.ts` (lists per stage, dedupe, thickness), `combat/cover.test.ts` (each kind vs projectiles: player, turret, rewound; tunnelling; melee; aim assist; turret target), `buildings/coverMovement.test.ts` (each kind vs player and zombie movement, placement, nav walls), player-visible properties, the extended `zombies/downtown.fuzz.test.ts`, `tools/netsim/coverShots.test.ts` (lag 150 ms near the bus), `tools/netsim/barricade.test.ts` (prediction into a car), `run/tickCostDowntown.test.ts` (cost with cover).

### References

- `_bmad-output/planning-artifacts/epics.md` › Story 4.2 (and 4.5, 4.7, 4.8 for what comes next)
- `_bmad-output/implementation-artifacts/4-1-downtown-map.md` (D4, D5, D6, merge notes), `4-4-named-seed-streams.md`
- `_bmad-output/implementation-artifacts/epic-3-retro-2026-11-22.md` §8 R4, §11 brief
- Stories 2.7 (cosmetic projectiles, local fire clock), 2.12 (rewind), 3.4/3.5 (collision, pinch), 3.6 (turrets)

## Dev Agent Record

### Agent Model Used

Claude Opus 5.5 (claude-opus-5-5)

### Debug Log References

- Baseline before the change: 1,198 passed / 3 skipped (165 files).
- Existing tests that changed, all because cover/walls now really block: `RunController.test.ts` aim-assist case (its zombie at +8 m east sat inside the bus → moved 8 m west); `syncState.test.ts` barricade at gx 16 overlapped `street_car_west` → gx 18; `downtown.test.ts` free-cell count −180 (= the 5 stage-1 cars, 5 × 36 cells); `zombieAi.test.ts` debug snapshot has `decayStage: null`; `turretBandwidth.test.ts` and `NetSimHost.turret.test.ts` pinned to `PLACEHOLDER_MAP` (their turret spots sit inside Downtown buildings, whose walls now stop shots; they measure bandwidth / event plumbing, not geometry).
- Netsim harness: the server-side cover-stop counter first missed shots fired and stopped in the same tick (survivor 1.1 m from the bus) → detection by "slot moved and is free on a blocker face"; after that server and client stop counts are equal in every run (5/5, 7/7, 1/1, 12/12).
- Browser: a survivor 1.1 m from a car stops every bullet inside its first 3 m sweep (none ever drawn) → screenshots taken from 6 m. Online the team start is y 14.5 = the bus's top edge: shots along that line graze the face (not a hit, by design) → stepped 1 m south.
- The session server restarted after the build commit (263b1ba) and the merge (7242bab); the gates were re-run on the merged tip.

### Completion Notes List

- **Obstacles** (`map/obstacles.ts`, D1): `World.obstacles` = `{stage, version, solids, shotBlockers, cover}` built from the frozen map in `createWorld`; Downtown stage 1: 15 body boxes (10 map boxes + 5 cars; the bus once), 15 shot blockers; stage 3: 17 / 15. All body tests (`collision.ts`, `footprintBlocked`, free spots via `circleHitsBuilding`) and the nav grid walls read it. `applyCoverStage(world)` rebuilds lists + `setNavWalls` on a stage change only.
- **Stage accessor** (D2): `currentDecayStage(world)` in `packages/shared/src/map/decayStage.ts` = `world.debug.decayStage ?? 1`. Solo dev cheat "Decay stage (cover)" (disabled online with a hint).
- **Shots** (`combat/cover.ts`, D3–D6): swept `segmentBoxEntryT` / `shotBlockT`; `updateProjectiles` (player, turret and rewound shots: one loop) drops hits past the entry point and stops the shot there; map boxes stop shots too; aim assist and turret targets skip zombies behind a blocker; melee unchanged (ignores cover). Client `CosmeticProjectiles` uses the same function on the mirror World (`coverStops` counter).
- **Client look** (D9): `render/CoverView.ts` (cars blue-grey, barrier striped grey/red, sandbags striped brown; redrawn on `obstacles.version`); StreetView no longer draws cover outlines.
- **Tests added** (each proven to fail under one mutation; restored after):

  | Mutation | Tests that failed |
  |---|---|
  | M1 `shotBlockT` always −1 | cover.test (12), coverRewind, Downtown fuzz (shot inside cover), tickCost 4.2 liveness |
  | M2 `COVER_STOPS_SHOTS.barrier = true` | cover.test barrier + Downtown over-sandbags/barrier, coverRewind, obstacles stage lists |
  | M3 hits past the entry point not dropped | cover.test car/bus (thin box, same sweep) + tunnelling, coverRewind |
  | M4 end-point test instead of swept | cover.test tunnelling, turret, melee, aim assist, inactive-cover |
  | M5 aim assist bends into cover | cover.test "never bends a shot toward a zombie behind a car" |
  | M6 raw-aim "already hits" ignores cover | cover.test "raw aim already hits only a zombie before the car" |
  | M7 turret target without line check | cover.test turret |
  | M8 cosmetic projectile ignores cover | cosmeticProjectiles.test car/bus, netsim coverShots |
  | M9 cover not in `obstacles.solids` | coverMovement (8), obstacles (4), Downtown fuzz, netsim street car |
  | M10 nav grid built from the map without cover | coverMovement (7), obstacles nav walls, Downtown fuzz |
  | M11 bus not deduplicated | obstacles lists (3) |
  | M12 stage change without `setNavWalls` | obstacles accessor test, coverMovement stage-3 pathing |
  | M13 accessor ignores the override | cover.test inactive-cover, obstacles accessor, Downtown fuzz (stages) |
  | M14 Predictor without cover | netsim barricade "Story 4.2 street car" |
  | M15 placement ignores cover | coverMovement placement |

- **Fuzz** (`downtown.fuzz.test.ts`): cover counts as solid (an independent list from the map data, so a World that dropped its cover can't pass), random stage 1/2/3 per layout, buildings and walks hug cover faces, players hold fire with a zero-damage pistol: no live projectile inside a shot blocker. Result: 36 layouts, 387 buildings, 540/540 zombies reached a player, 104 shots ended on cover, stages 1/2/3.
- **Netsim** (`coverShots.test.ts`, 150 ms RTT ± 20 ms, beside the bus, rewind on): pistol × 3 seeds + rifle: reversed hits 0 %, server and client cover stops equal in every run; control with a cover-less client mirror: 10.2 % reversed. `barricade.test.ts`: pressing on and round `street_car_west` 0 snaps / 0 corrections (control: a predictor without cover, 37 visible corrections).
- **Browser** (Python Playwright + Chromium, server :2631, Vite :5231, temp config deleted after), screenshots in `/tmp/s42shots/`: solo, SMG west at 3 Walkers behind `street_car_west` from 6 m: 23 shots, 0 hits, no projectile ever sampled past x 10.5 (car face 8.5), no hit flash (`A-car-3.png`). Stage 3 through the cheat panel: SMG north over `sandbags_south`: 23–26 hits, bullets reached y 18.5 (sandbags 22.5–23.5) (`B-sandbags-1.png`); walking north into the sandbags stops at y 23.9 (`C-against-sandbags.png`). Online (1 player): firing east at the bus from 4.5 m: cosmetic bullets never past x 29.7 (face 30), 8 cosmetic cover stops, 0 snaps (`online-bus-2.png`). No page errors.
- **Not verified:** real phones / touch; `?lag=150&jitter=20` in the browser (the netsim covers 75 ± 10 ms one-way); a second online client watching remote shots stop (unit-tested via `CosmeticProjectiles`); turret cosmetic shots in the browser (unit test only); headless Chromium runs ~14 fps, so the exact stop frame on the car face was not captured, only sampled positions; online stage changes (none exist until 4.5); hidden-tab / late-scene lifecycle (nothing in this story depends on time or waves).
- **Perf** (`PERF_ASSERT=1`, `tickCostDowntown.test.ts` › Story 4.2: 4 players + 150 Walkers, Downtown without cover vs stage 3 with every cover object): load 0.89 → added p99 **+0.02 ms**, mean +0.012 ms; `shotBlockT` 106 ns per projectile sweep (15 blockers) → a full 512-shot pool 0.054 ms per tick, so no broadphase grid (D5). An earlier run at load 1.9 (right after the gates): +0.26 ms p99 / +0.03 ms mean, 135 ns per sweep. Both pass the asserts (≤ 2 ms; pool ≤ 0.5 ms).
- **Gates** on the merged tip (7242bab + this record): typecheck, lint, test (170 files, 1,241 passed, 3 skipped), build: green.
- **Bandwidth added:** 0 B/s (nothing on the wire: the stage is 1 on every host; the map is bundled).

### Notes for the merge (brief line 19)

- **Stage accessor:** ONE function, `currentDecayStage(world)` in `packages/shared/src/map/decayStage.ts` (+ `FIRST_DECAY_STAGE`); it reads `world.debug.decayStage ?? 1` (`WorldDebug.decayStage`, added in `core/world.ts`). If Story 4.3 adds its own accessor, keep this file and point 4.3's spawn filter at it (or the other way round: one body, one file). Story 4.5 replaces the body with the real stage and calls `applyCoverStage(world)` at the build start, after its mutations (brief line 5 order).
- **`core/world.ts`:** new `obstacles` field (built before `pathing`; `createPathingState` now gets `{widthM, heightM, solids: obstacles.solids}`), `debug.decayStage: null`. 4.3 does not need to touch these.
- **`buildings/collision.ts`, `buildings/buildings.ts › footprintBlocked`:** `world.map.solids` → `world.obstacles.solids` (map boxes then active cover). Spawn clearance (`spawnClearM`, brief line 7) in `footprintBlocked` is untouched: 4.3 owns it.
- **`zombies/flowField.ts`:** new `setNavWalls(nav, boxes)`; wall cells come from the obstacle list. 4.5: call through `applyCoverStage`, never per tick.
- **`map/collisionCells.ts`:** new `fillCollisionCells` (shared by `mapCollisionCells` and `setNavWalls`).
- **`map/districtMap.ts`:** `COVER_STOPS_SHOTS`. `map/loadTiledMap.ts`, the `spawns` layer, `waves/waveDirector.ts`, `tools/maps/buildDowntown.ts` and the map files: **untouched** (4.3's area). A data test (`obstacles.test.ts`) checks every spawn's jitter area against active cover at stages 1–5; if 4.3 adds spawns, it may need updating.
- **`combat/firing.ts`, `combat/aimAssist.ts`, `buildings/turret.ts`:** cover checks (`combat/cover.ts`). `nearestZombieInRange` now requires a clear shot line.
- **`core/worldSnapshot.ts`:** `obstacles: {stage, version, solids, shotBlockers}` (counts) in the digest.
- **`index.ts`:** exports `COVER_STOPS_SHOTS`, `fillCollisionCells`, `FIRST_DECAY_STAGE`, `currentDecayStage`, `applyCoverStage`, `createObstacles`, `ObstacleState`, `segmentBoxEntryT`, `shotBlockT`, `shotLineClear`, `setNavWalls`, `boxBlocked`.
- **Client:** `net/cosmeticProjectiles.ts` (cover stop), `render/CoverView.ts` (new), `render/StreetView.ts` (cover outlines removed), `scenes/GameScene.ts` (CoverView create/update/destroy), `debug/DevCheats.tsx` + `devCheatActions.ts` (Decay stage cheat).
- **Tools:** `netsim/hitsSim.ts` gains `map`, `clientMap`, `start` options and cover-stop counts (open-street runs draw exactly as before); `netsim/barricade.test.ts` gains `start`.
- **Schema / syncState / stateView / devThrottle / mirror / Predictor code / balance JSON / `runStateMachine.startBuild`:** untouched (mirror and Predictor get the obstacles through `createWorld`).

### File List

- New: `packages/shared/src/map/{decayStage,obstacles}.ts`, `packages/shared/src/combat/cover.ts`, `apps/client/src/render/CoverView.ts`; tests `packages/shared/src/map/obstacles.test.ts`, `packages/shared/src/combat/cover.test.ts`, `packages/shared/src/buildings/coverMovement.test.ts`, `apps/server/src/run/coverRewind.test.ts`, `tools/netsim/coverShots.test.ts`
- Modified (shared): `core/world.ts`, `core/worldSnapshot.ts`, `buildings/{collision,buildings,turret}.ts`, `combat/{firing,aimAssist}.ts`, `map/{districtMap,collisionCells}.ts`, `zombies/flowField.ts`, `index.ts`; tests `map/downtown.test.ts`, `zombies/{downtown.fuzz,zombieAi}.test.ts`
- Modified (client): `net/cosmeticProjectiles.ts`, `render/StreetView.ts`, `scenes/GameScene.ts`, `debug/{DevCheats.tsx,devCheatActions.ts}`; tests `net/cosmeticProjectiles.test.ts`, `sim/NetSimHost.turret.test.ts`
- Modified (server tests): `run/{RunController,tickCostDowntown,turretBandwidth}.test.ts`, `rooms/schema/syncState.test.ts`
- Modified (tools): `netsim/{hitsSim.ts,barricade.test.ts,hits.test.ts}`
- `_bmad-output/implementation-artifacts/sprint-status.yaml`

## Change Log

- 2026-11-22: Story file written (gds-create-story); built (263b1ba); merged `claude/epic-2-continue` (7242bab, docs/CI only, no conflicts); Status review.

## Senior Developer Review (AI)

Fresh-agent review, 2026-11-22 (830d57e). **Outcome: approved**, with no High or Medium defects. Gates and the release cheat scan pass.

- **Merge item (with 4.3):** 4.3 adds its own `decay/decayStage.ts` accessor and a "Spawn stage preview" control that writes `debug.decayStage` without `applyCoverStage`, so spawns and cover would disagree. The merge keeps one accessor, routes the preview through `setDecayStageCheat`, points 4.3's spawn filter at the same accessor, and re-runs `obstacles.test`'s spawn-versus-cover check against the new spawns.
- **L1 (for 4.5):** after a stage change, the old chase and flank fields stay in use until the budgeted rebuild finishes. 4.5 must call `rebuildFlowFieldNow` when it changes the stage at the build start.
- **L2 (for 4.5/4.8):** `CoverView` always skips the bus, and `fillObstacles` dedupes it by exact rectangle. If a stage moves or removes the bus, `city_bus` stays in `map.solids`.
- **L3 (fixed in the merge):** "Decay stage (cover)" added to `CHEAT_STRINGS`.
- **L4 (accepted, D6):** bots still aim at the nearest zombie, even one behind cover.
