# Story 2.7: Server-confirmed hits

Status: review

## Story

As a player,
I want shots to look instant on my screen while the server decides what they hit,
so that all of us agree on what happened.

## Acceptance Criteria

1. **Server simulates shots.** When a player fires, the server simulates the projectile or melee arc itself. A projectile spawns at the shooter's position advanced by half the round-trip time, capped at 150 ms. Aim assist is applied on the server, using server zombie positions.
2. **Cosmetic projectiles.** When the server emits `weapon.fired`, other clients draw a cosmetic projectile. The shooter's own muzzle flash, sound and projectile appear instantly, from local input.
3. **Server decides.** Clients play hit flashes, pushback and deaths only from server events. The client never removes a zombie on its own.
4. **Reversed hits.** In development builds, when a local shot looks like a hit but the server reports a miss, a "reversed hit" counter increments. It is shown in the performance overlay (used by Story 2.10).

## Tasks / Subtasks

- [x] **Task 1: Shot advance (shared)** (AC 1)
  - [x] `PlayerState` gets `shotAdvanceS: number` (default 0; local mode stays 0).
  - [x] `ProjectileSpawn` and the projectile pool get `advanceM`, set to `projectileSpeedMps × shotAdvanceS` in `tryFire`.
  - [x] In `updateProjectiles`, a projectile's first step sweeps `min(speed × dt + advanceM, rangeLeftM)`, then `advanceM` is reset to 0. Hits along the whole swept segment count. The swept test already handles long segments (Story 1.5).
  - [x] Add it to `snapshotWorld`.
  - [x] Tests:
    - with 75 ms the first sweep is 3 + 4.5 m and hits a Walker at 6 m on tick 1;
    - the range limit still holds (the advance never extends past `rangeM`);
    - 0 changes nothing: every existing firing test still passes untouched.
- [x] **Task 2: RTT to advance (server)** (AC 1)
  - [x] `RunController.setRtt(id, rttMs)` (2.4 stores it) now sets `player.shotAdvanceS = min(rttMs / 2, SHOT_ADVANCE_CAP_MS) / 1000`, with `SHOT_ADVANCE_CAP_MS = 150` in `apps/server/src/net/limits.ts`.
  - [x] Melee (Story 1.9) is resolved instantly against server positions, with no advance: zombies move at most 4 m/s, and the arc reaches over 1 m.
  - [x] Test: an RTT of 400 is capped at 0.15 s.
- [x] **Task 3: Shooter on hits (shared)** (AC 3, 4)
  - [x] `zombie.hit` gets `sourceId: string | null`. `applyZombieDamage` already receives the killer id: pass it through.
  - [x] Update `netEvents.ts`: the source slot is sent, with 255 meaning none. Round-trip test.
- [x] **Task 4: Server aim assist** (AC 1)
  - [x] Already true: `tryFire` calls `assistAim(world, …)` inside the server World when `!input.isMouse` (Story 1.6). Its doc comment says "Story 2.7 runs it on the server with server positions".
  - [x] Add a `RunController` test: a touch input aimed 5° off a zombie, as the server sees it, produces a hit. The same input with `isMouse: true` misses.
  - [x] The client never bends the aim it sends.
- [x] **Task 5: Local fire clock (client)** (AC 2): `apps/client/src/net/localFire.ts`. See Dev Notes › Instant own shots.
- [x] **Task 6: Cosmetic projectiles (client)** (AC 2, 3): `apps/client/src/net/cosmeticProjectiles.ts`. It writes the mirror world's `projectiles` pool, which `ProjectileView` already draws. See Dev Notes › Cosmetic projectiles.
- [x] **Task 7: Event routing in NetSimHost** (AC 2, 3). See Dev Notes › Event routing.
- [x] **Task 8: Reversed-hit counter (client)** (AC 4): `apps/client/src/debug/reversedHits.ts`. See Dev Notes › Reversed hits.
  - [x] Expose `{ apparentHits, confirmed, reversed }` on `NetSimHost.netStats`.
  - [x] Add a line to the performance overlay from Story 1.11: `hits 212 · reversed 4 (1.9%)`.
