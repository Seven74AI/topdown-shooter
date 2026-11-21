---
baseline_commit: fd93084adb3548a39ab523d472a570a5de60a9ae
---

# Story 1.4: Walkers chase and hurt the player

Status: review

## Story

As a player,
I want Walkers to shamble toward me as a crowd and hurt me when they reach me,
so that I feel the pressure of the horde.

## Acceptance Criteria

1. **Pooled Walkers (FR20, FR27).** A spawned Walker is stored in a pre-allocated struct-of-arrays pool (no per-spawn allocation) with stats from `zombies.json`: 10 HP, 1.2 m/s, 10 damage per hit, reward 2.
2. **Chase and crowd.** Each Walker walks straight toward the nearest player; separation forces using a 2 m spatial hash grid keep them from stacking on one spot (a crowd of 50 spreads into a visible mass).
3. **Contact damage (FR9).** A Walker touching the player deals 10 damage once per second while in contact. The player has 100 HP, shown as a health bar in the HUD, with no regeneration.
4. **Game over.** At 0 HP a "Game over" screen shows the wave reached and a Restart button that starts a new run with a new seed.
5. **Tests.** Vitest with a fixed seed covers chase direction, separation, contact damage timing and pool reuse.

## Tasks / Subtasks

- [x] **Task 1: Zombie pool** (AC 1, 5) — `packages/shared/src/zombies/zombiePool.ts` (see Dev Notes › Pool)
  - [x] `createZombiePool(capacity)`, `spawn(world, type, x, y): number` (pool index, or `-1` if full), `kill(world, id, killerId, weapon)` emits `zombie.killed`, iteration helper over alive ids
  - [x] `world.zombies` holds the pool; capacity `ZOMBIE_POOL_CAPACITY = 256` in `config/constants.ts` (≥ `maxAlive` 150 plus slots held after death)
  - [x] Tests: spawn reads balance stats; kill frees the slot; a freed slot is reused only after `ZOMBIE_SLOT_HOLD_TICKS` (20 = 1 s, see Dev Notes › Generation and hold); the generation counter increments on reuse; full pool returns `-1`; no allocation (spawn/kill 10,000 times, array lengths unchanged)
- [x] **Task 2: Spatial grid** (AC 2) — `packages/shared/src/core/spatialGrid.ts`: uniform hash grid, 2 m cells over the map bounds, rebuilt each tick by counting sort into preallocated `Int32Array`s; `queryRadius(x, y, r, out: Int32Array): number` returns a count. Tests: finds every zombie within r (compare with brute force over 200 random zombies, fixed seed), never returns one outside `r + cellSize`, works at map edges
- [x] **Task 3: Walker AI and separation** (AC 2, 5) — `packages/shared/src/zombies/zombieAi.ts`, registered as the `zombies` system
  - [x] Each tick: copy `prev`; rebuild grid; for each alive zombie pick the nearest **alive** player; desired velocity = unit vector to that player × `speedMps`; add separation (see Dev Notes › Separation); move; clamp to map bounds
  - [x] Zombies stop advancing when touching the player (distance ≤ `rZombie + rPlayer`) but still get separation, so the crowd wraps around the player instead of overlapping them
  - [x] Tests: a single Walker moves straight toward the player at 1.2 m/s; with 2 players it targets the nearer; 50 Walkers spawned on one point spread out (after 3 s, no two closer than 0.5 × their combined radii; mean nearest-neighbour distance above a threshold); deterministic for a fixed seed
