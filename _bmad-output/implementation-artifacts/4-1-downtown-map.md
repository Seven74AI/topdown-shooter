# Story 4.1: Downtown map

Status: review

## Story

As a player,
I want to fight in a hand-made Downtown with an open intersection, narrow alleys and landmarks,
so that the map gives us places to hold and choices to make.

> **EPIC 4 BRIEF** (§11 of `epic-3-retro-2026-11-22.md`) is this story's checklist. Lines 2 (same map on every copy, list them), 3 (builder-written spatial fuzz test), 4 (map obstacles join the nav grid), 7 (placement clearance vs spawn points), 9 (liveness asserts, mutation-proven tests), 13 (no inline numbers), 15 (perf with load), 17 (zod-parsed Tiled JSON in `shared/map`), 18 (say what was not verified) and 19 (notes for the merge) apply most.

## Acceptance Criteria

1. **Authored map (FR54).** `tools/maps/downtown.tmx` (Tiled XML) and its export `apps/client/public/assets/maps/downtown.tmj` (Tiled JSON) describe a 48 × 32 m Downtown with a central intersection, 3 alleys, a gas station corner, a crashed city bus mid-map and a small parking lot. Layers: object layers `collision`, `cover`, `spawns`, `hazards`, and group layers `stage1_evening`, `stage2_panic`, `stage3_breakdown`, `stage4_ruins`, `stage5_collapse` (4–5 empty). Tiled is not installed here, so both files are written by a committed generator, `tools/maps/buildDowntown.ts` (`npm run maps:build`), which a designer can stop using once they edit in Tiled.
2. **Loader (`packages/shared/src/map`).** A zod schema parses the Tiled JSON (brief line 17); `loadTiledMap(json)` turns it into a `DistrictMap` (size, collision boxes, cover, spawns, hazards, visual stage objects, content `version`), refusing anything the sim can't use (non-orthogonal or infinite maps, rotated or off-lattice collision boxes, objects off the map, missing layers) with messages that name the layer and object.
3. **Replaces the placeholder street.** Every host that runs a real run creates its World with `DOWNTOWN_MAP`: server `RunController`, solo `LocalSimHost`, the client mirror `NetSimHost` and its `Predictor`, `headlessRun` (bots/sims). Players and zombies collide with the map's collision boxes exactly like with buildings (same push-out, same order: map boxes then buildings), on the server and in prediction. The flow field treats them as walls (never passable, never attacked), barricade placement refuses them, free-spot returns avoid them. The client refuses to join a server with a different map (`mapVersion` join option → `balance_mismatch`, "Please refresh").
4. **Playable.** Zombies from every spawn reach the players; no free area is cut off; the team start and every spawn (with its jitter) are clear of collision; barricade placement (`spawnClearM`) still works.
5. **Client draws it** (placeholder look; Story 4.9 does the Dead City look): ground, sidewalks/markings from `stage1_evening`, collision boxes as blocks (the bus distinct), cover outlines, hazard tint.
6. **Tests:** load `downtown.tmj` and check size, collision cells and named objects; loader refusals; a random-layout fuzz test on this map (random legal barricade layouts × many ticks: no body inside a box, no stall, zombies reach a player); prediction = server on the map; liveness asserts; each new test proven to fail under one mutation.

## Tasks / Subtasks

- [x] T1 Map model + generator: `tools/maps/buildDowntown.ts` writes `.tmx`, `.tmj` and the shared copy (AC 1)
- [x] T2 `shared/map/tiledSchema.ts` (zod) + `shared/map/loadTiledMap.ts` + `shared/map/downtown.ts` (`DOWNTOWN_MAP`) + `mapCollisionCells` (AC 2)
- [x] T3 `DistrictMap` gains `name`, `version`, `solids`, `cover`, `hazards`, `stages`; the placeholder gets empty lists (AC 2, 3)
- [x] T4 Collision: `buildings/collision.ts` (push-out, spot test, segment test) and `footprintBlocked` include map solids; `movePlayers` / `updateZombies` gates (AC 3)
- [x] T5 Nav grid: wall cells from the map (static), unreachable in Dijkstra and next-cell, wall-only pinches closed, near-wall cost, vertex clearance (AC 3, 4)
- [x] T6 Hosts: RunController, LocalSimHost, NetSimHost (+Predictor), headlessRun use `DOWNTOWN_MAP`; `mapVersion` join check; snapshot digest (AC 3)
- [x] T7 Client `StreetView` draws the map (AC 5)
- [x] T8 Tests + mutations (AC 6); browser checks; gates; perf with load

