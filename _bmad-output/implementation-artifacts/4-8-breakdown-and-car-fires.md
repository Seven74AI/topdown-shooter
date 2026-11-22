# Story 4.8: Breakdown and car fires

Status: done

## Story

As a player,
I want burning cars, sandbags and rain as things break down,
so that fire becomes a danger and a tool.

> **EPIC 4 BRIEF** (§11 of `epic-3-retro-2026-11-22.md`) is this story's checklist; every line applies. Most relevant: 2 (fire is shared data: ONE `applyDecayStage` for server, solo, mirror and Predictor; list every copy), 3 (fuzz with fires), 4 (fire cells are a cost, not a wall; fields rebuild at the build start only), 5 (build-start order: fire expiry is a step-1 decay mutation), 8 (fires picked by `streams.decay` only), 9 (liveness, mutation-proven tests), 10 ("zombies reach us around a burning car"), 11 (lag, hidden tab across a build start), 12 (HP and damage are the server's), 13 (ticks, no per-tick allocation, numbers in `decay.json`), 14 (bandwidth: fire state on change only), 15 (perf with load), 18 (say what was not verified), 19 (merge notes).

## Acceptance Criteria

1. **Stage 3 content (FR61).** At the build phase before wave 5 (`decay.json › stageByWave`, stage 3 "Breakdown"): **2 cars**, picked once per run by `streams.decay` from a pool of **3 candidates** (`parked_car_1`, `parked_car_2`, `street_car_west`; group `breakdown_car_fire`, pick 2), ignite into fire zones of **2 m radius** (centred on the car) that last **2 waves**; free sandbag cover appears (4.2's `sandbags_south`, stage 3: kept); rain is full from stage 3 (4.9's `NIGHT_BY_STAGE[2].rain = 1`: confirmed, not duplicated). The cars stay solid cover.
2. **Numbers in balance.** `decay.json › fire`: `radiusM` 2, `damagePerS` 10, `durationWaves` 2, `pulseS` 0.5, `navCostM` 10 (zod-validated; `damagePerS × pulseS` must be a whole number). The map's `ignite` objects no longer carry `radiusM` (optional per-object override, > 0 if given); the vestigial 4.1 `fire` hazard rects are removed (one source of truth: the ignites).
3. **Fire damage (FR57, FR53).** For every `pulseS` a body spends inside a burning zone (its own burn clock, review L4; build and wave phases, not while `waves.paused`) it takes `damagePerS × pulseS` (5): standing players (`player.damaged`, `sourceZombieId` −1; can down them), zombies (no `zombie.hit`; at 0 HP `zombie.killed` with killer null, weapon `fire`), buildings including turrets (`damageBuilding`, whole HP). Inside = the body circle (or the building's footprint box) overlaps the zone circle (strict). Overlapping zones do not stack. Downed and out players take no fire damage. No damage in the lobby, in Results or after a wipe. No per-tick allocation.
4. **Expiry.** A fire lit at the build start before wave *w* burns through waves *w* and *w + 1* (and the build phase between) and goes out at the build start before wave *w + 2*, as step 1 of the build-start order (with the other decay mutations, before the field rebuild). The renderer stops drawing it then. (In a 5-wave run, stage 3 starts before wave 5, so the fires burn to the end.)
5. **Flow field.** Fire cells cost `navCostM` per cell entered (very costly, not a wall); written to the nav grid by `applyDecayStage` and rebuilt with the fields at the build start (also when only fires changed). A zombie walks straight at a player only if the line is clear of buildings AND fire zones; otherwise it follows the field. Zombies route around a burning car and still reach us; with no other way they cross the fire.
6. **Network.** Schema `RunState.decayFiresOut` (uint32, bit i = the map's i-th ignite has burned out), written on change only; `RunStateView` / `RUN_STATE_FIELDS` / fake room / devThrottle key list; mirror and Predictor pass it to `applyDecayStage`. Damage and HP come from the server (existing `player.damaged`, player `hp`, building `hp`, `zombie.killed`). Added bandwidth reported.
7. **Client.** Players hit by fire show a hurt cue (an ember tint on the survivor; the local HUD shows "Burning" while fire damage keeps arriving), driven by the server's `player.damaged` with source −1. 4.9's `CityView` draws exactly `world.decay.fires` and redraws when a fire goes out.
8. **Tests:** damage per target type (standing, downed, zombie, building, turret); no stacking; phases; expiry after 2 waves (and the visual list); same seed → same fires; flow cost (around, and through when there is no other way); "zombies route around a burning car but still reach us"; netsim/NetSimHost client–server agreement; Downtown fuzz with fires; bandwidth; liveness; each new test fails under one mutation.

## Tasks / Subtasks

- [x] T1 Balance `decay.fire` + schema; loader: `radiusM` optional on ignites, ≤ 32 ignites; generator: 3 candidates pick 2, drop ignite radii and fire hazards; regenerate (AC 1, 2)
- [x] T2 `decay/fire.ts`: fire indices, `firesOut` in `DecayState`, `applyDecayStage(…, firesOut)`, nav fire cost (`setNavFires`), expiry + lighting in the DecaySystem (`startBuild` step 1), `updateFires` damage system in the `decayTimers` slot, `segmentHitsFire` for zombie LOS (AC 3–5)
- [x] T3 Snapshot: `firesOut`, `fireEndWave`, `burnTicks` (AC 8 same seed)
- [x] T4 Schema / syncState / stateView / fakeRoom / mirror / Predictor (AC 6)
- [x] T5 Client hurt cue (`render/fireCue.ts` + PlayerView tint + HUD line); CityView redraw on expiry (AC 7)
- [x] T6 Tests + mutations; fuzz; netsim; bandwidth; perf (AC 8)
- [x] T7 Browser check; gates; merge with 4.6/4.7 when it lands; merge notes

## Dev Notes

### Decisions (non-interactive; the user delegated them)

- **D1 Candidates: pick 2 of 3.** `parked_car_1`, `parked_car_2`, `street_car_west`. None of them is moved or removed by 4.5/4.6/4.7 (4.7 moves curb cars and `street_car_east`; 4.5 removes `parked_car_3`), so two fires always burn. `street_car_west` and `parked_car_2` were reserved for this story by 4.6/4.7. Three runs-combinations (lot pair, lot 1 + west, lot 2 + west).
- **D2 Radius from balance.** The ask puts the fire numbers in balance JSON. `decay.json › fire.radiusM` is the radius; a map `ignite` may still carry `radiusM` as a per-object override (> 0), Downtown's don't. Fire records therefore are built per World (no module cache keyed by mutation: the radius depends on the World's balance).
- **D3 Pulses on a per-body burn clock (review L4).** Building HP is whole (`damageBuilding` rounds, min 1), so 0.5 HP per tick cannot work for buildings. Each body (player `fireTicks`, zombie pool `fireTicks`, building `fireTicks`) counts the ticks it spends inside a zone; the count is kept while it is outside; each time it reaches `pulseS` = 0.5 s (10 ticks) the body takes 5 (= exactly 10/s of exposure) and the count restarts. The first hit lands one pulse after entering, and stepping out on any tick dodges nothing (the first version used one shared World pulse tick: a player in fire 360 of 400 ticks took 0). 2 events/s per burning player instead of 20 (bandwidth: +24 B/s each). `world.decay.burnTicks` still counts burning ticks (stats, digest).
- **D4 Downed players in fire: no damage.** A downed player is at 0 HP and has their own countdown (`downedS`); fire does not shorten it (reviving inside a fire stays possible, a risky team play). Out players are off the map.
- **D5 Fire kills credit nobody.** `killZombie(world, id, null, "fire")`: no reward, no assist shares, nobody's kill (same as the dev cheats' kills). The wave still counts it. Balance is frozen until 4.10, which may revisit luring zombies into fire as a paid tool.
- **D6 Turrets burn.** Turrets are buildings (FR53: "fires damage buildings inside them"); every building whose footprint overlaps a zone takes the pulse. Placement in a fire is allowed (a barricade there burns down: the player's choice; the client's HP bar shows it). Review M2: a building a fire overlaps **when it lights** is destroyed and refunded 50 % at that build start, through the same code as blocked cells (`destroyBlockedBuildings(world, newFires)`), so nobody loses a barricade to a fire they could not foresee.
- **D15 Ignition moves standing players out (review M1).** Step 3 of the build-start order, after `relocateBodies`: every standing player inside a fire lit at this build start is moved to fire radius + body radius (just outside), straight out first, then round the zone, clear of boxes, bodies and every burning zone; else the free-spot rings; else the team starts (`moveOutOfNewFires`). Downed players stay (fire spares them). Burning in the build phase stays for anyone who walks in afterwards. Known edge: `returnOutPlayers` (after step 3) can put a returning player beside a teammate who stands at a ring; they can walk out (it's the build phase).
- **D16 Readability (review M3): your body touches the ring = you burn.** The sim burns a body whose circle overlaps the zone (centre within radius + body radius), so `CityView` draws one crisp ember ring (~2 px at any zoom, rgba(255,120,40,0.55)) at exactly the zone radius, with 8 flickering ember dots drifting on it; the scorch stays near full strength to 0.9 × radius then falls off hard at the ring; the fire's light pool, glow and flicker light stay inside the ring (no larger halo suggesting a bigger zone). `render/city/fireRing.ts` + test (the "touches the ring ⇔ burns" property against the sim's `circleInFire`, for players and every zombie size).
- **D17 Tick order (review L5).** Fire damage stays in the `decayTimers` slot, after `economy` (`SYSTEM_ORDER` is fixed by the architecture). Safe: fire kills pay nobody, so no money waits a tick; a fire kill is seen by the wave director (alive count) on the next tick (50 ms). Note for 4.10: if fire kills ever pay (luring as a tool), move the fire pass before `economy` or pay from the event next tick (events pending at the next step are paid exactly once already).
- **D7 Inside = strict overlap.** Body circle vs zone circle: `d < r_body + r_fire`. Building: `circleOverlapsBox(fireX, fireY, r_fire, box)`. A body in two zones takes one pulse (zones don't stack).
- **D8 No `zombie.hit` for fire.** Fire damage on zombies emits nothing per pulse (the fire is visible; a flash per pulse on a crowd would cost bandwidth); the death is a normal `zombie.killed`.
- **D9 Expiry state.** `DecayState.firesOut` (uint32, bit i = the map's i-th `ignite` mutation, map order; loader refuses > 32 ignites) is the only new synced number. `applyDecayStage(world, stage, variants, firesOut)` computes the burning list = ignites that apply at (stage, variants), whose target stands, and whose bit is not out. Server/solo keep `fireEndWave[i]` (the coming wave at whose build start fire i goes out; 0 = not lit). At a build start (`decayMutate`): out-mask = lit fires with `endWave ≤ comingWave`; then the apply; then newly lit fires get `endWave = comingWave + durationWaves`. Going back to a lower stage (dev cheat) clears the bits and end waves of ignites above it.
- **D10 Build-start order.** Expiry is part of step 1 (decay mutations). If only fires changed (no stage change), steps 2–3 find nothing and step 4 rebuilds the fields, without `decay.stage_changed` (no banner).
- **D11 Nav cost.** `nav.fireCost` (Int32Array per cell, cost units) = `navCostM × 4` for every free cell whose centre is within `r_fire + MAX_PATHING_ZOMBIE_RADIUS_M` of a burning zone's centre; `rasterizeBuildings` adds it to `enterCost`. Written by `applyDecayStage` (`setNavFires` → `nav.version = -1`), so the next rebuild — at the build start, `decayFinish` — uses it. Crossing a zone costs about 90 m of path (review L7: the costed disc is radius 2 + 0.35 m, ~9 cells of 0.5 m across, × 10 m): zombies take any real detour on Downtown, but a dead end behind fire is still reached.
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

### Merge with 4.6/4.7 (parallel; done: merged 9009877 into story-4-8)

They edit `tools/maps/buildDowntown.ts` (curb cars, moved cars, police lines, shop fronts) and the variant layout (movers = bits 0–5, so the fire group becomes bits 6–8 and `legalDecayMasks` = C(6,4) × C(3,2) = 45). My generator edits are confined to the `hazards` array (two fire rects removed) and the two ignite objects + one new one. Generated map files are regenerated, never hand-merged.

### References

- `_bmad-output/planning-artifacts/epics.md` › Story 4.8; FR53, FR57, FR61. Architecture › Novel Patterns › Decay Stage Engine.
- Story files 4.2 (cover, sandbags), 4.5 (decay engine, D2 ignite, merge notes), 4.9 (fires drawn from `world.decay.fires`, D11 rain, D18).

## Dev Agent Record

### Agent Model Used

Claude Opus 5.5 (claude-opus-5-5), builder, worktree `story-4-8`.

### Debug Log References

- Baseline at deb09ce: 1,324 passed / 3 skipped (one map-files test failed only because I regenerated the map while it ran). After the story: 1,348 passed. After merging 4.6/4.7 (9009877): **1,370 passed / 3 skipped (188 files)**.
- `node_modules` copied from the main checkout (`cp -a`; `readlink -f node_modules/@topdown/shared` → this worktree's package).
- Existing tests changed: 4.5 `decay.test.ts` (3 ignites, pick 2 of 3, fire record has `index`, ignite radius optional, the cheat lights 2 fires, 45 masks); `downtown.test.ts` (fire hazard rects gone); after the merge, 4.6/4.7's counts of combinations 30 → 45 (`panic.test.ts`, `evening.test.ts`, `palette.test.ts`) and the fuzz runs 48 layouts (≥ 45 masks, a multiple of 4 for its bare-layout count); `lobbyStore.test.ts` state literal; `render/city/testScene.ts` (fire records built with `fireRecordOf(m, index, radius)`).
- Browser: the solo cheat to stage 3 alone is undone by the next build start (the real table says stage 1 for wave 2: 4.5's cheat semantics), so the solo expiry check sets the solo World's `debug.decayStageByWave = [3,3,3,3,3]` (the server's `DEV_DECAY_STAGES`) first.
- Online the police line (4.7) closes the lot's north side: the keyboard walk to the lot fire goes round it via the south street.

### Completion Notes List

- Ultimate context engine analysis completed - comprehensive developer guide created.
- **Stage 3 contains:** two of three cars burning (`parked_car_1`, `parked_car_2`, `street_car_west`; `streams.decay`, pick 2), zone r 2 m round the car's centre, the cars stay solid cover; 4.2's `sandbags_south` (unchanged); 4.9's full rain (unchanged); 4.5's stage-3 spawns.
- **Decisions D1–D14** as in Dev Notes. In short: downed players are spared (own countdown), fire kills credit nobody (no reward, no assists), turrets and barricades burn, inside = strict circle overlap, zones don't stack, pulses of 5 every 0.5 s, fires go out at the build start 2 waves after the one that lit them (step 1 of the build-start order, fields rebuilt, no banner).
- **One apply path:** `applyDecayStage(world, stage, variants, firesOut)` (shared) builds the burning list and the nav fire cost; the DecaySystem computes `firesOut` (`fireExpiry`) and end waves (`lightNewFires`); `updateFires` in the `decayTimers` slot does the damage (server and solo only); `segmentHitsFire` for zombies' straight-line check.
- **Tests added:** `decay/fire.test.ts` (13: balance + schema refusals; Downtown candidates + all 3 pairs seen + 2 burn in every run; same seed + replay digest through a stage-3 bot run with expiry; each target type; going down + building burning down; no stacking / phases / god mode / wipe; real timeline waves 5–6; expiry alone (rebuild at the build start, no banner, redraw key); cheat back and forth; nav cost; "zombies route around a burning car but still reach us"; "with no other way they cross"; every spawn × type at stage 3 reaches the team, 28 of 29,248 zombie-ticks in fire), `sim/NetSimHost.fire.test.ts` (6: mirror + Predictor fires and expiry, redraw key, hidden tab, `?lag` throttle copy, cue from server events, solo LocalSimHost damage), `tools/netsim/fire.test.ts` (2: lag 150/20, client HP = server HP, every fire hit seen, 0 corrections from fire, fires out on the client when out on the server, hidden tab across the expiry), `syncState.test.ts` (+1), `decayBandwidth.test.ts` (+1), `tickCostDowntown.test.ts` (+1), the Downtown fuzz (fires vs an independent rewrite from map data, damage liveness, expiry in every stage-3 layout).
- **Fuzz run (after the merge):** 48 layouts, all 45 variant masks; 32 stage-3 layouts with 2 fires each, 19 zombie pulses (8 fire kills), 440 building pulses, 183 zombie-ticks in fire, 32 expiries; every zombie reached a player, no body in a box.
- **Mutations proven** (script `/tmp/s48mut/run.py`, outside the repo; each makes the listed tests fail, then restored):

  | # | Mutation | Failing tests |
  |---|---|---|
  | M1 | downed players burn | each target type |
  | M2 | zombies don't burn | each target type |
  | M3 | buildings don't burn | each target type, building burns down |
  | M4 | turrets don't burn | each target type |
  | M5 | touching counts as inside | each target type |
  | M6 | zones stack | no stacking / phases |
  | M7 | burns in the lobby | no stacking / phases |
  | M8 | fire kill credited to a player | each target type |
  | M9 | fires never go out | replay, real timeline, expiry alone, cheat, NetSimHost.fire, netsim fire, fuzz (8) |
  | M10 | out one wave early | replay, real timeline, expiry alone |
  | M11 | no nav fire cost | nav cost, route around, player-visible stage 3 |
  | M12 | fire cells are walls | nav cost, "no other way", player-visible |
  | M13 | zombie line of sight ignores fire | player-visible stage 3 (fire-tick share) |
  | M14 | fields not rebuilt when only fires go out | expiry alone |
  | M15 | syncState never writes `decayFiresOut` | syncState 4.8, bandwidth 4.8 |
  | M16 | mirror ignores `decayFiresOut` | NetSimHost.fire (2), netsim fire (2) |
  | M17 | Predictor ignores `decayFiresOut` | NetSimHost.fire (2), netsim fire (2) |
  | M18 | snapshot without `burnTicks` | replay digest |
  | M19 | a pulse every tick | each target type, phases, player-visible |
  | M20 | bites count as fire hits (cue) | fire cue pure |
  | M21 | fires burn 3 waves | real timeline, expiry alone, cheat |
  | M22 | a map radius override (1 m) on one car | Downtown candidates, no stacking |

- **Bandwidth:** burning with nobody inside: 0 B/s added (idle patch unchanged, 5 B); a player standing in fire: **+24 B/s** (2 `player.damaged` events of 5 B + the HP field); 4 players all in fire ≈ 100 B/s; the expiry: `decayFiresOut` +5 B once; lighting: nothing extra (it rides on the stage change). Fire kills are ordinary `zombie.killed` events; no `zombie.hit` per pulse. Online browser overlay: down 0.7 KB/s (one player, no wave).
- **Perf** (`PERF_ASSERT=1`, load 2.1–2.2 with other builders): 4 players + 150 Walkers at stage 3, 2 fires burning vs fires out: p99 0.687 vs 0.518 ms (**+0.169 ms**), mean +0.020 ms; 70 pulses in 700 ticks. Build-start spike test unchanged.
- **Browser** (Python Playwright + Chromium headless 1280×720, server :2681 `DEV_DECAY_STAGES=3,3,3,3,3`, Vite :5281, temp config deleted), shots in `/tmp/s48pw/shots/`: `solo-1-two-fires.png` (cheat → stage 3: street_car_west + parked_car_1 burning, sandbags, rain); `solo-2-player-in-fire.png` (survivor beside the burning car: HP 100 → 75 in ~3 s of headless time, HUD "HP 75 / 100   Burning"); `solo-3-zombies-route.png` (wave 1 with both fires: 864 zombie samples, 0 inside a fire); `solo-4-fires-out.png` (after Skip wave × 2: build before wave 3, fires gone, `firesOut` 6, re-baked). Online (`?lag=150&jitter=20`, solo start): stage 3 at the first build with parked_car_1 + parked_car_2 burning, the Predictor's fires = the mirror's, walked by keyboard into the lot fire: HP 100 → 80, "Burning" on; corrections 3 / snaps 0 (from walking round the police line's corner under lag, not fire). No page errors.
- **Not verified:** real phones/touch; the ember tint on the survivor is subtle on the dark sprite (the HUD line is the clear cue); the zone's 2 m edge is not drawn as an area (4.9's flames + glow only: a playtest point for 4.10); an online run reaching the expiry (needs 2 cleared waves; covered by the netsim and NetSimHost tests); multiple online players in fire; no fire/rain ambience loop for stage 3 (optional, left to 4.10 / Epic 9; 4.7's `audio/ambience.ts` keeps its stage-2 loop at stage 3); headless Chromium ran at ~18–24 fps.

### Notes for the merge (brief line 19)

- **Map files:** `tools/maps/buildDowntown.ts` is the source; my edits are the `hazards` array (two `fire` rects removed) and the block marked `---- Story 4.8 … end Story 4.8` in `decay`. **Never hand-merge** `downtown.tmx`, `apps/client/public/assets/maps/downtown.tmj` or `packages/shared/src/map/data/downtown.tmj.json`: take either side and run `npm run maps:build`.
- **Map loader (`loadTiledMap.ts`, `districtMap.ts`):** an ignite's `radiusM` is optional (0 = `decay.json › fire.radiusM`); at most `MAX_DECAY_FIRES` (32) ignites.
- **Balance:** `decay.json › fire` block (+ schema refines); `balance.version` changes.
- **Decay (`decayState.ts`, `applyDecayStage.ts`, `decaySystem.ts`, new `fire.ts`):** `DecayState` gains `firesOut`, `fireSlots`, `fireEndWave`, `burnTicks`; `FireRecord.index`; `createDecayState(variants, map?, radius?)`; `fireRecordOf(m, index, radius)` (no cache); `applyDecayStage(world, stage, variants, firesOut = world.decay.firesOut)`; `decayMutate` expires and lights fires and returns true when only fires changed; `decayFinish` emits `decay.stage_changed` only when the stage changed.
- **`runStateMachine.startBuild`:** unchanged (the expiry lives in `decayMutate`).
- **Systems:** `decayTimers` = `updateFires` (tests of one mechanic that pass `systems` may want `decayTimers: () => {}`).
- **Nav grid (`flowField.ts`):** `NavGrid.fireCost` + `setNavFires`; `rasterizeBuildings` adds it to `enterCost`. **Zombie AI:** the straight-line check also counts fire.
- **Schema / `syncState` / `stateView` / `fakeRoom`:** `decayFiresOut` appended after `decayVariants` (take both sides if another story appends); `resetRunFields` clears it; devThrottle needs nothing.
- **Snapshot:** `decay.firesOut`, `fireEndWave`, `burnTicks` (digests of a given seed change).
- **Client:** `mirrorDecay(world, stage, variants, firesOut)`; `Predictor.syncDecay(…, firesOut)` + `fireNames`; `render/fireCue.ts` (new); `PlayerView.update(…, burning)`; `hudModel.burning`; HudScene HP line. `CityView` needs nothing: a fire going out bumps `obstacles.version`.
- **Review round:** `PlayerState.fireTicks`, `Building.fireTicks`, `ZombiePool.fireTicks` (burn clocks; hand-written literals of these types need the field); `destroyBlockedBuildings(world, newFires?)`; `moveOutOfNewFires`; fire respects `waves.paused` (tests that pause waves and expect fire must unpause or use a no-op wave system).
- **Variant bits:** after 4.7, movers are bits 0–5 and the fire group bits 6–8; `legalDecayMasks(DOWNTOWN_MAP)` = 45. Tests that pick a fire should look the variant up by name.

### File List

- New: `packages/shared/src/decay/fire.ts`, `packages/shared/src/decay/fire.test.ts`, `apps/client/src/render/fireCue.ts`, `apps/client/src/sim/NetSimHost.fire.test.ts`, `tools/netsim/fire.test.ts`, this story file.
- Modified (shared): `config/balance/decay.json`, `config/balanceSchema.ts`, `core/{systems,world,worldSnapshot}.ts`, `decay/{applyDecayStage,decayState,decaySystem}.ts`, `index.ts`, `map/{districtMap,loadTiledMap}.ts`, `map/data/downtown.tmj.json`, `net/stateView.ts`, `zombies/{flowField,zombieAi}.ts`; tests `decay/{decay,panic}.test.ts`, `map/{downtown,evening}.test.ts`, `zombies/downtown.fuzz.test.ts`.
- Modified (server): `rooms/schema/{RunState,syncState}.ts`; tests `rooms/schema/syncState.test.ts`, `run/{decayBandwidth,tickCostDowntown}.test.ts`.
- Modified (client): `net/{fakeRoom,mirrorDecay,prediction}.ts`, `render/PlayerView.ts`, `render/city/testScene.ts`, `scenes/{GameScene,HudScene,hudModel}.ts`, `sim/NetSimHost.ts`, `public/assets/maps/downtown.tmj`; tests `net/lobbyStore.test.ts`, `render/city/palette.test.ts`.
- Modified (tools): `maps/{buildDowntown.ts,downtown.tmx}`.
- Tracking: `_bmad-output/implementation-artifacts/sprint-status.yaml`.
- Review round: new `apps/client/src/render/city/fireRing.ts` + `fireRing.test.ts`; modified `packages/shared/src/{player/player,buildings/buildings,zombies/zombiePool,core/worldSnapshot,decay/fire,decay/decaySystem,index}.ts`, `decay/fire.test.ts`, `apps/client/src/render/city/{CityView,drawCity}.ts`, `apps/server/src/run/{decayBandwidth,tickCostDowntown}.test.ts`.

## Senior Developer Review (AI)

Fresh-agent review of c13816c: **fixes needed** (three Medium, no High). All fixed here (decisions by the coordinator):

| # | Sev | Finding | Fix |
| --- | --- | --- | --- |
| M1 | M | A fire lit at the build start burned whoever stood next to the car; idle solo players could go down in the build phase. | `moveOutOfNewFires` (step 3): standing players in a newly lit zone go to radius + body radius (free-spot fallback); downed stay. Tests: idle against `street_car_west` at the stage-3 build start → moved, never damaged, the wave starts; a downed player isn't moved. |
| M2 | M | Barricades/turrets under a newly lit fire burned with no refund (unlike blocked cells). | `destroyBlockedBuildings(world, newFires)`: destroyed + 50 % refund at ignition, same path; later placements still burn. Test. |
| M3 | M | The damage edge was invisible: scorch faded early, the light pool reached 5 m. | Ember ring at the exact damage edge (D16), embers, hard scorch falloff at 0.9 R, light/glow inside the ring. Test + screenshots `/home/claude/proto/s48/ring-*.png`. |
| L4 | L | Stepping out on the shared pulse tick dodged all damage (360/400 ticks in fire, 0 damage). | Per-body burn clock (D3). Tests: the step-out trick deals exactly 36 hits; first hit one pulse after entering. Bandwidth unchanged: +24 B/s per burning player. |
| L5 | L | Fire after economy in the tick. | Kept (fixed architecture order); documented as D17 for 4.10. |
| L6 | L | Fire ignored the dev `waves.paused` switch. | Nothing burns while paused. Test. (Perf/bandwidth tests that used `pauseWaves` now hold waves with a no-op wave system / unpause in the build phase.) |
| L7 | L | D11's crossing cost (40–80 m) was wrong. | ~90 m. |
| C | — | Mutation "zombie loop forwards" survived. | Test: two zombies die by fire mid-list while two others burn; both survivors took their hit. |

**Mutations proven after the fixes** (`/tmp/s48mut/review.py`; each fails its test, then restored): R1 no push-out at ignition; R2 pushed to the zone radius only; R3 downed players pushed too; R4 buildings in new fires kept; R5 burn clock resets outside (dodgeable); R6 shared world pulse clock; R7 zombie loop forwards; R8 fire ignores `waves.paused`; R9 ring drawn at radius + body radius. The build's M1–M22 re-run: all still fail their tests except M19 ("a pulse every tick"), whose code line no longer exists (superseded by R5/R6).

**Fuzz after the fixes:** 48 layouts, 45 masks; 32 stage-3 layouts with 2 fires, 11 buildings destroyed + refunded at ignition (none left in a new fire, no standing player left in one), 18 zombie hits (7 fire kills), 32 expiries; every zombie reached a player. **Perf** (`PERF_ASSERT=1`, load 0.6–0.9): burning vs out p99 +0.012 ms. **Gates:** typecheck, lint, test (190 files, 1,379 passed, 3 skipped), build green (load 0.7–1.0).

**Browser** (solo, Vite :5281, temp config deleted): `ring-1-both-lot-fires-close.png` (both lot fires, rings, survivor 0.05 m outside the ring: no damage in 1.5 s), `ring-2-body-touches-ring-burns.png` (body 0.1 m over the ring: HP 100 → 90, "Burning"), `ring-3-whole-map.png`; at the ignition the solo survivor (at the team start) wasn't touched. Copied to `/home/claude/proto/s48/`.

## Change Log

- 2026-11-22: Story file written (gds-create-story) and built: car fires (2 of 3 cars, 10 dmg/s, 2 waves, flow cost, sync on change, hurt cue), tests and mutations; merged 4.6/4.7 (9009877), map regenerated, 45 combinations re-checked. Status review.
- 2026-11-22: Review fixes M1–M3, L4–L7 and the zombie-order test; Status done.