- [x] **Task 4: Contact damage** (AC 3, 5) — in `zombieAi.ts` (or `zombies/zombieAttack.ts`): per-zombie `attackCooldownS`; on contact with cooldown ≤ 0 → player `hp -= damage`, cooldown = `attackIntervalS` (1.0); cooldown counts down every tick (also when not in contact, so a zombie that touches the player again later can hit at once if ready). Emit `player.damaged { playerId, amount, sourceZombieId }`. At `hp ≤ 0` → `status = "dead"`, `hp = 0`, emit `player.died { playerId }`; dead players are not targeted. Tests: first hit on contact, next exactly 20 ticks later, two Walkers deal 2 hits per second, no regeneration over 60 s without contact
- [x] **Task 5: Temporary spawner** — until Story 1.7's wave director exists, `GameScene` (via a shared helper `spawnRing(world, type, count, cx, cy, radiusM)`) spawns 40 Walkers spread along the map edges at run start. Story 1.7 removes this call; keep the helper (Story 1.11's cheat uses it)
- [x] **Task 6: Zombie rendering** (AC 2) — `apps/client/src/render/ZombieView.ts` (see Dev Notes › Rendering 150 zombies)
- [x] **Task 7: HUD health bar** (AC 3) — in `HudScene` top-left inside the safe area: bar 200 × 16 CSS px (× dpr), green → red, numeric `HP 74 / 100` text ≥ 14 px
- [x] **Task 8: Game over and restart** (AC 4) — `apps/client/src/ui/GameOver.tsx` (Preact overlay, `pointer-events: auto` only while shown): "Game over", "Wave reached: N" (N = `world.waves?.number ?? 1`; the wave director arrives in 1.7), **Restart** button ≥ 44 × 44 px. Restart disposes the host, creates a new World with a new seed from `crypto.getRandomValues`, and restarts `GameScene`. Communicate between Phaser and Preact through a tiny typed store/emitter in `apps/client/src/ui/uiState.ts` (no globals on `window`)
- [x] **Task 9: Verify** — scripts pass; headless browser: Walkers converge on a still survivor and the HP bar drops ~10/s per touching Walker; Game over appears and Restart works

## Dev Notes

### Scope and prerequisites

- Builds on 1.2 (World, systems, events, balance) and 1.3 (`world.players`, `PlayerState`, movement, `HudScene`, camera). Read both story files' Dev Agent Records and the real code first.
- Out of scope: shooting (1.5), waves (1.7), flow fields (3.5, zombies walk straight now), other zombie types, map obstacles (4.2).

### Pool

```ts
// struct-of-arrays, one typed array per field, length = capacity
x, y, prevX, prevY: Float32Array    // meters
hp: Float32Array
attackCooldownS: Float32Array
type: Uint8Array                     // index into ZOMBIE_TYPES (["walker"] for now; order fixed, append only)
state: Uint8Array                    // 0 = free, 1 = chase (more states later: flank, windup, rush …)
generation: Uint8Array               // incremented each time the slot is reused (Story 2.5's generation bit)
freedAtTick: Int32Array              // tick the slot was freed, -1 when in use
aliveIds: Int32Array + aliveCount    // dense list for fast iteration; swap-remove on kill
freeIds: Int32Array + freeCount      // stack of slots ready for reuse
```

- `ZOMBIE_TYPES` as a `const` tuple in `zombies/zombieTypes.ts` maps type index ↔ balance id; stats come from `world.balance.zombies.types[id]` at spawn and per tick (no copies of stats in the pool except `hp`).
- Float32 positions are fine: the horde is simulated only on the server (Epic 2) and the client never predicts zombies.
- `aliveCount` is what the HUD and Story 1.11 show.

### Generation and hold

Architecture › Horde Stream: freed ids are held 1 s before reuse and carry a generation bit. Build it now so Story 2.5 doesn't rework the pool: `kill` sets `freedAtTick = world.tick`; `spawn` takes a slot from the free stack only if `world.tick - freedAtTick ≥ ZOMBIE_SLOT_HOLD_TICKS` (20), otherwise it uses a never-used slot. Simplest correct approach: keep a FIFO ring of freed slots (they free in tick order, so the head is always the oldest).

### Separation

