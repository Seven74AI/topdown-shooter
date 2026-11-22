# Story 3.6: Auto-turret

Status: done

## Story

As a player,
I want to buy an auto-turret that shoots nearby zombies,
so that I can hold a spot or cover a flank.

> **Epic 2 retro (2026-11-22): the "EPIC 3 BRIEF" is this story's checklist** (lines 2, 3, 6, 8, 11, 12, 14, 15, 20 in particular; Completion Notes say how each was met). Line 11 is central: **turret aim is derived client-side, never synced per tick.** The server sends one small `turret.fired` event per shot (building id + heading); every client draws the shot and turns the turret's head from it.

> **Parallel story 3.5** (flow field, zombies attack and destroy buildings, health bars, `building.destroyed` = net kind 22) is built at the same time. "Zombies blocked by or next to a turret attack it like any building" (AC 4) comes **only** from 3.5's generic building attacks: this story adds no attack code. On this branch the turret is a building like a barricade (collision, cap, repair), so once 3.5 merges, the turret is attacked and destroyed exactly like a barricade. Edits to the shared building files are additive; the turret rules live in a new file.

> **Decisions made while writing this story (2026-11-22, no designer questions asked; change any of them freely):**
> 1. **Balance (`buildings.json`, own block).** New type `auto_turret { name: "Auto-turret", price: 250, widthM: 1, depthM: 1, hp: 300, turret: { rangeM: 8, rateHz: 5, damage: 3, projectileSpeedMps: 40, projectileRangeM: 9, muzzleM: 0.5, hitPushbackM: 0.05 } }`. `buildingTypeSchema` gets an **optional** `turret` block (a type without it, like the barricade, never shoots: the "defaulted field"). The kill share is the existing `economy.buildingKillShare: 0.5`. Repair costs ceil(250 × 0.5) = 125 automatically (3.7). The shop lists it automatically (3.3 reads `buildings.types`). Projectiles at 40 m/s (guns: 60) so the placeholder shots are easy to see; 8 m takes 4 ticks.
> 2. **Only during a wave.** Turrets fire only while `world.run.phase === "wave"` (not in the build phase, the lobby or the results). Outside a wave their cooldown idles (no saved-up burst).
> 3. **Targeting (server, shared).** Each tick of a wave, a turret whose cooldown is ready looks for the **nearest alive zombie whose centre is within `rangeM` of the turret's centre** using the zombie spatial grid (`queryRadius`, the shared `zombieCandidates` scratch); ties go to the lower pool slot (deterministic). It retargets on every shot (no lock-on) and turns **instantly** (no turn rate: the AC says "turns to the nearest zombie"). It aims with a **first-order lead**: the target's last-tick displacement (`x − prevX`) × the bullet's flight ticks, so a walking zombie is hit; it does not lead through push-outs. Zombies only (never players); no line-of-sight test (bullets pass over buildings, FR53).
> 4. **Fire rate = the shared cooldown rule** (`combat/cooldown.ts`: `cooldownTickStart` → `cooldownReady` → `cooldownTickEnd(attacked, rateHz)`, the same functions the guns and the client's fire clock use). 5/s at 20 Hz is exactly one shot every 4 ticks. The state is one number per building (`Building.fireCooldownS`). This is the one place a timer is held in seconds, because the shared rule is; everything else counts ticks (brief line 6).
> 5. **Where it runs: the `buildings` slot** (`updateBuildings` in `buildings/buildingSystem.ts`, after 3.5's `updatePathing`; coordinator's instruction after 3.5 merged; the first draft ran it inside `updateCombat`). It runs before combat, so its shots fly in the same tick's combat, like a player's. The zombie grid there is last tick's (rebuilt at the start of combat): the query is widened by 1 m (`GRID_STALE_MARGIN_M`; a zombie moves ≤ 0.12 m a tick) and the range is checked exactly on the current positions, so no zombie in range is missed and the grid is never rebuilt twice.
> 6. **Projectiles are real server projectiles** in the shared projectile pool (they can miss, hit a zombie in the way, travel visibly), tagged with the building id (`pool.building`, 0 = a player's shot) and their own pushback (`pool.pushbackM`). A turret hit emits `zombie.hit` with `sourceId: null` (turret damage gives **no assist credit** and never confirms the owner's 2.7 apparent hits) and weapon = the building type id; a turret kill emits `zombie.killed { killerId: ownerId, buildingId }`.
> 7. **Kill pay (FR45):** the economy pays a `zombie.killed` that carries a `buildingId` with `payKill(world, zombieId, ownerId, economy.buildingKillShare)`: the owner gets floor(reward × 0.5) (Walker 2 → 1, Crawler 3 → 1); other players who damaged it get their usual assist. The owner's status does not matter (downed and out owners are paid, like the wave bonus); an owner who left the run is paid nothing (`earn` ignores unknown players), and the turret keeps shooting. A turret kill does **not** count as the owner's kill in the HUD/Results kill counters (those are "your kills").
> 8. **Net event `turret.fired` = kind 23** (`[23, buildingId, heading]`, ~4 B msgpack; 22 is 3.5's `building.destroyed`, 24 is 3.7's). The muzzle position is not sent: every client knows the building and computes it (centre + direction × `muzzleM`). `zombie.killed` appends the building id at index 6 only for turret kills (player kills stay 6 fields). No schema field is added: turrets cost 0 B/s when idle and HP stays "only on change" (3.4/3.5).
> 9. **Client.** `Building.aimX/aimY` (shared field): the server's World writes it on every shot (solo reads it directly); the online mirror writes it from each `turret.fired` at the render tick. A new `TurretView` draws a metal plate and a head with a barrel on every turret, turning smoothly toward the aim (frame-rate independent, no per-frame allocation). Online, a `turret.fired` spawns a cosmetic projectile (`CosmeticProjectiles.spawnShot`, like others' `weapon.fired`; never "mine", so it is not counted by the reversed-hit check); solo draws the World's real projectiles. Turret shots are drawn cyan (`ProjectileView`), with a small muzzle flash and a soft click (throttled to one per 80 ms).

