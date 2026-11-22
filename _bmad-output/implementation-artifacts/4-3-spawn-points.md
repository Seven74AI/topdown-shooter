# Story 4.3: Spawn points

Status: review

## Story

As a player,
I want zombies to pour in from alleys, manholes and broken shop windows,
so that the horde feels like it comes out of the city.

> **EPIC 4 BRIEF** (§11 of `epic-3-retro-2026-11-22.md`) is this story's checklist. Lines 3 (fuzz test, extended), 7 (placement clearance vs the spawns of the coming stage; spawns stream; 6 m skip), 8 (randomness only from `streams.spawns`), 9 (liveness, mutation-proven tests), 10 (player-visible properties as tests), 13 (ticks, no per-tick allocation, numbers in balance JSON / map properties), 18 (say what was not verified) and 19 (notes for the merge) apply most.

## Acceptance Criteria

1. **Spawns tell the story (FR32).** The `spawns` layer of Downtown (written by `tools/maps/buildDowntown.ts`, `.tmx`/`.tmj`/shared copy regenerated) holds street ends, alley ends, manholes and broken shop windows. Each spawn has a `kind` property (`street`, `alley`, `manhole`, `window`; the loader refuses others and a missing one) and a `minStage` spread over stages 1–3. Stage 1 keeps the 9 edge spawns of Story 4.1; stages 2 and 3 open manholes and windows inside the district. Every spawn sits outside collision and cover boxes (every stage), is reachable (flow field), and its jitter area (the jitter segment along its `jitterAxis`, grown by the largest zombie radius) overlaps no collision or cover box. A map needs at least one stage-1 spawn (loader refusal).
2. **Stage.** Zombies come only from spawn points with `minStage ≤ decayStage(world)`. `decayStage` is one trivial accessor in `packages/shared/src/decay/decayStage.ts` that Story 4.5 drives; until then it is 1 (a dev-only `world.debug.decayStage` override lets tests, the dev cheat and the dev view preview stages 2–3, solo only).
3. **Skip near players.** A spawn point closer than `waves.spawnMinPlayerDistanceM` (6 m, balance) + the jitter to any living player (standing **or downed**; out players are off the map) is skipped for that spawn, so no zombie appears within 6 m of a living player. If every active spawn is that close, the batch waits (queue kept, the rush waits too) and is retried each spawn interval; after `waves.spawnPick.allNearMaxWaitS` of waiting the director spawns at the active spawn farthest from the players, so a wave can never stall.
4. **Spread.** The pick draws only from `world.streams.spawns`, weighted away from the sides (N/E/S/W of the map centre) and points of the last `spawnPick.recentPicks` picks (integer weights from balance). No allocation per tick. Same seed → same spawns.
5. **Barricades.** Placement clearance (`buildings.spawnClearM`) checks every spawn point active at the coming stage (= `decayStage(world)` during a build phase; 4.5 applies a new stage at the build start, before placement). A spawn whose clearance a building overlaps (placed before the spawn opened) is closed while the building stands (the director skips it; the dev view shows it as blocked).
6. **Dev view.** A dev-only "Collision / grid view" (cheat panel ⚙ / backtick) draws hitboxes (map boxes, buildings, bodies), the 2 m spatial grid and every spawn point with its stage, kind and state (active, near a player, blocked by a building, not yet open).
7. **Tests:** player-visible properties ("zombies never appear within 6 m of us", "all waves still finish when we stand on spawns", "spawns come from several sides"), stage filter, building-blocked spawns, placement by stage, determinism, data checks (kinds, stages, jitter area vs collision and cover, reachability), loader refusals, the Downtown fuzz test extended to stages 1–3; liveness asserts; each new test proven to fail under one mutation.

## Tasks / Subtasks

- [x] T1 Map data: `MapSpawn.kind` / `jitterAxis`; loader reads `kind` (required, enum), `jitterAxis` (optional, default = the 4.1 edge rule), refuses a map without a stage-1 spawn; placeholder spawns get `kind: street` (AC 1)
- [x] T2 Generator: new spawns with kinds/stages/axes; regenerate (AC 1)
- [x] T3 `decay/decayStage.ts` + `world.debug.decayStage` (AC 2)
- [x] T4 `waves/spawnPick.ts`: state per spawn, weighted pick, wait/fallback; `waveDirector` uses it; `jitteredSpawn` honours `jitterAxis`; WaveState + snapshot (AC 2–5)
- [x] T5 `footprintBlocked` filters by stage (AC 5)
- [x] T6 Client: dev collision/grid view + stage preview (solo) in the cheat panel (AC 6)
- [x] T7 Tests + mutations; fuzz extension; browser check; gates; perf with load (AC 7)