- For zombie i: query neighbours within `crowd.separationRadiusM` (0.8 m); for each neighbour j at distance d < that radius: push away along (i − j)/d with weight `(radius − d) / radius`; sum; scale by `crowd.separationStrength` (3.0 m/s at full overlap); add to the desired velocity; cap the final speed at `speedMps × crowd.maxSpeedFactor` (1.5) so pushing never makes zombies fly.
- Coincident zombies (d < 1e-4): push along a deterministic direction from the ids (e.g. `(i - j) % 2 ? (1,0) : (0,1)`), not random, and never divide by zero.
- Add `"crowd": { "separationRadiusM": 0.8, "separationStrength": 3.0, "maxSpeedFactor": 1.5 }` to `zombies.json` + schema (Story 1.2 put per-type stats under `types` for this reason). These are tuning placeholders; record them.
- Grid: 48 × 32 m with 2 m cells = 24 × 16 cells. Rebuild per tick by counting sort (cell counts → prefix sums → fill), all in preallocated `Int32Array`s. No `Map`, no arrays of arrays.

### Rendering 150 zombies

- One generated texture per zombie type (`this.make.graphics(...).generateTexture("zombie_walker", …)` at scene start): a placeholder top-down person, dark green-grey body circle 0.35 m with two small shoulder blobs. Optional: borrow the humanoid drawing from `_bmad-output/planning-artifacts/briefs/brief-topdown-shooter-2026-11-21/style-lab-r3.html`.
- `ZombieView` keeps a pool of `Phaser.GameObjects.Image` keyed by zombie id (create up to capacity lazily, then reuse; `setVisible(false)` when free). Each frame: position = lerp(prev, cur, alpha), rotation from movement direction (client-side `Math.atan2` is fine; rendering isn't simulated).
- Never redraw a `Graphics` object per zombie per frame. This is what makes 150 zombies cheap (measured in 1.11).
- The texture name follows the asset naming rule `category_name_variant` (`zombie_walker_body`).

### Events added

`player.damaged { playerId, amount, sourceZombieId }`, `player.died { playerId }`. Add to the `SimEvent` union. Remove the `test.ping` variant from Story 1.2 if nothing uses it any more.

### Project Structure Notes

New: `packages/shared/src/zombies/{zombiePool.ts, zombiePool.test.ts, zombieTypes.ts, zombieAi.ts, zombieAi.test.ts}`, `packages/shared/src/core/{spatialGrid.ts, spatialGrid.test.ts}`, `apps/client/src/render/ZombieView.ts`, `apps/client/src/ui/{GameOver.tsx, uiState.ts}`.
Modified: `zombies.json`, `balanceSchema.ts`, `core/world.ts`, `core/systems.ts`, `core/simEvents.ts`, `config/constants.ts`, `index.ts`, `GameScene.ts`, `HudScene.ts`, `main.ts`.

### References

- [Source: epics.md#Story 1.4: Walkers chase and hurt the player]
- Walker stats, contact once per second, no regeneration: [Source: gdd.md#Enemy Design and AI]
- SoA pools, factories: [Source: game-architecture.md#Entity Patterns]; spatial grid 2 m: [#Decision Summary]; id hold + generation: [#Horde Stream]
- Budgets (no per-frame allocation, pools): [Source: game-architecture.md#Client Platform Budgets]

## Dev Agent Record

### Agent Model Used

claude-opus-5-5 (Claude Opus 5.5), via gds-dev-story

### Debug Log References

- `mixColor` first lived in `HudScene.ts`, and its test failed because importing the scene loads Phaser, which needs `window`. I moved it to `render/color.ts`.
- Browser check (Playwright, 844×390, touch): at 14 s the Walkers have closed in and wrap around the still survivor, and the HUD shows `HP 60 / 100`. Game over appears with "Wave reached: 1". Tapping Restart hides the overlay and starts a fresh run at `HP 100 / 100`. No console errors.

### Completion Notes List

- Ultimate context engine analysis completed - comprehensive developer guide created
- **Implemented:**
  - **Shared:**
    - **Pool:** a struct-of-arrays zombie pool. It has a dense alive list with O(1) swap-remove; freed slots go into a FIFO ring and are held for 20 ticks (1 s) before reuse; each reuse bumps the slot's generation counter; it never allocates.
    - **Spatial grid:** a 2 m grid rebuilt each tick by counting sort into preallocated `Int32Array`s. `queryRadius` returns exactly the ids within r.
    - **Walker AI:** a two-pass `updateZombies` system. It first computes every velocity (chase the nearest alive player, plus separation, capped at speed × 1.5), then applies them all, so the result doesn't depend on iteration order. It clamps zombies to the map, pushes them out of players so the crowd wraps around them, and handles contact damage with a per-zombie cooldown.
    - **Events:** `player.damaged` and `player.died`.
    - **Helpers:** `spawnRing`, the `crowd` section in `zombies.json`, and zombies added to `snapshotWorld`.
  - **Client:**
    - **Zombie view:** `ZombieView` uses one generated texture per type (`zombie_walker_body`) and pooled Images keyed by slot. It hides images of dead zombies and takes rotation from the movement direction.
    - **HUD:** a health bar plus a `HP x / y` label, redrawn only when HP changes.
    - **Screens:** a Preact `App` holding `GameOver` and `RotateOverlay`. `uiStore` is a typed Phaser↔Preact store with request handlers.
    - **Spawner and restart:** a temporary spawner places 40 Walkers along the map edges. Restart restarts `GameScene`, which gives a new seed.
- **Tests:** 111 passing (+23): pool 6, spatial grid 3, Walker AI 6, contact damage 4, uiStore 1, color 1, plus existing suites.
- **Verification:** typecheck 0 errors, lint 0 problems, `npm test` 111/111, build ok.
- **Placeholders to tune later:** crowd `separationRadiusM` 0.8, `separationStrength` 3.0, `maxSpeedFactor` 1.5.
- **Notes:**
  - The Game over screen shows wave 1 until Story 1.7 adds waves.
  - Once the player dies, zombies stand still (no target).
  - `test.ping` stays in `SimEvent` because the core tests use it.

### File List

- `packages/shared/src/config/constants.ts` (modified: pool capacity, slot hold, grid cell)
- `packages/shared/src/config/balance/zombies.json` (modified: `crowd`)
- `packages/shared/src/config/balanceSchema.ts` (modified: `crowdSchema`)
- `packages/shared/src/zombies/zombieTypes.ts` (new)
- `packages/shared/src/zombies/zombiePool.ts` (new)
- `packages/shared/src/zombies/zombiePool.test.ts` (new)
- `packages/shared/src/zombies/zombieAi.ts` (new)
- `packages/shared/src/zombies/zombieAi.test.ts` (new)
- `packages/shared/src/zombies/spawnRing.ts` (new)
- `packages/shared/src/core/spatialGrid.ts` (new)
- `packages/shared/src/core/spatialGrid.test.ts` (new)
- `packages/shared/src/core/simEvents.ts` (modified)
- `packages/shared/src/core/world.ts` (modified: zombies, zombieGrid)
- `packages/shared/src/core/systems.ts` (modified: zombies system)
- `packages/shared/src/core/worldSnapshot.ts` (modified)
- `packages/shared/src/index.ts` (modified)
- `apps/client/src/render/ZombieView.ts` (new)
- `apps/client/src/render/color.ts` (new)
- `apps/client/src/render/color.test.ts` (new)
- `apps/client/src/scenes/hudModel.ts` (new)
- `apps/client/src/scenes/HudScene.ts` (modified: health bar)
- `apps/client/src/scenes/GameScene.ts` (modified)
- `apps/client/src/ui/uiState.ts` (new)
- `apps/client/src/ui/uiState.test.ts` (new)
- `apps/client/src/ui/GameOver.tsx` (new)
- `apps/client/src/ui/App.tsx` (new)
- `apps/client/src/ui/overlay.css` (modified)
- `apps/client/src/main.ts` (modified: renders App)
- `_bmad-output/implementation-artifacts/1-4-walkers-chase-and-hurt-the-player.md` (modified)
- `_bmad-output/implementation-artifacts/sprint-status.yaml` (modified)

## Change Log

- 2026-11-21: Story 1.4 implemented: pooled Walkers, spatial grid, chase + separation AI, contact damage, health bar, Game over and Restart. 111 tests passing.
