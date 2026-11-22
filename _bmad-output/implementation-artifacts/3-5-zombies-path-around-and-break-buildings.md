# Story 3.5: Zombies path around and break buildings

Status: review

## Story

As a player,
I want zombies to find their way around obstacles and smash through barricades that block them,
so that defenses buy time without making us invincible.

> **Epic 2 retro (2026-11-22): the "EPIC 3 BRIEF" is this story's checklist** (lines 2, 3, 6, 10, 11, 12, 14, 20 apply most). Line 10 / risk R1 is central: the goal of the field (the nearest player) moves **every tick**, so the field is refreshed on a **fixed cadence**, amortized, not only on building changes. State the cadence and the rebuild budget, benchmark **4 players + 150 zombies + 24 buildings: added tick p99 ≤ 2 ms**, and have a test that fails if the field goes stale for longer than the cadence.

## Acceptance Criteria

1. **Flow field (FR26, architecture › Zombie Pathfinding).** The World keeps a flow field on a **0.5 m grid** (48 × 32 m → 96 × 64 = 6,144 cells) holding, per cell, the path cost to the **nearest alive player**. It is rebuilt **continuously on a fixed cadence**, amortized: each tick settles at most `zombies.pathing.rebuildCellsPerTick` cells into a back buffer, and at most one rebuild completes (and swaps in) per tick. A full refresh takes `P = ceil(cells / budget)` ticks; a building placed or destroyed (`world.buildings.version` changed) is rasterized into the nav grid at once and is fully in the field by the next rebuild that starts after it (≤ 2P ticks). The field the zombies read is never older than `2P` ticks (stale test).
2. **Zombies follow the field** instead of walking straight whenever a building stands between them and their target (straight segment, inflated by the zombie's radius); with a clear line they walk straight (unchanged Epic 1 behaviour, and no staleness near the target). Separation, the overlap rule, the player push-out and the building push-out (the hard rule, last in `updateZombies`) still apply (FR26).
3. **Blocked → attack (FR53).** Building cells are passable in the field at a high cost (`buildingCostM` per cell), so a zombie routes around a wall when the detour is cheaper and otherwise heads for the cheapest building in the way. A zombie whose next field cell belongs to a building and who touches that building hits it with its type's **normal damage and attack interval** (`zombies.json`). A player in contact is hit first.
4. **Destruction.** A building at 0 HP is removed (`removeBuilding`), `building.destroyed` is emitted (sim event + net event kind 22), and the field is rebuilt (version changed). Both online pages and solo lose it on the same patch; the client's Predictor World loses it on the same patch as the mirror (R2).
5. **Health bar + damaged look.** A damaged building shows a health bar (above zombies) and a damaged look (darker wood and cracks by damage stage); a destroyed one bursts into debris. Drawn only when HP or the list changes (no per-frame allocation).
6. **Tests (seeded, Vitest):** routing around a wall; a fully closed ring → building attacks → a breach; rebuild after destruction; the stale test; determinism (two runs give equal `snapshotWorld`, which covers the field). **Benchmark:** a full-map 48 × 32 m rebuild time, amortized per tick ≤ budget; 4 players + 150 zombies + 24 buildings added tick p99 ≤ 2 ms; added bandwidth reported.

## Tasks / Subtasks

- [x] T1 Shared field module `packages/shared/src/zombies/flowField.ts` (AC 1, 3)
  - [x] NavGrid: cols/rows from the map, `FLOW_CELL_M = 0.5` (constants), building id per cell (conservative rasterization: every cell the box strictly overlaps), per-cell entry cost (building cells `buildingCostM`, cells next to a building `nearWallCostM`), rasterized when `buildings.version` changes.
  - [x] FlowField: double-buffered `Int32Array` cost (front read, back built), indexed binary min-heap (cells, key = (cost, cell) for determinism), multi-source from alive players' cells, 8-connected (orthogonal 2, diagonal 3 units of 0.25 m; no corner cutting past building cells), `penalty: Uint16Array` per field + optional `fillPenalty` hook (for Story 3.8's flank field), slice budget, `sourceTick`, restart on version change.
  - [x] Queries: `flowCellAt`, `flowNextCell` (best neighbour: step + entry cost + neighbour cost), `flowFieldMaxAgeTicks`.
