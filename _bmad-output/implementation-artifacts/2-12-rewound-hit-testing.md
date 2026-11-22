# Story 2.12: Rewound hit testing

Status: ready-for-dev

<!-- Follow-up of Story 2.10 AC 3. Created with gds-create-story (non-interactive; the designer delegated every decision to this session, 2026-11-22). -->

## Story

As a player shooting while I run,
I want my shots to hit the zombies I aimed at on my screen,
so that a hit I saw is not taken back by the server, even against fast Runners.

## Why now

- Story 2.7 confirms hits on the server with a **shot advance** (half the RTT, capped at 150 ms). The architecture names the upgrade: test hits against **rewound zombie positions** (300 ms of history) if ≥ 1 in 20 apparent hits are reversed.
- `tools/netsim/hits.test.ts` measures, at 150 ms RTT ± 10 ms one-way: kiting a 20-Walker ring 1.4 %, kiting 150 Walkers **5.3 %**, kiting 20 Runners (4 m/s, Story 3.8) **28.9 %**; kiting at 300 ms RTT 7.9 %. So Runners break NFR5. Decision (2026-11-22, delegated): build the rewind now.

## Acceptance Criteria

1. **Rewound player shots.** Online, a player's gun shot is tested against the zombie positions the shooter saw: the server tick minus the shooter's view offset (see Dev Notes › The view offset), capped at **300 ms** (6 ticks). Every sweep of the projectile uses the same offset (the zombies it meets are as old as the ones the shooter's cosmetic bullet met). When the rewind applies, the 2.7 shot advance is not added.
2. **What is rewound.** Only zombie positions, from a preallocated ring of per-tick positions (the last 300 ms + margin). Buildings, players, map collision and turret shots are never rewound. Server aim assist (touch) and melee swings use the same rewound positions as the shot.
3. **Effects apply now.** Damage, pushback, kill, `zombie.hit` (with the present position) and the economy apply to the present zombie. A zombie that is dead now is not hit (the bullet flies on); a slot reused since the viewed tick is not hit (generation check); a zombie that did not exist at the viewed tick is not hit until the bullet's rewound time reaches it.
4. **Solo unchanged, cheat-bounded.** Offline (`LocalSimHost`) and any input without a view tick behave exactly as before (no history recorded, shot advance as in 2.7). A client cannot rewind further than 300 ms, nor into the future; the server clamps the offset.
5. **Measured.** `tools/netsim/hits.test.ts` adds kiting Runners and kiting Walkers at 150 and 300 ms RTT with the rewind on and asserts reversed < 5 % at 150 ms; a control with the rewind off keeps the old numbers. The added tick cost (4 players firing SMGs + 150 zombies) has p99 ≤ 1 ms. Deterministic (seeded; `snapshotWorld` covers the history), allocation-free per tick.

## Tasks / Subtasks

- [ ] **Task 1: View tick on the input (shared + client)** (AC 1, 4)
  - [ ] `PlayerInput.viewTick: number`: the fractional server tick the client drew the horde at when it sampled this input (`NetSimHost.renderTick`), `-1` = none. zod: `min(-1)`, finite, `max(2^31)`. `NEUTRAL_INPUT.viewTick = -1`.
  - [ ] Every `copyInput` copies it (RunController, NetSimHost; devThrottle uses `Object.assign`; the predictor copies movement only).
  - [ ] `NetSimHost.stepInputs` writes `buf.viewTick = renderTickNow` (rounded to 0.01 tick; `-1` while NaN). `LocalSimHost` keeps `-1`.
- [ ] **Task 2: Zombie history ring (shared)** (AC 2, 5)
  - [ ] `combat/rewind.ts`: `ZombieHistory` in `World.zombieHistory` — `x, y: Float32Array(ROWS × capacity)`, `generation: Uint8Array`, `alive: Uint8Array`, `tickOf: Int32Array(ROWS)` (−1 empty), `enabled: boolean` (false by default: solo records nothing).
  - [ ] `recordZombieHistory(world)` called at the end of `step()` (after every system, label = the new `world.tick`, i.e. the positions the tick's horde frame shows). `Float32Array.set` per row + one loop for alive/generation; no allocation.
  - [ ] Constants in `config/constants.ts`: `REWIND_MAX_TICKS = 6` (300 ms), `ZOMBIE_HISTORY_TICKS = 8` (max + 1 for interpolation + 1 margin).
  - [ ] `snapshotWorld.zombieHistory`: `enabled`, `tickOf`, and an fnv1a hash of the four buffers (like `snapshotPathing`).
- [ ] **Task 3: Rewound view (shared)** (AC 1–3)
  - [ ] `buildRewoundView(world, atTick)`: for each present alive zombie valid at ⌊atTick⌋ (and ⌊atTick⌋ + 1 for interpolation; the newest row and later = live positions), write its interpolated position into scratch `view.x / view.y`, its id into `view.ids`, rebuild a preallocated `view.grid`. Memoised on (world.tick, atTick). Returns false when the history doesn't cover `atTick` (then the caller uses live positions).
  - [ ] `assistAim`, `swingMelee` and the projectile sweep take an optional zombie view (`xs, ys, grid`); default the live one. Same code, other arrays.
- [ ] **Task 4: Firing with the rewind (shared)** (AC 1–4)
  - [ ] `PlayerState.rewindMaxTicks` (0 = off; offline 0). In `tryFire`: `rewindTicks = clamp(world.tick − input.viewTick, 0, p.rewindMaxTicks)` when `viewTick ≥ 0` and the cap > 0; otherwise 0.
  - [ ] Gun: touch assist on the rewound view; projectile gets `rewindTicks` (new pool field) and `advanceM = 0` when `rewindTicks > 0` (else the 2.7 advance).
  - [ ] `updateProjectiles`: a projectile with `rewindTicks > 0` sweeps against `buildRewoundView(world, world.tick − rewindTicks)`. Turret shots (`building > 0`) never get a rewind.
  - [ ] Melee: the swing tests the rewound view at `world.tick − rewindTicks`; damage/pushback on the present zombie.
  - [ ] `snapshotProjectiles` adds `rewindTicks`.
- [ ] **Task 5: Server switch** (AC 1, 4)
  - [ ] `limits.ts`: `REWIND_CAP_MS = 300`. `RunController` option `lagCompensation` (default true): sets `world.zombieHistory.enabled` and every player's `rewindMaxTicks = min(REWIND_MAX_TICKS, REWIND_CAP_MS / 50)`. Dev env `DEV_NO_REWIND=1` (RunRoom) turns it off for A/B checks.
- [ ] **Task 6: Tests** (AC 5): see Dev Notes › Testing.
- [ ] **Task 7: Harness and benchmark** (AC 5): `hitsSim.ts` gets `rewind?: boolean` (default true) and the client sends `viewTick`; new cases in `hits.test.ts`; `apps/server/src/run/tickCostRewind.test.ts`.

## Dev Notes

### Decisions (delegated, 2026-11-22)

| Question | Decision | Why |
| --- | --- | --- |
| Which time is a shot tested at? | The tick the shooter **drew**: `viewTick` sent with every input (the client's render tick = server estimate − adaptive delay). Offset `r = world.tick − viewTick` at the tick the server applies the input, clamped to `[0, 6]` ticks. | The server cannot know the client's adaptive delay (100–150 ms) or its clock estimate; inferring "RTT/2 + delay" misses the input's queue wait (0–2 ticks). Sending the drawn tick is exact and costs ~18 B per input. |
| Cheat resistance | Clamp to `[0, 300 ms]`; a future view tick → 0; NaN/∞ refused by zod. | A cheater can at most get the rewind an honest 300 ms-ping player gets (architecture cap). PvE: hitting where a zombie was 300 ms ago hurts nobody. |
| What is rewound? | Zombie positions only (ring of 8 ticks × 256 slots, recorded after each step). | Buildings don't move (placement is between ticks); players are the shooter (predicted = server position at that seq). |
| Projectiles over several ticks | Every sweep uses the shooter's constant offset: sweep k is tested at `tick + k − r` (= `viewTick + k`). The 2.7 advance is dropped when rewinding. | The client's cosmetic bullet meets zombies drawn `f` later at flight time `f`; a constant offset reproduces exactly that. Rewinding only the first sweep would still miss on long shots (rifle 25 m ≈ 8 ticks). |
| Melee | Rewound with the same offset. | A Runner closes 0.9 m in 225 ms; the swing should hit what the player swung at. |
| Effects | On the present zombie (damage, pushback from its present position, hit event with present position). Dead now → not hit, the bullet flies on. Reused slot → generation mismatch → not hit. Spawned after the viewed tick → not in the view. | The client never removes a zombie itself (2.7); the counter drops expectations on kills. |
| Turrets | Never rewound (server-side shots; `building > 0` → `rewindTicks = 0`). | They see the present. |
| Aim assist | Server assist on touch runs on the rewound view. | The client bends toward drawn zombies; bending toward present ones would aim elsewhere. |
| Solo | `enabled = false` and `rewindMaxTicks = 0`: nothing recorded, identical code path. | AC 4. |
| History beyond the ring (just enabled, a fresh run) | Fall back to live positions for that sweep. | Safe default. |

### The view offset

- The horde frame and events of a tick carry `world.tick` after the step. The history row recorded at the end of `step()` has the same label, so "positions at tick T" means the same thing on both sides.
- During the step that ends at tick W+1, combat runs with `world.tick = W`: live positions are row W plus this tick's pushback. A sweep at time `τ ≥ W` uses the live arrays; `τ < W` interpolates rows ⌊τ⌋ and ⌊τ⌋+1 (row W is replaced by live positions so a hit's pushback in this tick still counts).
- At 150 ms RTT the offset is ≈ 75 ms one-way + 0–100 ms queue wait + 100–150 ms delay ≈ 200–300 ms; at 300 ms RTT it exceeds the cap (clamped).

### What must not change

- 2.7: shot advance for inputs without a view tick; the dry weapon tick of skipped inputs (no projectile, no swing hits); `weaponsPaused` on starved ticks; weapon debt.
- The client's reversed-hit counter is unchanged (it measures; the server got better).
- Determinism (`determinism.test.ts`): the history is World state, its hash in `snapshotWorld`.
- No per-tick allocation: rows, view and grid are preallocated in `createWorld`.

### Testing

- `combat/rewind.test.ts` (one mechanic per test, `systems: { waves: () => {} }`, seeded):
  - a Walker that moved 2 m since tick T is hit by a shot with `viewTick = T` along its old position and missed with the rewind off;
  - the offset is clamped at 6 ticks; a future view tick gives 0; no view tick (−1) uses the 2.7 advance;
  - a dead-now zombie is not hit (the bullet flies on to the next one); a reused slot is not hit;
  - damage and pushback land on the present position;
  - turret shots are never rewound;
  - melee hits the rewound position;
  - touch aim assist bends toward the rewound position;
  - solo (`enabled = false`): `snapshotWorld` of a seeded run equals one without the feature (no history rows).
- `RunController`: `lagCompensation` on by default sets the caps; off leaves them 0.
- `input` schema: `viewTick` −1, fractional, NaN/∞ refused.
- Harness (`hits.test.ts`): kiting Runners and Walkers (20 and 150) at 150 and 300 ms RTT with the rewind on (assert < 5 % at 150 ms); the same with the rewind off as the control (reported).
- Benchmark `tickCostRewind.test.ts`: 4 players firing SMGs, 150 zombies, rewind on vs off; report mean/p99 and the added p99 (assert ≤ 1 ms, with headroom for a loaded CI).

### Project Structure Notes

- New: `packages/shared/src/combat/rewind.ts` + `rewind.test.ts`; `apps/server/src/run/tickCostRewind.test.ts`.
- Modified: `packages/shared/src/{net/input.ts, core/world.ts, core/worldSnapshot.ts, config/constants.ts, combat/firing.ts, combat/projectilePool.ts, combat/aimAssist.ts, combat/melee.ts, player/player.ts, index.ts}`, `apps/server/src/{run/RunController.ts, net/limits.ts, rooms/RunRoom.ts}`, `apps/client/src/sim/NetSimHost.ts`, `tools/netsim/{hitsSim.ts, hits.test.ts}`.
- Schema: **no new schema field** (the view tick rides on `input.send`; the history is server-only). So the EPIC 3 BRIEF line 3 chain (schema → syncState → stateView → NetSimHost mirror → Predictor → devThrottle lists) has nothing to carry except the input copy paths.

### Project Context Rules

- EPIC 3 BRIEF (Epic 2 retro) lines 2, 3, 6, 9, 11, 14, 15, 18, 20 apply; HANDOFF §3 lessons (tick timers, no allocation, Colyseus guard, one mechanic per test).
- Netcode limits live in `apps/server/src/net/limits.ts` / shared `config/constants.ts`, not balance JSON (they are not gameplay numbers).

### References

- [Source: game-architecture.md#Networking] (lag compensation upgrade path: 300 ms of zombie history), [#Decision Summary] (hit validation)
- [Source: 2-7-server-confirmed-hits.md] (shot advance, local fire clock, cosmetic projectiles, reversed-hit counter, weapon debt)
- [Source: 2-6-instant-feel-for-my-own-survivor.md] (adaptive render delay 100–150 ms), [2-5-horde-stream.md] (interpolation, tick labels)
- [Source: 2-10-4-phone-4g-test.md#AC 3] (the follow-up), [3-8-runners-flank.md] (Runners 4 m/s), [3-6-auto-turret.md] (server-side turret shots)
- [Source: epic-2-retro-2026-11-22.md#EPIC 3 BRIEF]

## Dev Agent Record

### Agent Model Used

### Debug Log References

### Completion Notes List

- Ultimate context engine analysis completed - comprehensive developer guide created.

### File List

## Change Log

- 2026-11-22: Story created (gds-create-story, non-interactive; decisions in Dev Notes).