> **Review decisions (main session, 2026-11-22; supersede decisions 7 and 8 where they differ):**
> - **M1, a turret never steals its owner's kill.** If the turret's owner is a recorded damager of the zombie (they hit it before), a kill by their turret is **the owner's own kill**: full type reward, counted in their kills (HUD and Results), other damagers get their usual assist. Otherwise (the owner never hit it) the owner gets floor(reward × `buildingKillShare`), not counted as a kill (as before). Done in the economy system: it sees every hit of the tick, so it decides there and strips the building id from the still-pending `zombie.killed`, so every later reader (kill counters, the wire, the client) sees an ordinary kill by the owner.
> - **M2, turret events by interest.** `turret.fired` and a turret's non-killing `zombie.hit` go only to clients whose horde view rect (2.5 `viewRect` around `viewTargetFor` + `HORDE_VIEW_MARGIN_M`) contains the turret or the shot's end (or the hit zombie); kills, money and everything else stay reliable to everyone, in emit order. Budget: patches + events ≤ 6 KB/s per client with the cap's worst case (24 turrets firing).

## Acceptance Criteria

1. **Buy and place (FR52).** In a build phase the shop lists "Auto-turret $250"; tapping it starts the same placement mode as the barricade (1 × 1 m footprint, same lattice, same refusals). Placed, it has 300 HP, costs 250 and counts toward my 6-building cap. Price, size, HP and the turret numbers come from `buildings.json`.
2. **Shooting (FR52).** During a wave, when an alive zombie is within 8 m of the turret's centre, the turret turns to the nearest one and shoots 5 times/s, 3 damage per shot, with visible placeholder projectiles; it does not shoot in the build phase. Each shot is a server projectile that hits the first zombie on its path.
3. **Every client sees it.** Online, every client draws each turret shot (projectile, muzzle flash) and turns the turret's head, from the `turret.fired` event; turret aim is never synced per tick. Hits, pushback and deaths come from the server's usual events.
4. **Kill pay (FR45).** When my turret kills a zombie I get 50 % of its kill reward, rounded down (`economy.buildingKillShare`, `payKill`); a teammate who damaged it gets the assist share as usual; a turret hit gives nobody assist credit.
5. **Zombies attack it.** Zombies blocked by or next to a turret attack it like any building (Story 3.5's generic building attacks; nothing turret-specific here). A destroyed turret's bullets in flight still fly and still pay its owner.
6. **Determinism and cost.** Seeded runs with turrets are deterministic (`snapshotWorld` covers the turret's cooldown and aim, and the projectile's building tag). Targeting uses the spatial grid; no allocation per tick (server) or per frame (views).
7. **Bandwidth.** Report the added bytes/s with 4 turrets firing (events + patches); idle turrets add 0 B/s.
8. **Tests.** Vitest covers the balance schema (turret block optional), range (fires at 7.9 m, not at 8.1 m), nearest target + tie, the rate (exactly every 4 ticks, 5/s average), wave-only, damage and lead (a walking zombie is hit), kill pay (50 % floor, assist for a teammate, no assist from turret hits, owner left), the net event round trip (kind 23, `zombie.killed` building id), determinism (two seeded runs equal), the client mirror aim and cosmetic shot, a room integration test (`RunRoom.turret.test.ts`: place, wave, shots, pay to the owner over the wire), the turret pass's cost and the bandwidth (`turretBandwidth.test.ts`), and the tick cost with turrets among 3.5's 24 buildings. No allocation per tick is checked by review (module-level scratch; the only allocation is each shot's event object).

## Tasks / Subtasks

- [x] **Task 1: Balance** (AC 1)
  - [x] `buildings.json` `auto_turret` (decision 1); `turretSchema` + optional `turret` on `buildingTypeSchema`; type `TurretStats`.
- [x] **Task 2: Shared turret rules** (AC 2, 4, 6) — new `packages/shared/src/buildings/turret.ts`
  - [x] `Building.fireCooldownS`, `aimX`, `aimY` (additive; `addBuildingAt` initialises them); `turretStats(balance, type)`.
  - [x] `updateTurrets(world, dtS)` (called from 3.5's `updateBuildings`): wave-only, cooldown rule, nearest target via `queryRadius`, lead, spawn projectile, `turret.fired`.
  - [x] Projectile pool `building` + `pushbackM`; `updateProjectiles` uses them; `applyZombieDamage`/`killZombie` carry an optional building id (`zombie.hit.sourceId` null, `zombie.killed.buildingId`).
  - [x] Economy: `zombie.killed` with `buildingId` → `payKill(…, buildingKillShare)`.
  - [x] SimEvent `turret.fired`; `zombie.killed.buildingId?`; snapshot covers pool fields (Building fields are spread already).
- [x] **Task 3: Net** (AC 3, 7)
  - [x] Kind 23 `TURRET_FIRED` `[23, buildingId, heading]`; `zombie.killed` index 6 = building id when present; round-trip tests.
- [x] **Task 4: Server** (AC 4)
  - [x] `RunController` kill counter skips turret kills. `RunRoom.turret.test.ts`.
- [x] **Task 5: Client** (AC 2, 3)
  - [x] `NetSimHost.drainEvents`: `turret.fired` → muzzle from the mirror building, aim, cosmetic shot (`CosmeticProjectiles.spawnShot`).
  - [x] `TurretView` (plate + head, smooth turn), `ProjectileView` cyan for building shots, `FxView` muzzle + `turret_fire` sound (throttled), GameScene kill counter skips turret kills.
- [x] **Task 6: Checks** (AC 7, 8)
  - [x] `typecheck && lint && test && build` on the branch merged with `claude/epic-2-continue`.
  - [x] Browser: solo + two pages (guest `?lag=150&jitter=20`), screenshots `/tmp/s36/`.

## Dev Notes

### Current state (read before changing)

- **Buildings (3.4, 3.4b):** `buildings/buildings.ts` — `Building { id, type, ownerId, gx, gy, rot, hp, maxHp, minX..maxY }` (min corner on the 0.5 m lattice), `world.buildings.list` sorted by id, `buildingStats`, `placementError`/`placeBuilding` (generic: a turret type is placed, capped, charged and collided with like a barricade). `addBuildingAt` builds the object (the client mirror uses it too). Collision: `buildings/collision.ts` (players and zombies; projectiles ignore buildings).
- **Shop (3.3):** `economy/shop.ts › shopBuildings(balance)` lists `buildings.types` with name and price; `ShopScreen` → `uiStore.request("startPlacement", id)`. A second type needs no shop change.
- **Repair (3.7):** `repairCost = ceil(price × repairShare)` → 125 for the turret; geometry-agnostic.
- **Combat (1.5, 2.7):** `combat/firing.ts › updateCombat` rebuilds `world.zombieGrid`, runs each player's weapon (cooldown rule from `cooldown.ts`), then `updateProjectiles` (swept segment vs circles via the grid, pierce, `applyZombieDamage`). `combat/scratch.ts › zombieCandidates` is the shared candidate buffer (synchronous use only).
- **Economy (3.2):** `economy/economy.ts › updateEconomy` reads the tick's pending events; `payKill(world, zombieId, creditId, share)` exists for this story; `economy.buildingKillShare: 0.5` exists. `zombie.hit.sourceId` records assist damagers.
- **Client shots (2.7):** `net/cosmeticProjectiles.ts` draws others' shots from the server's `weapon.fired` at the render tick (`NetSimHost.drainEvents`); `ProjectileView` draws the mirror pool. Solo draws the World's real pool.
- **Net events:** `net/netEvents.ts`, kinds up to 21 + 24 here; 3.5 uses 22 (`building.destroyed`). 23 is free → `TURRET_FIRED`.

### What must be preserved

- Player shots behave exactly as before (same damage, pushback, events, assist credit, reversed-hit counter).
- Building placement, collision, repair and 3.5's attacks are generic; nothing type-specific except the turret pass and the view.
- The zombie grid is rebuilt once per combat tick; the turret pass reads it, never rebuilds it.

### Rules

- No per-tick allocation: the turret pass uses module-level scratch (spawn buffer, candidates), the event object is the only allocation per shot (the EventBus pattern every system uses). No per-frame allocation in `TurretView` (pooled Graphics, redraw only on change; head rotation via `setRotation`).
- Every number in balance JSON (turret block); presentation constants (colours, head turn speed, sound throttle) in client code.
- Never trust the client: turrets are entirely server-side; the client only draws.

### Testing

- Shared: `buildings/turret.test.ts` (one mechanic per test, `systems: { waves: () => {} }`, the run forced into "wave" by `startWave`/direct phase), economy test for the share, `net/netEvents.test.ts` round trips, `core/determinism` style double run.
- Server: `rooms/RunRoom.turret.test.ts` with `bootTestServer()`.
- Client: `sim/NetSimHost.turret.test.ts` (aim + cosmetic shot from an event), `net/cosmeticProjectiles.test.ts` (`spawnShot`).

### Project Structure Notes

- New: `packages/shared/src/buildings/turret.ts` (+ test), `apps/client/src/render/TurretView.ts`, `apps/server/src/rooms/RunRoom.turret.test.ts`, `apps/client/src/sim/NetSimHost.turret.test.ts`.
- Matches the architecture's `shared/buildings` ("Grid placement, turret logic, damage") and balance id `auto_turret`.

### References

- `_bmad-output/planning-artifacts/epics.md` › Story 3.6, FR45, FR52, FR53.
- `game-architecture.md` › Source tree (Buildings: turret logic), naming (`auto_turret`), System order.
- `3-4-place-a-wood-barricade.md` › decisions, review H2, "Fit with Stories 3.5–3.7"; `3-7-repair-buildings.md` › "For 3.6".
- `epic-2-retro-2026-11-22.md` › EPIC 3 BRIEF; `HANDOFF.md` §3.

## Dev Agent Record

### Agent Model Used

Claude Opus 5.5 (claude-opus-5-5), BMAD gds-create-story + build, 2026-11-22.

### Debug Log References

- `npm run typecheck && npm run lint && npm test && npm run build` pass on `story-3-6` merged with `claude/epic-2-continue` at 7545c2a (Story 3.5 + 3.4/3.7 re-review fixes merged): 141 test files, 1023 tests (3 skipped) pass; build passes. One earlier full run at load average ~5 (other agents on this 2-core box) failed three timing-sensitive tests (3.5's and 3.6's tick-cost p99 cases, 2.7's netsim reversed-hit rate); each passes alone and the next full run was green.
- Brief line 15, tests proven to fail once by mutating the code: lead removed (`× 0`) → the lead test fails (0 hits of 6+ shots); wave check removed → the build-phase test fails; economy share forced to 1 → 3 kill-pay tests fail; turret hits with `sourceId: killerId` → the damage/assist test fails. (The first lead test, a 1.2 m/s Walker at 6 m, passed without the lead; it was made strict: 3 m/s at 7 m.)
- Tick cost (`tickCostFlowField.test.ts`, new 3.6 case: 4 of the 24 buildings Auto-turrets, 4 players + 150 Walkers, wave). Calm run (load ~2.5): baseline p99 0.24 ms; **added p99 0.86 ms** with 24 buildings (4 turrets firing) + field vs 0.48 ms with 24 barricades + field → turrets add ~0.4 ms p99, under the 2 ms budget (3.5's own case in the same run: added 0.54 ms). Under load ~5 (other agents on this 2-core box) all these p99 cases are noisy and 3.5's own case fails at times (it fails the same way without turrets); the turret pass alone: 24 turrets all firing at 150 Walkers in range **0.086 ms/tick** (`turretBandwidth.test.ts`).
- Bandwidth (`turretBandwidth.test.ts`, 4 turrets firing continuously, 4.9 kills/s, players idle so every byte is the turrets'): `turret.fired` **80 B/s** (20 shots/s × 4 B); all events incl. their hits, kills, the owners' `money.earned` and the per-tick message envelope **+698 B/s**; patches **+62 B/s** (only the owners' `wallet`/`earned` on kills, ~13 B per kill); turret aim and cooldown are never in the patch (0 B/s idle).
- Browser (Playwright, headless Chromium, 844 × 390 @2x, touch; server :5567 with `ALLOW_SOLO_START=1 DEV_STARTING_WALLET=1000 DEV_ZOMBIE_DAMAGE_SCALE=0.05`, Vite :8073 with a temporary config, deleted), screenshots `/tmp/s36/`, logs `solo-log.txt`, `online-log.txt`, scripts `/tmp/s36scripts/`:
  - solo (01–05): the Shop lists "Auto-turret $250" after the barricade; tapping it starts placement (hint "Auto-turret · $250", green); ✓ places a 1 × 1 m turret with 300/300 HP, wallet 1000 → 750; no shot in the build phase; in wave 1 it fired 29 shots (all drawn, cyan), 6 kills, each paid **+1** (Walker reward 2 × 50 %, floor) and nothing else (I did not shoot); the head turned through 13 aims.
  - two pages, guest with `?lag=150&jitter=20` (10–15): each player buys a turret from the Shop (both see both, 300 HP, wallets 750); in the wave each page drew all 40 `turret.fired` (muzzle at the building, cosmetic shot), 9 turret kills; host paid 4 × +1, guest 5 × +1 (each only for its own turret); guest netStats 0 snaps / 0 corrections; 0 page errors.

### Completion Notes List

- Shared: `buildings/turret.ts` (`updateTurrets`, `nearestZombieInRange`, `turretStats`, centre helpers), called from 3.5's `updateBuildings`; balance `turret` block (optional) on building types + `auto_turret`; `Building.fireCooldownS/aimX/aimY`; projectile pool `building`/`pushbackM`; `applyZombieDamage`/`killZombie` take an optional building id (`zombie.hit.sourceId` null, `zombie.killed.buildingId`); economy pays `buildingKillShare` for such kills; SimEvent + net kind 23 `turret.fired`; `zombie.killed` index 6.
- Server: `RunController` kill counter skips turret kills; no schema change.
- Client: `NetSimHost` resolves each `turret.fired` against the mirror building (muzzle, aim, cosmetic shot via `CosmeticProjectiles.spawnShot`); `TurretView` (plate + turning head over `BuildingView`'s base, so 3.5's health bar and cracks still show); `ProjectileView` cyan turret shots; `FxView` muzzle + throttled `turret_fire` click; HUD kill counter skips turret kills.
- **Epic 3 brief:**
  - L2: git status clean; typecheck + lint + test + build pass on the branch merged with the current `claude/epic-2-continue` (7545c2a).
  - L3 (all copies): new World state = `Building.fireCooldownS/aimX/aimY` and the projectile pool's `building/pushbackM`. World ✓ → schema: **none** (deliberately: aim derived client-side, cooldown server-only) → `syncState`/`stateView`/devThrottle field lists: unchanged (no field) → NetSimHost mirror: `addBuildingAt` initialises the fields; aim written from `turret.fired` → Predictor: not affected (turrets collide as buildings, already copied) → `snapshotWorld`: building copies spread (cooldown + aim included), projectiles add `building` + `pushbackM`.
  - L6: no float timers except the fire cooldown, which is the shared `cooldown.ts` rule (seconds by design; exact 4-tick period tested); no per-tick allocation in the turret pass (module scratch, shared `zombieCandidates`), only each shot's event object; `TurretView`/`ProjectileView` allocate nothing per frame (head Graphics pooled, plates redrawn on `version` change, colour changed only when a slot's kind changes).
  - L8: nothing new from the client: placement, price, cap and repair stay server-validated by 3.4/3.7's generic paths (refusals unchanged).
  - L11: turret aim derived client-side from `turret.fired` (4 B per shot), never synced per tick; HP only on change (unchanged); numbers above.
  - L12: every turret number in `buildings.json › types.auto_turret.turret` (own block, schema-validated); kill share is `economy.buildingKillShare`; client-only presentation constants (colours, turn rate, sound throttle) in client code; the 1 m grid-staleness margin is a structural constant with its reasoning.
  - L14: one mechanic per test (zombies' system replaced where it would interfere, `waves` off), fixed seeds, `bootTestServer()` in `RunRoom.turret.test.ts`.
  - L15: see Debug Log (4 mutations).
  - L20: see Notes for the merge.
- **Unverified:** feel on a real phone (headless Chromium ~14 fps); zombies attacking and destroying a turret in the browser (3.5's generic attacks; covered by its tests, a turret is a building there); 4 turrets at once in the browser (measured in the bandwidth test instead); hidden-tab during turret fire (no new phase or client state beyond the aim, which is set by each event).
- **Deviations:** turret firing runs in the `buildings` slot with a widened query on last tick's grid (coordinator's instruction) instead of after the grid rebuild in combat. Turret kills don't count as the owner's kills in the HUD/Results. Turret damage gives no assist credit (a decision; FR45 does not cover it).

### Notes for the merge (brief line 20)

- `buildings.json` + `balanceSchema.ts`: `auto_turret` type and `turretSchema` (optional `turret` on `buildingTypeSchema`); changes `balance.version`. Two tests updated for the second type (`buildings.test.ts`, `shop.test.ts`).
- `buildings/buildings.ts`: three fields on `Building` + their init in `addBuildingAt` (additive). `buildings/buildingSystem.ts`: `updateTurrets` after `updatePathing`.
- `combat/projectilePool.ts` (two arrays, optional spawn fields), `combat/firing.ts` (`updateProjectiles` picks weapon/pushback/building), `combat/damage.ts` + `zombies/zombiePool.ts` (optional `buildingId` param), `economy/economy.ts` (share), `core/simEvents.ts` (`turret.fired`, `zombie.killed.buildingId?`), `core/worldSnapshot.ts`, `net/netEvents.ts` (kind 23, index 6), `index.ts` (exports).
- Server: `RunController` kill counter line; tests `RunRoom.turret.test.ts`, `run/turretBandwidth.test.ts`, a third case in 3.5's `tickCostFlowField.test.ts`.
- Client: `NetSimHost` (`turretShot`), `cosmeticProjectiles.ts` (`spawnShot`), `GameScene` (TurretView + kill counter line), `ProjectileView`, `FxView` (`turret.fired` case), `placeholderSfx` (`turret_fire`), new `TurretView`.
- **For 3.8 (Runners):** turrets lead with the target's last-tick displacement; fast Runners are hit (the lead test uses 3 m/s). If Runners flank via their own field, nothing here changes.
- **For 3.10 (5-wave balance):** turret numbers are in `buildings.json`; a turret kill pays floor(reward × 0.5) (Walker/Crawler → 1), so turrets are a defense, not income; consider rewards when tuning. Bandwidth with 4 turrets ≈ +0.8 KB/s per client.
- **For 3.5 (merged):** nothing turret-specific in pathing or attacks; the turret's bullets in flight still pay its owner after `damageBuilding` destroys it (tested).

### File List

- New: `packages/shared/src/buildings/turret.ts`, `packages/shared/src/buildings/turret.test.ts`, `apps/client/src/render/TurretView.ts`, `apps/client/src/sim/NetSimHost.turret.test.ts`, `apps/server/src/rooms/RunRoom.turret.test.ts`, `apps/server/src/run/turretBandwidth.test.ts`.
- Changed (shared): `config/balance/buildings.json`, `config/balanceSchema.ts`, `buildings/{buildings,buildingSystem}.ts`, `buildings/buildings.test.ts`, `combat/{projectilePool,firing,damage}.ts`, `zombies/zombiePool.ts`, `economy/economy.ts`, `economy/shop.test.ts`, `core/{simEvents,worldSnapshot}.ts`, `net/netEvents.ts`, `net/netEvents.test.ts`, `index.ts`.
- Changed (server): `run/RunController.ts`, `run/tickCostFlowField.test.ts`.
- Changed (client): `sim/NetSimHost.ts`, `net/cosmeticProjectiles.ts`, `scenes/GameScene.ts`, `render/{ProjectileView,FxView}.ts`, `audio/placeholderSfx.ts`.
- `_bmad-output/implementation-artifacts/sprint-status.yaml`, this file.

## Senior Developer Review (AI)

Reviewer: fresh review agent, at 501457e (2026-11-22). Fixes by the story builder on branch `story-3-6b` (from `claude/epic-2-continue` 171149c, Story 3.8 Runners merged).

| # | Sev | Finding | Fix |
|---|-----|---------|-----|
| M1 | Med | A turret stole its owner's kill: an owner who pistol-hit a Walker and whose turret landed the last hit got 1 instead of 2 and no kill. | **Decision by the main session** (recorded at the top). `economy.ts`: a `zombie.killed` with a building id whose owner `isDamager` → `payKill(…, 1)` and the pending event loses its building id (an ordinary kill everywhere); otherwise the 50 % share. Tests: the probe (owner pistol hit + own turret's last hit → +2, event without building id), owner + teammate (owner 2, teammate assist 1), the 50 % case unchanged, `RunController.kills()` 0 for a turret-only kill in the room test. Proven to fail with the owner check removed (2 tests). |
| M2 | Med | With the cap's worst case (24 turrets firing) every client got +3.49 KB/s of events, mostly off-screen shots. | **Decision by the main session.** New `apps/server/src/net/eventInterest.ts` (`EventInterest`: encodes the tick once, marks `turret.fired` (turret centre / end of flight) and a turret's non-killing hit (zombie / turret centre) as local, fills one reused array per client); `RunRoom.forwardEvents` broadcasts as before when nothing is local, else sends each client its filtered list (Colyseus encodes `send` synchronously, so the arrays are reused; no array per client per tick). `zombie.hit` carries the turret's id server-side only (not on the wire). Worst case (`turretBandwidth.test.ts`, 24 turrets on a 6 × 4 grid, 120 shots/s, 28 kills/s, 4 players in the four quarters): events + patches per client **3.46 → 2.10–2.16 KB/s** (asserted ≤ 6 KB/s and below before); what is left is mostly the global kills and money. Tests: `eventInterest.test.ts` (local vs global, a shot ending in view, a killing hit global, the reused array), room test (a guest far away gets no `turret.fired`, only the killing hit and the kill). Proven to fail with the filter off (3 tests). |
| L1 | Low | After a hidden tab, 75 cosmetic turret shots spawned in one frame. | `EventQueue.drain` can return each event's tick; `NetSimHost.drainEvents` drops `turret.fired` and teammates' `weapon.fired` older than render tick − `STALE_COSMETIC_TICKS` (10, `net/netConfig.ts`): no projectile, no FX (a stale turret shot still turns the turret). Test with a backlog (tick 11 dropped, tick 28 played); proven to fail with the check off. |
| L2 | Low | The turret click played for every turret on the map. | `FxView` plays it only for my turrets (owner lookup passed by GameScene) or a turret shot inside the camera's `worldView`. |
| L3 | Low | Tie-break test vacuous (the grid visited slot 0 first). | Slot 0 now sits in a later grid cell (east); the test fails without the tie rule (proven). |
| L4 | Low | No test of the stale-grid margin. | Test: the zombie's last-tick cell [30, 32) lies wholly past the 8 m reach (29.5), it is moved to 7.9 m between ticks → shot in that tick; fails with the margin at 0 (proven). |
| L5 | Low | Muzzle only tested on an axis; no kill-counter assertion online. | Diagonal muzzle test; `RunController.kills()` asserted in `RunRoom.turret.test.ts`. |
| L6 | Low | `snapshotWorld` turret/projectile fields not asserted. | The determinism test asserts `fireCooldownS`/`aimX`/`aimY` on the building copies and a flying turret shot's `building` and `pushbackM` in the snapshot. |

**Re-verification (story-3-6b):** merged with `claude/epic-2-continue` d5d58d2 (Story 3.5 review fixes, its perf assert gated): typecheck, lint, test (145 files, 1065 passed, 3 skipped), build pass. (Before that merge, 3.5's tick-cost p99 case failed once at load ~6 on this shared 2-core box; its threshold was not touched here.) Browser (Playwright, headless Chromium; server :5567 with `ALLOW_SOLO_START=1 DEV_STARTING_WALLET=1000 DEV_ZOMBIE_DAMAGE_SCALE=0.05`, Vite :8073, temporary config deleted), screenshots and logs `/tmp/s36b/`, scripts `/tmp/s36scripts/credit.py`, `interest.py`:
- solo, owner kill credit (01–02): pistol aimed (mouse) at zombies in the turret's range; 3 kills where my turret landed the last hit on a zombie I had hit were paid **+2** each and counted (HUD kills 9 = 3 + 6 pistol kills), the 11 turret-only kills **+1** each and not counted.
- two pages, guest `?lag=150&jitter=20` (10–11): the host's turret at (8.5, 4.5) m, the guest in the far corner (47.6, 31.6): the host drew 40 `turret.fired`, the guest **0**; both got all 10 kills; 0 page errors.

## Change Log

- 2026-11-22: Story written (gds-create-story), status ready-for-dev.
- 2026-11-22: Built: shared turret rules, projectile building tag, kill share, net kind 23, client turret view and cosmetic shots; merged `claude/epic-2-continue` (Story 3.5; turret firing moved to the `buildings` slot); tests incl. room, bandwidth, tick cost; browser checks; status review.
- 2026-11-22: Review fixes on `story-3-6b` (M1 owner keeps the kill, M2 turret events by interest, L1–L6); status done.