- [x] T2 `buildings` system slot: `buildings/buildingSystem.ts` `updateBuildings` advances the field (Story 3.6 adds turrets here) (AC 1)
- [x] T3 `zombieAi.ts`: line-of-sight to the target vs buildings; field steering (look-ahead, stop at building cells); per-zombie target building (module scratch); attack in pass 4 after the push-out (AC 2, 3)
- [x] T4 `buildings.ts`: `damageBuilding(world, b, amount, zombieId)` → hp, destroy at 0 (`removeBuilding` + `building.destroyed`) (AC 4)
- [x] T5 Events/net: `building.destroyed` SimEvent, net kind 22 round trip (AC 4)
- [x] T6 Balance: `zombies.json` › `pathing` block + schema (brief L12)
- [x] T7 World + `snapshotWorld` (field digest) (brief L3, L6)
- [x] T8 Client: `BuildingView` health bar + damaged look, `FxView` debris on `building.destroyed` (AC 5)
- [x] T9 Tests: flowField unit tests, zombie AI (around a wall, closed ring, rebuild after destruction, stale), determinism, net event, netsim (destroyed barricade at 150 ms → 0 snaps), integration `RunRoom.3-5.test.ts` (destruction reaches the schema), benchmark (AC 6)
- [x] T10 Browser checks solo + two pages (`?lag=150&jitter=20`), screenshots `/tmp/s35/`

## Dev Notes

### Decisions (made while writing the story; non-interactive)

- **D1 Cadence instead of "rebuild only on building changes"** (retro R1): the target moves every tick, so the rebuild never stops: when a rebuild completes it swaps in and the next one starts on the next tick with fresh player cells. Budget `rebuildCellsPerTick` = **2048** (balance) → **P = 3 ticks (150 ms)**; the front field is at most **2P = 6 ticks (300 ms)** old. A version change does **not** restart the rebuild (that would break the 2P age bound): the nav grid is re-rasterized at once (the attack rule and the next-cell choice read it), the in-progress rebuild reads the new costs, and the next rebuild has them everywhere (≤ 2P ticks).
- **D2 Buildings are expensive, not impassable** in the field: that is what makes a closed ring lead zombies to a wall (instead of an unreachable field) and lets a short detour win over breaking. Cost per building cell `buildingCostM` (balance, in metres of walking).
- **D3 Straight line when clear.** A zombie whose segment to its nearest alive player misses every building box (inflated by its radius) walks straight, exactly as before. The field is only read when that line is blocked. This keeps every Epic 1/2 behaviour and test (no buildings → no change), and covers the field's staleness where it matters (near the player). Story 4.1's map obstacles must join this test and the NavGrid.
- **D4 Attack rule:** next field cell is a cell of building B **and** the zombie (after the push-out) touches B → hit B with `stats.damage` on the same `attackCooldownTicks` as player hits. A player in contact this tick takes priority. Damage writes `building.hp` only (Story 3.7 repairs the same field to `maxHp`).
- **D5 Wire:** HP already goes out on change (Story 3.4 schema, `uint16`, `Math.ceil`). `building.destroyed` = kind 22 `[22, id, typeIndex, ownerSlot, gx, gy, rot]` for the debris FX. No `building.damaged` on the wire (the HP patch is enough).
- **D6 Determinism:** the field is server/solo-only state, evolved by its own system from World state; `snapshotWorld.pathing` carries its scalars and FNV hashes of the cost buffers. Story 8.4 (restore) must run one synchronous full rebuild after load.
- **D7 Field placement in code:** `world.pathing = { nav, chase }`; Story 3.8 adds `flank` (its own `FlowField` with a `fillPenalty` that marks cells within ±45° in front of players) and decides how two fields share the tick budget.

### Current state (read before changing)

- `zombieAi.ts` `updateZombies`: pass 1 desired velocity (straight at `nearestAlivePlayer`) + separation; pass 2 move + clamp; pass 3 overlap; pass 4 player push-out + attack, then `pushOutOfBuildings` (keep last). `alivePlayers` is a module scratch list.
- `buildings/buildings.ts`: `Building.hp/maxHp`, `removeBuilding` (version++), list sorted by id. `collision.ts`: `circleOverlapsBox`, `pushOutOfBuildings`.
- `core/systems.ts`: `buildings` slot is a no-op (between `player` and `combat`); `PREDICTION_SYSTEMS` keeps it a no-op (the client never runs zombies or the field).
- Server `syncState.syncBuildings` already adds/removes on version change and writes HP on change; `mirrorBuildings` copies HP and removes; `devThrottle` copies every `BUILDING_STATE_FIELDS` key. `BuildingView` already redraws on an HP-sum change.

### Rules