- [x] **Task 9: Tests**: see Dev Notes › Testing.

## Dev Notes

### Scope and prerequisites

- Builds on 2.4:
  - `RunController.setRtt`, from the `net.pinged`/`net.pong` RTT;
  - `netEvents` tuples, with zombie **net ids**;
  - the event queue delivered at the render tick.
- Builds on 2.5 (horde in the mirror pool) and 2.6 (predictor: own position and facing).
- Read `combat/firing.ts` (exact cooldown rule: `cooldownS += 1/rateHz`; a running cooldown may end the tick slightly below 0, down to −dt), `combat/projectilePool.ts`, `combat/aimAssist.ts`, `math/sweep.ts`, `render/FxView.ts`, `render/ProjectileView.ts`, and Story 1.9's melee code and events.
- Out of scope:
  - rewinding zombie positions for hit tests: that is the architecture's upgrade path, and only if Story 2.10 measures ≥ 1 in 20 reversed;
  - friendly fire (5.4);
  - lobbed grenades (5.5).

### Instant own shots

The client does not run combat in prediction (2.6 predicts only movement). It runs a small **local fire clock** instead, once per 50 ms step, right after `predictor.applyLocal(input)`:

- It mirrors the shared rule exactly:
  - The weapon is ready when `cooldownS ≤ COOLDOWN_EPS_S`, and a shot adds `1 / rateHz`.
  - A running cooldown can end the tick slightly negative, down to −dt.
  - A tick without a shot clamps it back to ≥ 0.

  Copy the rule from `firing.ts` into the clock, with a comment pointing back. Better: extract a pure `advanceCooldown(cooldownS, dtS, firedThisTick)` into shared `combat/cooldown.ts` and use it in both places.
- **Gates**, from the latest snapshot of my player (2.4 schema):
  - not swapping (`swapTicks == 0`);
  - not reloading (`reloadTicks{active} == 0`);
  - status alive;
  - `fire && |aim| > 0`;
  - predicted ammo > 0.
- **Predicted ammo** = the server's `ammo{active}` from the latest snapshot, minus the local shots fired with `seq > ackSeq`. Keep a ring of `(seq, shots)`. This is exact unless the server and the client disagree on cooldown phase. At worst one extra cosmetic shot at the end of a magazine: accepted.
- On a local shot:
  1. Emit a local `weapon.fired` (playerId = local, muzzle = predicted position + facing × (radius + 0.1)) into an **immediate** event list that `drainEvents` returns first. FxView then plays the muzzle flash and sound at once.
  2. Spawn a cosmetic projectile in that direction.
- The direction is the predicted facing. For touch aim, bend it with `assistAim(mirrorWorld, …)` on the mirror's interpolated zombies, so my bullet bends toward what I see. The server bends toward what it sees.
- `assistAim` needs a current grid: `rebuildGrid(mirror.zombieGrid, …)` at most once per frame, and only when a shot happens.
- Melee (1.9): the local fire clock plays the swing effect at once, through the same event type 1.9 emits. Hits and kills still come only from the server.

### Cosmetic projectiles

- They live in the mirror's `ProjectilePool`. Use `spawnProjectile`/`freeProjectile` from shared.
- Each frame, move them by `speed × frameDtS` (frame time, not ticks: they are visual only) and set `prevX = x`, so `ProjectileView`'s lerp is a no-op.
- Free a projectile at its range, outside the map, or when its segment crosses a **mirror** zombie (`segmentCircleT`). It stops visually after `pierce` zombies.
- **They never damage, flash or push anything.** Only the server's `zombie.hit` does (AC 3).
- **Remote players' shots** come from the server's `weapon.fired`, delivered at the render tick so they line up with the interpolated shooter. Spawn them from the event's muzzle and direction.
- **My own** server `weapon.fired` is **dropped**: the local one already played. My own server `weapon.reload_started`, `weapon.reloaded`, `weapon.swap_started` and `weapon.swapped` are delivered **on arrival**, not at the render tick, so my reload sound isn't 150 ms late.

