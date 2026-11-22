# Story 2.12: Rewound hit testing

Status: done

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

- [x] **Task 1: View tick on the input (shared + client)** (AC 1, 4)
  - [x] `PlayerInput.viewTick: number`: the fractional server tick the client drew the horde at when it sampled this input (`NetSimHost.renderTick`), `-1` = none. zod: `min(-1)`, finite, `max(2^31)`. `NEUTRAL_INPUT.viewTick = -1`.
  - [x] Every `copyInput` copies it (RunController, NetSimHost; devThrottle uses `Object.assign`; the predictor copies movement only).
  - [x] `NetSimHost.stepInputs` writes `buf.viewTick = renderTickNow` (rounded to 0.01 tick; `-1` while NaN). `LocalSimHost` keeps `-1`.
- [x] **Task 2: Zombie history ring (shared)** (AC 2, 5)
  - [x] `combat/rewind.ts`: `ZombieHistory` in `World.zombieHistory` — `x, y: Float32Array(ROWS × capacity)`, `generation: Uint8Array`, `alive: Uint8Array`, `tickOf: Int32Array(ROWS)` (−1 empty), `enabled: boolean` (false by default: solo records nothing).
  - [x] `recordZombieHistory(world)` called at the end of `step()` (after every system, label = the new `world.tick`, i.e. the positions the tick's horde frame shows). `Float32Array.set` per row + one loop for alive/generation; no allocation.
  - [x] Constants in `config/constants.ts`: `REWIND_MAX_TICKS = 6` (300 ms), `ZOMBIE_HISTORY_TICKS = 8` (max + 1 for interpolation + 1 margin).
  - [x] `snapshotWorld.zombieHistory`: `enabled`, `tickOf`, and an fnv1a hash of the four buffers (like `snapshotPathing`).
- [x] **Task 3: Rewound view (shared)** (AC 1–3)
  - [x] `buildRewoundView(world, atTick)`: for each present alive zombie valid at ⌊atTick⌋ (and ⌊atTick⌋ + 1 for interpolation; the newest row and later = live positions), write its interpolated position into scratch `view.x / view.y`, its id into `view.ids`, rebuild a preallocated `view.grid`. Memoised on (world.tick, atTick). Returns false when the history doesn't cover `atTick` (then the caller uses live positions).
  - [x] `assistAim`, `swingMelee` and the projectile sweep take an optional zombie view (`xs, ys, grid`); default the live one. Same code, other arrays.
- [x] **Task 4: Firing with the rewind (shared)** (AC 1–4)
  - [x] `PlayerState.rewindMaxTicks` (0 = off; offline 0). In `tryFire`: `rewindTicks = clamp(world.tick − input.viewTick, 0, p.rewindMaxTicks)` when `viewTick ≥ 0` and the cap > 0; otherwise 0.
  - [x] Gun: touch assist on the rewound view; projectile gets `rewindTicks` (new pool field) and `advanceM = 0` when `rewindTicks > 0` (else the 2.7 advance).
  - [x] `updateProjectiles`: a projectile with `rewindTicks > 0` sweeps against `buildRewoundView(world, world.tick − rewindTicks)`. Turret shots (`building > 0`) never get a rewind.
  - [x] Melee: the swing tests the rewound view at `world.tick − rewindTicks`; damage/pushback on the present zombie.
  - [x] `snapshotProjectiles` adds `rewindTicks`.
- [x] **Task 5: Server switch** (AC 1, 4)
  - [x] `limits.ts`: `REWIND_CAP_MS = 300`. `RunController` option `lagCompensation` (default true): sets `world.zombieHistory.enabled` and every player's `rewindMaxTicks = min(REWIND_MAX_TICKS, REWIND_CAP_MS / 50)`. Dev env `DEV_NO_REWIND=1` (RunRoom) turns it off for A/B checks.
- [x] **Task 6: Tests** (AC 5): see Dev Notes › Testing.
- [x] **Task 7: Harness and benchmark** (AC 5): `hitsSim.ts` gets `rewind?: boolean` (default true) and the client sends `viewTick`; new cases in `hits.test.ts`; `apps/server/src/run/tickCostRewind.test.ts`.

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

Claude Opus 5.5 (claude-opus-5-5), story writer and builder in worktree `story-2-12`.

### Debug Log References

- `npx vitest run tools/netsim/hits.test.ts --silent=false` (`[netsim hits] … ALL` lines); `PERF_ASSERT=1 npx vitest run apps/server/src/run/tickCostRewind.test.ts --silent=false` (`[tick cost 2.12]`).

### Completion Notes List

- Ultimate context engine analysis completed - comprehensive developer guide created.
- **View tick (AC 1, 4).** `PlayerInput.viewTick` (−1 = none; zod `min(-1).max(2^31)`, finite). `NetSimHost.stepInputs` sends `viewTickOf(renderTick)` (`apps/client/src/net/viewTick.ts`, 0.01-tick rounding). Copied in RunController's and NetSimHost's `copyInput`; devThrottle copies with `Object.assign`; the predictor copies movement only. Solo (`LocalSimHost`) keeps −1.
- **History + rewound view (AC 2, 3)** `packages/shared/src/combat/rewind.ts`: `World.zombieHistory` (8 rows × 256 slots: x, y, generation, alive, row tick labels), recorded at the end of `step()` only when enabled (row T = what tick T's horde frame shows); `rewoundView(world, at)` lerps rows ⌊at⌋/⌊at⌋+1 (from the present on, live positions incl. this tick's pushback) for zombies alive now with the same generation, into a preallocated per-World scratch view + spatial grid (memoised per tick/time). `assistAim`, `swingMelee` and the projectile sweep take an optional view (same code, other arrays). Effects (damage, pushback from the present position, `zombie.hit` with the present position, kill, economy) go to the present zombie.
- **Firing (AC 1, 2, 4).** `rewindTicksFor` = `world.tick − viewTick` clamped to `[0, p.rewindMaxTicks]` (0 offline, without a view tick, for a future view tick, or when the history doesn't reach back). Melee and touch assist use the view at `tick − r`; the projectile stores `rewindTicks` (pool field, in `snapshotWorld`) and every sweep is tested at `tick − r + 0.5` (middle of the tick of flight). Turret shots: `rewindTicks` 0 always (spawn default; tested, incl. after merging 3.6's review fixes).
- **Decision changes while building (recorded):** (1) **Past the cap**, the part of the view offset beyond 300 ms is made up by the 2.7 shot advance (`min(p.shotAdvanceS, excess)`; ≤ 150 ms, server-measured RTT): 300 ms RTT kiting Runners 23 % → 17 %, Walkers 1.7 % → 0 %. (2) **Sweep at mid-tick (+0.5)**: Hunting Rifle (no spread) vs kiting Runners, 20 seeds: 3.8 % at +0, 1.2–2.2 % at +0.33…0.67. (3) **Seq spread** (`combat/spread.ts`, `seqSpreadRoll(playerId, seq)`): with the timing fixed, the Pistol's independent ±1° spread rolls alone still reversed ~3.6 % on kiting Runners (5.4 % total, spread 0: 1.8 %). Online (lag compensation on) the server's spread is now the seq's roll, and the shooter's client (NetSimHost, harness) draws the same one; offline the World rng rolls as before. Trade-off: a modified client could pre-compensate spread (PvE only; noted for the designer). One shot per seq holds for every gun (≤ 20/s); a future multi-pellet weapon adds the pellet index.
- **Server switch (Task 5).** `REWIND_CAP_MS = 300` (`limits.ts`) → `REWIND_CAP_TICKS = 6`; `RunController` option `lagCompensation` (default true) enables the history and sets each player's `rewindMaxTicks`; `DEV_NO_REWIND=1` (dev only, logs `dev_no_rewind`) turns it off.
- **Netsim (`tools/netsim/hits.test.ts`, 150 ms RTT ± 10 ms one-way, kiting, 5 seeds each; before = rewind off control, after = on):** 20 Runners Pistol **25.9 % → 3.0 %**, Hunting Rifle 29.9 % → 2.0 %, SMG 20.3 % → 2.2 %; 20 Walkers Pistol 1.2 % → 1.2 %; 150 Walkers 3.7 % → 0.3 %. 300 ms RTT ± 20 ms: Runners 45.0 % → 17.1 %, Walkers 8.5 % → 0.0 % (view offset p50 8.4 ticks > the 6-tick cap). View offset at 150 ms: p5/p50/p95 4.4/4.9/5.4 ticks (inside the cap). Asserted: < 5 % at 150 ms (Runners ×3 weapons, Walkers 20/150), the control > 10 % for Runners, 300 ms on ≤ off and < 25 %. The 2.7 cases now run with the rewind (standing SMG 1.4 % → 0.0 %, single-seed kiting Runners 28.9 % → 2.7 %).
- **Benchmark** `apps/server/src/run/tickCostRewind.test.ts` (4 players SMG, touch aim, 150 Walkers, 600 ticks, rewind on vs off controllers ticked alternately): added work per tick (history row + 5.4 rewound views on average) **mean 0.026 ms, p99 0.08–0.14 ms, max ≤ 0.65 ms** (one 7.7 ms outlier in one run under load avg 6: GC). Whole-tick p99 difference is noise-dominated (−2.0 … +1.7 ms across runs, both sides 2–9 ms p99 from GC/flow-field spikes); added mean −0.06 … +0.09 ms. Timing assert gated by `PERF_ASSERT=1` (as tickCostFlowField after the 3.5 review); `PERF_ASSERT=1` run passed (work p99 0.109 ms).
- **Bandwidth (brief line 11):** download unchanged (no schema field, no event, nothing per tick). Upload: msgpack input 101 → 119 B (+18 B with a fractional view tick) = **+360 B/s per client** at 20 inputs/s.
- **Browser check** (Playwright + Chromium headless, server :6067 with `DEV_WAVE_MIX=walker,runner DEV_ZOMBIE_DAMAGE_SCALE=0.1`, Vite :8573 via a temporary config (deleted), `?lag=150&jitter=20&debug=1&zdmg=0.1`, solo-start online room, scripted kiting + touch aim at the nearest drawn zombie, waves 1–2 with up to 37 Runners; RTT 171–258 ms): overlay hits line **rewind on: 132 apparent, 24 reversed (18 %)**; **`DEV_NO_REWIND=1`: 127 apparent, 36 reversed (28 %)**. No page errors. Screenshots: `/tmp/s212/rewind-on-{0,1,2,end}.png`, `/tmp/s212/rewind-off-{0,1,2,end}.png`. As in 2.10, headless numbers are not an NFR5 reading: FPS min 3.6 (worst second 32) and the client dropped ~110 steps (sentSeq 2427 vs render tick 2537: the stall case); the netsim is the judge (brief line 18).
- **EPIC 3 BRIEF:** line 2 — merged `claude/epic-2-continue` (c1bdd10: 3.5/3.6 review fixes), typecheck, lint, test (1089 passed, 3 skipped), build pass, git status clean at commit. Line 3 — no new schema field/phase/entity; the new input field goes through RunController `copyInput`, NetSimHost `copyInput` + send, devThrottle (`Object.assign`), harness; World state (`zombieHistory`, projectile `rewindTicks`, player `rewindMaxTicks`) is in `snapshotWorld` (history as switch + row labels + hash; the player field via the spread); Predictor not affected (movement only); devThrottle field lists not affected (no schema). Line 6 — rewind counts ticks; history/view/grid preallocated in `createWorld`, `Float32Array.set` per row, no per-tick allocation. Line 9 — no new C2S message (rides on the guarded, rate-limited `input.send`; zod refuses NaN/∞/out-of-range). Line 11 — above. Line 14 — `rewind.test.ts` one mechanic per test, seeded, `systems: { waves, zombies: noop }`; RunController tests via the controller. Line 15 — mutations proven (each made a test fail): sweep not rewound (5 tests), no generation check, melee live, assist live, no excess advance, solo records, no clamp, turret rewound, dead zombies in the view. Line 18 — above. Line 20 — Notes for the merge below.
- **Notes for the merge:** `core/world.ts` (two World fields + `recordZombieHistory` in `step()`; conflicted with 3.5 L5's `createPathingState` args — kept both), `net/input.ts` (new required field: any literal `PlayerInput` needs `viewTick: -1`, `NEUTRAL_INPUT` has it), `combat/firing.ts` (`tryFire` rewind/advance/spread, `updateProjectiles` view), `RunController.ts` (option + copyInput), `RunRoom.ts` (`DEV_NO_REWIND`), `NetSimHost.ts` (viewTick, seq spread; `spreadRng` removed), `hitsSim.ts` (`rewind`, `balance`, `viewOffsets` options). No balance JSON touched.
- **Not verified:** real phones / 4G (Story 2.10 Task 10 should re-measure), 60 fps browser feel, the seq-spread cheat risk in practice, more than one shooter at once in the browser (the benchmark has 4).

### File List

- New: `packages/shared/src/combat/rewind.ts`, `packages/shared/src/combat/rewind.test.ts`, `packages/shared/src/combat/spread.ts`, `packages/shared/src/combat/spread.test.ts`, `packages/shared/src/net/input.test.ts`, `apps/client/src/net/viewTick.ts`, `apps/client/src/net/viewTick.test.ts`, `apps/server/src/run/tickCostRewind.test.ts`
- Modified: `packages/shared/src/{net/input.ts, core/world.ts, core/worldSnapshot.ts, config/constants.ts, combat/firing.ts, combat/projectilePool.ts, combat/aimAssist.ts, combat/melee.ts, player/player.ts, index.ts}`, `apps/server/src/{run/RunController.ts, run/RunController.test.ts, net/limits.ts, rooms/RunRoom.ts}`, `apps/client/src/sim/{NetSimHost.ts, NetSimHost.test.ts, LocalSimHost.test.ts}`, `tools/netsim/{hitsSim.ts, hits.test.ts}`, `_bmad-output/implementation-artifacts/sprint-status.yaml`

## Senior Developer Review (AI)

- **Date:** 2026-11-22 · **Reviewer:** independent review agent (fresh context), at d382508 · **Outcome:** the rewind works and is safe, solo is bit-identical; 3 medium, 3 low findings. All fixed on `story-2-12b` (from `claude/epic-2-continue` 58150af, with Story 3.10 and the 3.5 crowd fix).
- [x] **[Med] M1 Predictable spread** (`seqSpreadRoll`): a modified client can pre-rotate its aim by −roll × half and remove the spread (SMG up to ~1.7× long-range DPS; Pistol/Rifle ~nothing). **Decided by the main session:** (a) accept it for co-op PvE; (b) cheap telemetry; (c) seqs can't be picked. **Fix:**
  - `apps/server/src/net/spreadCancel.ts` (`SpreadCancelWatch`, one per player in `RunController`, fed each newly applied input online). For consecutive firing inputs with a spread gun it compares the aim change with a steady-aim cheat's `−(roll(seq) − roll(prev)) × half`. Over windows of 40 samples it uses two signals: the share of exact matches (ε 0.05°), and a least-squares fit `delta ≈ c + k × expected` with its t-statistic, so a cheat that also tracks a target is caught too. It flags when the match share is ≥ 0.5, or when k is in [0.7, 1.3] with t ≥ 6. `RunController` option `onSpreadCancelSuspect`; `RunRoom` logs `spread_cancel_suspect` (info, with `matchRatio`, `k`, `t`, `samples`) at most once per wave per player, and never kicks.
  - Seq jumps: `queueInput` refuses an input more than `MAX_INPUT_SEQ_JUMP` = 20 seqs past the last one queued (`drops().jumped`). After `INPUT_SEQ_RESYNC_AFTER` = 20 refusals in a row (1 s) it resyncs, so a client that really restarted further on isn't locked out, and a picker gets at most one jump a second.
  - Tests:
    - `spreadCancel.test.ts`: honest steady, ±3° jittery and tracking aims, SMG and Pistol, 3 seeds × 20 000 inputs, never flag; a steady-aim pre-rotating cheat is flagged by the match share; a tracking cheat (≈ 0.6°/tick) is flagged by the fit for the SMG and the Pistol; once per wave; inputs without fire, without spread, or with a seq gap are ignored.
    - `RunController.test.ts`: jump refused / within the window accepted / resync; a cheat through the controller reports once, an honest jittery aim never.
    - Mutations proven: removing the jump check fails the jump test; dropping the callback fails the controller test.
- [x] **[Med] M2 Client half of the matching spread untested.** **Fix:** one shared helper `rotateBySeqSpread(dirX, dirY, playerId, seq, spreadDeg, out)` (`combat/spread.ts`), used by the server's online shot, `NetSimHost.localAttack` and the netsim harness (no own copy any more). New NetSimHost test: every local SMG `weapon.fired` direction equals `rotate((1, 0), seqSpreadRoll("p1", sentSeq) × half)`, computed independently of the helper. Mutation proven: NetSimHost on `seq + 1` fails it.
- [x] **[Med] M3 Control numbers moved after the 3.5 merge.** **Fix:** the control assert is now `pct(off) − pct(on) > 5` pp, for each weapon. Current numbers below. The sweep offset was re-measured (Hunting Rifle and Pistol, kiting Runners at 150 ms, 20 seeds):

  | Sweep offset | +0 | +0.33 | +0.5 | +0.67 | +1 |
  | --- | --- | --- | --- | --- | --- |
  | Hunting Rifle | 2.2 % | 1.1 % | 0.9 % | 0.7 % | 3.4 % |
  | Pistol | 0.9 % | 0.9 % | 0.7 % | 0.5 % | 1.7 % |

  +0.5 is kept (the middle of the flat optimum; the comment in `firing.ts` has the current evidence).
- [x] **[Low] L2 Two shooters / interpolation / live upper row unpinned.** **Fix:** `rewind.test.ts` has two new tests:
  - two shooters at view ticks 2 and 4.5 in the same tick each hit the zombie they saw;
  - `rewoundView` directly: rows 3 and 5 in the same tick (memo keyed by time), 3.25 is lerped, 7.5 reads row 7 and the **live** position (this tick's pushback, not row 8) and is re-read after a second pushback (never memoised), and the present gives `null`.
  - Mutations proven: memo without `at` (2 tests fail), `f = 0` (1), `upperLive` off by one (1).
- [x] **[Low] L3 (optional) memo slots / rounding: measured, not changed.** Rebuilding the view per rewound projectile costs, with 4 SMG shooters + 150 zombies (5.4 views per tick on average), mean 0.021 ms and p99 0.06 ms per tick (`PERF_ASSERT=1`, after this review). Rounding `rewindTicks` would trade up to 0.05 tick of precision for a saving that small, so it was left as is.
- [x] **[Low] L5 `viewTick` as an integer in hundredths.** **Fix:** `PlayerInput.viewTick` is `z.number().int()` in hundredths of a tick (`VIEW_TICK_SCALE` = 100, read with `viewTickOfInput`); the client's `viewTickOf` returns `Math.round(renderTick × 100)`. msgpack input 115 B instead of 119 B (base 101): **+14 B, +280 B/s upload per client**. A fractional value is refused (test).
- Netsim after the fixes (150 ms RTT ± 10 ms one-way, kiting, 5 seeds, rewind off → on):

  | Case | Off | On |
  | --- | --- | --- |
  | 20 Runners, Pistol | 11.4 % | 0.3 % |
  | 20 Runners, Hunting Rifle | 16.3 % | 0.7 % |
  | 20 Runners, SMG | 19.6 % | 1.8 % |
  | 20 Walkers, Pistol | 1.2 % | 1.2 % |
  | 150 Walkers, Pistol | 3.7 % | 0.3 % |
  | 300 ms RTT, 20 Runners | 34.6 % | 8.5 % |
  | 300 ms RTT, 20 Walkers | 8.5 % | 0.0 % |

  These replace the Completion Notes' figures (25.9/3.0, 29.9/2.0, 20.3/2.2, 45.0/17.1 %), which were measured before the 3.5 merge.
- Checks: typecheck, lint, test (1131 passed, 3 skipped), build pass.

### Re-review round 2 (2026-11-22, fresh agent, at 653195f; decisions by the main session)

- [x] **[Med] M-A Seqs were still pickable.** Jumps of 2–20 were accepted on every input: a client picking the lowest-|roll| seq among the next 20 kept only ~6.5 % of the SMG spread. A pre-rotating cheat sending every other seq got no reports, because the watch skips non-consecutive seqs. **Fix:**
  - `RunController.queueInput` accepts only `lastQueuedSeq + 1`. An honest client always sends seq + 1 (reliable WebSocket, NetSimHost +1 per step, a hidden tab drops the accumulator rather than bursting, and the bots also send seq + 1). Any other forward seq is refused (`drops().jumped`).
  - The resync after `INPUT_SEQ_RESYNC_AFTER` = 20 refusals in a row is kept. It is counted (`drops().resyncs`), resets the spread watch's previous sample, and calls `onSeqResync`; `RunRoom` logs `seq_gap_suspect` (info, at most once per wave per player).
  - `MAX_INPUT_SEQ_JUMP` is removed.
  - Skipping seqs now costs a cheat almost all its inputs: of an every-other-seq stream, only one input in about 21 is accepted.
  - Test: seq + 2 refused, then seq + 1 accepted; resync after 20, with one report.
  - Mutation proven: the old 20-seq window fails the test.
- [x] **[Med] M-B Honest bursts.** After a ~2.5 s stall about 50 inputs arrive at once. The 25-token bucket drops the later ones, the next input then looked like a jump, and 20 more were refused: a 1 s freeze and lost swap/consumable edges. **Fix:**
  - `MessageGuard.guard` takes an optional `onRateDrop(client, message)`. `RunRoom.onInputRateDropped` passes the unvalidated message to `RunController.rateDroppedInput`, which reads only `seq`, `swap` and `consumable`.
  - If the dropped input is the next seq, the seq counts as received (no gap) and its edge flags are carried onto the next queued input. Its movement and shot are not applied, as for an overflow drop; the prediction reconciles.
  - Deviation from "the dropOldest rule (swap only without weapon debt)": a rate-dropped input never gets a dry weapon tick. It is newer than the inputs still queued, so a dry tick before the next step would run its weapon ahead of older seqs (a swap could change which weapon they fire). So its swap is always carried.
  - `drops().rate` counts these.
  - Test (MessageGuard + RunController, fake clock): a 2.5 s stall, then a burst of 50 with a swap and a consumable on bucket-dropped seqs. Result: bucket drops > 0, 0 refusals, exactly 1 swap and 1 consumable applied, moving every tick afterwards, acks caught up.
  - Mutations proven: ignoring rate drops (the code before this fix) fails the test; not carrying the swap fails it.
  - `predictionCircle`'s newest-only counter-example now reports the skipped arrivals the same way (`rateDroppedInput`). Its numbers still show the errors it exists to show (62 corrections, max error 0.225 m).
- [x] **[Low] L The spread watch read the weapon before this tick's swap.** **Fix:** `RunController.tick` marks slots that applied a new input and feeds the watch after `step()`, so it reads the weapon after the swap. No dedicated test: one sample per swap could only shift a 40-sample window. Not separately proven.
- Noted: the watch reset on resync survives mutation (a resynced seq is never `prev + 1`, which the watch already requires). It is kept as a defensive reset.
- **Known limits (recorded, not fixed):**
  - A cheat can still hold fire on bad rolls. That costs it fire rate, and the telemetry may not catch it.
  - It can also discard a queued bad-roll seq through a queue overflow (a 7-input burst drops the oldest; a dry tick is given only against weapon debt). The bucket (25/s against 20 ticks) limits that to about 5 seqs per second, and every discarded seq is a shot not fired.
- Checks: typecheck, lint, test (1134 passed, 3 skipped), build pass.

## Change Log

- 2026-11-22: Re-review round 2 fixes (M-A only the next seq, resync telemetry `seq_gap_suspect`; M-B rate-bucket drops keep seqs and edges; L watch after the swap; known limits recorded). Merged claude/epic-2-continue (a8c813e).
- 2026-11-22: Review fixes (M1 spread-cancel telemetry + seq-jump refusal, M2 shared spread helper + client test, M3 control margin + current numbers, L2 memo/lerp/live-row tests, L3 measured, L5 integer view tick). Status → done.

- 2026-11-22: Implemented (zombie history + rewound view, view tick on the input, rewound shots/melee/assist, excess-over-cap advance, mid-tick sweeps, online seq spread, DEV_NO_REWIND, netsim cases, benchmark). Merged claude/epic-2-continue (c1bdd10). Status → review.
- 2026-11-22: Story created (gds-create-story, non-interactive; decisions in Dev Notes).