- No per-tick allocation: preallocated typed arrays, module scratch, no closures in loops. Timers in ticks. No inline gameplay numbers (balance `zombies.pathing`).
- Field math is integers (costs) and `Math.floor` for the cell index; it runs only on the server / solo, so exact cross-engine equality is not needed, but it must be deterministic in one engine (fixed neighbour order, (cost, cell) heap key).
- Tests of one mechanic pass `systems: { waves: () => {} }`; integration tests in `RunRoom.3-5.test.ts` with `bootTestServer()`.

### Fit with Stories 3.6 / 3.7 / 3.8

- 3.6: a turret is a building: the field and attack rule cover it unchanged; turret firing goes in `updateBuildings`. Its kills credit `ownerId`.
- 3.7 (parallel): writes `hp = maxHp`; no other shared state. Possible conflict: net event kind number (3.5 takes 22).
- 3.8: second `FlowField` on the same NavGrid with `fillPenalty`; zombie types choose a field.

### Testing

- `flowField.test.ts` (unit), `zombieAi.pathing.test.ts` (around a wall, ring breach, rebuild after destruction, stale), `determinism`, `netEvents.test.ts`, `tools/netsim/barricade.test.ts` (+ destroyed-barricade case), `RunRoom.3-5.test.ts`, `tickCostFlowField.test.ts` (benchmark + bandwidth).

### Project Structure Notes

- New: `packages/shared/src/zombies/flowField.ts` (architecture names this file), `packages/shared/src/buildings/buildingSystem.ts`.

### References

- `_bmad-output/planning-artifacts/epics.md` › Story 3.5 (and 3.6, 3.8)
- `_bmad-output/planning-artifacts/game-architecture.md` › Zombie Pathfinding, tech table "Pathfinding"
- `_bmad-output/implementation-artifacts/epic-2-retro-2026-11-22.md` › EPIC 3 BRIEF, risk R1–R3
- `_bmad-output/implementation-artifacts/3-4-place-a-wood-barricade.md` › Fit with Stories 3.5–3.7, Notes for the merge
- `HANDOFF.md` §3

## Dev Agent Record

### Agent Model Used

Claude Opus 5.5 (claude-opus-5-5)

### Debug Log References

