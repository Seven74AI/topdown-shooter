# Story 4.5: Decay stage engine

Status: done

## Story

As a player,
I want the city to change between waves as the run goes on,
so that wave 5 doesn't play like wave 1.

> **EPIC 4 BRIEF** (§11 of `epic-3-retro-2026-11-22.md`) is this story's checklist; every line applies. Most relevant: 2 (ONE shared apply for server, solo, mirror, Predictor; list every copy), 3 (fuzz across stage changes), 4 (fields rebuild at the build start, never mid-wave), 5 (build-start order), 8 (randomness only from `streams.decay`), 9 (liveness, mutation-proven tests), 10 (player-visible properties), 11 (lag, hidden tab across a build start, late Game scene), 13 (ticks, no per-tick allocation, numbers in `decay.json` / map properties), 14 (bandwidth: on change only), 15 (perf with load), 18 (dev switches, say what was not verified), 19 (merge notes).

## Acceptance Criteria

1. **Timeline data (FR58).** `config/balance/decay.json` maps waves to stages (`stageByWave: [1,1,2,2,3,3,4,4,5,5]`; waves past the table keep the last stage), names the stages (`Evening`, `Panic`, `Breakdown`, `Ruins`, `Collapse`), and holds the refund share (0.5) and the relocation search rings. zod-validated like every balance file.
2. **Mutation sets in the map.** A new Tiled object layer `decay` (written by `tools/maps/buildDowntown.ts`, files regenerated) holds mutation objects with `stage` (2–5), `action` (`add | remove | ignite | block`) and per action `kind` (add: a cover kind), `target` (remove/ignite: a collision, cover or earlier-added object), `radiusM` (ignite); optional variation candidates `group` / `variant` / `pick`. The zod/semantic loader refuses bad stages, actions, kinds, targets, off-lattice boxes, inconsistent groups and more than 32 variants, naming the object. Downtown gets a minimal real set: stage 2 removes `parked_car_3`, blocks part of alley 3 (a dumpster), adds one abandoned car chosen from 2 candidates; stage 3 ignites one of 2 cars (a fire record: data only, 4.8 gives it damage). Stages 4–5 empty.
3. **One stage, one apply path.** `world.decay` holds the stage, the chosen variants and the active fire records. `currentDecayStage(world)` reads `world.decay.stage`; cover `minStage`, spawn `minStage` and the mutations are all folded into ONE shared function `applyDecayStage(world, stage, variants)` (no side effects: obstacle lists, nav walls, fires, version). Server, solo, the client mirror and the Predictor call it (brief line 2).
4. **DecaySystem at the build start only.** In `startBuild`, when the stage of the coming wave differs from the current one, in this order (brief line 5): (1) the mutations (`applyDecayStage`); (2) every building overlapping a solid is destroyed (`building.destroyed`) and its owner refunded `floor(price × 0.5)` (`money.earned`, reason `refund`, wallet only); (3) every player or zombie now overlapping a solid is moved out (shortest push-out if clear, else the free-spot search, else wider fallbacks; never left inside a box); then the usual returns (`returnOutPlayers`); (4) flow fields rebuilt now (`rebuildFlowFieldNow`, chase and flank; review 4.2 L1); then `decay.stage_changed { stage }`. Never mid-wave (test).
5. **DecayTimeline.** At World creation (= run start) the variants are picked once per group from `world.streams.decay` (partial Fisher–Yates, group order = map order). Same seed → same choices → same `worldDigest` in a replay (4.4).
6. **Network.** Schema `RunState.decayStage` (uint8) and `decayVariants` (uint32 bitmask), written by `syncState` only on change; `RunStateView` / `RUN_STATE_FIELDS` / fake room / `?lag` copy; the mirror and the Predictor apply the same `applyDecayStage` from the state (patch of the change, before the replay), so late joins, a tab that slept across a build start and a late Game scene recover. `decay.stage_changed` goes out as an event (banner). Bandwidth reported.
7. **Client.** `DecayView` draws the walls (map boxes + blocks, bus distinct), the visible stage group (`stageN_*`, N ≥ 2, over the stage-1 base), active hazards and fire records; redrawn only when `decay.version` changes. On `decay.stage_changed` the banner shows the stage name ("Panic").
8. **Dev cheat.** The solo "Decay stage (cover + spawns)" cheat calls the same DecaySystem path (renamed "Decay stage"; `CHEAT_STRINGS` updated); `world.debug.decayStage` is removed. Server dev switch `DEV_DECAY_STAGES=2,3` (dev only) overrides the wave → stage table for browser checks.
9. **Tests:** stage timing + never mid-wave (whole-run wave-time test); each action; building destruction with refund; player and zombie push-out; same-seed variants + replay digest; netsim lag agreement incl. hidden tab across a build start; "a path can still be closed" and "zombies still reach us after stage 2"; Downtown fuzz across stage changes; liveness; each new test fails under one mutation.

