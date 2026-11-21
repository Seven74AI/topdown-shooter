---
baseline_commit: 41d4d221359af5a74d26869a5e467a163711eab0
---

# Story 1.7: Growing waves of Walkers

Status: review

## Story

As a player,
I want waves of Walkers that grow each time, with a short breather between them and no hunt for the last stragglers,
so that the fight builds up the way a run should.

## Acceptance Criteria

1. **Wave size (FR28).** When wave N starts, it spawns N × 40 Walkers (from `waves.json`) from spawn points at the map edges, with at most 150 alive at once and the rest queued.
2. **Last 5 (FR30, pillar 1).** When only 5 of the wave's zombies remain (alive plus queued), those 5 are marked on screen (a marker above each, edge arrows when off screen) and head straight for the nearest player from wherever they are, with no stat change.
3. **Wave end.** When the wave's last zombie dies, a "Wave N cleared" banner shows and the next wave starts after a 5 s pause (Story 3.1 replaces this pause with the build phase). The HUD shows the current wave number and zombies remaining.
4. **Tests.** Vitest with a fixed seed covers wave sizes, the 150-alive cap, queueing, the last-5 rule and wave end.

## Tasks / Subtasks

- [x] **Task 1: Wave balance** — extend `waves.json` + schema: keep `zombiesPerWave` (40), `maxAlive` (150), `lastRushCount` (5), `pauseBetweenWavesS` (5); add `firstWaveDelayS: 3` (banner before wave 1), `spawnIntervalS: 0.25`, `spawnPerInterval: 2` (spawn pressure: ~8 zombies/s until the cap; placeholder, see Dev Notes), `spawnMinPlayerDistanceM: 6`
- [x] **Task 2: Wave director (shared)** — `packages/shared/src/waves/waveDirector.ts`, registered as the `waves` system (see Dev Notes › State machine). `world.waves = { number, phase, queued, spawnedThisWave, remaining, timerTicks, rushing }`
- [x] **Task 3: Spawn points** — `map/placeholderMap.ts` gets `spawnPoints`: 12 points just inside the map edges (4 per long edge, 2 per short edge, 0.5 m in). The director picks one with `world.rng`, skipping points within `spawnMinPlayerDistanceM` of any alive player (if all are too close, use the farthest). Spawn at the point + a small seeded jitter (±1 m along the edge) so a batch doesn't stack. Story 4.3 moves spawn points into the Tiled map and adds `minStage`
- [x] **Task 4: Last-5 rush** (AC 2) — when `remaining ≤ lastRushCount` and `queued == 0`, set every alive wave zombie's `state` to `RUSH` (a new state value). Rush zombies move straight to the nearest player like chase, with the same speed: the difference is that they ignore anything that would hold them back in later stories (flow fields in 3.5, building attacks, keep-distance for Spitters, the car alarm). Emit `wave.rush_started { count }` once
- [x] **Task 5: Remove the temporary spawner** from Story 1.4 (`GameScene` no longer calls `spawnRing` at run start; keep the helper for cheats)
- [x] **Task 6: HUD** (AC 2, 3) — `HudScene` top-center: `Wave 3` and `Zombies 47` (remaining = alive + queued); centered banner `Wave 3` at wave start and `Wave 3 cleared` at wave end, 1.5 s each, fading. Rush markers: a small red chevron above each rushing zombie in the world (render layer above zombies) and a red edge arrow on the screen edge pointing at each off-screen rusher (reuse a shared `EdgeArrows` helper in `apps/client/src/render/` so Story 2.9's teammate arrows can use it)
- [x] **Task 7: Game over text** — `GameOver.tsx` now shows the real wave number from `world.waves.number`
- [x] **Task 8: Tests** (AC 4) — `waves/waveDirector.test.ts` (fixed seed, player made invulnerable by giving it huge HP in a test balance): wave 1 spawns exactly 40, wave 3 exactly 120; never more than 150 alive at any tick across a 400-zombie wave (use a test `zombiesPerWave: 400` and kill zombies slowly); queued count drains to 0; rush starts exactly when `remaining` hits 5 with `queued == 0` and not before; killing the last zombie emits `wave.ended { number }`, then after 100 ticks (5 s) `wave.started { number: N+1 }`; spawn points within 6 m of the player are skipped

## Dev Notes

### State machine

```
phase "intro"  (wave 0 → timerTicks = firstWaveDelayS * 20) ─┐
phase "pause"  (after a wave, timerTicks = pauseBetweenWavesS * 20)
   timer hits 0 → number += 1; queued = number * zombiesPerWave; spawnedThisWave = 0; phase = "active"; emit wave.started
phase "active":
   every spawnIntervalS: spawn min(spawnPerInterval, queued, maxAlive - aliveCount) zombies; queued -= spawned
   remaining = aliveCountOfThisWave + queued
   remaining ≤ lastRushCount and queued == 0 and not rushing → rushing = true; mark; emit wave.rush_started
   remaining == 0 → phase = "pause"; emit wave.ended { number }
```

- All timers count **ticks** (architecture › Networking: timers count ticks inside the World; no wall clock).
- `aliveCount` counts all alive zombies; in Epic 1 every zombie belongs to the wave. Later stories add zombies outside the wave count (stampede in 6.8, Behemoth Crawlers): track `waveZombie` per zombie in the pool (a `Uint8Array` flag) now, and compute `remaining` from wave zombies only.
- Wave 1 for 4 players is ≈ 40 zombies in ≈ 1 minute (GDD). With 8 spawns/s the queue drains in 5 s for wave 1, and the cap governs later waves. These spawn-rate numbers are placeholders; Story 3.10 and 6.1 tune them. Note them in Completion Notes.
- Player-count scaling (×0.6/0.8) is Story 3.10; Epic 1 is solo, so use ×1.0 and leave a clear hook (`waveSize(number, playerCount)` in one function).
- A dead player ends the run in Epic 1 (Story 1.4's Game over); the director stops spawning when no player is alive.

### Rush

- Pillar 1: no stat change. Rush must not change speed, damage or HP. It only removes "distractions".
- Marking uses the pool's `state` (`ZOMBIE_STATE.RUSH`); the client reads it to draw markers. In Epic 2 the horde stream's `typeState` byte carries it.

### Events added

`wave.started { number, size }`, `wave.ended { number }`, `wave.rush_started { count }`.

### Scope and prerequisites

- Builds on 1.4 (pool, AI, `spawnRing`, Game over) and 1.5 (killing). Read their records and code. Keep the director independent of rendering.
- Out of scope: build phase (3.1), other zombie types and introduction order (3.10, 6.1), Tiled spawn points (4.3), player-count scaling (3.10).

### Project Structure Notes

New: `packages/shared/src/waves/{waveDirector.ts, waveDirector.test.ts}`, `apps/client/src/render/{EdgeArrows.ts, RushMarkers.ts}`.
Modified: `waves.json`, `balanceSchema.ts`, `map/placeholderMap.ts`, `zombies/zombiePool.ts` (`waveZombie` flag, `RUSH` state), `zombies/zombieAi.ts`, `core/systems.ts`, `core/world.ts`, `core/simEvents.ts`, `index.ts`, `GameScene.ts`, `HudScene.ts`, `GameOver.tsx`.

### References

- [Source: epics.md#Story 1.7: Growing waves of Walkers]
- [Source: gdd.md#Core Gameplay Loop] (last 5 rule), [#Enemy Wave Design] (40 per wave, 150 alive), [#Run Structure]
- Tick timers: [Source: game-architecture.md#Networking]

## Dev Agent Record

### Agent Model Used

claude-opus-5-5 (Claude Opus 5.5), via gds-dev-story

### Debug Log References

- Adding the director made `contact damage › has no regeneration` fail: a wave arrived during its 60 s run. Tests of single mechanics (zombie AI, pool, firing, aim assist, movement) now pass `systems: { waves: noop }` (`NO_WAVES`), so the director stays out of their way.
- Browser check (Playwright, 844×390): "Get ready" shows during the 3 s intro, then the banner "Wave 1" and the HUD line "Wave 1 · Zombies 40". Walkers arrive from spawn points at the map edges. No console errors.
- The rush chevrons and edge arrows were not seen in the browser: a lone Pistol doesn't survive to the last 5 Walkers without god mode. The rush logic, marking and positions are unit-tested. The visual check is deferred to the Story 1.11 god-mode cheat.

### Completion Notes List

- Ultimate context engine analysis completed - comprehensive developer guide created
- **Implemented:**
  - **Shared:**
    - **Wave balance:** `waves.json` adds `firstWaveDelayS` 3, `spawnIntervalS` 0.25, `spawnPerInterval` 2, `spawnMinPlayerDistanceM` 6.
    - **Map:** `DistrictMap` (bounds plus spawn points) and 12 placeholder spawn points.
    - **Pool:** a `waveZombie` flag on each zombie, and the `ZOMBIE_STATE.RUSH` state.
    - **Director:** `waves/waveDirector.ts` is the `waves` system. Its phases are intro → active → pause, and all timers count ticks. It spawns batches capped at `maxAlive` with a seeded spawn-point pick that skips points within 6 m of a player, plus ±1 m edge jitter. It counts remaining as wave zombies alive plus queued. The rush starts when 5 remain and the queue is empty. It stops when no player is alive.
    - **Helpers and events:** `waveSize()` is the hook Story 3.10 uses for player-count scaling; `skipWave()` is for the 1.11 cheat. Events `wave.started`, `wave.ended`, `wave.rush_started`. Waves are added to `snapshotWorld`.
  - **Client:**
    - **Spawn:** the temporary spawner is removed; Walkers now come only from waves.
    - **HUD:** top-center "Wave N · Zombies R" (or "Get ready"), a centered banner that fades over 1.5 s, and red edge arrows for off-screen rushers. Arrow placement uses a pure `edgeArrow()` helper that Story 2.9 will reuse.
    - **Markers and Game over:** world-space red chevrons above rushing zombies. Game over shows the real wave number.
- **Note on rush behaviour:** a rushing zombie moves exactly like a chasing one today (straight at the nearest player, same stats: pillar 1). The RUSH state matters once flow fields (3.5), building attacks and Spitter keep-distance exist.
- **Placeholders to tune later:** the spawn rate (8 zombies/s until the cap) and the 3 s intro.
- **Tests:** 170 passing (+16): director 10, edge arrows 3, Story 1.6 review additions 3.
- **Verification:** typecheck 0 errors, lint 0 problems, `npm test` 170/170, build ok.

### File List

- `packages/shared/src/waves/waveDirector.ts` (new)
- `packages/shared/src/waves/waveDirector.test.ts` (new)
- `packages/shared/src/config/balance/waves.json` (modified)
- `packages/shared/src/config/balanceSchema.ts` (modified)
- `packages/shared/src/map/placeholderMap.ts` (modified: `DistrictMap`, spawn points)
- `packages/shared/src/zombies/zombiePool.ts` (modified: `waveZombie`)
- `packages/shared/src/zombies/zombieTypes.ts` (modified: `RUSH`)
- `packages/shared/src/core/world.ts` (modified: waves, `DistrictMap`)
- `packages/shared/src/core/systems.ts` (modified: waves system)
- `packages/shared/src/core/simEvents.ts` (modified)
- `packages/shared/src/core/worldSnapshot.ts` (modified)
- `packages/shared/src/index.ts` (modified)
- `packages/shared/src/zombies/zombieAi.test.ts`, `zombiePool.test.ts`, `combat/firing.test.ts`, `combat/aimAssist.test.ts`, `player/movement.test.ts` (modified: `NO_WAVES`)
- `apps/client/src/render/edgeArrow.ts` (new)
- `apps/client/src/render/edgeArrow.test.ts` (new)
- `apps/client/src/scenes/hudModel.ts` (modified)
- `apps/client/src/scenes/HudScene.ts` (modified: wave panel, banner, edge arrows)
- `apps/client/src/scenes/GameScene.ts` (modified: no temp spawner, rush chevrons, banners)
- `_bmad-output/implementation-artifacts/1-7-growing-waves-of-walkers.md` (modified)
- `_bmad-output/implementation-artifacts/sprint-status.yaml` (modified)

## Change Log

- 2026-11-21: Story 1.7 implemented: wave director (N × 40, 150 alive cap, queue, last-5 rush, 5 s pause), spawn points, wave HUD, banners, rush markers and edge arrows. 170 tests passing.