## Dev Notes

### Decisions (non-interactive; the user delegated them)

- **D1 Layout (19 spawns).** Stage 1 (evening; 9, unchanged positions from 4.1): 4 street ends, 3 alley ends, gas-station north edge, parking-lot south edge — the horde comes from outside. Stage 2 (panic; +5): manholes in the west and north streets, broken windows of the corner shop, the diner and the offices. Stage 3 (breakdown; +5): manholes in the south and east streets, windows of the apartments, the warehouse and the gas kiosk. Windows sit 0.6 m off the building face, jittered along it; manholes jitter along their street. Every new spawn is ≥ 9 m from the team start, so wave 1 isn't skipped at the start.
- **D2 Kinds** `street | alley | manhole | window` (enum `SPAWN_KINDS` in `districtMap.ts`; 4.7's "collapsed walls" can add a kind). `kind` is required on Tiled spawn objects; the placeholder uses `street`.
- **D3 Jitter axis per spawn.** The 4.1 rule (x on the top/bottom edges, y otherwise) pushes a window's zombie into its building, so `MapSpawn.jitterAxis` (`x`/`y`, Tiled property, default = the 4.1 rule) decides it; `jitteredSpawn` keeps its signature and draws (one `range` per zombie), and falls back to the 4.1 rule for points without an axis.
- **D4 Stage accessor** `decayStage(world)` in `decay/decayStage.ts`: `world.debug.decayStage ?? 1`. The override is dev/test only (not synced; the cheat is solo-only). Story 4.5 replaces `1` by its World stage. One accessor serves the wave director, placement and the dev view.
- **D5 6 m rule.** Kept `waves.spawnMinPlayerDistanceM` (6) where it is; the skip distance is 6 m + `spawnJitterM` from the point, so the zombie itself is ≥ 6 m away. "Living" = `alive` or `downed`.
- **D6 All spawns near players:** wait, then the farthest. While no active spawn is clear the batch is held (no zombie leaves the queue; `waves.spawnHeldSinceTick`), retried each interval; after `spawnPick.allNearMaxWaitS` (2 s) of holding the director uses the active spawn farthest from the living players (one zombie per pick; the hold resets on the next clear pick). Players camping every spawn thus slow the wave a little but can't stall it, and the property "never within 6 m" holds whenever any active spawn is clear.
- **D7 Spread (side first, then point).** Side = the map side the point faces from the centre (normalised by width/height). First a side among the sides with an OPEN point, weight max(`minWeight`, `baseWeight` − `sidePenalty` × picks of that side in the last `recentPicks`); then a point of that side, weight max(`minWeight`, `baseWeight` − `pointPenalty` × picks of that point). Two `streams.spawns.int` draws per pick (was one uniform `int`); a preallocated ring of recent picks in `WaveState` (snapshotted). A first try weighted points directly: stage 1 has 4 south spawns and 1 west, so the south got 40 %; side-first gives each side ~25 % (measured below).
- **D10 Hold resets per wave.** `beginWave` clears the hold, so every wave gets the full wait before the farthest fallback (found by the "all waves finish" test: wave 2 inherited wave 1's hold).
- **D8 Building-blocked spawns** (AC 5): a spawn is closed while a building overlaps its `spawnClearM` circle — the same test as placement, so a legally placed building never closes an active spawn. Story 4.5 may instead destroy such buildings at the build start (brief line 5, 50 % refund); the director rule stays as the safety net.
- **D9 Dev view** is a dev-only module (`debug/collisionGridView.ts`) imported only by `DevCheats.tsx`, so it leaves release builds; labels are Phaser texts in world space (`S2 manhole`), colours by state; redrawn every frame only while on.

### Current state (read before changing)

- `waves/waveDirector.ts`: `pickSpawnPoint` loops every spawn, nearest *alive* player (downed ignored), "far enough" = `spawnMinPlayerDistanceM + spawnJitterM`, uniform `streams.spawns.int` among them, else the farthest. `jitteredSpawn` (exported for the 4.1 fuzz) jitters along the edge axis. `spawnWaveZombie` → `spawnZombie`. `collectAlivePlayers` also stops the director when no one is standing.
- `map/loadTiledMap.ts`: spawn points (point objects, inside the map, not inside a collision box), `minStage` 1–5; `MapSpawn { name, x, y, minStage }`.
- `buildings/buildings.ts › footprintBlocked`: every spawn's `spawnClearM` circle refuses placement (no stage filter).
- Client: no collision/grid view yet (architecture › Debug tools lists it). Cheat panel `debug/DevCheats.tsx` (⚙ / backtick, dev builds only, `tools/checks/noCheatsInRelease`).
- Players: team start = centre ± 1.5 m (`player/spawn.ts`); statuses `alive | downed | out`.

### Must be preserved

Wave sizes/mix/rush/maxAlive behaviour and all wave-director tests; `jitteredSpawn` signature; spawns only from `streams.spawns`; the 4.1 data tests (connectivity, jitter area) on the new spawns; placeholder-map tests (all its spawns are stage 1).

### References

- `_bmad-output/planning-artifacts/epics.md` › Story 4.3; FR32. GDD › District 1 (spawns: alleys, manholes, broken shop windows; decay opens more). Architecture › Decay Stage Engine (spawn points are a stage mutation), Debug tools (collision and grid view).
- Story files 4.1 (D7, merge notes), 4.4 (streams).

## Dev Agent Record

### Agent Model Used

Claude Opus 5.5 (claude-opus-5-5), builder, worktree `story-4-3`.

### Debug Log References

- The worktree had no `node_modules`, so `@topdown/shared` resolved to the main checkout's package (a test compared against the main repo's map). Fixed by hard-linking the main `node_modules` into the worktree (`cp -al`; the workspace links are relative, so they point at the worktree's packages); caches removed from the copy.
- First "camping" sims failed for a test-side reason: a build start returns downed players to the team, so campers are put back on their spot during every build phase.

### Completion Notes List

- **Map** (`buildDowntown.ts` → `.tmx`, `.tmj`, shared copy): 19 spawns — stage 1: `street_west/east/north/south`, `alley_1/2/3_mouth`, `gas_station_north`, `parking_lot_south` (unchanged positions, now with `kind` street/alley); stage 2: `manhole_west` (12, 18), `manhole_north` (24, 4), `window_corner_shop` (4, 10.6), `window_diner` (3.5, 21.4), `window_offices` (34, 21.4); stage 3: `manhole_south` (22, 27), `manhole_east` (44, 13.5), `window_apartments` (18.6, 5), `window_warehouse` (44.5, 21.4), `window_gas_kiosk` (44.5, 6.6). Open spawns per stage 9 / 14 / 19, all four sides at each stage.
- **Loader**: `kind` required (enum), `jitterAxis` optional (default = 4.1 edge rule), at least one stage-1 spawn.
- **Sim**: `decay/decayStage.ts` (`world.debug.decayStage ?? 1`); `waves/spawnPick.ts` (states CLOSED/BLOCKED/NEAR/OPEN, side-first weighted pick, hold → farthest); `waveDirector` uses it, `jitteredSpawn` honours `jitterAxis`; `footprintBlocked` clears only spawns open at `decayStage`. Balance: `waves.spawnPick { recentPicks 6, baseWeight 12, sidePenalty 2, pointPenalty 4, minWeight 1, allNearMaxWaitS 2 }`; the 6 m stays `waves.spawnMinPlayerDistanceM`.
- **Client (dev only)**: cheat panel "Collision / grid view" (`debug/collisionGridView.ts`: 2 m grid, map boxes, cover, buildings, body hitboxes, spawn discs coloured by state with jitter segment and `S<stage> <kind> / <state>` label) and "Spawn stage preview" (solo; disabled online); panel line shows `stage N`. Both strings added to the release-bundle cheat scan.
- **Measured spread** (solo at the centre, 3 waves, 96 zombies): stage 1 N 25 / E 27 / S 24 / W 24 %; stage 2 27 / 27 / 20 / 26 %; stage 3 22 / 25 / 26 / 27 %.
- **Tests added**: `waves/spawnPoints.test.ts` (8: never within 6 m with campers at stages 1–3 incl. a downed camper; all waves finish with 4 campers and with every spawn camped (hold 2 s, then farthest); a short camp only delays; several sides; stage filter; placement by stage + building-closed spawn; dev view states; determinism), `map/loadTiledMap.test.ts` (+1 read, +4 refusals), `map/downtown.test.ts` (+1 story/stages/sides/team distance; jitter-area test now through `jitteredSpawn`, against collision **and cover**), `zombies/downtown.fuzz.test.ts` (random build stage 1–3 and fight stage ≥ it; zombies only at usable spawns; usable jitter areas clear of buildings; liveness: all three stages, ≥ 1 spawn closed by a building). Fuzz run: 36 layouts, 408 buildings, 758 zombies reached a player, stages 1/2/3, 7 spawns closed by a building.
- **Mutations proven** (each makes its test fail, then reverted; script outside the repo):
  | # | Mutation | Failing test |
  |---|---|---|
  | M1 | downed players don't count for the 6 m rule | never within 6 m |
  | M2 | no farthest fallback (hold forever) | all waves still finish |
  | M3 | no hold (fallback at once) | a short camp only delays |
  | M4 | side weight summed per point (no side-first) | several sides |
  | M5 | stage ignored in the pick | only from spawns open at the stage |
  | M6 | placement clears every spawn (no stage filter) | brief line 7 |
  | M7 | buildings never close a spawn | brief line 7 |
  | M8 | out players close spawns | dev view states |
  | M9 | pick roll from `Math.random` | same seed, same spawns |
  | M10 | buildings never close a spawn | Downtown fuzz (jitter areas under buildings) |
  | M11 | loader skips the kind check | 2 loader refusals |
  | M12 | loader skips the stage-1 check | loader refusal |
  | M13 | `jitteredSpawn` ignores `jitterAxis` | jitter area clear |
  | M14 | data: `manhole_north` at (24, 6), on the stage-2 barrier (cover only) | jitter area clear |
  | M15 | data: `manhole_west` opens at stage 1 | spawns tell the story |
- **Browser (Python Playwright + Chromium, headless 1280×720, server :2632, Vite :5232, temp config deleted)**, screenshots `/tmp/s43/shots/`: solo `?solo&debug=1`, whole map in view; grid view at stage 1 (9 green edge spawns, 10 grey "closed" manholes/windows, labels `S2 manhole / closed` …), stage preview 3 (all 19 open; panel `stage 3`), then Ready → wave 1: 16 zombies from 11 spawns on all four sides (N 4, E 2, S 6, W 4 in the last run), all stages used, nearest first sighting 11.4 m from the player; no page errors.
- **Perf** (`PERF_ASSERT=1`, load 0.95): `tickCostDowntown` passes (Downtown p99 0.489 ms, added p99 −0.001 ms; that benchmark spawns directly, no director). Ad-hoc pick benchmark: 2.9 µs per pick (stage 3, 4 players, 22 buildings) → ~6 µs on a spawning tick (2 picks per 0.25 s), at load 0.74. No per-tick allocation (scratch arrays grow once per map). Bandwidth added: 0 B/s (map is static data; the stage override is dev-only and never synced).
- **Not verified**: online play in a browser (the director runs only on the server; the mirror's dev view uses interpolated positions, so its "near player" colours may differ slightly from the server's); the stage preview online (disabled by design); real phones / touch; `?lag`; headless Chromium ran at ~13–26 fps; Tiled itself; how 4.5 drives the stage (only the accessor exists); a 4-player online wave from camped spawns (covered by sims only).
- Gates on `story-4-3` (merged with `claude/epic-2-continue` 0f2d559, a fast-forward): typecheck, lint, test (166 files, 1,212 passed, 3 skipped), build green.

### Notes for the merge (brief line 19)

- **`packages/shared/src/decay/decayStage.ts` (new) — the one stage accessor.** `decayStage(world) = world.debug.decayStage ?? 1`. Story 4.2 may add the same accessor: keep a single file; 4.5 replaces `1` by its World stage and keeps the debug override first. Readers: `waves/spawnPick.ts`, `buildings/buildings.ts › footprintBlocked`, client `debug/collisionGridView.ts` / `DevCheats.tsx`.
- **`core/world.ts`**: `WorldDebug.decayStage: number | null` (and its initialiser). `core/worldSnapshot.ts`: `waves.recentSpawns` as an array (WaveState gains `recentSpawns`, `recentSpawnCount`, `recentSpawnHead`, `spawnHeldSinceTick`; `debug` gains `decayStage`). Digests of a given seed change (spawn draws: two per pick).
- **`tools/maps/buildDowntown.ts` / `.tmx` / `.tmj` / shared copy**: I own the `spawns` array; 4.2 owns `cover`. Object ids are numbered across layers in order (collision, cover, spawns, hazards), so the generated files will conflict when both land: take either side of the generator's arrays, then **regenerate** (`npm run maps:build`) instead of merging the generated files by hand. After the merge, the jitter-area test (`map/downtown.test.ts`) checks the new spawns against 4.2's cover too.
- **`map/districtMap.ts` / `loadTiledMap.ts` / `placeholderMap.ts`**: `MapSpawn.kind`, `jitterAxis`, `SPAWN_KINDS`; loader refusals for a missing/unknown kind, bad axis, no stage-1 spawn. Hand-written test maps need `kind` on spawn points.
- **`buildings/buildings.ts › footprintBlocked`**: only spawns with `minStage ≤ decayStage(world)` (brief line 7). For 4.5 (brief line 5): a building can now stand on a later stage's spawn; the director keeps that spawn closed (BLOCKED) while it stands. If 4.5 prefers to clear it, destroy buildings overlapping a newly opened spawn's `spawnClearM` at the build start (50 % refund) — the director rule stays as the safety net.
- **`waves/waveDirector.ts`**: spawn pick moved to `waves/spawnPick.ts`; `jitteredSpawn` keeps its signature (+ optional `jitterAxis`); `beginWave` resets the hold. `waves.json` gains the `spawnPick` block; `balanceSchema.ts` its schema (balance version changes: clients and server must ship together, as usual).
- **`index.ts`**: exports `decayStage`, `SPAWN_*`, `spawnPointStates`, `spawnSide`, `jitteredSpawn`, spawn types.
- **Client**: `debug/DevCheats.tsx` (two controls, stage in the info line), new `debug/collisionGridView.ts`; `tools/checks/noCheatsInRelease.test.ts` (+2 strings). No schema / syncState / stateView / devThrottle / mirror / Predictor change (nothing new on the wire); `runStateMachine.startBuild` untouched.
- **4.8 (moving cars)**: a car moved onto a spawn's jitter area is not checked by the director (only buildings are). If 4.8 moves cars near spawns, add cover boxes to `blockedByBuilding`'s test or keep moved cars off the spawn areas (the data test covers only the authored positions).

### File List

- New: `packages/shared/src/decay/decayStage.ts`, `packages/shared/src/waves/spawnPick.ts`, `packages/shared/src/waves/spawnPoints.test.ts`, `apps/client/src/debug/collisionGridView.ts`, this story file.
- Modified (shared): `map/districtMap.ts`, `map/loadTiledMap.ts`, `map/placeholderMap.ts`, `map/data/downtown.tmj.json`, `map/downtown.test.ts`, `map/loadTiledMap.test.ts`, `waves/waveDirector.ts`, `buildings/buildings.ts`, `core/world.ts`, `core/worldSnapshot.ts`, `config/balance/waves.json`, `config/balanceSchema.ts`, `zombies/downtown.fuzz.test.ts`, `zombies/zombieAi.test.ts` (debug snapshot shape), `index.ts`.
- Modified (client): `debug/DevCheats.tsx`, `public/assets/maps/downtown.tmj`.
- Modified (tools): `maps/buildDowntown.ts`, `maps/downtown.tmx`, `checks/noCheatsInRelease.test.ts`.
- Tracking: `_bmad-output/implementation-artifacts/sprint-status.yaml`.

## Change Log

- 2026-11-22: Story created (gds-create-story) and built: spawn kinds and stages on Downtown, stage accessor, 6 m skip with hold-then-farthest, side-first spread, stage-aware placement clearance, dev collision/grid view. Status review.
