# Story 2.7: Server-confirmed hits

Status: ready-for-dev

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

- [ ] **Task 1: Shot advance (shared)** (AC 1)
  - [ ] `PlayerState` gets `shotAdvanceS: number` (default 0; local mode stays 0).
  - [ ] `ProjectileSpawn` and the projectile pool get `advanceM`, set to `projectileSpeedMps × shotAdvanceS` in `tryFire`.
  - [ ] In `updateProjectiles`, a projectile's first step sweeps `min(speed × dt + advanceM, rangeLeftM)`, then `advanceM` is reset to 0. Hits along the whole swept segment count. The swept test already handles long segments (Story 1.5).
  - [ ] Add it to `snapshotWorld`.
  - [ ] Tests:
    - with 75 ms the first sweep is 3 + 4.5 m and hits a Walker at 6 m on tick 1;
    - the range limit still holds (the advance never extends past `rangeM`);
    - 0 changes nothing: every existing firing test still passes untouched.
- [ ] **Task 2: RTT to advance (server)** (AC 1)
  - [ ] `RunController.setRtt(id, rttMs)` (2.4 stores it) now sets `player.shotAdvanceS = min(rttMs / 2, SHOT_ADVANCE_CAP_MS) / 1000`, with `SHOT_ADVANCE_CAP_MS = 150` in `apps/server/src/net/limits.ts`.
  - [ ] Melee (Story 1.9) is resolved instantly against server positions, with no advance: zombies move at most 4 m/s, and the arc reaches over 1 m.
  - [ ] Test: an RTT of 400 is capped at 0.15 s.
- [ ] **Task 3: Shooter on hits (shared)** (AC 3, 4)
  - [ ] `zombie.hit` gets `sourceId: string | null`. `applyZombieDamage` already receives the killer id: pass it through.
  - [ ] Update `netEvents.ts`: the source slot is sent, with 255 meaning none. Round-trip test.
- [ ] **Task 4: Server aim assist** (AC 1)
  - [ ] Already true: `tryFire` calls `assistAim(world, …)` inside the server World when `!input.isMouse` (Story 1.6). Its doc comment says "Story 2.7 runs it on the server with server positions".
  - [ ] Add a `RunController` test: a touch input aimed 5° off a zombie, as the server sees it, produces a hit. The same input with `isMouse: true` misses.
  - [ ] The client never bends the aim it sends.
- [ ] **Task 5: Local fire clock (client)** (AC 2): `apps/client/src/net/localFire.ts`. See Dev Notes › Instant own shots.
- [ ] **Task 6: Cosmetic projectiles (client)** (AC 2, 3): `apps/client/src/net/cosmeticProjectiles.ts`. It writes the mirror world's `projectiles` pool, which `ProjectileView` already draws. See Dev Notes › Cosmetic projectiles.
- [ ] **Task 7: Event routing in NetSimHost** (AC 2, 3). See Dev Notes › Event routing.
- [ ] **Task 8: Reversed-hit counter (client)** (AC 4): `apps/client/src/debug/reversedHits.ts`. See Dev Notes › Reversed hits.
  - [ ] Expose `{ apparentHits, confirmed, reversed }` on `NetSimHost.netStats`.
  - [ ] Add a line to the performance overlay from Story 1.11: `hits 212 · reversed 4 (1.9%)`.
- [ ] **Task 9: Tests**: see Dev Notes › Testing.

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

### Debug Log References

### Completion Notes List

- Ultimate context engine analysis completed - comprehensive developer guide created

### File List
