# Story 3.4: Place a wood barricade

Status: review

## Story

As a player,
I want to place barricades on a grid during the build phase,
so that I can close paths and shape the fight.

> **Epic 2 retro (2026-11-22): the "EPIC 3 BRIEF" is this story's checklist.** Line 4 is central: buildings block movement in the **shared** collision (`movePlayers`), so the client's `Predictor` World holds the same buildings, and the netsim harness proves walking into a barricade at 150 ms RTT gives 0 snaps.

> **Decisions made while writing this story (2026-11-22, no designer questions asked; change any of them freely):**
> 1. **Building model (shared, `packages/shared/src/buildings/`).** A building is a plain object `{ id, type, ownerId, gx, gy, rot, hp, maxHp, minX, minY, maxX, maxY }` in `world.buildings.list`, kept sorted by `id` (ids count up per World, never reused). Its centre is the **integer grid point (gx, gy)** (1 m grid, `BUILD_GRID_M`), and `rot` (0–3, 90° steps) swaps width and depth, so every footprint is an axis-aligned box and rotation turns it in place. A 2 × 0.5 m barricade at rot 0 covers x ∈ [gx − 1, gx + 1], y ∈ [gy − 0.25, gy + 0.25]; Story 3.6's 1 × 1 m turret covers [gx ± 0.5] × [gy ± 0.5]. `world.buildings.version` counts every add/remove (Story 3.5 rebuilds its flow field when it changes).
> 2. **Collision = circle vs box push-out**, the same function for players (in `movePlayers`, so server and prediction agree) and zombies (last step of the zombie system, after the player push-out and before the map clamp). Only `+ − × ÷ sqrt min max` (the 2.6 determinism rule). Projectiles and melee ignore buildings (FR53: bullets pass over).
> 3. **Placement is applied between ticks** (like `setBuildReady`): the server's message handler calls the shared `placeBuilding`, which validates, charges (`spendMoney`), adds the building and emits `building.placed` (delivered with the next tick's events). Solo calls the same function from `LocalSimHost`.
> 4. **Validation order (server and client):** unknown player → not build phase → unknown type → cap (6 per owner, `buildings.maxPerPlayer`) → money → spot (map edge, another building, a non-out player, an alive zombie). Touching edges are allowed (barricades can form a wall); overlap is strict.
> 5. **Preview colour = the whole check:** green when the server would accept it, red otherwise; the hint line under the wave text says why ("Can't build here", "Building limit reached (6)", "Not enough money"). ✓ always sends (the server is the judge; a refusal shows as a toast).
> 6. **Placement mode is client-only** (Story 3.1 decision 2): the sticks are off (every touch that is not a HUD button moves the preview; held sticks are released; the input sent is neutral, so the survivor stands still and does not shoot), the ⟳ ✓ ✕ buttons sit bottom centre where Ready and Shop are (both hidden while placing). The preview starts on the grid point 2 m in front of the survivor; a tap or drag moves it. ✓ and ✕ both end placement at once (✓ does not wait for the server). It also ends when the phase leaves "build", when the in-run menu opens, and on game over.
> 7. **Entry point:** Story 3.3's shop (merged before this story finished) lists `buildings.json` and calls `uiStore.request("startPlacement", id)`. While 3.3 was unmerged a temporary HUD button "Wood barricade $40" above Ready called the same request; it was **removed in the merge** (the shop replaces it).
> 8. **Schema:** `RunState.buildings: MapSchema<BuildingState>` keyed by the building id as a string, fields `type, owner, gx, gy, rot, hp` (uint8/uint16). A placement costs ~40 bytes once; HP is assigned only when it changes (3.5 damages it); an idle building costs 0 B/s. Buildings go to every client (no interest filter: at most 24, static).
> 9. **Refusals:** C2S `building.place { type, gx, gy, rot }` → S2C `building.refused { reason }` to the sender only. `reason` is a `PlaceError` code; the client maps it to text.
> 10. No keyboard shortcuts (R / Enter) yet: the buttons are clickable with the mouse; add keys to `keyMap.ts` later.

## Acceptance Criteria

