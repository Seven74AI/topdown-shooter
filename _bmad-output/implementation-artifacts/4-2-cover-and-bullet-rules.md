# Story 4.2: Cover and bullet rules

Status: in-progress

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

- [ ] T1 `map/decayStage.ts` (`currentDecayStage`, `FIRST_DECAY_STAGE`), `map/obstacles.ts` (`ObstacleState`, `createObstacles`, `applyCoverStage`), `COVER_STOPS_SHOTS` per kind; `World.obstacles`; `WorldDebug.decayStage` (AC 1, 2)
- [ ] T2 Collision: `buildings/collision.ts`, `buildings/buildings.ts › footprintBlocked` read `world.obstacles.solids` instead of `world.map.solids`; nav grid walls from it (`createPathingState`), `setNavWalls` for a stage change (AC 1, 2)
- [ ] T3 Shots: `combat/cover.ts` `shotBlockT` (swept slab entry, earliest box); `updateProjectiles` clips hits and stops; aim assist and turret target choice respect it (AC 3, 5)
- [ ] T4 Client: `CosmeticProjectiles.update` stops at the same box; `CoverView` draws active cover; StreetView stops drawing cover outlines; dev cheat "Decay stage" (solo only; online disabled with a hint) (AC 5, 6)
- [ ] T5 Snapshot digest: `obstacles` stage + version (AC 2)
- [ ] T6 Tests + mutations; fuzz extension; netsim near-cover; prediction vs server into a car; perf with load (AC 7)
- [ ] T7 Browser check (Playwright): bullets stop at a car, pass over sandbags (stage 3 via the cheat); gates; merge notes

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

### Completion Notes List

- Ultimate context engine analysis completed - comprehensive developer guide created.

### File List