## Dev Notes

### Decisions (non-interactive; the user delegated them)

- **D1 Collision as rectangles, not tiles.** The `collision` layer is an object layer of axis-aligned rectangles (architecture › Maps: "collision and cover as object layers"). The sim already does circle-vs-box (Story 3.4), so a map box is treated exactly like a building box. Boxes must lie on the 0.5 m lattice (`BUILD_GRID_M` = `FLOW_CELL_M`), so the "collision grid" (`mapCollisionCells`, 0.5 m cells) is exact, not conservative. No tileset (Tiled opens object-only maps); 1 tile = 1 m = 32 px (`tilewidth`), objects in pixels, converted by `metersPerTile` (map property).
- **D2 Where the data lives.** Canonical export: `apps/client/public/assets/maps/downtown.tmj` (AC 1). The shared package can't import from the client app (sharedBoundary rule), so the generator also writes `packages/shared/src/map/data/downtown.tmj.json`, imported like the balance JSON; a test fails if the two differ (message names the sync command `npm run maps:sync`, which copies a Tiled-edited export into shared). Server, solo, mirror and prediction all use the same imported object: no fetch, no async boot.
- **D3 Placeholder stays for mechanic tests.** `createWorld` still defaults to `PLACEHOLDER_MAP` (the open street) so the ~1,000 existing mechanic tests keep their geometry; every production host passes `DOWNTOWN_MAP` explicitly, and a test asserts each host's World (and the Predictor's) uses it (brief line 2).
- **D4 Map boxes are walls, buildings stay breakable.** Nav grid: `wallAt` cells are never entered (skipped in `settleOne` and `flowNextCell`), vertices touching a wall are not free, an edge narrower than a body whose ends touch only walls (no building) is closed. A pinch between a wall and a building carries the building id (zombies break it, Story 3.5 rule). Cells next to a wall get `nearWallCostM` like cells next to a building. Zombies never attack map boxes (`touchingBuilding` reads buildings only).
- **D5 The bus is a collision box** (GDD: "permanent solid cover") and also a `cover` object of `kind: bus` for Story 4.2's bullet rule. Parked and street **cars are cover objects only** (no collision in 4.1): Story 4.2 makes all cover kinds block movement and join the nav grid, and 4.8 moves cars, so they must not be baked into static collision. Their outlines are drawn.
- **D6 Bullets are unchanged** (they still fly over map boxes, like over barricades). Which obstacles stop shots is Story 4.2 (cars, bus) — recorded as an open item for 4.2: buildings' walls should stop shots too (server, rewound shots, client cosmetic projectile, turret).
- **D7 Spawns.** The `spawns` layer holds point objects with `minStage` (all 1 here) at street ends and alley mouths on the map edge, because the current wave director jitters along the edge (`onHorizontalEdge`). Rules (stage filter, 6 m skip, spawns stream) are 4.3; the wave director simply reads `world.map.spawnPoints` as before. A test checks each spawn ± (`spawnJitterM` + largest zombie radius) is clear of collision.
- **D8 Team start** stays the map centre ± `spawnOffsetM` (the intersection); a test checks it's clear.
- **D9 Map numbers** live in map properties (`metersPerTile`, `cellM`) and object properties (`kind`, `minStage`), never inline; the generator's layout table is data, not sim code.
- **D10 `mapVersion`.** `DistrictMap.version` = FNV-1a of the canonical parsed map. The client sends it as optional `mapVersion` in the join options; the server refuses a different one with `balance_mismatch` ("Please refresh"). Optional so old test helpers keep working.
- **D11 Visual stage groups** each hold object layers of rectangles with a `kind` (`sidewalk`, `crosswalk`, `lane`, `canopy`, `debris`, …). The client draws `stage1_evening` only; swapping groups is Story 4.5/4.9.
- **D12 Snapshot** (`snapshotWorld`) records the map's `name` and `version` (not the whole object; the map is static data).