1. **Placement mode (FR50).** In a build phase, tapping the Wood barricade in the shop (Story 3.3) starts placement mode: both sticks are off, a preview snaps to the 1 m grid where I tap (tapping or dragging moves it), ⟳ rotates it in 90° steps, and it is green when valid and red when blocked. ✓ confirms and ✕ cancels; either ends placement mode and turns the sticks back on. Placement mode also ends when the wave starts (and when the in-run menu opens).
2. **Placement (server).** For a valid spot the server places a 2 × 0.5 m barricade with 200 HP, charges 40 and emits `building.placed`. Price, size and HP come from `buildings.json`.
3. **Refusals.** A blocked spot (map edge, another building, a player standing there) is refused with "Can't build here"; a 7th building of the same owner with "Building limit reached (6)" (FR51); too little money with "Not enough money". Nothing changes on a refusal. The client shows the text.
4. **Blocking (FR53).** Neither players nor zombies pass a barricade; projectiles pass over it. Barricades persist across waves until destroyed (destruction: Story 3.5). Online, my predicted survivor stops at a barricade with no correction (netsim: 0 snaps at 150 ms RTT).
5. **Free spots.** `spotBlocked` (the build-start return, later joins) treats buildings as occupied.
6. **Guards.** `building.place` goes through `this.net.guard(schema, …)` (shared "other" bucket, 10/s); a burst over 25/s neither crashes, nor overspends, nor places more than the cap.
7. **All copies (brief line 3).** World → schema → `syncState` → `stateView` + key lists → `NetSimHost` mirror → `Predictor` → `devThrottle` copy → `snapshotWorld`.
8. **Tests.** Vitest covers footprint/rotation, validation (each refusal), charging, cap, collision (players stop and slide, zombies stop, projectiles pass), persistence across waves, free spots, net event round trip, schema sync, the mirror and throttle copies, the guard burst, and the netsim walk into a barricade.

## Tasks / Subtasks

- [x] **Task 1: Balance** (AC 2, 3)
  - [x] `config/balance/buildings.json` `{ maxPerPlayer: 6, types: { wood_barricade: { name: "Wood barricade", price: 40, widthM: 2, depthM: 0.5, hp: 200 } } }` + `buildingsSchema` in `balanceSchema.ts`, registered in `balanceFileSchemas` and `balance.ts` BUNDLED.
  - [x] `BUILD_GRID_M = 1` in `config/constants.ts` (structural: the wire carries grid indices).
- [x] **Task 2: Shared building model** (AC 2–5)
  - [x] `buildings/buildings.ts`: `Building`, `BuildingState` (`list`, `nextId`, `version`), `createBuildingState`, `buildingTypeIds(balance)`, `footprint`, `addBuildingAt` (sorted insert, version++), `removeBuilding` (for 3.5, version++), `ownedCount`, `placementError` (the full check, order in decision 4), `placeBuilding` (Result, `spendMoney`, `building.placed`).
  - [x] `buildings/collision.ts`: `pushOutOfBuildings(world, x, y, r, out)` and `circleHitsBuilding`.
  - [x] `world.buildings`; `snapshotWorld` adds it; `SimEvent` `building.placed`; index exports.
  - [x] `movePlayers`: push out after the move, then the map clamp. `updateZombies` pass 4: push out after the player push-out, then the clamp. `spotBlocked`: buildings.
- [x] **Task 3: Net contract** (AC 3, 6, 7)
  - [x] `C2S.BUILDING_PLACE`, `S2C.BUILDING_REFUSED`, `buildingPlaceSchema` (strict: `type` balance id ≤ 32 chars, `gx`/`gy` int 0–255, `rot` int 0–3), `BuildingRefused`.
  - [x] Net event `BUILDING_PLACED: 21` `[21, id, typeIndex, ownerSlot, gx, gy, rot]` + round trip.
  - [x] `BuildingStateView`, `RunStateView.buildings`, `BUILDING_STATE_FIELDS`; `RUN_STATE_FIELDS` keeps excluding the maps.
