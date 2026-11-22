# Story 3.6: Auto-turret

Status: ready-for-dev

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
> 5. **Where it runs: inside the combat system** (`updateCombat`, after the players' weapons and before the projectiles fly), right after the zombie grid is rebuilt, so the query sees this tick's positions and the shots fly in the same tick, like a player's. Not in the `buildings` slot: 3.5 owns that slot (flow field), and the grid there is a tick old.
> 6. **Projectiles are real server projectiles** in the shared projectile pool (they can miss, hit a zombie in the way, travel visibly), tagged with the building id (`pool.building`, 0 = a player's shot) and their own pushback (`pool.pushbackM`). A turret hit emits `zombie.hit` with `sourceId: null` (turret damage gives **no assist credit** and never confirms the owner's 2.7 apparent hits) and weapon = the building type id; a turret kill emits `zombie.killed { killerId: ownerId, buildingId }`.
> 7. **Kill pay (FR45):** the economy pays a `zombie.killed` that carries a `buildingId` with `payKill(world, zombieId, ownerId, economy.buildingKillShare)`: the owner gets floor(reward × 0.5) (Walker 2 → 1, Crawler 3 → 1); other players who damaged it get their usual assist. The owner's status does not matter (downed and out owners are paid, like the wave bonus); an owner who left the run is paid nothing (`earn` ignores unknown players), and the turret keeps shooting. A turret kill does **not** count as the owner's kill in the HUD/Results kill counters (those are "your kills").
> 8. **Net event `turret.fired` = kind 23** (`[23, buildingId, heading]`, ~4 B msgpack; 22 is 3.5's `building.destroyed`, 24 is 3.7's). The muzzle position is not sent: every client knows the building and computes it (centre + direction × `muzzleM`). `zombie.killed` appends the building id at index 6 only for turret kills (player kills stay 6 fields). No schema field is added: turrets cost 0 B/s when idle and HP stays "only on change" (3.4/3.5).
> 9. **Client.** `Building.aimX/aimY` (shared field): the server's World writes it on every shot (solo reads it directly); the online mirror writes it from each `turret.fired` at the render tick. A new `TurretView` draws a metal plate and a head with a barrel on every turret, turning smoothly toward the aim (frame-rate independent, no per-frame allocation). Online, a `turret.fired` spawns a cosmetic projectile (`CosmeticProjectiles.spawnShot`, like others' `weapon.fired`; never "mine", so it is not counted by the reversed-hit check); solo draws the World's real projectiles. Turret shots are drawn cyan (`ProjectileView`), with a small muzzle flash and a soft click (throttled to one per 80 ms).

## Acceptance Criteria

1. **Buy and place (FR52).** In a build phase the shop lists "Auto-turret $250"; tapping it starts the same placement mode as the barricade (1 × 1 m footprint, same lattice, same refusals). Placed, it has 300 HP, costs 250 and counts toward my 6-building cap. Price, size, HP and the turret numbers come from `buildings.json`.
2. **Shooting (FR52).** During a wave, when an alive zombie is within 8 m of the turret's centre, the turret turns to the nearest one and shoots 5 times/s, 3 damage per shot, with visible placeholder projectiles; it does not shoot in the build phase. Each shot is a server projectile that hits the first zombie on its path.
3. **Every client sees it.** Online, every client draws each turret shot (projectile, muzzle flash) and turns the turret's head, from the `turret.fired` event; turret aim is never synced per tick. Hits, pushback and deaths come from the server's usual events.
4. **Kill pay (FR45).** When my turret kills a zombie I get 50 % of its kill reward, rounded down (`economy.buildingKillShare`, `payKill`); a teammate who damaged it gets the assist share as usual; a turret hit gives nobody assist credit.
5. **Zombies attack it.** Zombies blocked by or next to a turret attack it like any building (Story 3.5's generic building attacks; nothing turret-specific here). A destroyed turret's bullets in flight still fly and still pay its owner.
6. **Determinism and cost.** Seeded runs with turrets are deterministic (`snapshotWorld` covers the turret's cooldown and aim, and the projectile's building tag). Targeting uses the spatial grid; no allocation per tick (server) or per frame (views).
7. **Bandwidth.** Report the added bytes/s with 4 turrets firing (events + patches); idle turrets add 0 B/s.
8. **Tests.** Vitest covers the balance schema (turret block optional), range (fires at 7.9 m, not at 8.1 m), nearest target + tie, the rate (exactly every 4 ticks, 5/s average), wave-only, damage and lead (a walking zombie is hit), kill pay (50 % floor, assist for a teammate, no assist from turret hits, owner left), the net event round trip (kind 23, `zombie.killed` building id), determinism (two seeded runs equal), the client mirror aim and cosmetic shot, a room integration test (`RunRoom.turret.test.ts`: place, wave, shots, pay to the owner over the wire), and a no-allocation check of the turret pass.

## Tasks / Subtasks

- [ ] **Task 1: Balance** (AC 1)
  - [ ] `buildings.json` `auto_turret` (decision 1); `turretSchema` + optional `turret` on `buildingTypeSchema`; type `TurretStats`.
- [ ] **Task 2: Shared turret rules** (AC 2, 4, 6) — new `packages/shared/src/buildings/turret.ts`
  - [ ] `Building.fireCooldownS`, `aimX`, `aimY` (additive; `addBuildingAt` initialises them); `turretStats(balance, type)`.
  - [ ] `updateTurrets(world, dtS)`: wave-only, cooldown rule, nearest target via `queryRadius`, lead, spawn projectile, `turret.fired`.
  - [ ] Projectile pool `building` + `pushbackM`; `updateProjectiles` uses them; `applyZombieDamage`/`killZombie` carry an optional building id (`zombie.hit.sourceId` null, `zombie.killed.buildingId`).
  - [ ] Economy: `zombie.killed` with `buildingId` → `payKill(…, buildingKillShare)`.
  - [ ] SimEvent `turret.fired`; `zombie.killed.buildingId?`; snapshot covers pool fields (Building fields are spread already).
- [ ] **Task 3: Net** (AC 3, 7)
  - [ ] Kind 23 `TURRET_FIRED` `[23, buildingId, heading]`; `zombie.killed` index 6 = building id when present; round-trip tests.
- [ ] **Task 4: Server** (AC 4)
  - [ ] `RunController` kill counter skips turret kills. `RunRoom.turret.test.ts`.
- [ ] **Task 5: Client** (AC 2, 3)
  - [ ] `NetSimHost.drainEvents`: `turret.fired` → muzzle from the mirror building, aim, cosmetic shot (`CosmeticProjectiles.spawnShot`).
  - [ ] `TurretView` (plate + head, smooth turn), `ProjectileView` cyan for building shots, `FxView` muzzle + `turret_fire` sound (throttled), GameScene kill counter skips turret kills.
- [ ] **Task 6: Checks** (AC 7, 8)
  - [ ] `typecheck && lint && test && build` on the branch merged with `claude/epic-2-continue`.
  - [ ] Browser: solo + two pages (guest `?lag=150&jitter=20`), screenshots `/tmp/s36/`.

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

### Debug Log References

### Completion Notes List

### File List

## Change Log

- 2026-11-22: Story written (gds-create-story), status ready-for-dev.