## Tasks / Subtasks

- [x] T1 Balance `decay.json` + schema + cross-check (AC 1)
- [x] T2 Map: `DecayMutation` / `DecayVariant` types, loader for the `decay` layer (optional layer), generator + regenerate (AC 2)
- [x] T3 `decay/` module: `decayState`, `applyDecayStage` (obstacles fold-in), `pickDecayVariants`, `stageForWave`, DecaySystem (`decayMutate`, `decayFinish`, `changeDecayStage`); `startBuild` hook; events; snapshot (AC 3–5)
- [x] T4 Free-spot helper for zombies (`findBoxFreeSpot`); refunds (`refundMoney`, reason `refund`) (AC 4)
- [x] T5 Schema/syncState/stateView/fakeRoom/mirror/Predictor; net event kind (AC 6)
- [x] T6 Client `DecayView`, StreetView split, banner; cheat; `DEV_DECAY_STAGES` (AC 7, 8)
- [x] T7 Tests + mutations; fuzz; netsim; perf; browser; gates; merge notes (AC 9)

## Dev Notes

### Decisions (non-interactive; the user delegated them)

- **D1 Stage = recomputed, not patched.** `applyDecayStage(world, stage, variants)` rebuilds the obstacle lists from the frozen map for (stage, variants) from scratch: map collision boxes, then cover with `minStage ≤ stage`, then the applied mutations of stages 2…stage in map order (remove drops a named object; add appends a cover object; block appends a wall). So it is idempotent, goes backwards (dev cheat), and a client that only knows (stage, variants) reaches the same lists as the server: nothing but two numbers on the wire.
- **D2 Action meanings.** `add` = a new cover object (kind rules of 4.2: car/bus stop shots, barrier/sandbags only bodies). `block` = a new wall (like a collision box: stops bodies and shots, nav wall; e.g. rubble, a dumpster). `remove` = the named collision box, cover object or earlier add/block disappears; removing a cover object that duplicates a collision box (the bus) removes both (review 4.2 L2), and the client draws walls from the World's list (so a removed bus disappears). `ignite` = a fire record `{ name, target, x, y, radiusM, stage }` at the target's centre (data only; Story 4.8 adds damage and the 2-wave expiry). The car stays solid.
- **D3 Variations.** Objects sharing `variant` form one candidate; candidates sharing `group` compete; `pick` (same on every member) of them are chosen. Chosen set = a uint32 bitmask over the map's variants in first-appearance order (loader refuses > 32). Mutations without a `variant` always apply. Picked in `createWorld` (one World per run) from `streams.decay`; the mirror/Predictor take the server's mask from state.
- **D4 Where it runs.** `startBuild`: `decayMutate` (steps 1–3) before `returnOutPlayers` (so returns avoid the new boxes), then `decayFinish` (step 4 + event). Stage of the coming wave = `stageForWave(waves.number + 1)`. The run's first build (lobby → build, wave 1) is stage 1: nothing happens unless a dev override says otherwise.
- **D5 Refund** goes to the wallet only (not to `earned`: it is money given back, not income; the Results "earned" and economy sims are unchanged). `MONEY_REASONS` gains `refund` (appended: wire index 4). An owner who left gets nothing (like `earn`).
- **D6 Relocation.** Player: shortest push-out from inside the box if the result is clear of boxes and bodies; else `findFreeSpotNear` (normal rings, wide rings, boxes only); else the team starts. Zombie: push-out if clear of boxes; else a box-only ring search with its own radius; else it is removed without reward (`killZombie(…, null, "decay")`; never seen on Downtown). Out players are off the map (they return through `returnOutPlayers`).
- **D7 Visible stage group.** The stage-1 group is the base (ground, sidewalks) and always drawn; for stage N ≥ 2 the `stageN_*` group is drawn on top, swapped on change (Story 4.9 does the real look). Active hazards (`minStage ≤ stage`) and fire records drawn faintly.
- **D8 Banner.** `decay.stage_changed` → banner line with the stage name; if the wave-cleared banner was set the same frame the name is appended on a second line.
- **D9 Dev.** The cheat calls `changeDecayStage` (the same three steps + rebuild + event, solo only). `DEV_DECAY_STAGES` (server, dev only, ignored with a warning in production) replaces `stageByWave` in `world.debug.decayStageByWave` (server only, never synced: the clients get the result).