- [x] **Task 4: Server** (AC 2, 3, 6, 7)
  - [x] Schema `BuildingState` + `buildings: t.map(BuildingState)`; compile-time key checks.
  - [x] `syncState`: buildings added/removed when `version` changes, HP only on change (no per-tick allocation); `resetRunFields` clears them.
  - [x] `RunController.placeBuilding`; `RunRoom.onPlaceBuilding` (guard; refusal → `building.refused` to the sender; `building_refused` log at info).
- [x] **Task 5: Client sim hosts** (AC 1, 3, 4, 7)
  - [x] `SimHost.placeBuilding(type, gx, gy, rot)` and `takePlaceRefusal()`. `LocalSimHost` runs the shared function; `NetSimHost` sends `building.place` and takes refusals from `RunInbox.onBuildRefused`.
  - [x] `net/mirrorBuildings.ts`: schema map → a World's buildings (add/remove by id, HP). `NetSimHost` mirrors into its World each frame and into the `Predictor`'s World before every reconcile.
  - [x] `devThrottle` copies buildings (`BUILDING_STATE_FIELDS`); `fakeRoom` gets `buildings`.
- [x] **Task 6: Placement UI** (AC 1, 3)
  - [x] `scenes/placement.ts` (Phaser-free state: start, tap → snap, rotate, confirm, cancel, preview check) + tests.
  - [x] `uiStore` request `startPlacement(buildingTypeId)`; GameScene handles it (build phase, running, menu closed, my survivor alive).
  - [x] HudScene: ⟳ ✓ ✕, hint line; touches go to placement while active (the temporary Build button was removed when 3.3 merged).
  - [x] `render/BuildingView.ts`: placed buildings (wood) and the preview (green / red).
- [x] **Task 7: Tests + checks** (AC 8)
  - [x] Shared unit tests, `RunRoom.buildings.test.ts` integration, NetSimHost/throttle tests, `tools/netsim/barricade.test.ts`.
  - [x] Browser checks solo + two pages (one with `?lag=150&jitter=20`); screenshots in `/tmp/s34/`.

## Dev Notes

### Contract with Story 3.3 (shop, built in parallel)

- **Balance:** this story adds `buildings.json` (`maxPerPlayer`, `types.wood_barricade { name, price, widthM, depthM, hp }`), validated in `balanceSchema.ts`. The shop lists `Object.keys(balance.buildings.types)` (helper `buildingTypeIds(balance)`), shows `name` and `price`.
- **On tap** the shop calls `uiStore.request("startPlacement", buildingTypeId)` and closes. This story implements the handler (placement mode) and the server-validated placement.
- **Server:** `building.place` (guarded, phase build, grid, bounds, overlap with buildings/players/zombies, cap 6 per owner, price via `spendMoney`). Errors: "Can't build here", "Building limit reached (6)", "Not enough money" (`placeRefusalText`). Event `building.placed`.
- **Temporary entry point:** a HUD "Wood barricade $40" button existed while 3.3 was unmerged; removed when merging 3.3 (the shop is the entry point).
- Placement ends on ✓ / ✕ and when the wave starts. Buildings persist across waves until destroyed (3.5).

### Fit with Stories 3.5–3.7

- 3.5 (flow field 0.5 m, building attacks, `building.destroyed`): rebuild when `world.buildings.version` changes; destroy with `removeBuilding(world, id)`; damage writes `hp` (schema syncs it on change). Its system goes in the `buildings` slot of `SYSTEM_ORDER` (still a no-op here). A barricade at rot 0 covers half cells at y = gy ± 0.25: rasterize the box conservatively (any overlapped 0.5 m cell is blocked) or by cell centre; the zombie push-out keeps them out either way.
- 3.6 (turret 1 × 1 m, 300 HP, 250): add a type to `buildings.json` (extra fields with defaults); same placement, cap and collision. Kills pay `economy.buildingKillShare` to `ownerId`.
- 3.7 (repair 50 %): `hp`/`maxHp` live on the building; a new guarded message like this one.

### Current state (read before changing)