### Current state (read before changing)

- `map/placeholderMap.ts`: `DistrictMap` = bounds + 12 edge spawn points; no obstacles. `createWorld` defaults to it.
- `buildings/collision.ts`: `circleHitsBuilding`, `pushOutOfBuildings` (settle passes over buildings + map clamp, axis fallback), `segmentHitsBuildings` — all iterate `world.buildings.list` only. Callers gate on `buildings.list.length > 0` (`movePlayers`, `updateZombies`).
- `zombies/flowField.ts`: `rasterizeBuildings` runs on `buildings.version` change; buildings are costly passable cells; clearance via `vertexFree` + pinches. Nav grid only exists where pathing runs (server/solo), the Predictor/mirror get a 1-cell placeholder.
- `buildings/buildings.ts › footprintBlocked`: map edge, spawn clearance, buildings, players, zombies.
- `player/freeSpot.ts › spotBlocked`: edge, players, zombies, buildings.
- Client `render/StreetView.ts`: asphalt + 4 m grid.

### Must be preserved

Push-out determinism (fixed order, only + − × ÷ sqrt min max), no per-tick allocation, Story 3.5 pinch rule and fuzz results, prediction = server (`tools/netsim`), all existing tests on the open street.

### Testing

`packages/shared/src/map/*.test.ts` (loader, downtown data, collision cells, named objects, refusals, tmj = shared copy, generator up to date), `zombies/downtown.fuzz.test.ts` (random barricade layouts), hosts-use-Downtown test, prediction-vs-server walk into the bus, `PERF_ASSERT=1` tick benchmark on Downtown.

### References

- `_bmad-output/planning-artifacts/epics.md` › Story 4.1, 4.2, 4.3, 4.5, 4.8
- `_bmad-output/planning-artifacts/game-architecture.md` › Maps (l.167), ADR-05, Decay Stage Engine, Tiled layer names (l.426)
- `_bmad-output/planning-artifacts/gdds/gdd-topdown-shooter-2026-11-21/gdd.md` › District 1 — Downtown (l.139)
- Story 3.4 / 3.5 files (collision and pinch rules)

## Dev Agent Record

### Agent Model Used

Claude Opus 5.5 (claude-opus-5-5)

### Debug Log References

- Fuzz first run: 49 "failures" were test-side: (1) zombie positions are Float32 (a ulp near 38 m ≈ 4e-6 m), so a 1e-6 overlap tolerance flagged zombies resting exactly on a face → tolerance 1e-5 for zombies, 1e-9 for players (float64); (2) "touches a player" can't hold for 15 zombies round one player (only the inner ring touches) → "reached" = within 3 m with a clear line (no map box or building between). After that: 36/36 layouts clean, 540/540 zombies reached, 6 layouts broke a building.
- Existing tests that placed buildings at fixed spots now inside Downtown buildings (room/controller tests) were moved to free street spots; the Story 3.5 tick-cost layout and the 2.7/2.12 kiting netsim are pinned to `PLACEHOLDER_MAP` (their geometry was drawn for the open street).

### Completion Notes List