### Event routing (NetSimHost.drainEvents)

1. Immediate local cosmetic events (own shots and swings).
2. Server events on arrival, for my own weapon state (above).
3. Every other server event once its tick ≤ render tick (2.4 queue): `zombie.hit` (flash, from FxView), `zombie.killed` (death; it also calls `hordeBuffer.markDead` from 2.5), `player.damaged`, waves, remote shots.

Pushback needs no event: the zombie's streamed position already includes it.

### Reversed hits

- Only my own cosmetic projectiles take part.
- When one first crosses a mirror zombie with net id N, record an expectation `{ netId: N, deadlineMs: now + rttMs + delayMs + 300 }` in a ring of 64, and count `apparentHits++`.
- On arrival (not at the render tick), a server `zombie.hit` or `zombie.killed` with `sourceId === me` and the same net id confirms the oldest matching expectation (`confirmed++`).
- An expectation past its deadline counts `reversed++`.
- Server hits I didn't see coming don't count either way.
- **Builds:** compiled and active in dev builds (AC). Also active in release builds while the performance overlay is on (`?debug=1`). It is a measurement, not a cheat, and Story 2.10 measures on real phones with the published build. Record this clarification in the Completion Notes.
- The net id is the full `slot | generation << 8`, read from the decoded tuple (2.4 keeps it), so a hit on a new zombie in a reused slot never confirms an old expectation.

### Testing

- **Shared:** shot advance (Task 1), `cooldown.ts` (3/s gives 30 shots in 10 s; 12/s gives 12 in 1 s; idle never saves a burst), `zombie.hit.sourceId`.
- **RunController:** RTT cap; server aim assist on touch versus mouse.
- **`localFire.test.ts`:**
  - the cadence matches shared exactly over 200 steps, for the Pistol, the SMG and the Hunting Rifle;
  - predicted ammo stops shots at 0;
  - reload and swap gates;
  - a snapshot with a later ack restores the ammo correctly.
- **`cosmeticProjectiles.test.ts`:** stops at the first mirror zombie for pierce 1 and after 5 for the Hunting Rifle; freed at range; never changes mirror zombie HP or position.
- **`reversedHits.test.ts`:** confirm, expire → reversed, an unrelated zombie is ignored, a generation mismatch is not confirmed.
- **Recommended harness** `tools/netsim/hits.test.ts`:
  - `RunController` with 20 Walkers walking toward a player;
  - the client model shoots at the nearest interpolated zombie, with a 150 ms RTT and 20 ms jitter;
  - count reversed / apparent.
  - Expect below 5 % with Walkers. Print the number and add it to the Completion Notes; it is an early read on NFR5 before Story 2.10.
- **Manual:** two tabs, one with `?lag=150&jitter=20&debug=1`. Own shots are instant; the other tab sees them; deaths match on both; the counter stays low.

### Project Structure Notes

- New:
  - `packages/shared/src/combat/cooldown.ts` + test
  - `apps/client/src/net/{localFire.ts, cosmeticProjectiles.ts}` + tests
  - `apps/client/src/debug/reversedHits.ts` + test
  - `tools/netsim/hits.test.ts`
- Modified:
  - `packages/shared/src/{player/player.ts, combat/firing.ts, combat/projectilePool.ts, combat/damage.ts, core/simEvents.ts, core/worldSnapshot.ts, net/netEvents.ts}`
  - `apps/server/src/{run/RunController.ts, net/limits.ts}`
  - `apps/client/src/{sim/NetSimHost.ts, render/FxView.ts (local vs remote sound), debug/PerfOverlay.ts}`

### References