- `world.run.phase === "build"` is the only phase that may place (3.1). The run starts in a build phase (`startBuild` in `RunController`/`LocalSimHost`).
- `spendMoney(world, id, amount)` (3.2) returns a `Result`; the economy module is the only other writer of wallets.
- `movePlayers` runs on the server and in the predictor (`PREDICTION_SYSTEMS`); its rules must stay identical on both.
- The predictor owns a private World (`createWorld({ map, systems: PREDICTION_SYSTEMS })`): it must get the buildings explicitly.
- `PLAYER_STATE_FIELDS` / `RUN_STATE_FIELDS` are checked against the schema at compile time (`RunState.ts`), and `devThrottle` iterates them.
- `HudButtons` + `routePointer`: a touch that starts on a visible button never spawns a stick.
- Events emitted between ticks are delivered with the next tick (`EventBus.flush` in `step`).

### Rules

- No per-tick/per-frame allocation (collision uses a module-level scratch; the mirror reuses callbacks). Placing allocates one object (rare).
- Never trust the client: the server recomputes everything from `type, gx, gy, rot` and its own World.
- Every number in balance JSON except the structural grid size.

### Testing

- One mechanic per test (`systems: { waves: () => {} }` where waves would interfere), fixed seeds, `bootTestServer()` for the room test in `RunRoom.buildings.test.ts`.

### Project Structure Notes

- New: `packages/shared/src/buildings/{buildings,collision}.ts` (+ tests), `config/balance/buildings.json`, `apps/client/src/net/mirrorBuildings.ts`, `apps/client/src/scenes/placement.ts`, `apps/client/src/render/BuildingView.ts`, `apps/server/src/rooms/RunRoom.buildings.test.ts`, `tools/netsim/barricade.test.ts`.
- Matches the architecture's `shared/buildings/` ("placement grid, building behaviors, repairs").

### References

- `_bmad-output/planning-artifacts/epics.md` › Story 3.4 (and 3.5–3.7), FR50–FR53.
- GDD › Buildings and Defenses (1 m grid, cap 6, barricade 2 m / 200 HP / 40).
- `game-architecture.md` › System order, Buildings (`packages/shared/src/buildings`), Error Handling (`Result`).
- `epic-2-retro-2026-11-22.md` › EPIC 3 BRIEF; `HANDOFF.md` §3.

## Dev Agent Record

### Agent Model Used

Claude Opus 5.5 (claude-opus-5-5), BMAD gds-create-story + build, 2026-11-22.

### Debug Log References