### Note for Stories 4.6–4.8 (review)

Decay content must never fully enclose a reachable area (a pocket players can stand in but zombies can't reach, or the other way round). `decay/decay.test.ts` › "every walkable cell is reachable from the team start" now checks this for every stage 1–5 and every variant combination (a chase field from the map centre reaches every non-wall nav cell; 80 fields, ~0.1 s). When you add `decay` objects, keep it green; if content legitimately walls off a dead corner, make that corner a wall (`block`) instead of leaving free cells behind it.

### Current state (read before changing)

- `map/decayStage.ts › currentDecayStage` = `world.debug.decayStage ?? 1`; `map/obstacles.ts › applyCoverStage` refills `world.obstacles` (map solids + cover with `minStage ≤ stage`, bus deduplicated) and calls `setNavWalls`; only caller: the solo cheat `setDecayStageCheat` (`apps/client/src/debug/devCheatActions.ts`). Spawn pick (`waves/spawnPick.ts`) and the dev grid view read the accessor.
- `run/runStateMachine.ts › startBuild`: phase, timer, Ready cleared, `returnOutPlayers`, `build.started`. Called by `RunController`, `LocalSimHost`, `createHeadlessWorld` (lobby → build) and `endWave`.
- Buildings: `removeBuilding` (version++), `building.destroyed` event (wire kind 22; client debris FX; schema removal); price in `balance.buildings.types[t].price`. Economy: `earn` (wallet + earned + `money.earned`).
- Free spots: `player/freeSpot.ts` (`spotBlocked`, `boxBlocked`, `findFreeSpotNear(…, rings, boxesOnly)`), `player/downed.ts › returnSpot` fallbacks (4.1 L4).
- Flow field: `setNavWalls` forces a re-rasterize; `rebuildFlowFieldNow(f, nav, world)` builds a field at once (4.2 L1). Mirror/Predictor have a 1-cell placeholder nav grid.
- `world.streams.decay` exists, no user yet (4.4). `snapshotWorld` has `obstacles` counts and `debug`.
- Net: `RUN_STATE_FIELDS` (+ compile check in `RunState.ts`), `syncState`, `fakeRoom.ts`, `devThrottle` (iterates the key list), `NetSimHost.applyState` / `takeSnapshot` (`predictor.syncBuildings` before reconcile), `net/netEvents.ts` kinds (append only).
- Client: `StreetView.drawStreet` (static: ground, stage-1 hazards, all map solids), `CoverView` (active cover except the bus, on `obstacles.version`), banner via `hudModel.bannerText`.

### Copies touched (brief line 2)

World (`decay`, `obstacles` via `applyDecayStage`) → schema `decayStage`, `decayVariants` → `syncState` (+ `resetRunFields`) → `RunStateView` / `RUN_STATE_FIELDS` → `fakeRoom` → devThrottle (key list) → mirror (`NetSimHost.applyState`) → Predictor (`syncDecay` in `takeSnapshot`) → `snapshotWorld` (`decay`, obstacle rect hash).

### Must be preserved

Push-out determinism, no per-tick allocation (decay runs at a build start only; the per-tick sync compares two integers), the 3.5 pinch rule, prediction = server, spawns from `streams.spawns`, all existing tests (stage-1 Downtown is unchanged), balance frozen (no existing number changes).

### References

- `_bmad-output/planning-artifacts/epics.md` › Story 4.5 (and 4.6–4.8); FR58. GDD › Level Progression. Architecture › Novel Patterns › Decay Stage Engine.
- Story files 4.1–4.4 (merge notes, review L1/L2 of 4.2).

## Dev Agent Record

### Agent Model Used

Claude Opus 5.5 (claude-opus-5-5), builder, worktree `story-4-5`.

### Debug Log References

- Baseline before the change: 1,258 passed / 3 skipped (171 files). After: 1,291 passed / 3 skipped (176 files).
- `node_modules` copied from the main checkout (`cp -a`; the `@topdown/*` links are relative, so `@topdown/shared` resolves to this worktree's package: checked with `readlink -f`).
- Existing tests that changed: 8 tests that build a raw balance gained `decay.json`; 4.2's stage tests (`obstacles`, `cover`, `coverMovement`, fuzz, `tickCostDowntown`) call `applyDecayStage` instead of `debug.decayStage` + `applyCoverStage`; `obstacles.test` stage-2/3 lists now include the mutations (parked_car_3 removed, dumpster wall), and its spawn-vs-cover data check runs over every variant mask; 4.3's spawn sims pin the stage with `decayStageByWave = [stage]` (their 3-wave sims now cross a real build start); `zombieAi.test` debug snapshot shape; `netEvents.test` round-trips the new kind and the `refund` reason; `lobbyStore.test` state literal.
- Netsim: the first expectation "0 snaps after the change" was wrong when the dumpster lands on the survivor (the server's push-out is a real teleport, ≤ 1 correction); the test now separates runs where the change moved the survivor (≤ 1 correction) from runs where it didn't (0), with liveness that both kinds occur.
- Browser: the first online run showed "Build phase" instead of "Panic" (the dev table changes the stage at the run's first build, whose `build.started` banner came after and replaced it) → banners that share a frame now stack on two lines (`stackBanner`).

### Completion Notes List

- Ultimate context engine analysis completed - comprehensive developer guide created.
- **Data shape.** `decay.json` (`stageByWave`, `stageNames`, `buildingRefundShare` 0.5, `relocateSearchRings` 12). Map layer `decay` → `DistrictMap.decay: DecayMutation[]` (`stage`, `action`, `kind`, `target`, `radiusM`, `variant` index, box) + `decayVariants` (`name`, `group`, `pick`, `stage`). Downtown: `parked_car_3_driven_off` (remove), `dumpster_alley_3` (block, narrows alley 3 to 1.5 m), `abandoned_car_west` | `abandoned_car_south` (add car, pick 1), `fire_parked_car_2_ignites` | `fire_street_car_west_ignites` (ignite r 2 m, pick 1, stage 3). Stages 4–5 empty.
- **One apply path.** `decay/applyDecayStage.ts` (shared, no side effects) rebuilds `world.obstacles` (`fillObstacles`: walls = map boxes − removed + blocks; cover by `minStage` + adds − removed; the bus pair goes together, 4.2 L2), `setNavWalls`, fire records, `world.decay`. Cover/spawn `minStage` are folded in (spawns read `currentDecayStage` = `world.decay.stage`). Callers: `createWorld`, the DecaySystem, the client mirror and Predictor (`net/mirrorDecay.ts`), the dev cheat (through the DecaySystem). `applyCoverStage` and `debug.decayStage` are gone.
- **DecaySystem** (`decay/decaySystem.ts`): in `startBuild`, `decayMutate` (1 apply, 2 destroy + 50 % refund, 3 push-out/free-spot for players and zombies) → `returnOutPlayers` → `decayFinish` (4 `rebuildFlowFieldNow` chase + flank, 4.2 L1; `decay.stage_changed`) → `build.started`. Variants picked in `createWorld` from `streams.decay` (partial Fisher–Yates).
- **Network.** Schema `decayStage` (uint8) + `decayVariants` (uint32), on change only; event kind 26 `[26, stage, from]`; `money.earned` reason index 4 = refund. Server logs `decay_stage_changed`.
- **Client.** `render/DecayView.ts` (walls, bus colour, blocks, active hazards, fire rings, stage group N ≥ 2 swapped over the stage-1 base; redraw on `obstacles.version`); `StreetView` is the static base only; banner = stage name, stacked under a same-frame banner ("Wave 2 cleared / Panic").
- **Dev.** Cheat "Decay stage (whole map)" → `changeDecayStage` (solo; CHEAT_STRINGS updated). Server `DEV_DECAY_STAGES=2,3` (dev only; `dev_decay_stages` / `_ignored` logs).
- **Tests added:** `decay/decay.test.ts` (20: timeline, balance refusals, loader read + 10 refusals, each action, nav walls, idempotence/back, removed-target fire, whole-run timing, refunds, push-out, L1 fields, cheat path, same-seed variants + stream isolation, pick 2 of 3, replay digest, "a path can still be closed", "zombies still reach us after stage 2"), `zombies/downtown.fuzz.test.ts` (stage change mid-run through the DecaySystem: barricades on coming boxes, a player and a zombie put inside one, independent solids list from the map data, every zombie must reach a player again after the change), `server run/decayBandwidth.test.ts`, `run/devDecayStages.test.ts`, `syncState.test.ts` (+1), `run/tickCostDowntown.test.ts` (+1 spike), client `sim/NetSimHost.decay.test.ts` (6), `tools/netsim/decay.test.ts` (2).
- **Fuzz run:** 36 layouts, 429 buildings, 48 barricades on coming mutation boxes, 53 destroyed + 53 refunds by the stage change, a player and a zombie pushed out in all 36, variant masks 5/6/9/10 all seen, every zombie reached a player after the change, stages 1/2/3.
- **Mutations proven** (script outside the repo; each makes its tests fail, then restored):

  | # | Mutation | Failing tests |
  |---|---|---|
  | M1 | `startBuild` never runs the DecaySystem | decay timing, refunds, push-out, L1, replay, "zombies reach us", devDecayStages, decayBandwidth |
  | M2 | stage changes mid-wave (every 200 ticks) | decay "never mid-wave" whole run |
  | M3 | `remove` ignored | each-action (4), obstacles stage lists |
  | M4 | `add` ignored | each-action, refunds, push-out, "zombies reach us", fuzz |
  | M5 | `block` ignored | each-action (3), refunds, push-out, L1, cheat path, "a path can still be closed" |
  | M6 | `ignite` makes no fire | ignite test, cheat path |
  | M7 | removing the bus keeps `city_bus` (L2) | ignite/bus test |
  | M8 | variant mask ignored | each-action, cheat path |
  | M9 | buildings on blocked cells kept | refunds, cheat path, fuzz, decayBandwidth |
  | M10 | full price refunded | refunds |
  | M11 | refund counted in `earned` | refunds |
  | M12 | no push-out | push-out, fuzz, netsim decay |
  | M13 | zombies not moved out | push-out |
  | M14 | fields not rebuilt at the build start (L1) | L1 test |
  | M15 | variants from `streams.spawns` | same-seed / stream isolation |
  | M16 | always the first candidate | same-seed, pick 2 of 3, fuzz (variant liveness) |
  | M17 | snapshot without `decay` | replay digest |
  | M18 | `syncState` never writes the stage | syncState Story 4.5 |
  | M19 | mirror/Predictor ignore the state | NetSimHost.decay (3), netsim decay (2) |
  | M20 | Predictor `syncDecay` no-op | NetSimHost.decay (3), netsim decay (2) |
  | M21 | `DEV_DECAY_STAGES` accepts a decreasing table | devDecayStages |
  | M22 | decay event not decoded | netEvents round-trip, NetSimHost hidden tab (banner) |
  | M23 | loader skips the ignite radius check | loader refusals |
  | M24 | dev cheat bypasses the DecaySystem | NetSimHost.decay solo cheat |
  | M25 | player relocation skips the push-out | push-out ("within 2 m") |

- **Netsim** (75 ± 10 ms one way, 5 seeds, survivor walking through the dumpster's cells): server, mirror and Predictor end with the same solids; prediction never inside the dumpster; ≤ 1 correction when the change landed on the survivor, 0 otherwise. Control (client ignores the decay fields): > 5 corrections. Hidden tab 4 s across the build start: wakes with the server's map, never predicts inside it.
- **Bandwidth:** stage field +2 B on the change tick; the change tick's decay events 43 B (stage event 4 B + 3 destroyed barricades + 3 refunds, worst case of the test); variants once per run (uint32); idle patches unchanged (5 B). 2 changes per 5-wave run ≈ 0 B/s.
- **Perf** (`PERF_ASSERT=1`): build-start spike (4 players, 150 Walkers, 24 barricades; apply + refunds + push-outs + both fields): **median 1.55 ms, max 3.40 ms** at load 0.51 (apply 0.021 ms, both fields 1.34 ms); a re-run at load 2.1 (other builders): median 1.57 ms, max 9.43 ms. Tick budget 50 ms: done in one tick, no spreading needed. Per-tick cost: the 4.2 stage-3 comparison (now with the mutation boxes) added p99 +0.029 ms at load 0.51. No per-tick work added except two integer compares in `syncState` and one in `mirrorDecay` per patch/frame.
- **Browser** (Python Playwright + Chromium headless 1280×720, server :2641 with `DEV_DECAY_STAGES=2` for online, Vite :5241, temp config deleted), screenshots `/tmp/s45pw/shots/`: solo — Ready → Skip wave ×2 through the real build start: banner "Wave 2 cleared / Panic" (`solo-2-banner-panic.png`), stage-2 map with dumpster, abandoned car, parked_car_3 gone, police barrier, stage-2 debris (`solo-3-stage2-map.png`); cheat → stage 3: "Breakdown", sandbags, one fire ring, stage-3 debris swapped in (`solo-4-stage3-cheat.png`); two solo runs drew different variants (south car + parked_car_2 fire; west car + street_car_west fire). Online 2 browsers (guest `?lag=150&jitter=20`, guest tab asleep via `loop.sleep()` across Start = the build start into stage 2 and a late Game scene): host banner "Panic / Build phase"; guest after waking: banner, stage 2, same solids as the host, both Predictors = mirror lists (`online-*.png`); corrections 0 / snaps 0 on both. No page errors.
- **Not verified:** real phones / touch; walking into the dumpster online in the browser (the team start is far from it; covered by the netsim test and unit tests); the browser's own `?lag` on the host; a full 5-wave online run reaching stage 3 (stage 3 seen in solo and in sims only); headless Chromium ran at ~9–21 fps; Tiled itself (generator-written files); ambience/weather changes (Stories 4.6–4.8); fire damage (4.8). Map hazard zones `fire_*` (data from 4.1) are drawn for both cars at stage 3 while only the chosen car has a fire record — 4.8 should keep one of the two sources.

### Notes for the merge (brief line 19)

- **`map/obstacles.ts`:** `applyCoverStage` removed; `fillObstacles(o, map, stage, variants)` + `mutationApplies`; `ObstacleState` gains `variants`, `walls`. Anything that called `applyCoverStage` or wrote `debug.decayStage` must call `applyDecayStage(world, stage, world.decay.variants)` (no side effects) or `changeDecayStage` (the DecaySystem).
- **`map/decayStage.ts`:** `currentDecayStage(world)` = `world.decay.stage` (signature takes `{ decay: { stage } }`).
- **`map/districtMap.ts`, `loadTiledMap.ts`, `placeholderMap.ts`:** `DecayMutation`, `DecayVariant`, `DECAY_ACTIONS`, `MAX_DECAY_VARIANTS`; `DistrictMap.decay` / `decayVariants` (hand-written `DistrictMap` literals need them; spreads of existing maps are fine); optional `decay` layer. 4.6–4.8 add their content as `decay` objects in `tools/maps/buildDowntown.ts` (`decay` array) and regenerate (`npm run maps:build`); never merge the generated files by hand. The data test in `obstacles.test.ts` checks every spawn's jitter area against every variant mask.
- **`run/runStateMachine.ts › startBuild`:** `decayMutate` → `returnOutPlayers` → `decayFinish` → `build.started`. 4.8's fire expiry / damage belongs in the DecaySystem or a hazard system, not here.
- **`core/world.ts`:** `World.decay` (created before `obstacles`; variants drawn from `streams.decay` in `createWorld`); `WorldDebug.decayStage` → `decayStageByWave`.
- **`core/worldSnapshot.ts`:** `obstacles.solids/shotBlockers` are now name lists (+ `variants`); new `decay`. Digests of a given seed change.
- **Schema / `syncState` / `stateView` / `fakeRoom`:** `decayStage`, `decayVariants` appended after `runSeed` (take both sides if another story appends). `resetRunFields` clears them. devThrottle needs nothing (key list).
- **`net/netEvents.ts` / `core/simEvents.ts`:** kind 26 `DECAY_STAGE_CHANGED`; `MONEY_REASONS` + `refund` (index 4).
- **Balance:** new `decay.json` + `decaySchema`; `balance.version` changes (clients and server ship together). Tests that build a raw balance list must add `decay`.
- **`economy/economy.ts`:** `refundMoney` (wallet only). `bots/headlessRun.ts`: `earnedBy.refund`.
- **`player/freeSpot.ts`:** `findBoxFreeSpot`.
- **Server:** `run/devDecayStages.ts`, `RunControllerOptions.decayStageByWave`, `RunRoom` reads `DEV_DECAY_STAGES` and logs `decay_stage_changed`.
- **Client:** `net/mirrorDecay.ts` (new; `NetSimHost.applyState` and `Predictor.syncDecay` in `takeSnapshot`), `render/DecayView.ts` (new), `render/StreetView.ts` (walls and hazards moved to DecayView), `scenes/GameScene.ts` (DecayView, `stackBanner`), `scenes/HudScene.ts` (banner `align: center`), `debug/DevCheats.tsx` + `devCheatActions.ts` (cheat label "Decay stage (whole map)"), `tools/checks/noCheatsInRelease.test.ts`.

### File List

- New: `packages/shared/src/decay/{decayState,applyDecayStage,decaySystem}.ts`, `packages/shared/src/decay/decay.test.ts`, `packages/shared/src/config/balance/decay.json`, `apps/client/src/net/mirrorDecay.ts`, `apps/client/src/render/DecayView.ts`, `apps/client/src/sim/NetSimHost.decay.test.ts`, `apps/server/src/run/devDecayStages.ts`, `apps/server/src/run/{devDecayStages,decayBandwidth}.test.ts`, `tools/netsim/decay.test.ts`, this story file.
- Modified (shared): `config/{balance,balanceSchema}.ts`, `core/{world,worldSnapshot,simEvents}.ts`, `economy/economy.ts`, `map/{decayStage,districtMap,loadTiledMap,obstacles,placeholderMap}.ts`, `map/data/downtown.tmj.json`, `net/{netEvents,stateView}.ts`, `player/freeSpot.ts`, `run/runStateMachine.ts`, `bots/headlessRun.ts`, `index.ts`; tests `buildings/coverMovement`, `combat/{aimAssist,cover,firing,melee,swap}`, `config/balance`, `map/obstacles`, `net/netEvents`, `waves/{spawnPoints,waveDirector}`, `zombies/{downtown.fuzz,zombieAi}`.
- Modified (server): `rooms/RunRoom.ts`, `rooms/schema/{RunState,syncState}.ts`, `run/RunController.ts`; tests `rooms/schema/syncState.test.ts`, `run/tickCostDowntown.test.ts`.
- Modified (client): `debug/{DevCheats.tsx,devCheatActions.ts}`, `net/{fakeRoom,prediction}.ts`, `render/StreetView.ts`, `scenes/{GameScene,HudScene}.ts`, `sim/NetSimHost.ts`, `public/assets/maps/downtown.tmj`; test `net/lobbyStore.test.ts`.
- Modified (tools): `maps/{buildDowntown.ts,downtown.tmx}`, `checks/noCheatsInRelease.test.ts`.
- Tracking: `_bmad-output/implementation-artifacts/sprint-status.yaml`.

## Senior Developer Review (AI)

Fresh-agent review of 38db616: **approved**, no High or Medium findings. Small items fixed:

| # | Severity | Finding | Fix |
| --- | --- | --- | --- |
| L1 | Low | The solo decay cheat ran `changeDecayStage` in any phase (mutations mid-wave; the next build reset the stage). | `setDecayStageCheat` acts only in the build phase or the lobby (`decayCheatAllowed`); otherwise nothing changes. The panel disables the control and shows "Build phase only (decay never changes mid-wave)." Test: `NetSimHost.decay.test.ts` › review L1. |
| L2 | Low | The strict-overlap rule for destroying buildings had no test ("touching counts" survived). | Test: a barricade flush against the new dumpster survives with no refund; one 1 cm into it is destroyed and refunded 50 %. |
| L4 | Low | No test that production ignores `DEV_DECAY_STAGES`. | Pure `pickDevDecayStages(env)` (the room uses it; logs `dev_decay_stages_ignored` with the reason); test for production, dev, absent and invalid values. |
| Note | — | Decay content must not enclose a reachable area (only "zombies reach the team start" guarded it). | Added the all-stages × all-variants reachability test (cheap) and a Dev Note for 4.6–4.8. |

Mutations proven after the fixes (each fails its test, then restored): R1 touching counts as overlap → review L2; R2 cheat allowed in any phase → review L1; R3 production check removed → review L4; R4 the dumpster widened to close alley 3 → reachability test (+ "a path can still be closed", "zombies still reach us"). The build's M1–M25 stand.

Gates after the fixes: typecheck, lint, test (176 files, 1,295 passed, 3 skipped), build green (load ~1.3–1.6). A first full run had one failure in `RunRoom.fight.test.ts` (live tick mean 5.9 ms > 5 at load 2.7, other builders running); it passes alone with and without this change, and the re-run was green.

Rendering note: Story 4.9 replaces `StreetView` / `CoverView` with `render/city/CityView`; `DecayView` is reconciled there (main session).

## Change Log

- 2026-11-22: Story file written (gds-create-story) and built: decay stage engine (data, shared apply, DecaySystem at the build start, network, DecayView, cheat, tests). Status review.
- 2026-11-22: Review (approved) fixes L1, L2, L4 and the reachability check for every stage; Status done.
