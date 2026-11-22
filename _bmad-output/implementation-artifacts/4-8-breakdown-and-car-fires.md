# Story 4.8: Breakdown and car fires

Status: in-progress

## Story

As a player,
I want burning cars, sandbags and rain as things break down,
so that fire becomes a danger and a tool.

> **EPIC 4 BRIEF** (§11 of `epic-3-retro-2026-11-22.md`) is this story's checklist; every line applies. Most relevant: 2 (fire is shared data: ONE `applyDecayStage` for server, solo, mirror and Predictor; list every copy), 3 (fuzz with fires), 4 (fire cells are a cost, not a wall; fields rebuild at the build start only), 5 (build-start order: fire expiry is a step-1 decay mutation), 8 (fires picked by `streams.decay` only), 9 (liveness, mutation-proven tests), 10 ("zombies reach us around a burning car"), 11 (lag, hidden tab across a build start), 12 (HP and damage are the server's), 13 (ticks, no per-tick allocation, numbers in `decay.json`), 14 (bandwidth: fire state on change only), 15 (perf with load), 18 (say what was not verified), 19 (merge notes).

## Acceptance Criteria

1. **Stage 3 content (FR61).** At the build phase before wave 5 (`decay.json › stageByWave`, stage 3 "Breakdown"): **2 cars**, picked once per run by `streams.decay` from a pool of **3 candidates** (`parked_car_1`, `parked_car_2`, `street_car_west`; group `breakdown_car_fire`, pick 2), ignite into fire zones of **2 m radius** (centred on the car) that last **2 waves**; free sandbag cover appears (4.2's `sandbags_south`, stage 3: kept); rain is full from stage 3 (4.9's `NIGHT_BY_STAGE[2].rain = 1`: confirmed, not duplicated). The cars stay solid cover.
2. **Numbers in balance.** `decay.json › fire`: `radiusM` 2, `damagePerS` 10, `durationWaves` 2, `pulseS` 0.5, `navCostM` 10 (zod-validated; `damagePerS × pulseS` must be a whole number). The map's `ignite` objects no longer carry `radiusM` (optional per-object override, > 0 if given); the vestigial 4.1 `fire` hazard rects are removed (one source of truth: the ignites).
3. **Fire damage (FR57, FR53).** Every `pulseS` (ticks, counted from a World counter that runs while a fire burns in the build or wave phase) each body inside a burning zone takes `damagePerS × pulseS` (5): standing players (`player.damaged`, `sourceZombieId` −1; can down them), zombies (no `zombie.hit`; at 0 HP `zombie.killed` with killer null, weapon `fire`), buildings including turrets (`damageBuilding`, whole HP). Inside = the body circle (or the building's footprint box) overlaps the zone circle (strict). Overlapping zones do not stack. Downed and out players take no fire damage. No damage in the lobby, in Results or after a wipe. No per-tick allocation.
4. **Expiry.** A fire lit at the build start before wave *w* burns through waves *w* and *w + 1* (and the build phase between) and goes out at the build start before wave *w + 2*, as step 1 of the build-start order (with the other decay mutations, before the field rebuild). The renderer stops drawing it then. (In a 5-wave run, stage 3 starts before wave 5, so the fires burn to the end.)
5. **Flow field.** Fire cells cost `navCostM` per cell entered (very costly, not a wall); written to the nav grid by `applyDecayStage` and rebuilt with the fields at the build start (also when only fires changed). A zombie walks straight at a player only if the line is clear of buildings AND fire zones; otherwise it follows the field. Zombies route around a burning car and still reach us; with no other way they cross the fire.
6. **Network.** Schema `RunState.decayFiresOut` (uint32, bit i = the map's i-th ignite has burned out), written on change only; `RunStateView` / `RUN_STATE_FIELDS` / fake room / devThrottle key list; mirror and Predictor pass it to `applyDecayStage`. Damage and HP come from the server (existing `player.damaged`, player `hp`, building `hp`, `zombie.killed`). Added bandwidth reported.
7. **Client.** Players hit by fire show a hurt cue (an ember tint on the survivor; the local HUD shows "Burning" while fire damage keeps arriving), driven by the server's `player.damaged` with source −1. 4.9's `CityView` draws exactly `world.decay.fires` and redraws when a fire goes out.
8. **Tests:** damage per target type (standing, downed, zombie, building, turret); no stacking; phases; expiry after 2 waves (and the visual list); same seed → same fires; flow cost (around, and through when there is no other way); "zombies route around a burning car but still reach us"; netsim/NetSimHost client–server agreement; Downtown fuzz with fires; bandwidth; liveness; each new test fails under one mutation.

## Tasks / Subtasks

- [ ] T1 Balance `decay.fire` + schema; loader: `radiusM` optional on ignites, ≤ 32 ignites; generator: 3 candidates pick 2, drop ignite radii and fire hazards; regenerate (AC 1, 2)
- [ ] T2 `decay/fire.ts`: fire indices, `firesOut` in `DecayState`, `applyDecayStage(…, firesOut)`, nav fire cost (`setNavFires`), expiry + lighting in the DecaySystem (`startBuild` step 1), `updateFires` damage system in the `decayTimers` slot, `segmentHitsFire` for zombie LOS (AC 3–5)
- [ ] T3 Snapshot: `firesOut`, `fireEndWave`, `burnTicks` (AC 8 same seed)
- [ ] T4 Schema / syncState / stateView / fakeRoom / mirror / Predictor (AC 6)
- [ ] T5 Client hurt cue (`render/fireCue.ts` + PlayerView tint + HUD line); CityView redraw on expiry (AC 7)
- [ ] T6 Tests + mutations; fuzz; netsim; bandwidth; perf (AC 8)
- [ ] T7 Browser check; gates; merge with 4.6/4.7 when it lands; merge notes

## Dev Notes

### Decisions (non-interactive; the user delegated them)

- **D1 Candidates: pick 2 of 3.** `parked_car_1`, `parked_car_2`, `street_car_west`. None of them is moved or removed by 4.5/4.6/4.7 (4.7 moves curb cars and `street_car_east`; 4.5 removes `parked_car_3`), so two fires always burn. `street_car_west` and `parked_car_2` were reserved for this story by 4.6/4.7. Three runs-combinations (lot pair, lot 1 + west, lot 2 + west).
- **D2 Radius from balance.** The ask puts the fire numbers in balance JSON. `decay.json › fire.radiusM` is the radius; a map `ignite` may still carry `radiusM` as a per-object override (> 0), Downtown's don't. Fire records therefore are built per World (no module cache keyed by mutation: the radius depends on the World's balance).
- **D3 Pulses, not per-tick fractions.** Building HP is whole (`damageBuilding` rounds, min 1), so 0.5 HP per tick cannot work for buildings. Damage comes in pulses every `pulseS` = 0.5 s (10 ticks), 5 each = exactly 10/s. One counter `world.decay.burnTicks` counts ticks while at least one fire burns in the build or wave phase; a pulse lands when it reaches a multiple of the pulse length. Also 2 events/s per burning player instead of 20 (bandwidth).
- **D4 Downed players in fire: no damage.** A downed player is at 0 HP and has their own countdown (`downedS`); fire does not shorten it (reviving inside a fire stays possible, a risky team play). Out players are off the map.
- **D5 Fire kills credit nobody.** `killZombie(world, id, null, "fire")`: no reward, no assist shares, nobody's kill (same as the dev cheats' kills). The wave still counts it. Balance is frozen until 4.10, which may revisit luring zombies into fire as a paid tool.
- **D6 Turrets burn.** Turrets are buildings (FR53: "fires damage buildings inside them"); every building whose footprint overlaps a zone takes the pulse. Placement in a fire is allowed (a barricade there burns down: the player's choice; the client's HP bar shows it).
- **D7 Inside = strict overlap.** Body circle vs zone circle: `d < r_body + r_fire`. Building: `circleOverlapsBox(fireX, fireY, r_fire, box)`. A body in two zones takes one pulse (zones don't stack).
- **D8 No `zombie.hit` for fire.** Fire damage on zombies emits nothing per pulse (the fire is visible; a flash per pulse on a crowd would cost bandwidth); the death is a normal `zombie.killed`.
- **D9 Expiry state.** `DecayState.firesOut` (uint32, bit i = the map's i-th `ignite` mutation, map order; loader refuses > 32 ignites) is the only new synced number. `applyDecayStage(world, stage, variants, firesOut)` computes the burning list = ignites that apply at (stage, variants), whose target stands, and whose bit is not out. Server/solo keep `fireEndWave[i]` (the coming wave at whose build start fire i goes out; 0 = not lit). At a build start (`decayMutate`): out-mask = lit fires with `endWave ≤ comingWave`; then the apply; then newly lit fires get `endWave = comingWave + durationWaves`. Going back to a lower stage (dev cheat) clears the bits and end waves of ignites above it.
- **D10 Build-start order.** Expiry is part of step 1 (decay mutations). If only fires changed (no stage change), steps 2–3 find nothing and step 4 rebuilds the fields, without `decay.stage_changed` (no banner).
- **D11 Nav cost.** `nav.fireCost` (Int32Array per cell, cost units) = `navCostM × 4` for every free cell whose centre is within `r_fire + MAX_PATHING_ZOMBIE_RADIUS_M` of a burning zone's centre; `rasterizeBuildings` adds it to `enterCost`. Written by `applyDecayStage` (`setNavFires` → `nav.version = -1`), so the next rebuild — at the build start, `decayFinish` — uses it. Crossing a 2 m zone costs ~40–80 m of path: zombies take any real detour on Downtown, but a dead end behind fire is still reached.
- **D12 Line of sight.** `segmentHitsFire(world, x0, y0, x1, y1, r)` (segment vs each burning circle grown by r): a zombie whose straight line to its target crosses fire follows the field. 2 fires × 150 zombies per tick: trivial.
- **D13 Client cue = server truth.** The cue is driven only by the server's `player.damaged { sourceZombieId: -1 }` (solo: the same event): the survivor sprite is tinted ember for `FIRE_CUE_MS`; the local HUD shows "Burning" while the last fire hit is fresher than that. HP shown = `player.hp` (ceil rule of 3.7 unchanged).
- **D14 Sandbags and rain.** Kept as built (4.2 `sandbags_south` minStage 3; 4.9 rain level 1 from stage 3). No new sandbags: every free spot near the streets is taken by 4.6/4.7 cars or a stage-3 spawn's jitter area; adding one would make the parallel merge riskier for no gameplay gain.

### Current state (read before changing)

- `decay/applyDecayStage.ts`: rebuilds obstacles for (stage, variants), `setNavWalls`, fires = ignites that apply and whose target still stands (`fireRecordOf`, cached per mutation, radius from the map), early-out when unchanged.
- `decay/decaySystem.ts`: `decayMutate` (apply → destroy buildings → relocate) returns false when nothing changed; `decayFinish` rebuilds chase + flank and emits `decay.stage_changed`; `changeDecayStage` = both (cheat).
- `run/runStateMachine.ts › startBuild`: `decayMutate(stageForComingWave)` → `returnOutPlayers` → `decayFinish` if changed → `build.started`.
- `core/systems.ts`: the `decayTimers` slot is a no-op (last in the tick) — the fire damage system goes there.
- Damage paths: `zombieAi.ts › damagePlayer` (alive only, god mode, `player.damaged`, `downPlayer` at 0); `buildings.ts › damageBuilding`; `zombiePool.ts › killZombie(world, id, null, cause)`.
- Zombie LOS: `zombieAi.ts` `blocked = hasBuildings && segmentHitsBuildings(...)`.
- Flow: `flowField.ts › rasterizeBuildings` writes `enterCost` (building cost, near-wall cost); `rebuildFlowFieldNow` re-rasterizes when `nav.version` is stale.
- Network: `decayStage` / `decayVariants` in schema, syncState, stateView key list, fakeRoom; `mirrorDecay(world, stage, variants)` used by `NetSimHost.applyState` and `Predictor.syncDecay`.
- Client: `CityView.update` re-bakes on `staticKey(obstacles.stage, obstacles.version, fires.length)`; `drawCity` draws scorch, flames, light from `cs.fires`. No hurt cue exists today.
- Map: `buildDowntown.ts` ignites `fire_parked_car_2_ignites` / `fire_street_car_west_ignites` (pick 1, radiusM 2); hazard rects `fire_parked_car_2` / `fire_street_car_west` (not drawn since 4.9).

### Copies touched (brief line 2)

World (`decay.firesOut`, `fireEndWave`, `burnTicks`, `fires`; nav `fireCost`) → schema `decayFiresOut` → `syncState` (+ `resetRunFields`) → `RunStateView` / `RUN_STATE_FIELDS` → `fakeRoom` → devThrottle (key list, nothing to do) → mirror (`mirrorDecay` in `NetSimHost.applyState`) → Predictor (`syncDecay`) → `snapshotWorld` (`decay`).

### Must be preserved

4.5's reachability test (every stage × every variant combination), spawn clearance, push-out determinism, prediction = server, balance frozen (no existing number changes), all existing tests; stage-1/2 behaviour unchanged.

### Merge with 4.6/4.7 (parallel)

They edit `tools/maps/buildDowntown.ts` (curb cars, moved cars, police lines, shop fronts) and the variant layout (movers = bits 0–5, so the fire group becomes bits 6–8 and `legalDecayMasks` = C(6,4) × C(3,2) = 45). My generator edits are confined to the `hazards` array (two fire rects removed) and the two ignite objects + one new one. Generated map files are regenerated, never hand-merged.

### References

- `_bmad-output/planning-artifacts/epics.md` › Story 4.8; FR53, FR57, FR61. Architecture › Novel Patterns › Decay Stage Engine.
- Story files 4.2 (cover, sandbags), 4.5 (decay engine, D2 ignite, merge notes), 4.9 (fires drawn from `world.decay.fires`, D11 rain, D18).

## Dev Agent Record

### Agent Model Used

Claude Opus 5.5 (claude-opus-5-5), builder, worktree `story-4-8`.

### Debug Log References

### Completion Notes List

- Ultimate context engine analysis completed - comprehensive developer guide created.

### File List