- `npm run typecheck && npm run lint && npm test && npm run build` pass on `story-3-4` merged with `claude/epic-2-continue` at 11e61ae (3.1 review fixes + Story 3.3): 128 test files, 934 passed (3 skipped).
- Netsim (`tools/netsim/barricade.test.ts`): wall at 75 ± 10 ms one way (150 ms RTT), seeds 31–33: **snaps 0, corrections 0**, maxError 2.7e-6 m, the survivor pressed the wall (gap 0.0000 m); 300 ms RTT: snaps 0; placed ahead of a walking survivor: snaps 0; control (predictor without buildings): 102 visible corrections.
- Bandwidth (`syncState.test.ts`): the patch of the tick a barricade is placed is 52 B (incl. `tick` and the wallet), an idle tick with buildings 5 B (= `tick` alone, as before); `building.placed` event 7 small ints (≤ 8 B msgpack). Added steady-state bandwidth: **0 B/s**; ~60 B once per placement.
- Browser (Playwright, headless Chromium, 844 × 390 @2x, touch), screenshots in `/tmp/s34/`, logs `solo-log.txt`, `online-log.txt`:
  - solo (01–12): preview ahead green, red on me ("Can't build here"), ⟳ then green, ✓ places (wallet 100 → 60, Ready back), ✓ on a blocked spot → toast "Can't build here", ✕ cancels, walking (W) into a barricade stops at the face exactly (y 13.65), pistol shots cross the barricade (4 samples past it), wave 1: 0 zombie-in-building samples over 15 s, Skip wave → build 2: both buildings still there, "Not enough money" preview with $30, the build timer running out ends placement mode.
  - after merging 3.3 (30–33): Shop lists "Wood barricade $40", tapping it closes the shop and starts placement; with `?wallet=1000` six placed, the 7th preview shows "Building limit reached (6)" and ✓ gets that toast.
  - two pages, guest with `?lag=150&jitter=20` (20–26 with the temporary button, 40–43 again through the shop): guest places (host sees it, guest $60), guest walks into it: **0 snaps, 0 corrections**, predicted y = server y = face; server refusal (on the host) shows "Can't build here"; "Not enough money" toast; host fires over its wall (14 projectile samples past barricades); 0 zombie-in-building samples, 462 "touching" samples (zombies pressed on Bo's barricade); placement inactive once the wave started.

### Completion Notes List

- Built the shared building model (`buildings/buildings.ts`: footprint, sorted list, `version`, `placementError`, `placeBuilding`, `addBuildingAt`, `removeBuilding`) and collision (`buildings/collision.ts`), wired into `movePlayers` (server + prediction), the zombie system (last push before the clamp) and `spotBlocked`.
- Server: schema `BuildingState` map, `syncState` (adds/removes on `version` change, HP only on change, no per-tick allocation), `RunController.placeBuilding`, guarded `building.place` → `building.refused { reason }` to the sender.
- Client: `SimHost.placeBuilding / takePlaceRefusal` (solo at once, online via the inbox), `mirrorBuildings` into the mirror World and the Predictor (before every reconcile), `Placement` state + `placeRefusalText`, HUD ⟳ ✓ ✕ + hint, `BuildingView` (wood look, green/red preview with a 1 m grid).
- **Epic 3 brief:**
  - L2: git status clean, typecheck + lint + test + build pass on the branch merged with the current `claude/epic-2-continue` (11e61ae).
  - L3 (all copies): World `buildings` → schema `RunState.buildings` (`BuildingState`) → `syncState.syncBuildings` (+ `resetRunFields`) → `BuildingStateView`/`RunStateView.buildings`/`BUILDING_STATE_FIELDS` (compile-time key and view checks in `RunState.ts`) → `NetSimHost.applyState` (`mirrorBuildings`) → `Predictor.syncBuildings` in `takeSnapshot` → `DevThrottle` copy (buildings map, `BUILDING_STATE_FIELDS`) → `snapshotWorld.buildings`. `fakeRoom` too.
  - L4: collision is in shared `movePlayers`; the predictor's World gets the buildings of every snapshot before replaying; netsim at 150 ms: 0 snaps (and 0 corrections), plus a control run.
  - L6: no float timers added; collision and the mirror allocate nothing per tick/frame (module-level scratch and callbacks; the preview key is a number); placing allocates one object.
  - L7: ✓ is one HUD press → one `placeBuilding` → one message; `Placement.confirm()` returns null a second time; each message is one placement attempt (tests: room refusals, burst).
  - L8: the server recomputes everything (`placementError`: phase, type, rotation, integer grid, cap 6, wallet, bounds, overlap with buildings/players/zombies) and charges with `spendMoney`; refusals are `Result` errors shown as text.
  - L9: `this.net.guard(buildingPlaceSchema, …)`, shared "other" bucket (10/s); burst of 40 → 6 placed, wallet exact, ≤ 11 handled, the rest rate-dropped; malformed messages dropped.
  - L11: building HP only on change; idle buildings 0 B/s; ~60 B per placement (no turret aim here).
  - L12: price, size, HP, cap in `buildings.json` (own block, schema-validated). The 1 m grid is a structural constant (`BUILD_GRID_M`, the wire carries grid indices); `PREVIEW_AHEAD_M` is presentation only.
  - L20: see Notes for the merge.
- Tests proven to fail once: the netsim control (no building sync → 102 corrections); the predictor-vs-server equality test fails if `movePlayers` skips buildings (checked by reasoning and by the control, not by a separate revert).
- **Unverified:** feel on real phones (headless Chromium runs ~14 fps; feel judged with the netsim); hidden-tab (`loop.sleep()/wake()`) during placement mode not exercised (no new phase; placement state is client-only and is cancelled by the phase check on the next frame); keyboard shortcuts for ⟳ ✓ ✕ do not exist (mouse clicks work).
- **Deviations:** buildings.json is `{ maxPerPlayer, types: {…} }` (not a flat record) so the cap lives in the buildings block; 3.3's `shopBuildings` reads both shapes. Zombies only slide along barricades (pathing and attacks are 3.5). Validation also refuses alive zombies on the spot (not in the AC, harmless in a build phase). The temporary HUD Build button was removed in the merge since the shop is in.

### Notes for the merge (brief line 20)

- `packages/shared/src/config/{balance.ts,balanceSchema.ts}` + 7 tests: `buildings` added next to 3.3's `shop` (both in the bundled list and the explicit test lists). New balance file `buildings.json`.
- `net/messages.ts`: `C2S.BUILDING_PLACE`, `S2C.BUILDING_REFUSED`, `buildingPlaceSchema` next to `SHOP_BUY`. `net/netEvents.ts`: kind 21 `BUILDING_PLACED`. `net/stateView.ts`: `BuildingStateView`, `RunStateView.buildings`, `BUILDING_STATE_FIELDS`; `RUN_STATE_FIELDS` excludes the maps.
- Server schema `RunState.ts` (`buildings` map + key checks), `syncState.ts` (`syncBuildings`, reset), `RunController.placeBuilding`, `RunRoom.onPlaceBuilding` (next to `onShopBuy`).
- `NetSimHost` (mirror + predictor sync, refusal sink), `LocalSimHost`, `SimHost` (both shop and placement methods), `session.ts` (`onBuildingRefused` next to `onShopAnswer`), `devThrottle.ts`.
- `GameScene`: `updatePlacement` runs after `updateShop`, gets `menuOpen || shopOpen`; the Shop button is hidden while placing; Ready hidden while placing. `HudScene`: ⟳ ✓ ✕ laid out where Ready + Shop are. `hudModel`: placement fields next to 3.3's shop fields.
- **For 3.5:** rebuild the flow field when `world.buildings.version` changes; destroy with `removeBuilding` (+ emit `building.destroyed`); damage writes `hp` (schema follows); put the system in the `buildings` slot. Zombies currently get a push-out at the end of `updateZombies` (keep it as the hard rule under the flow field).
- **For 3.6/3.7:** add types to `buildings.json` (extend `buildingTypeSchema` with defaults); `ownerId` for kill credit; `hp`/`maxHp` for repairs.

### File List

- New: `packages/shared/src/buildings/{buildings,collision}.ts`, `packages/shared/src/buildings/{buildings,collision}.test.ts`, `packages/shared/src/config/balance/buildings.json`, `apps/client/src/net/mirrorBuildings.ts`, `apps/client/src/render/BuildingView.ts`, `apps/client/src/scenes/placement.ts`, `apps/client/src/scenes/placement.test.ts`, `apps/client/src/sim/NetSimHost.buildings.test.ts`, `apps/server/src/rooms/RunRoom.buildings.test.ts`, `tools/netsim/barricade.test.ts`.
- Changed (shared): `config/{balance,balanceSchema,constants}.ts`, `core/{world,worldSnapshot,simEvents,systems}.ts`, `net/{messages,netEvents,stateView}.ts`, `player/{movement,freeSpot}.ts`, `zombies/zombieAi.ts`, `index.ts`; tests `net/netEvents.test.ts`, `economy/shop.test.ts`, balance-file lists in 7 tests.
- Changed (server): `rooms/RunRoom.ts`, `rooms/schema/{RunState,syncState}.ts`, `rooms/schema/syncState.test.ts`, `run/RunController.ts`.
- Changed (client): `sim/{SimHost,LocalSimHost,NetSimHost}.ts`, `net/{prediction,session,devThrottle,fakeRoom}.ts`, `net/lobbyStore.test.ts`, `scenes/{GameScene,HudScene,hudModel}.ts`, `ui/{uiState,sizes}.ts`.
- `_bmad-output/implementation-artifacts/sprint-status.yaml`, this file.

## Change Log

- 2026-11-22: Story written (gds-create-story), status ready-for-dev.
- 2026-11-22: Built: shared buildings + collision, server-validated placement, schema/mirror/predictor/throttle copies, placement mode UI; tests incl. netsim; merged `claude/epic-2-continue` twice (3.1 Ready request model; Story 3.3 shop, temporary Build button removed); status review.