- **Map** (`tools/maps/buildDowntown.ts` → `downtown.tmx`, `downtown.tmj`, shared copy): 48 × 32 m, 1 tile = 1 m = 32 px. Streets 8 m wide crossing at (24, 16); NW: corner shop + apartments with **alley 1** (x 8–11) between; NE: **gas station** (kiosk, 2 pump islands, canopy + gas-leak hazard zone); mid-map **crashed bus** [30, 40] × [14.5, 17] in the east arm (collision + `cover` kind bus); SW: diner, **alley 2** (x 7–10) against the **parking lot** wall, lot with 3 parked cars (cover); SE: offices + warehouse with **alley 3** (x 38–41). 9 spawns (4 street ends, 3 alley mouths, gas station, parking lot), all `minStage` 1. 2 street cars, a stage-2 police barrier, stage-3 sandbags (cover data); 3 hazards; stage groups 1–3 with ground props/debris, 4–5 empty.
- **Loader**: zod schema of the Tiled JSON subset (`tiledSchema.ts`) + `loadTiledMap` (semantic checks with layer/object names, lattice snapping, content version) → frozen `DistrictMap`.
- **Sim**: map solids join `pushOutOfBuildings`, `circleHitsBuilding` (free spots), `segmentHitsBuildings` (zombie line of sight), `footprintBlocked` (placement); `hasObstacles` gates movement/zombies; nav grid walls (D4). Hosts default to `DOWNTOWN_MAP`; `mapVersion` join check; snapshot digest has `map.name/version`.
- **Client**: `StreetView` draws ground props, hazards (faint), solids (bus in yellow), cover outlines.
- **Tests added** (each proven to fail under one mutation, restored after):
  | Test | Mutation | Result |
  |---|---|---|
  | `map/downtown.test.ts` collision cells | `mapCollisionCells` rasterizes one cell too many (`ceil(maxX/cell)` without −1) | 2 failed |
  | `map/downtown.test.ts` connectivity / narrow gaps | data: parking wall moved to x 7.5 (0.5 m slot to the diner) | 2 failed |
  | `map/loadTiledMap.test.ts` refusals | lattice check always true | 1 failed |
  | `tools/maps/downtownFiles.test.ts` | shared copy differs (renamed object) | 1 failed |
  | `tools/netsim/hostMaps.test.ts` | LocalSimHost without the Downtown default | 1 failed |
  | `tools/netsim/barricade.test.ts` › Story 4.1 | Predictor ignores its map | 1 failed |
  | `RunRoom.test.ts` › mapVersion | server check disabled | 1 failed |
  | `zombies/downtown.fuzz.test.ts` | (a) map solids skipped in the push-out; (b) walls enterable in the Dijkstra; (c) map solids skipped in the line of sight | 1 failed each |
  | `run/tickCostDowntown.test.ts` liveness | players never fire (kills 0) | 1 failed |
- **Browser (Python Playwright + Chromium, server :2621, Vite :5221)**, screenshots in `/tmp/s41shots/`: solo — the survivor walking east stops at x 29.6 (bus face 30 − 0.4), walking west at y 8.6 stops at x 18.4 (apartments face 18 + 0.4); after Ready, wave 1 zombies arrive (3 within 3 m, nearest 0.75 m); full-map overview screenshot. Online (2 browsers): host's server position, predicted position and the guest's view of the host all agree at (29.6, 14.5) against the bus and (18.4, 7.3) against the apartments; guest overlay corrections 0 / snaps 0; wave 1 zombies reach both (host downed, guest 5 zombies within 3 m). No page errors.
- **Not verified**: real phones / touch; `?lag=150&jitter=20` in the browser (the netsim covers 75 ± 10 ms one-way); headless Chromium runs at ~8–22 fps; Tiled itself (not installed: the `.tmx` was written by the generator and never opened in Tiled); `runHeadless`'s Downtown default is not asserted by a test (it has no World accessor; the fiveWave sim tests pass on it); bullets still fly over map boxes (D6, Story 4.2).
- **Perf** (`PERF_ASSERT=1`, `tickCostDowntown.test.ts`, 4 players + 150 Walkers, open street vs Downtown, tick only): added p99 −0.78 / +0.05 / +0.30 ms in three runs (means +0.02 / +0.003 / +0.06 ms) at load averages 1.7–2.0 (another builder was running; not the < 1 the brief asks for). Bandwidth added: 0 B/s (the map is static bundled data; nothing synced). Story 3.5's benchmark (pinned to the open street) still passes under `PERF_ASSERT=1`.
- Gates on `story-4-1`: `npm run typecheck && npm run lint && npm test && npm run build` pass (160 files, 1,166 tests). The work branch moved to 95d2711 meanwhile (docs only: `HANDOFF.md`, `docs/hermes-go-live.md`), no overlap with this story.

### Notes for the merge (brief line 19)