- [Source: epics.md#Story 2.7: Server-confirmed hits]
- [Source: game-architecture.md#Decision Summary] (hit validation: half RTT, cap 150 ms, no rewind in v1), [#Networking] (cosmetic projectiles from `weapon.fired`; 300 ms history upgrade path), [#Consistency Rules] (the client never decides outcomes)
- [Source: gdd.md#Multiplayer Considerations] (fairness and feel; < 1 in 20 reversed), NFR5
- Epic 1 lessons: exact cooldown rule (1.5 review), skip same-tick corpses (1.5 review), assist only when the raw aim misses (1.6 review)

## Dev Agent Record

### Agent Model Used

Claude Opus 5.5 (claude-opus-5-5), builder agent in worktree `story-2-7`.

### Debug Log References

- `npx vitest run tools/netsim/hits.test.ts --silent=false` prints one `[netsim hits]` line per case (numbers below).

### Completion Notes List

- **Shot advance (AC 1).** `PlayerState.shotAdvanceS` (0 offline), `ProjectileSpawn.advanceM` / pool `advanceM`, set to `projectileSpeedMps × shotAdvanceS` in `tryFire`; the first sweep is `min(speed × dt + advanceM, rangeLeftM)`, then `advanceM = 0`. In `snapshotWorld` (players get it through the spread). `RunController.setRtt` sets `min(rtt / 2, SHOT_ADVANCE_CAP_MS = 150) / 1000` (`apps/server/src/net/limits.ts`). Melee unchanged (instant on server positions, no advance). Tests: 75 ms → 3 + 4.5 m first sweep hits a Walker 6 m out on tick 1 (and not without advance); advance only on the first step; range still holds (also an advance larger than the range); RTT 400 → 0.15 s; every existing firing test untouched and green.
- **Cooldown rule (shared).** `combat/cooldown.ts`: `cooldownTickStart` / `cooldownReady` / `cooldownTickEnd` / `cooldownIdle` (+ `COOLDOWN_EPS_S`). Small deviation from the suggested single `advanceCooldown(c, dt, fired)`: the ready check sits between the count-down and the `+= 1/rateHz`, so the rule is split into its start and end; `firing.ts` and the client's fire clock call the very same functions (bit-identical arithmetic; determinism tests unchanged). `tryFire` no longer adds the cooldown itself; `updatePlayerWeapon` does.
- **Hit source.** `zombie.hit.sourceId` (= the killer id `applyZombieDamage` already gets). Wire: appended as tuple index 7 (player slot, 255 = none); a tuple without it decodes to `null`.
- **Server aim assist (Task 4).** Already server-side; new `RunController` test: touch aim 5° off a Walker 8 m out hits (Hunting Rifle, no spread), the same aim with `isMouse` misses. The client sends the raw aim.
- **Local fire clock (AC 2)** `net/localFire.ts`. Per sent input: shared cooldown rule per slot; gates alive / fire+aim / not swapping / not reloading / predicted ammo > 0. **Deviation (found by the harness):** gating on the stale snapshot's `reloadTicks` alone put every shot after a reload one RTT behind the server's (different seq → different aim → the rifle harness showed 30–65 % reversed). Swap and reload are therefore timed by seq: a snapshot with `ackSeq` A and `swapTicks`/`reloadTicks` k ends on seq A + k; before the snapshot knows, my own swap tap on seq S ends on S + N, and my magazine-emptying shot on S starts a reload ending on S + R; after a predicted reload end, ammo = magazine − my shots since. Test: the clock fires on exactly the server's steps over 200–300 steps for Pistol, SMG, Hunting Rifle, Machete, with the trigger pulsed and swaps, **also with a snapshot 6–8 steps (300–400 ms) old**.
- **Instant own shots / swings.** `NetSimHost` calls the clock right after `predictor.applyLocal`. A local `weapon.fired` (muzzle = predicted position + aim × (radius + 0.1), the position the server fires from for that input) or `melee.swung` goes into the immediate list that `drainEvents` hands out first (8 preallocated objects of each, reused). Touch aim is bent with `assistAim` on the mirror's drawn zombies (grid rebuilt at most once per horde sample, shared with the cosmetic sweep); spread is rolled with a client-only rng (it never matches the server's roll). The horde is now sampled before the input steps in `update`, so my shot sees what is drawn this frame.
- **Cosmetic projectiles (AC 2, 3)** `net/cosmeticProjectiles.ts` in the mirror's projectile pool: frame-time movement, `prevX = x`, freed at range / outside the map / after `pierce` mirror zombies; never touch HP or position (tested). Remote shots spawn from the server `weapon.fired` when it drains at the render tick.
- **Event routing (Task 7).** 1 immediate local events; 2 my own `weapon.reload_started` / `weapon.reloaded` / `weapon.swap_started` / `weapon.swapped` on arrival; 3 everything else at the render tick. My own server `weapon.fired` **and `melee.swung`** are dropped. Hits, pushback, deaths only from server events (`zombie.killed` still calls `horde.killAt`).
- **Reversed hits (AC 4)** `debug/reversedHits.ts`: rings of 64, full net id. Additions beyond the Dev Notes, both found in the harness: (a) a server hit that arrives *before* my bullet reaches the drawn zombie (100–150 ms behind) is kept for its own window and confirms the later apparent hit; (b) `zombie.killed` (any killer) marks the net id dead: a later apparent hit on the still-drawn body isn't tracked and pending ones are dropped, and confirmation uses `zombie.hit` only (a killing shot sends both; counting both would confirm twice). `NetSimHost.netStats` has `apparentHits`, `confirmed`, `reversed`; the perf overlay shows `hits 212 · reversed 4 (1.9%)` online (`perf.hits`).
- **Builds (clarification):** the counter is compiled into every build; it runs when `import.meta.env.DEV || perf.overlayOn` (GameScene passes it as `measureHits`), i.e. in dev builds and in the release build while `?debug=1` / the overlay is on. It is a measurement, not a cheat, and Story 2.10 measures with the published build on real phones.
- **Harness** `tools/netsim/hits.test.ts` + `hitsSim.ts` (real `RunController`, `Predictor`, `LocalFireClock`, `CosmeticProjectiles`, `assistAim` on a mirror, `ReversedHits`, `ServerClock`, `AdaptiveDelay`, `mirrorZombies`; 20 Walkers, touch aim at the nearest drawn zombie, 30 s):
  - standing player, 150 ms RTT ± 10 ms one-way (20 ms jitter), Pistol seeds 1–3: **0 / 77, 0 / 76, 0 / 77 reversed (0.0 %)**; Hunting Rifle 0 / 40; SMG 0 / 217 (asserted < 5 %);
  - kiting (walking a 10 m circle at full speed): 150 ms RTT **2 / 69 (2.9 %)**, 300 ms RTT ± 20 ms **5 / 63 (7.9 %)** (asserted < 15 %). Wider sweep while building (seeds 1–3): kiting Pistol 0–9 % at 150 ms and 4–14 % at 300 ms, SMG 4–9 % (independent spread rolls). So with Walkers the standing case is far under NFR5; a fast-moving shooter at high ping is around the 1-in-20 line, which is what Story 2.10 should measure on phones (the 300 ms rewind is the architecture's upgrade path).
- **Browser check** (Playwright + Chromium, server :3067, Vite :5573 via a temporary config, now removed; two contexts 844×390, waves on; headless runs at ~14 fps): Ana creates, Bo joins by code, Ready, Start.
  - No throttle: mousedown → own `weapon.fired` FX in **30–56 ms** (≤ one 50 ms input step + one frame), RTT 44 ms. With `?lag=150&jitter=20` on Ana (measured RTT 261 ms): **47–108 ms**, i.e. not waiting for the round trip.
  - Kills: identical lists (count and positions) on both pages in both runs (4 and 5 kills); Bo's page drew Ana's shots from the server (10 of Ana's 12 local shots by the time both had died); overlay counts on Ana: 8 / 8 confirmed (no lag), 11 apparent, 10 confirmed, 1 reversed (lag). No page errors.
  - **Not verified:** a long fight (both survivors died to wave 1 within ~30 s; I did not change balance for the check), the overlay text by eye, sound timing by ear, real phones / 60 fps, the reload sound arriving on time under lag (covered by a unit test).
- Tests: 619 passed, 3 skipped (`npm test`) + 3 release-cheat checks with `REQUIRE_DIST=1`; typecheck, lint, build pass.
- FxView needed no change: it already plays shot / swing / reload sounds only for `host.localPlayerId`, and the local events carry that id.

### File List

- New: `packages/shared/src/combat/cooldown.ts`, `packages/shared/src/combat/cooldown.test.ts`, `packages/shared/src/combat/shotAdvance.test.ts`, `apps/client/src/net/localFire.ts`, `apps/client/src/net/localFire.test.ts`, `apps/client/src/net/cosmeticProjectiles.ts`, `apps/client/src/net/cosmeticProjectiles.test.ts`, `apps/client/src/debug/reversedHits.ts`, `apps/client/src/debug/reversedHits.test.ts`, `tools/netsim/hits.test.ts`, `tools/netsim/hitsSim.ts`
- Modified: `packages/shared/src/{player/player.ts, combat/firing.ts, combat/projectilePool.ts, combat/projectilePool.test.ts, combat/damage.ts, core/simEvents.ts, core/worldSnapshot.ts, net/netEvents.ts, net/netEvents.test.ts, index.ts}`, `apps/server/src/{run/RunController.ts, run/RunController.test.ts, net/limits.ts}`, `apps/client/src/{sim/NetSimHost.ts, sim/NetSimHost.test.ts, debug/PerfOverlay.ts, debug/perfStats.ts, scenes/GameScene.ts}`, `_bmad-output/implementation-artifacts/sprint-status.yaml`
- Not changed: `apps/client/src/render/FxView.ts` (see notes)

## Senior Developer Review (AI)

- **Date:** 2026-11-22 · **Reviewer:** independent review agent (fresh context) · **Outcome:** 2 medium, 3 low findings, 1 nit; all fixed on `story-2-7` after merging `claude/epic-2-continue` (99ff634: 2.5/2.6 review fixes + Story 2.8).
- [x] **[Med] MED-1 A second swap tap soon after the first was dropped by the fire clock** (`net/localFire.ts`): a tap only counted when the ≈RTT-old snapshot showed `swapTicks === 0`, so a tap right after the first swap ended on the server was ignored locally but applied by the server (phantom shots, then one seq off). **Fix:** the clock keeps my unacknowledged swap taps (ring of 8) and replays them with the server's rule from the snapshot (`ackSeq + swapTicks`): a tap swaps unless it lands during a swap or on the seq one ends; the active slot flips once per predicted swap (`swapState`). Tests: lagged snapshot (6 steps) with a second tap 4–10 steps after the first; taps every 9 steps with an 8-step-old snapshot: local shots = server shots exactly.
- [x] **[Med] MED-2 Server starvation / backlog drain broke "one weapon tick per seq"** (`RunController.ts`, `NetSimHost.ts`): a starved tick kept `fire` and fired unseen shots; a skipped input never got its weapon tick, so the client stayed out of phase. **Fix (server weapon timing now depends only on the seqs the client sent):**
  - starved tick: `PlayerState.weaponsPaused` (set by `RunController` each tick; shared `updateCombat` skips that player's weapon) – no fire, cooldowns/reload/swap frozen, exactly as the clock sees no step. Movement keeps the 2.4 rule (hold still);
  - skipped input (overflow or drain): the copy gets a **dry** weapon tick before the next step (`skippedInputWeaponTick`): it runs the same weapon code with that input (cooldown, reload, swap tap at its own seq, a shot spends its round and cooldown) but spawns no projectile, emits no `weapon.fired`, and a swing hits nothing. Chosen over "timers only, no fire" because only this makes the cooldown phase and ammo provably the same as the client's clock, which already fired a cosmetic shot on that seq (that shot simply did nothing; it can count as reversed, which is honest). The swap flag is no longer carried to the next input (its own seq handles it); consumables still are;
  - safety net: an own server `weapon.fired` beyond every shot the clock made is drawn (queued to the render tick like others' shots);
  - World stays deterministic and allocation-free (preallocated skipped-input copies, a module flag for the dry tick).
  - Tests: RunController: starved ticks never fire, a swap finishes only as seqs arrive, dropped inputs give the same weapon events as applying them, a dropped firing input spends a round with nothing flying; NetSimHost: unpredicted own shot drawn; harness stall → burst → drain (400 ms stall; 3 overflow + 4 drain skips): **server-only shot seqs 0** for SMG and Pistol, local-only shots only on skipped seqs (SMG 2, Pistol 1), none after the drain.
- [x] **[Low] LOW-1 Early server hits were kept for the whole expectation window** (`debug/reversedHits.ts`), so one shot's hit could confirm another's. **Fix:** early hits wait only one-way + render delay + `EARLY_HIT_SLACK_MS` (50); melee hits are not passed in (no cosmetic bullet). Cross-shot test added.
- [x] **[Low] LOW-2 Turning the counter back on counted stale expectations as reversed.** **Fix:** `NetSimHost` calls `hits.reset()` when `measureHits()` goes from off to on; test added.
- [x] **[Low] LOW-3 `predictedAmmo` was unused outside tests.** **Fix:** wired into the local player's HUD ammo and reload bar online (`NetSimHost.predictAmmo`, new `predictedReloadTicks`); while a reload runs the ammo shows the snapshot's count. Test: ammo drops to 11 on the local shot, before any ack.
- [x] **[Nit] Duplicate `MUZZLE_OFFSET_M`.** Now one shared constant in `config/constants.ts`, used by `firing.ts`, `NetSimHost` and the harness.
- [x] **[Low] LOW-4 (noted, not fixed):** seq-timed swap/reload ends assume one server tick per seq between the snapshot and the end; with the fix above this holds for starvation and skips, and any remaining mismatch (e.g. a reload cancelled by swapping away and back) corrects itself with the next snapshot.
- **Info:** a client can inflate its RTT by delaying pongs to get a longer shot advance; it is bounded by the 150 ms cap (`SHOT_ADVANCE_CAP_MS`).
- Merge fallout fixed on the way: `devThrottle.ts` field lists gained 2.8's `downedTicksLeft`, `reviveProgress`, `kills`, `resultWave` (typecheck failed on 99ff634 without them); `prediction.test.ts` / `localFire.test.ts` use `"out"`/`"downed"` instead of the removed `"dead"`.
- Harness after the fixes (seed 1 unless noted): standing 150 ms RTT Pistol seeds 1–3 0 %, Hunting Rifle 0/45, SMG 1/218 (0.5 %); kiting 150 ms 1/71 (1.4 %), 300 ms 5/63 (7.9 %); stall case SMG 5/136, Pistol 0/51.
- Checks: typecheck, lint, build pass; `npm test` 675 passed, 3 skipped (two earlier full runs each had one different timing test fail while the machine's load average was ~8 from parallel worktrees; both passed alone and the next full run was green).

## Change Log

- 2026-11-22: Review findings fixed (MED-1 swap taps replayed, MED-2 starved ticks pause the weapon + dry weapon tick for skipped inputs + unpredicted-shot safety net, LOW-1 early-hit window, LOW-2 reset on re-enable, LOW-3 predicted HUD ammo, shared MUZZLE_OFFSET_M). Merged claude/epic-2-continue (Story 2.8).

- 2026-11-22: Story 2.7 implemented (shot advance, shared cooldown rule, hit source on the wire, local fire clock with seq-timed swap/reload, cosmetic projectiles, event routing, reversed-hit counter + overlay line, netsim hits harness). Status → review.