- `npm run typecheck && npm run lint && npm test && npm run build` pass on `story-3-5` merged with `claude/epic-2-continue` at 9824807: 131 test files, 958 passed (3 skipped).
- **Benchmark** (`apps/server/src/run/tickCostFlowField.test.ts`, run alone): full rebuild of the 96 × 64 grid with 24 buildings **0.77–1.07 ms** → **0.26–0.36 ms/tick** amortized over P = 3. Room tick (controller + syncState + events + patch encode), 4 players + 150 Walkers, 600 ticks: baseline p99 0.16 ms → with 24 buildings + field p99 0.55–0.89 ms; **added p99 0.38–0.74 ms** (≤ 2 ms; earlier single-run measurements 0.37–1.43 ms, hence the test keeps the lower p99 of two interleaved runs per case); mean added ~0.33 ms; field max age 5 ticks; 9 buildings broken and re-added in 30 s.
- **Bandwidth** (same benchmark, the two spawn pens being broken and re-added all the time — a worst case): patches 1,807 → 1,863 B/s (**+56 B/s**: HP on change + re-adds), events 392 → 415 B/s (**+23 B/s**, msgpack). A building under attack costs one `uint16` HP change per hit; idle buildings 0 B/s; `building.destroyed` 7 small ints once.
- **Netsim** (`tools/netsim/barricade.test.ts`, new case): the barricade I press on breaks at 75 ± 10 ms one way: **0 snaps**, 1 smoothed correction (0.68 / 0.90 m = my speed × RTT: the break can't be predicted), predictor loses the building on the same snapshot as the mirror, final error < ignore. Earlier 3.4 cases unchanged (0 snaps).
- **Browser** (Python Playwright, headless Chromium 844 × 390 @2x, touch; screenshots `/tmp/s35/`, logs `solo-log.txt`, `online-log.txt`; placements via `host.placeBuilding` — the shop/placement UI path is 3.4's and unchanged):
  - solo A (`?wallet=1000&zdmg=0.2`, walls of 3 barricades 3 m north and south, open ends; 01–03): 3,370 zombie samples, **0 inside a building**, 369 samples beside the walls between them (came round the ends), all 6 HP 200 (nobody broke a wall they could walk round).
  - solo B (closed 4-barricade box around me; 10–14): first hit at 14 s (bar shows, 11), badly damaged walls darker with cracks and yellow/red bars (12), **breach at 22.8 s** (bottom wall gone, debris; 13), a zombie reached me 0.9 s later (14); 0 inside-building samples; no page errors.
  - two pages, guest `?lag=150&jitter=20` (20–26): host builds the box around itself; HP identical on both pages ([140,160,200,200] on both), health bars on both; the breach reaches the host page at 27.1 s and the lagged guest at 28.3 s (polling at ~14 fps + lag); after it both pages hold the same 3 buildings with the same HP; the guest's Predictor World had 3 buildings when its mirror did; guest netStats 0 snaps, 0 corrections; no page errors.
- Tests proven to fail once (mutations, then restored): the field frozen after its first rebuild → the cadence test, the **stale test** and the rebuild-after-destruction test fail; zombies never reading the field → route-around, closed-box attack, breach and determinism-with-buildings fail.

### Completion Notes List

- Built `zombies/flowField.ts` (NavGrid + FlowField: conservative rasterization of building boxes, building cells passable at `buildingCostM`, near-wall cost, double-buffered multi-source Dijkstra with an indexed heap, amortized cadence, `penalty`/`fillPenalty` hook for 3.8, snapshot digest), the `buildings` system slot (`buildings/buildingSystem.ts` → `updatePathing`), zombie steering (straight while the line to the target is clear of buildings, field otherwise; target building on the next cell; steer at its face) and attacks in `updateZombies` pass 4 after the push-out; `damageBuilding` (whole HP, removal + `building.destroyed`); net kind 22; client health bars, damaged look and debris.
- **Epic 3 brief:**
  - L2: git status clean; typecheck + lint + test + build pass on the branch merged with the current `claude/epic-2-continue` (9824807).
  - L3 (all copies): new World state `world.pathing` → server/solo only, never synced (not schema/stateView/NetSimHost/Predictor/devThrottle by design: derived) → `snapshotWorld.pathing` (counters + FNV hashes). Building HP already flows World → schema `BuildingState.hp` (on change) → `syncState` → `BuildingStateView` → `mirrorBuildings` (NetSimHost mirror and Predictor) → devThrottle (`BUILDING_STATE_FIELDS`); removal on `version` change follows the same chain. New event `building.destroyed` → `simEvents` → `netEvents` kind 22 (round-trip test) → `FxView`.
  - L6: timers are ticks (attack cooldown shared with player hits); no per-tick allocation: typed arrays sized once, indexed heap, module-level seed callback, module scratch `targetBuilding`/`steer`; health bars redraw only on an HP-sum/version change; debris puffs pooled.
  - L10: cadence **P = ceil(6144 / 2048) = 3 ticks** per full refresh, front age **≤ 2P = 6 ticks (300 ms)**; budget 2048 cells/tick ≈ 0.26–0.36 ms; benchmark 4 players + 150 zombies + 24 buildings: added p99 0.38–0.74 ms ≤ 2 ms; stale test (`flowField.test.ts` › STALE TEST) fails if the age exceeds 2P or the field stops following a moving player (proven by mutation). Zombies within a clear line steer straight at the player, so field staleness never shows near the target.
  - L11: +56 B/s patches and +23 B/s events in the worst-case benchmark; HP only on change; no turret aim here.
  - L12: `zombies.json › pathing` (`rebuildCellsPerTick`, `buildingCostM`, `nearWallCostM`, `lookaheadCells`), schema-validated; the 0.5 m cell is the structural `FLOW_CELL_M` (architecture); `LOS_MARGIN_M`, `BUILDING_PUSH_PASSES` are geometric tolerances, not tuning.
  - L14: one mechanic per test (`systems: { waves: () => {} }`), seeded; the integration test is `RunRoom.3-5.test.ts` with `bootTestServer()`.
  - L20: see Notes for the merge.
- **Unverified:** feel on real phones (headless ~14 fps); hidden-tab / late scene start (no new phase or client state; the only client additions are draw-on-change views); more than one simultaneous breach online; Story 4.1 map obstacles (must join the line-of-sight test and the NavGrid).
- **Deviations / findings:**
  - No restart of an in-progress rebuild on a building change (see D1): it keeps the 2P age bound; the change is rasterized at once.
  - Zombies use the field only when a building blocks the straight line (D3); with no buildings everything is as before.
  - `updateZombies` calls the building push-out up to 3 times (`BUILDING_PUSH_PASSES`) — a stopgap for the 3.4 review's H1 (a crowd squeezed zombies through the 0.5 m gap between two barricades). Once story-3-4b's push-out iterates until stable, the second call returns false and the loop can go.
  - **Finding (3.4 H2, already being fixed in story-3-4b):** with centre-on-integer placement an L corner of a rot 0 and a rot 1 barricade either overlaps or leaves a 0.75 m slot, which a 0.7 m zombie fits through; my tests and browser checks close boxes with four rot 0 barricades (0.5 m corner gaps).
  - Building damage uses the zombie type's damage, so `?zdmg`/`DEV_ZOMBIE_DAMAGE_SCALE` scales it too (rounded to whole HP, at least 1).

### Notes for the merge (brief line 20)

- **story-3-4b (0.5 m min-corner placement):** the field rasterizes from `building.minX/minY/maxX/maxY` with strict-overlap cells, so it works for both geometries (with 3.4b no half cells). `FxView.debris` gets the centre through the shared `footprint(stats, gx, gy, rot)`, so it follows 3.4b's grid semantics. To adapt: the tests that place by `gx/gy` centre points (`flowField.test.ts`, `zombieAi.pathing.test.ts` `closedBox`/walls, `RunRoom.3-5.test.ts` expected tuple, `tickCostFlowField.test.ts` LAYOUT, netsim `breaks`) and `collision.test.ts`'s edited wall test; drop `BUILDING_PUSH_PASSES` when the shared push-out iterates.
- `core/world.ts` (+`pathing`), `core/systems.ts` (`buildings: updateBuildings`), `core/worldSnapshot.ts` (+`pathing`), `core/simEvents.ts` (+`building.destroyed`), `config/constants.ts` (+`FLOW_CELL_M`), `config/balanceSchema.ts` (+`pathingSchema`, `zombiesSchema.pathing`), `config/balance/zombies.json` (+`pathing` block; 3.8 adds its runner type to `types` and flank keys to its own block), `net/netEvents.ts` (+kind **22** `BUILDING_DESTROYED`; 3.7 took 24, 23 is free), `index.ts` (exports next to the 3.4 buildings block).
- `buildings/buildings.ts`: `damageBuilding` appended (additive); `buildings/collision.ts`: `segmentHitsBox`, `segmentHitsBuildings`, `distanceToBox` appended.
- `zombies/zombieAi.ts`: pass 1 (line of sight + field steering) and pass 4 (push-out loop + building attack); the push-out stays the last movement.
- Client: `render/BuildingView.ts` (bars Graphics at depth 12, damaged look; 3.7's selection outline is its own view), `render/FxView.ts` (`building.destroyed` debris, `balance` field), `scenes/GameScene.ts` (one line: `fxView.balance = balance`).
- **For 3.6:** turrets are buildings: rasterized, attacked and destroyed by the same code; put turret firing into `updateBuildings` (after `updatePathing`). Turret kills credit `ownerId`.
- **For 3.7:** repairs write `hp = maxHp`; HP is always whole; `DEV_PLACED_BUILDING_HP` and the "damage nearest building" cheat can stay or go (zombies damage buildings now).
- **For 3.8:** `createFlowField(world.pathing.nav, fillPenalty)` gives a second field on the same grid; add it to `PathingState` (`flank`) and advance it in `updatePathing` (share the budget, e.g. alternate ticks, so the added cost stays ≤ 2 ms); the zombie type picks the field in `steerByField`. `penalty` is added on entering a cell.

### File List

- New: `packages/shared/src/zombies/flowField.ts`, `packages/shared/src/zombies/flowField.test.ts`, `packages/shared/src/zombies/zombieAi.pathing.test.ts`, `packages/shared/src/buildings/buildingSystem.ts`, `apps/server/src/rooms/RunRoom.3-5.test.ts`, `apps/server/src/run/tickCostFlowField.test.ts`, this file.
- Changed (shared): `buildings/{buildings,collision}.ts`, `buildings/{buildings,collision}.test.ts`, `config/{constants,balanceSchema}.ts`, `config/balance/zombies.json`, `core/{world,worldSnapshot,systems,simEvents}.ts`, `net/netEvents.ts`, `net/netEvents.test.ts`, `zombies/zombieAi.ts`, `index.ts`.
- Changed (client): `render/{BuildingView,FxView}.ts`, `scenes/GameScene.ts`.
- Changed (tools): `tools/netsim/barricade.test.ts`.
- `_bmad-output/implementation-artifacts/sprint-status.yaml`.

## Change Log

- 2026-11-22: Story written (gds-create-story), status ready-for-dev.
- 2026-11-22: Built: flow field (cadence P = 3, age ≤ 6 ticks), field steering + building attacks + destruction, net kind 22, health bars/damaged look/debris; whole-HP rule for 3.7; tests incl. stale test, netsim, integration, benchmark; browser checks solo + two pages; status review.