- **`packages/shared/src/map/*` (new)**: `districtMap.ts` holds the types (`DistrictMap` now has `name`, `version`, `solids`, `cover`, `hazards`, `stages`; `spawnPoints` are `MapSpawn` with `name`/`minStage`). `placeholderMap.ts` re-exports the types. Story 4.3 reads `spawnPoints[i].minStage`; 4.5 applies mutations to a World-owned copy (the loaded map is frozen: copy `solids`/`cover` into World state, and rebuild `nav.wallAt` — today it is written once in `createNavGrid`).
- **`buildings/collision.ts`**: every obstacle test visits `world.map.solids` first, then buildings; `hasObstacles(world)` is the movement gate. Story 4.2 adds cover boxes here (same pattern) — note the bus is both a collision box and a `cover` bus object (same rect): skip cover objects that duplicate a solid, or drop `city_bus` from `collision` when 4.2 makes cover collide.
- **`zombies/flowField.ts`**: new `wallAt`, `closedE/S`, `flowEdgeClosed`; `createNavGrid/createPathingState` take the map's solids. Cover joining the nav grid (brief line 4) should write into `wallAt`-like static cells or as costly cells; walls are skipped in `settleOne`/`flowNextCell`.
- **`zombies/zombieAi.ts` / `player/movement.ts`**: only the gate changed (`hasObstacles`).
- **`buildings/buildings.ts › footprintBlocked`**: map solids refuse placement (touching allowed). Brief line 7 (spawn clearance per active stage) is 4.3's.
- **Hosts**: `RunController`, `LocalSimHost`, `NetSimHost` (+ `Predictor` via its map), `runHeadless` take `map?: DistrictMap`, default `DOWNTOWN_MAP`. `createWorld` still defaults to `PLACEHOLDER_MAP` (tests).
- **`net/messages.ts` join options**: optional `mapVersion`; `RunRoom.checkAuth` refuses a different one as `balance_mismatch`; `connection.ts` and `tools/bots/botClient.ts` send it.
- **`core/worldSnapshot.ts`**: `map` is now `{ name, version }` (4.4's digest: the map no longer contributes its whole object).
- **Schema / syncState / stateView / devThrottle / mirror**: untouched (the map is static bundled data, identical on both sides; nothing goes on the wire). `runStateMachine.startBuild` and balance JSON: untouched.
- **RNG / seed code**: untouched (4.4 runs in parallel). The fuzz test uses `createRng` only for its own layouts.
- **Tests moved to free spots**: room/controller/syncState tests (placements at old open-street coordinates). If 4.4 adds tests that place buildings at fixed spots through `RunController`, use street spots (e.g. lattice (12, 30) = (6, 15) m) or pass `map: PLACEHOLDER_MAP`.

### File List

- New: `tools/maps/buildDowntown.ts`, `tools/maps/downtown.tmx`, `tools/maps/downtownFiles.test.ts`, `apps/client/public/assets/maps/downtown.tmj`, `packages/shared/src/map/{districtMap,tiledSchema,loadTiledMap,collisionCells,downtown}.ts`, `packages/shared/src/map/data/downtown.tmj.json`, `packages/shared/src/map/{downtown,loadTiledMap}.test.ts`, `packages/shared/src/zombies/downtown.fuzz.test.ts`, `apps/server/src/run/tickCostDowntown.test.ts`, `tools/netsim/hostMaps.test.ts`
- Modified (shared): `map/placeholderMap.ts`, `buildings/collision.ts`, `buildings/buildings.ts`, `zombies/flowField.ts`, `zombies/zombieAi.ts`, `player/movement.ts`, `core/world.ts`, `core/worldSnapshot.ts`, `bots/headlessRun.ts`, `net/messages.ts`, `index.ts`
- Modified (server): `run/RunController.ts`, `rooms/RunRoom.ts`; tests `RunRoom{,.3-5,.buildings,.repair,.turret}.test.ts`, `schema/syncState.test.ts`, `run/RunController.test.ts`, `run/tickCostFlowField.test.ts`
- Modified (client): `render/StreetView.ts`, `sim/LocalSimHost.ts`, `sim/NetSimHost.ts`, `net/prediction.ts`, `net/connection.ts`
- Modified (tools): `bots/botClient.ts`, `netsim/barricade.test.ts`, `netsim/hitsSim.ts`; `package.json` (`maps:build`, `maps:sync`)
